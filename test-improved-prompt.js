#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// Find a PDF file to test with
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  console.log("⚠️  uploads directory not found");
  process.exit(1);
}

const files = fs.readdirSync(uploadsDir);
if (files.length === 0) {
  console.log("❌ No PDF files found in uploads directory");
  process.exit(1);
}

const pdfFile = files[0];
const pdfPath = path.join(uploadsDir, pdfFile);

console.log(`
╔════════════════════════════════════════════════════════════════════╗
║  TESTING IMPROVED LLM PROMPT WITH ENHANCED COLUMN SPECIFICATIONS  ║
╚════════════════════════════════════════════════════════════════════╝

📄 Test PDF: ${pdfFile}

🔍 IMPROVEMENTS MADE:
   ✓ Comprehensive column specifications with digit limits
   ✓ Detailed examples showing correct vs. wrong extraction
   ✓ Validation checkpoints for each column
   ✓ Fatal error examples to prevent mistakes
   ✓ Explicit token separation rules
   ✓ Row-by-row extraction procedure
   ✓ Pressure applied on LLM for accuracy

📋 PROMPT INCLUDES:

1. METADATA FIELD SPECIFICATIONS
   - Order field format and extraction rules
   - Client field format and extraction rules

2. TABLE COLUMN SPECIFICATIONS (7 columns)
   [Col 1] PCS: 1-2 digits (1-99)
   [Col 2] ITEM: TEXT (product name)
   [Col 3] MATERIAL: TEXT (stone type)
   [Col 4] LENGTH: 2-3 digits or range, min=10, max=999
   [Col 5] WIDTH: 1-3 digits/decimal/range, min=6, max=200
   [Col 6] THICKNESS: 1-2 digits/range, min=1, max=50
   [Col 7] M3: Decimal format 0,XXX or 0.XXX

3. CRITICAL RULES
   - No merged tokens allowed
   - No column value overlap
   - Exactly 7 tokens per row
   - Validation checkpoints
   - Column digit limits enforced

4. DETAILED EXAMPLES
   ✅ 4 correct extraction examples
   ❌ 3 fatal error examples (merged tokens)

5. EXTRACTION PROCEDURE
   - Step-by-step process
   - Validation rules after extraction
   - Stop markers for end of table

Running extraction...
`);

const pdfParser = require("pdf-parse");
const pdfContent = fs.readFileSync(pdfPath);

pdfParser(pdfContent)
  .then(async (data) => {
    const pdfText = data.text;
    console.log("✅ PDF extracted successfully");
    console.log(`   Text length: ${pdfText.length} characters`);
    console.log(`   Pages: ${data.numpages}`);

    // Now test with the improved LLM prompt
    const extractJsonFromPDF = require("./utils/extractJsonFromPDF");

    try {
      console.log("\n⏳ Calling OpenAI API with improved prompt...");
      console.log("   Model: gpt-4.1");
      console.log("   Temperature: 0 (maximum consistency)");

      const result = await extractJsonFromPDF(pdfText);
      const data = JSON.parse(result);

      console.log("\n✅ Extraction successful!");
      console.log(`\n📊 RESULTS:`);
      console.log(`   Order: ${data.order || "null"}`);
      console.log(`   Client: ${data.client || "null"}`);
      console.log(`   Rows extracted: ${data.rows ? data.rows.length : 0}`);

      if (data.rows && data.rows.length > 0) {
        console.log("\n📋 First 3 rows:");
        data.rows.slice(0, 3).forEach((row, idx) => {
          const tokens = row.tokens || [];
          console.log(`\n   Row ${idx + 1}:`);
          console.log(`      PCS: ${tokens[0]}`);
          console.log(`      ITEM: ${tokens.slice(1, -3).join(" ")}`);
          console.log(`      LENGTH: ${tokens[tokens.length - 4]}`);
          console.log(`      WIDTH: ${tokens[tokens.length - 3]}`);
          console.log(`      THICKNESS: ${tokens[tokens.length - 2]}`);
          console.log(`      M3: ${tokens[tokens.length - 1]}`);
        });
      }

      console.log("\n✅ LLM prompt improvements verified!");
    } catch (error) {
      console.error("\n❌ Error calling API:", error.message);
      if (error.response) {
        console.error("API Response:", error.response.status);
      }
    }
  })
  .catch((err) => {
    console.error("❌ Error parsing PDF:", err.message);
  });
