const resultsFunc = require("./utils/results");
const fs = require("fs");

async function run() {
  const req = {
    files: [
      {
        path: "../../uploads/27457076ce0c8cb0b6a969651673df84",
        originalname: "sample.pdf",
      },
    ],
  };

  try {
    const res = await resultsFunc(req);

    if (res[0] && res[0].material_details) {
      console.log("\n=== EXTRACTED DATA ===\n");
      res[0].material_details.forEach((row, idx) => {
        console.log(`Row ${idx + 1}:`);
        console.log(`  item: "${row.item}"`);
        console.log(`  material: "${row.material}"`);
        console.log(
          `  length: ${row.length}, width: ${row.width}, thick: ${row.thick}, m3: ${row.m3}`
        );
      });

      // Also save to file for reference
      fs.writeFileSync("extracted_data.json", JSON.stringify(res[0], null, 2));
      console.log("\n✅ Full extracted data saved to extracted_data.json");
    }
  } catch (e) {
    console.error("Error:", e);
  }
}

run();
