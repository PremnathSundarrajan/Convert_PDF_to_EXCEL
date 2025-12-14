const convert = require("../controller/convert");
const fs = require("fs");
const path = require("path");

const expected = [
  {
    order: "11-074",
    item: "headstones",
    length: "55",
    width: "105",
    thick: "8",
  },
  { order: "11-074", item: "base", length: "130", width: "25", thick: "10" },
  {
    order: "11-074",
    item: "sidekerbs",
    length: "220",
    width: "15",
    thick: "8",
  },
  {
    order: "11-074",
    item: "frontkerb",
    length: "130",
    width: "15",
    thick: "8",
  },
  {
    order: "11-074",
    item: "gardenkerb",
    length: "100",
    width: "63.3",
    thick: "10",
  },
  { order: "11-074", item: "bowed", length: "30", width: "28", thick: "10" },
];

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
      // ignore
    },
    download(filePath, fileName, cb) {
      const copyPath = path.join(__dirname, "converted_copy_compare.xlsx");
      try {
        fs.copyFileSync(filePath, copyPath);
        // console.log("Copied output to", copyPath);
      } catch (e) {
        console.error("Failed to copy output:", e);
      }
      cb && cb();
    },
  };

  try {
    await convert(req, res);
    const copyPath = path.join(__dirname, "converted_copy_compare.xlsx");
    if (!fs.existsSync(copyPath)) {
      console.error("No converted file produced.");
      return;
    }
    const XLSX = require("xlsx");
    const wb = XLSX.readFile(copyPath);
    const sheetName = wb.SheetNames[0];
    const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);

    function normalize(v) {
      if (v === null || v === undefined) return "";
      return String(v).replace(/,/g, ".").trim();
    }

    const report = [];
    for (const exp of expected) {
      const found = data.find((r) => {
        if (!r.order) return false;
        if (String(r.order).indexOf(exp.order) === -1) return false;
        if (!r.item) return false;
        return String(r.item).toLowerCase().includes(exp.item.toLowerCase());
      });
      if (!found) {
        report.push({ expected: exp, status: "missing" });
        continue;
      }
      const got = {
        length: normalize(found.length),
        width: normalize(found.width),
        thick: normalize(found.thick),
      };
      const ok =
        got.length === exp.length &&
        got.width === exp.width &&
        got.thick === exp.thick;
      report.push({ expected: exp, got, status: ok ? "ok" : "mismatch" });
    }

    console.log("Comparison report:", JSON.stringify(report, null, 2));
    const mismatches = report.filter((r) => r.status !== "ok");
    if (mismatches.length === 0) {
      console.log("All expected rows match.");
    } else {
      console.log(`${mismatches.length} mismatches found.`);
      mismatches.forEach((m) => console.log(JSON.stringify(m)));
    }
  } catch (e) {
    console.error("Error during convert/compare:", e);
  }
}

run();
