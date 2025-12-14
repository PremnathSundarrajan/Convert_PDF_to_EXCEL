#!/usr/bin/env node

const tokens = ['1', 'item', '63,3-10', '50', '5'];
console.log('Test 1: Normalize decimal range for length');
console.log('Input:', JSON.stringify(tokens));

// After pcs extraction: remainingTokens = ['item', '63,3-10', '50', '5']
// item = 'item 63,3-10 50 5'
// itemTokens = ['item', '63,3-10', '50', '5']
// tailTokens = ['63,3-10', '50', '5'] (collected from tail, stopping at 'item')

const tailTokens = ['63,3-10', '50', '5'];

const couldBeThick = (tok) => /^\d{1,2}$/.test(String(tok).replace(/,/g, '.'));

console.log('Checking thick candidates:');
console.log('  "63,3-10" couldBeThick?', couldBeThick('63,3-10')); // NO (comma in it, has dash)
console.log('  "50" couldBeThick?', couldBeThick('50')); // YES (2 digits)
console.log('  "5" couldBeThick?', couldBeThick('5')); // YES (1 digit)

const thickCandidates = [0, 1, 2].filter(i => couldBeThick(tailTokens[i])).length;
console.log('Total thick candidates:', thickCandidates);

console.log('\nSo thickCandidates = 2, which fails the check "thickCandidates <= 1"');
console.log('This is why all three are not being assigned!');

const assignColumns = require('./utils/assignColumns_refactored.js');
const result = assignColumns(tokens);
console.log('\nActual result:', {
    length: result.length,
    width: result.width,
    thick: result.thick,
});

console.log('Expected:', {
    length: '63.3 - 10',
    width: '50',
    thick: '5',
});
