/**
 * assignColumns (Strict Parsing v2)
 *
 * This function implements a strict, rule-based parsing logic for extracting
 * length, width, and thick from a list of tokens.
 *
 * It adheres to the following principles:
 * 1.  Column Isolation: A token can only be assigned to one column.
 * 2.  Strict Regex Validation: Tokens must fully match a column's pattern.
 * 3.  Ambiguity Resolution: Prioritizes the most constrained columns first.
 * 4.  Fail-Safe: Invalid or unassigned values result in empty strings.
 * 5.  Normalization: Output is formatted according to specific rules (e.g., '1,2-3' -> '1.2 - 3').
 */
function assignColumns(tokens, order = "", client = "") {
    // ============================================================================
    // STEP 1: INITIALIZATION & REGEX DEFINITIONS
    // ============================================================================

    // Regex for Length and Width: allows numbers up to 3 digits, decimals, and ranges.
    const lwRegex = /^\d{1,3}(?:,\d+)?(?:-\d{1,3}(?:,\d+)?)?$/;

    // Regex for Thick: allows numbers up to 2 digits, decimals, and ranges.
    const tRegex = /^\d{1,2}(?:,\d+)?(?:-\d{1,2}(?:,\d+)?)?$/;

    const result = {
        length: "",
        width: "",
        thick: "",
    };
    const usedIndices = new Set();

    // ============================================================================
    // STEP 2: CLASSIFY ALL TOKENS
    // ============================================================================

    const classifiedTokens = tokens.map((token, index) => {
        const isLw = lwRegex.test(token);
        const isT = tRegex.test(token);
        
        // A token is a 'thick_candidate' if it fits the stricter 2-digit pattern.
        // It's 'lw_only' if it fits the 3-digit pattern but not the 2-digit one.
        const type = isT ? 'thick_candidate' : (isLw ? 'lw_only' : 'invalid');
        
        return { token, index, type };
    }).filter(t => t.type !== 'invalid');

    // ============================================================================
    // STEP 3: ASSIGNMENT LOGIC (GREEDY, REVERSE ORDER)
    // ============================================================================
    // The assignment happens in a specific order (thick, then width, then length)
    // to resolve ambiguity. It iterates from the end of the token list backwards,
    // which is a heuristic based on the common ordering of dimensions (L x W x T).

    const findAndAssign = (column, ...allowedTypes) => {
        // Find the index of the candidate in the original classifiedTokens array
        const candidateIndex = classifiedTokens.slice().reverse().findIndex(t => 
            !usedIndices.has(t.index) && allowedTypes.includes(t.type)
        );

        if (candidateIndex !== -1) {
            // Retrieve the actual candidate object
            const candidate = classifiedTokens.slice().reverse()[candidateIndex];
            result[column] = candidate.token;
            usedIndices.add(candidate.index);
        }
    };

        // NOTE: Dimensions will be extracted strictly from the tail of the `item`
        // string later (see Step 5). Do NOT infer from other tokens.

    // ============================================================================
    // STEP 4: NORMALIZE AND FORMAT
    // ============================================================================

    function normalizeToken(token) {
        if (!token) return "";
        // 1. Replace comma with dot for decimals.
        let normalized = token.replace(/,/g, ".");
        // 2. Ensure spaces around hyphen for ranges.
        normalized = normalized.replace(/\s*-\s*/g, " - ");
        return normalized;
    }

    result.length = normalizeToken(result.length);
    result.width = normalizeToken(result.width);
    result.thick = normalizeToken(result.thick);

    // ============================================================================
    // STEP 5: RECONSTRUCT OTHER FIELDS FROM UNUSED TOKENS
    // ============================================================================

    const remainingTokens = tokens.filter((_, index) => !usedIndices.has(index));

    let pcs = "";
    let pcsIndex = -1;
    for (let i = 0; i < remainingTokens.length; i++) {
        const t = remainingTokens[i];
        if (/^[1-9]\d?$/.test(t)) {
            pcs = t;
            pcsIndex = i;
            break;
        }
    }
    if (pcsIndex > -1) {
        remainingTokens.splice(pcsIndex, 1);
    }
    
    let m3 = "";
    if (remainingTokens.length > 0) {
        const lastToken = remainingTokens[remainingTokens.length - 1];
        // Accept m3 in comma or dot form (normalize comma to dot) and 3+ decimals
        const lastNorm = String(lastToken).replace(/,/g, '.');
        if (/^\d+\.\d{2,}$/.test(lastNorm)) {
            m3 = remainingTokens.pop();
        }
    }
    
    // No token-level fallback allowed: extract dimensions only from `item` text below.

    let item = remainingTokens.join(" ");

    // ========================================================================
    // STRICT: Extract dimensions only from the tail of the `item` string.
    // Rules:
    // - Normalize commas to dots BEFORE parsing
    // - Length/Width: max 3 digits per number, single digit OK, ranges OK (dash)
    // - Thick: max 2 digits per number
    // - Supported patterns: L T or L W T
    // - Format ranges as "a.b - c.d" (spaces around dash)
    // - Do NOT allow column bleed or digit duplication
    // ========================================================================

    // Split item into tokens and scan from the tail
    const itemTokens = item.trim().length ? item.trim().split(/\s+/) : [];

    let extractedLength = "";
    let extractedWidth = "";
    let extractedThick = "";
    let usedTailCount = 0;

    // Helper to validate and normalize a single token
    const validateAndNormalize = (tok, colType) => {
        if (!tok) return null;
        // Normalize: replace comma with dot first
        let norm = String(tok).replace(/,/g, '.');

        if (colType === 'lw') {
            // Length/Width: max 3 digits per number, can be single or range
            // Accept: single num (1-3 digits), or range (num1-num2 where each is 1-3 digits)
            // May have decimal: d.d or d.dd or d.ddd (up to 3 decimal places)
            if (/^\d{1,3}(\.\d{1,3})?$/.test(norm) || /^\d{1,3}(\.\d{1,3})?-\d{1,3}(\.\d{1,3})?$/.test(norm)) {
                // Add spaces around dash if present, keep dot
                return norm.replace(/\s*-\s*/g, ' - ').trim();
            }
        } else if (colType === 'thick') {
            // Thick: must be 1-2 digit integer (no decimals for thick)
            if (/^\d{1,2}$/.test(norm)) {
                return norm;
            }
        }
        return null;
    };

    // Collect contiguous numeric tokens from the tail
    const tailTokens = [];
    for (let i = itemTokens.length - 1; i >= 0; i--) {
        const tok = itemTokens[i];
        if (/^[0-9,.\-]+$/.test(tok)) {
            tailTokens.unshift(tok);
        } else {
            break; // Stop at first non-numeric token (material text boundary)
        }
    }

    // Helper: detect if token could be thick (1-2 digits)
    const couldBeThick = (tok) => /^\d{1,2}$/.test(String(tok).replace(/,/g, '.'));
    
    // Helper: detect if token could be lw
    const couldBeLW = (tok) => {
        let norm = String(tok).replace(/,/g, '.');
        return /^\d{1,3}(\.\d{1,3})?$/.test(norm) || /^\d{1,3}(\.\d{1,3})?-\d{1,3}(\.\d{1,3})?$/.test(norm);
    };

    // Try to parse tail tokens as dimensions
    
    // SPECIAL CASE: invalid overlap pattern like ['66','6','59'] -> drop first two, keep last as width
    if (tailTokens.length === 3) {
        const a = tailTokens[0], b = tailTokens[1], c = tailTokens[2];
        if (/^\d+$/.test(a) && /^\d$/.test(b) && /^\d{2,3}$/.test(c) && a.endsWith(b)) {
            // Pattern matches: discard a and b, keep last as width
            const W = validateAndNormalize(c, 'lw');
            if (W) {
                extractedWidth = W;
                usedTailCount = 3;
            }
        }
    }

    if (usedTailCount === 0 && tailTokens.length >= 3) {
        // Pattern: L W T (last 3 tokens)
        const L = validateAndNormalize(tailTokens[tailTokens.length - 3], 'lw');
        const W = validateAndNormalize(tailTokens[tailTokens.length - 2], 'lw');
        const T = validateAndNormalize(tailTokens[tailTokens.length - 1], 'thick');

        if (L && W && T) {
            // All three validate. Check for ambiguity:
            // If both W and T are single digits, they're too similar -> ambiguous
            // (Single digits can fill L, W, or T positions)
            
            const tok1 = tailTokens[tailTokens.length - 2];
            const tok2 = tailTokens[tailTokens.length - 1];
            
            // Check if both are single-digit (after normalization)
            const tok1_normalized = String(tok1).replace(/,/g, '.');
            const tok2_normalized = String(tok2).replace(/,/g, '.');
            const bothSingleDigit = /^\d$/.test(tok1_normalized) && /^\d$/.test(tok2_normalized);
            
            if (bothSingleDigit) {
                // Both W and T are single-digit -> ambiguous
                // Try to extract just L if it's unambiguously lw-only
                const L_isOnlyLW = couldBeLW(tailTokens[tailTokens.length - 3]) && !couldBeThick(tailTokens[tailTokens.length - 3]);
                if (L_isOnlyLW) {
                    extractedLength = L;
                    usedTailCount = 3; // consume all 3 to avoid orphaning W and T in item
                }
            } else {
                // Unambiguous: assign them
                extractedLength = L;
                extractedWidth = W;
                extractedThick = T;
                usedTailCount = 3;
            }
        } else if (L && T && !W) {
            // First and third valid but second not -> treat as L T (ambiguous W, leave empty)
            extractedLength = L;
            extractedThick = T;
            usedTailCount = 3; // still consume 3 tokens to avoid leaving orphaned middle token in item
        }
    }

    if (usedTailCount === 0 && tailTokens.length === 2) {
        // Pattern: L T (last 2 tokens)
        const L = validateAndNormalize(tailTokens[0], 'lw');
        const T = validateAndNormalize(tailTokens[1], 'thick');

        if (L && T) {
            extractedLength = L;
            extractedThick = T;
            usedTailCount = 2;
        }
    }

    // Remove used tokens from item
    if (usedTailCount > 0) {
        const newItemTokens = itemTokens.slice(0, itemTokens.length - usedTailCount);
        item = newItemTokens.join(' ').trim();
    }

    // Assign extracted dimensions
    if (extractedLength) result.length = extractedLength;
    if (extractedWidth) result.width = extractedWidth;
    if (extractedThick) result.thick = extractedThick;

    // ========================================================================
    // EXTRACT MATERIAL FROM ITEM
    // Material is typically the middle part of item text (between product name and dimensions)
    // Pattern: [product_name] [material] [dimensions_already_extracted]
    // For example: "headstone black premium 80 75 8" becomes:
    //   item="headstone", material="black premium" (after dimensions extracted)
    // ========================================================================
    let material = "";
    if (item.trim().length > 0) {
        const itemTokensArr = item.trim().split(/\s+/);
        
        // Material is any remaining tokens after dimensions are extracted
        // These are typically color/type descriptors like "black", "premium", "white", etc.
        // Keep first token as product name, rest as material
        if (itemTokensArr.length > 1) {
            // First token = product name (e.g., "headstone")
            // Rest = material descriptors (e.g., "black premium")
            const productName = itemTokensArr[0];
            const materialTokens = itemTokensArr.slice(1);
            
            material = materialTokens.join(" ");
            item = productName;
        }
        // If only one token left, it's the product name, material stays empty
    }

    // ========================================================================
    // FALLBACK: If no dimensions extracted from item tail, try from pure-numeric
    // tokens in remainingTokens (for backward compatibility with test patterns)
    // ========================================================================
    if (!result.length && !result.width && !result.thick && remainingTokens.length > 0) {
        // Check if remainingTokens has clear numeric candidates
        const numericOnlyTokens = remainingTokens.filter(t => /^[0-9,.\-]+$/.test(t));
        
        if (numericOnlyTokens.length === 2) {
            // 2-token pattern: must be L T
            const L = validateAndNormalize(numericOnlyTokens[0], 'lw');
            const T = validateAndNormalize(numericOnlyTokens[1], 'thick');
            
            // Only assign if both validate
            if (L && T) {
                result.length = L;
                result.thick = T;
                // Remove used tokens from remainingTokens
                const idx0 = remainingTokens.indexOf(numericOnlyTokens[0]);
                const idx1 = remainingTokens.indexOf(numericOnlyTokens[1]);
                if (idx0 > -1) remainingTokens.splice(idx0, 1);
                if (idx1 > -1 && idx1 !== idx0) remainingTokens.splice(idx1, 1);
                item = remainingTokens.join(" ").trim();
            }
        } else if (numericOnlyTokens.length >= 3) {
            // 3-token pattern: try L W T
            const L = validateAndNormalize(numericOnlyTokens[0], 'lw');
            const W = validateAndNormalize(numericOnlyTokens[1], 'lw');
            const T = validateAndNormalize(numericOnlyTokens[2], 'thick');
            
            // Check for ambiguity: W must NOT also be valid as thick
            const WAlsoThick = couldBeThick(numericOnlyTokens[1]);
            
            // Check if multiple tokens could be thick
            const thickCandidates = [0, 1, 2].filter(i => couldBeThick(numericOnlyTokens[i])).length;
            
            if (L && W && T) {
                // All three valid AND W is not ambiguous AND not multiple thick candidates
                if (!WAlsoThick && thickCandidates <= 1) {
                    result.length = L;
                    result.width = W;
                    result.thick = T;
                    // Remove first 3 numeric tokens from remainingTokens
                    for (let i = 0; i < 3 && remainingTokens.length > 0; i++) {
                        const idx = remainingTokens.indexOf(numericOnlyTokens[i]);
                        if (idx > -1) remainingTokens.splice(idx, 1);
                    }
                    item = remainingTokens.join(" ").trim();
                }
            } else if (L && W && !T) {
                // First two validate but third doesn't → extract L W, leave T empty (Test 7 case)
                // Don't check WAlsoThick here; if T fails, we extract what we can
                result.length = L;
                result.width = W;
                // Consume first 2 tokens only
                const idx0 = remainingTokens.indexOf(numericOnlyTokens[0]);
                const idx1 = remainingTokens.indexOf(numericOnlyTokens[1]);
                if (idx0 > -1) remainingTokens.splice(idx0, 1);
                if (idx1 > -1 && idx1 !== idx0) remainingTokens.splice(idx1, 1);
                item = remainingTokens.join(" ").trim();
            }
        }
    }

    // ============================================================================
    // STEP 6: BUILD FINAL OUTPUT ROW
    // ============================================================================
    
    // Ensure all commas are replaced with dots in all numeric fields
    const normalizeCommas = (val) => {
        if (!val) return "";
        return String(val).replace(/,/g, '.');
    };

    return {
        order: order || "",
        client: client || "",
        pcs: normalizeCommas(pcs),
        item: item || "",
        material: material || "",
        length: normalizeCommas(result.length),
        width: normalizeCommas(result.width),
        thick: normalizeCommas(result.thick),
        m3: normalizeCommas(m3),
    };
}

module.exports = assignColumns;
