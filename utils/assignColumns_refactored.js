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

        // Use strict, independent parser to assign length/width/thick.
        // This enforces exact-format matching and prevents column-shifting.
        const strictParser = require('./assignColumns_strict');
        const strictResult = strictParser.parseDimensions(tokens);

        result.length = strictResult.length || "";
        result.width = strictResult.width || "";
        result.thick = strictResult.thick || "";

        // Mark used indices so remaining token reconstruction ignores assigned tokens.
        const basicMatch = (tok) => (tok || "").replace(/,/g, ".").replace(/\s*-\s*/g, " - ").trim();
        for (let i = 0; i < tokens.length; i++) {
            try {
                const n = basicMatch(tokens[i]);
                if (n && result.length && n === result.length) usedIndices.add(i);
                if (n && result.width && n === result.width) usedIndices.add(i);
                if (n && result.thick && n === result.thick) usedIndices.add(i);
            } catch (e) {
                // ignore
            }
        }

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
        if (/^\d+\.\d{2,}$/.test(lastToken)) {
            m3 = remainingTokens.pop();
        }
    }
    
    const item = remainingTokens.join(" ");

    // ============================================================================
    // STEP 6: BUILD FINAL OUTPUT ROW
    // ============================================================================

    return {
        order: order || "",
        client: client || "",
        pcs: pcs || "",
        item: item || "",
        material: "",
        length: result.length,
        width: result.width,
        thick: result.thick,
        m3: m3 || "",
    };
}

module.exports = assignColumns;
