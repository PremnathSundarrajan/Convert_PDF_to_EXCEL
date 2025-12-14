const flattenObject = require("../utils/flattenObject");
const unwindAndFlatten = require("../utils/unwindAndFlatten");
const resultsFunc = require("../utils/results");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const convert = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "No files uploaded" });
    }

    const results = await resultsFunc(req);
    // Debug: print raw results from resultsFunc for inspection
    console.log('----- RAW_RESULTS_FROM_RESULTS_FUNC_START -----');
    try { console.log(JSON.stringify(results, null, 2)); } catch (e) { console.log(results); }
    console.log('----- RAW_RESULTS_FROM_RESULTS_FUNC_END -----');
    console.log("=== RESULTS FROM resultsFunc ===");
    console.log(JSON.stringify(results, null, 2).slice(0, 1000));

    const allValidJson = results.filter((r) => r && r.success !== false);
    console.log("=== VALID JSON COUNT ===", allValidJson.length);

    if (!allValidJson.length) {
      return res.status(500).json({
        success: false,
        error: "No valid data extracted",
      });
    }

    let combinedRows = [];

    allValidJson.forEach((fileData, index) => {
      let rows = [];

      if (fileData.material_details) {
        rows = unwindAndFlatten(fileData);
      } else {
        rows = [flattenObject(fileData)];
      }

      combinedRows.push(...rows);

      if (index < allValidJson.length - 1) {
        combinedRows.push({});
      }
    });

    // Gated debug dump: write the exact combinedRows that will be converted to Excel
    // Use environment variable WRITE_DEBUG_COMBINED=1 to enable (safe for local debugging)
    try {
      const writeDebug = String(process.env.WRITE_DEBUG_COMBINED || "").toLowerCase();
      if (writeDebug === "1" || writeDebug === "true") {
        const debugPath = path.join(__dirname, "debug-combinedRows.json");
        fs.writeFileSync(debugPath, JSON.stringify(combinedRows, null, 2), "utf8");
        console.log(`Debug: wrote combined rows to ${debugPath}`);
      }
    } catch (e) {
      console.warn("Failed to write debug combined rows:", e.message);
    }
    // If debug enabled, also print the full JSON to console between clear markers
    try {
      const writeDebug = String(process.env.WRITE_DEBUG_COMBINED || "").toLowerCase();
      if (writeDebug === "1" || writeDebug === "true") {
        console.log("----- DEBUG_COMBINED_ROWS_JSON_START -----");
        try {
          console.log(JSON.stringify(combinedRows, null, 2));
        } catch (e) {
          // Fallback: print a compact version if the pretty-print fails
          console.log(JSON.stringify(combinedRows));
        }
        console.log("----- DEBUG_COMBINED_ROWS_JSON_END -----");
      }
    } catch (e) {
      // keep moving
    }

    const workbook = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(combinedRows);

    // Calculate proper column widths based on content
    const columnWidths = {};

    // Compute headers as the union of keys across all rows so columns
    // like `order`, `client`, and `item` are always present even if
    // the first row doesn't contain them.
    const headerSet = new Set();
    combinedRows.forEach((r) => {
      if (r && typeof r === "object") {
        Object.keys(r).forEach((k) => headerSet.add(k));
      }
    });
    // Ensure common expected columns exist
    headerSet.add("item");
    headerSet.add("material");
    headerSet.add("pcs");
    const headers = Array.from(headerSet);

    headers.forEach((header) => {
      // Start with header length
      let maxWidth = header.length + 2;

      // Check all row values for this column
      combinedRows.forEach((row) => {
        if (row[header]) {
          const cellLength = String(row[header]).length + 2;
          maxWidth = Math.max(maxWidth, cellLength);
        }
      });

      // Set different max widths based on column type
      let maxAllowed = 40; // Default max width

      if (header.toLowerCase() === "material") {
        maxAllowed = 60; // Material can be longer (increased from 50)
      } else if (header.toLowerCase() === "item") {
        maxAllowed = 55; // Item can also be longer (increased from 45)
      } else if (header.toLowerCase() === "notes") {
        maxAllowed = 55; // Notes can be long
      } else if (
        header.toLowerCase() === "order" ||
        header.toLowerCase() === "client"
      ) {
        maxAllowed = 30; // Order and client are typically shorter
      }

      // Ensure minimum width of 12 and apply the appropriate maximum
      columnWidths[header] = Math.max(12, Math.min(maxWidth, maxAllowed));
    });

    // Apply column widths
    ws["!cols"] = headers.map((header) => ({
      wch: columnWidths[header],
    }));
    // Apply row heights and text wrapping for better readability
    const rowHeights = [];
    combinedRows.forEach((row, idx) => {
      if (Object.keys(row).length === 0) {
        // Blank row
        rowHeights[idx] = { hpx: 15 };
      } else {
        // Regular row with content
        rowHeights[idx] = { hpx: 25 };
      }
    });
    ws["!rows"] = rowHeights;

    // Add text wrapping to header
    const headerStyle = {
      alignment: { wrap: true, vertical: "center" },
      font: { bold: true },
    };
    XLSX.utils.book_append_sheet(workbook, ws, "Combined_Data");

    const outputFile = `converted_${Date.now()}.xlsx`;
    const outputPath = path.join(__dirname, outputFile);

    XLSX.writeFile(workbook, outputPath);

    res.download(outputPath, outputFile, () => {
      try {
        fs.unlinkSync(outputPath);
      } catch {}
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const convertDebug = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "No files uploaded" });
    }

    const results = await resultsFunc(req);
    const allValidJson = results.filter((r) => r && r.success !== false);
    if (!allValidJson.length) {
      return res.status(500).json({ success: false, error: "No valid data extracted" });
    }

    let combinedRows = [];
    allValidJson.forEach((fileData, index) => {
      let rows = [];
      if (fileData.material_details) {
        rows = unwindAndFlatten(fileData);
      } else {
        rows = [flattenObject(fileData)];
      }
      combinedRows.push(...rows);
      if (index < allValidJson.length - 1) combinedRows.push({});
    });

    // write debug file
    try {
      const debugPath = path.join(__dirname, "debug-combinedRows.json");
      fs.writeFileSync(debugPath, JSON.stringify(combinedRows, null, 2), "utf8");
      console.log(`Debug: wrote combined rows to ${debugPath}`);
    } catch (e) {
      console.warn("Failed to write debug combined rows:", e.message);
    }

    // Also print JSON markers for easy copying
    console.log("----- DEBUG_COMBINED_ROWS_JSON_START -----");
    try { console.log(JSON.stringify(combinedRows, null, 2)); } catch (e) { console.log(JSON.stringify(combinedRows)); }
    console.log("----- DEBUG_COMBINED_ROWS_JSON_END -----");

    return res.json({ success: true, count: combinedRows.length, combinedRows });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { convert, convertDebug };
