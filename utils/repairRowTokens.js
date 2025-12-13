function repairRowTokens(tokens) {
  // clone to avoid mutation
  const t = [...tokens];

  // Case 1: split length like ["14","79","6"] → ["147","9","6"]
  if (
    t.length >= 7 &&
    t[3].length === 2 &&
    t[4].length === 2 &&
    t[5].length === 1
  ) {
    t[3] = t[3] + t[4][0]; // 14 + 7 → 147
    t[4] = t[4][1];       // 9
  }

  // Case 2: flowerblock 15 15 15 collapsed
  if (t[3] === "151" && t[4] === "51" && t[5] === "5") {
    t.splice(3, 3, "15", "15", "15");
  }

  return t;
}

module.exports = repairRowTokens;
