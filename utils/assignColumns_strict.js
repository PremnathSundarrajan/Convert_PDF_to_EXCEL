/**
 * Strict dimension parser
 * - Implements independent parsing for length, width, and thick
 * - Accepts only exact formats: single number, comma-decimal, range, decimal-range
 * - Enforces digit limits: length/width 1-3 digits per number, thick 1-2 digits per number
 * - Replaces comma with dot and normalizes ranges to "a.b - c.d"
 * - Does NOT merge/split tokens or infer by position
 */

function normalizeToken(token) {
  if (!token) return "";
  // Replace comma with dot
  let t = token.replace(/,/g, ".");
  // Normalize single hyphen to have spaces around
  t = t.replace(/\s*-\s*/g, " - ");
  return t;
}

function parseDimensions(tokens) {
  if (!Array.isArray(tokens)) tokens = [];

  // Keep original tokens intact (no merging/splitting)
  const cleanTokens = tokens.map(t => (typeof t === 'string' ? t.trim() : ''))
    .filter(t => t.length > 0);

  // Column-specific regexes (input expects comma for decimals)
  const lwNum = `\\d{1,3}(?:,\\d{1,3})?`;
  // Thick: only integer parts (no comma decimals) and max 2 digits per number
  const tNum = `\\d{1,2}`;

  const lwRegex = new RegExp(`^(?:${lwNum})(?:-(?:${lwNum}))?$`);
  const tRegex = new RegExp(`^(?:${tNum})(?:-(?:${tNum}))?$`);

  // Only allow tokens that contain digits, commas and at most one hyphen
  const allowedChars = /^[0-9,]+(?:-[0-9,]+)?$/;

  // Collect candidate lists
  const lwCandidates = [];
  const tCandidates = [];
  const ambiguous = new Set();
  // regex objects (kept for clarity during development)
  cleanTokens.forEach((tok, idx) => {
    const ok = allowedChars.test(tok);
    if (!ok) return; // reject tokens with dots, letters, multiple hyphens

    const isLw = lwRegex.test(tok);
    const isT = tRegex.test(tok);

    if (isLw && isT) {
      // Matches both column patterns -> discard (ambiguous)
      ambiguous.add(idx);
      return;
    }
    if (isLw) lwCandidates.push({ tok, idx });
    if (isT) tCandidates.push({ tok, idx });
  });

  // candidate lists collected

  // Helper: numeric value for comparisons (use first number of range)
  const numericValue = (s) => {
    if (!s) return NaN;
    const part = s.split("-")[0].replace(/,/g, '.');
    return parseFloat(part);
  };

  const usedIndices = new Set();
  let length = "";
  let width = "";
  let thick = "";

  // 1) Assign thick independently
  // If exactly one candidate that's not ambiguous -> assign. If multiple -> ambiguous -> leave blank
  const tFiltered = tCandidates.filter(c => !ambiguous.has(c.idx));
  if (tFiltered.length === 1) {
    const tTok = tFiltered[0].tok;
    // Digit constraints already enforced by tRegex
    thick = normalizeToken(tTok);
    usedIndices.add(tFiltered[0].idx);
  }

  // 2) Assign length & width from lwCandidates (independently)
  const lwFiltered = lwCandidates.filter(c => !ambiguous.has(c.idx) && !usedIndices.has(c.idx));

  if (lwFiltered.length === 1) {
    // Single lw candidate -> prefer length
    length = normalizeToken(lwFiltered[0].tok);
    usedIndices.add(lwFiltered[0].idx);
  } else if (lwFiltered.length === 2) {
    // Two candidates -> determine by numeric comparison
    const a = lwFiltered[0];
    const b = lwFiltered[1];
    const aN = numericValue(a.tok);
    const bN = numericValue(b.tok);
    if (!isNaN(aN) && !isNaN(bN)) {
      // Assign larger -> length, smaller -> width. If equal -> ambiguous -> leave blank both
      if (aN > bN) {
        length = normalizeToken(a.tok);
        width = normalizeToken(b.tok);
        usedIndices.add(a.idx); usedIndices.add(b.idx);
      } else if (bN > aN) {
        length = normalizeToken(b.tok);
        width = normalizeToken(a.tok);
        usedIndices.add(a.idx); usedIndices.add(b.idx);
      }
    }
  } else if (lwFiltered.length > 2) {
    // Too many candidates -> ambiguous -> leave both blank
  }

  // 3) If width still empty, try to find a single lw candidate (not used) to be width
  if (!width) {
    const remainingLW = lwCandidates.filter(c => !ambiguous.has(c.idx) && !usedIndices.has(c.idx));
    if (remainingLW.length === 1) {
      // If length already set, prefer this as width; else treat it as width only if there is already some length elsewhere
      if (length && !usedIndices.has(remainingLW[0].idx)) {
        width = normalizeToken(remainingLW[0].tok);
        usedIndices.add(remainingLW[0].idx);
      } else if (!length) {
        // If no length, make it width only if there is also a thick assigned (so we can have W and T)
        if (thick) {
          width = normalizeToken(remainingLW[0].tok);
          usedIndices.add(remainingLW[0].idx);
        }
      }
    }
  }

  // 4) Final guard: if any assigned value violates digit rules after normalization, drop it
  const dropIfInvalid = (val, col) => {
    if (!val) return '';
    // Convert back to input-style with comma optional handled earlier; we enforce digit limits on integer parts and fractional parts
    const parts = val.split(' - ').map(p => p.trim());
    for (const p of parts) {
      const numParts = p.split('.');
      const intPart = numParts[0];
      const fracPart = numParts[1] || null;
      if (col === 'thick') {
        if (!/^\d{1,2}$/.test(intPart)) return '';
        if (fracPart && fracPart.length > 2) return '';
      } else {
        if (!/^\d{1,3}$/.test(intPart)) return '';
        if (fracPart && fracPart.length > 3) return '';
      }
    }
    return val;
  };

  length = dropIfInvalid(length, 'length');
  width = dropIfInvalid(width, 'width');
  thick = dropIfInvalid(thick, 'thick');

  return { length, width, thick };
}

module.exports = { parseDimensions };
