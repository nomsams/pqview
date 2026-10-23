/* XML diagnosis / repair for the Häny "header / data / footer" format, ZIP packaging.
   Pure string code (no DOM) so it also runs in Node.

   Why this exists: the desktop PQ-Registration parses DATE/TIME with the strict pattern
   "dd.MM.yyyy HH:mm:ss". Files from newer firmware (and the "_KLAR" ISO files) carry
   DATE="yyyy-MM-dd", which makes the desktop import abort with "Import Exception". */
(function (root) {
  'use strict';
  const PQ = (root.PQ = root.PQ || {});

  /* Attributes the desktop importer reads without a null check (a missing one aborts the import). */
  const REQUIRED = {
    header: ['CH', 'SAMP', 'DATE', 'TIME', 'JOBSITE', 'GRP1', 'GRP2', 'GRP3', 'USER', 'MIX', 'HOLE', 'STAGE', 'LENGTH', 'MODE'],
    data: ['CH', 'P', 'Q', 'V'],
    footer: ['CH', 'DATE', 'TIME', 'DURA', 'PEND', 'VEND', 'REASON', 'COMMENT'],
  };
  const INT_ATTRS = { header: ['CH', 'SAMP', 'MODE'], data: ['CH'], footer: ['CH', 'DURA'] };
  const ORIGINAL_ORDER = {
    header: ['CH', 'SAMP', 'DATE', 'TIME', 'JOBSITE', 'GRP1', 'GRP2', 'GRP3', 'USER', 'MIX', 'HOLE', 'STAGE', 'LENGTH', 'MODE'],
    footer: ['CH', 'DATE', 'TIME', 'DURA', 'PEND', 'VEND', 'AVEND', 'BVEND', 'PERM', 'LUGE', 'REASON', 'COMMENT'],
  };
  PQ.XML_REQUIRED = REQUIRED;
  PQ.XML_ORDER = ORIGINAL_ORDER;

  const pad = (n) => String(n).padStart(2, '0');
  const TAG_RE = /<\s*(header|data|footer)\b([^>]*?)\/?\s*>/gi;
  const ATTR_RE = /([A-Za-z0-9_:.-]+)\s*=\s*"([^"]*)"/g;
  const num = (s) => { s = String(s); return parseFloat(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); };
  const unesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  PQ.xmlEsc = esc;

  function parseAttrs(str) {
    const o = {}, order = [];
    for (const m of str.matchAll(ATTR_RE)) { o[m[1]] = unesc(m[2]); order.push(m[1]); }
    return { o, order };
  }

  function stripEnvelope(text) {
    let t = text.replace(/^﻿/, '');
    const notes = [];
    if (/<\?xml[^>]*\?>/i.test(t)) { t = t.replace(/<\?xml[^>]*\?>/gi, ''); notes.push('xmlDecl'); }
    if (/<\/?Spaeni\s*>/i.test(t)) { t = t.replace(/<\/?Spaeni\s*>/gi, ''); notes.push('spaeniRoot'); }
    return { t, notes };
  }

  /* Reads all records in order. */
  function records(text) {
    const { t, notes } = stripEnvelope(text);
    const out = [];
    for (const m of t.matchAll(TAG_RE)) {
      const a = parseAttrs(m[2]);
      out.push({ type: m[1].toLowerCase(), attrs: a.o, order: a.order });
    }
    return { recs: out, notes, rest: t.replace(TAG_RE, '').replace(/<!--[\s\S]*?-->/g, '').trim() };
  }

  const isDot = (d) => /^\d{2}\.\d{2}\.\d{4}$/.test(d || '');

  /* ---------- diagnosis ---------- */
  PQ.analyzeXml = function (text) {
    const { recs, notes, rest } = records(text);
    const issues = [];
    const add = (level, code, count, example) => issues.push({ level, code, count: count || 1, example });
    const runs = [];
    let open = {};
    let rows = 0;
    const missing = {};
    const meta = {};

    if (!recs.length) add('error', 'noRecords');
    if (notes.includes('xmlDecl')) add('error', 'xmlDecl');
    if (notes.includes('spaeniRoot')) add('error', 'spaeniRoot');
    if (rest) add('warn', 'strayText', 1, rest.slice(0, 60));

    let isoDates = 0, badDates = 0, nonInt = 0, dotDates = 0;
    for (const r of recs) {
      const a = r.attrs;
      for (const k of REQUIRED[r.type] || []) if (!(k in a)) { (missing[r.type + '.' + k] = missing[r.type + '.' + k] || 0); missing[r.type + '.' + k]++; }
      for (const k of INT_ATTRS[r.type] || []) if (k in a && !/^-?\d+$/.test(a[k].trim())) nonInt++;
      if (a.DATE !== undefined) {
        if (isDot(a.DATE)) dotDates++;
        else { try { PQ.parseDateParts(a.DATE); isoDates++; } catch (e) { badDates++; } }
      }
      if (r.type === 'header') {
        if (open[a.CH]) add('warn', 'headerWithoutFooter', 1, `CH ${a.CH}`);
        open[a.CH] = { h: a, rows: 0, last: null, nonMono: 0, negP: 0 };
        runs.push(open[a.CH]);
        if (a.VER) meta.ver = a.VER;
        if (a.SN) meta.sn = a.SN;
      } else if (r.type === 'data') {
        rows++;
        const run = open[a.CH];
        if (!run) { add('warn', 'orphanData', 1, `CH ${a.CH}`); continue; }
        run.rows++;
        const v = num(a.V), p = num(a.P);
        if (run.last != null && v < run.last) run.nonMono++;
        run.last = v;
        if (p < -1) run.negP++;
      } else if (r.type === 'footer') {
        const run = open[a.CH];
        if (!run) { add('warn', 'orphanFooter', 1, `CH ${a.CH}`); continue; }
        run.f = a;
        delete open[a.CH];
      }
    }
    Object.keys(open).forEach((ch) => add('warn', 'unclosedRun', 1, `CH ${ch}`));
    if (dotDates === 0 && isoDates > 0) add('error', 'isoDates', isoDates);
    else if (isoDates > 0 && dotDates > 0) add('error', 'mixedDates', isoDates);
    if (badDates) add('error', 'badDates', badDates);
    if (nonInt) add('error', 'nonInteger', nonInt);
    Object.entries(missing).forEach(([k, c]) => add('error', 'missingAttr', c, k));

    runs.forEach((run, i) => {
      if (run.nonMono) add('warn', 'volumeDrops', run.nonMono, `#${i + 1}`);
      if (run.negP) add('warn', 'negativePressure', run.negP, `#${i + 1}`);
      if (run.f && run.h.SAMP && run.f.DURA && Math.abs(+run.f.DURA - run.rows * +run.h.SAMP) > 2 * +run.h.SAMP) add('info', 'durationMismatch', 1, `#${i + 1}: DURA ${run.f.DURA} s vs ${run.rows}×${run.h.SAMP} s`);
    });
    const extra = new Set();
    recs.forEach((r) => r.order.forEach((k) => { if (['ID', 'VER', 'SN', 'PERM', 'LUGE'].includes(k)) extra.add(k); }));
    if (extra.size) add('info', 'extraAttrs', extra.size, [...extra].join(', '));

    const blocking = issues.some((x) => x.level === 'error');
    return { runs: runs.length, rows, meta, issues, blocking, dateStyle: dotDates ? (isoDates ? 'mixed' : 'dot') : isoDates ? 'iso' : 'none' };
  };

  /* ---------- repair ---------- */
  function convertDate(d, target) {
    const p = PQ.parseDateParts(d);
    return target === 'iso' ? `${p.y}-${pad(p.m)}-${pad(p.d)}` : `${pad(p.d)}.${pad(p.m)}.${p.y}`;
  }

  /* target: 'original' (dd.MM.yyyy, what the desktop program accepts) or 'iso'.
     Rewrites record by record, keeps unknown attributes, fills what the desktop importer needs. */
  PQ.repairXml = function (text, target = 'original') {
    const { recs } = records(text);
    const changes = {};
    const bump = (k) => { changes[k] = (changes[k] || 0) + 1; };
    const lines = [];
    const stats = {};  // per CH: rows, samp, last P/V for footer defaults
    for (const r of recs) {
      const a = Object.assign({}, r.attrs);
      const order = r.order.slice();
      const put = (k, v) => { if (!(k in a)) order.push(k); a[k] = v; };
      if (r.type === 'header') {
        stats[a.CH] = { rows: 0, samp: parseInt(a.SAMP, 10) || 1, p: 0, v: 0 };
        const defaults = { SAMP: '1', JOBSITE: '', GRP1: '', GRP2: '', GRP3: '', USER: '', MIX: '', HOLE: '', STAGE: '1', LENGTH: '0', MODE: '0' };
        for (const k of REQUIRED.header) if (!(k in a)) { put(k, defaults[k] ?? ''); bump('filled'); }
      } else if (r.type === 'data') {
        const s = stats[a.CH];
        if (s) { s.rows++; s.p = a.P ?? s.p; s.v = a.V ?? s.v; }
        for (const k of ['P', 'Q', 'V']) if (!(k in a)) { put(k, '0'); bump('filled'); }
      } else if (r.type === 'footer') {
        const s = stats[a.CH] || { rows: 0, samp: 1, p: '0', v: '0' };
        const defaults = { DURA: String(s.rows * s.samp), PEND: String(s.p), VEND: String(s.v), REASON: '', COMMENT: '' };
        for (const k of REQUIRED.footer) if (!(k in a)) { put(k, defaults[k] ?? ''); bump('filled'); }
      }
      for (const k of INT_ATTRS[r.type] || []) {
        if (k in a && !/^-?\d+$/.test(a[k].trim())) { const n = Math.round(num(a[k])); if (Number.isFinite(n)) { a[k] = String(n); bump('integers'); } }
      }
      if ('DATE' in a) {
        try {
          const nd = convertDate(a.DATE, target);
          if (nd !== a.DATE) bump('dates');
          a.DATE = nd;
        } catch (e) { bump('badDates'); }
      }
      if ('TIME' in a) {
        try {
          const tp = PQ.parseTimeParts(a.TIME);
          const nt = `${pad(tp.h)}:${pad(tp.mi)}:${pad(tp.s)}`;
          if (nt !== a.TIME) bump('times');
          a.TIME = nt;
        } catch (e) { bump('badTimes'); }
      }
      const attrs = order.map((k) => `${k}="${esc(a[k])}"`).join(' ');
      lines.push(`<${r.type} ${attrs} />`);
    }
    return { text: lines.join('\r\n') + '\r\n', changes };
  };

  /* ---------- ZIP (store only) ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  PQ.crc32 = function (bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

  PQ.zip = function (files) {
    const enc = new TextEncoder();
    const chunks = [], central = [];
    let offset = 0;
    const u16 = (v) => new Uint8Array([v & 255, (v >> 8) & 255]);
    const u32 = (v) => new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]);
    const cat = (...p) => { const n = p.reduce((s, x) => s + x.length, 0), o = new Uint8Array(n); let i = 0; p.forEach((x) => { o.set(x, i); i += x.length; }); return o; };
    const d = new Date();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
      const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = PQ.crc32(data);
      const local = cat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data);
      central.push(cat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name));
      chunks.push(local); offset += local.length;
    }
    const cd = cat(...central);
    return cat(...chunks, cd, u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(offset), u16(0));
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = PQ;
})(typeof window !== 'undefined' ? window : globalThis);
