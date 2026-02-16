const fs = require("fs");
const pdfParse = require("pdf-parse");
const cleanOcrText = require("../utils/cleanOcrText");
const jobManager = require("../utils/jobManager");

/**
 * Custom renderer for pdf-parse to preserve column alignment.
 */
function customRender(pageData) {
    let renderOptions = { normalizeWhitespace: true, disableCombineTextItems: false };
    return pageData.getTextContent(renderOptions).then(function (textContent) {
        let lastY, text = '';
        for (let item of textContent.items) {
            if (lastY == item.transform[5] || !lastY) {
                text += ' ' + item.str;
            } else {
                text += '\n' + item.str;
            }
            lastY = item.transform[5];
        }
        return text;
    });
}

/**
 * Handle semantic OCR text cleaning requests.
 */
exports.cleanOcr = async (req, res) => {
    const { jobId } = req.query;
    const files = req.files;

    if (jobId) {
        jobManager.createJob(jobId);
    }

    if (!files || files.length === 0) {
        if (jobId) jobManager.updateJob(jobId, 0, "No files uploaded");
        return res.status(400).send("No files uploaded.");
    }

    // Handle first file for cleaning
    const file = files[0];

    try {
        console.log(`[cleanOcr] Starting cleaning job: ${jobId} for file: ${file.originalname}`);
        if (jobId) jobManager.updateJob(jobId, 10, `Parsing PDF: ${file.originalname}`);

        // 1. Read PDF
        const pdfBuffer = fs.readFileSync(file.path);

        // 2. Extract raw text
        const pdfData = await pdfParse(pdfBuffer, { pagerender: customRender });
        const rawText = pdfData.text;

        if (jobId) jobManager.updateJob(jobId, 50, `Semantic cleaning in progress...`);

        // 3. Clean text using AI
        const cleanedText = await cleanOcrText(rawText);

        if (jobId) jobManager.updateJob(jobId, 100, "Complete");

        // Return as plain text
        res.setHeader("Content-Type", "text/plain");
        res.send(cleanedText);

        // Cleanup local file
        if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }

    } catch (error) {
        console.error("[cleanOcr] Error:", error);
        if (jobId) jobManager.updateJob(jobId, 0, "Error: " + error.message);
        res.status(500).json({ error: error.message });
    }
};
