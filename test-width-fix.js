#!/usr/bin/env node
/**
 * Test for the width value fix (66 → 6, 6)
 */

const assignColumns = require("./utils/assignColumns_refactored.js");

console.log("=== Testing Width Value Fix ===\n");

// Test case from the PDF: frontkerb should have width=6, not 66
const testCases = [
  {
    name: "Frontkerb with width value issue",
    tokens: ["1", "frontkerb", "black", "premium", "80", "6", "6", "0.003"],
    expectedWidth: "6",
  },
  {
    name: "Sidekerb left with width value issue",
    tokens: [
      "1",
      "sidekerb",
      "left",
      "black",
      "premium",
      "79",
      "6",
      "6",
      "0.003",
    ],
    expectedWidth: "6",
  },
  {
    name: "Plate right - normal case",
    tokens: [
      "1",
      "plate",
      "right",
      "black",
      "premium",
      "169",
      "35",
      "6",
      "0.035",
    ],
    expectedWidth: "35",
  },
  {
    name: "Plate left - normal case",
    tokens: [
      "1",
      "plate",
      "left",
      "black",
      "premium",
      "105",
      "80",
      "6",
      "0.050",
    ],
    expectedWidth: "80",
  },
];

let passed = 0;
let failed = 0;

testCases.forEach((test, idx) => {
  const result = assignColumns(test.tokens, "12-010", "Haker");

  if (result.width === test.expectedWidth) {
    console.log(`✅ Test ${idx + 1} PASSED: ${test.name}`);
    console.log(`   Width: ${result.width} (expected: ${test.expectedWidth})`);
    passed++;
  } else {
    console.log(`❌ Test ${idx + 1} FAILED: ${test.name}`);
    console.log(`   Width: ${result.width} (expected: ${test.expectedWidth})`);
    failed++;
  }

  console.log(`   Item: ${result.item}`);
  console.log(
    `   Length: ${result.length}, Width: ${result.width}, Thick: ${result.thick}\n`
  );
});

console.log(`=== SUMMARY ===`);
console.log(`Passed: ${passed}/${testCases.length}`);
console.log(`Failed: ${failed}/${testCases.length}`);

process.exit(failed > 0 ? 1 : 0);
