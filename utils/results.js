const extractJsonFromPDF = require("./extractJsonFromPDF");
const sanitizeAIResponse = require("./sanitizeAIResponse");
const tryFixJson = require("./tryFixJson");
const assignColumns = require("./assignColumns_refactored");
const normalizePdfText = require("./normalizePdfText");

const fs = require("fs");
const pdfParse = require("pdf-parse");

const NOTE_WORDS = new Set(["with", "punched", "line"]);

function validateAndSplitMergedTokens(data) {
  const normalize = (v) => {
    if (v === null || v === undefined) return "";
    let s = String(v).trim();
    s = s.replace(/,/g, ".");
    s = s.replace(/\s*-\s*/g, "-");
    return s;
  };

  const isZero = (val) => {
    if (val === null || val === undefined) return false;
    const s = String(val).trim().replace(/,/g, '.');
    return parseFloat(s) === 0;
  }

  const isValidThickness = (s) => {
    if (!s || isZero(s)) return false;
    if (s.includes("-")) {
      const parts = s.split("-").map((p) => p.trim());
      return parts.every((p) => /^\d{1,2}$/.test(p) && !isZero(p));
    }
    return /^\d{1,2}$/.test(s);
  };

  const isValidLengthWidth = (s) => {
    if (!s || isZero(s)) return false;
    if (s.includes("-")) {
      const parts = s.split("-").map((p) => p.trim());
      return parts.every((p) => /^\d{1,3}$/.test(p) && !isZero(p));
    }
    if (/^[\d.]+$/.test(s)) {
      const clean = s.replace(/\./g, "");
      return /^\d{1,3}$/.test(clean) && !isZero(s);
    }
    return false;
  };
  
  const isM3 = (t) => /^0[.,]\d+$/i.test(String(t).trim()) && !isZero(t);
  const isPCS = (t) => /^\d{1,2}$/.test(String(t).trim()) && !isZero(t);
  const isNumericCandidate = (t) => {
    if (t === null || t === undefined || isZero(t)) return false;
    const s = String(t).trim();
    if (/^\d+$/.test(s)) return true; // integer
    if (/^\d+[.,]\d+$/.test(s)) return true; // decimal
    if (/^\d+\s*-\s*\d+$/.test(s)) return true; // range
    return false;
  };

  // Handle material_details (direct LLM extraction) -> normalize & validate only
  if (data.material_details && Array.isArray(data.material_details)) {
    data.material_details = data.material_details.map((row) => {
      row.length = normalize(row.length);
      row.width = normalize(row.width);
      row.thick = normalize(row.thick);

      if (!isValidLengthWidth(row.length)) row.length = "";
      if (!isValidLengthWidth(row.width)) row.width = "";
      if (!isValidThickness(row.thick)) row.thick = "";

      if (!row.length || !row.width || !row.thick || !row.pcs || !row.item || !row.material || !row.m3) return null;
      if (isZero(row.pcs) || isZero(row.m3)) return null;

      return row;
    }).filter(Boolean);

    return data;
  }

  // Handle rows/tokens format
  if (!data.rows || !Array.isArray(data.rows)) return data;

  data.rows = data.rows.map((row) => {
    if (!row.tokens || !Array.isArray(row.tokens) || row.tokens.some(t => t === null || t === undefined || t === '')) return null;

    const tokens = row.tokens.map((t) => String(t).trim());

    const pcsIndex = tokens.length > 0 && isPCS(tokens[0]) ? 0 : -1;
    if (pcsIndex === -1) return null;

    let m3Index = -1;
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (isM3(tokens[i])) {
        m3Index = i;
        break;
      }
    }
    if (m3Index === -1) return null;

    const numericCandidates = [];
    for (let i = 0; i < tokens.length; i++) {
      if (i === pcsIndex) continue;
      if (i === m3Index) continue;
      if (isNumericCandidate(tokens[i])) numericCandidates.push(tokens[i]);
    }

    const assign = { length: "", width: "", thick: "" };
    const n = numericCandidates.length;
    if (n === 1) {
      assign.length = normalize(numericCandidates[0]);
    } else if (n === 2) {
      assign.length = normalize(numericCandidates[0]);
      assign.thick = normalize(numericCandidates[1]);
    } else if (n >= 3) {
      const lastThree = numericCandidates.slice(-3);
      assign.length = normalize(lastThree[0]);
      assign.width = normalize(lastThree[1]);
      assign.thick = normalize(lastThree[2]);
    }

    if (!validateThickness(assign.thick)) return null;
    if (!validateLengthWidth(assign.width)) return null;
    if (!validateLengthWidth(assign.length)) return null;

    return { ...row, parsed_dimensions: assign };
  }).filter(Boolean);

  return data;
}

