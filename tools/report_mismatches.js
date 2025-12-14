const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

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

function normalize(v) {
  if (v === undefined || v === null) return "";
  return String(v).replace(/\s+/g, "").replace(/,/g, ".").trim();
}

function loadExcel(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[sheet]);
}

function findRow(rows, expect) {
  return rows.find((r) => {
    if (!r.order || !r.item) return false;
    if (String(r.order).indexOf(expect.order) === -1) return false;
    return String(r.item).toLowerCase().includes(expect.item.toLowerCase());
  });
}

function run() {
  const copyPath = path.join(__dirname, "../converted_copy.xlsx");
  if (!fs.existsSync(copyPath)) {
    console.error("converted_copy.xlsx not found at", copyPath);
    process.exit(1);
  }
  const rows = loadExcel(copyPath);
  const report = [];
  for (const exp of expected) {
    const found = findRow(rows, exp);
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
      got.length === normalize(exp.length) &&
      got.width === normalize(exp.width) &&
      got.thick === normalize(exp.thick);
    report.push({ expected: exp, got, status: ok ? "ok" : "mismatch" });
  }
  const out = { generatedAt: new Date().toISOString(), report };
  fs.writeFileSync(
    path.join(__dirname, "mismatch_report.json"),
    JSON.stringify(out, null, 2)
  );
  console.log("Report written to tools/mismatch_report.json");
  const mismatches = report.filter((r) => r.status !== "ok");
  console.log("Mismatches:", mismatches.length);
  mismatches.forEach((m) => console.log(JSON.stringify(m)));
}

run();
