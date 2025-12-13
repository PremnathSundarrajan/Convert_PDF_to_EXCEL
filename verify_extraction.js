const assignColumns = require("./utils/assignColumns");

const tests = [
    {
        name: "Standard",
        tokens: ["1", "headstone", "black", "premium", "53", "62", "8", "0,026"],
        expected: { length: "53", width: "62", thick: "8", m3: "0,026" }
    },
    {
        name: "Failed Split (599)",
        tokens: ["1", "frontskirt", "black", "599", "6", "0,003"],
        expected: { length: "59", width: "9", thick: "6", m3: "0,003" }
    },
    {
        name: "Merged Width (147, 96)",
        tokens: ["1", "sideskirts", "black", "premium", "147", "96", "0,016"],
        expected: { length: "147", width: "9", thick: "6", m3: "0,016" }
    },
    {
        name: "3-Digit Length (159)",
        tokens: ["1", "tombstone", "black", "premium", "159", "59", "6", "0,056"],
        expected: { length: "159", width: "59", thick: "6", m3: "0,056" }
    },
    {
        name: "Range (159-157)",
        tokens: ["1", "tombstone", "black", "premium", "159-157", "59-57", "6", "0,056"],
        expected: { length: "159-157", width: "59-57", thick: "6", m3: "0,056" }
    },
    {
        name: "4-Digit Split (5362 -> 53, 62)",
        tokens: ["1", "headstone", "black", "5362", "8", "0,026"],
        expected: { length: "53", width: "62", thick: "8", m3: "0,026" }
    },
    {
        name: "6-Digit Split (151515 -> 15, 15, 15)",
        tokens: ["1", "flowerblock", "black", "151515", "0,003"],
        expected: { length: "15", width: "15", thick: "15", m3: "0,003" }
    },
    {
        name: "Triple Merge (5996 -> 59, 9, 6)",
        tokens: ["1", "backskirt", "black", "5996", "0,003"],
        expected: { length: "59", width: "9", thick: "6", m3: "0,003" }
    },
    {
        name: "Real Case: 5-Digit (53628 -> 53, 62, 8)",
        tokens: ["1", "headstone", "black", "premium", "53628", "0,026"],
        expected: { length: "53", width: "62", thick: "8", m3: "0,026" }
    },
    {
        name: "Real Case: 6-Digit (200906 -> 200, 90, 6)",
        tokens: ["1", "tombstone", "black", "premium", "200906", "0,108"],
        expected: { length: "200", width: "90", thick: "6", m3: "0,108" }
    },
    {
        name: "Real Case: 5-Digit (14796 -> 147, 9, 6)",
        tokens: ["2", "sideskirts", "black", "premium", "14796", "0,016"],
        expected: { length: "147", width: "9", thick: "6", m3: "0,016" }
    },
    {
        name: "Real Case: Glued Ranges (159-15759-576)",
        tokens: ["1", "tombstone", "black", "premium", "159-15759-576", "0,056"],
        expected: { length: "159-157", width: "59-57", thick: "6", m3: "0,056" }
    },
    {
        name: "Double Merge Headstone (8075, 80,048) -> 80, 75, 8",
        tokens: ["1", "headstone", "black", "8075", "80,048"],
        expected: { length: "80", width: "75", thick: "8", m3: "0,048" }
    },
    {
        name: "Kerbs Bad Split (951210) -> 95, 12, 10",
        tokens: ["2", "kerbs", "black", "951210", "0,023"],
        // Note: The screenshot implies 95 and 1210 might be merged as 951210?
        // OR 95 and 1210 separately but processed wrong.
        // User screenshot shows: L=951, W=21. This implies input was 951210.
        // Let's assume input is merged "951210" or "95, 1210".
        // Screenshot shows "951" "21" "0".
        expected: { length: "95", width: "12", thick: "10", m3: "0,023" }
    },
    {
        name: "Huge Merge Sidekerbs (1761210) -> 176, 12, 10",
        tokens: ["2", "sidekerbs", "black", "1761210", "0,042"],
        expected: { length: "176", width: "12", thick: "10", m3: "0,042" }
    },
    {
        name: "Headstone 5-Digit (65758) -> 65, 75, 8",
        tokens: ["1", "headstone", "black", "65758", "0,039"],
        expected: { length: "65", width: "75", thick: "8", m3: "0,039" }
    },
    {
        name: "Aurora 6-Digit (551058) -> 55, 105, 8",
        tokens: ["2", "headstones", "indian", "aurora", "551058", "0,092"],
        expected: { length: "55", width: "105", thick: "8", m3: "0,092" }
    },
    {
        name: "Sidekerbs 6-Digit Standard (220158) -> 220, 15, 8",
        tokens: ["1", "sidekerbs", "indian", "aurora", "220158", "0,053"],
        expected: { length: "220", width: "15", thick: "8", m3: "0,053" }
    },
    {
        name: "Complex Range Decimal (10063,3-108) -> 100, 63,3-10, 8",
        tokens: ["1", "gardenkerb", "indian", "aurora", "10063,3-108", "0,051"],
        expected: { length: "100", width: "63,3-10", thick: "8", m3: "0,051" }
    },
    // New tests from user's failing PDFs
    {
        name: "Black Premium Headstone (80758) -> 80, 75, 8",
        tokens: ["1", "headstone", "black", "premium", "80758", "0,048"],
        expected: { length: "80", width: "75", thick: "8", m3: "0,048" }
    },
    {
        name: "Kerbs Merged (951210) -> 95, 12, 10",
        tokens: ["2", "kerbs", "black", "premium", "951210", "0,023"],
        expected: { length: "95", width: "12", thick: "10", m3: "0,023" }
    },
    {
        name: "Tombstone (180806) -> 180, 80, 6",
        tokens: ["1", "tombstone", "black", "premium", "180806", "0,086"],
        expected: { length: "180", width: "80", thick: "6", m3: "0,086" }
    },
    {
        name: "Headstone Order 12-003 (53628) -> 53, 62, 8",
        tokens: ["1", "headstone", "black", "premium", "53628", "0,026"],
        expected: { length: "53", width: "62", thick: "8", m3: "0,026" }
    },
    {
        name: "Backskirt (5996) -> 59, 9, 6",
        tokens: ["1", "backskirt", "black", "premium", "5996", "0,003"],
        expected: { length: "59", width: "9", thick: "6", m3: "0,003" }
    },
    {
        name: "Sideskirts (14796) -> 147, 9, 6",
        tokens: ["2", "sideskirts", "black", "premium", "14796", "0,016"],
        expected: { length: "147", width: "9", thick: "6", m3: "0,016" }
    },
    {
        name: "Frontskirt (5996) -> 59, 9, 6",
        tokens: ["1", "frontskirt", "black", "premium", "5996", "0,003"],
        expected: { length: "59", width: "9", thick: "6", m3: "0,003" }
    },
    {
        name: "Flowerblock (151515) -> 15, 15, 15",
        tokens: ["1", "flowerblock", "black", "premium", "151515", "0,003"],
        expected: { length: "15", width: "15", thick: "15", m3: "0,003" }
    },
    {
        name: "Order 12-014 Headstone (65758) -> 65, 75, 8",
        tokens: ["1", "headstone", "black", "premium", "65758", "0,039"],
        expected: { length: "65", width: "75", thick: "8", m3: "0,039" }
    },
    {
        name: "Order 12-014 Kerbs (75126) -> 75, 12, 6",
        tokens: ["2", "kerbs", "black", "premium", "75126", "0,011"],
        expected: { length: "75", width: "12", thick: "6", m3: "0,011" }
    },
    {
        name: "Order 12-014 Sidekerbs (156126) -> 156, 12, 6",
        tokens: ["2", "sidekerbs", "black", "premium", "156126", "0,022"],
        expected: { length: "156", width: "12", thick: "6", m3: "0,022" }
    }
];

let failed = false;

tests.forEach(test => {
    try {
        const result = assignColumns(test.tokens);
        const match =
            result.length === test.expected.length &&
            result.width === test.expected.width &&
            result.thick === test.expected.thick &&
            result.m3 === test.expected.m3;

        if (!match) {
            console.log(`FAIL: ${test.name}`);
            console.log(`  Exp: L=${test.expected.length} W=${test.expected.width} T=${test.expected.thick}`);
            console.log(`  Got: L=${result.length} W=${result.width} T=${result.thick}`);
            failed = true;
        }
    } catch (e) {
        console.log(`ERROR: ${test.name} - ${e.message}`);
        failed = true;
    }
});

if (!failed) console.log("ALL TESTS PASSED");
