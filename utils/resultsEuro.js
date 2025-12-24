const extractJsonFromPDFEuro = require("./extractJsonFromPDFEuro");
const sanitizeAIResponseEuro = require("./sanitizeAIResponseEuro");
const tryFixJson = require("./tryFixJson");
const normalizePdfText = require("./normalizePdfText");
const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const PDFParser = require("pdf2json");

/**
 * Fallback parser using pdf2json
 */
function parsePDFWithPdf2json(filePath) {
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser();
        pdfParser.on("pdfParser_dataReady", (pdfData) => {
            try {
                let text = '';
                if (pdfData.Pages) {
                    for (const page of pdfData.Pages) {
                        if (page.Texts) {
                            for (const textItem of page.Texts) {
                                if (textItem.R) {
                                    for (const run of textItem.R) {
                                        if (run.T) text += decodeURIComponent(run.T) + ' ';
                                    }
                                }
                            }
                            text += '\n';
                        }
                    }
                }
                resolve({ text: text.trim() });
            } catch (err) { reject(err); }
        });
        pdfParser.on("pdfParser_dataError", (errData) => {
            reject(new Error(errData.parserError || 'PDF parsing failed'));
        });
        pdfParser.loadPDF(filePath);
    });
}

/**
 * Custom renderer for pdf-parse
 */
function customRender(pageData) {
    let renderOptions = { normalizeWhitespace: true, disableCombineTextItems: false };
    return pageData.getTextContent(renderOptions).then(function (textContent) {
        let lastY, text = '';
        for (let item of textContent.items) {
            if (lastY == item.transform[5] || !lastY) { text += item.str; }
            else { text += '\n' + item.str; }
            lastY = item.transform[5];
        }
        return text;
    });
}

/**
 * Process PDF files for Euro format.
 * ABSOLUTE BUSINESS RULE: ONE PDF MUST PRODUCE EXACTLY ONE ROW IN EXCEL.
 */
const resultsFuncEuro = async (req) => {
    console.log("[resultsEuro.js] Entered 'resultsFuncEuro'.");
    return await Promise.all(
        req.files.map(async (file) => {
            console.log(`[resultsEuro.js] Processing file: ${file.originalname}`);
            try {
                const pdfBuffer = fs.readFileSync(file.path);
                let pdfData;

                // Multi-method parsing strategy
                try {
                    pdfData = await pdfParse(pdfBuffer, { pagerender: customRender });
                } catch (e1) {
                    try {
                        pdfData = await pdfParse(pdfBuffer);
                    } catch (e2) {
                        pdfData = await parsePDFWithPdf2json(file.path);
                    }
                }

                if (!pdfData.text || pdfData.text.trim().length === 0) {
                    throw new Error("No text content extracted from PDF");
                }

                const normalizedText = normalizePdfText(pdfData.text);
                let rawJson = await extractJsonFromPDFEuro(normalizedText);
                rawJson = sanitizeAIResponseEuro(rawJson);

                let parsed;
                try {
                    parsed = JSON.parse(rawJson);
                } catch (e) {
                    parsed = JSON.parse(tryFixJson(rawJson));
                }

                // Handle if GPT unexpectedly returns an array - we ONLY want the first item/row
                const data = Array.isArray(parsed) ? parsed[0] : parsed;

                if (!data || typeof data !== 'object') {
                    throw new Error("Invalid data format extracted from PDF");
                }

                // m³ NORMALIZATION RULE: replace "," with "." and ensure numeric context where needed
                let normalizedM3 = "0";
                if (data.m3) {
                    normalizedM3 = String(data.m3).replace(',', '.');
                }

                // Cost normalization helper
                const normalizeCurrency = (val, defaultVal = "€ 0") => {
                    if (!val) return defaultVal;
                    let str = String(val).trim();
                    if (str.toUpperCase() === 'FOC') return 'FOC';
                    if (!str.includes('€')) {
                        const num = str.replace(/[^\d]/g, '');
                        return num ? `€ ${num}` : defaultVal;
                    }
                    if (str.includes('€') && !str.includes('€ ')) {
                        str = str.replace('€', '€ ');
                    }
                    return str;
                };

                // Build the SINGLE STRICT 10-COLUMN ROW
                const finalRow = {
                    date: String(data.date || "").trim(),
                    client: String(data.client || data.party || "").trim(),
                    order_no: String(data.order_no || data.reference || "").trim(),
                    material: String(data.material || "").trim(),
                    delivery: data.delivery ? String(data.delivery).trim() : null,
                    kgs: typeof data.kgs === 'number' ? data.kgs : parseInt(String(data.kgs || 0).replace(/[^\d]/g, ''), 10),
                    "m³": normalizedM3, // Normalized m3 assigned to the row
                    material_cost: normalizeCurrency(data.material_cost || data.amount),
                    extra_fee: normalizeCurrency(data.extra_fee),
                    total_cost: normalizeCurrency(data.total_cost)
                };

                // Ensure order_no hyphen rule
                if (finalRow.order_no && !finalRow.order_no.includes('-')) {
                    const match = finalRow.order_no.match(/^(\d{2})(\d{3})$/);
                    if (match) finalRow.order_no = `${match[1]}-${match[2]}`;
                }

                console.log(`✅ Extracted ONE row for file: ${file.originalname}`);
                // Return as an array with ONE element to maintain downstream compatibility
                return [finalRow];

            } catch (err) {
                console.error(`Error processing ${file.originalname}:`, err.message);
                return { file: file.originalname, success: false, error: err.message };
            } finally {
                if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
            }
        })
    );
};

module.exports = resultsFuncEuro;
