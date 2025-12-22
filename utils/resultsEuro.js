const extractJsonFromPDFEuro = require("./extractJsonFromPDFEuro");
const sanitizeAIResponseEuro = require("./sanitizeAIResponseEuro");
const tryFixJson = require("./tryFixJson");
const normalizePdfText = require("./normalizePdfText");

const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const PDFParser = require("pdf2json");

/**
 * Parse PDF using pdf2json (fallback parser)
 * More robust for PDFs that fail with pdf-parse
 */
function parsePDFWithPdf2json(filePath) {
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser();

        pdfParser.on("pdfParser_dataReady", (pdfData) => {
            try {
                // Extract text from all pages
                let text = '';
                if (pdfData.Pages) {
                    for (const page of pdfData.Pages) {
                        if (page.Texts) {
                            for (const textItem of page.Texts) {
                                if (textItem.R) {
                                    for (const run of textItem.R) {
                                        if (run.T) {
                                            // Decode URI encoded text
                                            text += decodeURIComponent(run.T) + ' ';
                                        }
                                    }
                                }
                            }
                            text += '\n';
                        }
                    }
                }
                resolve({ text: text.trim() });
            } catch (err) {
                reject(err);
            }
        });

        pdfParser.on("pdfParser_dataError", (errData) => {
            reject(new Error(errData.parserError || 'PDF parsing failed'));
        });

        pdfParser.loadPDF(filePath);
    });
}

/**
 * Custom render function for pdf-parse to handle problematic PDFs
 * that throw "Invalid number" errors
 */
function customRender(pageData) {
    let renderOptions = {
        normalizeWhitespace: true,
        disableCombineTextItems: false
    };

    return pageData.getTextContent(renderOptions)
        .then(function (textContent) {
            let lastY, text = '';
            for (let item of textContent.items) {
                if (lastY == item.transform[5] || !lastY) {
                    text += item.str;
                } else {
                    text += '\n' + item.str;
                }
                lastY = item.transform[5];
            }
            return text;
        });
}

/**
 * Process PDF files for Euro invoice format.
 * Returns an array of extracted rows with 8 columns:
 * date, client, order_no, material, quantity, material_cost, extra_fee, total_cost
 */
