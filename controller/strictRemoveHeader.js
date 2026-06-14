/**
 * strictRemoveHeader.js
 *
 * Strict PDF cleaner — LOCAL, GENERIC, COORDINATE-BASED.
 * Stack: pdf2json (text + coords, CJS) + pdf-lib (draw white rects, CJS).
 *
 * ─── HEADER REMOVAL (Page 1 only) ───────────────────────────────────────────
 * Finds the table-header row by detecting the horizontal band where the column
 * labels { pcs, item, material, length, width, thick, m³/m3 } all appear
 * together.  Everything ABOVE that row is covered with a full-width white
 * rectangle.  Works regardless of how many key-value info rows precede it.
 *
 * ─── FOOTER REMOVAL (Every page) ────────────────────────────────────────────
 * Searches the bottom 40 % of each page for the footer key labels
 * { total, material, extra fee, kgs, kg, m³, m3 }.
 * To avoid false-positives with the "material" column in the table, matches
 * must appear below 60 % of page height AND be accompanied by a € symbol or
 * numeric value on the same horizontal band (or there must be ≥2 matches).
 * The topmost matched item drives the top of a full-width white rect that
 * reaches the page bottom.
 *
 * ─── BATCH MODE ──────────────────────────────────────────────────────────────
 * All uploaded files are processed independently (no shared coordinates).
 * Files are processed with concurrency=2 to limit memory pressure.
 * Per-file errors are isolated — one bad file does not abort the batch.
 * Results are packaged into a single ZIP: cleaned_pdfs_<timestamp>.zip
 * Each entry inside: <original_basename>_cleaned.pdf
 *
 * ─── SAFETY ─────────────────────────────────────────────────────────────────
 * If an anchor cannot be found the section is skipped with a console.warn.
 * Drawings, "Finish: …" notes, and table content are never touched.
 *
 * ─── COORDINATE SYSTEMS ─────────────────────────────────────────────────────
 * pdf2json  : origin = TOP-LEFT, y increases downward.
 *             1 unit = 1/4.5 PDF-points  ⟹  ptY = unit_y * (72/4.5) = unit_y * 16
 *             Actually pdf2json stores in "user units" where 1 unit ≈ 1pt but
 *             accessed as x/y in the Texts[].x / .y fields.
 *             Convert to PDF-points: ptVal = unitVal * (pageHeightPt / page.Height)
 *             — see extractItems() for exact conversion.
 * pdf-lib   : origin = BOTTOM-LEFT, y increases upward.
 *             pt = pt  (standard PDF points, same as the PDF spec).
 */

"use strict";

const fs          = require("fs");
const path        = require("path");
const archiver    = require("archiver");
const PDF2JSON    = require("pdf2json");
const { PDFDocument, rgb } = require("pdf-lib");
const jobManager  = require("../utils/jobManager");

// ─── Constants ────────────────────────────────────────────────────────────────

/** The column labels that ALL must appear on the same horizontal band to
 *  identify the table-header row.  m3/m³ is checked separately. */
const HEADER_LABELS = ["pcs", "item", "material", "length", "width", "thick"];
const M3_VARIANTS   = ["m³", "m3"];

/** Footer key labels (case-insensitive prefix).
 *  Trailing colons and spaces are stripped before matching. */
const FOOTER_LABELS = [
  "total",
  "material",
  "extra fee",
  "extra kosten",
  "kgs",
  "kg",
  "m³",
  "m3",
];

/** Items within this many PDF-points vertically are considered "on the same line". */
const BAND_TOLERANCE_PT = 10;

/** Buffer added above the detected table-header row so the row itself is not clipped. */
const HEADER_BUFFER_PT  = 3;

/** Buffer added above the topmost footer label — leaves a clean edge. */
const FOOTER_BUFFER_PT  = 4;

/** Footer candidates must sit below this fraction of page height (top-origin). */
const FOOTER_ZONE_TOP_FRACTION = 0.60;

/** Max files processed in parallel (limits peak memory). */
const CONCURRENCY = 2;

// ─── pdf2json parser ──────────────────────────────────────────────────────────

/**
 * Parse a PDF buffer with pdf2json and return the raw JSON data.
 */
