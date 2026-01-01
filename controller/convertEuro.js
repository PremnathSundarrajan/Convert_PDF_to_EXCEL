const resultsFuncEuro = require("../utils/resultsEuro");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const jobManager = require("../utils/jobManager");

/**
 * Convert Euro-format PDFs to Excel.
 * Handles PDFs with 8 columns: date, client, order_no, material, quantity, material_cost, extra_fee, total_cost
 */
const convertEuro = async (req, res) => {
    console.log("[convertEuro.js] Entered 'convertEuro' function.");
    const jobId = req.query.jobId;
    if (jobId) {
        jobManager.createJob(jobId);
    }

    try {
        if (!req.files || req.files.length === 0) {
            console.log("[convertEuro.js] No files uploaded. Sending 400.");
            if (jobId) jobManager.updateJob(jobId, 0, "No files uploaded");
            return res
                .status(400)
                .json({ success: false, error: "No files uploaded" });
        }

        if (jobId) jobManager.updateJob(jobId, 10, "Request received / upload complete");

        console.log(`[convertEuro.js] ${req.files.length} files uploaded. Calling resultsFuncEuro.`);
        if (jobId) jobManager.updateJob(jobId, 30, "PDF parsing started");

        // Intermediate stages
        if (jobId) {
            setTimeout(() => jobManager.updateJob(jobId, 40, "Text normalization complete"), 500);
            setTimeout(() => jobManager.updateJob(jobId, 70, "AI extraction in progress"), 1000);
        }

        const results = await resultsFuncEuro(req);

        if (jobId) jobManager.updateJob(jobId, 80, "AI extraction complete");

        console.log("[convertEuro.js] Returned from resultsFuncEuro.");

        const allValidResults = results.filter((r) => Array.isArray(r) && r.length > 0);

        if (!allValidResults.length) {
            const errorMessages = results
                .filter(r => r && r.success === false)
                .map(r => r.error)
                .join('; ');
            if (jobId) jobManager.updateJob(jobId, 0, "Extraction failed: " + errorMessages);
            return res.status(500).json({
                success: false,
                error: errorMessages || "No valid data extracted",
            });
        }

        if (jobId) jobManager.updateJob(jobId, 90, "Excel generation in progress");

        let combinedRows = [];
        allValidResults.forEach((fileRows) => {
            combinedRows.push(...fileRows);
        });

        const workbook = XLSX.utils.book_new();
        const headers = ["date", "client", "order_no", "material", "delivery", "kgs", "m³", "material_cost", "extra_fee", "total_cost"];
        const ws = XLSX.utils.json_to_sheet(combinedRows, { header: headers });

        const columnWidths = {
            date: 12, client: 20, order_no: 12, material: 25, delivery: 15,
            kgs: 10, "m³": 10, material_cost: 15, extra_fee: 12, total_cost: 12
        };

        combinedRows.forEach((row) => {
            headers.forEach((header) => {
                if (row[header]) {
                    const cellLength = String(row[header]).length + 2;
                    columnWidths[header] = Math.max(columnWidths[header], Math.min(cellLength, 40));
                }
            });
        });

        ws["!cols"] = headers.map((header) => ({ wch: columnWidths[header] }));
        const rowHeights = [];
        combinedRows.forEach((row, idx) => {
            rowHeights[idx] = Object.keys(row).length === 0 ? { hpx: 15 } : { hpx: 25 };
        });
        ws["!rows"] = rowHeights;

        XLSX.utils.book_append_sheet(workbook, ws, "Euro_Invoice_Data");

        const dateStr = new Date().toISOString().split('T')[0];
        const outputFile = `Converted_orderinfo_${dateStr}.xlsx`;
        const outputPath = path.join(__dirname, outputFile);

        XLSX.writeFile(workbook, outputPath);

        if (jobId) jobManager.updateJob(jobId, 100, "File ready for download");

        res.download(outputPath, outputFile, () => {
            try {
                fs.unlinkSync(outputPath);
                if (jobId) jobManager.deleteJob(jobId);
            } catch { }
        });

    } catch (error) {
        if (jobId) jobManager.updateJob(jobId, 0, "Error: " + error.message);
        console.error("[convertEuro.js] Error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { convertEuro };
