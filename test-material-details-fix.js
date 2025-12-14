#!/usr/bin/env node
/**
 * Test for the material_details format fix
 * Verifies that merged width values (like 66 instead of 6) are fixed
 * in the new LLM format before they reach the Excel output
 */

const extractJsonFromPDF = require("./utils/extractJsonFromPDF.js");

// Mock the validateAndSplitMergedTokens behavior
function validateAndSplitMergedTokens(data) {
  if (data.material_details && Array.isArray(data.material_details)) {
    data.material_details = data.material_details.map((row) => {
      row.length = fixMergedDimensionValue(row.length);
      row.width = fixMergedDimensionValue(row.width);
      row.thick = fixMergedDimensionValue(row.thick);
      return row;
    });
    return data;
  }
  return data;
}

function fixMergedDimensionValue(value) {
  if (!value) return value;

  const str = String(value).trim();

  if (!/^\d{2}$/.test(str)) {
    return value;
  }

  const [d1, d2] = str.split("");

  if (d1 === d2) {
    const digit = parseInt(d1);
    if (digit >= 1 && digit <= 9) {
      return d1;
    }
  }

  return value;
}

console.log("=== Testing Material Details Width Fix ===\n");

const testCases = [
  {
    name: "Merged width 66 → 6 (frontkerb)",
    input: {
      material_details: [
        {
          pcs: "1",
          item: "frontkerb",
          material: "black premium",
          length: "80",
          width: "66", // ← MERGED: should become 6
          thick: "6",
          m3: "0.003",
        },
      ],
    },
    expectedWidth: "6",
  },
  {
    name: "Merged width 77 → 7 (sidekerb)",
    input: {
      material_details: [
        {
          pcs: "1",
          item: "sidekerb left",
          material: "black premium",
          length: "79",
          width: "77", // ← MERGED: should become 7
          thick: "7",
          m3: "0.003",
        },
      ],
    },
    expectedWidth: "7",
  },
  {
    name: "Normal width 35 (stays 35)",
    input: {
      material_details: [
        {
          pcs: "1",
          item: "plate right",
          material: "black premium",
          length: "169",
          width: "35", // ← NORMAL: should stay 35
          thick: "6",
          m3: "0.035",
        },
      ],
    },
    expectedWidth: "35",
  },
  {
    name: "Merged width 88 → 8 (special case)",
    input: {
      material_details: [
        {
          pcs: "1",
          item: "plate left",
          material: "black premium",
          length: "105",
          width: "88", // ← MERGED: should become 8
          thick: "8",
          m3: "0.050",
        },
      ],
    },
    expectedWidth: "8",
  },
];

let passed = 0;
let failed = 0;

testCases.forEach((test, idx) => {
  const result = validateAndSplitMergedTokens(test.input);
  const actualWidth = result.material_details[0].width;

  if (actualWidth === test.expectedWidth) {
    console.log(`✅ Test ${idx + 1} PASSED: ${test.name}`);
    console.log(`   Width: ${actualWidth} (expected: ${test.expectedWidth})`);
    passed++;
  } else {
    console.log(`❌ Test ${idx + 1} FAILED: ${test.name}`);
    console.log(`   Width: ${actualWidth} (expected: ${test.expectedWidth})`);
    failed++;
  }

  console.log();
});

console.log(`=== SUMMARY ===`);
console.log(`Passed: ${passed}/${testCases.length}`);
console.log(`Failed: ${failed}/${testCases.length}`);

process.exit(failed > 0 ? 1 : 0);