// Sanitize material_details rows returned directly by LLM
// Fix common merged width+thick cases where width may contain thick appended
function sanitizeMaterialDetails(rows) {
  return rows.map((r) => {
    const row = { ...r };
    // Normalize numeric strings for checks
    const widthRaw = row.width ? String(row.width).trim() : '';
    const thickRaw = row.thick ? String(row.thick).trim() : '';

    // If thick missing but width looks like merged W+T (digits only), try split
    if ((!thickRaw || thickRaw === '') && /^\d{2,4}$/.test(widthRaw)) {
      const digits = widthRaw.replace(/\D/g, '');
      // Try last 1 digit as thick
      const cThick1 = digits.slice(-1);
      const cWidth1 = digits.slice(0, -1);
      if (cWidth1.length >= 1 && cWidth1.length <= 3 && /^\d{1,3}$/.test(cWidth1) && /^\d{1,2}$/.test(cThick1)) {
        // Thick must be between 1 and 99 and width >=6 (business rule)
        const thickVal = parseInt(cThick1, 10);
        const widthVal = parseInt(cWidth1, 10);
        if (thickVal >= 1 && thickVal <= 99 && widthVal >= 1) {
          row.width = cWidth1;
          row.thick = cThick1;
          return row;
        }
      }

      // Try last 2 digits as thick
      const cThick2 = digits.slice(-2);
      const cWidth2 = digits.slice(0, -2);
      if (cWidth2.length >= 1 && cWidth2.length <= 3 && /^\d{1,3}$/.test(cWidth2) && /^\d{1,2}$/.test(cThick2)) {
        const thickVal = parseInt(cThick2, 10);
        const widthVal = parseInt(cWidth2, 10);
        if (thickVal >= 1 && thickVal <= 99 && widthVal >= 1) {
          row.width = cWidth2;
          row.thick = cThick2;
          return row;
        }
      }
    }

    // If both present and it looks like width duplicated e.g., width='66' thick='6' -> shrink width
    if (widthRaw && thickRaw && /^\d{2}$/.test(widthRaw) && /^\d{1,2}$/.test(thickRaw)) {
      if (widthRaw.endsWith(thickRaw) && widthRaw.length === thickRaw.length + 1) {
        row.width = widthRaw.slice(0, widthRaw.length - thickRaw.length);
      }
    }

    return row;
  });
}

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

        parsed = validateAndSplitMergedTokens(parsed);

        // Extract order and client if present
        const order = parsed.order || null;
        const client = parsed.client || null;

        // Check for new prompt format (Direct material_details)
        if (Array.isArray(parsed.material_details)) {
          if (parsed.material_details.length === 0) {
            throw new Error(
              "No valid material rows extracted (material_details empty)"
            );
          }
          console.log(`✅ Using LLM-assigned columns (New Prompt)`);
          // Associate order and client with each row
          parsed.material_details = parsed.material_details.map((row) => ({
            ...row,
            order: order,
            client: client,
          }));
          // NOTE: do NOT apply heuristic splitting here. `extractJsonFromPDF` now returns
          // normalized and validated values and rows may include `parsed_dimensions` for strict cases.
        } else if (Array.isArray(parsed.rows) && parsed.rows.length > 0) {
          // Old Prompt Format (Tokens -> assignColumns manual logic)
          // Remove note words ONLY
          parsed.rows = parsed.rows.map((r) => ({
            tokens: r.tokens.filter((t) => !NOTE_WORDS.has(t.toLowerCase())),
          }));

          parsed.material_details = [];

          for (const r of parsed.rows) {
            try {
              // If `parsed_dimensions` is available (produced by extractJsonFromPDF), use it strictly.
              if (r.parsed_dimensions) {
                const pd = r.parsed_dimensions;
                // Reconstruct pcs and m3 and textual item/material without altering token order
                const toks = r.tokens.map(t => String(t).trim());
                // pcs is first token if 1-2 digit integer
                const pcs = (toks.length > 0 && /^\d{1,2}$/.test(toks[0])) ? toks[0] : "";
                // find m3 index
                let m3 = "";
                if (toks.length > 0 && /^0[.,]\d+$/.test(toks[toks.length-1])) {
                  m3 = toks[toks.length-1];
                }

                // find first numeric token index (exclude pcs and m3)
                const startIdx = pcs ? 1 : 0;
                let firstNumIdx = toks.length;
                for (let i = startIdx; i < toks.length; i++) {
                  if (i === toks.length -1 && m3) break; // don't consider m3
                  const s = toks[i];
                  if (/^\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?$/.test(s)) { firstNumIdx = i; break; }
                }

                const itemMaterialTokens = toks.slice(startIdx, firstNumIdx);
                let item = "";
                let material = "";
                if (itemMaterialTokens.length > 0) {
                  item = itemMaterialTokens[0];
                  if (itemMaterialTokens.length > 1) material = itemMaterialTokens.slice(1).join(' ');
                }

                const result = {
                  order: order || "",
                  client: client || "",
                  pcs: pcs,
                  item: item || "",
                  material: material || "",
                  length: pd.length || "",
                  width: pd.width || "",
                  thick: pd.thick || "",
                  m3: m3 || "",
                };

                parsed.material_details.push(result);
                console.log(`✅ Row OK (strict): ${result.item} - L:${result.length} W:${result.width} T:${result.thick}`);
              } else {
                const result = assignColumns(r.tokens, order, client);
                parsed.material_details.push(result);
                console.log(
                  `✅ Row OK: ${result.item} - L:${result.length} W:${result.width} T:${result.thick}`
                );
              }
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
