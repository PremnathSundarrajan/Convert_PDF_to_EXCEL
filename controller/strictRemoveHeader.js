const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const jobManager = require("../utils/jobManager");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Helper to process a single PDF file using OpenAI Assistants API with STRICT rules.
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
                `AI strict processing: ${file.originalname}`
            );
        }

        // 2. Create Assistant
        const assistant = await openai.beta.assistants.create({
            name: "Strict PDF Header/Footer Removal",
            instructions: `You are a Python execution engine for PDF Modification. You DO NOT make qualitative judgments. You EXECUTE the following logic using the 'fitz' (PyMuPDF) library.

      ### MANDATORY REDACTION ALGORITHM (HARD REDACTION ONLY):

      1. **READ PDF**: Load the file using fitz.
      
      2. **STRICT HEADER REMOVAL (PAGE 1 ONLY)**:
         - **Step 1: Locate Table Column Header Row**: Search Page 1 for the row containing ALL: "pcs", "item", "material", "thick", "m³" AND ("length" OR "width").
         - **Step 2: Define Protection Zone**: 
            - Extract \`y_table_top\` and \`y_table_bottom\`.
            - Define ProtectedRect = fitz.Rect(0, y_table_top - 2, page.width, y_table_bottom + 2).
         - **Step 3: Remove Header (HARD REDACTION)**: 
            - Define HeaderRect = fitz.Rect(0, 0, page.width, y_table_top - 3).
            - **ACTION**: Use \`page.add_redact_annot(HeaderRect, fill=(1, 1, 1))\`.
            - This MUST remove company name, logo, date, factory, delivery, order, client, and all text/lines strictly ABOVE the table.

      3. **SURGICAL FOOTER REMOVAL (ALL PAGES)**:
         - **Goal**: Key-Value based removal.
         - **Targets**: "Total", "Material", "Extra Fee", "kgs", "m3", "m³".
         - **Action**: Locate the exact text blocks for these keys. Expand redaction horizontally to capture the aligned value. 
         - **ACTION**: Use \`page.add_redact_annot(rect, fill=(1, 1, 1))\`.
         - **CRITICAL**: Do NOT remove drawings, diagrams, legends, or notes.

      4. **APPLY & FLATTEN (NON-NEGOTIABLE)**:
         - **CRITICAL**: After adding ALL redaction annotations, you MUST call \`page.apply_redactions(images=True, graphics=True)\`.
         - **Requirement**: The removed areas MUST be flat white space. NO red X marks, NO strike-through lines, NO highlight boxes, NO annotations left behind. The removed content MUST be non-selectable and indistinguishable from blank paper.

      5. **FINAL VALIDATION**:
         - **Check 1**: Assert the table header row is readable.
         - **Check 2**: Assert NO text or markup exists in HeaderRect.
         - **Check 3**: Assert no target keywords remain.
         - **Visual Check**: Ensure NO vector lines, boxes, or markings exist in redacted areas.

      6. **OUTPUT**: Save as 'processed_output.pdf'.`,
            tools: [{ type: "code_interpreter" }],
            model: "gpt-4o",
        });

        // 3. Create Thread
        const thread = await openai.beta.threads.create({
            messages: [
                {
                    role: "user",
                    content: `Execute the STRICT PDF → PDF HEADER & FOOTER REMOVAL TASK.
                    
                    1. MANDATORY: All removals MUST be HARD REDACTIONS (\`apply_redactions(images=True)\`).
                    2. NO strike-throughs, NO red marks, NO annotations. The areas MUST be plain white space, non-selectable.
                    3. Page 1 Header: Remove everything strictly ABOVE the table header row (preserve y_top - 2 and below).
                    4. All Pages Footer: Surgically remove keys/values ("Total", "Material", "Extra Fee", "kgs", "m3", "m³").
                    5. Assert table row readable, no text above, no keywords remain.
                    
                    Return 'processed_output.pdf'. Visual markup = INVALID.`,
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
                `AI strict editing ${file.originalname}`
            );
        }

        // 4. Run Assistant
        let run = await openai.beta.threads.runs.createAndPoll(thread.id, {
            assistant_id: assistant.id,
        });

        if (run.status === "completed") {
            // 5. Get the output file
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
            }

            if (!outputFileId) {
                throw new Error("Assistant did not produce an output file.");
            }

            // 6. Download the file
            const fileData = await openai.files.content(outputFileId);
            const buffer = Buffer.from(await fileData.arrayBuffer());

            // Cleanup OpenAI objects
            try {
                await Promise.all([
                    openai.beta.assistants.del(assistant.id),
                    openai.files.del(openAiFile.id)
                ]);
            } catch (e) {
                console.warn("Cleanup warning:", e.message);
            }

            return buffer;
        } else {
            console.error("Strict AI run failed:", run.last_error);
            throw new Error(`Strict AI run failed: ${run.last_error?.message || "Unknown error"}`);
        }
    } catch (error) {
        console.error(`Error in processStrictFile: `, error);
        throw error;
    }
}

/**
 * Remove header and footer from SINGLE PDF using OpenAI Assistants API with STRICT rules.
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

    // STRICT rule: Single file only
    const file = files[0];

    try {
        console.log(`[strictRemoveHeader] Starting job: ${jobId} for file: ${file.originalname}`);
        if (jobId) jobManager.updateJob(jobId, 10, `Processing ${file.originalname}`);

        const processedBuffer = await processStrictFile(file, jobId, 10, 80);

        if (jobId) jobManager.updateJob(jobId, 100, "Complete");

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="processed_output.pdf"`);
        res.send(processedBuffer);

        // Cleanup
        if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }

    } catch (error) {
        console.error("[strictRemoveHeader] Error:", error);
        if (jobId) jobManager.updateJob(jobId, 0, "Error: " + error.message);
        res.status(500).json({ error: error.message });
    }
};
