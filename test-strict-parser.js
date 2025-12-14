const assert = require('assert');
const assignColumns = require('./utils/assignColumns_strict'); // We will create this file

console.log("Running tests for strict dimension parser...");

function runTest(name, inputTokens, expected) {
    const result = assignColumns.parseDimensions(inputTokens);
    try {
        assert.deepStrictEqual(result, expected, `Test failed: ${name}`);
        console.log(`✅ Test passed: ${name}`);
    } catch (error) {
        console.error(`❌ ${error.message}`);
        console.error('   Input:', inputTokens);
        console.error('  Actual:', result);
        console.error('Expected:', expected);
    }
}

// 9. Required Test Cases from the prompt
runTest(
    "Length as a decimal range",
    ["63,3-10", "other", "tokens"],
    { length: "63.3 - 10", width: "", thick: "" }
);

runTest(
    "Simple width",
    ["some", "text", "59"],
    { length: "", width: "59", thick: "" }
);

runTest(
    "Single-digit width",
    ["6", "a", "b"],
    { length: "", width: "6", thick: "" }
);

runTest(
    "Simple thick",
    ["12", "text"],
    { length: "", width: "", thick: "12" }
);

runTest(
    "Single-digit thick",
    ["other", "6"],
    // This is ambiguous. Without positional rules, it could be width or thick.
    // The spec says "discard if matches more than one pattern".
    // Let's assume a priority: if it fits thick, it can be thick.
    // Let's assume width is prioritized if unassigned.
    { length: "", width: "6", thick: "" } 
);

runTest(
    "Distinguishing thick and width",
    ["59", "6"], // Should be width: 59, thick: 6
    { length: "", width: "59", thick: "6" }
);

runTest(
    "Invalid width (too many digits)",
    ["1234", "59", "10"],
    { length: "", width: "59", thick: "10" }
);

runTest(
    "Invalid token with valid ones",
    ["66 6", "59", "12"], // "66 6" is not a valid token and should be ignored
    { length: "", width: "59", thick: "12" }
);

runTest(
    "Full set of dimensions L/W/T",
    ["250", "60", "12"],
    { length: "250", width: "60", thick: "12" }
);

runTest(
    "Full set with range",
    ["100-200", "50,5-70", "10"],
    { length: "100 - 200", width: "50.5 - 70", thick: "10" }
);

runTest(
    "Invalid range format",
    ["59-6-2", "100", "10"],
    { length: "100", width: "", thick: "10" }
);

runTest(
    "Rejected tokens with valid ones",
    ["636", "6.6.6", "120", "15"],
    { length: "120", width: "", thick: "15" }
);

runTest(
    "Handles empty input",
    [],
    { length: "", width: "", thick: "" }
);

runTest(
    "Handles only invalid tokens",
    ["abc", "---", "6.6.6"],
    { length: "", width: "", thick: "" }
);

console.log("\nTest execution finished.");
