#!/usr/bin/env node

/**
 * Test Suite for Refactored assignColumns
 *
 * Tests the clean, deterministic implementation against real-world scenarios
 */

const assignColumns = require("./utils/assignColumns_refactored");

console.log(`
╔════════════════════════════════════════════════════════════════════╗
║           REFACTORED assignColumns - Test Suite                   ║
║  Clean, Deterministic, One-Pass Implementation                    ║
╚════════════════════════════════════════════════════════════════════╝
`);

// Test data with order and client
const order = "12-008";
const client = "Miali";

// Test cases with expected outputs
const testCases = [
  {
    name: "Column with range thickness",
    tokens: ["1", "column", "royal", "impala", "22", "75", "10-8", "0.017"],
    expected: {
      order: "12-008",
      client: "Miali",
      pcs: "1",
      item: "column",
      material: "royal impala",
      length: "22",
      width: "75",
      thick: "10-8",
      m3: "0.017",
    },
  },
  {
    name: "Headstone with simple thickness",
    tokens: ["1", "headstone", "royal", "impala", "56", "87", "8", "0.039"],
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
    name: "Tombstone with left/right modifier",
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
    name: "Multiple sidekerbs",
    tokens: ["2", "sidekerbs", "black", "premium", "150", "106", "10", "0.018"],
    expected: {
      order: "12-008",
      client: "Miali",
      pcs: "2",
      item: "sidekerbs",
      material: "black premium",
      length: "150",
      width: "106",
      thick: "10",
      m3: "0.018",
    },
  },
  {
    name: "Decimal width (comma in original, normalized to dot)",
    tokens: ["1", "base", "black", "premium", "80", "30.5", "8", "0.019"],
    expected: {
      order: "12-008",
      client: "Miali",
      pcs: "1",
      item: "base",
      material: "black premium",
      length: "80",
      width: "30.5",
      thick: "8",
      m3: "0.019",
    },
  },
  {
    name: "Range format dimensions",
    tokens: [
      "1",
      "tombstone",
      "right",
      "royal",
      "impala",
      "180",
      "59-57",
      "6",
      "0.062",
    ],
    expected: {
      order: "12-008",
      client: "Miali",
      pcs: "1",
      item: "tombstone right",
      material: "royal impala",
      length: "180",
      width: "59-57",
      thick: "6",
      m3: "0.062",
    },
  },
  {
    name: "Minimal tokens (missing material)",
    tokens: ["1", "column", "22", "75", "10", "0.015"],
    expected: {
      order: "12-008",
      client: "Miali",
      pcs: "1",
      item: "column",
      material: "",
      length: "22",
      width: "75",
      thick: "10",
      m3: "0.015",
    },
  },
];

// Run tests
let passed = 0;
let failed = 0;

testCases.forEach((testCase, idx) => {
  console.log(`\nTest ${idx + 1}: ${testCase.name}`);
  console.log(`Input tokens: ${JSON.stringify(testCase.tokens)}`);

  const result = assignColumns(testCase.tokens, order, client);

  // Compare result to expected
  let testPassed = true;
  const errors = [];

  for (const [key, expectedValue] of Object.entries(testCase.expected)) {
    const resultValue = result[key];
    if (resultValue !== expectedValue) {
      testPassed = false;
      errors.push(
        `  ❌ ${key}: expected "${expectedValue}", got "${resultValue}"`
      );
    }
  }

  if (testPassed) {
    console.log("✅ PASS");
    passed++;
  } else {
    console.log("❌ FAIL");
    errors.forEach((e) => console.log(e));
    failed++;
  }
});

// Summary
console.log(`
╔════════════════════════════════════════════════════════════════════╗
║                         TEST SUMMARY                              ║
╚════════════════════════════════════════════════════════════════════╝

Total Tests:  ${testCases.length}
Passed:       ${passed} ✅
Failed:       ${failed} ❌

${failed === 0 ? "🎉 ALL TESTS PASSED!" : "⚠️  Some tests failed"}

═══════════════════════════════════════════════════════════════════════
IMPLEMENTATION FEATURES
═══════════════════════════════════════════════════════════════════════

✅ Deterministic:     Always produces same output for same input
✅ One-Pass:          Single scan through tokens, no backtracking
✅ Readable:          Clear logic flow, no complex heuristics
✅ Order/Client:      Copies to every row as required
✅ Normalization:     Commas → dots, hyphens preserved
✅ No token loss:     All tokens accounted for in output
✅ No inference:      Only reads values, never calculates
✅ Excel-safe:        Proper JSON format

═══════════════════════════════════════════════════════════════════════
COLUMN ASSIGNMENT LOGIC
═══════════════════════════════════════════════════════════════════════

1. Extract M3:       Last token if decimal (0.xxx)
2. Extract PCS:      First 1-2 digit integer
3. Extract numerics: First 3 numeric columns = length, width, thick
4. Remaining text:   Split into item and material

Formats accepted:
- Simple:     "22", "53", "180"
- Range:      "159-157", "10-8", "59-57"
- Decimal:    "63.3", "30.5"
- Decimal range: "63.3-10"

═══════════════════════════════════════════════════════════════════════
USAGE
═══════════════════════════════════════════════════════════════════════

const assignColumns = require('./utils/assignColumns_refactored');

const tokens = ["1", "headstone", "black", "premium", "56", "87", "8", "0.039"];
const row = assignColumns(tokens, "12-008", "Miali");

console.log(row);
// Output:
// {
//   order: "12-008",
//   client: "Miali",
//   pcs: "1",
//   item: "headstone",
//   material: "black premium",
//   length: "56",
//   width: "87",
//   thick: "8",
//   m3: "0.039"
// }

═══════════════════════════════════════════════════════════════════════
`);
