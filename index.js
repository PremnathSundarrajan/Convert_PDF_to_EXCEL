
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


app.post("/upload", upload.array("pdfs"), async (req, res) => {
    try {
        // Check for multiple files
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: "No files uploaded" });
        }

        const allExtractedData = []; 

        
        const results = await Promise.all(req.files.map(async (file) => {
            const pdfBuffer = fs.readFileSync(file.path);
            const pdfData = await pdfParse(pdfBuffer);

            let rawJson = await extractJsonFromPDF(pdfData.text);
            rawJson = sanitizeAIResponse(rawJson);

            let cleanedJson = rawJson;
            let currentDataJSON = null;
            let success = true;
            let errorMsg = null;

            try {
                currentDataJSON = JSON.parse(cleanedJson);
            } catch {
                cleanedJson = tryFixJson(cleanedJson);
                try {
                    currentDataJSON = JSON.parse(cleanedJson);
                } catch (err) {
                    success = false;
                    errorMsg = "Could not repair JSON";
                }
            }
            
           
            if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }

           
            if (success && currentDataJSON) {
                return currentDataJSON;
            } else {
                
                return { 
                    file: file.originalname, 
                    success: false, 
                    error: errorMsg,
                    aiRaw: rawJson, 
                    cleaned: cleanedJson 
                };
            }
        }));

      
        dataJSON = results.filter(r => r.success !== false);
        const errors = results.filter(r => r.success === false);

        if (dataJSON.length === 0) {
            return res.status(500).json({
                success: false,
                error: "Failed to extract valid JSON from any uploaded file.",
                errors: errors
            });
        }

        return res.json({
            success: true,
            message: `JSON extracted and repaired successfully for ${dataJSON.length} out of ${req.files.length} files.`,
            dataPreview: dataJSON.slice(0, 3), // Show a preview of the first 3
            errors: errors // Report any files that failed
        });

    } catch (error) {
        
        if (req.files) {
            req.files.forEach(file => {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            });
        }
        console.error("Upload error:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.get("/excel", (req, res) => {
    if (!dataJSON || dataJSON.length === 0) {
        return res.status(400).json({
            success: false,
            error: "No JSON found. Upload PDFs first."
        });
    }

    try {
        const workbook = XLSX.utils.book_new();
        let allUnwoundRows = []; 

        const pdfDataArray = Array.isArray(dataJSON) ? dataJSON : [dataJSON];

        pdfDataArray.forEach((fileData, fileIndex) => {
           
            const unwoundRecords = unwindAndFlatten(fileData, 'material_details');
            
            unwoundRecords.forEach(record => {
         
                record.order_number = record.order_number || `Order_${fileIndex + 1}`;
                allUnwoundRows.push(record);
            });
        });

        if (allUnwoundRows.length === 0) {
            return res.status(400).json({
                success: false,
                error: "Successfully extracted JSON, but no tabular data found after processing."
            });
        }
        
       
        const ws = XLSX.utils.json_to_sheet(allUnwoundRows);


        const headers = allUnwoundRows.length > 0 ? Object.keys(allUnwoundRows[0]) : [];
        const cols = headers.map(k => ({
            wch: Math.min(Math.max(k.length, 15), 40)
        }));
        ws['!cols'] = cols;


        XLSX.utils.book_append_sheet(workbook, ws, "Combined_Data");


        const outputFilename = `converted_${Date.now()}.xlsx`;
        const outputPath = path.join(__dirname, outputFilename);

        XLSX.writeFile(workbook, outputPath);

        res.download(outputPath, outputFilename, (err) => {
            if (err) console.error("Download error:", err);
            try {
                fs.unlinkSync(outputPath);
            } catch (cleanupErr) {
                console.error("Cleanup error:", cleanupErr);
            }
        });

        dataJSON = null; 

    } catch (error) {
        console.error("Excel Conversion Error:", error);
        res.status(500).json({
            success: false,
            error: "Excel creation failed",
            details: error.message
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

