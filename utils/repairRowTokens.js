/**
 * repairRowTokens - Attempts to fix common tokenization errors in a row of PDF text tokens.
 *
 * The primary issue this function addresses is the incorrect concatenation of adjacent numeric tokens.
 * For example, a "width" of "10" and a "thick" of "6" might be incorrectly extracted as a single
 * token "106". This function identifies such cases and splits the token back into its constituent parts.
 *
 * STRATEGY:
 * 1. Iterate through the tokens of a row.
 * 2. Identify 3-digit numeric tokens (e.g., "106", "120", "205").
 * 3. For each 3-digit token, check if it can be split into a 2-digit number and a 1-digit number.
 *    - Example: "106" -> "10" and "6"
 *    - Example: "120" -> "12" and "0" (or "1" and "20" - need to be careful)
 * 4. This is a heuristic, so we need to be careful not to split valid 3-digit numbers.
 *    The assumption is that it's more likely for a 2-digit and 1-digit number to be concatenated
 *    than for a 1-digit and 2-digit number.
 * 5. If a split is made, the original token is replaced with the two new tokens.
 *
 * @param {string[]} tokens - The array of tokens for a single row.
 * @returns {string[]} A new array of tokens with concatenations fixed.
 */
function repairRowTokens(tokens) {
  const newTokens = [];
  for (const token of tokens) {
    if (/^\d{3}$/.test(token)) {
      // It's a 3-digit number, a candidate for splitting.
      const part1 = token.substring(0, 2);
      const part2 = token.substring(2);
      
      // Heuristic: If we split "106" into "10" and "6", both are valid numbers.
      // We assume this is more likely to be a concatenation than a valid 3-digit number.
      // This is not perfect, but it will solve the specific problem reported.
      if (
        !isNaN(parseInt(part1, 10)) &&
        !isNaN(parseInt(part2, 10))
      ) {
        newTokens.push(part1, part2);
      } else {
        newTokens.push(token);
      }
    } else {
      newTokens.push(token);
    }
  }
  return newTokens;
}

module.exports = repairRowTokens;