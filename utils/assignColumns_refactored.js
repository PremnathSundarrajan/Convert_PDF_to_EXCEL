/**
 * assignColumns (Strict Parsing v2) - clean implementation
 */
function assignColumns(tokens, order = "", client = "") {
    // Basic regex validators
    const lengthWidthRegex = /^\d{1,3}(?:[.,]\d+)?(?:-\d{1,3}(?:[.,]\d+)?)?$/;
    const thickRegex = /^\d{1,2}(?:-\d{1,2})?$/; // thick: 1-2 digits, ranges allowed

    // Normalize tokens (trim)
    const toks = tokens.map(t => String(t).trim()).filter(t => t !== "");

    let pcs = "";
    let m3 = "";
    let item = "";
    let material = "";

    const result = { length: "", width: "", thick: "" };

    // Identify pcs as first token if it matches 1-2 digit number
    let startIdx = 0;
    if (toks.length > 0 && /^[1-9]\d?$/.test(toks[0])) {
        pcs = toks[0];
        startIdx = 1;
    }

    // Identify m3 as last token matching 0,xxx or 0.xxx
    let endIdx = toks.length - 1;
    for (let i = toks.length - 1; i >= startIdx; i--) {
        const cand = toks[i].replace(/,/g, '.');
        if (/^0\.\d+$/.test(cand)) {
            m3 = toks[i];
            endIdx = i - 1; // numeric region ends before m3
            break;
        }
    }

    // Collect numeric tokens between startIdx and endIdx (inclusive)
    const numericCandidates = [];
    for (let i = startIdx; i <= endIdx; i++) {
        if (/^[0-9,.-]+$/.test(toks[i])) {
            numericCandidates.push({ token: toks[i], index: i });
        }
    }

    // Helper normalize numeric: commas -> dots and normalize ranges
    const normalizeNumeric = (s) => {
        if (!s) return "";
        let v = String(s).replace(/,/g, '.');
        v = v.replace(/\s*-\s*/g, ' - ');
        return v;
    };

    // Helpers for validation
    const isValidLength = (s) => lengthWidthRegex.test(String(s));
    const isValidWidth = (s) => lengthWidthRegex.test(String(s));
    const isValidThick = (s) => thickRegex.test(String(s));

    // Try to split a single token into width+thick when merged (e.g., '759' -> '75','9')
    const trySplitWidthThick = (tok) => {
        const digits = String(tok).replace(/\D/g, '');
        if (!/^\d{2,4}$/.test(digits)) return null;

        // prefer 1-digit thick then 2-digit
        const trySplit = (tlen) => {
            const thickPart = digits.slice(-tlen);
            const widthPart = digits.slice(0, -tlen);
            if (widthPart.length < 1 || widthPart.length > 3) return null;
            if (!/^\d{1,3}$/.test(widthPart)) return null;
            if (!/^\d{1,2}$/.test(thickPart)) return null;
            // additional sanity: thick 1..99, width >=1
            const thickVal = parseInt(thickPart, 10);
            const widthVal = parseInt(widthPart, 10);
            if (thickVal >= 1 && thickVal <= 99 && widthVal >= 1) {
                return { width: widthPart, thick: thickPart };
            }
            return null;
        };

        return trySplit(1) || trySplit(2) || null;
    };

    // Assign in strict left-to-right order
    if (numericCandidates.length >= 1) {
        const L = normalizeNumeric(numericCandidates[0].token);
        if (isValidLength(L)) result.length = L;
    }
    if (numericCandidates.length >= 2) {
        const Wraw = normalizeNumeric(numericCandidates[1].token);
        if (isValidWidth(Wraw)) {
            result.width = Wraw;
        } else {
            // attempt to split merged width+thick
            const split = trySplitWidthThick(numericCandidates[1].token);
            if (split) {
                result.width = normalizeNumeric(split.width);
                result.thick = normalizeNumeric(split.thick);
            }
        }
    }
    if (numericCandidates.length >= 3) {
        // assign thick only if not already set by split
        if (!result.thick) {
            const T = normalizeNumeric(numericCandidates[2].token);
            if (isValidThick(T)) result.thick = T;
        }
    }

    // Do not infer: if thick is > 2 digits, reject it (leave blank)
    if (result.thick && !/^\d{1,2}(?:-\d{1,2})?$/.test(result.thick)) {
        result.thick = "";
    }

    // Build remaining item/material text by removing consumed numeric indices and pcs/m3
    const consumed = new Set();
    if (pcs) consumed.add(startIdx - 1 >= 0 ? startIdx -1 : 0);
    if (m3) consumed.add(endIdx + 1 <= toks.length -1 ? endIdx + 1 : toks.length -1);
    numericCandidates.slice(0,3).forEach(n => consumed.add(n.index));

    const remaining = toks.filter((_, i) => !consumed.has(i));
    // If pcs was first token, ensure we removed it
    if (pcs && remaining.length > 0 && /^[1-9]\d?$/.test(remaining[0])) remaining.shift();

    // Now remaining should contain item + material
    item = remaining.join(' ').trim();

    // Extract material: first token = item name, rest = material descriptors
    if (item) {
        const parts = item.split(/\s+/);
        if (parts.length > 1) {
            item = parts[0];
            material = parts.slice(1).join(' ');
        }
    }

    // Final normalization for commas to dots and return
    const normCommas = v => v ? String(v).replace(/,/g, '.') : '';

    return {
        order: order || "",
        client: client || "",
        pcs: normCommas(pcs),
        item: item || "",
        material: material || "",
        length: normCommas(result.length),
        width: normCommas(result.width),
        thick: normCommas(result.thick),
        m3: normCommas(m3),
    };
}

module.exports = assignColumns;

