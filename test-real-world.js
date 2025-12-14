#!/usr/bin/env node

const assignColumns = require('./utils/assignColumns_refactored.js');

console.log('=== Real-world Example Tests ===\n');

// Test: ['1', 'item', 'value1', 'value2', 'value3']
const result1 = assignColumns(['1', 'sidekerbs', 'black', 'premium', '106', '8']);
console.log('Test 1 - sidekerbs black premium 106 8:');
console.log('  Input: ["1", "sidekerbs", "black", "premium", "106", "8"]');
console.log('  item:', result1.item);
console.log('  material:', result1.material);
console.log('  pcs:', result1.pcs);
console.log('  length:', result1.length);
console.log('  width:', result1.width);
console.log('  thick:', result1.thick);

const result2 = assignColumns(['1', 'item', '100', '50-80', '12']);
console.log('\nTest 2 - item with range:');
console.log('  Input: ["1", "item", "100", "50-80", "12"]');
console.log('  item:', result2.item);
console.log('  material:', result2.material);
console.log('  length:', result2.length);
console.log('  width:', result2.width);
console.log('  thick:', result2.thick);

const result3 = assignColumns(['1', 'item', '43,5', '22', '10']);
console.log('\nTest 3 - item with comma decimal:');
console.log('  Input: ["1", "item", "43,5", "22", "10"]');
console.log('  item:', result3.item);
console.log('  material:', result3.material);
console.log('  length:', result3.length);
console.log('  width:', result3.width);
console.log('  thick:', result3.thick);