const resultsFuncEuro = async (req) => {
    console.log("[resultsEuro.js] Entered 'resultsFuncEuro'.");
    return await Promise.all(
        req.files.map(async (file) => {
            console.log(`[resultsEuro.js] Processing file: ${file.originalname}`);
            try {
                console.log(`[resultsEuro.js] Reading file: ${file.path}`);
                const pdfBuffer = fs.readFileSync(file.path);
                console.log(`[resultsEuro.js] Parsing PDF for: ${file.originalname}`);

                // Try multiple PDF parsing methods
                let pdfData;
                let parsingMethod = '';

                // Method 1: Try pdf-parse with custom render
                try {
                    pdfData = await pdfParse(pdfBuffer, { pagerender: customRender });
                    parsingMethod = 'pdf-parse (custom render)';
                    console.log(`[resultsEuro.js] PDF parsed successfully with ${parsingMethod}`);
                } catch (error1) {
                    console.warn(`[resultsEuro.js] Method 1 failed: ${error1.message}`);

                    // Method 2: Try pdf-parse with default options
                    try {
                        pdfData = await pdfParse(pdfBuffer);
                        parsingMethod = 'pdf-parse (default)';
                        console.log(`[resultsEuro.js] PDF parsed successfully with ${parsingMethod}`);
                    } catch (error2) {
                        console.warn(`[resultsEuro.js] Method 2 failed: ${error2.message}`);

                        // Method 3: Try pdf2json as fallback
                        try {
                            console.log(`[resultsEuro.js] Trying pdf2json fallback...`);
                            pdfData = await parsePDFWithPdf2json(file.path);
                            parsingMethod = 'pdf2json';
                            console.log(`[resultsEuro.js] PDF parsed successfully with ${parsingMethod}`);
                        } catch (error3) {
                            console.error(`[resultsEuro.js] All PDF parsing methods failed`);
                            throw new Error(`PDF parsing failed with all methods. Last error: ${error3.message}`);
                        }
                    }
                }

                if (!pdfData.text || pdfData.text.trim().length === 0) {
                    throw new Error("No text content extracted from PDF");
                }

                console.log(`[resultsEuro.js] Normalizing text for: ${file.originalname}`);
                const normalizedText = normalizePdfText(pdfData.text);
                console.log(`[resultsEuro.js] Extracted text preview: ${normalizedText.substring(0, 200)}...`);
                console.log(`[resultsEuro.js] Calling AI to extract JSON for: ${file.originalname}`);

                let rawJson = await extractJsonFromPDFEuro(normalizedText);
                rawJson = sanitizeAIResponseEuro(rawJson);

                let parsed;
                try {
                    parsed = JSON.parse(rawJson);
                } catch (e) {
                    console.warn("JSON repair triggered for:", file.originalname);
                    parsed = JSON.parse(tryFixJson(rawJson));
                }

                // Validate the parsed result is an array
                if (!Array.isArray(parsed)) {
                    throw new Error("Expected JSON array from extraction");
                }

                // Validate and normalize each row
                const validRows = [];
                for (const row of parsed) {
                    // Support both old and new field names for backward compatibility
                    const client = row.client || row.party;
                    const order_no = row.order_no || row.reference;
                    const material_cost = row.material_cost || row.amount;

                    // Check all required fields exist
                    if (!row.date || !client || !order_no || !row.material || row.quantity === undefined || !material_cost) {
                        console.warn("Skipping row with missing fields:", row);
                        continue;
                    }

                    // Parse and normalize cost values
                    const parseCost = (val) => {
                        if (!val || val === '') return '€ 0';
                        const str = String(val).trim();
                        if (str.toUpperCase() === 'FOC') return 'FOC';
                        // Extract numeric value
                        const num = parseInt(str.replace(/[^\d]/g, ''), 10);
                        return isNaN(num) ? '€ 0' : `€ ${num}`;
                    };

                    // Get numeric value from cost string
                    const getCostValue = (costStr) => {
                        if (!costStr || costStr.toUpperCase() === 'FOC') return 0;
                        const num = parseInt(String(costStr).replace(/[^\d]/g, ''), 10);
                        return isNaN(num) ? 0 : num;
                    };

                    // Parse material_cost
                    let normalizedMaterialCost = String(material_cost).trim();
                    if (normalizedMaterialCost.toUpperCase() !== 'FOC') {
                        if (!normalizedMaterialCost.includes('€')) {
                            const numericAmount = normalizedMaterialCost.replace(/[^\d]/g, '');
                            if (numericAmount) {
                                normalizedMaterialCost = `€ ${numericAmount}`;
                            }
                        }
                        // Ensure € has space after it
                        if (normalizedMaterialCost.includes('€') && !normalizedMaterialCost.includes('€ ')) {
                            normalizedMaterialCost = normalizedMaterialCost.replace('€', '€ ');
                        }
                    }

                    // Parse extra_fee - default to "€ 0" if not present
                    let normalizedExtraFee = row.extra_fee ? String(row.extra_fee).trim() : '€ 0';
                    if (!normalizedExtraFee || normalizedExtraFee === '') {
                        normalizedExtraFee = '€ 0';
                    } else if (!normalizedExtraFee.includes('€')) {
                        const numericFee = normalizedExtraFee.replace(/[^\d]/g, '');
                        normalizedExtraFee = numericFee ? `€ ${numericFee}` : '€ 0';
                    }
                    // Ensure € has space after it
                    if (normalizedExtraFee.includes('€') && !normalizedExtraFee.includes('€ ')) {
                        normalizedExtraFee = normalizedExtraFee.replace('€', '€ ');
                    }

                    // Calculate or parse total_cost
                    let normalizedTotalCost;
                    if (row.total_cost) {
                        normalizedTotalCost = String(row.total_cost).trim();
                        if (normalizedTotalCost.toUpperCase() !== 'FOC') {
                            if (!normalizedTotalCost.includes('€')) {
                                const numericTotal = normalizedTotalCost.replace(/[^\d]/g, '');
                                if (numericTotal) {
                                    normalizedTotalCost = `€ ${numericTotal}`;
                                }
                            }
                            // Ensure € has space after it
                            if (normalizedTotalCost.includes('€') && !normalizedTotalCost.includes('€ ')) {
                                normalizedTotalCost = normalizedTotalCost.replace('€', '€ ');
                            }
                        }
                    } else {
                        // Calculate total_cost = material_cost + extra_fee
                        if (normalizedMaterialCost.toUpperCase() === 'FOC') {
                            normalizedTotalCost = 'FOC';
                        } else {
                            const materialValue = getCostValue(normalizedMaterialCost);
                            const extraValue = getCostValue(normalizedExtraFee);
                            normalizedTotalCost = `€ ${materialValue + extraValue}`;
                        }
                    }

                    // Build normalized row with new 8-column schema
                    const normalizedRow = {
                        date: String(row.date).trim(),
                        client: String(client).trim(),
                        order_no: String(order_no).trim(),
                        material: String(row.material).trim(),
                        quantity: typeof row.quantity === 'number' ? row.quantity : parseInt(String(row.quantity).trim(), 10),
                        material_cost: normalizedMaterialCost,
                        extra_fee: normalizedExtraFee,
                        total_cost: normalizedTotalCost
                    };

                    // Ensure order_no contains hyphen (critical requirement)
                    if (!normalizedRow.order_no.includes('-')) {
                        console.warn("Order number missing hyphen, attempting to fix:", normalizedRow.order_no);
                        // Try to insert hyphen if it looks like a valid order_no without hyphen
                        const refMatch = normalizedRow.order_no.match(/^(\d{2})(\d{3})$/);
                        if (refMatch) {
                            normalizedRow.order_no = `${refMatch[1]}-${refMatch[2]}`;
                        }
                    }

                    validRows.push(normalizedRow);
                }

                if (validRows.length === 0) {
                    throw new Error("No valid rows extracted from PDF");
                }

                console.log(`✅ Successfully extracted ${validRows.length} rows from ${file.originalname}`);
                return validRows;

            } catch (err) {
                console.error(`Error processing ${file.originalname}:`, err.message);
                return {
                    file: file.originalname,
                    success: false,
                    error: err.message,
                };
            } finally {
                if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
            }
        })
    );
};

module.exports = resultsFuncEuro;
