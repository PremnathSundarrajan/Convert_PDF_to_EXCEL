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
Execute 'Phase Final — Absolute Geometric Header Wipe' with MANDATORY Height Correction.
Guaranteed metadata removal with clean white output.

### 1. HEADER REMOVAL (PAGE 1 ONLY — FORCED)
This step MUST execute even if structural detection fails.

**STEP A: Anchor Search**
- Search Page 1 for a line containing ANY of: "pcs", "item", "material", "length", "width", "thick", "m3", "m³".
- If found:
  - Collect ALL spans belonging to that SAME visual line.
  - table_header_y = MIN(y0) across all spans in that row.
  - y1 = table_header_y + 20 (Mandatory +20px vertical buffer downward).
- **Fail-Safe**: If the table header row is NOT found:
  - y1 = page.height * 0.30 (30% of page height).

**STEP B: Absolute Geometric Wipe**
- Redact exactly: Rect(x0=0, y0=0, x1=page.width * 0.5, y1=y1).
- Use: page.add_redact_annot(rect, fill=(1,1,1)).
- Goal: Remove Company, Date, Factory, Delivery on the LEFT. Preserving right-side fields.
- TABLE HEADERS MUST REMAIN VISIBLE.

### 2. FOOTER REMOVAL (ALL PAGES — FORCED)
- **Zone**: Only process text where y0 > 0.6 * page.height.
- **Keywords**: "material", "materiaal", "extra fee", "extra kosten", "kgs", "kg", "m3", "m³", "total", "totaal".
- **Action**: 
  - For every keyword match, define: Rect(x0=0, y0=match.y0 - 2, x1=page.width, y1=match.y1 + 2).
  - **Overlap Protection**: Do NOT apply if the rectangle overlaps an already redacted region on the same page.
  - Use: page.add_redact_annot(rect, fill=(1,1,1)).

### 3. GLOBAL RULES & FINALIZATION
- **MANDATORY**: Call page.apply_redactions(images=True) for EVERY page.
- **Aesthetic**: Output MUST contain clean white blank space. NO strike-throughs, highlights, red lines, or artifacts.
- **Deliverability**: Removed text must be intrinsically non-selectable and non-searchable.
- **Failure**: If PyMuPDF or OpenAI logic fails, THROW HARD ERROR. NEVER return original PDF.

### 4. AUDIT LOGGING
- print(f"TABLE_HEADER_Y_ANCHOR: {table_header_y}")
- print(f"HEADER_WIPE_FINAL_Y: {y1}")`,
            tools: [{ type: "code_interpreter" }],
            model: "gpt-4o",
        });

        // 3. Create Thread
        const thread = await openai.beta.threads.create({
            messages: [
                {
                    role: "user",
                    content: `Execute PHASE FINAL: ABSOLUTE GEOMETRIC HEADER WIPE (+20px correction).

=====================================================
WIPE Page 1 Header (LEFT 50% width, height anchored to table + 20px buffer OR 30% failsafe).
WIPE Footer Rows Full-Width (>60% height) for all pricing keywords.
=====================================================

Strictly use add_redact_annot + apply_redactions(images=True). 
No strike-throughs. No silent fallbacks. Fail if logic crashes.
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