function parsePdf2Json(buffer) {
  return new Promise((resolve, reject) => {
    const parser = new PDF2JSON();
    parser.on("pdfParser_dataError", (err) => reject(err.parserError || err));
    parser.on("pdfParser_dataReady", (data) => resolve(data));
    parser.parseBuffer(buffer);
  });
}

// ─── Item extraction ──────────────────────────────────────────────────────────

/**
 * Extract text items from one pdf2json page and convert coordinates to
 * PDF-points with pdf-lib's origin (bottom-left).
 *
 * @param {object} p2jPage   - one element from pdfData.Pages[]
 * @param {number} pagePtH   - page height in PDF-points (from pdf-lib)
 * @param {number} pagePtW   - page width  in PDF-points (from pdf-lib)
 * @returns {Array<{text, ptX, ptY, ptYBottom}>}
 *   ptY       = TOP    of the text item in pdf-lib coords (origin bottom-left)
 *   ptYBottom = BOTTOM of the text item in pdf-lib coords
 */
function extractItems(p2jPage, pagePtH, pagePtW) {
  const unitH = p2jPage.Height; // page height in pdf2json units
  const unitW = p2jPage.Width;  // page width  in pdf2json units

  // Scale factor: pdf2json units → PDF points
  const scaleY = pagePtH / unitH;
  const scaleX = pagePtW / unitW;

  const items = [];

  for (const t of (p2jPage.Texts || [])) {
    // Decode the text
    const raw = t.R
      ? t.R.map(r => decodeURIComponent(r.T)).join("")
      : "";
    const text = raw.trim();
    if (!text) continue;

    // pdf2json: x, y = top-left of the item in units (top-left origin)
    const unitX = t.x;
    const unitY = t.y;

    // Approximate height of the text in units (use font size if available)
    const fontSize = t.R && t.R[0] && t.R[0].TS ? t.R[0].TS[1] : 10;
    // pdf2json TS[1] is font size in points already (not units)
    const itemHeightPt = fontSize;

    // Convert x, y to PDF-points in pdf-lib's coordinate system
    const ptX       = unitX * scaleX;
    const ptTop     = pagePtH - (unitY * scaleY);         // top edge (pdf-lib)
    const ptBottom  = ptTop - itemHeightPt;               // bottom edge (pdf-lib)

    items.push({ text, ptX, ptY: ptTop, ptYBottom: ptBottom });
  }

  return items;
}

// ─── Detection helpers ────────────────────────────────────────────────────────

/**
 * Find the TOP y-coordinate (pdf-lib, bottom-left origin) of the table-header row.
 *
 * The table-header row is the unique horizontal band where ALL of HEADER_LABELS
 * plus at least one M3_VARIANTS token appear within BAND_TOLERANCE_PT of each other.
 *
 * Returns null if not found.
 */
function findTableHeaderTopY(items) {
  // Candidates: items whose normalised text matches a header label or m3 variant
  const candidates = items.filter(it => {
    const t = it.text.toLowerCase().replace(/\s+/g, "");
    return (
      HEADER_LABELS.some(lbl => t === lbl) ||
      M3_VARIANTS.some(v   => t === v)
    );
  });

  if (candidates.length < 3) return null; // not enough to form a row

  // Group into horizontal bands by ptY proximity
  const bands = [];
  for (const c of candidates) {
    let placed = false;
    for (const band of bands) {
      if (Math.abs(band[0].ptY - c.ptY) <= BAND_TOLERANCE_PT) {
        band.push(c);
        placed = true;
        break;
      }
    }
    if (!placed) bands.push([c]);
  }

  // Find the first band satisfying the full signature
  for (const band of bands) {
    const texts = new Set(band.map(it => it.text.toLowerCase().replace(/\s+/g, "")));
    const hasAll = HEADER_LABELS.every(lbl => texts.has(lbl));
    const hasM3  = M3_VARIANTS.some(v => texts.has(v));
    if (hasAll && hasM3) {
      // Return the highest ptY (topmost in pdf-lib coords = largest y value)
      return Math.max(...band.map(it => it.ptY));
    }
  }

  return null;
}

