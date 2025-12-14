#!/usr/bin/env node

/**
 * Test Suite for Refactored assignColumns
 *
 * Tests the strict parsing logic based on explicit rules.
 */

const assignColumns = require("./utils/assignColumns_refactored");

console.log(`
╔════════════════════════════════════════════════════════════════════╗
║             STRICT assignColumns - Test Suite                     ║
║           Rule-Based, Non-Positional Implementation               ║
╚════════════════════════════════════════════════════════════════════╝
`);

// Test data with order and client
const order = "24-001";
const client = "TestClient";

// New test cases based on the strict rules
const newTestCases = [
  {
    name: "Rule 4 & 9: Normalize decimal range for length",
    tokens: ["1", "item", "63,3-10", "50", "5"],
    expected: {
      length: "63.3 - 10",
      width: "50",
      thick: "5",
    },
  },
  {
    name: "Rule 9: Simple single-digit width",
    tokens: ["1", "item", "100", "6", "10"],
    expected: {
      length: "100",
      width: "6",
      thick: "10",
    },
  },
    {
    name: "Rule 9: Simple two-digit width",
    tokens: ["1", "item", "120", "59", "12"],
    expected: {
      length: "120",
      width: "59",
      thick: "12",
    },
  },
  {
    name: "Rule 9: Simple single-digit thick",
    tokens: ["1", "item", "150", "80", "6"],
    expected: {
      length: "150",
      width: "80",
      thick: "6",
    },
  },
  {
    name: "Rule 9: Simple two-digit thick",
    tokens: ["1", "item", "200", "90", "12"],
    expected: {
      length: "200",
      width: "90",
      thick: "12",
    },
  },
  {
    name: "Rule 3 & 9: Reject width with > 3 digits",
    tokens: ["1", "item", "100", "1234", "10"],
    expected: {
      length: "100",
      width: "",
      thick: "10",
    },
  },
    {
    name: "Rule 3: Reject thick with > 2 digits",
    tokens: ["1", "item", "100", "50", "123"],
    expected: {
      length: "100",
      width: "50",
      thick: "",
    },
  },
  {
    name: "Rule 5 & 9: Handle invalid overlap '66 6 59'",
    tokens: ["1", "item", "66", "6", "59"],
    expected: {
      length: "",
      width: "59", // 66 is ambiguous (L/W), 6 is ambiguous (L/W/T)
      thick: "",
    },
  },
  {
    name: "Rule 6: Discard token '50' as it is ambiguous (L/W/T)",
    tokens: ["1", "item", "50"],
    expected: {
      length: "",
      width: "",
      thick: "",
    },
  },
  {
    name: "Rule 7: Handle multiple valid 'thick' tokens -> ambiguous",
    tokens: ["1", "item", "100", "8", "9"],
    expected: {
      length: "100",
      width: "",
      thick: "", // Ambiguous because both 8 and 9 are valid for thick
    },
  },
    {
    name: "Rule 2 & 5: Reject invalid token '59-6-2'",
    tokens: ["1", "item", "100", "59-6-2", "10"],
    expected: {
      length: "100",
      width: "",
      thick: "10",
    },
  },
  {
    name: "Rule 2: Reject invalid token '6.66.6'",
    tokens: ["1", "item", "100", "6.66.6", "10"],
    expected: {
      length: "100",
      width: "",
      thick: "10",
    },
  },
  {
      name: "Rule 1 & 7: Correctly assign from a complex set of tokens",
      tokens: ["1", "item", "200", "50", "10"], // 200 is L/W, 50 is L/W/T, 10 is L/W/T
      expected: {
          length: "200",
          width: "50",
          thick: "10",
      },
  },
  {
      name: "Unambiguous thick value with ambiguous L/W",
      tokens: ["1", "item", "150", "12"],
      expected: {
          length: "150",
          width: "",
          thick: "12",
      },
  },
];


// Run tests
let passed = 0;
let failed = 0;

newTestCases.forEach((testCase, idx) => {
  console.log(`\nTest ${idx + 1}: ${testCase.name}`);
  console.log(`Input tokens: ${JSON.stringify(testCase.tokens)}`);

  // We pass only the relevant tokens for dimensions to the function
  const dimensionTokens = testCase.tokens.filter(t => !isNaN(parseFloat(t.replace(',', '.'))) || t.includes('-'));
  
  const result = assignColumns(testCase.tokens, order, client);

  // Compare result to expected for the dimension keys
  let testPassed = true;
  const errors = [];

  for (const [key, expectedValue] of Object.entries(testCase.expected)) {
    if (result[key] !== expectedValue) {
      testPassed = false;
      errors.push(
        `  ❌ ${key}: expected "${expectedValue}", got "${result[key]}"`);
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

Total Tests:  ${newTestCases.length}
Passed:       ${passed} ✅
Failed:       ${failed} ❌

${failed === 0 ? "🎉 ALL TESTS PASSED!" : "⚠️  Some tests failed"}
`);