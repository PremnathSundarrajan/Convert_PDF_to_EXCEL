const flattenObject = require("../utils/flattenObject");
const unwindAndFlatten = require("../utils/unwindAndFlatten");
const resultsFunc = require("../utils/results");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const jobManager = require("../utils/jobManager");

const convert = async (req, res) => {
  console.log("[convert.js] Entered 'convert' function.");
  const jobId = req.query.jobId;
  if (jobId) {
    jobManager.createJob(jobId);
  }

  try {
    if (!req.files || req.files.length === 0) {
      console.log("[convert.js] No files uploaded. Sending 400.");
      if (jobId) jobManager.updateJob(jobId, 0, "No files uploaded");
      return res
        .status(400)
        .json({ success: false, error: "No files uploaded" });
    }

    if (jobId) jobManager.updateJob(jobId, 10, "Request received / upload complete");

    console.log(`[convert.js] ${req.files.length} files uploaded. Calling resultsFunc.`);
    if (jobId) jobManager.updateJob(jobId, 30, "PDF parsing started");

    // Intermediate stages
    if (jobId) {
      setTimeout(() => jobManager.updateJob(jobId, 40, "Text normalization complete"), 500);
      setTimeout(() => jobManager.updateJob(jobId, 70, "AI extraction in progress"), 1000);
    }

    const results = await resultsFunc(req);

    if (jobId) jobManager.updateJob(jobId, 80, "AI extraction complete");

    console.log("[convert.js] Returned from resultsFunc.");

    const allValidJson = results.filter((r) => r && r.success !== false);

    if (!allValidJson.length) {
      if (jobId) jobManager.updateJob(jobId, 0, "Extraction failed");
      return res.status(500).json({
        success: false,
        error: "No valid data extracted",
      });
    }

    if (jobId) jobManager.updateJob(jobId, 90, "Excel generation in progress");

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

    const columnWidths = {};
    const headerSet = new Set();
    combinedRows.forEach((r) => {
      if (r && typeof r === "object") {
        Object.keys(r).forEach((k) => headerSet.add(k));
      }
    });
    headerSet.add("item");
    headerSet.add("material");
    headerSet.add("pcs");
    const headers = Array.from(headerSet);

    headers.forEach((header) => {
      let maxWidth = header.length + 2;
      combinedRows.forEach((row) => {
        if (row[header]) {
          const cellLength = String(row[header]).length + 2;
          maxWidth = Math.max(maxWidth, cellLength);
        }
      });

      let maxAllowed = 40;
      if (header.toLowerCase() === "material") {
        maxAllowed = 60;
      } else if (header.toLowerCase() === "item") {
        maxAllowed = 55;
      } else if (header.toLowerCase() === "notes") {
        maxAllowed = 55;
      } else if (header.toLowerCase() === "order" || header.toLowerCase() === "client") {
        maxAllowed = 30;
      }
      columnWidths[header] = Math.max(12, Math.min(maxWidth, maxAllowed));
    });

    ws["!cols"] = headers.map((header) => ({ wch: columnWidths[header] }));
    const rowHeights = [];
    combinedRows.forEach((row, idx) => {
      rowHeights[idx] = Object.keys(row).length === 0 ? { hpx: 15 } : { hpx: 25 };
    });
    ws["!rows"] = rowHeights;

    XLSX.utils.book_append_sheet(workbook, ws, "Combined_Data");

    const dateStr = new Date().toISOString().split('T')[0];
    const outputFile = `Converted_consignment_${dateStr}.xlsx`;
    const outputPath = path.join(__dirname, outputFile);

    XLSX.writeFile(workbook, outputPath);

    if (jobId) jobManager.updateJob(jobId, 100, "File ready for download");

    res.download(outputPath, outputFile, () => {
      try {
        fs.unlinkSync(outputPath);
        if (jobId) {
          // Give client time to see 100% before cleanup if needed, 
          // but SSE listener already handles it.
          jobManager.deleteJob(jobId);
        }
      } catch { }
    });
  } catch (error) {
    if (jobId) jobManager.updateJob(jobId, 0, "Error: " + error.message);
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

    return res.json({ success: true, count: combinedRows.length, combinedRows });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { convert, convertDebug };
