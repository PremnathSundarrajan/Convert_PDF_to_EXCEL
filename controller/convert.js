 
const extractJsonFromPDF = require("../utils/extractJsonFromPDF");
const flattenObject = require("../utils/flattenObject");
const sanitizeAIResponse = require("../utils/sanitizeAIResponse");
const tryFixJson = require("../utils/tryFixJson");
const unwindAndFlatten = require("../utils/unwindAndFlatten");
const resultsFunc  = require("../utils/results");

const multer = require("multer");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const path = require("path");
const OpenAI = require("openai");
const XLSX = require("xlsx");
const dotenv = require("dotenv");
dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const convert = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "No files uploaded" });
    }

    const results = await resultsFunc(req);
    const allValidJson = results.filter((r) => r && r.success !== false);

    if (allValidJson.length === 0) {
      return res.status(500).json({
        success: false,
        error: "Failed to extract valid JSON from all files",
        errors: results,
      });
    }

    // 🔥 COLLECT ALL ROWS FROM ALL PDFs INTO ONE ARRAY
    let combinedRows = [];

    allValidJson.forEach((fileData) => {
      let finalRows = [];

      if (fileData.material_details && Array.isArray(fileData.material_details)) {
        finalRows = unwindAndFlatten(fileData);
      } else if (fileData.rows && Array.isArray(fileData.rows)) {
        finalRows = flattenObject(fileData.rows);
      } else if (fileData.years && Array.isArray(fileData.years)) {
        finalRows = flattenObject(fileData);
      } else {
        finalRows = [flattenObject(fileData)];
      }

      if (finalRows.length === 0) {
        finalRows = [flattenObject(fileData)];
      }

      // 🔥 Append this PDF's rows to global combined array
      combinedRows = combinedRows.concat(finalRows);
    });

    // --- Create ONE sheet ---
    const workbook = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(combinedRows);

    // Autofit columns
    const headers = Object.keys(combinedRows[0]);
    ws["!cols"] = headers.map((key) => ({
      wch: Math.max(key.length, 15),
    }));

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
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

module.exports = convert;
