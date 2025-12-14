#!/usr/bin/env node
/**
 * Quick test of the refactored assignColumns function
 * Tests basic functionality without triggering the full server
 */

const assignColumns = require("./utils/assignColumns_refactored.js");

console.log("=== TESTING REFACTORED assignColumns ===\n");

const tests = [
  {
    name: "Column with range thickness",
    tokens: ["1", "column", "royal", "impala", "22", "75", "10-8", "0.017"],
    order: "12-008",
    client: "Miali",
    expected: {
      order: "12-008",
      client: "Miali",
      pcs: "1",
      item: "column",
      material: "royal impala",
      length: "22",
      width: "75",
      thick: "10 - 8",
      m3: "0.017",
    },
  },
  {
    name: "Headstone with simple thickness",
    tokens: ["1", "headstone", "royal", "impala", "56", "87", "8", "0.039"],
    order: "12-008",
    client: "Miali",
    expected: {
      order: "12-008",
      client: "Miali",
      pcs: "1",
      item: "headstone",
      material: "royal impala",
      length: "56",
      width: "87",
      thick: "8",
      m3: "0.039",
    },
  },
  {
    name: "Tombstone with left modifier",
    tokens: [
      "1",
      "tombstone",
      "left",
      "royal",
      "impala",
      "180",
      "25",
      "8",
      "0.036",
    ],
    order: "12-008",
    client: "Miali",
    expected: {
      order: "12-008",
      client: "Miali",
      pcs: "1",
      item: "tombstone left",
      material: "royal impala",
      length: "180",
      width: "25",
      thick: "8",
      m3: "0.036",
    },
  },
  {
    name: "Decimal width value",
    tokens: ["2", "column", "white", "marble", "30.5", "12", "5", "0.012"],
    order: "13-001",
    client: "TestClient",
    expected: {
      order: "13-001",
      client: "TestClient",
      pcs: "2",
      item: "column",
      material: "white marble",
      length: "30.5",
      width: "12",
      thick: "5",
      m3: "0.012",
    },
  },
];

let passed = 0;
let failed = 0;

tests.forEach((test, idx) => {
  try {
    const result = assignColumns(test.tokens, test.order, test.client);

    // Check if all expected fields match
    let allMatch = true;
    const errors = [];

    for (const [key, expectedVal] of Object.entries(test.expected)) {
      if (result[key] !== expectedVal) {
        allMatch = false;
        errors.push(
          `  ${key}: got "${result[key]}", expected "${expectedVal}"`
        );
      }
    }

    if (allMatch) {
      console.log(`✅ Test ${idx + 1} PASSED: ${test.name}`);
      passed++;
    } else {
      console.log(`❌ Test ${idx + 1} FAILED: ${test.name}`);
      errors.forEach((e) => console.log(e));
      failed++;
    }

    console.log(`   Result:`, JSON.stringify(result, null, 2));
    console.log("");
  } catch (err) {
    console.log(`❌ Test ${idx + 1} ERROR: ${test.name}`);
    console.log(`   Error: ${err.message}`);
    failed++;
  }
});

console.log(`\n=== SUMMARY ===`);
console.log(`Passed: ${passed}/${tests.length}`);
console.log(`Failed: ${failed}/${tests.length}`);

process.exit(failed > 0 ? 1 : 0);
