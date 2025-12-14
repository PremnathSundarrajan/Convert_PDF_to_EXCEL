const assignColumns = require("./utils/assignColumns");

const tests = [
  {
    name: "headstone",
    tokens: ["1", "headstone", "black", "premium", "53", "628", "0,026"],
  },
  {
    name: "flowerblock",
    tokens: ["1", "flowerblock", "black", "premium", "15", "15", "0,003"],
  },
  {
    name: "headstones (test)",
    tokens: ["2", "headstones", "indian", "aurora", "55", "10", "58", "0,092"],
  },
];

console.log("\n=== TESTING DIGIT CONSTRAINTS & COMMA-TO-DOT ===\n");

tests.forEach((test) => {
  try {
    const result = assignColumns(test.tokens);
    console.log(`✅ ${test.name}:`);
    console.log(
      `   Length: ${result.length} (≤3 digits: ${
        result.length.replace(/[^0-9]/g, "").length <= 3 ? "✓" : "✗"
      })`
    );
    console.log(
      `   Width: ${result.width} (≤3 digits: ${
        result.width.replace(/[^0-9]/g, "").length <= 3 ? "✓" : "✗"
      })`
    );
    console.log(
      `   Thick: ${result.thick} (≤2 digits: ${
        result.thick.replace(/[^0-9]/g, "").length <= 2 ? "✓" : "✗"
      })`
    );
    console.log(
      `   M3: ${result.m3} (no commas: ${!result.m3.includes(",") ? "✓" : "✗"})`
    );
    console.log();
  } catch (e) {
    console.log(`❌ ${test.name}: ${e.message}\n`);
  }
});
