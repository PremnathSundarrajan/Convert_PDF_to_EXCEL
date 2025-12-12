const express = require("express");


const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const path = require("path");
const OpenAI = require("openai");
const XLSX = require("xlsx");

const dotenv = require("dotenv");
dotenv.config();

const app = express();
const upload = multer({ dest: "uploads/" });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const extractJsonFromPDF = require("./utils/extractJsonFromPDF");
const flattenObject = require("./utils/flattenObject");
const sanitizeAIResponse = require("./utils/sanitizeAIResponse");
const tryFixJson = require("./utils/tryFixJson");
const unwindAndFlatten = require("./utils/unwindAndFlatten");
const convert = require("./controller/convert");
app.use(
  cors({
    origin: "https://pdf-excel-blond.vercel.app",
    credentials: true,
    methods: ["GET", "POST"],
  })
);

let dataJSON = null;

app.post("/convert", upload.array("pdfs"),convert );

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
