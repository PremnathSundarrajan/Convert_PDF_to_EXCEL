const dotenv = require("dotenv");
dotenv.config();

/**
 * Sanitize AI response for Euro invoice extraction.
 * Handles JSON arrays (starts with [) unlike the original sanitizeAIResponse.
 */
function sanitizeAIResponseEuro(s) {
    if (!s) return s;
    let out = s.trim();

    // Remove markdown code blocks
    out = out.replace(/```(?:json)?/gi, "");
    out = out.replace(/```/g, "");
    out = out.trim();

    // Find the start of JSON array or object
    const arrayStart = out.indexOf('[');
    const objectStart = out.indexOf('{');

    if (arrayStart !== -1 && (objectStart === -1 || arrayStart < objectStart)) {
        // JSON Array - find matching closing bracket
        let depth = 0;
        let endIndex = -1;
        for (let i = arrayStart; i < out.length; i++) {
            if (out[i] === '[') depth++;
            else if (out[i] === ']') {
                depth--;
                if (depth === 0) {
                    endIndex = i;
                    break;
                }
            }
        }
        if (endIndex !== -1) {
            return out.substring(arrayStart, endIndex + 1);
        }
    } else if (objectStart !== -1) {
        // JSON Object - find matching closing brace
        let depth = 0;
        let endIndex = -1;
        for (let i = objectStart; i < out.length; i++) {
            if (out[i] === '{') depth++;
            else if (out[i] === '}') {
                depth--;
                if (depth === 0) {
                    endIndex = i;
                    break;
                }
            }
        }
        if (endIndex !== -1) {
            return out.substring(objectStart, endIndex + 1);
        }
    }

    return out;
}

module.exports = sanitizeAIResponseEuro;
