const resultsFuncEuro = require("../utils/resultsEuro");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

/**
 * Convert Euro-format PDFs to Excel.
 * Handles PDFs with 8 columns: date, client, order_no, material, quantity, material_cost, extra_fee, total_cost
 */
const convertEuro = async (req, res) => {
    console.log("[convertEuro.js] Entered 'convertEuro' function.");
    try {
        if (!req.files || req.files.length === 0) {
            console.log("[convertEuro.js] No files uploaded. Sending 400.");
            return res
                .status(400)
                .json({ success: false, error: "No files uploaded" });
        }

        console.log(`[convertEuro.js] ${req.files.length} files uploaded. Calling resultsFuncEuro.`);
        const results = await resultsFuncEuro(req);
        console.log("[convertEuro.js] Returned from resultsFuncEuro.");

        // Debug: print raw results
        console.log('----- RAW_RESULTS_FROM_RESULTS_FUNC_EURO_START -----');
        try { console.log(JSON.stringify(results, null, 2)); } catch (e) { console.log(results); }
        console.log('----- RAW_RESULTS_FROM_RESULTS_FUNC_EURO_END -----');

        // Filter valid results (arrays of rows) from error objects
        const allValidResults = results.filter((r) => Array.isArray(r) && r.length > 0);
        console.log("=== VALID RESULT ARRAYS COUNT ===", allValidResults.length);

        if (!allValidResults.length) {
            const errorMessages = results
                .filter(r => r && r.success === false)
                .map(r => r.error)
                .join('; ');
            return res.status(500).json({
                success: false,
                error: errorMessages || "No valid data extracted",
            });
        }

        // Flatten all rows from all files into one array
        let combinedRows = [];
        allValidResults.forEach((fileRows, index) => {
            combinedRows.push(...fileRows);
            // Add empty row between files for visual separation
            if (index < allValidResults.length - 1) {
                combinedRows.push({});
            }
        });

        console.log(`[convertEuro.js] Total combined rows: ${combinedRows.length}`);

        // Create Excel workbook
        const workbook = XLSX.utils.book_new();

        // Define column headers in exact order (NEW 8-COLUMN SCHEMA)
        const headers = ["date", "client", "order_no", "material", "quantity", "material_cost", "extra_fee", "total_cost"];

        // Create worksheet from JSON with specific headers
        const ws = XLSX.utils.json_to_sheet(combinedRows, { header: headers });

        // Calculate and apply column widths (NEW 8-COLUMN SCHEMA)
        const columnWidths = {
            date: 12,
            client: 20,
            order_no: 12,
            material: 25,
            quantity: 12,
            material_cost: 15,
            extra_fee: 12,
            total_cost: 12
        };

        // Check actual content widths and adjust if needed
        combinedRows.forEach((row) => {
            headers.forEach((header) => {
                if (row[header]) {
                    const cellLength = String(row[header]).length + 2;
                    columnWidths[header] = Math.max(columnWidths[header], Math.min(cellLength, 40));
                }
            });
        });

        // Apply column widths
        ws["!cols"] = headers.map((header) => ({
            wch: columnWidths[header],
        }));

        // Apply row heights
        const rowHeights = [];
        combinedRows.forEach((row, idx) => {
            if (Object.keys(row).length === 0) {
                rowHeights[idx] = { hpx: 15 }; // Blank row
            } else {
                rowHeights[idx] = { hpx: 25 }; // Regular row
            }
        });
        ws["!rows"] = rowHeights;

        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(workbook, ws, "Euro_Invoice_Data");

        // Write file and send response
        const outputFile = `converted_euro_${Date.now()}.xlsx`;
        const outputPath = path.join(__dirname, outputFile);

        XLSX.writeFile(workbook, outputPath);

        res.download(outputPath, outputFile, () => {
            try {
                fs.unlinkSync(outputPath);
            } catch { }
        });

    } catch (error) {
        console.error("[convertEuro.js] Error:", error.message);
        console.error("[convertEuro.js] Stack:", error.stack);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { convertEuro };

