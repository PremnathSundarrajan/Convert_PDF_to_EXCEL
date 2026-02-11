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

      ### STRICT PDF CLEANING ALGORITHM (HARD REDACTION ONLY):

      ❗ CRITICAL: Removed content must be COMPLETELY GONE. Areas must appear as PLAIN WHITE SPACE.

      1. **READ PDF**: Load the file using fitz.
      
      2. **STRICT HEADER REMOVAL (PAGE 1 ONLY)**:
         - **Header = RED-MARKED TOP AREA**: Everything above the table header row.
         - **Step 1: Locate Table Header Row**: Search Page 1 for the row containing ALL: "pcs", "item", "material", "length", "width", "thick", "m³".
         - **Step 2: Hard Protect Table Header Row**: 
            - Extract \`y_table_top\` and \`y_table_bottom\`.
            - Define ProtectedRect = fitz.Rect(0, y_table_top - 3, page.width, y_table_bottom + 3).
            - ❗ NO REDACTION may overlap this zone.
         - **Step 3: Remove Header (HARD REDACTION)**: 
            - Define HeaderRect = fitz.Rect(0, 0, page.width, y_table_top - 4).
            - Use \`page.add_redact_annot(HeaderRect, fill=(1, 1, 1))\`.
            - IMMEDIATELY call \`page.apply_redactions(images=True)\`.
            - ❗ Result must be COMPLETELY WHITE. NO lines, NO marks, NO strike-through.

      3. **SURGICAL FOOTER REMOVAL (ALL PAGES)**:
         - **Footer = RED-MARKED BOTTOM VALUES**: Only specific key-value pairs.
         - **Targets**: "Material", "Extra Fee", "Total", "kgs", "m3", "m³".
         - **Action**: 
            - Detect text blocks containing these keys.
            - Expand horizontally to capture numeric values.
            - Use \`page.add_redact_annot(rect, fill=(1, 1, 1))\`.
            - IMMEDIATELY call \`page.apply_redactions(images=True)\`.
         - ❗ Remove ONLY those blocks. Preserve drawings, diagrams, notes, legends.

      4. **FLATTEN & VERIFY (NON-NEGOTIABLE)**:
         - After ALL redactions, flatten the page.
         - ❗ FORBIDDEN: NO red lines, NO crosses, NO highlights, NO annotations, NO visible redaction boxes.
         - ❗ REQUIREMENT: Removed areas must be PLAIN WHITE SPACE. Removed text must NOT be selectable.

      5. **FINAL VALIDATION (MANDATORY)**:
         - **Check 1**: Header area (top) must be COMPLETELY WHITE.
         - **Check 2**: Footer key-value areas must be COMPLETELY WHITE.
         - **Check 3**: Table header row ("pcs | item | material | length | width | thick | m³") MUST exist and be readable.
         - **Check 4**: NO red lines, NO strike marks, NO annotations visible.
         - **Check 5**: Removed text must NOT be selectable.
         - ❗ If ANY visual marking exists → OUTPUT IS INVALID → REPROCESS.

      6. **OUTPUT**: Save as 'processed_output.pdf'.`,
            tools: [{ type: "code_interpreter" }],
            model: "gpt-4o",
        });

        // 3. Create Thread
        const thread = await openai.beta.threads.create({
            messages: [
                {
                    role: "user",
                    content: `Execute STRICT PDF → PDF CLEANING TASK.
                    
                    ❗ REMOVED CONTENT MUST BE COMPLETELY GONE. AREAS MUST BE PLAIN WHITE SPACE.
                    
                    HEADER (red-marked top area):
                    - Ends immediately before table row: "pcs | item | material | length | width | thick | m³"
                    - Protect: y_top - 3 to y_bottom + 3
                    - Remove: Rect(0, 0, width, y_top - 4)
                    - Apply HARD REDACTION (white fill=(1,1,1), apply_redactions(images=True), flatten)
                    
                    FOOTER (red-marked bottom values):
                    - Keys: "Material", "Extra Fee", "Total", "kgs", "m3", "m³"
                    - Key-value only, preserve drawings
                    - Apply HARD REDACTION (white fill, flatten)
                    
                    ❌ FORBIDDEN: NO red lines, NO crosses, NO strike-through, NO annotations, NO visible markup.
                    ✅ REQUIRED: Completely white blank space. Non-selectable text.
                    
                    Validate: White areas, table readable, no keywords, no visual marks.
                    
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
