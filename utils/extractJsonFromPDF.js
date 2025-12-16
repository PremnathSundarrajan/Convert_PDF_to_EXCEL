const OpenAI = require("openai");
const dotenv = require("dotenv");
const sanitizeAIResponse = require("./sanitizeAIResponse");
const tryFixJson = require("./tryFixJson");

dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function extractJsonFromPDF(text) {
  const system =
    "You are a precision JSON extraction specialist. Your task is CRITICAL and ACCURACY IS PARAMOUNT. Return ONLY valid JSON. No markdown. No explanations. No comments. Each dimension value MUST be in a separate token. Column values must NEVER be merged. Validate every token against strict column specifications.";

  const prompt = `
🚨 CRITICAL EXTRACTION TASK - MAXIMUM PRECISION REQUIRED 🚨

You are extracting structured data from a material order PDF. Errors in extraction will cause manufacturing mistakes and financial loss. Your accuracy is mission-critical.

═══════════════════════════════════════════════════════════════════
PART 1: METADATA FIELDS (Extract if present)
═══════════════════════════════════════════════════════════════════

1. "order" field:
   - Search: 'order', 'Order', 'ORDER', 'order no', 'order no.', 'order number'
   - Extract the numerical value exactly as shown
   - Example: If PDF shows "order 12-008" → extract "12-008"

2. "client" field:
   - Search: 'client', 'Client', 'CLIENT', 'client name', 'customer'
   - Extract the name exactly
   - Example: If PDF shows "client Miali" → extract "Miali"

If either field is missing, set to null

═══════════════════════════════════════════════════════════════════
PART 2: TABLE ROW EXTRACTION - COLUMN-BY-COLUMN SPECIFICATIONS
═══════════════════════════════════════════════════════════════════

**CRITICAL RULE: No field in any row can be empty, null, or have a value of 0. If a value is missing or invalid according to the column specifications, you MUST discard the entire row and not include it in the JSON output.**

Each material row has EXACTLY 7 columns (in this order):

┌─────┬──────────┬──────────┬────────┬────────┬──────┬────────┐
│ PCS │  ITEM    │ MATERIAL │ LENGTH │ WIDTH  │THICK │  M3    │
├─────┼──────────┼──────────┼────────┼────────┼──────┼────────┤
│ 1-2 │ TEXT     │ TEXT     │ 2-3d/r │ 2-3d/r │1-2d  │decimal │
└─────┴──────────┴──────────┴────────┴────────┴──────┴────────┘

COLUMN SPECIFICATIONS (STRICT REQUIREMENTS):

[COLUMN 1] PCS (pieces/quantity):
  - Type: NUMERIC
  - Format: 1-2 digits only (1, 2, 3, 10, 25, etc.)
  - Range: 1-99
  - Rules: MUST be first token in row. NEVER combine with other values.
  - Examples: "1", "2", "10", "25"
  - ❌ WRONG: "1backskirt", "1h", "12-008"

[COLUMN 2] ITEM (product name):
  - Type: TEXT (1-4 words)
  - Format: Words separated by spaces or hyphens
  - Examples: "headstone", "tombstone", "column", "backskirt", "front-kerb", "side kerbs"
  - Length: Usually 1-3 words
  - Rules: Starts AFTER pcs. Can contain spaces and hyphens. NEVER numeric.
  - ❌ WRONG: Including numbers like "56" or "87" - these are dimensions, not item names

[COLUMN 3] MATERIAL (stone/material type):
  - Type: TEXT (1-3 words typically)
  - Format: Color/type combinations
  - Examples: "black", "premium", "royal impala", "grey", "polished black"
  - Rules: Can be 1-3 words. Comes AFTER item name. NEVER numeric.
  - ❌ WRONG: Including dimensions like "56" or "87"

[COLUMN 4] LENGTH (dimension):
  - Type: NUMERIC, DECIMAL, or RANGE
  - Format: 
    * Simple: 2-3 digits (20, 53, 100, 180, 227, etc.)
    * Decimal: X,Y or XX,Y or XXX,Y format (e.g. 12,3)
    * Range: N-N format (100-90, 159-157, 180-175, etc.)
    * Decimal Range: X,Y-Z format (e.g. 12,3-10)
  - Digit Limits: 
    * Minimum: 10
    * Maximum: 999
    * Range first value: 100-300
    * Range second value: 50-300
  - Rules: ALWAYS a dimension, NEVER text. Third numeric value in row.
  - Must be SEPARATE from width and thickness.
  - Examples: "22", "53", "180", "159-157", "200", "227", "12,3", "12,3-10"
  - ❌ WRONG: "2275" (merged length+width), "56-87" (this is width+thick pattern)

[COLUMN 5] WIDTH (dimension):
  - Type: NUMERIC, DECIMAL, or RANGE
  - Format:
    * Simple: 1-3 digits (9, 15, 30, 62, 87, 90, 106, etc.)
    * Decimal: X,YYY format (63,3 meaning 63.3, etc.)
    * Range: N-N format (59-57, 90-85, etc.)
    * Decimal Range: X,YYY-N format (63,3-10 meaning 63.3-10, 30,5-25 meaning 30.5-25, etc.) ← IMPORTANT!
  - Digit Limits:
    * Minimum: 6
    * Maximum: 200
    * Can have comma decimal (60,026 = 60.026)
  - Rules: Fourth numeric value in row. ALWAYS separate from length and thickness. Range values stay together with hyphen.
  - Examples: "9", "15", "25", "30", "62", "75", "87", "90", "63,3", "59-57", "63,3-10", "30,5-25", "12,3", "12,3-10"
  - ❌ WRONG: "2275" (merged from length), "759" (merged width+thickness), "63,3" + "10" (split - should be "63,3-10")

[COLUMN 6] THICKNESS (dimension):
  - Type: NUMERIC or RANGE (rarely)
  - Format:
    * Simple: 1-2 digits ONLY (6, 8, 10, 15, 25, etc.)
    * Range (rare): N-N format (10-8, 8-6, etc.)
  - Digit Limits:
    * Minimum: 1
    * Maximum: 50
    * If >2 digits: MUST be a range like "10-8"
  - Rules: Fifth numeric value. SMALLEST numeric value. NEVER 3+ digits without hyphen. Pay close attention to ranges like '10-8'; they are valid thickness values and must be extracted.
  - Examples: "6", "8", "10", "15", "25", "10-8"
  - ❌ WRONG: "78" (this is 2 separate values: width=7 + thick=8), "259" (this is width=25 + thick=9)

[COLUMN 7] M3 (cubic meters):
  - Type: DECIMAL
  - Format: 0.XXX (use a period '.' as decimal separator)
  - Range: 0.001 to 1.0
  - Rules: ALWAYS last token. ALWAYS starts with 0 followed by decimal separator.
  - Examples: "0.017", "0.039", "0.026", "0.056", "0.003"
  - ❌ WRONG: "17" (missing leading 0.), "0,017" (uses comma instead of period)

═══════════════════════════════════════════════════════════════════
CRITICAL: TOKEN SEPARATION RULES (MAXIMUM ENFORCEMENT)
═══════════════════════════════════════════════════════════════════

⚠️ MERGED TOKENS ARE FATAL ERRORS - PREVENT AT ALL COSTS ⚠️

Rule 1: NO ADJACENT DIMENSION MERGING
  PDF shows: "22" (length) | "75" (width) | "10-8" (thickness)
  ✅ CORRECT: ["22", "75", "10-8"]
  ❌ FATAL: ["22", "7510-8"] or ["227", "5", "10-8"] or ["2275", "10-8"]

Rule 2: WIDTH AND THICKNESS CANNOT MERGE
  PDF shows: "75" (width) | "10-8" (thickness)
  ✅ CORRECT: ["75", "10-8"]
  ❌ FATAL: ["7510-8"] or ["759"] or ["758"]

Rule 3: LENGTH CANNOT ABSORB WIDTH
  PDF shows: "22" (length) | "75" (width)
  ✅ CORRECT: ["22", "75"]
  ❌ FATAL: ["2275"] or ["227"]

Rule 4: EACH NUMERIC COLUMN = ONE TOKEN
  - Count numeric values: You should find exactly 5 numeric tokens per row
    1. pcs (1-2 digits)
    2. length (2-3 digits or range)
    3. width (1-3 digits, decimal, or range)
    4. thickness (1-2 digits or range)
    5. m3 (0.xxx decimal)

Rule 5: VALIDATION CHECKPOINTS
  After extracting, validate:
  ✓ Does the row have exactly 7 tokens?
  ✓ Is token 1 (pcs) a 1-2 digit number?
  ✓ Is token 4 (length) ≥10?
  ✓ Is token 5 (width) ≥6?
  ✓ Is token 6 (thickness) ≤50?
  ✓ Does token 7 start with 0,X or 0.X?
  If ANY validation fails: SPLIT merged tokens and retry.

═══════════════════════════════════════════════════════════════════
DETAILED EXAMPLES (Study These Carefully)
═══════════════════════════════════════════════════════════════════

✅ CORRECT EXTRACTION 1:
PDF Row: 1  column  royal impala  22  75  10-8  0.017
Tokens:  ["1", "column", "royal", "impala", "22", "75", "10-8", "0.017"]
         [pcs] [item]   [material-1] [material-2] [length] [width] [thickness] [m3]

✅ CORRECT EXTRACTION 2:
PDF Row: 1  headstone  royal impala  56  87  8  0,039
Tokens:  ["1", "headstone", "royal", "impala", "56", "87", "8", "0,039"]

✅ CORRECT EXTRACTION 3:
PDF Row: 1  tombstone left  royal impala  180  25  8  0,036
Tokens:  ["1", "tombstone", "left", "royal", "impala", "180", "25", "8", "0,036"]

❌ FATAL ERROR 1 (merged length+width):
PDF Row: 1  headstone  royal impala  56  87  8  0,039
WRONG:   ["1", "headstone", "royal", "impala", "5687", "8", "0,039"]  ← Only 6 tokens!
         [The "5687" is merged from length(56) + width(87)]
CORRECT: ["1", "headstone", "royal", "impala", "56", "87", "8", "0,039"]

❌ FATAL ERROR 2 (merged width+thickness):
PDF Row: 1  tombstone left  royal impala  180  25  8  0,036
WRONG:   ["1", "tombstone", "left", "royal", "impala", "180", "258", "0,036"]  ← "258" is merged!
CORRECT: ["1", "tombstone", "left", "royal", "impala", "180", "25", "8", "0,036"]

❌ FATAL ERROR 3 (length+width+thickness merged):
PDF Row: 1  column  royal impala  22  75  10-8  0,017
WRONG:   ["1", "column", "royal", "impala", "227510-8", "0,017"]  ← Catastrophic merge!
CORRECT: ["1", "column", "royal", "impala", "22", "75", "10-8", "0,017"]

═══════════════════════════════════════════════════════════════════
EXTRACTION PROCEDURE
═══════════════════════════════════════════════════════════════════

1. SCAN for metadata fields (order, client) - extract these first
2. IDENTIFY row start: Look for numeric 1-2 digits (pcs value)
3. EXTRACT text tokens: item name, material (can be multiple words)
4. EXTRACT numeric columns ONE BY ONE:
   - First numeric after text = LENGTH (should be ≥10)
   - Next numeric = WIDTH (should be ≥6)
   - Next numeric = THICKNESS (should be ≤50)
   - Last numeric = M3 (should start with 0, or 0.)
5. VALIDATE token count = 7 (never more, never less)
6. VALIDATE each column against specifications above
7. STOP row extraction at: TOTAL, SUBTOTAL, Finish:, signature, notes

═══════════════════════════════════════════════════════════════════
OUTPUT FORMAT (STRICT JSON ONLY)
═══════════════════════════════════════════════════════════════════

RETURN ONLY THIS JSON STRUCTURE (no markdown, no explanation):

{
  "order": "12-008",
  "client": "Miali",
  "material_details": [
    { "pcs": "1", "item": "column", "material": "royal impala", "length": "22", "width": "75", "thick": "10-8", "m3": "0.017" },
    { "pcs": "1", "item": "headstone", "material": "royal impala", "length": "56", "width": "87", "thick": "8", "m3": "0.039" },
    { "pcs": "1", "item": "tombstone", "material": "left royal impala", "length": "180", "width": "25", "thick": "8", "m3": "0.036" },
    { "pcs": "1", "item": "tombstone", "material": "right royal impala", "length": "180", "width": "57", "thick": "6", "m3": "0.062" }
  ]
}

═══════════════════════════════════════════════════════════════════
NOW EXTRACT FROM THIS PDF TEXT
═══════════════════════════════════════════════════════════════════

${text}
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
    temperature: 0,
    max_tokens: 16000,
  });

  let content = completion.choices[0].message.content || "";
  return sanitizeAIResponse(content);
}

module.exports = extractJsonFromPDF;
