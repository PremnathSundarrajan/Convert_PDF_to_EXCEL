#!/usr/bin/env node
/**
 * Debug: Show extracted tokens before assignColumns processes them
 */

const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const extractJsonFromPDF = require("./utils/extractJsonFromPDF");
const sanitizeAIResponse = require("./utils/sanitizeAIResponse");
const tryFixJson = require("./utils/tryFixJson");
const normalizePdfText = require("./utils/normalizePdfText");

async function debugTokenExtraction(pdfPath) {
  try {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`DEBUG: Token Extraction from ${path.basename(pdfPath)}`);
    console.log(`${"=".repeat(80)}\n`);

    // Step 1: Read PDF
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfData = await pdfParse(pdfBuffer);
    console.log(
      `PDF Text (first 500 chars):\n${pdfData.text.substring(0, 500)}\n`
    );
    console.log(`${"─".repeat(80)}\n`);

    // Step 2: Normalize
    const normalizedText = normalizePdfText(pdfData.text);
    console.log(
      `Normalized Text (first 500 chars):\n${normalizedText.substring(
        0,
        500
      )}\n`
    );
    console.log(`${"─".repeat(80)}\n`);

    // Step 3: Extract JSON
    let rawJson = await extractJsonFromPDF(normalizedText);
    rawJson = sanitizeAIResponse(rawJson);

    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch (e) {
      parsed = JSON.parse(tryFixJson(rawJson));
    }

    console.log(
      `Extracted JSON (formatted):\n${JSON.stringify(parsed, null, 2)}\n`
    );
    console.log(`${"─".repeat(80)}\n`);

    // Step 4: Show tokens for each row
    if (Array.isArray(parsed.rows)) {
      console.log(`TOKENS for each row:\n`);
      parsed.rows.forEach((row, idx) => {
        console.log(`Row ${idx + 1}: ${JSON.stringify(row.tokens)}`);

        // Analyze each token
        console.log(`  Analysis:`);
        row.tokens.forEach((token, tokenIdx) => {
          const isNumeric = /^\d+$/.test(token);
          const isDecimal = /^\d+\.\d+$/.test(token);
          const isRange = /^\d+-\d+$/.test(token);
          const type = isDecimal
            ? "DECIMAL"
            : isRange
            ? "RANGE"
            : isNumeric
            ? "NUMBER"
            : "TEXT";
          console.log(`    [${tokenIdx}] "${token}" (${type})`);
        });
        console.log();
      });
    }

    console.log(`${"=".repeat(80)}\n`);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    console.error(err);
  }
}

// Find PDFs
const uploadDirs = ["./uploads", "../uploads", "../../uploads"];
async function main() {
  for (const dir of uploadDirs) {
    if (fs.existsSync(dir)) {
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith(".pdf"))
        .slice(0, 1);

      if (files.length > 0) {
        const fullPath = path.join(dir, files[0]);
        await debugTokenExtraction(fullPath);
        return;
      }
    }
  }
  console.log("No PDF files found");
}

main().catch(console.error);
