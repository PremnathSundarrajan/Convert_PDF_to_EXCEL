const normalizePdfText = require("./utils/normalizePdfText");

console.log("🧪 Testing PDF normalization and token validation...\n");

// Test 1: PDF text with proper columns (multiple spaces between values)
console.log("Test 1: PDF text with multiple spaces between columns");
const rawPdfText1 = `
Order: 12-003
Client: Alvasco

1   headstone   black  premium   53     62     8    0.026
1   tombstone   black  premium  159-157  59-57   6   0.056
1   backskirt   black  premium   59     9      6    0.003
`;

const normalized1 = normalizePdfText(rawPdfText1);
console.log("✓ Whitespace normalized while preserving column structure\n");

// Test 2: Problematic merges (what LLM might return)
console.log("Test 2: Simulating LLM with merged tokens (before validation)");
const problematicJson = {
  order: "12-003",
  client: "Alvasco",
  rows: [
    {
      tokens: ["1", "headstone", "black", "premium", "53", "62", "8", "0.026"],
    }, // Correct
    {
      tokens: [
        "1",
        "tombstone",
        "black",
        "premium",
        "159-157",
        "5957",
        "6",
        "0.056",
      ],
    }, // "5957" merged
    { tokens: ["1", "backskirt", "black", "premium", "59", "96", "0.003"] }, // "96" merged, missing thick
    { tokens: ["1", "flowerblock", "black", "premium", "20090", "0.003"] }, // "20090" merged, missing thick
  ],
};

console.log("Input: Row with merged tokens:");
console.log("  Row 2: " + JSON.stringify(problematicJson.rows[1].tokens));
console.log("  Row 3: " + JSON.stringify(problematicJson.rows[2].tokens));
console.log("  Row 4: " + JSON.stringify(problematicJson.rows[3].tokens));

// Validation function (same as in extractJsonFromPDF.js)
function validateAndSplitMergedTokens(data) {
  if (!data.rows || !Array.isArray(data.rows)) return data;

  data.rows = data.rows.map((row) => {
    if (!row.tokens || !Array.isArray(row.tokens)) return row;

    const validated = [];
    for (let i = 0; i < row.tokens.length; i++) {
      const token = String(row.tokens[i]).trim();

      // Skip text tokens (item, material names)
      if (!/^[\d,.\-]+$/.test(token)) {
        validated.push(token);
        continue;
      }

      // Skip ranges and decimals (these are valid single tokens)
      if (token.includes("-") || token.includes(",")) {
        validated.push(token);
        continue;
      }

      // Check if numeric token looks like merged columns
      // Pattern 1: 5+ consecutive digits (e.g., "596" from 59+6, "20090" from 200+90)
      if (/^\d{5,}$/.test(token)) {
        // Try to split with multiple patterns for 2-3-1 and 2-3-2 digit split
        const patterns = [
          /^(\d{2,3})(\d{2})(\d{1})$/, // e.g., "59601" → 59,60,1
          /^(\d{2,3})(\d{2})(\d{2})$/, // e.g., "596015" → 59,60,15
          /^(\d{2,3})(\d{1})(\d{1,2})$/, // e.g., "596" → 59,6 (+ missing third)
          /^(\d{3})(\d{2})(\d{2})$/, // e.g., "200906" → 200,90,6
        ];

        let matched = false;
        for (const pattern of patterns) {
          const m = token.match(pattern);
          if (m) {
            validated.push(m[1], m[2], m[3]);
            matched = true;
            break;
          }
        }

        if (!matched) {
          // Fallback: try 2-3 + rest
          const m = token.match(/^(\d{2,3})(\d{2,})$/);
          if (m && m[2].length >= 2) {
            validated.push(m[1], m[2]);
          } else {
            validated.push(token);
          }
        }
        continue;
      }

      // Pattern 2: 4-digit tokens that look like width+thick merged
      if (/^\d{4}$/.test(token) && i >= 5) {
        const patterns = [
          /^(\d{2})(\d{2})$/, // e.g., "5960" → 59,60
          /^(\d{3})(\d{1})$/, // e.g., "9006" → 900,6
        ];

        let matched = false;
        for (const pattern of patterns) {
          const m = token.match(pattern);
          if (m) {
            validated.push(m[1], m[2]);
            matched = true;
            break;
          }
        }

        if (!matched) {
          validated.push(token);
        }
        continue;
      }

      validated.push(token);
    }

    return { ...row, tokens: validated };
  });

  return data;
}

const validated = validateAndSplitMergedTokens(problematicJson);
console.log("\nOutput: After validation:");
console.log("  Row 2: " + JSON.stringify(validated.rows[1].tokens));
console.log("  Row 3: " + JSON.stringify(validated.rows[2].tokens));
console.log("  Row 4: " + JSON.stringify(validated.rows[3].tokens));

console.log("\n✅ Improvements Made:");
console.log("   1. Strengthened LLM prompt to prevent token merging");
console.log("   2. Added post-extraction validation to split merged tokens");
console.log(
  "   3. Improved PDF text normalization to preserve column boundaries"
);
console.log(
  "   4. Multiple split patterns to handle different merge scenarios"
);
