const dotenv = require("dotenv");
dotenv.config();

function tryFixJson(str) {
    let fixed = str;

    // Remove markdown code blocks
    fixed = fixed.replace(/```json|```/gi, "");

    // Quote unquoted keys
    fixed = fixed.replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":');

    // Fix missing comma between objects (} followed by {)
    fixed = fixed.replace(/}\s*{/g, '}, {');

    // Fix missing comma after closing brace followed by newline and opening brace
    // This catches: }\n    { -> },\n    {
    fixed = fixed.replace(/}\s*\n\s*{/g, '},\n    {');

    // Fix pattern like "key" "value" to "key": "value"
    fixed = fixed.replace(/"(\w+)"\s*"(.*?)"/g, '"$1": "$2",');

    // Another pass for } followed by { with any whitespace
    fixed = fixed.replace(/}\s*(\{)/g, '},$1');

    // Remove trailing commas
    fixed = fixed.replace(/,\s*([}\]])/g, '$1');

    // Clean up any garbage after last closing brace
    fixed = fixed.replace(/}\s*[^}\]]*$/s, '}');

    // Balance braces
    const openCount = (fixed.match(/{/g) || []).length;
    const closeCount = (fixed.match(/}/g) || []).length;
    if (openCount > closeCount) {
        fixed += "}".repeat(openCount - closeCount);
    } else if (closeCount > openCount) {
        fixed = "{".repeat(closeCount - openCount) + fixed;
    }

    // Fix negative decimals
    fixed = fixed.replace(/:(\s*)-(\.)/, ': -0.');

    return fixed.trim();
}

module.exports = tryFixJson;