/**
 * Find the TOP y-coordinate (pdf-lib) of the topmost footer label on a page.
 *
 * Rules:
 *  1. Item must be in the bottom 40 % of the page
 *     (ptY < pagePtH * (1 - FOOTER_ZONE_TOP_FRACTION)).
 *  2. Its text must match a FOOTER_LABELS entry (stripped of trailing colon/space).
 *  3. To avoid false-positives with a single "material" in the table:
 *     require ≥2 footer matches, OR at least one adjacent item on the same
 *     horizontal band that contains a € or is purely numeric.
 *
 * Returns null if no footer found.
 */
function findFooterTopY(items, pagePtH) {
  // In pdf-lib coords: footer zone = y < pagePtH * (1 - 0.60) = pagePtH * 0.40
  const zoneBoundaryY = pagePtH * (1 - FOOTER_ZONE_TOP_FRACTION);

  const footerCandidates = items.filter(it => {
    if (it.ptY > zoneBoundaryY) return false; // item is above footer zone
    const t = it.text.toLowerCase().replace(/[:\s]+$/, "").trim();
    return FOOTER_LABELS.some(lbl => t === lbl || t.startsWith(lbl));
  });

  if (footerCandidates.length === 0) return null;

  // Anti-false-positive: if only one match, require an adjacent € or numeric
  if (footerCandidates.length === 1) {
    const fi = footerCandidates[0];
    const hasNeighbour = items.some(it =>
      Math.abs(it.ptY - fi.ptY) <= BAND_TOLERANCE_PT &&
      it !== fi &&
      (/€/.test(it.text) || /^\d[\d.,]*$/.test(it.text))
    );
    if (!hasNeighbour) {
      console.warn("[strictRemoveHeader] Single footer candidate with no adjacent € or numeric — skipping footer.");
      return null;
    }
  }

  // Return the topmost (largest ptY in pdf-lib coords) among footer candidates
  return Math.max(...footerCandidates.map(it => it.ptY));
}

// ─── Core single-file processing ──────────────────────────────────────────────
// THIS FUNCTION IS THE CANONICAL SINGLE-FILE REDACTION LOGIC.
// Batch mode calls it per-file in a loop — never duplicated.

async function processBuffer(inputBuffer) {
  // 1. Parse with pdf2json for text positions
  const pdfData = await parsePdf2Json(inputBuffer);
  const p2jPages = pdfData.Pages || [];

  // 2. Load with pdf-lib for drawing
  const pdfDoc = await PDFDocument.load(inputBuffer, { ignoreEncryption: true });
  const pages  = pdfDoc.getPages();

  for (let i = 0; i < pages.length; i++) {
    const page        = pages[i];
    const { width: pagePtW, height: pagePtH } = page.getSize();
    const p2jPage     = p2jPages[i];

    if (!p2jPage) {
      console.warn(`[strictRemoveHeader] No pdf2json data for page ${i + 1} — skipping.`);
      continue;
    }

    const items = extractItems(p2jPage, pagePtH, pagePtW);

    // ── Page 1: Header removal ──────────────────────────────────────────────
    if (i === 0) {
      const tableHeaderTopY = findTableHeaderTopY(items);

      if (tableHeaderTopY === null) {
        console.warn("[strictRemoveHeader] Page 1: Table header row NOT found — skipping header redaction.");
      } else {
        // White rect from (tableHeaderTopY - buffer) up to the page top.
        // pdf-lib drawRectangle: y = bottom-left corner of the rect.
        const rectBottomY = tableHeaderTopY - HEADER_BUFFER_PT;
        const rectHeight  = pagePtH - rectBottomY; // reaches page top

        console.log(
          `[strictRemoveHeader] Page 1 header: tableHeaderTopY=${tableHeaderTopY.toFixed(1)} pt, ` +
          `rect=[y=${rectBottomY.toFixed(1)}, h=${rectHeight.toFixed(1)}]`
        );

        page.drawRectangle({
          x      : 0,
          y      : rectBottomY,
          width  : pagePtW,
          height : rectHeight,
          color  : rgb(1, 1, 1),
          opacity: 1,
        });
      }
    }

    // ── All pages: Footer removal ───────────────────────────────────────────
    const footerTopY = findFooterTopY(items, pagePtH);

    if (footerTopY === null) {
      console.warn(`[strictRemoveHeader] Page ${i + 1}: Footer labels NOT found — skipping footer redaction.`);
    } else {
      // White rect from y=0 (page bottom) up to (footerTopY + buffer).
      const rectHeight = footerTopY + FOOTER_BUFFER_PT; // bottom-left at y=0

      console.log(
        `[strictRemoveHeader] Page ${i + 1} footer: footerTopY=${footerTopY.toFixed(1)} pt, ` +
        `rect=[y=0, h=${rectHeight.toFixed(1)}]`
      );

      page.drawRectangle({
        x      : 0,
        y      : 0,
        width  : pagePtW,
        height : rectHeight,
        color  : rgb(1, 1, 1),
        opacity: 1,
      });
    }
  }

  const cleanedBytes = await pdfDoc.save();
  return Buffer.from(cleanedBytes);
}

