const express = require("express");
const cors = require("cors");
const multer = require("multer");
const dotenv = require("dotenv");
dotenv.config();

const app = express();
const upload = multer({ dest: "uploads/" });
const convert = require("./controller/convert");
const convertEuro = require("./controller/convertEuro");
const removeHeader = require("./controller/removeHeader");
const strictRemoveHeader = require("./controller/strictRemoveHeader");
const cleanOcr = require("./controller/cleanOcr");
const jobManager = require("./utils/jobManager");

app.use(
  cors({
    origin: ["https://pdf-excel-blond.vercel.app", "http://localhost:8080", "https://frontend-pdf-excel-aurelion.vercel.app", "https://frontend-pdf-excel-aurelion-tx97.vercel.app"],
    credentials: true,
    methods: ["GET", "POST"],
  })
);

let dataJSON = null;

// Progress SSE endpoint
app.get("/progress/:jobId", (req, res) => {
  const { jobId } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  console.log(`[index.js] SSE connection opened for job: ${jobId}`);

  // Send initial state if exists
  const initialJob = jobManager.getJob(jobId);
  if (initialJob) {
    res.write(`data: ${JSON.stringify(initialJob)}\n\n`);
  }

  const listener = (jobData) => {
    res.write(`data: ${JSON.stringify(jobData)}\n\n`);
    if (jobData.progress === 100) {
      // Small delay to ensure client receives the 100% before closing
      setTimeout(() => {
        res.end();
      }, 500);
    }
  };

  jobManager.on(`update:${jobId}`, listener);

  req.on("close", () => {
    jobManager.removeListener(`update:${jobId}`, listener);
    console.log(`[index.js] SSE connection closed for job: ${jobId}`);
  });
});

app.post("/convert", upload.array("pdfs"), convert.convert);
app.post("/convert-debug", upload.array("pdfs"), convert.convertDebug);
app.post("/convert-euro", upload.array("pdfs"), convertEuro.convertEuro);
app.post("/remove-header", upload.array("pdfs"), removeHeader.removeHeader);
app.post("/strict-remove-header", upload.array("pdfs"), strictRemoveHeader.strictRemoveHeader);
app.post("/clean-ocr", upload.array("pdfs"), cleanOcr.cleanOcr);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
