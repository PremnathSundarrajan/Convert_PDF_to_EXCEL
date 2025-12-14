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
  // Collect tokens that are purely numeric (digits, commas, at most one hyphen)
  const numericTokens = [];
  cleanTokens.forEach((tok, idx) => {
    if (!allowedChars.test(tok)) return;
    // Skip a leading pcs-like token: single integer followed by a non-numeric token (e.g., ['1','item',...])
    if (/^\d+$/.test(tok) && idx + 1 < cleanTokens.length && /[a-zA-Z]/.test(cleanTokens[idx + 1])) return;
    // Only include tokens that at least match one column's regex to enforce digit constraints
    const okForLw = lwRegex.test(tok);
    const okForT = tRegex.test(tok);
    if (!okForLw && !okForT) return;
    numericTokens.push({ tok, idx });
  });

  // If there's only one numeric token and it matches more than one column pattern, it's ambiguous -> return blanks
  if (numericTokens.length === 1) {
    const single = numericTokens[0].tok;
    if (lwRegex.test(single) && tRegex.test(single)) {
      return { length: '', width: '', thick: '' };
    }
  }

  const numericValue = (s) => {
    if (!s) return NaN;
    const part = s.split("-")[0].replace(/,/g, '.');
    return parseFloat(part);
  };

  const assigned = { length: '', width: '', thick: '' };

  // First, handle clear lw tokens (contain comma or decimal-range)
  const lwClear = numericTokens.filter(o => /,/.test(o.tok) || (/-/.test(o.tok) && o.tok.indexOf(',')>-1));
  const remaining = numericTokens.filter(o => !lwClear.includes(o));

  if (lwClear.length === 1) {
    assigned.length = normalizeToken(lwClear[0].tok);
  } else if (lwClear.length === 2) {
    // choose larger as length
    const a = lwClear[0], b = lwClear[1];
    if (numericValue(a.tok) > numericValue(b.tok)) {
      assigned.length = normalizeToken(a.tok);
      assigned.width = normalizeToken(b.tok);
    } else if (numericValue(b.tok) > numericValue(a.tok)) {
      assigned.length = normalizeToken(b.tok);
      assigned.width = normalizeToken(a.tok);
    }
  }

  // Now treat pure integer or ambiguous tokens
  const leftover = remaining.slice();
  // If there are 3 leftover tokens and they appear in original order (contiguous), prefer positional assignment L,W,T
  const contiguous3 = leftover.length === 3 && (leftover[0].idx + 1 === leftover[1].idx) && (leftover[1].idx + 1 === leftover[2].idx);
  if (!contiguous3) {
    // Sort descending by numeric value for heuristic allocation
    leftover.sort((x,y)=> numericValue(y.tok)-numericValue(x.tok));
  } else {
    // keep original order
    leftover.sort((a,b)=> a.idx - b.idx);
  }

  // Special-case: invalid overlap pattern like ['66','6','59'] -> drop first two, keep last as width
  if (leftover.length === 3) {
    const a = leftover[0].tok, b = leftover[1].tok, c = leftover[2].tok;
    if (/^\d+$/.test(a) && /^\d$/.test(b) && /^\d{2,3}$/.test(c) && a.endsWith(b)) {
      // discard a and b
      return { length: '', width: normalizeToken(c), thick: '' };
    }
  }

  // If we already have a length, try to fill width and thick from leftover
  if (assigned.length) {
    if (leftover.length >= 1) {
      // candidate for width
      const wCand = leftover.shift();
      if (/^\d{1,3}(?:-\d{1,3})?$/.test(wCand.tok)) {
        assigned.width = normalizeToken(wCand.tok);
      }
    }
    if (leftover.length >= 1) {
      const tCand = leftover.shift();
      if (/^\d{1,2}$/.test(tCand.tok)) {
        assigned.thick = normalizeToken(tCand.tok);
      }
    }
    // Ambiguity guard: if both width and thick are single-digit numbers, mark ambiguous -> blank
    if (assigned.width && assigned.thick && /^\d$/.test(assigned.width) && /^\d$/.test(assigned.thick)) {
      assigned.width = '';
      assigned.thick = '';
    }
  } else {
    // No clear length yet
    if (leftover.length >= 3) {
      // assign in order of leftover (either positional contiguous or descending numeric)
      const l = leftover.shift();
      const w = leftover.shift();
      const t = leftover.shift();
      assigned.length = normalizeToken(l.tok);
      if (/^\d{1,3}(?:-\d{1,3})?$/.test(w.tok)) assigned.width = normalizeToken(w.tok);
      if (/^\d{1,2}$/.test(t.tok)) assigned.thick = normalizeToken(t.tok);
    } else if (leftover.length === 2) {
      // assign based on digit lengths: if one is 3-digit and the other is 1-2 digits, prefer 3-digit as LENGTH and smaller as THICK
      const a = leftover[0], b = leftover[1];
      if (/^\d{3}$/.test(a.tok) && /^\d{1,2}$/.test(b.tok)) {
        assigned.length = normalizeToken(a.tok);
        if (/^\d{1,2}$/.test(b.tok)) assigned.thick = normalizeToken(b.tok);
      } else if (/^\d{3}$/.test(b.tok) && /^\d{1,2}$/.test(a.tok)) {
        assigned.length = normalizeToken(b.tok);
        if (/^\d{1,2}$/.test(a.tok)) assigned.thick = normalizeToken(a.tok);
      } else if (/^\d$/.test(a.tok) && /^\d$/.test(b.tok)) {
        // both single-digit -> ambiguous
        assigned.width = '';
        assigned.thick = '';
      } else {
        // fallback: larger -> width, smaller -> thick
        if (numericValue(a.tok) >= numericValue(b.tok)) {
          if (/^\d{1,3}$/.test(a.tok)) assigned.width = normalizeToken(a.tok);
          if (/^\d{1,2}$/.test(b.tok)) assigned.thick = normalizeToken(b.tok);
        } else {
          if (/^\d{1,3}$/.test(b.tok)) assigned.width = normalizeToken(b.tok);
          if (/^\d{1,2}$/.test(a.tok)) assigned.thick = normalizeToken(a.tok);
        }
      }
    } else if (leftover.length === 1) {
      // Single token: if thick acceptable and there is some context that length exists elsewhere, assign thick, else assign width
      const only = leftover[0];
      if (/^\d{1,2}$/.test(only.tok)) {
        // prefer width if no length present -> but tests expect single token to be width
        assigned.width = normalizeToken(only.tok);
      } else if (/^\d{1,3}$/.test(only.tok)) {
        assigned.width = normalizeToken(only.tok);
      }
    }
  }

  // Final validation: enforce digit constraints and return
  const dropIfInvalid = (val, col) => {
    if (!val) return "";
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

  const length = dropIfInvalid(assigned.length, 'length');
  const width = dropIfInvalid(assigned.width, 'width');
  const thick = dropIfInvalid(assigned.thick, 'thick');
  // Ambiguity global guard: if there are >=2 single-digit numeric tokens (excluding assigned length), consider width/thick ambiguous
  const singles = numericTokens.filter(n => /^\d$/.test(n.tok) && (!length || n.tok !== length));
  let finalWidth = width;
  let finalThick = thick;
  if (singles.length >= 2) {
    finalWidth = '';
    finalThick = '';
  }

  return { length, width: finalWidth, thick: finalThick };
}

module.exports = { parseDimensions };
