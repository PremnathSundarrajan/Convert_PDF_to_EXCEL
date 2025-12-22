const OpenAI = require("openai");
const dotenv = require("dotenv");
const sanitizeAIResponseEuro = require("./sanitizeAIResponseEuro");

dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Extract structured JSON from a PDF containing Euro-formatted invoice tables.
 * This function is designed for PDFs with EXACTLY 8 columns:
 * date, client, order_no, material, quantity, material_cost, extra_fee, total_cost (with € symbol)
 */
async function extractJsonFromPDFEuro(text) {
  const system = `You are a precision JSON extraction specialist for European invoice PDFs.
Your task is CRITICAL and ACCURACY IS PARAMOUNT.
Return ONLY valid JSON array. No markdown. No explanations. No comments.
Each row MUST have EXACTLY 8 columns in the specified format.
Preserve ALL hyphens in order numbers.
Preserve the € symbol in all cost values.
If extra_fee is not present, default to "€ 0".
If total_cost is not present, calculate it as material_cost + extra_fee.`;

  const prompt = `
🚨 CRITICAL EXTRACTION TASK - EURO INVOICE FORMAT (8 COLUMNS) 🚨

You are extracting structured data from a European invoice PDF.
Errors in extraction will cause financial reporting mistakes.
ZERO mistakes are allowed.

═══════════════════════════════════════════════════════════════════
COLUMN SPECIFICATIONS (EXACTLY 8 COLUMNS - STRICT REQUIREMENTS)
═══════════════════════════════════════════════════════════════════

Each row MUST contain EXACTLY 8 fields IN THIS EXACT ORDER:

┌──────────┬──────────────┬───────────┬──────────────┬──────────┬───────────────┬───────────┬────────────┐
│  DATE    │   CLIENT     │ ORDER_NO  │   MATERIAL   │ QUANTITY │ MATERIAL_COST │ EXTRA_FEE │ TOTAL_COST │
├──────────┼──────────────┼───────────┼──────────────┼──────────┼───────────────┼───────────┼────────────┤
│ dd.mm.yy │ Text/Words   │ NN-NNN    │ Text/Words   │ Integer  │ € NNN         │ € NNN     │ € NNN      │
└──────────┴──────────────┴───────────┴──────────────┴──────────┴───────────────┴───────────┴────────────┘

[COLUMN 1] date:
  - Format: dd.mm.yy (two-digit day, two-digit month, two-digit year)
  - Examples: "25.10.25", "01.11.25", "26.11.25"
  - MUST preserve exact format with periods as separators
  - ❌ WRONG: "25/10/25", "2025-10-25", "October 25"

[COLUMN 2] client:
  - Type: TEXT (company/person name)
  - OLD NAME IN PDF: may appear as "party"
  - Examples: "Veluwehof", "Harder", "De Verbinding", "Alpha", "Maes"
  - Preserve text exactly as shown
  - Can contain spaces and special characters
  - ❌ WRONG: Adding numbers, abbreviating names

[COLUMN 3] order_no:
  - Format: Numbers WITH hyphen (NN-NNN format)
  - OLD NAME IN PDF: may appear as "reference"
  - Examples: "10-264", "10-393", "11-002", "11-052", "11-239"
  - CRITICAL: NEVER remove the hyphen!
  - ❌ WRONG: "10264", "10 264", "10.264"

[COLUMN 4] material:
  - Type: TEXT (product/material description)
  - Examples: "Black Premium", "Visag Blue", "Royal Impala", "Himalayan", "Steel grey"
  - Preserve full value exactly as shown
  - Can be one or multiple words
  - ❌ WRONG: Truncating, abbreviating

[COLUMN 5] quantity:
  - Type: INTEGER only (numeric, no decimals)
  - Examples: 14, 312, 9, 390, 657, 16
  - No symbols, no text, no units
  - ❌ WRONG: "14 pcs", "14.0", "fourteen"

[COLUMN 6] material_cost:
  - MUST include euro symbol (€)
  - OLD NAME IN PDF: may appear as "amount"
  - Format: "€ NNN" (euro symbol, space, number)
  - Examples: "€ 90", "€ 477", "€ 8", "€ 403", "€ 689"
  - CRITICAL: Space between € and number is REQUIRED
  - Handle special cases: "FOC" (Free of Charge) should remain as "FOC"
  - ❌ WRONG: "90€", "€90" (no space), "90 EUR", "EUR 90"

[COLUMN 7] extra_fee:
  - MUST include euro symbol (€)
  - Format: "€ NNN" (euro symbol, space, number)
  - Examples: "€ 0", "€ 25", "€ 50"
  - CRITICAL: If NOT present in PDF → RETURN "€ 0"
  - This field MUST NEVER be empty or null
  - ❌ WRONG: "", null, undefined, "0"

[COLUMN 8] total_cost:
  - MUST include euro symbol (€)
  - Format: "€ NNN" (euro symbol, space, number)
  - If PDF provides total → extract exactly
  - If NOT explicitly present → CALCULATE: material_cost + extra_fee
  - Examples: "€ 90", "€ 115", "€ 500"
  - CRITICAL: Space between € and number is REQUIRED
  - ❌ WRONG: "90€", "€90" (no space), "90 EUR"

═══════════════════════════════════════════════════════════════════
COLUMN NAME MAPPING (IMPORTANT)
═══════════════════════════════════════════════════════════════════

If the PDF uses OLD column names, map them as follows:
  party        → client
  reference    → order_no
  amount       → material_cost

Two NEW columns that may not exist in PDF:
  extra_fee    → default to "€ 0" if missing
  total_cost   → calculate if missing

═══════════════════════════════════════════════════════════════════
ABSOLUTE RULES (VIOLATION = FAILURE)
═══════════════════════════════════════════════════════════════════

✔ Do NOT change column order
✔ Do NOT drop columns
✔ Do NOT merge values
✔ Do NOT remove hyphens from order_no
✔ Do NOT remove € symbol from cost fields
✔ Missing extra_fee MUST be "€ 0"
✔ All currency fields MUST include €
✔ Output must be VALID JSON ONLY
✔ Extract ALL rows from the table
✔ Date format MUST be dd.mm.yy
✔ Column count MUST be 8

═══════════════════════════════════════════════════════════════════
OUTPUT FORMAT (MANDATORY - JSON ARRAY ONLY)
═══════════════════════════════════════════════════════════════════

Return ONLY a JSON array — no explanation, no markdown code blocks:

[
  {
    "date": "25.10.25",
    "client": "Veluwehof",
    "order_no": "10-264",
    "material": "Black Premium",
    "quantity": 14,
    "material_cost": "€ 90",
    "extra_fee": "€ 0",
    "total_cost": "€ 90"
  },
  {
    "date": "25.10.25",
    "client": "Veluwehof",
    "order_no": "10-393",
    "material": "Black Premium",
    "quantity": 312,
    "material_cost": "€ 477",
    "extra_fee": "€ 25",
    "total_cost": "€ 502"
  }
]

═══════════════════════════════════════════════════════════════════
EXAMPLES FROM REAL DATA
═══════════════════════════════════════════════════════════════════

✅ CORRECT EXTRACTION (no extra fee in PDF):
{
  "date": "25.10.25",
  "client": "Veluwehof",
  "order_no": "10-264",
  "material": "Black Premium",
  "quantity": 14,
  "material_cost": "€ 90",
  "extra_fee": "€ 0",
  "total_cost": "€ 90"
}

✅ CORRECT EXTRACTION (with extra fee):
{
  "date": "26.11.25",
  "client": "De Kort",
  "order_no": "11-198",
  "material": "Black Premium",
  "quantity": 52,
  "material_cost": "€ 100",
  "extra_fee": "€ 15",
  "total_cost": "€ 115"
}

✅ CORRECT EXTRACTION (with FOC):
{
  "date": "26.11.25",
  "client": "De Kort",
  "order_no": "11-198",
  "material": "Black Premium",
  "quantity": 52,
  "material_cost": "FOC",
  "extra_fee": "€ 0",
  "total_cost": "FOC"
}

❌ WRONG (missing hyphen in order_no):
{
  "order_no": "10264"  ← WRONG! Must be "10-264"
}

❌ WRONG (wrong cost format):
{
  "material_cost": "90"  ← WRONG! Must be "€ 90"
}

❌ WRONG (empty extra_fee):
{
  "extra_fee": ""  ← WRONG! Must be "€ 0"
}

❌ WRONG (wrong date format):
{
  "date": "2025-10-25"  ← WRONG! Must be "25.10.25"
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
  return sanitizeAIResponseEuro(content);
}

module.exports = extractJsonFromPDFEuro;
