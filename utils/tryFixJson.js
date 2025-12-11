
const multer = require("multer");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const path = require("path");
const OpenAI = require("openai");
const XLSX = require("xlsx");
const dotenv = require("dotenv");
dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
function tryFixJson(str) {
    let fixed = str;

  
    fixed = fixed.replace(/```json|```/gi, "");

    fixed = fixed.replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":');

    fixed = fixed.replace(/}\s*{/g, '}, {');

    fixed = fixed.replace(/"(\w+)"\s*"(.*?)"/g, '"$1": "$2",');

 
    fixed = fixed.replace(/}\s*(\{)/g, '},$1');


    fixed = fixed.replace(/,\s*([}\]])/g, '$1');

   
    fixed = fixed.replace(/}\s*[^}\]]*$/s, '}');

 
    const openCount = (fixed.match(/{/g) || []).length;
    const closeCount = (fixed.match(/}/g) || []).length;
    if (openCount > closeCount) {
        fixed += "}".repeat(openCount - closeCount);
    } else if (closeCount > openCount) {
        fixed = "{".repeat(closeCount - openCount) + fixed;
    }


    fixed = fixed.replace(/:(\s*)-(\.)/g, ': -0.');

    return fixed.trim();
}

module.exports = tryFixJson;
