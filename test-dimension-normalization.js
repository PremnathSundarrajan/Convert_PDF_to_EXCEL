#!/usr/bin/env node

/**
 * Test Suite for Dimension Normalization in assignColumns
 *
 * This suite focuses on validating the fixes for dimension parsing,
 * including single-digit handling and range formatting.
 */

const assignColumns = require("./utils/assignColumns_refactored");

console.log(`
╔════════════════════════════════════════════════════════════════════╗
║           assignColumns - DIMENSION NORMALIZATION Test Suite         ║
╚════════════════════════════════════════════════════════════════════╝
`);

const order = "PN-TEST";
const client = "Gemini";

const testCases = [
  {
    name: "Single-digit width should not be duplicated",
    tokens: ["1", "item", "material", "100", "6", "10", "0.006"],
    expected: {
      order: "PN-TEST",
      client: "Gemini",
      pcs: "1",
      item: "item",
      material: "material",
      length: "100",
      width: "6", // Must not become "66"
      thick: "10",
      m3: "0.006",
    },
  },
  {
    name: "Comma-dash format normalization (e.g., 43,2-19 -> 43.2 - 19)",
    tokens: ["1", "item", "material", "100", "43,2-19", "10", "0.05"],
    expected: {
      order: "PN-TEST",
      client: "Gemini",
      pcs: "1",
      item: "item",
      material: "material",
      length: "100",
      width: "43.2 - 19",
      thick: "10",
      m3: "0.05",
    },
  },
  {
    name: "Simple comma to dot normalization in dimension",
    tokens: ["1", "item", "material", "63,3", "20", "10", "0.012"],
    expected: {
      order: "PN-TEST",
      client: "Gemini",
      pcs: "1",
      item: "item",
      material: "material",
      length: "63.3",
      width: "20",
      thick: "10",
      m3: "0.012",
    },
  },
  {
      name: "Width range normalization with spaces",
      tokens: ["1", "item", "material", "100", "59-57", "10", "0.05"],
      expected: {
        order: "PN-TEST",
        client: "Gemini",
        pcs: "1",
        item: "item",
        material: "material",
        length: "100",
        width: "59 - 57",
        thick: "10",
        m3: "0.05",
      },
  },
  {
    name: "Length max 3 digits validation (e.g. 123)",
    tokens: ["1", "item", "material", "123", "50", "10", "0.061"],
    expected: {
        order: "PN-TEST",
        client: "Gemini",
        pcs: "1",
        item: "item",
        material: "material",
        length: "123",
        width: "50",
        thick: "10",
        m3: "0.061",
    },
  },
  {
    name: "Width max 3 digits validation (e.g. 456)",
    tokens: ["1", "item", "material", "100", "456", "10", "0.456"],
    expected: {
        order: "PN-TEST",
        client: "Gemini",
        pcs: "1",
        item: "item",
        material: "material",
        length: "100",
        width: "456",
        thick: "10",
        m3: "0.456",
    },
  },
  {
    name: "Thick max 2 digits validation (e.g. 99)",
    tokens: ["1", "item", "material", "100", "50", "99", "4.95"],
    expected: {
        order: "PN-TEST",
        client: "Gemini",
        pcs: "1",
        item: "item",
        material: "material",
        length: "100",
        width: "50",
        thick: "99",
        m3: "4.95",
    },
  },
    {
    name: "Thick range format normalization",
    tokens: ["1", "item", "material", "100", "50", "10-8", "0.045"],
    expected: {
        order: "PN-TEST",
        client: "Gemini",
        pcs: "1",
        item: "item",
        material: "material",
        length: "100",
        width: "50",
        thick: "10 - 8",
        m3: "0.045",
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

  let testPassed = true;
  const errors = [];

  for (const [key, expectedValue] of Object.entries(testCase.expected)) {
    const resultValue = result[key];
    if (resultValue !== expectedValue) {
      testPassed = false;
      errors.push(
        `  ❌ ${key}: expected "${expectedValue}", got "${resultValue}"`);
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
`);
