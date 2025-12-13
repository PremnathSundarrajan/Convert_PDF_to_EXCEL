const extractJsonFromPDF = require("./extractJsonFromPDF");
const sanitizeAIResponse = require("./sanitizeAIResponse");
const tryFixJson = require("./tryFixJson");
const assignColumns = require("./assignColumns");
const normalizePdfText = require("./normalizePdfText");

const fs = require("fs");
const pdfParse = require("pdf-parse");

const NOTE_WORDS = new Set(["with", "punched", "line"]);

const resultsFunc = async (req) => {
  return await Promise.all(
    req.files.map(async (file) => {
      try {
        const pdfBuffer = fs.readFileSync(file.path);
        const pdfData = await pdfParse(pdfBuffer);

        // ✅ ONE AND ONLY numeric repair
        const normalizedText = normalizePdfText(pdfData.text);

        let rawJson = await extractJsonFromPDF(normalizedText);
        rawJson = sanitizeAIResponse(rawJson);

        let parsed;
        try {
          parsed = JSON.parse(rawJson);
        } catch (e) {
          console.warn("JSON repair triggered for:", file.originalname);
          parsed = JSON.parse(tryFixJson(rawJson));
        }

        // Check for new prompt format (Direct material_details)
        if (Array.isArray(parsed.material_details)) {
          if (parsed.material_details.length === 0) {
            throw new Error("No valid material rows extracted (material_details empty)");
          }
          console.log(`✅ Using LLM-assigned columns (New Prompt)`);
          // We trust the LLM's assignment primarily, but maybe we want to run normalization?
          // For now, pass it through.
        }
        else if (Array.isArray(parsed.rows) && parsed.rows.length > 0) {
          // Old Prompt Format (Tokens -> assignColumns manual logic)
          // Remove note words ONLY
          parsed.rows = parsed.rows.map((r) => ({
            tokens: r.tokens.filter((t) => !NOTE_WORDS.has(t.toLowerCase())),
          }));

          parsed.material_details = [];

          for (const r of parsed.rows) {
            try {
              const result = assignColumns(r.tokens);
              parsed.material_details.push(result);
              console.log(`✅ Row OK: ${result.item} - L:${result.length} W:${result.width} T:${result.thick}`);
            } catch (e) {
              console.warn("❌ Row skipped - Reason:", e.message);
              console.warn("   Tokens were:", JSON.stringify(r.tokens));
            }
          }

          if (parsed.material_details.length === 0) {
            throw new Error("No valid material rows extracted from PDF");
          }

          delete parsed.rows;
        } else {
          throw new Error("No valid rows/material_details extracted");
        }

        console.log(
          `✅ Successfully extracted ${parsed.material_details.length} rows from ${file.originalname}`
        );

        return parsed;
      } catch (err) {
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
