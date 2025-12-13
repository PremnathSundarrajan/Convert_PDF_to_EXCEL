function normalizePdfText(text) {

  // 1️⃣  Spacing fix: Ensure m3 (0,xxx) has space before it if stuck
   // e.g. 60,026 -> 6 0,026
   text = text.replace(/(\d)(0,\d{3})/g, "$1 $2");

   // 2️⃣ Ensure pcs spacing: 1backskirt → 1 backskirt
   // (Keep this as it's useful and safe)
   text = text.replace(
    /(^|\n)(\d)([a-zA-Z])/g,
    "$1$2 $3"
  );

  // 3️⃣ Normalize spacing LAST
  text = text.replace(/\s+/g, " ");

  return text;
}

module.exports = normalizePdfText;
