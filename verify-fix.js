const assignColumns = require("./utils/assignColumns");

// Test case: flowerblock with tokens ["1","flowerblock","black","premium","15","15","0,003"]
const testTokens = [
  "1",
  "flowerblock",
  "black",
  "premium",
  "15",
  "15",
  "0,003",
];

try {
  const result = assignColumns(testTokens);
  console.log("✅ Result:", result);

  if (result.width === "15" && result.thick === "15") {
    console.log("✅ SUCCESS: Width and thick are both 15!");
  } else {
    console.log(`❌ FAIL: Width=${result.width}, Thick=${result.thick}`);
  }
} catch (e) {
  console.error("❌ Error:", e.message);
}
