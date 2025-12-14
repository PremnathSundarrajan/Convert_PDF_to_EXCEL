#!/usr/bin/env node

const assignColumns = require('./utils/assignColumns_refactored.js');

console.log('=== Testing Against Excel Data ===\n');

// Based on user's Excel screenshot:
// Row 2: headstone black premium, length=80, width=75, thick=8
// Row 3: kerbs black premium, length=95, width=12, thick=10  
// Row 4: sidekerbs black premium, length=176, width=12, thick=10
// Row 5: tombstone black premium, length=180, width=80, thick=6

console.log('Expected Excel Data Structure:');
console.log('  item | material | length | width | thick');
console.log('  -----+----------+--------+-------+------');
console.log('  headstone | black premium | 80 | 75 | 8');
console.log('  kerbs | black premium | 95 | 12 | 10');
console.log('  sidekerbs | black premium | 176 | 12 | 10');
console.log('  tombstone | black premium | 180 | 80 | 6\n');

// Simulating how tokens would come from PDF extraction
// (pcs, followed by material description tokens, followed by dimensions)

const testCases = [
    {
        name: 'Row 2: headstone',
        tokens: ['1', 'headstone', 'black', 'premium', '80', '75', '8'],
        expectedItem: 'headstone',
        expectedMaterial: 'black premium',
        expectedLength: '80',
        expectedWidth: '75',
        expectedThick: '8',
    },
    {
        name: 'Row 3: kerbs',
        tokens: ['2', 'kerbs', 'black', 'premium', '95', '12', '10'],
        expectedItem: 'kerbs',
        expectedMaterial: 'black premium',
        expectedLength: '95',
        expectedWidth: '12',
        expectedThick: '10',
    },
    {
        name: 'Row 4: sidekerbs',
        tokens: ['2', 'sidekerbs', 'black', 'premium', '176', '12', '10'],
        expectedItem: 'sidekerbs',
        expectedMaterial: 'black premium',
        expectedLength: '176',
        expectedWidth: '12',
        expectedThick: '10',
    },
    {
        name: 'Row 5: tombstone',
        tokens: ['1', 'tombstone', 'black', 'premium', '180', '80', '6'],
        expectedItem: 'tombstone',
        expectedMaterial: 'black premium',
        expectedLength: '180',
        expectedWidth: '80',
        expectedThick: '6',
    },
];

let passed = 0;
let failed = 0;

testCases.forEach((test) => {
    const result = assignColumns(test.tokens, '12-001', 'Maes');
    
    const itemOK = result.item === test.expectedItem;
    const materialOK = result.material === test.expectedMaterial;
    const lengthOK = result.length === test.expectedLength;
    const widthOK = result.width === test.expectedWidth;
    const thickOK = result.thick === test.expectedThick;
    
    const allOK = itemOK && materialOK && lengthOK && widthOK && thickOK;
    
    console.log(`${test.name}:`);
    console.log(`  item: "${result.item}" ${itemOK ? '✅' : '❌ expected: "' + test.expectedItem + '"'}`);
    console.log(`  material: "${result.material}" ${materialOK ? '✅' : '❌ expected: "' + test.expectedMaterial + '"'}`);
    console.log(`  length: "${result.length}" ${lengthOK ? '✅' : '❌ expected: "' + test.expectedLength + '"'}`);
    console.log(`  width: "${result.width}" ${widthOK ? '✅' : '❌ expected: "' + test.expectedWidth + '"'}`);
    console.log(`  thick: "${result.thick}" ${thickOK ? '✅' : '❌ expected: "' + test.expectedThick + '"'}`);
    
    if (allOK) {
        console.log(`  ✅ PASS\n`);
        passed++;
    } else {
        console.log(`  ❌ FAIL\n`);
        failed++;
    }
});

console.log(`\n=== SUMMARY ===`);
console.log(`Passed: ${passed}/${testCases.length}`);
console.log(`Failed: ${failed}/${testCases.length}`);
