
const multer = require("multer");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const path = require("path");
const OpenAI = require("openai");
const XLSX = require("xlsx");
const dotenv = require("dotenv");
dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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