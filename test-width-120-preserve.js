/**
 * Regression test: Ensure width values like "120" are preserved (not truncated to "12")
 * This tests the exact scenario from RCGG 12-001 PDF where kerbs/sidekerbs had width=120
 */

const assignColumns = require('./utils/assignColumns_refactored');

console.log('=== Testing Width Preservation (120 should stay 120) ===\n');

const testCases = [
  {
    name: 'kerbs: 120 width with 10 thick (should NOT merge or truncate)',
    tokens: ['2', 'kerbs', 'black', 'premium', '95', '120', '10', '0,023'],
    expected: { pcs: '2', item: 'kerbs', material: 'black premium', length: '95', width: '120', thick: '10', m3: '0.023' },
  },
  {
    name: 'sidekerbs: 120 width with 10 thick (should NOT merge or truncate)',
    tokens: ['2', 'sidekerbs', 'black', 'premium', '176', '120', '10', '0,042'],
    expected: { pcs: '2', item: 'sidekerbs', material: 'black premium', length: '176', width: '120', thick: '10', m3: '0.042' },
  },
  {
    name: 'base: 30 width with 8 thick (normal case, ensure no regression)',
    tokens: ['1', 'base', 'black', 'premium', '80', '30', '8', '0,019'],
    expected: { pcs: '1', item: 'base', material: 'black premium', length: '80', width: '30', thick: '8', m3: '0.019' },
  },
  {
    name: 'sidekerbs: 106 width with 10 thick (3-digit width preservation)',
    tokens: ['2', 'sidekerbs', 'black', 'premium', '150', '106', '10', '0,018'],
    expected: { pcs: '2', item: 'sidekerbs', material: 'black premium', length: '150', width: '106', thick: '10', m3: '0.018' },
  },
];

let passed = 0;
let failed = 0;

testCases.forEach((testCase, idx) => {
  try {
    const result = assignColumns(testCase.tokens, '12-001', 'Maes');

    // Check key fields
    const checks = {
      pcs: result.pcs === testCase.expected.pcs,
      item: result.item === testCase.expected.item,
      material: result.material === testCase.expected.material,
      length: result.length === testCase.expected.length,
      width: result.width === testCase.expected.width,
      thick: result.thick === testCase.expected.thick,
      m3: result.m3 === testCase.expected.m3,
    };

    const allPassed = Object.values(checks).every(v => v === true);

    if (allPassed) {
      console.log(`✅ Test ${idx + 1} PASSED: ${testCase.name}`);
      console.log(`   Width: ${result.width} (expected: ${testCase.expected.width})`);
      console.log(`   Item: ${result.item}`);
      console.log(`   Length: ${result.length}, Width: ${result.width}, Thick: ${result.thick}\n`);
      passed++;
    } else {
      console.log(`❌ Test ${idx + 1} FAILED: ${testCase.name}`);
      console.log(`   Expected: ${JSON.stringify(testCase.expected, null, 2)}`);
      console.log(`   Got: ${JSON.stringify(result, null, 2)}`);
      console.log(`   Checks: ${JSON.stringify(checks, null, 2)}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ Test ${idx + 1} ERROR: ${testCase.name}`);
    console.log(`   Error: ${error.message}\n`);
    failed++;
  }
});

console.log('=== SUMMARY ===');
console.log(`Passed: ${passed}/${testCases.length}`);
console.log(`Failed: ${failed}/${testCases.length}`);

if (failed > 0) {
  process.exit(1);
}
