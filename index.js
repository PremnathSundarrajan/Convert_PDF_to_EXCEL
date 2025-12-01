require("dotenv").config();
const express = require("express");
const app = express();


const fs = require("fs");
const PDFParser = require("pdf2json"); 

const pdfParser = new PDFParser();

const { GoogleGenAI } = require("@google/genai");


// Ensure your GEMINI_API_KEY is set in your environment variables


/**
 * Uploads a document, requests a data modification, and returns the result as JSON.
 */
const apiKey = process.env.GEMINI_API_KEY;
let ai;
if (apiKey) {
    ai = new GoogleGenAI({ apiKey: apiKey });
} else {
    console.error("FATAL ERROR: The GEMINI_API_KEY is missing or the .env file was not loaded.");
    process.exit(1);
}

// Utility function to convert local file to GoogleGenerativeAI.Part object
function fileToGenerativePart(path, mimeType) {
  if (!fs.existsSync(path)) {
      throw new Error(`File not found at ${path}`);
  }
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType
    },
  };
}


/**
 * Processes the PDF file using the Base64 encoding method.
 */
async function getModifiedFileContent() {
  
  // Using the path from your error log
  const filePath = "../test.pdf"; 
  const mimeType = "application/pdf";
  
  try {
    // --- STEP 1: CONVERT FILE TO BASE64 PART ---
    console.log(`1. Reading and encoding file: ${filePath}...`);
    const filePart = fileToGenerativePart(filePath, mimeType);
    console.log("File encoded successfully.");
    
    // --- STEP 2: GENERATE MODIFIED CONTENT ---
    const modificationPrompt = `
      Analyze the uploaded order rectification document.
      1. Extract the product table data (pcs, item, material, length, width, thick).
      2. Apply the following modification: Find the item where 'item' is 'base' and change its 'material' value from 'indian aurora' to 'viscount white'.
      3. Return ONLY the final, modified list as a minified JSON array.
    `;

    console.log("2. Requesting modification from Gemini...");

    // 🌟 FIX: Pass the Base64 file content and the text prompt 🌟
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: [
        filePart, // Base64 content is the first part
        { text: modificationPrompt } // Text prompt is the second part
      ],
    });

    // --- STEP 3: PROCESS AND DISPLAY JSON RESPONSE ---
    const jsonOutput = response.text.trim();
    
    console.log("\n--- Generated Modified Data (JSON) ---");
    // Ensure the output is clean and only the JSON is parsed
    let cleanJsonOutput = jsonOutput.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    
    console.log(cleanJsonOutput);
    console.log("--------------------------------------");

    const modifiedData = JSON.parse(cleanJsonOutput);
    console.log(`\nVerification: The 'base' material is now: ${modifiedData.find(d => d.item === 'base').material}`);
    
  } catch (error) {
    // If the error is a JSON parsing issue, show the raw text for debugging
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
        console.error("An error occurred during JSON parsing. Check the model's raw text output above.");
    }
    console.error("An error occurred during the process:", error.message);
  }
  // Note: The cleanup step (ai.files.delete) is removed as the file was never uploaded to the service.
}

getModifiedFileContent();

app.listen(3000,()=>{
    console.log("running...")
})