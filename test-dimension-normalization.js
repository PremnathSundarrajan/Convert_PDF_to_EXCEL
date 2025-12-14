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


console.log("\nAll dimension normalization tests passed!");
