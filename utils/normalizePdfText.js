function normalizePdfText(text) {
  // 1️⃣ Spacing fix: Ensure m3 (0,xxx) has space before it if stuck
  // e.g. 60,026 -> 6 0,026
  text = text.replace(/(\d)(0,\d{3})/g, "$1 $2");

  // 2️⃣ Ensure pcs spacing: 1backskirt → 1 backskirt (at line start)
  text = text.replace(/^(\d)([a-zA-Z])/gm, "$1 $2");

  // 3️⃣ Preserve column alignment: Replace 2+ consecutive spaces with a single space
  // This maintains the distinction between "59  9  6" (columns) vs just normalizing to "59 9 6"
  // CRITICAL: We do NOT collapse ALL whitespace to single spaces anymore
  // Instead, we normalize 2+ spaces to 1 space, and trim line endings
  text = text.replace(/[ \t]{2,}/g, " "); // Collapse multiple spaces/tabs to single space
  text = text.replace(/\n\s+/g, "\n"); // Remove leading spaces from line starts
  text = text.replace(/\s+\n/g, "\n"); // Remove trailing spaces from line ends

  return text;
}

module.exports = normalizePdfText;
