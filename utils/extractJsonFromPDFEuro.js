const OpenAI = require("openai");
const dotenv = require("dotenv");
const sanitizeAIResponseEuro = require("./sanitizeAIResponseEuro");

dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Extract structured JSON from a PDF for Euro-formatted invoices.
 * Rule: ONE PDF MUST PRODUCE EXACTLY ONE JSON OBJECT.
 * Ignores item tables and focuses on Header + Bottom Summary.
 */
async function extractJsonFromPDFEuro(text) {
  const system = `You are a precision JSON extraction specialist for European invoice PDFs.
Your task is CRITICAL: ONE PDF MUST PRODUCE EXACTLY ONE ROW.
Return ONLY valid JSON. No markdown. No explanations. No comments.
The JSON must be a SINGLE OBJECT (not an array) containing exactly 10 fields.
IGNORE individual item tables. EXTRACT from Header and Bottom Summary ONLY.`;

  const prompt = `
You are a STRICT label-based JSON extraction engine.
You DO NOT analyze, infer, summarize, calculate, or guess.

ONE PDF MUST PRODUCE EXACTLY ONE JSON OBJECT.
Return ONLY valid JSON. No markdown. No explanations. No comments.

If a required labeled value is NOT explicitly present in the PDF text,
you MUST return null for that field.

═══════════════════════════════════════════════════════════════════
CRITICAL BEHAVIOR RULES (NO EXCEPTIONS)
═══════════════════════════════════════════════════════════════════

❌ DO NOT:
- Calculate totals
- Sum values
- Infer missing values
- Choose between similar values
- Use item-table data
- Normalize numbers
- Change formats
- Invent material names
- Guess or rephrase delivery values

✔ DO:
- Copy values ONLY if an EXACT LABEL exists
- Return null if a label is missing
- Extract EACH FIELD AT MOST ONCE

═══════════════════════════════════════════════════════════════════
PDF SECTIONS YOU ARE ALLOWED TO USE
═══════════════════════════════════════════════════════════════════

[1] HEADER SECTION (TOP OF PDF — LABEL REQUIRED)

Extract ONLY if the label exists EXACTLY:

- "date"       → value next to label "date"
- "client"     → value next to label "client" or "party"
- "order_no"   → value next to label "order" or "order no"
- "material"   → value next to label "material" in HEADER ONLY
- "delivery"   → value EXACTLY as shown after label "delivery" in HEADER ONLY

❌ If "material" or "delivery" appears only in item rows → IGNORE IT

───────────────────────────────────────────────────────────────────
[2] ITEM TABLE (MUST BE IGNORED COMPLETELY)
───────────────────────────────────────────────────────────────────

Table columns such as:
pcs | item | material | length | width | thick | m³

❌ NEVER extract ANY value from this table
❌ NEVER sum, reuse, or infer values from item rows

───────────────────────────────────────────────────────────────────
[3] BOTTOM SUMMARY SECTION (ONLY SOURCE OF NUMBERS)
───────────────────────────────────────────────────────────────────

Extract ONLY if the EXACT LABEL exists:

- "kgs:"        → value after label "kgs"
- "m³:"         → value after label "m³"
- "material:"  → value after label "material" WITH € symbol
- "extra fee:" → value after label "extra fee"
- "total:"     → value after label "total"

❌ DO NOT use similar words
❌ DO NOT infer if labels are missing

═══════════════════════════════════════════════════════════════════
OUTPUT SCHEMA (STRICT — SINGLE OBJECT ONLY)
═══════════════════════════════════════════════════════════════════

Return EXACTLY this structure:

{
  "date": string | null,
  "client": string | null,
  "order_no": string | null,
  "material": string | null,
  "delivery": string | null,
  "kgs": string | null,
  "m3": string | null,
  "material_cost": string | null,
  "extra_fee": string | null,
  "total_cost": string | null
}

═══════════════════════════════════════════════════════════════════
FORMATTING RULES
═══════════════════════════════════════════════════════════════════

• Preserve commas in decimals (e.g., "0,199")
• Preserve € symbol exactly as shown
• Preserve hyphens in order numbers
• Do NOT convert strings to numbers
• Do NOT change date format

═══════════════════════════════════════════════════════════════════
NOW EXTRACT FROM THIS PDF TEXT (COPY ONLY — NO THINKING)
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
    max_tokens: 4000,
  });

  let content = completion.choices[0].message.content || "";
  return sanitizeAIResponseEuro(content);
}

module.exports = extractJsonFromPDFEuro;
