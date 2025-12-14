#!/usr/bin/env node

const tokens = ['1', 'item', '66', '6', '59'];
console.log('Input tokens:', JSON.stringify(tokens));
console.log('Expected: length="", width="59", thick=""');
console.log('But test says width should be empty and we should have ambiguity...');
console.log('Hmm, let me check the test again...');

// Reread test 8
const testCase = {
    name: "Rule 5 & 9: Handle invalid overlap '66 6 59'",
    tokens: ['1', 'item', '66', '6', '59'],
    expected: {
        length: "",
        width: "59", // 66 is ambiguous (L/W), 6 is ambiguous (L/W/T)
        thick: "",
    },
};

console.log('\nActual expected result:');
console.log('  length: "' + testCase.expected.length + '"');
console.log('  width: "' + testCase.expected.width + '"');
console.log('  thick: "' + testCase.expected.thick + '"');

console.log('\nSo the test expects width to be extracted as "59"');
console.log('This means "59" is unambiguous-width, but we need to reject "66" and "6"');

// So the logic is:
// - 66: can be L or W → ambiguous for position
// - 6: can be L, W, or T → very ambiguous
// - 59: can be L or W, but not T (needs < 3 digits for thick? No wait, 59 is 2 digits)

console.log('\nWait, let me check the validateAndNormalize logic:');
const couldBeThick = (tok) => /^\d{1,2}$/.test(String(tok).replace(/,/g, '.'));
console.log('  "59" couldBeThick?', couldBeThick('59')); // Yes, it's 2 digits
console.log('  "6" couldBeThick?', couldBeThick('6')); // Yes, it's 1 digit
console.log('  "66" couldBeThick?', couldBeThick('66')); // Yes, it's 2 digits!

console.log('\nSo all three could be thick. That would be 3 thick candidates, triggering ambiguity detection!');
