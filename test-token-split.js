// Quick test of token splitting logic
const mockJsonWithMerged = {
  order: "12-010",
  client: "Haker",
  rows: [
    { tokens: ["1", "frontkerb", "black", "premium", "80", "66", "0.003"] },
    {
      tokens: [
        "1",
        "sidekerb",
        "left",
        "black",
        "premium",
        "79",
        "66",
        "0.003",
      ],
    },
  ],
};

function validateAndSplitMergedTokens(data) {
  if (!data.rows || !Array.isArray(data.rows)) return data;
  data.rows = data.rows.map((row) => {
    if (!row.tokens || !Array.isArray(row.tokens)) return row;
    const validated = [];
    for (let i = 0; i < row.tokens.length; i++) {
      const token = String(row.tokens[i]).trim();

      // Skip text tokens
      if (!/^[\d,.\-]+$/.test(token)) {
        validated.push(token);
        continue;
      }

      // Skip ranges and decimals
      if (token.includes("-") || token.includes(",")) {
        validated.push(token);
        continue;
      }

      // Check for 2-digit identical tokens
      if (/^\d{2}$/.test(token)) {
        const [d1, d2] = token.split("");
        if (d1 === d2) {
          const singleDigit = parseInt(d1);
          if (singleDigit >= 1 && singleDigit <= 50) {
            validated.push(d1, d2);
            continue;
          }
        }
      }

      validated.push(token);
    }
    return { ...row, tokens: validated };
  });
  return data;
}

const result = validateAndSplitMergedTokens(mockJsonWithMerged);
console.log("Test Results:\n");
result.rows.forEach((row, idx) => {
  console.log(`Row ${idx + 1}:`);
  console.log(
    `  Original: ${JSON.stringify(mockJsonWithMerged.rows[idx].tokens)}`
  );
  console.log(`  Processed: ${JSON.stringify(row.tokens)}`);
  console.log();
});
