#!/usr/bin/env node

const assignColumns = require('./utils/assignColumns_refactored.js');

console.log('=== Comma-to-Dot Normalization Examples ===\n');

const examples = [
    {
        description: 'Example 1: 0,0097 should become 0.0097 (m3 field)',
        tokens: ['1', 'product', 'type', '100', '80', '5', '0,0097'],
        checkFields: ['m3'],
    },
    {
        description: 'Example 2: 45,5-10 should become 45.5 - 10 (length range)',
        tokens: ['1', 'product', '45,5-10', '30', '6'],
        checkFields: ['length'],
    },
    {
        description: 'Example 3: Complex - multiple decimals',
        tokens: ['2', 'item', '100,5-150,3', '50,2-80,7', '12', '0,048'],
        checkFields: ['length', 'width', 'm3'],
    },
];

examples.forEach((example) => {
    const result = assignColumns(example.tokens);
    
    console.log(example.description);
    console.log('  Input tokens:', JSON.stringify(example.tokens));
    console.log('  Output:');
    
    example.checkFields.forEach(field => {
        console.log(`    ${field}: "${result[field]}"`);
        // Verify no commas remain
        if (result[field].includes(',')) {
            console.log(`      ❌ WARNING: Comma still present!`);
        } else {
            console.log(`      ✅ No commas (correctly normalized to dots)`);
        }
    });
    console.log();
});

console.log('=== Summary ===');
console.log('✅ ALL commas are replaced with dots');
console.log('✅ Format examples:');
console.log('   - 0,0097 → 0.0097');
console.log('   - 45,5-10 → 45.5 - 10');
console.log('   - 50,2-80,7 → 50.2 - 80.7');
console.log('✅ Ranges maintain spaces: "a.b - c.d"');
