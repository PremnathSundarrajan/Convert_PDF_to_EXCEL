 
const extractJsonFromPDF = require("./extractJsonFromPDF");

const sanitizeAIResponse = require("./sanitizeAIResponse");
const tryFixJson = require("./tryFixJson");


const fs = require("fs");
const pdfParse = require("pdf-parse");
const OpenAI = require("openai");
const dotenv = require("dotenv");
dotenv.config();

const resultsFunc = async(req)=>{
    return await Promise.all(
          req.files.map(async (file) => {
            try {
              const pdfBuffer = fs.readFileSync(file.path);
              const pdfData = await pdfParse(pdfBuffer);
    
              let rawJson = await extractJsonFromPDF(pdfData.text);
              rawJson = sanitizeAIResponse(rawJson);
    
              let cleaned = rawJson;
              let parsed = null;
    
              try {
                parsed = JSON.parse(cleaned);
              } catch {
                cleaned = tryFixJson(cleaned);
                parsed = JSON.parse(cleaned);
              }
    
              return parsed;
            } catch (err) {
              return {
                file: file.originalname,
                success: false,
                error: "Could not extract valid JSON",
                details: err.message,
              };
            } finally {
              if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
            }
          })
        );
    
} 
module.exports = resultsFunc;