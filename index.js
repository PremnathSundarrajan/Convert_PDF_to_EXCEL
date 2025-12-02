
const express = require("express");
const multer = require("multer");
const dotenv = require("dotenv");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const path = require("path");
const OpenAI = require("openai");
const XLSX = require('xlsx');

dotenv.config();

const app = express();
const upload = multer({ dest: "uploads/" });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


let dataJSON = null;

function sanitizeAIResponse(s) {
    if (!s) return s;
    let out = s.trim();
    out = out.replace(/```(?:json)?/gi, "");
    out = out.replace(/```/g, "");
    out = out.replace(/^[\s\S]*?\{/, "{"); 
    out = out.replace(/\}[\s\S]*?$/m, "}"); 
    return out;
}

// Try to fix common JSON issues
function tryFixJson(invalidJson) {
    let fixed = invalidJson;

    fixed = fixed.replace(/}\s*"(\w+)":/g, '}, "$1":');

  
    fixed = fixed.replace(/}\s*{/g, '}, {');
    fixed = fixed.replace(/}\s*\n\s*{/g, '},\n{');

  
    fixed = fixed.replace(/,\s*([\]}])/g, '$1');

    return fixed;
}


function flattenObject(obj, parentKey = "", res = {}) {
    if (obj === null || obj === undefined) {
        if (!parentKey) res["value"] = obj; 
        return res;
    }
    if (typeof obj !== "object" || obj instanceof Date) {
        res[parentKey || "value"] = obj;
        return res;
    }
    if (Array.isArray(obj)) {
        obj.forEach((item, idx) => {
            const newParent = parentKey ? `${parentKey}_${idx}` : `${idx}`;
            flattenObject(item, newParent, res);
        });
        return res;
    }
    for (const key of Object.keys(obj)) {
        const value = obj[key];
        const newKey = parentKey ? `${parentKey}_${key}` : key;
        flattenObject(value, newKey, res);
    }
    return res;
}

function unwindAndFlatten(record, arrayKey = 'material_details') {
    const records = [];
    const arrayToUnwind = record[arrayKey] || [];
    const baseRecord = { ...record };
    delete baseRecord[arrayKey]; // remove array key

    if (arrayToUnwind.length === 0) {
        records.push(baseRecord);
        return records;
    }

    arrayToUnwind.forEach(item => {
        records.push({
            ...baseRecord,
            ...item 
        });
    });

    return records;
}


async function extractJsonFromPDF(text) {
    const system = "You are a strict JSON-only assistant. Return only valid JSON (object or array). No markdown, no backticks, no extra text.";
    const prompt = `
Convert the following PDF content into a clean JSON structure suitable for tabular conversion.
Rules:
- Return ONLY valid JSON (object or array of objects).
- The list of material pieces should be in an array named 'material_details'.
PDF content:
${text}
`;

    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: system },
            { role: "user", content: prompt }
        ],
        max_tokens: 2000
    });

    let content = completion.choices[0].message.content || "";
    content = sanitizeAIResponse(content);
    return content;
}


app.post("/upload", upload.single("pdf"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: "No file uploaded" });

        const pdfBuffer = fs.readFileSync(req.file.path);
        const pdfData = await pdfParse(pdfBuffer);

        let rawJson = await extractJsonFromPDF(pdfData.text);
        rawJson = sanitizeAIResponse(rawJson);

        let cleanedJson = rawJson;
        try {
            dataJSON = JSON.parse(cleanedJson);
        } catch {
            cleanedJson = tryFixJson(cleanedJson);
            try {
                dataJSON = JSON.parse(cleanedJson);
            } catch (err) {
                return res.status(500).json({
                    success: false,
                    error: "Could not repair JSON",
                    aiRaw: rawJson,
                    cleaned: cleanedJson
                });
            }
        }

        fs.unlinkSync(req.file.path);
        return res.json({
            success: true,
            message: "JSON extracted and repaired successfully",
            dataPreview: Array.isArray(dataJSON) ? dataJSON.slice(0, 3) : dataJSON
        });

    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        console.error("Upload error:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.post("/excel", (req, res) => {
    if (!dataJSON) return res.status(400).json({ success: false, error: "No JSON data found. Please run the /upload endpoint first." });

    try {
        let jsonToConvert = Array.isArray(dataJSON) ? dataJSON : [dataJSON];

        let multiRowData = [];
        jsonToConvert.forEach(record => {
            const unwound = unwindAndFlatten(record, 'material_details');
            multiRowData.push(...unwound);
        });

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(multiRowData);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Extracted Data');

        const outputFilename = 'ai_extracted_data.xlsx';
        const outputFilePath = path.join(__dirname, outputFilename);

        XLSX.writeFile(workbook, outputFilePath);

        res.download(outputFilePath, outputFilename, (err) => {
            if (err) {
                console.error("Error sending file:", err);
                res.status(500).json({ success: false, error: "Error sending file." });
            }
            fs.unlinkSync(outputFilePath);
        });

        dataJSON = null; 

    } catch (error) {
        console.error("Excel conversion error:", error);
        res.status(500).json({ success: false, error: "Failed to convert JSON to Excel: " + error.message });
    }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});


// require('dotenv').config();
// const fs = require('fs');
// const pdfParse = require('pdf-parse');
// const OpenAI = require('openai');

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY
// });

// async function pdfToJson(pdfPath) {
//   try {
//     const dataBuffer = fs.readFileSync(pdfPath);
//     const pdfData = await pdfParse(dataBuffer); 
//     const text = pdfData.text;

 
//     const chunkSize = 3000; 
//     const chunks = [];
//     for (let i = 0; i < text.length; i += chunkSize) {
//       chunks.push(text.slice(i, i + chunkSize));
//     }

