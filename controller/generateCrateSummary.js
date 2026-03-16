const OpenAI = require("openai");
const XLSX = require("xlsx");
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");
const jobManager = require("../utils/jobManager");
const dotenv = require("dotenv");

dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const generateCrateSummary = async (req, res) => {
    console.log("[generateCrateSummary.js] Entered function.");
    const jobId = req.query.jobId;
    if (jobId) {
        jobManager.createJob(jobId);
    }

    try {
        if (!req.file) {
            console.log("[generateCrateSummary.js] No file uploaded.");
            if (jobId) jobManager.updateJob(jobId, 0, "No file uploaded");
            return res.status(400).json({ success: false, error: "No file uploaded" });
        }

        if (jobId) jobManager.updateJob(jobId, 10, "File uploaded, parsing Excel...");

        // 1. Read Excel
        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // Read as raw rows

        if (jobId) jobManager.updateJob(jobId, 30, "Excel parsed, sending to AI...");

        // 2. Prepare data for OpenAI
        const excelDataString = JSON.stringify(rows);

        const systemPrompt = `You are an expert data processor for logistics.
Extract "Packing ID" from the title row (e.g. "PACKING LIST FOR RCGG-1684" -> "RCGG-1684").
Process the table data to group by "Crates".
For each crate:
- Merge rows with same "Order No" and "Material" by summing "Nos" (quantity).
- Determine "Client": if all share one client, use that; otherwise "Various".
- Calculate total quantity.
Return structured JSON only.`;

        const userPrompt = `
Process this Packing List data:

${excelDataString}

Rules:
1. Extract Packing ID (text after 'FOR' in title row).
2. Group by "Crates" column.
3. Merge duplicate Order No + Material inside each crate, sum quantities.
4. If "Crates" contains values like "Crate 1", "Crate 2", extract the number part.

Expected JSON format:
{
  "packing_id": "RCGG-1684",
  "crates": [
    {
      "crate_no": 1,
      "client": "Alpha",
      "items": [
        { "order_no": "01-135", "material": "Black Premium", "qty": 2 }
      ],
      "total": 2
    }
  ]
}
`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0,
            response_format: { type: "json_object" }
        });

        const aiResponse = JSON.parse(completion.choices[0].message.content);
        
        if (jobId) jobManager.updateJob(jobId, 80, "AI processing complete, building output...");

        // 4. Generate formatted Excel using ExcelJS
        const outWorkbook = new ExcelJS.Workbook();
        const outSheet = outWorkbook.addWorksheet("Crate Summary");

        // Set column widths
        outSheet.columns = [
            { width: 18 }, // A: Order No
            { width: 28 }, // B: Material
            { width: 10 }, // C: Qty
            { width: 16 }  // D: Crate No
        ];

        const today = new Date().toLocaleDateString('en-GB'); // dd/mm/yyyy
        let currentRow = 1;

        // Global Header
        outSheet.mergeCells(currentRow, 1, currentRow, 4);
        const titleCell = outSheet.getCell(currentRow, 1);
        titleCell.value = `CHECKED & VERIFIED. PRINT GIVEN ON ${today}`;
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        titleCell.font = { bold: true };
        currentRow += 1;

        aiResponse.crates.forEach((crate, cIndex) => {
            // Add vertical spacing between crate sections
            if (cIndex > 0) {
                currentRow++; 
            }

            const borderStyle = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };

            // 1. Packing ID Title Row (Bordered - applying to all cells for merged area)
            outSheet.mergeCells(currentRow, 1, currentRow, 4);
            const packingIdCell = outSheet.getCell(currentRow, 1);
            packingIdCell.value = aiResponse.packing_id;
            packingIdCell.font = { size: 20, bold: true };
            packingIdCell.alignment = { horizontal: 'center', vertical: 'middle' };
            // Apply borders to EVERY cell in the merged range to ensure the border shows up correctly in Excel
            for (let i = 1; i <= 4; i++) {
                const cell = outSheet.getRow(currentRow).getCell(i);
                cell.border = borderStyle;
            }
            currentRow++;

            // 2. Table Header Row
            const headers = ['Order No', 'Material', 'Qty', 'Crate No'];
            const headerRow = outSheet.getRow(currentRow);
            headerRow.values = headers;
            headerRow.font = { bold: true };
            headerRow.eachCell((cell) => {
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = borderStyle;
            });
            currentRow++;

            // 3. Items Rows
            const startDataRow = currentRow;
            crate.items.forEach((item) => {
                const row = outSheet.getRow(currentRow);
                row.values = [item.order_no, item.material, item.qty, ''];
                row.eachCell((cell, colNumber) => {
                    if (colNumber === 1 || colNumber === 3) {
                        cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    } else if (colNumber === 2) {
                        cell.alignment = { horizontal: 'left', vertical: 'middle' };
                    }
                    cell.border = borderStyle;
                });
                currentRow++;
            });

            // 4. Total Row
            outSheet.mergeCells(currentRow, 1, currentRow, 2); // Merge Order No + Material
            const totalLabelCell = outSheet.getCell(currentRow, 1);
            totalLabelCell.value = 'Total';
            totalLabelCell.font = { bold: true };
            totalLabelCell.alignment = { horizontal: 'center', vertical: 'middle' };
            
            const totalQtyCell = outSheet.getCell(currentRow, 3);
            totalQtyCell.value = crate.total;
            totalQtyCell.font = { bold: true };
            totalQtyCell.alignment = { horizontal: 'center', vertical: 'middle' };

            // Apply borders to EVERY cell in the merged range (A:B) and C
            for (let i = 1; i <= 3; i++) {
                const cell = outSheet.getRow(currentRow).getCell(i);
                cell.border = borderStyle;
            }
            
            // 5. Crate Number Row (Merged vertically)
            const endDataRow = currentRow; // Total row inclusive
            outSheet.mergeCells(startDataRow, 4, endDataRow, 4);
            const crateNoCell = outSheet.getCell(startDataRow, 4);
            crateNoCell.value = crate.crate_no;
            crateNoCell.font = { size: 54, bold: true };
            crateNoCell.alignment = { vertical: 'middle', horizontal: 'center' };
            // For vertical merges, we also need to apply to all cells in the range
            for (let r = startDataRow; r <= endDataRow; r++) {
                outSheet.getRow(r).getCell(4).border = borderStyle;
            }

            currentRow++;

            // 6. Client Name Row (Bordered - applying to all cells for merged area)
            outSheet.mergeCells(currentRow, 1, currentRow, 4);
            const clientCell = outSheet.getCell(currentRow, 1);
            clientCell.value = crate.client;
            clientCell.font = { size: 32, bold: true };
            clientCell.alignment = { horizontal: 'center', vertical: 'middle' };
            // Apply borders to EVERY cell in the merged range to ensure the border shows up correctly in Excel
            for (let i = 1; i <= 4; i++) {
                const cell = outSheet.getRow(currentRow).getCell(i);
                cell.border = borderStyle;
            }
            
            currentRow++; 
        });

        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `Crate_Summary_${dateStr}.xlsx`;
        const outputPath = path.join(__dirname, `../uploads/${filename}`);

        await outWorkbook.xlsx.writeFile(outputPath);

        if (jobId) jobManager.updateJob(jobId, 100, "File ready for download");

        res.download(outputPath, filename, () => {
            try {
                fs.unlinkSync(outputPath);
                if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
                if (jobId) jobManager.deleteJob(jobId);
            } catch (e) {}
        });

    } catch (error) {
        console.error("[generateCrateSummary.js] Error:", error);
        if (jobId) jobManager.updateJob(jobId, 0, "Error: " + error.message);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { generateCrateSummary };
