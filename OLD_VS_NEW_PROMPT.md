# Prompt Enhancement Comparison

## OLD PROMPT (Simple, High-Level)

```
EXTRACT THREE TYPES OF DATA FROM THIS PDF:

1. SINGLE-VALUE FIELDS (extract if present):
   - order: Look for 'order', 'Order', 'ORDER', 'order no', 'order number' - extract the value
   - client: Look for 'client', 'Client', 'CLIENT', 'client name' - extract the value
   - If field is missing, use null

2. MATERIAL ROWS from the PDF table:
   Extract ALL product rows with EXACTLY the tokens as they appear in the table columns, separated by whitespace.

⚠️ CRITICAL: PREVENT TOKEN MERGING
- Each DIMENSION number in a different column MUST be a separate token
- Examples: "59 | 9" → ["59", "9"] (not ["599"])

ROW STRUCTURE & TOKEN COUNT:
- Each row has EXACTLY 7-8 tokens: pcs + item + material + length + width + thick + m3
- pcs: 1-2 digits
- item: text
- material: text
- length: 2-3 digits or range
- width: 2-3 digits or range
- thick: 1-2 digits
- m3: decimal

[Brief examples provided]
```

**Problems:**

- ❌ No digit range limits
- ❌ No format specifications
- ❌ No column position validation
- ❌ Only 2 brief wrong examples
- ❌ No extraction procedure
- ❌ Generic system prompt
- ❌ No validation checkpoints

---

## NEW PROMPT (Comprehensive, Detailed Specifications)

```
🚨 CRITICAL EXTRACTION TASK - MAXIMUM PRECISION REQUIRED 🚨

You are extracting structured data from a material order PDF. Errors in extraction
will cause manufacturing mistakes and financial loss. Your accuracy is mission-critical.

═══════════════════════════════════════════════════════════════════════════════════════
PART 1: METADATA FIELDS
═══════════════════════════════════════════════════════════════════════════════════════

1. "order" field:
   - Search: 'order', 'Order', 'ORDER', 'order no', 'order no.', 'order number'
   - Extract the numerical value exactly as shown
   - Example: "order 12-008" → "12-008"

2. "client" field:
   - Search: 'client', 'Client', 'CLIENT', 'client name', 'customer'
   - Extract the name exactly
   - Example: "client Miali" → "Miali"

═══════════════════════════════════════════════════════════════════════════════════════
PART 2: TABLE ROW EXTRACTION - COLUMN-BY-COLUMN SPECIFICATIONS
═══════════════════════════════════════════════════════════════════════════════════════

Each material row has EXACTLY 7 columns (in this order):

┌─────┬──────────┬──────────┬────────┬────────┬──────┬────────┐
│ PCS │  ITEM    │ MATERIAL │ LENGTH │ WIDTH  │THICK │  M3    │
├─────┼──────────┼──────────┼────────┼────────┼──────┼────────┤
│ 1-2 │ TEXT     │ TEXT     │ 2-3d/r │ 2-3d/r │1-2d  │decimal │
└─────┴──────────┴──────────┴────────┴────────┴──────┴────────┘

[COLUMN 1] PCS (pieces/quantity):
  - Type: NUMERIC
  - Format: 1-2 digits only (1, 2, 3, 10, 25, etc.)
  - Range: 1-99
  - Rules: MUST be first token. NEVER combine with other values.

[COLUMN 2] ITEM (product name):
  - Type: TEXT (1-4 words)
  - Examples: "headstone", "tombstone", "column", "backskirt"
  - Rules: Starts AFTER pcs. Can contain spaces and hyphens.

[COLUMN 3] MATERIAL (stone/material type):
  - Type: TEXT (1-3 words typically)
  - Examples: "black", "premium", "royal impala", "grey"
  - Rules: Can be 1-3 words. Comes AFTER item name.

[COLUMN 4] LENGTH (dimension):
  - Type: NUMERIC or RANGE
  - Format: Simple (20, 53, 100, 180, 227) or Range (100-90, 159-157)
  - Digit Limits: Min=10, Max=999
  - Range first value: 100-300
  - Range second value: 50-300
  - Rules: ALWAYS separate from width and thickness.

[COLUMN 5] WIDTH (dimension):
  - Type: NUMERIC or RANGE
  - Format: Simple (9, 15, 30, 62, 87) or Decimal (63,3) or Range (59-57)
  - Digit Limits: Min=6, Max=200
  - Rules: ALWAYS separate from length and thickness.

[COLUMN 6] THICKNESS (dimension):
  - Type: NUMERIC or RANGE (rare)
  - Format: Simple (6, 8, 10, 15, 25) or Range (10-8, 8-6)
  - Digit Limits: Min=1, Max=50
  - Rules: SMALLEST numeric value. NEVER 3+ digits without hyphen.

[COLUMN 7] M3 (cubic meters):
  - Type: DECIMAL
  - Format: 0,XXX or 0.XXX
  - Range: 0.001 to 1.0
  - Rules: ALWAYS last token. ALWAYS starts with 0.

═══════════════════════════════════════════════════════════════════════════════════════
CRITICAL: TOKEN SEPARATION RULES
═══════════════════════════════════════════════════════════════════════════════════════

⚠️ MERGED TOKENS ARE FATAL ERRORS - PREVENT AT ALL COSTS ⚠️

Rule 1: NO ADJACENT DIMENSION MERGING
Rule 2: WIDTH AND THICKNESS CANNOT MERGE
Rule 3: LENGTH CANNOT ABSORB WIDTH
Rule 4: EACH NUMERIC COLUMN = ONE TOKEN (exactly 5 per row)
Rule 5: VALIDATION CHECKPOINTS

═══════════════════════════════════════════════════════════════════════════════════════
DETAILED EXAMPLES (Study These Carefully)
═══════════════════════════════════════════════════════════════════════════════════════

✅ CORRECT EXTRACTION 1:
PDF Row: 1  column  royal impala  22  75  10-8  0,017
Tokens:  ["1", "column", "royal", "impala", "22", "75", "10-8", "0,017"]

✅ CORRECT EXTRACTION 2:
PDF Row: 1  headstone  royal impala  56  87  8  0,039
Tokens:  ["1", "headstone", "royal", "impala", "56", "87", "8", "0,039"]

✅ CORRECT EXTRACTION 3:
PDF Row: 1  tombstone left  royal impala  180  25  8  0,036
Tokens:  ["1", "tombstone", "left", "royal", "impala", "180", "25", "8", "0,036"]

✅ CORRECT EXTRACTION 4:
PDF Row: 2  sidekerbs  black  premium  150  106  10  0,018
Tokens:  ["2", "sidekerbs", "black", "premium", "150", "106", "10", "0,018"]

❌ FATAL ERROR 1 (merged length+width):
PDF Row: 1  headstone  royal impala  56  87  8  0,039
WRONG:   ["1", "headstone", "royal", "impala", "5687", "8", "0,039"]
         ↑ The "5687" is merged from length(56) + width(87)
CORRECT: ["1", "headstone", "royal", "impala", "56", "87", "8", "0,039"]

❌ FATAL ERROR 2 (merged width+thickness):
PDF Row: 1  tombstone left  royal impala  180  25  8  0,036
WRONG:   ["1", "tombstone", "left", "royal", "impala", "180", "258", "0,036"]
         ↑ The "258" is merged from width(25) + thickness(8)
CORRECT: ["1", "tombstone", "left", "royal", "impala", "180", "25", "8", "0,036"]

❌ FATAL ERROR 3 (catastrophic merge):
PDF Row: 1  column  royal impala  22  75  10-8  0,017
WRONG:   ["1", "column", "royal", "impala", "227510-8", "0,017"]
         ↑ All dimensions merged!
CORRECT: ["1", "column", "royal", "impala", "22", "75", "10-8", "0,017"]

═══════════════════════════════════════════════════════════════════════════════════════
EXTRACTION PROCEDURE
═══════════════════════════════════════════════════════════════════════════════════════

1. SCAN for metadata fields (order, client)
2. IDENTIFY row start: 1-2 digit pcs value
3. EXTRACT text tokens: item, material (can be multiple words)
4. EXTRACT numeric columns ONE BY ONE:
   - First numeric = LENGTH (should be ≥10)
   - Next numeric = WIDTH (should be ≥6)
   - Next numeric = THICKNESS (should be ≤50)
   - Last numeric = M3 (should start with 0)
5. VALIDATE: token count = 7
6. VALIDATE: each column against specifications
7. STOP at: TOTAL, SUBTOTAL, Finish:, signature, notes

═══════════════════════════════════════════════════════════════════════════════════════
[Examples of correct JSON output provided]
═══════════════════════════════════════════════════════════════════════════════════════
```

