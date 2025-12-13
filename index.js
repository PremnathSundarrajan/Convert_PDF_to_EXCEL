const express = require("express");
const cors = require("cors");
const multer = require("multer");
const dotenv = require("dotenv");
dotenv.config();

const app = express();
const upload = multer({ dest: "uploads/" });
const convert = require("./controller/convert");
app.use(
  cors({
    origin: "https://pdf-excel-blond.vercel.app",
    credentials: true,
    methods: ["GET", "POST"],
  })
);

let dataJSON = null;

app.post("/convert", upload.array("pdfs"), convert);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
