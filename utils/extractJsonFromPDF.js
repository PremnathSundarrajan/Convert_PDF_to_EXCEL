const multer = require("multer");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const path = require("path");
const OpenAI = require("openai");
const XLSX = require("xlsx");
const dotenv = require("dotenv");
const sanitizeAIResponse = require("./sanitizeAIResponse");
dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
async function extractJsonFromPDF(text) {
  const system =
    "You are a strict JSON-only assistant. Return only valid JSON (object or array). No markdown, no backticks, no extra text.";
  const prompt = `
Convert the following PDF text into a STRICT JSON object using these exact fixed column names:

MAIN TABLE (array of rows under "material_details"):
[
  {
    "pcs": number,
    "item": string,
    "material": string,
    "length": number|string,
    "width": number|string,
    "thick": number|string,
    "m3": number|string,
    "notes": string|null
  }
]

You MUST extract the material rows into the "material_details" array.


Rules:
- Output ONLY valid JSON.
- Always include "material_details" as an array.
- Fill missing numbers as null.
- Keep names, descriptions, sizes exact.
- If extra text follows a row (e.g. “front bowed”), store it in "notes".
- Do NOT change column names.

PDF content:
${text}
`;

  //
  // Also extract the following header fields (if present):

  // - "date"
  // - "order"
  // - "factory"
  // - "client"
  // - "delivery"
  // - "finish"
  // - "material_cost"
  // - "extra_fee"
  // - "kgs"
  // - "total"

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
    max_tokens: 2000,
  });

  let content = completion.choices[0].message.content || "";
  content = sanitizeAIResponse(content);
  return content;
}

module.exports = extractJsonFromPDF;