**Improvements:**

- ✅ Explicit digit range limits for each column
- ✅ Format specifications (simple, range, decimal)
- ✅ Column position validation rules
- ✅ 4 correct + 3 fatal error examples
- ✅ Step-by-step extraction procedure
- ✅ Enhanced system prompt emphasizing precision
- ✅ Multiple validation checkpoints
- ✅ Visual formatting (tables, boxes, emphasis)
- ✅ Repetition of critical rules
- ✅ Explicit consequences explained
- ✅ Pressure/motivation for accuracy

---

## Key Differences

| Aspect             | OLD                    | NEW                              |
| ------------------ | ---------------------- | -------------------------------- |
| System Prompt      | Generic JSON assistant | Precision specialist             |
| Column Specs       | Generic                | Explicit per column              |
| Digit Limits       | Not specified          | Explicit min/max                 |
| Format Rules       | Vague                  | Detailed with examples           |
| Examples           | 2 brief                | 7 detailed (4 correct + 3 wrong) |
| Extraction Process | Implied                | Step-by-step documented          |
| Validation         | Mentioned              | Multiple checkpoints             |
| Motivation         | None                   | Mission-critical emphasis        |
| Visual Formatting  | Minimal                | Extensive (tables, boxes)        |
| Word Count         | ~400 words             | ~2500 words                      |

---

## Why These Changes Help

### 1. **Explicit Constraints**

- LLMs follow explicit constraints better than vague instructions
- Digit limits prevent out-of-range values

### 2. **Examples as Training Data**

- Each example reinforces the pattern
- Showing errors teaches what to avoid
- "Fatal error" labeling makes consequences clear

### 3. **Step-by-Step Procedure**

- Reduces ambiguity in extraction order
- Makes validation explicit
- Easier for LLM to follow than narrative instructions

### 4. **Visual Emphasis**

- Tables and boxes highlight key information
- Emoji and symbols break up text
- Color-coded sections (✅ correct, ❌ wrong)

### 5. **Repetition**

- Critical rules appear multiple times
- Different formats reinforce the message
- Increased "pressure" on LLM to follow

### 6. **Context and Motivation**

- Explaining why accuracy matters
- "Manufacturing mistakes" makes consequences real
- "Mission-critical" emphasizes importance

---

## Testing the Improvement

To see the new prompt in action:

```bash
cd Convert_PDF_to_EXCEL
node test-improved-prompt.js
```

This will:

1. Load a PDF from uploads
2. Extract text
3. Call OpenAI with new prompt
4. Display results with proper column separation
