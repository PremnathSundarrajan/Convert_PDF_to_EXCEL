#!/usr/bin/env node
/**
 * Integration test for refactored assignColumns with the full pipeline
 * Tests: PDF parsing → LLM extraction → assignColumns → Excel output
 */

const fs = require("fs");
const path = require("path");
const extractJsonFromPDF = require("./utils/extractJsonFromPDF");
const sanitizeAIResponse = require("./utils/sanitizeAIResponse");
const tryFixJson = require("./utils/tryFixJson");
const assignColumns = require("./utils/assignColumns_refactored");
const normalizePdfText = require("./utils/normalizePdfText");
const pdfParse = require("pdf-parse");

/**
 * Simulate the results.js pipeline
 */
async function testFullPipeline(pdfPath) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`Testing PDF: ${path.basename(pdfPath)}`);
  console.log(`${"=".repeat(70)}\n`);

  try {
    // Step 1: Read PDF
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfData = await pdfParse(pdfBuffer);
    console.log(`✅ PDF parsed: ${pdfData.numpages} pages`);

    // Step 2: Normalize PDF text
    const normalizedText = normalizePdfText(pdfData.text);
    console.log(`✅ Text normalized\n`);

    // Step 3: Extract JSON from PDF using LLM
    console.log(`Extracting JSON from PDF...`);
    let rawJson = await extractJsonFromPDF(normalizedText);
    rawJson = sanitizeAIResponse(rawJson);

    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch (e) {
      console.warn("⚠️  JSON repair triggered");
      parsed = JSON.parse(tryFixJson(rawJson));
    }

    console.log(`✅ LLM extraction complete\n`);

    // Step 4: Extract order and client
    const order = parsed.order || "N/A";
    const client = parsed.client || "N/A";
    console.log(`Order: ${order}`);
    console.log(`Client: ${client}\n`);

    // Step 5: Process rows based on format
    let material_details = [];
    const NOTE_WORDS = new Set(["with", "punched", "line"]);

    if (Array.isArray(parsed.material_details)) {
      // New format: LLM already assigned columns
      console.log(`ℹ️  Using LLM-assigned columns (New Prompt Format)\n`);
      material_details = parsed.material_details.map((row) => ({
        ...row,
        order: order,
        client: client,
      }));
    } else if (Array.isArray(parsed.rows) && parsed.rows.length > 0) {
      // Old format: tokens → assignColumns
      console.log(`ℹ️  Using token-based assignment (Old Prompt Format)\n`);

      const filteredRows = parsed.rows.map((r) => ({
        tokens: r.tokens.filter((t) => !NOTE_WORDS.has(t.toLowerCase())),
      }));

      for (let i = 0; i < filteredRows.length; i++) {
        const r = filteredRows[i];
        try {
          const result = assignColumns(r.tokens, order, client);
          material_details.push(result);
          console.log(
            `  [Row ${i + 1}] ✅ ${result.item} (${result.pcs} pcs) - L:${
              result.length
            } W:${result.width} T:${result.thick} m3:${result.m3}`
          );
        } catch (e) {
          console.log(`  [Row ${i + 1}] ⚠️  Skipped: ${e.message}`);
        }
      }
    } else {
      throw new Error("No valid rows/material_details in extracted JSON");
    }

    // Step 6: Summary
    console.log(`\n${"=".repeat(70)}`);
    console.log(`✅ PIPELINE COMPLETE`);
    console.log(`   Total rows processed: ${material_details.length}`);
    console.log(`${"=".repeat(70)}\n`);

    // Print sample output
    if (material_details.length > 0) {
      console.log(`Sample row output:`);
      console.log(JSON.stringify(material_details[0], null, 2));
    }

    return {
      success: true,
      order,
      client,
      rowCount: material_details.length,
      rows: material_details,
    };
  } catch (err) {
    console.error(`❌ ERROR: ${err.message}`);
    return {
      success: false,
      error: err.message,
    };
  }
}

// Find and test PDFs
const uploadDirs = ["./uploads", "../uploads", "../../uploads"];

async function main() {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`INTEGRATION TEST: Full Pipeline with Refactored assignColumns`);
  console.log(`${"=".repeat(70)}`);

  let foundPdf = false;

  for (const dir of uploadDirs) {
    if (fs.existsSync(dir)) {
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith(".pdf"))
        .slice(0, 1); // Test first PDF only

      if (files.length > 0) {
        for (const file of files) {
          const fullPath = path.join(dir, file);
          await testFullPipeline(fullPath);
          foundPdf = true;
        }
        break;
      }
    }
  }

  if (!foundPdf) {
    console.log(`ℹ️  No PDF files found in upload directories`);
    console.log(`   Tested directories: ${uploadDirs.join(", ")}`);
  }
}

main().catch(console.error);
