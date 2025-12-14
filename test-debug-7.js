#!/usr/bin/env node

/**
 * Debug Test 7: Reject thick with > 2 digits
 */

const tokens = ['1', 'item', '100', '50', '123'];
console.log('Input tokens:', JSON.stringify(tokens));

// Manually trace the logic
console.log('\n=== STEP: Extract pcs ===');
const remainingTokens = tokens.slice();
let pcs = '';
let pcsIndex = -1;
for (let i = 0; i < remainingTokens.length; i++) {
    const t = remainingTokens[i];
    console.log(`  Token[${i}]: "${t}" - matches pcs pattern? ${/^[1-9]\d?$/.test(t)}`);
    if (/^[1-9]\d?$/.test(t)) {
        pcs = t;
        pcsIndex = i;
        console.log(`    -> Assigned to pcs: "${pcs}"`);
        break;
    }
}
if (pcsIndex > -1) {
    remainingTokens.splice(pcsIndex, 1);
    console.log(`Removed pcs at index ${pcsIndex}`);
}

console.log('After pcs extraction, remainingTokens:', JSON.stringify(remainingTokens));

console.log('\n=== STEP: Build item from remainingTokens ===');
let item = remainingTokens.join(" ");
console.log('item string:', JSON.stringify(item));

console.log('\n=== STEP: Extract from item tail ===');
const itemTokens = item.trim().length ? item.trim().split(/\s+/) : [];
console.log('itemTokens:', JSON.stringify(itemTokens));

const tailTokens = [];
for (let i = itemTokens.length - 1; i >= 0; i--) {
    const tok = itemTokens[i];
    const isNumeric = /^[0-9,.\-]+$/.test(tok);
    console.log(`  Token[${i}]: "${tok}" - numeric? ${isNumeric}`);
    if (isNumeric) {
        tailTokens.unshift(tok);
    } else {
        console.log(`    -> Stop at non-numeric token`);
        break;
    }
}
console.log('Collected tailTokens:', JSON.stringify(tailTokens));

const validateAndNormalize = (tok, colType) => {
    if (!tok) return null;
    let norm = String(tok).replace(/,/g, '.');
    if (colType === 'lw') {
        const valid = /^\d{1,3}(\.\d{1,3})?$/.test(norm) || /^\d{1,3}(\.\d{1,3})?-\d{1,3}(\.\d{1,3})?$/.test(norm);
        console.log(`    validateAndNormalize("${tok}", 'lw') = ${valid ? norm : null}`);
        return valid ? norm.replace(/\s*-\s*/g, ' - ').trim() : null;
    } else if (colType === 'thick') {
        const valid = /^\d{1,2}$/.test(norm);
        console.log(`    validateAndNormalize("${tok}", 'thick') = ${valid ? norm : null}`);
        return valid ? norm : null;
    }
    return null;
};

console.log('\n=== STEP: Try 3-token pattern ===');
if (tailTokens.length >= 3) {
    console.log('Attempting 3-token pattern (L W T):');
    const L = validateAndNormalize(tailTokens[tailTokens.length - 3], 'lw');
    const W = validateAndNormalize(tailTokens[tailTokens.length - 2], 'lw');
    const T = validateAndNormalize(tailTokens[tailTokens.length - 1], 'thick');
    console.log(`  L="${L}", W="${W}", T="${T}"`);
    if (L && W && T) {
        console.log('  -> All valid, would assign L W T');
    } else {
        console.log('  -> Not all valid, fallthrough');
    }
}

console.log('\n=== STEP: Try fallback (numeric-only from remainingTokens) ===');
const numericOnlyTokens = remainingTokens.filter(t => /^[0-9,.\-]+$/.test(t));
console.log('numericOnlyTokens:', JSON.stringify(numericOnlyTokens));

if (numericOnlyTokens.length >= 3) {
    console.log('Attempting 3-token fallback (L W T):');
    const L = validateAndNormalize(numericOnlyTokens[0], 'lw');
    const W = validateAndNormalize(numericOnlyTokens[1], 'lw');
    const T = validateAndNormalize(numericOnlyTokens[2], 'thick');
    console.log(`  L="${L}", W="${W}", T="${T}"`);
    
    const couldBeThick = (tok) => /^\d{1,2}$/.test(String(tok).replace(/,/g, '.'));
    const WAlsoThick = couldBeThick(numericOnlyTokens[1]);
    const thickCandidates = [0, 1, 2].filter(i => couldBeThick(numericOnlyTokens[i])).length;
    
    console.log(`  WAlsoThick=${WAlsoThick}, thickCandidates=${thickCandidates}`);
    
    if (L && W && T) {
        console.log('  -> All three valid');
        if (!WAlsoThick && thickCandidates <= 1) {
            console.log('  -> Would assign L W T');
        } else {
            console.log('  -> Would reject due to ambiguity');
        }
    } else if (L && W && !T) {
        console.log('  -> L and W valid, T invalid');
        if (!WAlsoThick) {
            console.log('  -> Would assign L W, leave T empty');
        } else {
            console.log('  -> Would reject due to W ambiguity');
        }
    }
}

console.log('\n=== Running actual assignColumns ===');
const assignColumns = require('./utils/assignColumns_refactored.js');
const result = assignColumns(tokens);
console.log('Result:', {
    length: result.length,
    width: result.width,
    thick: result.thick,
    item: result.item,
});
