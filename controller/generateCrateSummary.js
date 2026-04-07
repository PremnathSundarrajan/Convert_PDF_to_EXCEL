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
      return res
        .status(400)
        .json({ success: false, error: "No file uploaded" });
    }

    if (jobId)
      jobManager.updateJob(jobId, 10, "File uploaded, parsing Excel...");

    // 1. Read Excel
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // Read as raw rows

    if (jobId)
      jobManager.updateJob(jobId, 30, "Excel parsed, sending to AI...");

    // 2. Backend Grouping Logic
    // Identify header row dynamically
    let headerRowIndex = -1;
    let headers = [];
    for (let i = 0; i < Math.min(20, rows.length); i++) {
      const row = rows[i];
      if (!row || !Array.isArray(row)) continue;
      const containsOrder = row.some(
        (cell) =>
          typeof cell === "string" && cell.toLowerCase().includes("order"),
      );
      const containsMaterial = row.some(
        (cell) =>
          typeof cell === "string" && cell.toLowerCase().includes("material"),
      );
      if (containsOrder && containsMaterial) {
        headerRowIndex = i;
        headers = row.map((h) => (h || "").toString().trim().toLowerCase());
        break;
      }
    }

    if (headerRowIndex === -1) {
      throw new Error(
        "Could not find table headers (Order No, Material) in the Excel file.",
      );
    }

    let colCrates = -1,
      colOrderNo = -1,
      colMaterial = -1,
      colNos = -1,
      colClient = -1;
    headers.forEach((h, idx) => {
      if (h.includes("crate")) colCrates = idx;
      else if (h.includes("order")) colOrderNo = idx;
      else if (h.includes("material")) colMaterial = idx;
      else if (
        h.includes("nos") ||
        h === "qty" ||
        h.includes("quantity") ||
        h.includes("pcs") ||
        h.includes("pieces")
      )
        colNos = idx;
      else if (
        h.includes("client") ||
        h.includes("buyer") ||
        h.includes("customer")
      )
        colClient = idx;
    });

    // MANDATORY VALIDATION: Verify NOS column was found
    if (colNos === -1) {
      throw new Error(
        "CRITICAL: Could not find NOS/QTY/QUANTITY/PCS column in headers. Column mapping failed.",
      );
    }

    // CARRY FORWARD LOGIC — Handle merged/blank cells in Excel
    // Track last seen values for crate, orderNo, material
    let lastCrate = null;
    let lastOrderNo = null;
    let lastMaterial = null;

    console.log(
      "[generateCrateSummary.js] CARRY FORWARD - Processing merged/blank cells...",
    );

    const normalizedRows = [];
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      // Extract raw values from columns
      const rawCrate = colCrates !== -1 ? row[colCrates] : null;
      const rawOrderNo = colOrderNo !== -1 ? row[colOrderNo] : null;
      const rawMaterial = colMaterial !== -1 ? row[colMaterial] : null;
      const rawNos = colNos !== -1 ? row[colNos] : null;
      const rawClient = colClient !== -1 ? row[colClient] : null;

      // CARRY FORWARD: If value is missing/empty, use last seen value
      const processedCrate =
        rawCrate !== null &&
        rawCrate !== undefined &&
        String(rawCrate).trim() !== ""
          ? rawCrate
          : lastCrate;

      const processedOrderNo =
        rawOrderNo !== null &&
        rawOrderNo !== undefined &&
        String(rawOrderNo).trim() !== ""
          ? rawOrderNo
          : lastOrderNo;

      const processedMaterial =
        rawMaterial !== null &&
        rawMaterial !== undefined &&
        String(rawMaterial).trim() !== ""
          ? rawMaterial
          : lastMaterial;

      // Update last seen values for next iteration
      if (processedCrate !== null) lastCrate = processedCrate;
      if (processedOrderNo !== null) lastOrderNo = processedOrderNo;
      if (processedMaterial !== null) lastMaterial = processedMaterial;

      console.log(
        `[generateCrateSummary.js] CARRY FORWARD - Row ${i}: raw(crate="${rawCrate}", order="${rawOrderNo}", material="${rawMaterial}") → processed(crate="${processedCrate}", order="${processedOrderNo}", material="${processedMaterial}")`,
      );

      normalizedRows.push({
        crate: processedCrate,
        orderNo: processedOrderNo,
        material: processedMaterial,
        nos: rawNos, // NOS is not carried forward, only crate/orderNo/material
        client: rawClient,
        rowIndex: i, // Keep track of original row for debugging
      });
    }

    console.log(
      `[generateCrateSummary.js] CARRY FORWARD - Normalized ${normalizedRows.length} rows from ${rows.length - headerRowIndex - 1} raw rows`,
    );

    const parsedData = [];
    for (const row of normalizedRows) {
      // DATA FILTERING — IGNORE NON-DATA ROWS (MANDATORY)
      // Rule 1: Skip completely empty rows
      const hasAnyData = [
        row.crate,
        row.orderNo,
        row.material,
        row.nos,
        row.client,
      ].some(
        (val) => val !== null && val !== undefined && String(val).trim() !== "",
      );
      if (!hasAnyData) {
        console.log(
          `[generateCrateSummary.js] FILTER - Skipping empty row ${row.rowIndex}`,
        );
        continue;
      }

      // Rule 2: Skip descriptive/formatting rows (non-order text)
      const rowText = [
        row.crate,
        row.orderNo,
        row.material,
        row.nos,
        row.client,
      ]
        .filter((val) => val !== null && val !== undefined)
        .map((val) => String(val).toLowerCase().trim())
        .join(" ");

      const isDescriptiveRow =
        rowText.includes("samples bundle packing") ||
        rowText.includes("fragile crate") ||
        rowText.includes("packing list") ||
        rowText.includes("total") ||
        rowText.includes("grand total") ||
        rowText.includes("subtotal") ||
        rowText.includes("summary") ||
        rowText.includes("note") ||
        rowText.includes("remark") ||
        rowText.includes("comment") ||
        rowText.includes("description") ||
        rowText.includes("header") ||
        rowText.includes("footer") ||
        // Skip rows that are just numbers or single words
        (rowText.split(" ").length <= 2 && !/\d/.test(rowText));

      if (isDescriptiveRow) {
        console.log(
          `[generateCrateSummary.js] FILTER - Skipping descriptive row ${row.rowIndex}: "${rowText}"`,
        );
        continue;
      }

      // CRITICAL RULE: Only skip rows missing crate, orderNo, or material
      // DO NOT skip based on NOS alone (after carry-forward, these should be populated)
      const hasCrate =
        row.crate !== null &&
        row.crate !== undefined &&
        String(row.crate).trim() !== "";
      const hasOrderNo =
        row.orderNo !== null &&
        row.orderNo !== undefined &&
        String(row.orderNo).trim() !== "";
      const hasMaterial =
        row.material !== null &&
        row.material !== undefined &&
        String(row.material).trim() !== "";

      if (!hasCrate || !hasOrderNo || !hasMaterial) {
        console.log(
          `[generateCrateSummary.js] FILTER - Skipping row ${row.rowIndex}: missing required fields after carry-forward (crate=${hasCrate}, orderNo=${hasOrderNo}, material=${hasMaterial})`,
        );
        continue;
      }

      // Rule 4: Additional validation - orderNo should look like an order number (contain numbers)
      const orderNoStr = String(row.orderNo).trim();
      const looksLikeOrderNumber =
        /\d/.test(orderNoStr) && orderNoStr.length >= 3;
      if (!looksLikeOrderNumber) {
        console.log(
          `[generateCrateSummary.js] FILTER - Skipping row ${row.rowIndex}: orderNo "${orderNoStr}" doesn't look like a valid order number`,
        );
        continue;
      }

      // NOS HANDLING: If invalid, treat as 1 (DO NOT skip row)
      // CRITICAL: Missing/invalid NOS should default to 1, not 0
      let processedNos = 1; // Default to 1 for missing/invalid NOS
      if (row.nos !== null && row.nos !== undefined) {
        const trimmedNos = String(row.nos).trim();
        if (trimmedNos !== "") {
          const numNos = Number(trimmedNos);
          if (!isNaN(numNos) && numNos > 0) {
            processedNos = numNos; // Use valid positive number
          }
          // If invalid (NaN, <= 0, etc.), keep default of 1
        }
        // If empty string after trim, keep default of 1
      }
      // If null/undefined, keep default of 1

      console.log(
        `[generateCrateSummary.js] ACCEPT - Processing valid data row ${row.rowIndex}: crate="${row.crate}", order="${row.orderNo}", material="${row.material}", nos="${row.nos}" → processedNos=${processedNos}`,
      );
      parsedData.push({
        crate: row.crate,
        orderNo: row.orderNo,
        material: row.material,
        nos: processedNos, // Use processed NOS value
        client: row.client,
      });
    }

    // MANDATORY DEBUG LOGGING: Log sample row to verify NOS field exists
    console.log("[generateCrateSummary.js] DEBUG - Sample Row Data:");
    if (parsedData.length > 0) {
      console.log(
        "[generateCrateSummary.js] DEBUG - First parsed row:",
        JSON.stringify(parsedData[0], null, 2),
      );
      console.log(
        "[generateCrateSummary.js] DEBUG - NOS value from first row:",
        parsedData[0].nos,
      );
      console.log(
        "[generateCrateSummary.js] DEBUG - NOS type:",
        typeof parsedData[0].nos,
      );
      console.log(
        "[generateCrateSummary.js] DEBUG - Total valid data rows found:",
        parsedData.length,
      );
    } else {
      console.log(
        "[generateCrateSummary.js] WARNING - No valid data rows found after filtering!",
      );
      throw new Error(
        "No valid data rows found. The Excel file may contain only formatting rows or descriptive text. " +
          "Please ensure the file contains actual order data with crate, order number, material, and quantity columns.",
      );
    }

    // VALIDATION — All parsedData rows should already be valid (filtered above)
    // NOS is now guaranteed to be a valid number >= 1
    console.log(
      "[generateCrateSummary.js] VALIDATION - Sanity check on filtered data...",
    );
    const sanityCheckFailures = [];

    parsedData.forEach((row, rowIndex) => {
      const nos = row.nos;

      // NOS should now be a valid number >= 1 (processed during filtering)
      if (
        nos === undefined ||
        nos === null ||
        typeof nos !== "number" ||
        isNaN(nos) ||
        nos < 1
      ) {
        sanityCheckFailures.push({
          rowIndex,
          reason: `Sanity check failed: nos should be valid number >= 1, got: ${nos} (type: ${typeof nos})`,
          row: row,
        });
      }

      // Check required fields are present
      if (
        !row.crate ||
        !row.orderNo ||
        !row.material ||
        String(row.crate).trim() === "" ||
        String(row.orderNo).trim() === "" ||
        String(row.material).trim() === ""
      ) {
        sanityCheckFailures.push({
          rowIndex,
          reason: "Missing required field after filtering",
          row: row,
        });
      }
    });

    if (sanityCheckFailures.length > 0) {
      console.error(
        "[generateCrateSummary.js] SANITY CHECK FAILED - These rows passed filtering but failed validation:",
      );
      sanityCheckFailures.forEach((failure) => {
        console.error(
          `  Row ${failure.rowIndex}: ${failure.reason}`,
          JSON.stringify(failure.row, null, 2),
        );
      });
      throw new Error(
        `INTERNAL ERROR: ${sanityCheckFailures.length} rows passed data filtering but failed validation. ` +
          `This indicates a bug in the filtering logic.`,
      );
    }

    console.log(
      "[generateCrateSummary.js] VALIDATION PASSED - All filtered rows are valid",
    );

    let originalSum = 0;
    const grouped = {};
    const crateClients = {};

    console.log(
      "[generateCrateSummary.js] GROUPING - Starting grouping process...",
    );
    console.log(
      `[generateCrateSummary.js] GROUPING - Total parsed data rows: ${parsedData.length}`,
    );

    parsedData.forEach((row, index) => {
      const rawCrate = String(row.crate || "Unknown").trim();
      // Try to extract strict number if it says "Crate 1"
      const crateMatch = rawCrate.match(/[0-9]+/);
      // Default to numeric crate index if extracted, otherwise keeping raw string
      const crateKey = crateMatch ? crateMatch[0] : rawCrate;

      const orderNo = String(row.orderNo || "").trim();
      const material = String(row.material || "").trim();

      // GROUPING KEY: crate + orderNo + material
      // This ensures:
      // - Same crate, same orderNo, same material = SUM quantities
      // - Different orderNo = SEPARATE rows
      // - Different crates = SEPARATE crates
      const key = `${crateKey}_${orderNo}_${material}`;

      console.log(
        `[generateCrateSummary.js] GROUPING - Row ${index}: crate="${rawCrate}" → crateKey="${crateKey}", orderNo="${orderNo}", material="${material}", nos="${row.nos}", key="${key}"`,
      );

      if (!grouped[key]) {
        grouped[key] = {
          crate_no: crateKey,
          order_no: orderNo,
          material: material,
          qty: 0,
        };
        console.log(
          `[generateCrateSummary.js] GROUPING - Created new group: ${key}`,
        );
      } else {
        console.log(
          `[generateCrateSummary.js] GROUPING - Adding to existing group: ${key} (current qty: ${grouped[key].qty})`,
        );
      }

      // SAFE EXTRACTION (NOS already processed during filtering - guaranteed to be number >= 1)
      const nos = row.nos; // Already validated and processed

      // GROUPING RULE: qty MUST be calculated as qty += nos
      grouped[key].qty += nos;
      originalSum += nos;

      console.log(
        `[generateCrateSummary.js] GROUPING - Added ${nos} to ${key}, new qty: ${grouped[key].qty}`,
      );

      if (!crateClients[crateKey]) crateClients[crateKey] = new Set();
      if (row.client && String(row.client).trim() !== "") {
        crateClients[crateKey].add(String(row.client).trim());
      }
    });

    console.log("[generateCrateSummary.js] GROUPING - Final grouped results:");
    Object.entries(grouped).forEach(([key, item]) => {
      console.log(`  ${key}: qty=${item.qty}`);
    });
    console.log(
      `[generateCrateSummary.js] GROUPING - Total groups: ${Object.keys(grouped).length}, Total original sum: ${originalSum}`,
    );

    // VALIDATION: Ensure different order numbers are NOT merged
    const orderNumbers = new Set();
    Object.values(grouped).forEach((item) => {
      if (orderNumbers.has(item.order_no)) {
        console.log(
          `[generateCrateSummary.js] VALIDATION - Order ${item.order_no} appears in multiple groups (correct)`,
        );
      }
      orderNumbers.add(item.order_no);
    });
    console.log(
      `[generateCrateSummary.js] VALIDATION - Found ${orderNumbers.size} unique order numbers across all groups`,
    );

    const getClient = (crateKey) => {
      const clients = Array.from(crateClients[crateKey] || []);
      if (clients.length === 0) return "Various";
      if (clients.length === 1) return clients[0];
      return "Various";
    };

    const cratesMap = {};
    let groupedSum = 0;

    console.log(
      "[generateCrateSummary.js] CRATE ORGANIZATION - Organizing items by crate...",
    );
    Object.values(grouped).forEach((item) => {
      // VALIDATION: Check for qty = 0 (log warning, don't crash)
      if (item.qty === 0) {
        console.warn(
          `[generateCrateSummary.js] WARNING - Item has qty = 0 after grouping: Order: ${item.order_no}, Material: ${item.material}, Crate: ${item.crate_no}. ` +
            `This may indicate data issues but processing will continue.`,
        );
      }

      if (!cratesMap[item.crate_no]) {
        cratesMap[item.crate_no] = {
          crate_no: item.crate_no,
          client: getClient(item.crate_no),
          items: [],
          total: 0,
        };
        console.log(
          `[generateCrateSummary.js] CRATE ORGANIZATION - Created crate: ${item.crate_no}`,
        );
      }

      console.log(
        `[generateCrateSummary.js] CRATE ORGANIZATION - Adding item to crate ${item.crate_no}: order=${item.order_no}, material=${item.material}, qty=${item.qty}`,
      );
      cratesMap[item.crate_no].items.push({
        order_no: item.order_no,
        material: item.material,
        qty: item.qty,
      });
      cratesMap[item.crate_no].total += item.qty;
      groupedSum += item.qty;
    });

    console.log(
      "[generateCrateSummary.js] CRATE ORGANIZATION - Final crate structure:",
    );
    Object.values(cratesMap).forEach((crate) => {
      console.log(
        `  Crate ${crate.crate_no} (${crate.client}): ${crate.items.length} items, total=${crate.total}`,
      );
      crate.items.forEach((item) => {
        console.log(
          `    - Order ${item.order_no}: ${item.material} x ${item.qty}`,
        );
      });
    });

    console.log("[generateCrateSummary.js] FINAL OUTPUT SUMMARY:");
    console.log(`Total crates: ${Object.keys(cratesMap).length}`);
    console.log(
      `Total unique order+material combinations: ${Object.keys(grouped).length}`,
    );
    console.log(`Total quantity across all items: ${groupedSum}`);

    // VALIDATION: Confirm multiple orders per crate are preserved
    let maxItemsPerCrate = 0;
    let cratesWithMultipleOrders = 0;
    Object.values(cratesMap).forEach((crate) => {
      maxItemsPerCrate = Math.max(maxItemsPerCrate, crate.items.length);
      if (crate.items.length > 1) {
        cratesWithMultipleOrders++;
        console.log(
          `[generateCrateSummary.js] MULTIPLE ORDERS - Crate ${crate.crate_no} has ${crate.items.length} different orders`,
        );
      }
    });
    console.log(
      `[generateCrateSummary.js] MULTIPLE ORDERS - ${cratesWithMultipleOrders} crates have multiple orders, max items per crate: ${maxItemsPerCrate}`,
    );

    // Show example of what Excel output will look like
    console.log("[generateCrateSummary.js] EXCEL OUTPUT PREVIEW:");
    Object.values(cratesMap).forEach((crate) => {
      console.log(`\nCrate ${crate.crate_no} Section:`);
      console.log(`  Headers: Order No | Material | Qty | Crate No`);
      crate.items.forEach((item) => {
        console.log(
          `  Data: ${item.order_no} | ${item.material} | ${item.qty} | ${crate.crate_no}`,
        );
      });
      console.log(`  Total: Total |  | ${crate.total} | ${crate.crate_no}`);
    });

    if (originalSum !== groupedSum) {
      throw new Error(
        `INTERNAL ERROR: Backend Data Loss. original_sum (${originalSum}) != grouped_sum (${groupedSum})`,
      );
    }

    const backendCalculatedCrates = Object.values(cratesMap).map((c) => ({
      crate_no: Number(c.crate_no) || c.crate_no,
      client: c.client,
      items: c.items,
      total: c.total,
    }));

    const excelDataString = JSON.stringify(
      {
        title_rows_for_packing_id: rows.slice(0, Math.max(headerRowIndex, 5)),
        backend_calculated_crates: backendCalculatedCrates,
        _BACKEND_TRUTH: {
          total_sum: groupedSum,
          note: "These values are FINAL and IMMUTABLE. OpenAI must NOT modify these values under ANY circumstances.",
        },
      },
      null,
      2,
    );

    const systemPrompt = `You are a FORMATTING-ONLY agent.
CRITICAL RULES:
1. You MUST NOT perform any calculations
2. You MUST NOT sum values
3. You MUST NOT count rows
4. You MUST NOT modify the qty field in ANY way
5. You are ONLY allowed to:
   - Extract Packing ID from title rows
   - Format and structure the backend data as JSON

BACKEND IS THE ONLY SOURCE OF TRUTH.`;

    const userPrompt = `
Here is the raw title rows and the explicitly grouped backend data:

${excelDataString}

================================================
IMMUTABLE BACKEND RULE — DO NOT ALTER
================================================

The "backend_calculated_crates" contains FINAL quantities calculated by the backend.
Total sum from backend: ${groupedSum}

YOU MUST:
1. Extract Packing ID from title_rows (text after 'FOR' in "PACKING LIST FOR RCGG-1684")
2. Use the EXACT backend data - do NOT change ANY qty or total values
3. Verify final output sum = ${groupedSum}

YOU MUST NOT:
❌ Calculate qty yourself
❌ Modify any qty value
❌ Change the total values
❌ Omit any items or crates from backend data

Expected JSON format (use exact backend values):
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

This is a STRICT 1-to-1 data mapping task. Zero creativity allowed.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const aiResponse = JSON.parse(completion.choices[0].message.content);

    // VALIDATION (MANDATORY) - Detailed checking
    console.log(
      "[generateCrateSummary.js] VALIDATION START - Backend Integrity Check",
    );
    console.log(
      `[generateCrateSummary.js] Backend calculated sum (groupedSum): ${groupedSum}`,
    );

    let sum_excel = 0;
    const itemsProcessed = [];
    aiResponse.crates.forEach((c, crateIdx) => {
      if (c.items) {
        c.items.forEach((i, itemIdx) => {
          const itemQty = Number(i.qty) || 0;
          sum_excel += itemQty;
          itemsProcessed.push({
            crate_no: c.crate_no,
            order_no: i.order_no,
            material: i.material,
            qty: itemQty,
          });
        });
      }
    });

    console.log(
      `[generateCrateSummary.js] OpenAI response sum (sum_excel): ${sum_excel}`,
    );
    console.log("[generateCrateSummary.js] Items processed from OpenAI:");
    itemsProcessed.forEach((item) => {
      console.log(
        `  - Crate ${item.crate_no}: Order ${item.order_no}, Material ${item.material}, Qty ${item.qty}`,
      );
    });

    // CRITICAL VALIDATION: Sum must match exactly
    if (groupedSum !== sum_excel) {
      const errorMsg =
        `CRITICAL ERROR: OpenAI altered quantities! Backend sum (${groupedSum}) !== OpenAI response sum (${sum_excel}). ` +
        `Difference: ${Math.abs(groupedSum - sum_excel)}. This indicates data corruption or malicious modification.`;
      console.error("[generateCrateSummary.js] " + errorMsg);
      throw new Error(errorMsg);
    }

    // VALIDATION: Check no items have zero or negative qty
    itemsProcessed.forEach((item) => {
      if (item.qty <= 0) {
        throw new Error(
          `VALIDATION ERROR: Item has invalid qty (${item.qty}). Order: ${item.order_no}, Material: ${item.material}`,
        );
      }
    });

    console.log(
      "[generateCrateSummary.js] VALIDATION PASSED - All checksums match, data integrity confirmed",
    );

    if (jobId)
      jobManager.updateJob(
        jobId,
        80,
        "AI processing complete, building output...",
      );

    // 4. Generate formatted Excel using ExcelJS
    const outWorkbook = new ExcelJS.Workbook();
    const outSheet = outWorkbook.addWorksheet("Crate Summary");

    // Set column widths
    outSheet.columns = [
      { width: 18 }, // A: Order No
      { width: 28 }, // B: Material
      { width: 10 }, // C: Qty
      { width: 16 }, // D: Crate No
    ];

    const today = new Date().toLocaleDateString("en-GB"); // dd/mm/yyyy
    let currentRow = 1;

    // Global Header
    outSheet.mergeCells(currentRow, 1, currentRow, 4);
    const titleCell = outSheet.getCell(currentRow, 1);
    titleCell.value = `CHECKED & VERIFIED. PRINT GIVEN ON ${today}`;
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    titleCell.font = { bold: true };
    currentRow += 1;

    aiResponse.crates.forEach((crate, cIndex) => {
      // Add vertical spacing between crate sections
      if (cIndex > 0) {
        currentRow++;
      }

      const borderStyle = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };

      // 1. Packing ID Title Row (Bordered - applying to all cells for merged area)
      outSheet.mergeCells(currentRow, 1, currentRow, 4);
      const packingIdCell = outSheet.getCell(currentRow, 1);
      packingIdCell.value = aiResponse.packing_id;
      packingIdCell.font = { size: 20, bold: true };
      packingIdCell.alignment = { horizontal: "center", vertical: "middle" };
      // Apply borders to EVERY cell in the merged range to ensure the border shows up correctly in Excel
      for (let i = 1; i <= 4; i++) {
        const cell = outSheet.getRow(currentRow).getCell(i);
        cell.border = borderStyle;
      }
      currentRow++;

      // 2. Table Header Row
      const headers = ["Order No", "Material", "Qty", "Crate No"];
      const headerRow = outSheet.getRow(currentRow);
      headerRow.values = headers;
      headerRow.font = { bold: true };
      headerRow.eachCell((cell) => {
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = borderStyle;
      });
      currentRow++;

      // 3. Items Rows
      const startDataRow = currentRow;
      crate.items.forEach((item) => {
        const row = outSheet.getRow(currentRow);
        row.values = [item.order_no, item.material, item.qty, ""];
        row.eachCell((cell, colNumber) => {
          if (colNumber === 1 || colNumber === 3) {
            cell.alignment = { horizontal: "center", vertical: "middle" };
          } else if (colNumber === 2) {
            cell.alignment = { horizontal: "left", vertical: "middle" };
          }
          cell.border = borderStyle;
        });
        currentRow++;
      });

      // 4. Total Row
      outSheet.mergeCells(currentRow, 1, currentRow, 2); // Merge Order No + Material
      const totalLabelCell = outSheet.getCell(currentRow, 1);
      totalLabelCell.value = "Total";
      totalLabelCell.font = { bold: true };
      totalLabelCell.alignment = { horizontal: "center", vertical: "middle" };

      const totalQtyCell = outSheet.getCell(currentRow, 3);
      totalQtyCell.value = crate.total;
      totalQtyCell.font = { bold: true };
      totalQtyCell.alignment = { horizontal: "center", vertical: "middle" };

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
      crateNoCell.alignment = { vertical: "middle", horizontal: "center" };
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
      clientCell.alignment = { horizontal: "center", vertical: "middle" };
      // Apply borders to EVERY cell in the merged range to ensure the border shows up correctly in Excel
      for (let i = 1; i <= 4; i++) {
        const cell = outSheet.getRow(currentRow).getCell(i);
        cell.border = borderStyle;
      }

      currentRow++;
    });

    const dateStr = new Date().toISOString().split("T")[0];
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
