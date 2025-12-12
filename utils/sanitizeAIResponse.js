



const dotenv = require("dotenv");
dotenv.config();
function sanitizeAIResponse(s) {
    if (!s) return s;
    let out = s.trim();
    out = out.replace(/```(?:json)?/gi, "");
    out = out.replace(/```/g, "");
    out = out.replace(/^[\s\S]*?\{/, "{"); 
    out = out.replace(/\}[\s\S]*?$/m, "}"); 
    return out;
}

module.exports = sanitizeAIResponse;