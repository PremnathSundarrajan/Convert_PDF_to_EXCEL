const assert = require("assert");
const assignColumns = require("./utils/assignColumns_refactored");

function runTest(description, input, expected) {
  const result = assignColumns(input.tokens, input.order, input.client);
  try {
    assert.deepStrictEqual(result, expected);
    console.log(`✔ PASSED: ${description}`);
  } catch (error) {
    console.error(`✖ FAILED: ${description}`);
    console.error("  Input:", input);
    console.error("  Expected:", expected);
    console.error("  Actual:", result);
    process.exit(1); // Exit with error code on failure
  }
}

// ============================================================================ 
// TEST CASES
// ============================================================================ 

// Test Case 1: Range format with comma decimal `63,3-10`
runTest(
  "should normalize range with comma decimal `63,3-10` to `63.3 - 10`",
  { tokens: ["item", "material", "63,3-10", "10", "10", "0.1"] },
  {
    order: "",
    client: "",
    pcs: "",
    item: "item",
    material: "material",
    length: "63.3 - 10",
    width: "10",
    thick: "10",
    m3: "0.1",
  }
);

// Test Case 2: Single digit width `6` should not become `66`
runTest(
  "should keep single digit width `6` as `6`",
  { tokens: ["item", "material", "100", "6", "10", "0.1"] },
  {
    order: "",
    client: "",
    pcs: "",
    item: "item",
    material: "material",
    length: "100",
    width: "6",
    thick: "10",
    m3: "0.1",
  }
);

// Test Case 3: Duplicated single digit width `66` should become `6`
runTest(
  "should correct duplicated width `66` to `6`",
  { tokens: ["item", "material", "100", "66", "10", "0.1"] },
  {
    order: "",
    client: "",
    pcs: "",
    item: "item",
    material: "material",
    length: "100",
    width: "6",
    thick: "10",
    m3: "0.1",
  }
);

// Test Case 4: Length and width max 3 digits (integer)
runTest(
  "should truncate length and width to 3 digits for integers",
  { tokens: ["item", "material", "1234", "5678", "10", "0.1"] },
  {
    order: "",
    client: "",
    pcs: "",
    item: "item",
    material: "material",
    length: "123",
    width: "567",
    thick: "10",
    m3: "0.1",
  }
);

// Test Case 5: Thick max 2 digits (integer)
runTest(
  "should truncate thick to 2 digits for integers",
  { tokens: ["item", "material", "100", "100", "123", "0.1"] },
  {
    order: "",
    client: "",
    pcs: "",
    item: "item",
    material: "material",
    length: "100",
    width: "100",
    thick: "12",
    m3: "0.1",
  }
);

// Test Case 6: Range format with comma `43,2-19`
runTest(
  "should normalize range with comma `43,2-19` to `43.2 - 19`",
  { tokens: ["item", "material", "43,2-19", "10", "10", "0.1"] },
  {
    order: "",
    client: "",
    pcs: "",
    item: "item",
    material: "material",
    length: "43.2 - 19",
    width: "10",
    thick: "10",
    m3: "0.1",
  }
);

// Test Case 7: Decimal values should not be truncated
runTest(
  "should not truncate decimal values that are within the digit limit",
  { tokens: ["item", "material", "123.4", "56.78", "1.2", "0.1"] },
  {
    order: "",
    client: "",
    pcs: "",
    item: "item",
    material: "material",
    length: "123.4",
    width: "56.78",
    thick: "1.2",
    m3: "0.1",
  }
);

// Test Case 8: Repeating width and thick values
runTest(
  "should correctly assign width and thick even with duplicate tokens",
  { tokens: ["item", "material", "100", "50", "50", "10", "0.1"] },
  {
    order: "",
    client: "",
    pcs: "",
    item: "item",
    material: "material",
    length: "100",
    width: "50",
    thick: "50",
    m3: "0.1",
  }
);

// Test Case 9: Concatenated width and thick `106` should be split
runTest(
  "should split concatenated token `106` into `10` and `6`",
  { tokens: ["item", "material", "120", "106", "0.1"] },
  {
    order: "",
    client: "",
    pcs: "",
    item: "item",
    material: "material",
    length: "120",
    width: "10",
    thick: "6",
    m3: "0.1",
  }
);

// Test Case 10: Valid 3-digit number should not be split
runTest(
  "should not split valid 3-digit number like `120`",
  { tokens: ["item", "material", "120", "50", "10", "0.1"] },
  {
    order: "",
    client: "",
    pcs: "",
    item: "item",
    material: "material",
    length: "120",
    width: "50",
    thick: "10",
    m3: "0.1",
  }
);


console.log("\nAll dimension normalization tests passed!");