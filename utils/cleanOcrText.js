const OpenAI = require("openai");
const dotenv = require("dotenv");

dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * AI-powered semantic cleaner for monument order OCR text.
 * Strips headers and footers, preserving only the table.
 */
async function cleanOcrText(text) {
    const systemPrompt = `You are a document structure extraction engine. 
Your task is to clean OCR text extracted from monument order documents.
Return ONLY the cleaned TABLE CONTENT. 
Completely remove header metadata and footer price blocks.`;

    const userPrompt = `
----------------------------------------
DOCUMENT STRUCTURE RULES:

1) HEADER SECTION:
Header contains metadata like:
- date (format: DD-MM-YY)
- order number
- client name
- material
- "4 weeks maximum"
- RCGG
- company identifiers

Remove any line that matches 2 or more of:
- Contains keywords: order, client, material (metadata context), weeks
- Matches date pattern \\d{2}-\\d{2}-\\d{2}
- Contains short uppercase codes (e.g., RCGG)
- Appears before the table header row

2) TABLE SECTION:
The real content starts at the row containing:
pcs | item | material | length | width | thick | m³

Everything from that row until the last valid item row is VALID CONTENT.

Valid item rows:
- Start with a number (pcs column)
- Contain dimension values
- Contain material names

3) FOOTER SECTION:
Footer contains:
- €
- total
- extra fee
- material price
- kgs
- m³ totals
- numeric-only summary rows

Remove any line that:
- Contains currency symbols (€)
- Contains keywords: total, extra fee, material (price context)
- Contains weight (kgs) without item context
- Is a standalone numeric summary row

4) DRAWINGS OR IMAGE LABELS:
Remove dimension-only labels attached to drawings (e.g., 170, 80, 3 H if isolated).

----------------------------------------
OUTPUT RULES:
- Return ONLY the cleaned table.
- Preserve table row order.
- Do NOT include header.
- Do NOT include footer.
- Do NOT include pricing or totals.
- Keep finish instructions if they appear BETWEEN table and drawings.
----------------------------------------

Now clean the following OCR text:

${text}
`;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            temperature: 0,
        });

        const cleanedText = completion.choices[0].message.content.trim();

        // Fail-safe: if AI output is empty or too short compared to input, return original with warning
        if (!cleanedText || cleanedText.length < 20) {
            console.warn("[cleanOcrText] AI output suspiciously empty, returning original.");
            return text;
        }

        return cleanedText;
    } catch (error) {
        console.error("[cleanOcrText] AI cleaning failed:", error.message);
        return text; // Return original on error as per fail-safe
    }
}

module.exports = cleanOcrText;
