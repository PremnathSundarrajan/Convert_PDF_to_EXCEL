const assignColumns = require("./utils/assignColumns");

// Test case 1: Thick with range format (10-8)
const testTokens1 = [
  "1",
  "plate",
  "black",
  "premium",
  "169",
  "35",
  "10-8",
  "0,035",
];

console.log("Test 1: Thick with range format (10-8)");
try {
  const result = assignColumns(testTokens1);
  console.log("✅ Success:", JSON.stringify(result, null, 2));
} catch (e) {
  console.error("❌ Failed:", e.message);
}

console.log("\n---\n");

// Test case 2: Item name that could match a column (e.g., "material")
const testTokens2 = [
  "1",
  "material",
  "black",
  "premium",
  "53",
  "62",
  "8",
  "0,026",
];

console.log("Test 2: Item name that matches a column name");
try {
  const result = assignColumns(testTokens2);
  console.log("✅ Success:", JSON.stringify(result, null, 2));
} catch (e) {
  console.error("❌ Failed:", e.message);
}

console.log("\n---\n");

// Test case 3: Width with range and thick with range
const testTokens3 = [
  "1",
  "gardenkerb",
  "indian",
  "aurora",
  "100",
  "63,3-10",
  "8-6",
  "0,051",
];

console.log("Test 3: Width with decimal-range AND thick with range");
try {
  const result = assignColumns(testTokens3);
  console.log("✅ Success:", JSON.stringify(result, null, 2));
} catch (e) {
  console.error("❌ Failed:", e.message);
}
