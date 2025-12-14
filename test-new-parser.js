const assert = require("assert");
const assignColumns = require("./utils/assignColumns_refactored");

// Test suite for the refactored assignColumns function

const testCases = [
  // 9. Required Test Cases from user
  {
    desc: "Length as decimal range",
    input: ["63,3-10", "50", "10"],
    expected: { length: "63.3 - 10", width: "50", thick: "10" },
  },
  {
    desc: "Simple case with single-digit width and thick",
    input: ["120", "6", "8"],
    expected: { length: "120", width: "6", thick: "8" },
  },
  {
    desc: "Width as a single number",
    input: ["200", "59", "12"],
    expected: { length: "200", width: "59", thick: "12" },
  },
  {
    desc: "Thick as a single number",
    input: ["150", "40", "6"],
    expected: { length: "150", width: "40", thick: "6" },
  },
  {
    desc: "Thick as a two-digit number",
    input: ["180", "50", "12"],
    expected: { length: "180", width: "50", thick: "12" },
  },
  {
    desc: "Invalid width (too many digits) should be rejected",
    input: ["100", "1234", "10"],
    expected: { length: "100", width: "", thick: "10" },
  },
  {
    desc: "Invalid token with multiple numbers should be rejected",
    input: ["100", "66 6", "10"],
    expected: { length: "100", width: "", thick: "10", item: "66 6" },
  },
  {
    desc: "Single-digit width should not be duplicated",
    input: ["150", "6", "10"],
    expected: { length: "150", width: "6", thick: "10" },
  },
  // Additional tests for robustness
  {
    desc: "Column overlap case from user (width: 10, thick: 6)",
    input: ["200", "10", "6"],
    // CURRENT BUG: would likely produce width: "", thick: "10" or something worse.
    // EXPECTED FIX: should correctly identify width and thick.
    expected: { length: "200", width: "10", thick: "6" },
  },
  {
    desc: "Missing thick value",
    input: ["100", "50"],
    expected: { length: "100", width: "50", thick: "" },
  },
  {
    desc: "Missing width value",
    input: ["100", "10"],
    // This is tricky. "10" is valid for both width and thick.
    // Rule #6 says: "If a token matches more than one column pattern -> discard it."
    // So "10" should be discarded, leaving both blank.
    expected: { length: "100", width: "", thick: "" },
  },
  {
    desc: "No valid dimension tokens",
    input: ["Some", "other", "text"],
    expected: { length: "", width: "", thick: "", item: "Some other text" },
  },
  {
    desc: "Range normalization with spaces",
    input: ["12-34", "40", "5"],
    expected: { length: "12 - 34", width: "40", thick: "5" },
  },
   {
    desc: "Range normalization with comma and spaces",
    input: ["43,2-19", "40", "5"],
    expected: { length: "43.2 - 19", width: "40", thick: "5" },
  }
];

let failed = 0;
let passed = 0;

console.log("Running tests for assignColumns...");

testCases.forEach((test, index) => {
  const result = assignColumns(test.input);
  const testId = `#${index + 1}`.padStart(3, "0");
  try {
    assert.strictEqual(
      result.length,
      test.expected.length,
      "Length does not match"
    );
    assert.strictEqual(
      result.width,
      test.expected.width,
      "Width does not match"
    );
    assert.strictEqual(
      result.thick,
      test.expected.thick,
      "Thick does not match"
    );
    // Also check 'item' field for cases where tokens are unassigned
    if(test.expected.item) {
       assert.strictEqual(
      result.item,
      test.expected.item,
      "Item does not match"
    );
    }
    console.log(`[${testId}] ✅ PASSED: ${test.desc}`);
    passed++;
  } catch (error) {
    console.error(`[${testId}] ❌ FAILED: ${test.desc}`);
    console.error(`  Input: ${JSON.stringify(test.input)}`);
    console.error(
      `  Expected: ${JSON.stringify(
        test.expected
      )}
  Actual:   ${JSON.stringify({
        length: result.length,
        width: result.width,
        thick: result.thick,
        item: result.item
      })}`
    );
    console.error(`  Error: ${error.message}
`);
    failed++;
  }
});

console.log(`\nTests finished. Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
    // Exit with a non-zero code to indicate test failure
    process.exit(1);
}
