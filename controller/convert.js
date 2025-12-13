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

    const workbook = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(combinedRows);

    // Calculate proper column widths based on content
    const columnWidths = {};
    const headers = Object.keys(combinedRows[0] || {});

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
        maxAllowed = 50; // Material can be longer
      } else if (header.toLowerCase() === "item") {
        maxAllowed = 45; // Item can also be longer
      } else if (header.toLowerCase() === "notes") {
        maxAllowed = 50; // Notes can be long
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
      } catch { }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = convert;
