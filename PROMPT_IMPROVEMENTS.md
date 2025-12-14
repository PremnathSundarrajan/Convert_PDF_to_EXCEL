# Enhanced LLM Prompt for PDF Extraction - Complete Documentation

## Problem Identified

Values were overlapping in Excel output with merged dimension columns:

- Example: Expected length=227 but got length=227, width=2, thick=7 (all merged)
- Root cause: LLM was merging dimension tokens despite explicit "don't merge" instructions

## Solution: Ultra-Detailed Prompt with Column Specifications

### Improvements Made

#### 1. **Comprehensive System Prompt**

- Changed from generic JSON assistant to "precision JSON extraction specialist"
- Added emphasis on accuracy and mission-critical nature of task
- Explicit instruction: "Column values must NEVER be merged"

#### 2. **Detailed Column Specifications**

Each column now has:

- **Type** (NUMERIC or TEXT)
- **Format** (number of digits, allowed separators, ranges)
- **Digit Limits** (minimum and maximum values)
- **Rules** (validation constraints, position in row)
- **Examples** (valid and invalid cases)

**Column Specifications:**

| Column    | Type    | Format             | Min-Max   | Examples                   |
| --------- | ------- | ------------------ | --------- | -------------------------- |
| PCS       | NUMERIC | 1-2 digits         | 1-99      | "1", "2", "10", "25"       |
| ITEM      | TEXT    | Words              | N/A       | "headstone", "column"      |
| MATERIAL  | TEXT    | 1-3 words          | N/A       | "black", "royal impala"    |
| LENGTH    | NUMERIC | 2-3d or range      | 10-999    | "22", "180", "159-157"     |
| WIDTH     | NUMERIC | 1-3d/decimal/range | 6-200     | "9", "75", "63,3", "59-57" |
| THICKNESS | NUMERIC | 1-2d or range      | 1-50      | "6", "8", "10-8"           |
| M3        | DECIMAL | 0,XXX or 0.XXX     | 0.001-1.0 | "0,017", "0.056"           |

#### 3. **Critical Token Separation Rules**

- Rule 1: No adjacent dimension merging (e.g., "2275" is invalid)
- Rule 2: Width and thickness cannot merge (e.g., "7510-8" is invalid)
- Rule 3: Length cannot absorb width (e.g., "227" is invalid)
- Rule 4: Exactly 5 numeric tokens per row
- Rule 5: Validation checkpoints after extraction

#### 4. **Detailed Examples with Validation**

- **4 Correct extraction examples** showing proper token separation
- **3 Fatal error examples** showing merged token mistakes
- Each example includes:
  - The PDF row as it appears
  - The correct token breakdown
  - Explanation of what went wrong if applicable

#### 5. **Extraction Procedure**

Step-by-step process:

1. Extract metadata fields (order, client)
2. Identify row start (1-2 digit pcs value)
3. Extract text tokens (item, material)
4. Extract numeric columns ONE BY ONE:
   - LENGTH (should be ≥10)
   - WIDTH (should be ≥6)
   - THICKNESS (should be ≤50)
   - M3 (should start with 0)
5. Validate token count (must be 7)
6. Validate each column against specifications
7. Stop at TOTAL/SUBTOTAL/Finish

#### 6. **Pressure Applied on LLM**

- Opening warning: "🚨 CRITICAL EXTRACTION TASK"
- Motivation: "Errors will cause manufacturing mistakes and financial loss"
- Validation emphasis: "Your accuracy is mission-critical"
- Clear structure with sections and subsections
- Visual formatting (boxes, tables, emphasis markers)
- Repetition of critical rules in multiple formats
- Explicit consequences of errors

### Files Modified

**File:** `utils/extractJsonFromPDF.js`

- **Lines 103-261:** Enhanced prompt with all column specifications
- **Line 97:** Updated system prompt to emphasize precision
- **Line 262:** Model updated to use gpt-4.1
- **Lines 266-273:** Validation logic (already in place)

### Model Configuration

```javascript
const completion = await openai.chat.completions.create({
  model: "gpt-4.1", // Using more powerful model
  messages: [
    { role: "system", content: system },
    { role: "user", content: prompt },
  ],
  temperature: 0, // Maximum consistency
  max_tokens: 16000, // Allow full response
});
```

### Testing

Run: `node test-improved-prompt.js`

This will:

1. Find the first PDF in uploads folder
2. Extract text from PDF
3. Call OpenAI API with improved prompt
4. Display results showing proper column separation

### Expected Improvements

**Before:**

```
Row: "227" (merged length), "2" (width), "7" (thickness)
```

**After:**

```
Row: "22" (length), "7" (width), "10-8" (thickness) [all separate]
```

### Validation Features

The prompt now includes validation checkpoints:
✓ Exactly 7 tokens per row
✓ Token 1 is 1-2 digits
✓ Token 4 (length) ≥ 10
✓ Token 5 (width) ≥ 6
✓ Token 6 (thickness) ≤ 50
✓ Token 7 starts with 0,X or 0.X

If any validation fails, the LLM is instructed to SPLIT merged tokens and retry.

## Additional Context

### Why gpt-4.1?

GPT-4.1 (or gpt-4-turbo) offers:

- Better instruction following
- More reliable structured output
- Better handling of complex rules
- Lower cost than older GPT-4 models
- Faster processing

### Why Detailed Specifications?

LLMs perform better when given:

1. **Explicit constraints** (digit ranges, format rules)
2. **Multiple examples** (correct and incorrect cases)
3. **Clear procedures** (step-by-step extraction process)
4. **Validation rules** (checkpoints to verify correctness)
5. **Motivation** (why accuracy matters)

This is known as "prompt engineering" or "instruction optimization."

### Next Steps

If overlapping values still occur:

1. Check if LLM is parsing PDF text correctly
2. Verify PDF text whitespace preservation in `normalizePdfText.js`
3. Review actual LLM responses in logs
4. Adjust digit limits if needed for specific products
5. Add more examples if new product types appear
