#!/usr/bin/env node
/**
 * Direct test of extractJsonFromPDF with debug logging
 */

const fs = require("fs");
const path = require("path");
const extractJsonFromPDF = require("./utils/extractJsonFromPDF");
const normalizePdfText = require("./utils/normalizePdfText");
const pdfParse = require("pdf-parse");

async function testExtraction() {
  try {
    // Find a test PDF
    const uploadDirs = ["./uploads", "../uploads"];
    let pdfPath = null;

    for (const dir of uploadDirs) {
      if (fs.existsSync(dir)) {
        const files = fs
          .readdirSync(dir)
          .filter((f) => f.toLowerCase().endsWith(".pdf"));
        if (files.length > 0) {
          pdfPath = path.join(dir, files[0]);
          break;
        }
      }
    }

    if (!pdfPath) {
      console.log("No PDF found");
      return;
    }

    console.log(`Testing PDF: ${path.basename(pdfPath)}\n`);

    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfData = await pdfParse(pdfBuffer);
    const normalizedText = normalizePdfText(pdfData.text);

    console.log("Calling extractJsonFromPDF...\n");
    const result = await extractJsonFromPDF(normalizedText);

    // Parse and show
    const parsed = JSON.parse(result);
    if (parsed.rows && parsed.rows.length > 0) {
      console.log("\n=== Final Processed Tokens ===\n");
      parsed.rows.slice(0, 3).forEach((row, idx) => {
        console.log(`Row ${idx + 1}: ${JSON.stringify(row.tokens)}`);
      });
    }
  } catch (err) {
    console.error("Error:", err.message);
  }

  process.exit(0);
}

testExtraction();
