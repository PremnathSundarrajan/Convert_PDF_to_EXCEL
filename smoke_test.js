/**
 * smoke_test.js — quick local test for strictRemoveHeader logic.
 * Run: node smoke_test.js <path-to-pdf>
 */

"use strict";

const fs       = require("fs");
const path     = require("path");
const PDF2JSON = require("pdf2json");
const { PDFDocument, rgb } = require("pdf-lib");

// ── copy-paste the same constants + helpers from strictRemoveHeader.js ────────

const HEADER_LABELS = ["pcs", "item", "material", "length", "width", "thick"];
const M3_VARIANTS   = ["m³", "m3"];
const FOOTER_LABELS = ["total","material","extra fee","extra kosten","kgs","kg","m³","m3"];
const BAND_TOLERANCE_PT       = 10;
const HEADER_BUFFER_PT        = 3;
const FOOTER_BUFFER_PT        = 4;
const FOOTER_ZONE_TOP_FRACTION= 0.60;

function parsePdf2Json(buffer) {
  return new Promise((resolve, reject) => {
    const parser = new PDF2JSON();
    parser.on("pdfParser_dataError", (e) => reject(e.parserError || e));
    parser.on("pdfParser_dataReady", (d) => resolve(d));
    parser.parseBuffer(buffer);
  });
}

function extractItems(p2jPage, pagePtH, pagePtW) {
  const unitH  = p2jPage.Height;
  const unitW  = p2jPage.Width;
  const scaleY = pagePtH / unitH;
  const scaleX = pagePtW / unitW;
  const items  = [];
  for (const t of (p2jPage.Texts || [])) {
    const raw  = t.R ? t.R.map(r => decodeURIComponent(r.T)).join("") : "";
    const text = raw.trim();
    if (!text) continue;
    const fontSize     = t.R && t.R[0] && t.R[0].TS ? t.R[0].TS[1] : 10;
    const ptTop        = pagePtH - (t.y * scaleY);
    const ptBottom     = ptTop - fontSize;
    items.push({
      text,
      ptX: (t.x * scaleX) + 4,
      ptY: ptTop,
      ptYBottom: ptBottom,
      w: t.w,
      fontSize
    });
  }
  return items;
}

function findTableHeaderTopY(items) {
  const candidates = items.filter(it => {
    const t = it.text.toLowerCase().replace(/\s+/g, "");
    return HEADER_LABELS.some(l => t === l) || M3_VARIANTS.some(v => t === v);
  });
  if (candidates.length < 3) return null;
  const bands = [];
  for (const c of candidates) {
    let placed = false;
    for (const band of bands) {
      if (Math.abs(band[0].ptY - c.ptY) <= BAND_TOLERANCE_PT) { band.push(c); placed = true; break; }
    }
    if (!placed) bands.push([c]);
  }
  for (const band of bands) {
    const texts = new Set(band.map(it => it.text.toLowerCase().replace(/\s+/g, "")));
    if (HEADER_LABELS.every(l => texts.has(l)) && M3_VARIANTS.some(v => texts.has(v)))
      return Math.max(...band.map(it => it.ptY));
  }
  return null;
}

function findFooterTopY(items, pagePtH) {
  const zoneBoundaryY = pagePtH * (1 - FOOTER_ZONE_TOP_FRACTION);
  const fc = items.filter(it => {
    if (it.ptY > zoneBoundaryY) return false;
    const t = it.text.toLowerCase().replace(/[:\s]+$/, "").trim();
    return FOOTER_LABELS.some(l => t === l || t.startsWith(l));
  });
  if (!fc.length) return null;
  if (fc.length === 1) {
    const fi  = fc[0];
    const hasN = items.some(it =>
      Math.abs(it.ptY - fi.ptY) <= BAND_TOLERANCE_PT && it !== fi &&
      (/€/.test(it.text) || /^\d[\d.,]*$/.test(it.text)));
    if (!hasN) { console.warn("Single footer candidate, no adjacent € or numeric — skip"); return null; }
  }
  return Math.max(...fc.map(it => it.ptY));
}

// ── main ──────────────────────────────────────────────────────────────────────

