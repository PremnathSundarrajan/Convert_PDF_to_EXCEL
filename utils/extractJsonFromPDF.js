const OpenAI = require("openai");
const dotenv = require("dotenv");
const sanitizeAIResponse = require("./sanitizeAIResponse");

dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function extractJsonFromPDF(text) {
  const system =
    "You are a strict JSON-only assistant. Return ONLY valid JSON. No markdown. No comments.";

  const prompt = `
Extract ALL material rows from this PDF table. Return raw tokens EXACTLY as they appear.

CRITICAL - EXTRACT EVERY ROW:
- DO NOT SKIP ANY ROWS. Extract EVERY product row.
- Extract ANY row that starts with a quantity (e.g. "1", "2") and ends with an m3 value (e.g. "0,041").
- Common items: headstone, tombstone, kerbs, sidekerbs, frontkerb, backskirt, sideskirts, frontskirt, flowerblock, base, bowed, gardenkerb, coverplate, plate.
- If you see ANY product item, you MUST extract it.

RULES:
1. DO NOT SPLIT NUMBERS: If you see "551058" keep it as "551058" - our system will split it.
2. DO NOT SPLIT RANGES: Keep "159-157" or "63,3-10" as single tokens.
3. NEVER ADD ZEROS: Do NOT add "0" as placeholder. If a value is merged, just return the merged value.
4. KEEP MERGED VALUES: If "55 105 8" appears as "551058", return "551058" only - NOT "551058", "0", "0".
5. Stop at: TOTAL, SUBTOTAL, Finish:, or summary lines.
6. IGNORE: Headers, dates, order numbers, client names, factory info, notes like "with punched line".

COLUMN FORMATS:
- pcs: 1-2 digits (e.g., "1", "2")
- item: text (e.g., "headstone", "kerbs", "backskirt")
- material: text (e.g., "black premium", "indian aurora")
- length: 1-3 digits OR range (e.g., "53", "180", "159-157")
- width: 1-3 digits OR range (e.g., "62", "105", "63,3-10", "59-57")
- thick: 1-2 digits (e.g., "6", "8", "10")
- m3: Always "0,XXX" format (e.g., "0,026", "0,108")

Example OUTPUT FORMAT:
{
  "rows": [
    { "tokens": ["1", "headstone", "black", "premium", "53", "62", "8", "0,026"] },
    { "tokens": ["1", "tombstone", "black", "premium", "159-157", "59-57", "6", "0,056"] },
    { "tokens": ["1", "tombstone", "black", "premium", "200", "90", "6", "0,108"] },
    { "tokens": ["1", "backskirt", "black", "premium", "59", "9", "6", "0,003"] },
    { "tokens": ["2", "sideskirts", "black", "premium", "147", "9", "6", "0,016"] },
    { "tokens": ["1", "frontskirt", "black", "premium", "59", "9", "6", "0,003"] },
    { "tokens": ["1", "flowerblock", "black", "premium", "15", "15", "15", "0,003"] },
    { "tokens": ["2", "headstones", "indian", "aurora", "551058", "0,092"] },
    { "tokens": ["1", "gardenkerb", "indian", "aurora", "10063,3-108", "0,051"] }
  ]
}

PDF TEXT (EXTRACT ALL ROWS):
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
