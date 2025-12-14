/**
 * REFACTORED assignColumns - Clean, deterministic, one-pass implementation
 *
 * INPUT: Array of tokens from PDF row extraction
 * OUTPUT: Single row object with columns: order | client | pcs | item | material | length | width | thick | m3
 *
 * STRATEGY:
 * 1. Normalize tokens (trim, replace commas with dots)
 * 2. Extract m3 from end (decimal format)
 * 3. Extract pcs from start (first 1-2 digit integer)
 * 4. Find 3 numeric columns: length, width, thick (in order)
 * 5. Remaining text → item + material
 */

function assignColumns(tokens, order = "", client = "") {
  // ============================================================================
  // STEP 1: INPUT VALIDATION & NORMALIZATION
  // ============================================================================

  if (!Array.isArray(tokens) || tokens.length === 0) {
    return {
      order: order || "",
      client: client || "",
      pcs: "",
      item: "",
      material: "",
      length: "",
      width: "",
      thick: "",
      m3: "",
    };
  }

  // Normalize: trim and replace commas with dots
  // NOTE: Don't add spaces yet - we need clean tokens for validation
  const normalized = tokens.map((t) => {
    let token = String(t).trim();
    // Replace commas with dots (for decimal notation: 63,3 → 63.3)
    token = token.replace(/,/g, ".");
    return token;
  });

  // ============================================================================
  // STEP 2: EXTRACT M3 (MUST BE LAST, DECIMAL FORMAT)
  // ============================================================================

  let m3 = "";
  let workingTokens = [...normalized];

  // m3 is always last token if it's a decimal (0.xxx or x.xxx)
  if (workingTokens.length > 0) {
    const lastToken = workingTokens[workingTokens.length - 1];
    if (isDecimal(lastToken)) {
      m3 = lastToken;
      workingTokens.pop();
    }
  }

  // ============================================================================
  // STEP 3: EXTRACT PCS (FIRST 1-2 DIGIT INTEGER)
  // ============================================================================

  let pcs = "";
  let pcsIndex = -1;

  for (let i = 0; i < workingTokens.length; i++) {
    const t = workingTokens[i];
    if (isPcs(t)) {
      pcs = t;
      pcsIndex = i;
      break;
    }
  }

  // Remove pcs from working tokens
  if (pcsIndex >= 0) {
    workingTokens.splice(pcsIndex, 1);
  }

  // ============================================================================
  // STEP 4: SEPARATE TEXT TOKENS (before numerics) FROM NUMERIC TOKENS
  // ============================================================================
  // Text tokens come first: pcs items material...
  // Numeric tokens come last: length width thick [m3]
  // We need to find where text ends and numerics begin

  let textTokens = [];
  let numericTokens = [];
  let numericIndices = [];

  for (let i = 0; i < workingTokens.length; i++) {
    const token = workingTokens[i];
    if (isNumericDimension(token)) {
      numericTokens.push(token);
      numericIndices.push(i);
    } else {
      textTokens.push(token);
    }
  }

  // Assign length, width, thick from first 3 numeric tokens
  let length = "";
  let width = "";
  let thick = "";

  if (numericTokens.length >= 1) {
    length = numericTokens[0];
  }
  if (numericTokens.length >= 2) {
    width = numericTokens[1];
  }
  if (numericTokens.length >= 3) {
    thick = numericTokens[2];
  }

  // ============================================================================
  // STEP 5: MERGE REMAINING TEXT TOKENS INTO ITEM AND MATERIAL
  // ============================================================================
  // Text tokens structure: [item_word1, item_word2?, material_word1, material_word2?, ...]
  // Common patterns:
  //   ["column", "royal", "impala"] → item="column", material="royal impala"
  //   ["tombstone", "left", "royal", "impala"] → item="tombstone left", material="royal impala"
  //   ["headstone", "royal", "impala"] → item="headstone", material="royal impala"
  //
  // Heuristic: item is usually 1-2 tokens, material is usually 1-2 tokens
  // If we have 3-4 tokens, split: first 1-2 are item, rest are material

  let item = "";
  let material = "";

  if (textTokens.length === 0) {
    // No text tokens - should not happen
  } else if (textTokens.length === 1) {
    item = textTokens[0];
  } else if (textTokens.length === 2) {
    item = textTokens[0];
    material = textTokens[1];
  } else if (textTokens.length === 3) {
    // First token = item, next 2 = material
    item = textTokens[0];
    material = textTokens.slice(1).join(" ");
  } else {
    // 4+ tokens: first token is item, second token might be modifier or material
    // Heuristic: if token 1 is a modifier (left, right, front, back), include it in item
    const modifiers = ["left", "right", "front", "back", "top", "bottom"];
    if (modifiers.includes(textTokens[1].toLowerCase())) {
      // Second token is a modifier: item = first 2 tokens
      item = textTokens.slice(0, 2).join(" ");
      material = textTokens.slice(2).join(" ");
    } else {
      // Second token is material: item = first token
      item = textTokens[0];
      material = textTokens.slice(1).join(" ");
    }
  }

  // ============================================================================
  // STEP 6: BUILD OUTPUT ROW
  // ============================================================================

  return {
    order: order || "",
    client: client || "",
    pcs: pcs || "",
    item: item || "",
    material: material || "",
    length: normalizeDimensionToken(length, 3) || "",
    width: normalizeDimensionToken(width, 3, true) || "",
    thick: normalizeDimensionToken(thick, 2) || "",
    m3: m3 || "",
  };
}

