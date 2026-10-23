/* "Download PDF": every report page is rasterised from the very same DOM + CSS that is shown on screen
   (SVG foreignObject -> canvas -> JPEG) and packed into an A4 PDF. The PDF therefore looks exactly like the
   on-screen report, the printout and the exported HTML. No libraries. */
(function () {
  'use strict';
  const PQ = (window.PQ = window.PQ || {});

  const PAGE_W = 595.276, PAGE_H = 841.89; // A4 in PDF points

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Page could not be rendered'));
      img.src = src;
    });
  }
  const toBlob = (canvas, type, q) => new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export blocked'))), type, q));

  async function rasterizePage(page, scale) {
    const rect = page.getBoundingClientRect();
    const W = rect.width, H = rect.height;
    const clone = page.cloneNode(true);
    const src = page.querySelectorAll('canvas');
    clone.querySelectorAll('canvas').forEach((cv, i) => {
      const img = document.createElement('img');
      img.setAttribute('src', src[i].toDataURL('image/png'));
      img.setAttribute('alt', '');
      cv.replaceWith(img);
    });
    const wrap = document.createElement('div');
    wrap.className = 'rp-pages rp-flat';
    wrap.appendChild(clone);
    const xhtml = new XMLSerializer().serializeToString(wrap);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject x="0" y="0" width="${W}" height="${H}">` +
      `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${W}px;height:${H}px;background:#fff"><style><![CDATA[${PQ.REPORT_CSS}]]></style>${xhtml}</div></foreignObject></svg>`;
    const img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await toBlob(canvas, 'image/jpeg', 0.92);
    return { bytes: new Uint8Array(await blob.arrayBuffer()), w: canvas.width, h: canvas.height, words: collectText(page) };
  }

  /* ---- invisible text layer (selectable / searchable text, same look) ----
     Every word of the page is placed at its on-screen position as PDF text with render mode 3 (invisible),
     in the built-in Helvetica font; horizontal scaling (Tz) makes each word exactly as wide as on screen. */
  const WIN_ANSI = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e,
    '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
    '−': 0x2d, '→': 0x3e, '←': 0x3c, '≥': 0x3e, '≤': 0x3c, ' ': 0x20 };
  function toHex(str) {
    let h = '';
    for (const ch of str) {
      const c = ch.codePointAt(0);
      const b = WIN_ANSI[ch] != null ? WIN_ANSI[ch] : (c >= 32 && c < 127) || (c >= 160 && c < 256) ? c : 0x3f;
      h += b.toString(16).padStart(2, '0');
    }
    return '<' + h + '>';
  }
  let measureCtx = null;
  function textWidthPx(text, weight, px) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = `${weight} ${px}px Arial, Helvetica, "Liberation Sans", sans-serif`; // metric-compatible with Helvetica
    return measureCtx.measureText(text).width;
  }

  /* Where the baseline sits inside a text rect = ascent / (ascent + descent) of the font actually used. */
  const ratioCache = new Map();
  function baselineRatio(cs) {
    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if (ratioCache.has(font)) return ratioCache.get(font);
    let ratio = 0.8;
    try {
      if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
      measureCtx.font = font;
      const m = measureCtx.measureText('Hg');
      if (m.fontBoundingBoxAscent != null) ratio = m.fontBoundingBoxAscent / (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent);
    } catch (e) { /* keep default */ }
    ratioCache.set(font, ratio);
    return ratio;
  }

  /* Collects {text, x, y, w, size, tz} (PDF points, origin bottom-left) for the words of a page element. */
  function collectText(page) {
    const pr = page.getBoundingClientRect();
    const k = PAGE_W / pr.width;
    const out = [];
    const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let node;
    while ((node = walker.nextNode())) {
      const el = node.parentElement;
      if (!el || /^(SCRIPT|STYLE)$/.test(el.tagName)) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const px = parseFloat(cs.fontSize) || 12;
      const txt = node.nodeValue;
      const re = /\S+/g;
      let m;
      while ((m = re.exec(txt))) {
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        const r = range.getClientRects()[0];
        if (!r || r.width < 0.5) continue;
        const width = textWidthPx(m[0], cs.fontWeight, px);
        if (!width) continue;
        const base = r.top - pr.top + r.height * baselineRatio(cs); // baseline inside the line box
        out.push({ text: m[0] + ' ', x: (r.left - pr.left) * k, y: PAGE_H - base * k, size: px * k, tz: Math.max(10, Math.min(500, (r.width / width) * 100)) });
      }
    }
    return out;
  }

  function textStream(words) {
    let s = 'BT 3 Tr\n';
    for (const w of words) s += `/F1 ${w.size.toFixed(2)} Tf ${w.tz.toFixed(1)} Tz 1 0 0 1 ${w.x.toFixed(2)} ${w.y.toFixed(2)} Tm ${toHex(w.text)} Tj\n`;
    return s + 'ET\n';
  }

  function hexTitle(s) {
    let h = 'FEFF';
    for (const ch of s) { const c = ch.codePointAt(0); h += c > 0xffff ? '' : c.toString(16).padStart(4, '0'); }
    return `<${h}>`;
  }

  function buildPdf(pages, title) {
    const enc = new TextEncoder();
    const parts = [], offsets = [];
    let len = 0;
    const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n`); (Array.isArray(body) ? body : [body]).forEach(push); push('\nendobj\n'); };

    push('%PDF-1.4\n%âãÏÓ\n');
    const kids = pages.map((_, i) => `${4 + i * 3} 0 R`).join(' ');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
    obj(3, `<< /Title ${hexTitle(title)} /Producer (PQ Registration web edition) /CreationDate (D:${PQ.stamp()}) >>`);
    pages.forEach((p, i) => {
      const pg = 4 + i * 3, cs = pg + 1, im = pg + 2;
      obj(pg, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /XObject << /Im0 ${im} 0 R >> /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> >> >> /Contents ${cs} 0 R >>`);
      const content = `q ${PAGE_W} 0 0 ${PAGE_H} 0 0 cm /Im0 Do Q\n` + textStream(p.words || []);
      obj(cs, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      obj(im, [`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`, p.bytes, '\nendstream']);
    });
    const xref = len, total = 3 + pages.length * 3 + 1;
    let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let n = 1; n < total; n++) x += String(offsets[n]).padStart(10, '0') + ' 00000 n \n';
    push(x);
    push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  }

  /* container: the element holding the .rp-page sections. Resolves with a PDF Blob. */
  PQ.reportToPdf = async function (container, title, onProgress) {
    const pages = [...container.querySelectorAll('.rp-page')];
    if (!pages.length) throw new Error('No report pages');
    const out = [];
    for (let i = 0; i < pages.length; i++) {
      out.push(await rasterizePage(pages[i], 2.5));
      if (onProgress) onProgress(i + 1, pages.length);
      await new Promise((r) => setTimeout(r, 0));
    }
    return buildPdf(out, title);
  };
})();
