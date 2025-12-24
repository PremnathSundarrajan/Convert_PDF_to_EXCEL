/**
 * assignColumns_refactored.js
 *
 * Input  : tokens[]  (from raw_rows split by space)
 * Output : { order, client, pcs, item, material, length, width, thick, m3 }
 *
 * Design goals:
 * - NO hallucination
 * - NO guessing missing values
 * - STRICT digit rules
 * - RAW ROW compatible
 */

function assignColumns(tokens, order = "", client = "") {
    if (!Array.isArray(tokens) || tokens.length === 0) {
        throw new Error("Invalid tokens");
    }

    // ---------- helpers ----------
    const isPCS = (t) => /^\d{1,2}$/.test(t);
    const isM3 = (t) => /^0[.,]\d+$/.test(t);

    const isLengthWidth = (t) =>
        /^\d{1,3}([.,]\d+)?$/.test(t) ||
        /^\d{1,3}([.,]\d+)?-\d{1,3}([.,]\d+)?$/.test(t);

    const isThick = (t) =>
        /^\d{1,2}$/.test(t) ||
        /^\d{1,2}-\d{1,2}$/.test(t);

    const normalize = (v) =>
        v ? String(v).replace(/,/g, ".").trim() : "";

    // ---------- step 1: pcs ----------
    let idx = 0;
    let pcs = "1";

    if (isPCS(tokens[0])) {
        pcs = tokens[0];
        idx = 1;
    }

    // ---------- step 2: m3 ----------
    let m3 = "";
    for (let i = tokens.length - 1; i >= 0; i--) {
        if (isM3(tokens[i])) {
            m3 = tokens[i];
            tokens = tokens.slice(0, i); // trim m3 from tokens
            break;
        }
    }

    if (!m3) {
        throw new Error("m3 not found");
    }

    // ---------- step 3: split text & numeric ----------
    const textTokens = [];
    const numericTokens = [];

    for (let i = idx; i < tokens.length; i++) {
        const t = tokens[i];
        if (/[a-zA-Z]/.test(t)) {
            textTokens.push(t);
        } else {
            numericTokens.push(t);
        }
    }

    // ---------- step 4: item & material ----------
    let item = "";
    let material = "";

    if (textTokens.length > 0) {
        item = textTokens[0];
        material = textTokens.slice(1).join(" ");
    }

    // ---------- step 5: dimensions ----------
    let length = "";
    let width = "";
    let thick = "";

    // We expect LAST THREE numeric tokens to be L W T (raw row rule)
    // But if we have only ONE numeric token, it might be LWT merged (e.g. "53628")
    if (numericTokens.length === 1 && /^\d{5,6}$/.test(numericTokens[0])) {
        const s = numericTokens[0];
        if (s.length === 5) {
            length = s.slice(0, 2);
            width = s.slice(2, 4);
            thick = s.slice(4);
        } else if (s.length === 6) {
            length = s.slice(0, 3);
            width = s.slice(3, 5);
            thick = s.slice(5);
        }
    } else if (numericTokens.length >= 3) {
        const lastThree = numericTokens.slice(-3);

        if (isLengthWidth(lastThree[0])) length = lastThree[0];
        if (isLengthWidth(lastThree[1])) width = lastThree[1];
        if (isThick(lastThree[2])) thick = lastThree[2];
    } else {
        throw new Error("Not enough numeric tokens for dimensions");
    }

    // ---------- final validation ----------
    if (!length || !width || !thick) {
        throw new Error("Invalid dimensions");
    }

    return {
        order: order || "",
        client: client || "",
        pcs: normalize(pcs),
        item,
        material,
        length: normalize(length),
        width: normalize(width),
        thick: normalize(thick),
        m3: normalize(m3),
    };
}

module.exports = assignColumns;
