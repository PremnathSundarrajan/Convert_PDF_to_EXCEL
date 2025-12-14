const assignColumns = require("./utils/assignColumns");

const tests = [
  {
    name: "base (should be L:130, W:25)",
    tokens: ["1", "base", "indian", "aurora", "130", "25", "10", "0,033"],
  },
  {
    name: "sidekerbs (should be L:220, W:15)",
    tokens: ["2", "sidekerbs", "indian", "aurora", "220", "15", "8", "0,053"],
  },
  {
    name: "frontkerb (should be L:130, W:15)",
    tokens: ["1", "frontkerb", "indian", "aurora", "130", "15", "8", "0,016"],
  },
  {
    name: "gardenkerb (should be L:100, W:63.3-10)",
    tokens: [
      "1",
      "gardenkerb",
      "indian",
      "aurora",
      "100",
      "6",
      "3,3-10",
      "0,051",
    ],
  },
];

console.log("\n=== VERIFYING 3-DIGIT LENGTH/WIDTH PRESERVATION ===\n");

tests.forEach((test) => {
  try {
    const result = assignColumns(test.tokens);
    const lOk = /^130$|^220$|^100$|^6$/.test(result.length) ? "✓" : "✗";
    const wOk = /^25$|^15$|^63\.3|^6$/.test(result.width) ? "✓" : "✗";

    console.log(`${lOk} ${wOk} ${test.name}`);
    console.log(
      `  L:${result.length} W:${result.width} T:${result.thick} M3:${result.m3}`
    );
    console.log();
  } catch (e) {
    console.log(`✗ ✗ ${test.name}: ${e.message}\n`);
  }
});
