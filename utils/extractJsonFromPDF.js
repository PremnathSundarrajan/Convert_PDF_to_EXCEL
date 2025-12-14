const OpenAI = require("openai");
const dotenv = require("dotenv");
const sanitizeAIResponse = require("./sanitizeAIResponse");

dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function extractJsonFromPDF(text) {
  const system =
    "You are a strict JSON-only assistant. Return ONLY valid JSON. No markdown. No comments.";

  const prompt = `
EXTRACT THREE TYPES OF DATA FROM THIS PDF:

1. SINGLE-VALUE FIELDS (extract if present):
   - order: Look for 'order', 'Order', 'ORDER', 'order no', 'order number' - extract the value
   - client: Look for 'client', 'Client', 'CLIENT', 'client name' - extract the value
   - If field is missing, use null

2. MATERIAL ROWS from the PDF table:
   Extract ALL product rows with EXACTLY the tokens as they appear in the table columns, separated by whitespace.

CRITICAL TOKEN EXTRACTION RULES:
- Each row contains space-separated table columns
- Tokens are space-separated values in the PDF table
- Do NOT merge tokens that are separated by spaces
- If PDF shows: "1  column  royal impala  22  75  10-8  0,017" → extract ["1", "column", "royal", "impala", "22", "75", "10-8", "0,017"]
- DO NOT concatenate: "227" (from "22" and "75" being adjacent)
- DO NOT concatenate: "510-8" (from "5" and "10-8" being adjacent)
- ONLY keep merged tokens if they are genuinely printed as a single token in the PDF (rare edge case)

WHAT CONSTITUTES A SINGLE TOKEN:
- A token is ANY sequence that appears between whitespace characters
- "22" is one token, "75" is another token
- "10-8" is ONE token (contains hyphen but no spaces)
- "royal" is one token, "impala" is another

ROW EXTRACTION:
- DO NOT SKIP ANY ROWS. Extract EVERY product row.
- Extract ANY row that starts with a quantity (e.g., "1", "2") and contains text items and ends with m3 value
- Common items: headstone, tombstone, kerbs, column, sidekerbs, frontkerb, backskirt, base, plate, etc.

COLUMN ORDER (typical):
pcs → item (may be multiple words) → material (may be multiple words) → length → width → thick → m3

STOP EXTRACTION at: TOTAL, SUBTOTAL, Finish:, notes/finish descriptions, or summary lines.

Example OUTPUT FORMAT:
{
  "order": "12-008",
  "client": "Miali",
  "rows": [
    { "tokens": ["1", "column", "royal", "impala", "22", "75", "10-8", "0,017"] },
    { "tokens": ["1", "headstone", "royal", "impala", "56", "87", "8", "0,039"] },
    { "tokens": ["1", "tombstone", "left", "royal", "impala", "180", "25", "8", "0,036"] },
    { "tokens": ["1", "tombstone", "right", "royal", "impala", "180", "57", "6", "0,062"] }
  ]
}

PDF TEXT - Extract all rows EXACTLY as tokens appear:
${text}
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
    temperature: 0,
    max_tokens: 16000,
  });

  let content = completion.choices[0].message.content || "";
  content = sanitizeAIResponse(content);
  return content;
}

module.exports = extractJsonFromPDF;
