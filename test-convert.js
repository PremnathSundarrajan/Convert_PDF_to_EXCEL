const convert = require("./controller/convert");
const fs = require("fs");
const path = require("path");

async function run() {
  const req = {
    files: [
      {
        path: "../../uploads/27457076ce0c8cb0b6a969651673df84",
        originalname: "sample.pdf",
      },
    ],
  };

  const res = {
    status(code) {
      this._status = code;
      return this;
    },
    json(obj) {
      console.log("JSON response:", obj);
    },
    download(filePath, fileName, cb) {
      const copyPath = path.join(__dirname, "converted_copy.xlsx");
      try {
        fs.copyFileSync(filePath, copyPath);
        console.log("Copied output to", copyPath);
      } catch (e) {
        console.error("Failed to copy output:", e);
      }
      // Call callback to let controller attempt cleanup
      cb && cb();
    },
  };

  try {
    await convert(req, res);
    // After convert completes, inspect copied file
    const copyPath = path.join(__dirname, "converted_copy.xlsx");
    if (fs.existsSync(copyPath)) {
      const XLSX = require("xlsx");
      const wb = XLSX.readFile(copyPath);
      const sheetName = wb.SheetNames[0];
      const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
      console.log("Excel rows (preview):", data.slice(0, 10));
    } else {
      console.log("No converted file found.");
    }
  } catch (e) {
    console.error("convert error:", e);
  }
}

run();
