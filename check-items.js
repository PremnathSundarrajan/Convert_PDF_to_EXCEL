const resultsFunc = require("./utils/results");

async function test() {
  const req = {
    files: [
      {
        path: "../../uploads/27457076ce0c8cb0b6a969651673df84",
        originalname: "sample.pdf",
      },
    ],
  };

  const res = await resultsFunc(req);
  if (res[0] && res[0].material_details) {
    console.log("=== EXTRACTED ITEMS ===");
    res[0].material_details.forEach((row, i) => {
      console.log(`${i + 1}. "${row.item}" (length: ${row.length})`);
    });
  }
}

test();