(async () => {
  const pdfPath = process.argv[2];
  if (!pdfPath || !fs.existsSync(pdfPath)) {
    console.error("Usage: node smoke_test.js <path-to-pdf>");
    process.exit(1);
  }

  const inputBuffer = fs.readFileSync(pdfPath);
  const pdfData     = await parsePdf2Json(inputBuffer);
  const pdfDoc      = await PDFDocument.load(inputBuffer, { ignoreEncryption: true });
  const pages       = pdfDoc.getPages();

  console.log(`\n═══ ${path.basename(pdfPath)} — ${pages.length} page(s) ═══\n`);

  for (let i = 0; i < pages.length; i++) {
    const page    = pages[i];
    const { width: W, height: H } = page.getSize();
    const p2jPage = pdfData.Pages[i];
    const items   = extractItems(p2jPage, H, W);

    console.log(`── Page ${i + 1} (${W.toFixed(0)} x ${H.toFixed(0)} pt) ──`);
    console.log(`   Items extracted: ${items.length}`);

    // Dump all items for inspection
    console.log("   All text items:");
    items.forEach(it =>
      console.log(`     y=${it.ptY.toFixed(1)} | ${it.text}`));

    if (i === 0) {
      const hy = findTableHeaderTopY(items);
      if (hy !== null) {
        console.log(`\n   ✓ Table header top Y = ${hy.toFixed(1)} pt`);
        console.log(`     → White rect: x=0, y=${(hy - HEADER_BUFFER_PT).toFixed(1)}, w=${W.toFixed(0)}, h=${(H - hy + HEADER_BUFFER_PT).toFixed(1)}`);
      } else {
        console.log("\n   ✗ Table header NOT detected");
      }
    }

    const fy = findFooterTopY(items, H);
    if (fy !== null) {
      console.log(`\n   ✓ Footer top Y = ${fy.toFixed(1)} pt`);
      console.log(`     → White rect: x=0, y=0, w=${W.toFixed(0)}, h=${(fy + FOOTER_BUFFER_PT).toFixed(1)}`);
    } else {
      console.log("\n   ✗ Footer NOT detected");
    }
    console.log();
  }

  // Write cleaned output for visual inspection
  for (let i = 0; i < pages.length; i++) {
    const page    = pages[i];
    const { width: W, height: H } = page.getSize();
    const p2jPage = pdfData.Pages[i];
    const items   = extractItems(p2jPage, H, W);

    if (i === 0) {
      const tableHeaderTopY = findTableHeaderTopY(items);
      const headerThresholdY = tableHeaderTopY !== null ? tableHeaderTopY : (H * 0.5);
      const headerItems = items.filter(it => it.ptY >= headerThresholdY);

      const DATE_PATTERN = /\b(?:\d{1,2}[-/.\s]\d{1,2}[-/.\s]\d{2,4}|\d{4}[-/.\s]\d{1,2}[-/.\s]\d{1,2})\b/;
      const STOP_LABELS  = ["date", "client", "order", "factory", "delivery", "material", "rectification"];

      function collectRightValues(label) {
        const rightItems = items
          .filter(it => Math.abs(it.ptY - label.ptY) <= BAND_TOLERANCE_PT && it.ptX > label.ptX)
          .sort((a, b) => a.ptX - b.ptX);
        const collected = [];
        for (const item of rightItems) {
          const norm = item.text.toLowerCase().replace(/[:\s]+$/, "").trim();
          if (STOP_LABELS.includes(norm)) break;
          if (collected.length > 0) {
            const prev = collected[collected.length - 1];
            if (item.ptX - (prev.ptX + prev.w) >= 30) break;
          }
          collected.push(item);
        }
        return collected;
      }

      function redactSpan(label, valueItems) {
        const allItems = [label, ...valueItems];
        const minX = Math.min(...allItems.map(it => it.ptX));
        const maxX = Math.max(...allItems.map(it => it.ptX + it.w));
        const minY = Math.min(...allItems.map(it => it.ptYBottom));
        const maxY = Math.max(...allItems.map(it => it.ptY));
        const PAD  = 2;
        page.drawRectangle({
          x:      minX - PAD,
          y:      minY - PAD,
          width:  (maxX - minX) + 2 * PAD,
          height: (maxY - minY) + 2 * PAD,
          color:  rgb(1, 1, 1),
          opacity: 1,
        });
      }

      // 1. Date — label + value (or label alone)
      const dateLabel = headerItems.find(it => /\bdate\b/i.test(it.text));
      if (dateLabel) redactSpan(dateLabel, collectRightValues(dateLabel));

      // 2. Client — label + value (or label alone)
      const clientLabel = headerItems.find(it => /\bclient\b/i.test(it.text));
      if (clientLabel) redactSpan(clientLabel, collectRightValues(clientLabel));

      // 3. Rectification — silently skip if absent
      const rectLabel = headerItems.find(it => /\brectification\b/i.test(it.text));
      if (rectLabel) {
        const rectRight = items
          .filter(it => Math.abs(it.ptY - rectLabel.ptY) <= BAND_TOLERANCE_PT && it.ptX > rectLabel.ptX)
          .sort((a, b) => a.ptX - b.ptX);
        const rectItems = [];
        for (const item of rectRight) {
          if (rectItems.length > 0) {
            const prev = rectItems[rectItems.length - 1];
            if (item.ptX - (prev.ptX + prev.w) >= 30) break;
          }
          rectItems.push(item);
          if (DATE_PATTERN.test(item.text)) break;
        }
        redactSpan(rectLabel, rectItems);
      }
    }

    const fy = findFooterTopY(items, H);
    if (fy !== null) {
      page.drawRectangle({ x:0, y:0, width:W, height:fy+FOOTER_BUFFER_PT, color:rgb(1,1,1), opacity:1 });
    }
  }

  const outPath = path.join(path.dirname(pdfPath), "SMOKE_OUTPUT.pdf");
  fs.writeFileSync(outPath, await pdfDoc.save());
  console.log(`✓ Cleaned PDF saved → ${outPath}`);
})();