//     const allJson = [];

//     for (let i = 0; i < chunks.length; i++) {
//       const prompt = `
//         Convert the following text to structured JSON and only provide the json don't give any unwanted text in json like here your json :
//         "${chunks[i]}"
//       `;
//       const response = await openai.chat.completions.create({
//         model: "gpt-4o-mini",
//         messages: [{ role: "user", content: prompt }],
//         temperature: 0
//       });

//       allJson.push(response.choices[0].message.content);
//       console.log(`Processed chunk ${i + 1}/${chunks.length}`);
//     }

//     const finalJson = `[${allJson.join(",\n")}]`;
//     fs.writeFileSync("output.json", finalJson);
//     console.log("Saved JSON to output.json");
//   } catch (err) {
//     console.error("Error converting PDF to JSON:", err);
//   }
// }

// pdfToJson(process.env.PDF_PATH);

// const express = require("express");
// const app = express();

// const fs = require("fs");
// const PDFParser = require("pdf2json");

// const pdfParser = new PDFParser();

// const { GoogleGenAI } = require("@google/genai");

// // Ensure your GEMINI_API_KEY is set in your environment variables

// // Install dependencies first:
// // npm install pdf-parse openai fs

// const OpenAI = require("openai");

// // Initialize OpenAI client with your API key
// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY // store your key in env variable
// });

// // Function to read PDF and convert to JSON
// async function pdfToJson(pdfPath) {
//   try {
//     const dataBuffer = fs.readFileSync(pdfPath);
//     const pdfData = await pdf(dataBuffer);

//     // Extract text from PDF
//     const text = pdfData.text;
//     console.log("PDF text extracted. Sending to OpenAI...");

//     // Prompt ChatGPT to convert text to JSON
//     const prompt = `
//     Convert the following text into a structured JSON format.
//     Make it logical, with keys and values if possible:

//     "${text}"
//     `;

//     const response = await openai.chat.completions.create({
//       model: "gpt-4o-mini", // or "gpt-5-mini"
//       messages: [{ role: "user", content: prompt }],
//       temperature: 0
//     });

//     const jsonOutput = response.choices[0].message.content;
//     console.log("JSON output from OpenAI:");
//     console.log(jsonOutput);

//     return jsonOutput;
//   } catch (err) {
//     console.error("Error converting PDF to JSON:", err);
//   }
// }

// // Example usage
// pdfToJson("../test.pdf");

/**
 * Uploads a document, requests a data modification, and returns the result as JSON.
//  */
// const apiKey = process.env.GEMINI_API_KEY;
// let ai;
// if (apiKey) {
//     ai = new GoogleGenAI({ apiKey: apiKey });
// } else {
//     console.error("FATAL ERROR: The GEMINI_API_KEY is missing or the .env file was not loaded.");
//     process.exit(1);
// }

// // Utility function to convert local file to GoogleGenerativeAI.Part object
// function fileToGenerativePart(path, mimeType) {
//   if (!fs.existsSync(path)) {
//       throw new Error(`File not found at ${path}`);
//   }
//   return {
//     inlineData: {
//       data: Buffer.from(fs.readFileSync(path)).toString("base64"),
//       mimeType
//     },
//   };
// }

// /**
//  * Processes the PDF file using the Base64 encoding method.
//  */
// async function getModifiedFileContent() {

//   // Using the path from your error log
//   const filePath = "../test.pdf";
//   const mimeType = "application/pdf";

//   try {
//     // --- STEP 1: CONVERT FILE TO BASE64 PART ---
//     console.log(`1. Reading and encoding file: ${filePath}...`);
//     const filePart = fileToGenerativePart(filePath, mimeType);
//     console.log("File encoded successfully.");

//     // --- STEP 2: GENERATE MODIFIED CONTENT ---
//     const modificationPrompt = `
//       Analyze the uploaded order rectification document.
//       1. Extract the product table data (pcs, item, material, length, width, thick).
//       2. Apply the following modification: Find the item where 'item' is 'base' and change its 'material' value from 'indian aurora' to 'viscount white'.
//       3. Return ONLY the final, modified list as a minified JSON array.
//     `;

//     console.log("2. Requesting modification from Gemini...");

//     // 🌟 FIX: Pass the Base64 file content and the text prompt 🌟
//     const response = await ai.models.generateContent({
//       model: "gemini-2.5-pro",
//       contents: [
//         filePart, // Base64 content is the first part
//         { text: modificationPrompt } // Text prompt is the second part
//       ],
//     });

//     // --- STEP 3: PROCESS AND DISPLAY JSON RESPONSE ---
//     const jsonOutput = response.text.trim();

//     console.log("\n--- Generated Modified Data (JSON) ---");
//     // Ensure the output is clean and only the JSON is parsed
//     let cleanJsonOutput = jsonOutput.replace(/^```json\s*/, '').replace(/\s*```$/, '');

//     console.log(cleanJsonOutput);
//     console.log("--------------------------------------");

//     const modifiedData = JSON.parse(cleanJsonOutput);
//     console.log(`\nVerification: The 'base' material is now: ${modifiedData.find(d => d.item === 'base').material}`);

//   } catch (error) {
//     // If the error is a JSON parsing issue, show the raw text for debugging
//     if (error instanceof SyntaxError && error.message.includes('JSON')) {
//         console.error("An error occurred during JSON parsing. Check the model's raw text output above.");
//     }
//     console.error("An error occurred during the process:", error.message);
//   }
//   // Note: The cleanup step (ai.files.delete) is removed as the file was never uploaded to the service.
// }

// getModifiedFileContent();

// app.listen(3000,()=>{
//     console.log("running...")
// })
