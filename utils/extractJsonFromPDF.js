const OpenAI = require("openai");
const dotenv = require("dotenv");
const sanitizeAIResponse = require("./sanitizeAIResponse");

dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Extract structured JSON from a material order PDF.
 * This prompt is optimized for LOSSLSS extraction of ALL rows.
 */
async function extractJsonFromPDF(text) {
  const system = `You are a precision JSON extraction specialist for manufacturing material orders.
Your task is CRITICAL: EVERY SINGLE row from the PDF table must be extracted.
Return ONLY valid JSON. No markdown. No explanations. No comments.
The JSON must be an object containing "order", "client", and "material_details" (array of rows).`;

  const prompt = `
🚨 MISSION CRITICAL: LOSSLESS PDF EXTRACTION 🚨

Extract ALL item rows from the PDF into a structured JSON array.
If you miss a single row, it causes production failure.

═══════════════════════════════════════════════════════════════════
PART 1: METADATA
═══════════════════════════════════════════════════════════════════
- "order": Numerical/hyphenated value near 'order', 'ref', 'bestelling'
- "client": Name near 'customer', 'client', 'party', 'naam'

═══════════════════════════════════════════════════════════════════
PART 2: TABLE ROWS (EXTRACT EVERY SINGLE ONE)
═══════════════════════════════════════════════════════════════════

Each row has 7 logical columns:
1. pcs (1-2 digits)
2. item (text: e.g. headstone, slab, base)
3. material (text: e.g. black, impala, grey)
4. length (dimension)
5. width (dimension)
6. thick (dimension)
7. m3 (cubic meters - always 0.xxx)

───────────────────────────────────────────────────────────────────
CRITICAL RULE: NUMERIC FORMAT SUPPORT
───────────────────────────────────────────────────────────────────
Dimensions (length, width, thick) can appear in these formats:
- Integers: "180"
- Decimals (Comma): "23,4" → Convert to DOT: "23.4"
- Ranges: "180-175"
- Decimal Ranges: "23,4-10" or "100.5-90.2" → Convert to DOT: "23.4-10"

Rules for Dimensions:
- If PDF shows a comma (,), ALWAYS replace with a period (.)
- Presere ranges (-) exactly.
- If dimensions are merged (e.g. "180258"), intelligently split them (e.g. 180, 25, 8).

───────────────────────────────────────────────────────────────────
ABSOLUTE PROHIBITIONS
───────────────────────────────────────────────────────────────────
❌ DO NOT drop rows. If a row is messy, extract what you can.
❌ DO NOT merge item and material. Keep them separate.
❌ DO NOT calculate or sum anything.
❌ DO NOT invent data. If missing, return null.

═══════════════════════════════════════════════════════════════════
OUTPUT SCHEMA
═══════════════════════════════════════════════════════════════════
{
  "order": string | null,
  "client": string | null,
  "material_details": [
    {
      "pcs": string,
      "item": string,
      "material": string,
      "length": string,
      "width": string,
      "thick": string,
      "m3": string
    }
  ]
}

═══════════════════════════════════════════════════════════════════
NOW EXTRACT ALL ROWS FROM THIS PDF TEXT:
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
