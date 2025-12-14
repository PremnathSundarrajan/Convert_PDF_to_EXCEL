#!/usr/bin/env node

const tokens = ['1', 'item', '100', '8', '9'];
console.log('Test 10: Handle multiple valid thick tokens -> ambiguous');
console.log('Input:', JSON.stringify(tokens));

// After pcs extraction: remainingTokens = ['item', '100', '8', '9']
// item = 'item 100 8 9'
// itemTokens = ['item', '100', '8', '9']
// tailTokens = ['100', '8', '9']

const tailTokens = ['100', '8', '9'];
const tok1_normalized = String(tailTokens[1]).replace(/,/g, '.');
const tok2_normalized = String(tailTokens[2]).replace(/,/g, '.');
const bothSingleDigit = /^\d$/.test(tok1_normalized) && /^\d$/.test(tok2_normalized);

console.log('tok1 ("8") normalized:', tok1_normalized, 'is single digit?', /^\d$/.test(tok1_normalized));
console.log('tok2 ("9") normalized:', tok2_normalized, 'is single digit?', /^\d$/.test(tok2_normalized));
console.log('Both single digit?', bothSingleDigit);

console.log('\nIf bothSingleDigit is true, we skip assigning in the L W T block');
console.log('So usedTailCount stays 0, and we dont extract from item tail');
console.log('Then we go to fallback...');

const assignColumns = require('./utils/assignColumns_refactored.js');
const result = assignColumns(tokens);
console.log('\nActual result:', {
    length: result.length,
    width: result.width,
    thick: result.thick,
});

console.log('Expected:', {
    length: '100',
    width: '',
    thick: '',
});
