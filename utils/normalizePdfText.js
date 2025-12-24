/**
 * normalizePdfText.js
 * 
 * Simple normalization to fix common PDF extraction issues like stuck words and numbers.
 * We avoid aggressive number-to-number splits here, as GPT is better at context-aware splitting.
 */
function normalizePdfText(text) {
  if (!text) return "";

  // 1. Fix stuck pcs: "1headstone" → "1 headstone" (at line start or after newline)
  text = text.replace(/^(\d)([A-Za-z])/gm, "$1 $2");

  // 2. Fix stuck words and numbers elsewhere: "headstone53" → "headstone 53"
  text = text.replace(/([A-Za-z])(\d)/g, "$1 $2");
  text = text.replace(/(\d)([A-Za-z])/g, "$1 $2");

  // 3. Fix stuck m3: "0,026with" → "0,026 with"
  text = text.replace(/(0[.,]\d{3})([A-Za-z])/g, "$1 $2");

  // 4. Ensure space between potential dimensions and m3
  // e.g. "80,026" → "8 0,026"
  text = text.replace(/(\d)(0[.,]\d{3})/g, "$1 $2");

  return text;
}

module.exports = normalizePdfText;
