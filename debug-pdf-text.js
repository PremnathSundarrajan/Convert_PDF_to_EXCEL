const fs = require("fs");
const pdfParse = require("pdf-parse");
const normalizePdfText = require("./utils/normalizePdfText");

async function run() {
  const pdfBuffer = fs.readFileSync(
    "../../uploads/27457076ce0c8cb0b6a969651673df84"
  );
  const pdfData = await pdfParse(pdfBuffer);

  console.log("=== RAW PDF TEXT ===");
  console.log(pdfData.text.substring(0, 2000));

  console.log("\n\n=== NORMALIZED TEXT ===");
  const normalized = normalizePdfText(pdfData.text);
  console.log(normalized.substring(0, 2000));
}

run().catch((e) => console.error("Error:", e));
