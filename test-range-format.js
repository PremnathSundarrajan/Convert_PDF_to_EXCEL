#!/usr/bin/env node
/**
 * Test for range format handling with decimal commas
 * Example: 63,3-10 should become "63.3 - 10" in output
 */

const assignColumns = require("./utils/assignColumns_refactored.js");

console.log("=== Testing Range Format with Decimal Handling ===\n");

const testCases = [
  {
    name: "Range with decimal comma (63,3-10)",
    tokens: ["1", "column", "black", "premium", "63,3-10", "75", "8", "0.017"],
    expectedLength: "63.3 - 10",
  },
  {
    name: "Simple range (159-157)",
    tokens: [
      "1",
      "tombstone",
      "black",
      "premium",
      "159-157",
      "59-57",
      "6",
      "0.036",
    ],
    expectedLength: "159 - 157",
  },
  {
    name: "Range with decimal in width (30,5-25)",
    tokens: ["1", "column", "black", "premium", "100", "30,5-25", "8", "0.020"],
    expectedWidth: "30.5 - 25",
  },
  {
    name: "Normal range format without decimal (180-175)",
    tokens: [
      "1",
      "headstone",
      "black",
      "premium",
      "180-175",
      "90",
      "8",
      "0.045",
    ],
    expectedLength: "180 - 175",
  },
  {
    name: "Standard non-range value (75)",
    tokens: ["1", "column", "black", "premium", "75", "50", "8", "0.017"],
    expectedLength: "75",
  },
];

let passed = 0;
let failed = 0;

testCases.forEach((test, idx) => {
  const result = assignColumns(test.tokens, "12-010", "TestClient");

  let testPassed = true;
  const expected = test.expectedLength || test.expectedWidth;
  const actual = test.expectedLength ? result.length : result.width;
  const fieldName = test.expectedLength ? "length" : "width";

  if (actual === expected) {
    console.log(`✅ Test ${idx + 1} PASSED: ${test.name}`);
    console.log(`   ${fieldName}: "${actual}" (expected: "${expected}")`);
    passed++;
  } else {
    console.log(`❌ Test ${idx + 1} FAILED: ${test.name}`);
    console.log(`   ${fieldName}: "${actual}" (expected: "${expected}")`);
    failed++;
  }

  console.log();
});

console.log(`=== SUMMARY ===`);
console.log(`Passed: ${passed}/${testCases.length}`);
console.log(`Failed: ${failed}/${testCases.length}`);

process.exit(failed > 0 ? 1 : 0);
