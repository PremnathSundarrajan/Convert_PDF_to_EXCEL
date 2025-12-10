
const express = require("express");
const multer = require("multer");
const dotenv = require("dotenv");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const path = require("path");
const OpenAI = require("openai");
const XLSX = require('xlsx');
const cors = require("cors");


dotenv.config();

const app = express();
const upload = multer({ dest: "uploads/" });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
app.use(cors({
  origin: "https://convert-pdf-to-excel-frontend-plfz.vercel.app",
  credentials: true,
  methods: ["GET", "POST"]
}));

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
    delete baseRecord[arrayKey]; 

    if (arrayToUnwind.length > 0) {
        arrayToUnwind.forEach((item, index) => {
            let unwoundRecord = { ...baseRecord };
            
           
            if (typeof item === 'object' && item !== null) {
                unwoundRecord = { ...unwoundRecord, ...item };
            } else {
              
                unwoundRecord[`${arrayKey}_value_${index}`] = item;
            }
            records.push(unwoundRecord);
        });
    } else {
    
        records.push(baseRecord);
    }


    return records.flatMap(r => {
        
        if (r.rows && Array.isArray(r.rows)) {
           
            return r.rows.map(row => {
                const flatRow = { ...r };
                delete flatRow.rows;
              
                if (row.data && Array.isArray(row.data)) {
                    row.data.forEach((cell, i) => {
                        flatRow[`col_${i + 1}`] = cell;
                    });
                }
             
                return { ...flatRow, ...row };
            }).map(row => {delete row.data; return row;});
        }
        
        if (r.years && Array.isArray(r.years)) {
       
            return r.years.flatMap(yearData => {
                return (yearData.data || []).map(item => {
                    const flatYear = { ...r };
                    delete flatYear.years;
                    return { ...flatYear, year: yearData.year, ...item };
                });
            });
        }
        
        
        return flattenObject(r);
    });
}
async function extractJsonFromPDF(text) {
    const system = "You are a strict JSON-only assistant. Return only valid JSON (object or array). No markdown, no backticks, no extra text.";
   const prompt = `
Convert the following PDF text into a STRICT JSON object using these exact fixed column names:

MAIN TABLE (array of rows under "material_details"):
[
  {
    "pcs": number,
    "item": string,
    "material": string,
    "length": number|string,
    "width": number|string,
    "thick": number|string,
    "m3": number|string,
    "notes": string|null
  }
]

You MUST extract the material rows into the "material_details" array.


Rules:
- Output ONLY valid JSON.
- Always include "material_details" as an array.
- Fill missing numbers as null.
- Keep names, descriptions, sizes exact.
- If extra text follows a row (e.g. “front bowed”), store it in "notes".
- Do NOT change column names.

PDF content:
${text}
`;

//
// Also extract the following header fields (if present):

// - "date"
// - "order"
// - "factory"
// - "client"
// - "delivery"
// - "finish"
// - "material_cost"
// - "extra_fee"
// - "kgs"
// - "total"




    //     const prompt = `
// Convert the following PDF content into a clean JSON structure suitable for tabular conversion.
// Rules:
// - Return ONLY valid JSON (object or array of objects).
// - The list of material pieces should be in an array named 'material_details'.
// PDF content:
// ${text}
// `;

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
app.post("/convert", upload.array("pdfs"), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: "No files uploaded" });
    }

    const allValidJson = [];

    const results = await Promise.all(
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

  
    results.forEach((r) => {
      if (r && r.success === false) return;
      allValidJson.push(r);
    });

    if (allValidJson.length === 0) {
      return res.status(500).json({
        success: false,
        error: "Failed to extract valid JSON from all files",
        errors: results,
      });
    }

  
    const workbook = XLSX.utils.book_new();

    allValidJson.forEach((fileData, index) => {
      let finalRows = [];

  
      if (fileData.material_details && Array.isArray(fileData.material_details)) {
        finalRows = unwindAndFlatten(fileData);
      }

     
      else if (fileData.rows && Array.isArray(fileData.rows)) {
        finalRows = flattenObject(fileData.rows);
      }

      else if (fileData.years && Array.isArray(fileData.years)) {
        finalRows = flattenObject(fileData);
      }

     
      else {
        finalRows = [flattenObject(fileData)];
      }

      // Ensure at least one row exists
      if (finalRows.length === 0) {
        finalRows = [flattenObject(fileData)];
      }

      const ws = XLSX.utils.json_to_sheet(finalRows);

      // Autofit columns
      const headers = Object.keys(finalRows[0]);
      ws["!cols"] = headers.map((key) => ({
        wch: Math.max(key.length, 15),
      }));

      XLSX.utils.book_append_sheet(workbook, ws, `PDF_${index + 1}`);
    });

   
    const outputFile = `converted_${Date.now()}.xlsx`;
    const outputPath = path.join(__dirname, outputFile);

    XLSX.writeFile(workbook, outputPath);

    res.download(outputPath, outputFile, () => {
      try {
        fs.unlinkSync(outputPath);
      } catch {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});




const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