// ============================================================================
// HELPER VALIDATORS
// ============================================================================

/**
 * Normalizes a dimension token for output.
 * - Replaces commas with dots.
 * - Adds spaces around hyphens in ranges.
 * - Corrects OCR duplication for single-digit widths (e.g., '66' -> '6').
 * - Enforces max digit length.
 */
function normalizeDimensionToken(token, maxLength, isWidth = false) {
    if (!token) return "";

    let normalized = String(token).trim().replace(/,/g, ".");

    // OCR fix for width: if a 2-digit number has identical digits (e.g. 66), treat it as a single digit.
    if (isWidth && /^\d{2}$/.test(normalized) && normalized[0] === normalized[1]) {
        normalized = normalized[0];
    }
    
    // Handle ranges: add spaces around dash
    const rangeMatch = normalized.match(/^(\d{1,3}(\.\d+)?)-(\d{1,3}(\.\d+)?)$/);
    if (rangeMatch) {
        const part1 = rangeMatch[1].slice(0, maxLength);
        const part2 = rangeMatch[3].slice(0, maxLength);
        return `${part1} - ${part2}`;
    }

    // Handle single numbers
    const numericMatch = normalized.match(/^\d+(\.\d+)?$/);
    if (numericMatch) {
      return normalized.slice(0, maxLength);
    }
    
    // Fallback for simple ranges that may have failed the more specific regex
    if (normalized.includes('-')) {
        return normalized.replace(/-/g, ' - ');
    }
    
    return normalized;
}


/**
 * Check if token is PCS (pieces): 1-2 digit integer, 1-99 range
 */
function isPcs(token) {
  if (!token) return false;
  return /^[1-9]\d?$/.test(token); // 1-99
}

/**
 * Check if token is a decimal (m3 format): 0.xxx or x.xxx
 */
function isDecimal(token) {
  if (!token) return false;
  // Match: 0.017, 0.056, 0.003, 1.234, etc.
  return /^\d+\.\d{2,}$/.test(token);
}

/**
 * Check if token is a numeric dimension:
 * - Length/width: 1-3 digits, or range, or decimal
 * - Thickness: 1-2 digits or range
 * Examples: "22", "53", "180", "159-157", "63.3", "59-57", "6", "8", "10-8"
 */
function isNumericDimension(token) {
  if (!token) return false;

  // Strict regex for valid dimension formats.
  // - Allows numbers (e.g., "180"), decimals ("63.3"), and ranges ("159-157", "63.3-10").
  // - Enforces digit limits (1-3 for length/width, 1-2 for thick, but we check that later).
  const dimensionRegex = /^\d{1,3}(\.\d+)?(-\d{1,3}(\.\d+)?)?$/;
  return dimensionRegex.test(token);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = assignColumns;