// ─── Express route handler — BATCH MODE ──────────────────────────────────────

exports.strictRemoveHeader = async (req, res) => {
  const { jobId } = req.query;
  const files     = req.files;

  if (jobId) jobManager.createJob(jobId);

  if (!files || files.length === 0) {
    if (jobId) jobManager.updateJob(jobId, 0, "No files uploaded");
    return res.status(400).json({ error: "No files uploaded." });
  }

  const total     = files.length;
  const skipped   = [];   // { name, reason }
  const results   = [];   // { originalName, cleanedBuffer }

  console.log(`[strictRemoveHeader] Job: ${jobId || "(none)"} | Batch: ${total} file(s)`);

  // ── Process files with limited concurrency ─────────────────────────────────
  for (let i = 0; i < total; i += CONCURRENCY) {
    const chunk = files.slice(i, i + CONCURRENCY);

    await Promise.all(chunk.map(async (file) => {
      const fileIndex  = files.indexOf(file) + 1;
      const statusMsg  = `Cleaning file ${fileIndex} of ${total}: ${file.originalname}`;

      console.log(`[strictRemoveHeader] ${statusMsg}`);
      if (jobId) {
        // Progress: distribute 10–90 range across files
        const pct = Math.round(10 + ((fileIndex - 1) / total) * 80);
        jobManager.updateJob(jobId, pct, statusMsg);
      }

      try {
        const inputBuffer   = fs.readFileSync(file.path);
        const cleanedBuffer = await processBuffer(inputBuffer);
        results.push({ originalName: file.originalname, cleanedBuffer });
      } catch (err) {
        console.warn(`[strictRemoveHeader] SKIPPED ${file.originalname}:`, err.message);
        skipped.push({ name: file.originalname, reason: err.message });
      } finally {
        // Always clean up temp file
        try { fs.unlinkSync(file.path); } catch (_) {}
      }
    }));
  }

  // ── Nothing succeeded ──────────────────────────────────────────────────────
  if (results.length === 0) {
    const summary = `All ${total} file(s) failed. Issues: ${skipped.map(s => s.name).join(", ")}`;
    if (jobId) jobManager.updateJob(jobId, 0, summary);
    return res.status(400).json({
      error: summary,
      skipped,
    });
  }

  // ── Package into ZIP ───────────────────────────────────────────────────────
  if (jobId) jobManager.updateJob(jobId, 92, "Packaging ZIP…");

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const zipName   = `cleaned_pdfs_${timestamp}.zip`;

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);

  const archive = archiver("zip", { zlib: { level: 6 } });

  archive.on("error", (err) => {
    console.error("[strictRemoveHeader] Archiver error:", err);
    // Headers already sent; can't send a JSON error — just destroy
    res.destroy(err);
  });

  archive.pipe(res);

  for (const { originalName, cleanedBuffer } of results) {
    const baseName  = path.basename(originalName, ".pdf");
    const entryName = `${baseName}_cleaned.pdf`;
    archive.append(cleanedBuffer, { name: entryName });
  }

  await archive.finalize();

  // ── Final job status ───────────────────────────────────────────────────────
  const skippedNote = skipped.length > 0
    ? ` — ${skipped.length} skipped (${skipped.map(s => s.name).join(", ")})`
    : "";
  const finalStatus = `Cleaned ${results.length} of ${total} file(s)${skippedNote} — ZIP ready`;

  console.log(`[strictRemoveHeader] ${finalStatus}`);
  if (jobId) jobManager.updateJob(jobId, 100, finalStatus);
};
