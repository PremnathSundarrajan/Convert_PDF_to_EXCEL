#!/usr/bin/env node

const assignColumns = require('./utils/assignColumns_refactored.js');
const tokens = ['1', 'item', '66', '6', '59'];
console.log('Input tokens:', JSON.stringify(tokens));
const result = assignColumns(tokens);
console.log('Result:', {
    length: result.length,
    width: result.width,
    thick: result.thick,
    item: result.item,
});
console.log('\nExpected:');
console.log('  length: ""');
console.log('  width: "59"');
console.log('  thick: ""');

console.log('\nActual vs Expected:');
console.log('  length: "' + result.length + '" vs ""');
console.log('  width: "' + result.width + '" vs "59"');
console.log('  thick: "' + result.thick + '" vs ""');
