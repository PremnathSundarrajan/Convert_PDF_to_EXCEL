const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const jobManager = require("../utils/jobManager");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * PHASE FINAL — ABSOLUTE GEOMETRIC HEADER WIPE.
 * ZERO-TOLERANCE SPECIFICATION WITH +20PX HEIGHT FIX.
 */
async function processStrictFile(file, jobId, progressStart, progressStep) {
    try {
        // 1. Upload file to OpenAI
        const fileContent = fs.createReadStream(file.path);
        const openAiFile = await openai.files.create({
            file: fileContent,
            purpose: "assistants",
        });

        if (jobId) {
            jobManager.updateJob(
                jobId,
                Math.round(progressStart + progressStep * 0.3),
                `Executing Absolute Geometic Redaction (+20px Fix): ${file.originalname}`
            );
        }

        // 2. Create Assistant
        const assistant = await openai.beta.assistants.create({
            name: "Final Absolute PDF Redactor",
            instructions: `You are a Python execution engine for PDF REDACTION using 'fitz' (PyMuPDF).

### MISSION
Execute 'ABSOLUTE GEOMETRIC HEADER WIPE (FINAL FIX)' and 'FOOTER REMOVAL (REQUIRED)'.
Guaranteed removal of left-side header metadata and pricing rows.

### 1. HEADER REMOVAL (PAGE 1 ONLY — FORCED)
Step A: Detect potential table header row:
- Search for a line containing any of: "pcs", "item", "material", "length", "width", "thick", "m3", "m³".
- If found: detected_y = table_header_y - 6 (small safety gap).
- If NOT found: detected_y = page.height * 0.18.

Step B: Apply HARD HEIGHT CAP (MANDATORY):
- header_y = MIN(detected_y, page.height * 0.18)
- This guarantees the wipe NEVER exceeds 18% of the page height.

Step C: Absolute Geometric Wipe:
- Redact exactly: Rect(x0=0, y0=0, x1=page.width * 0.50, y1=header_y).
- This MUST remove: Company name, date, factory, delivery (on the left).
- This MUST preserve: order, client, header material (right side), and ALL content below header_y.

### 2. FOOTER REMOVAL (ALL PAGES — REQUIRED)
- Zone: y > page.height * 0.60
- Keywords (case-insensitive): "material", "materiaal", "extra fee", "extra kosten", "kgs", "kg", "m3", "m³", "total", "totaal"

For EACH match inside the footer zone, apply a FULL-WIDTH redaction:
Rect(x0=0, y0=match.y0 - 2, x1=page.width, y1=match.y1 + 2)

This MUST remove both key and value completely.

### 3. REDACTION FINALIZATION (MANDATORY)
- Use ONLY: page.add_redact_annot(rect, fill=(1,1,1))
- MUST call: page.apply_redactions(images=True)
- FORBIDDEN: strike-throughs, red lines, highlights, or unflattened annotations.

### 4. FAILURE POLICY (NON-NEGOTIABLE)
- If ANY error occurs (PyMuPDF, logic, etc.):
  - Log the error.
  - THROW a hard exception.
  - DO NOT return the original PDF.

### 5. AUDIT LOGGING
- For Page 1 header: print(f"DETECTED_Y: {detected_y}, FINAL_HEADER_Y: {header_y}, RECT: (0, 0, {page.width*0.5}, {header_y})")
- For each footer match: print(f"FOOTER_REDACT_RECT_PAGE_{page.number}: {rect}")
- print("APPLY_REDACTIONS_EXECUTED")`,
            tools: [{ type: "code_interpreter" }],
            model: "gpt-4o",
        });

        // 3. Create Thread
        const thread = await openai.beta.threads.create({
            messages: [
                {
                    role: "user",
                    content: `Execute ABSOLUTE GEOMETRIC HEADER WIPE (FINAL FIX) on Page 1.
Execute FOOTER REMOVAL (ALL PAGES) for pricing keywords.

Strictly follow the geometric instructions. 
If an error occurs, FAIL hard. Do not return original PDF.
Return 'processed_output.pdf'.`,
                    attachments: [
                        { file_id: openAiFile.id, tools: [{ type: "code_interpreter" }] }
                    ],
                },
            ],
        });

        if (jobId) {
            jobManager.updateJob(
                jobId,
                Math.round(progressStart + progressStep * 0.6),
                `Applying Absolute Redactions (+20px Fix) ${file.originalname}`
            );
        }

        // 4. Run Assistant
        let run = await openai.beta.threads.runs.createAndPoll(thread.id, {
            assistant_id: assistant.id,
        });

        if (run.status === "completed") {
            const messages = await openai.beta.threads.messages.list(thread.id);
            const lastMessage = messages.data[0];

            let outputFileId = null;
            for (const content of lastMessage.content) {
                if (content.type === 'text' && content.text.annotations) {
                    for (const annotation of content.text.annotations) {
                        if (annotation.type === 'file_path') {
                            outputFileId = annotation.file_path.file_id;
                        }
                    }
                }
                if (content.type === 'image_file' && content.image_file) {
                    outputFileId = content.image_file.file_id;
                }
            }

            if (!outputFileId) {
                throw new Error("Assistant did not produce an output file.");
            }

            const fileData = await openai.files.content(outputFileId);
            const buffer = Buffer.from(await fileData.arrayBuffer());

            // Cleanup
            try {
                await Promise.all([
                    openai.beta.assistants.delete(assistant.id),
                    openai.files.delete(openAiFile.id)
                ]);
            } catch (e) {
                console.warn("Cleanup warning:", e.message);
            }

            return buffer;
        } else {
            console.error("Absolute AI run failed:", run.last_error);
            throw new Error(`Absolute AI run failed: ${run.last_error?.message || "Unknown error"}`);
        }
    } catch (error) {
        console.error(`Error in processStrictFile: `, error);
        throw error;
    }
}

/**
 * Strict PDF Redactor - Phase Final Absolute Strategy (+20px fix).
 */
exports.strictRemoveHeader = async (req, res) => {
    const { jobId } = req.query;
    const files = req.files;

    if (jobId) {
        jobManager.createJob(jobId);
    }

    if (!files || files.length === 0) {
        if (jobId) jobManager.updateJob(jobId, 0, "No files uploaded");
        return res.status(400).send("No files uploaded.");
    }

    const file = files[0];

    try {
        console.log(`[strictRemoveHeader] Starting ABSOLUTE (+20px) job: ${jobId}`);
        if (jobId) jobManager.updateJob(jobId, 10, `Processing ${file.originalname}`);

        const processedBuffer = await processStrictFile(file, jobId, 10, 80);

        if (jobId) jobManager.updateJob(jobId, 100, "Complete");

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="processed_output.pdf"`);
        res.send(processedBuffer);

        if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }

    } catch (error) {
        console.error("[strictRemoveHeader] Error:", error);
        if (jobId) jobManager.updateJob(jobId, 0, "Error: " + error.message);
        res.status(500).json({ error: error.message });
    }
};
