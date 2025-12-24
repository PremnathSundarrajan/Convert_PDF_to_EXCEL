const extractJsonFromPDF = require("./extractJsonFromPDF");
const sanitizeAIResponse = require("./sanitizeAIResponse");
const tryFixJson = require("./tryFixJson");
const normalizePdfText = require("./normalizePdfText");
const fs = require("fs");
const pdfParse = require("pdf-parse");

/**
 * Custom renderer for pdf-parse to preserve column alignment and avoid merging.
 */
function customRender(pageData) {
  let renderOptions = { normalizeWhitespace: true, disableCombineTextItems: false };
  return pageData.getTextContent(renderOptions).then(function (textContent) {
    let lastY, text = '';
    for (let item of textContent.items) {
      // transform[5] is the Y coordinate. If it changes, it's a new line.
      if (lastY == item.transform[5] || !lastY) {
        text += ' ' + item.str;
      } else {
        text += '\n' + item.str;
      }
      lastY = item.transform[5];
    }
    return text;
  });
}

/**
 * Extract material from PDF header dynamically
 */
function extractHeaderMaterial(text) {
  const lines = text.split("\n");
  for (const line of lines) {
    const match = line.match(/\bmaterial\s+([a-zA-Z ]+)/i);
    if (match && match[1]) {
      return match[1].trim().toLowerCase();
    }
  }
  return "";
}

/**
 * Normalize dimension values (comma to dot, trim)
 */
function normalizeDimension(val) {
  if (!val) return "";
  return String(val).replace(/,/g, ".").trim();
}

/**
 * Main processing function for standard invoices.
 */
const resultsFunc = async (req) => {
  console.log("[results.js] Entered 'resultsFunc'.");

  return await Promise.all(
    req.files.map(async (file) => {
      console.log(`[results.js] Processing file: ${file.originalname}`);

      try {
        // 1️⃣ Read PDF
        const pdfBuffer = fs.readFileSync(file.path);

        // 2️⃣ Parse PDF with Custom Render (CRITICAL for spacing)
        const pdfData = await pdfParse(pdfBuffer, { pagerender: customRender });

        // 3️⃣ Normalize and sanitize text
        const normalizedText = normalizePdfText(pdfData.text);

        // 4️⃣ Extract header info as fallback
        const headerMaterial = extractHeaderMaterial(normalizedText);

        // 5️⃣ Call GPT with Structured Prompt
        let rawJson = await extractJsonFromPDF(normalizedText);
        rawJson = sanitizeAIResponse(rawJson);

        // 6️⃣ Parse JSON (with repair if needed)
        let parsed;
        try {
          parsed = JSON.parse(rawJson);
        } catch {
          parsed = JSON.parse(tryFixJson(rawJson));
        }

        const order = parsed.order || "";
        const client = parsed.client || "";

        // 7️⃣ Process material_details
        if (Array.isArray(parsed.material_details)) {
          console.log(`✅ Extracted ${parsed.material_details.length} rows from GPT.`);

          parsed.material_details = parsed.material_details.map((row) => {
            return {
              order: order,
              client: client,
              pcs: String(row.pcs || "").trim(),
              item: String(row.item || "").trim(),
              // Use GPT's material or fallback to header material
              material: (row.material && row.material.toLowerCase() !== 'null') ? String(row.material).trim() : headerMaterial,
              length: normalizeDimension(row.length),
              width: normalizeDimension(row.width),
              thick: normalizeDimension(row.thick),
              m3: normalizeDimension(row.m3)
            };
          });
        } else {
          throw new Error("GPT did not return 'material_details' array");
        }

        if (parsed.material_details.length === 0) {
          throw new Error("No material rows were found in the PDF");
        }

        return parsed;

      } catch (err) {
        console.error("❌ Extraction Failed for:", file.originalname, err.message);
        return {
          file: file.originalname,
          success: false,
          error: err.message,
        };
      } finally {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      }
    })
  );
};

module.exports = resultsFunc;
