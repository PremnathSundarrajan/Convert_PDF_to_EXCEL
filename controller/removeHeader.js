const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const stream = require("stream");
const jobManager = require("../utils/jobManager");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Helper to process a single PDF file using OpenAI Assistants API.
 */
async function processSingleFile(file, jobId, progressStart, progressStep) {
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
                `AI processing: ${file.originalname}`
            );
        }

        // 2. Create Assistant
        const assistant = await openai.beta.assistants.create({
            name: "Zone-Based PDF Cleaner",
            instructions: `You are a Python execution engine for PDF Modification. You DO NOT make qualitative judgments. You EXECUTE the following logic using the 'fitz' (PyMuPDF) library.

      ### ALGORITHM (EXECUTE EXACTLY):

      1. **READ PDF**: Load the file using fitz.
      
      2. **PAGE 1 HEADER REMOVAL (STRICT GEOMETRIC DELETE)**:
         - **Goal**: Find the TABLE HEADER ROW and delete EVERYTHING above it.
         - **Anchor Search**: Scan Page 1 text. Look for the Y-coordinate of the row containing the sequence: "pcs", "item", "material".
         - **Determine Y**: Let 'header_top_y' be the top-most Y coordinate of these words.
         - **Fallback**: If not found, look for "Pos.", "Gegenstand", "Menge" (German variants) or "Qty", "Description".
         - **ACTION**: Immediately draw a white rectangle (fill=(1,1,1), color=(1,1,1)) defining the HEADER ZONE:
           - Rec: fitz.Rect(0, 0, page_width, header_top_y - 2)
         - **RESULT**: This MUST visually erase the company logo, address, dates, "Delivery", "Order", "Client", and "Material" fields located above the table.
         - **VALIDATION**: After drawing, check if text exists in the rectangle Area(0, 0, width, header_top_y - 10). If text remains (e.g. "Delivery:"), draw the rectangle AGAIN over that text.

      3. **FOOTER REMOVAL (TARGETED KEY-VALUE CLEANUP)**:
         - **Strategy**: Do NOT wipe the bottom zone. Remove SPECIFIC KEYS and VALUES only.
         - **Targets (Case Insensitive)**: "Total", "Material", "Extra Fee", "kgs", "m3", "m³".
         - **Scope**: Start searching from y = 'page_height * 0.60' downwards.
         - **Action**: 
            - Locate the bounding box for any text containing these keywords.
            - EXPAND the box to the right to catch the associated value (e.g. "€ 150").
            - Draw a WHITE redaction rectangle over the key AND the value.
         - **Safety**: Do NOT redact if the text is part of a drawing label (e.g. "Material: Steel" inside a diagram description). Only redact pricing/weight summaries.

      4. **VALIDATION**:
         - **Header**: Check Page 1 above 'header_top_y'. Must be empty.
         - **Footer**: Check the bottom 40% for "Total", "Extra Fee", "m³". They MUST be gone.

      5. **OUTPUT**: Save as 'processed_output.pdf'.
      
      CRITICAL: Header = location based (above table). Footer = content based (specific keys).`,
            tools: [{ type: "code_interpreter" }],
            model: "gpt-4o",
        });

        // 3. Create Thread
        const thread = await openai.beta.threads.create({
            messages: [
                {
                    role: "user",
                    content: `Execute the STRICT HEADER/FOOTER REMOVAL ALGORITHM.

          **STEP 1: IDENTIFY TABLE ANCHOR (Page 1)**
          - Write Python code to find the bounding box of the row containing "pcs", "item", "material".
          - If the exact sequence isn't found, find the line containing "item" and "material" AND "width"/"length".
          - Extract 'y0' (top edge) of this row.

          **STEP 2: NUKE HEADER ZONE**
          - Define HeaderRect = Rect(0, 0, page.width, y0 - 2).
          - Apply Redaction (fill=white) to HeaderRect. 
          - **VERIFY**: Search for "Delivery" or "Date" in the HeaderRect area. If valid text remains, force-redraw.

          **STEP 3: SURGICAL FOOTER REMOVAL (All Pages)**
          - **Search Region**: Bottom 40% of the page.
          - **Targets**: "Total", "Material", "Extra Fee", "kgs", "m3", "m³".
          - **Logic**:
             - Find text instances of these words.
             - If found, define a redaction box: Rect(x0, y0, page_width, y1).
             - This broad width ensures we catch the value (e.g. "€ 500") which might be far to the right.
             - **Constraint**: Do NOT redact if the Y-coordinate is entangled with a drawing (check 'page.get_drawings()' in that rect).
          - **Apply**: White-out the validated bounding boxes.

          **STEP 4: FINAL VALIDATION**
          - Check Page 1 top region.
          - Check bottom region for remaining target keywords.
          - If strict header removal failed, retry strongly.

          Return the file 'processed_output.pdf'.`,
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
                `AI editing ${file.originalname}`
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
            console.error("Run failed:", run.last_error);

            // Try to fetch run steps to see why it failed (e.g. Python syntax error)
            let stepLogs = "";
            try {
                const steps = await openai.beta.threads.runs.steps.list(thread.id, run.id);
                stepLogs = steps.data.map(s => {
                    if (s.step_details && s.step_details.type === 'tool_calls') {
                        return s.step_details.tool_calls.map(tc => {
                            if (tc.type === 'code_interpreter') {
                                const outputs = tc.code_interpreter.outputs ? tc.code_interpreter.outputs.map(o => o.logs || "").join('\n') : "No output";
                                return `[Code Interpreter]\nInput: \n${tc.code_interpreter.input}\nOutput: \n${outputs}`;
                            }
                            return `[Tool: ${tc.type}]`;
                        }).join('\n');
                    }
                    if (s.last_error) return `[Step Error]${s.last_error.message}`;
                    return "";
                }).join('\n---\n');

                // Append to error log
                const logPath = path.join(__dirname, '../error_log.txt');
                fs.appendFileSync(logPath, `\n[${new Date().toISOString()}]Detailed Run Logs for ${file.originalname}: \n${stepLogs} \n`);

            } catch (stepError) {
                console.warn("Could not fetch run steps:", stepError);
            }

            throw new Error(`AI run failed for ${file.originalname}: ${run.last_error?.message || "Unknown error"}.Logs: ${stepLogs.slice(0, 200)}...`);
        }
    } catch (error) {
        console.error(`Error processing ${file.originalname}: `, error);
        throw error;
    }
}

/**
 * Creates a ZIP from multiple file buffers.
 */
async function createZip(processedFiles) {
    return new Promise((resolve, reject) => {
        const archive = archiver("zip", { zlib: { level: 9 } });
        const buffers = [];

        const outputStream = new stream.PassThrough();
        outputStream.on("data", (chunk) => buffers.push(chunk));
        outputStream.on("end", () => resolve(Buffer.concat(buffers)));
        outputStream.on("error", reject);

        archive.pipe(outputStream);

        for (const file of processedFiles) {
            archive.append(file.buffer, { name: file.name });
        }

        archive.finalize();
    });
}

/**
 * Remove header and footer from multiple PDFs using OpenAI Assistants API.
 */
exports.removeHeader = async (req, res) => {
    const { jobId } = req.query;
    const files = req.files;

    if (jobId) {
        jobManager.createJob(jobId);
    }

    if (!files || files.length === 0) {
        if (jobId) jobManager.updateJob(jobId, 0, "No files uploaded");
        return res.status(400).send("No files uploaded.");
    }

    try {
        console.log(`[removeHeader] Starting multi - job: ${jobId} with ${files.length} files`);
        if (jobId) jobManager.updateJob(jobId, 5, "Preparing files");

        const processedFiles = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fileProgressStart = 5 + (i * (90 / files.length));
            const fileProgressStep = 90 / files.length;

            if (jobId) {
                jobManager.updateJob(
                    jobId,
                    Math.round(fileProgressStart),
                    `Processing ${i + 1}/${files.length}: ${file.originalname}`
                );
            }

            const processedBuffer = await processSingleFile(file, jobId, fileProgressStart, fileProgressStep);
            processedFiles.push({
                buffer: processedBuffer,
                name: file.originalname.toLowerCase().endsWith('.pdf')
                    ? `Processed_${file.originalname}`
                    : `Processed_${file.originalname}.pdf`
            });
        }

        if (jobId) jobManager.updateJob(jobId, 95, "Creating ZIP archive");

        const zipBuffer = await createZip(processedFiles);

        if (jobId) jobManager.updateJob(jobId, 100, "Complete");

        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="Processed_PDFs_${new Date().toISOString().split('T')[0]}.zip"`);
        res.send(zipBuffer);

        // Cleanup
        files.forEach(f => {
            if (fs.existsSync(f.path)) {
                fs.unlinkSync(f.path);
            }
        });

    } catch (error) {
        console.error("[removeHeader] Error:", error);

        // Log to file for debugging since terminal logs are hard to access
        try {
            const logMessage = `[${new Date().toISOString()}] Error in removeHeader:\nMessage: ${error.message}\nStack: ${error.stack}\n\n`;
            fs.appendFileSync(path.join(__dirname, '../error_log.txt'), logMessage);
        } catch (logError) {
            console.error("Failed to write to error log:", logError);
        }

        if (jobId) jobManager.updateJob(jobId, 0, "Error: " + error.message);
        res.status(500).json({ error: error.message, details: error.stack });
    }
};
