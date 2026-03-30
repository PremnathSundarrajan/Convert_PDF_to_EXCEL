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

        // 2. Backend Grouping Logic
        // Identify header row dynamically
        let headerRowIndex = -1;
        let headers = [];
        for (let i = 0; i < Math.min(20, rows.length); i++) {
            const row = rows[i];
            if (!row || !Array.isArray(row)) continue;
            const containsOrder = row.some(cell => typeof cell === 'string' && cell.toLowerCase().includes('order'));
            const containsMaterial = row.some(cell => typeof cell === 'string' && cell.toLowerCase().includes('material'));
            if (containsOrder && containsMaterial) {
                headerRowIndex = i;
                headers = row.map(h => (h || '').toString().trim().toLowerCase());
                break;
            }
        }

        if (headerRowIndex === -1) {
            throw new Error("Could not find table headers (Order No, Material) in the Excel file.");
        }

        let colCrates = -1, colOrderNo = -1, colMaterial = -1, colNos = -1, colClient = -1;
        headers.forEach((h, idx) => {
            if (h.includes('crate')) colCrates = idx;
            else if (h.includes('order')) colOrderNo = idx;
            else if (h.includes('material')) colMaterial = idx;
            else if (h.includes('nos') || h === 'qty' || h.includes('quantity') || h.includes('pcs') || h.includes('pieces')) colNos = idx;
            else if (h.includes('client') || h.includes('buyer') || h.includes('customer')) colClient = idx;
        });

        const parsedData = [];
        let currentCrate = null;
        for (let i = headerRowIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            
            const rowCrate = (colCrates !== -1 && row[colCrates] != null && String(row[colCrates]).trim() !== '') ? row[colCrates] : currentCrate;
            currentCrate = rowCrate;

            const orderNo = colOrderNo !== -1 ? row[colOrderNo] : null;
            const material = colMaterial !== -1 ? row[colMaterial] : null;
            const nos = colNos !== -1 ? row[colNos] : null;
            const client = colClient !== -1 ? row[colClient] : null;

            // Only process rows that have actual item data
            if (orderNo || material) {
                parsedData.push({
                    crate: rowCrate,
                    orderNo: orderNo,
                    material: material,
                    nos: nos,
                    client: client
                });
            }
        }

        let originalSum = 0;
        const grouped = {};
        const crateClients = {};

        parsedData.forEach(row => {
            const rawCrate = String(row.crate || 'Unknown').trim();
            // Try to extract strict number if it says "Crate 1"
            const crateMatch = rawCrate.match(/[0-9]+/);
            // Default to numeric crate index if extracted, otherwise keeping raw string
            const crateKey = crateMatch ? crateMatch[0] : rawCrate;

            const orderNo = String(row.orderNo || '').trim();
            const material = String(row.material || '').trim();
            const key = `${crateKey}_${orderNo}_${material}`;

            if (!grouped[key]) {
                grouped[key] = {
                    crate_no: crateKey,
                    order_no: orderNo,
                    material: material,
                    qty: 0
                };
            }

            const num = Number(row.nos || 0);
            const validNum = isNaN(num) ? 0 : num;
            grouped[key].qty += validNum;
            originalSum += validNum;

            if (!crateClients[crateKey]) crateClients[crateKey] = new Set();
            if (row.client && String(row.client).trim() !== '') {
                crateClients[crateKey].add(String(row.client).trim());
            }
        });

        const getClient = (crateKey) => {
            const clients = Array.from(crateClients[crateKey] || []);
            if (clients.length === 0) return 'Various';
            if (clients.length === 1) return clients[0];
            return 'Various';
        };

        const cratesMap = {};
        let groupedSum = 0;
        Object.values(grouped).forEach(item => {
            if (!cratesMap[item.crate_no]) {
                cratesMap[item.crate_no] = {
                    crate_no: item.crate_no,
                    client: getClient(item.crate_no),
                    items: [],
                    total: 0
                };
            }
            cratesMap[item.crate_no].items.push({
                order_no: item.order_no,
                material: item.material,
                qty: item.qty
            });
            cratesMap[item.crate_no].total += item.qty;
            groupedSum += item.qty;
        });

        if (originalSum !== groupedSum) {
            throw new Error(`INTERNAL ERROR: Backend Data Loss. original_sum (${originalSum}) != grouped_sum (${groupedSum})`);
        }

        const backendCalculatedCrates = Object.values(cratesMap).map(c => ({
            crate_no: Number(c.crate_no) || c.crate_no,
            client: c.client,
            items: c.items,
            total: c.total
        }));

        const excelDataString = JSON.stringify({
            title_rows_for_packing_id: rows.slice(0, Math.max(headerRowIndex, 5)),
            backend_calculated_crates: backendCalculatedCrates
        }, null, 2);

        const systemPrompt = `You are a formatting agent.
Your job is ONLY to extract the Packing ID and format the provided backend data strictly into JSON.`;

        const userPrompt = `
Here is the raw title rows and the explicitly grouped backend data:

${excelDataString}

================================================
NEW RULE — BACKEND IS SOURCE OF TRUTH
================================================

1. OPENAI MUST NOT CALCULATE
You are ONLY allowed to:
• format data
• structure crate output
• Extract Packing ID from the title_rows (e.g. text after 'FOR' in "PACKING LIST FOR RCGG-1684").

You MUST NOT:
❌ sum values
❌ count rows
❌ modify qty

2. FINAL OUTPUT RULE
Do NOT change qty or total values. They are already calculated.
Use the EXACT "backend_calculated_crates" provided in the JSON payload. Do not change structure.

Expected JSON format:
{
  "packing_id": "RCGG-1684",
  "crates": [
    {
      "crate_no": 1,
      "client": "Alpha",
      "items": [
        { "order_no": "01-135", "material": "Black Premium", "qty": 4 }
      ],
      "total": 4
    }
  ]
}

Treat this as a strict 1-to-1 data mapping task for the crates. Do not omit any items or crates.
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

        // 6. VALIDATION (MANDATORY)
        let sum_excel = 0;
        aiResponse.crates.forEach(c => {
            if (c.items) {
                c.items.forEach(i => sum_excel += (Number(i.qty) || 0));
            }
        });

        if (groupedSum !== sum_excel) {
            throw new Error(`CRITICAL ERROR: OpenAI altered quantities! sum_backend (${groupedSum}) != sum_excel (${sum_excel})`);
        }
        
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
