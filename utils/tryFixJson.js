const dotenv = require("dotenv");
dotenv.config();

function tryFixJson(str) {
    let fixed = str;

    // Remove markdown code blocks
    fixed = fixed.replace(/```json|```/gi, "");

    // Quote unquoted keys
    fixed = fixed.replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":');

    // Fix missing comma between objects (e.g. } { )
    fixed = fixed.replace(/(})\s*({)/g, '$1,$2');

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
