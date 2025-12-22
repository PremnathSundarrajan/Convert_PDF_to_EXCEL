const express = require("express");
const cors = require("cors");
const multer = require("multer");
const dotenv = require("dotenv");
dotenv.config();

const app = express();
const upload = multer({ dest: "uploads/" });
const convert = require("./controller/convert");
const convertEuro = require("./controller/convertEuro");
app.use(
  cors({
    origin: ["https://pdf-excel-blond.vercel.app", "http://localhost:8080", "https://frontend-pdf-excel-aurelion.vercel.app", "https://frontend-pdf-excel-aurelion-tx97.vercel.app"],
    credentials: true,
    methods: ["GET", "POST"],
  })
);

let dataJSON = null;

app.post("/convert", upload.array("pdfs"), convert.convert);
app.post("/convert-debug", upload.array("pdfs"), convert.convertDebug);
app.post("/convert-euro", upload.array("pdfs"), convertEuro.convertEuro);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
