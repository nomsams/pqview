/* Report builder. The report is laid out as fixed A4 pages in millimetres and styled by ONE
   stylesheet (PQ.REPORT_CSS). The same CSS is used on screen, for printing / "Save as PDF" and
   inside the exported standalone HTML file, so all three look identical (always light theme). */
(function () {
  'use strict';
  const PQ = (window.PQ = window.PQ || {});
  const t = (s) => (PQ.t ? PQ.t(s) : s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  PQ.REPORT_CSS = `
.rp-pages{--text:#1c2430;--muted:#5d6878;--border:#c4ccd9;--grid:#e1e6ee;--panel:#ffffff;--accent:#1976d2;
  color:#1c2430;font:12px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;color-scheme:light}
.rp-pages *{box-sizing:border-box}
.rp-page{position:relative;width:210mm;height:297mm;margin:0 auto 14px;padding:12mm 14mm 16mm;background:#fff;overflow:hidden;
  box-shadow:0 2px 12px rgba(20,30,50,.25);page-break-after:always;break-after:page}
.rp-page:last-child{page-break-after:auto;break-after:auto}
.rp-head{display:flex;align-items:center;gap:10mm;border-bottom:.8mm solid #1976d2;padding-bottom:3mm;margin-bottom:4mm}
.rp-head h1{margin:0;font-size:19px;font-weight:700;color:#1976d2;flex:1}
.rp-head img{max-height:14mm;max-width:50mm;object-fit:contain}
.rp-head.small h1{font-size:14px}
.rp-head .rp-sub{font-size:11px;color:#5d6878}
.rp-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:1.4mm 6mm;margin-bottom:3mm}
.rp-meta div{display:flex;gap:2mm;min-width:0;border-bottom:.2mm solid #e1e6ee;padding-bottom:.8mm}
.rp-meta dt{margin:0;color:#5d6878;white-space:nowrap}
.rp-meta dd{margin:0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rp-notes{display:grid;grid-template-columns:auto 1fr;gap:1mm 3mm;margin-bottom:3mm;padding:2mm 3mm;background:#eef4fc;border-left:1mm solid #1976d2}
.rp-notes dt{margin:0;color:#5d6878}
.rp-notes dd{margin:0;font-weight:600;white-space:pre-wrap}
.rp-graph{margin-bottom:3mm;break-inside:avoid}
.rp-gtitle{font-weight:600;color:#1976d2;margin-bottom:.8mm}
.rp-graph canvas,.rp-graph img{display:block;width:182mm;height:50mm;border:.2mm solid #c4ccd9;background:#fff}
.rp-foot{position:absolute;left:14mm;right:14mm;bottom:7mm;display:flex;justify-content:space-between;color:#5d6878;font-size:10px;border-top:.2mm solid #c4ccd9;padding-top:1.5mm}
.rp-empty{padding:30px;text-align:center;color:#5d6878}
.rp-table{width:100%;border-collapse:collapse;font-size:10px;font-variant-numeric:tabular-nums}
.rp-table th{background:#e3effc;color:#1c2430;text-align:right;font-weight:600;padding:1.2mm 2mm;border-bottom:.3mm solid #1976d2}
.rp-table td{text-align:right;padding:.6mm 2mm;border-bottom:.15mm solid #e1e6ee}
.rp-table th:first-child,.rp-table td:first-child{text-align:left}
.rp-table tbody tr:nth-child(even){background:#f6f9fd}
.rp-flat .rp-page{margin:0;box-shadow:none}
@page{size:A4;margin:0}
@media print{
  .rp-page{margin:0;box-shadow:none}
}`;

  /* How many graphs fit on a page (first page carries the header + facts). */
  const FIRST_PAGE_GRAPHS = 3;
  const NEXT_PAGE_GRAPHS = 4;
  const TABLE_ROWS = 44;

  /* Readings every `tableStep` seconds (plus the first and last reading). Columns follow the active channels. */
  function tableData(m, o) {
    const vals = PQ.db.values(m.ID).slice().sort((a, b) => a.TimeStamp - b.TimeStamp);
    const cols = [{ key: '_t', h: o.relative ? t('Time [s]') : t('Time') }];
    PQ.SERIES.filter((s) => o.channels.includes(s.key)).forEach((s) => cols.push({ key: s.key, h: t(s.label) + (s.unit ? ` [${s.unit}]` : ''), digits: s.key === 'GIN' || s.key === 'LUGEON' ? 3 : 2 }));
    const rows = [];
    vals.forEach((v, i) => {
      const sec = Math.round((v.TimeStamp - m.TimeStart) / 1000);
      if (!(i === 0 || i === vals.length - 1 || sec % o.tableStep === 0)) return;
      rows.push(cols.map((c) => (c.key === '_t' ? (o.relative ? String(sec) : PQ.fmtTime(v.TimeStamp)) : PQ.fmtNum(v[c.key], c.digits))));
    });
    return { cols, rows };
  }

  function metaRows(m, st, o) {
    const site = PQ.db.baustelle(m.JobSiteID);
    const mode = PQ.db.regMode(m.ModeID);
    const has = (k) => o.channels.includes(k);
    const f = (v, d) => PQ.fmtNum(v, d == null ? 2 : d);
    const rows = [
      [t('Job Site:'), site ? site.Jobsite : ''],
      [o.groupNames[0] + ':', m.Group1], [o.groupNames[1] + ':', m.Group2], [o.groupNames[2] + ':', m.Group3],
      [t('Hole:'), m.Hole], [t('Stage:'), m.Stage], [t('Length:'), f(m.Length) + ' m'],
      [t('Mixture:'), m.Mix], [t('Channel:'), m.CH], [t('Mode:'), mode ? t(mode.Name) : ''],
      [t('Start Time:'), PQ.fmtDateTime(m.TimeStart, o.dateStyle)], [t('Stop Time:'), PQ.fmtDateTime(m.TimeEnd, o.dateStyle)],
      [t('Duration:'), PQ.fmtDuration(m.Duration)],
    ];
    if (has('Pressure')) rows.push([t('Max. Pressure:'), f(st.pressureMax) + ' bar'], [t('Avg. Pressure:'), f(st.pressureAvg) + ' bar']);
    if (has('FlowTotal')) rows.push([t('Max. Flow:'), f(st.flowMax) + ' l/min'], [t('Avg. Flow:'), f(st.flowAvg) + ' l/min']);
    if (has('GIN')) rows.push([t('Max. GIN:'), f(st.ginMax)]);
    if (has('LUGEON')) rows.push([t('Max. Lugeon:'), f(st.lugeonMax)]);
    rows.push([t('Quantity:'), f(m.QuantityTotal) + ' l']);
    if (m.Perm != null) rows.push([t('Permeability:'), f(m.Perm, 3) + ' l/min/m']);
    if (m.Luge != null) rows.push([t('Lugeon (run):'), f(m.Luge, 3)]);
    return rows.filter(([k, v]) => !(v === '' || v == null) || k === t('Job Site:'));
  }

  /* Builds the pages into `container`; returns the list of {canvas, chart} so callers can redraw. */
  PQ.buildReport = function (container, list, o) {
    container.classList.add('rp-pages');
    container.innerHTML = '';
    if (!list.length) {
      container.innerHTML = `<div class="rp-empty">${esc(t('!!No Data Available or Selected!!'))}</div>`;
      return [];
    }
    const series = PQ.SERIES.filter((s) => o.channels.includes(s.key));
    const pages = [];
    list.forEach((m) => {
      const st = PQ.stats(m);
      const queue = series.slice();
      let first = true;
      do {
        const n = first ? FIRST_PAGE_GRAPHS : NEXT_PAGE_GRAPHS;
        pages.push({ m, st, first, graphs: queue.splice(0, n) });
        first = false;
      } while (queue.length);
      if (o.tableStep > 0) {
        const tab = tableData(m, o);
        for (let i = 0; i < tab.rows.length; i += TABLE_ROWS) pages.push({ m, st, first: false, graphs: [], table: { cols: tab.cols, rows: tab.rows.slice(i, i + TABLE_ROWS), part: i / TABLE_ROWS + 1, parts: Math.ceil(tab.rows.length / TABLE_ROWS) } });
      }
    });

    const now = PQ.fmtDateTime(Date.now(), o.dateStyle);
    const jobs = [];
    pages.forEach((p, i) => {
      const site = PQ.db.baustelle(p.m.JobSiteID);
      const el = document.createElement('section');
      el.className = 'rp-page';
      let html = '';
      if (p.first) {
        html += `<header class="rp-head">${o.logo ? `<img src="${o.logo}" alt="">` : ''}<h1>${esc(t('PQ Registration Report'))}</h1></header>`;
        html += '<dl class="rp-meta">' + metaRows(p.m, p.st, o).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('') + '</dl>';
        const notes = [[t('Operator:'), p.m.Operator], [t('Stop Reason:'), p.m.Reason], [t('Comment:'), p.m.Comment]].filter(([, v]) => v);
        if (notes.length) html += '<dl class="rp-notes">' + notes.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('') + '</dl>';
      } else {
        html += `<header class="rp-head small"><h1>${esc(t('PQ Registration Report'))}</h1><span class="rp-sub">${esc(site ? site.Jobsite : '')} · ${esc(p.m.Hole)} · ${esc(p.m.Stage)}</span></header>`;
      }
      if (p.table) {
        html += `<table class="rp-table"><thead><tr>${p.table.cols.map((c) => `<th>${esc(c.h)}</th>`).join('')}</tr></thead><tbody>` +
          p.table.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') + '</tbody></table>';
      }
      p.graphs.forEach((s) => {
        html += `<div class="rp-graph"><div class="rp-gtitle">${esc(t(s.label))}${s.unit ? ` [${esc(s.unit)}]` : ''}</div><canvas data-key="${s.key}"></canvas></div>`;
      });
      html += `<footer class="rp-foot"><span>${esc(now)}</span><span>${i + 1}/${pages.length}</span></footer>`;
      el.innerHTML = html;
      container.appendChild(el);
      jobs.push({ el, p });
    });

    // draw after layout so canvases have their real (mm-based) size
    const charts = [];
    jobs.forEach(({ el, p }) => {
      el.querySelectorAll('canvas').forEach((cv) => {
        const def = PQ.SERIES.find((s) => s.key === cv.dataset.key);
        const ch = new PQ.Chart(cv, { interactive: false, pixelRatio: Math.max(2, window.devicePixelRatio || 1) });
        const vals = PQ.db.values(p.m.ID).slice().sort((a, b) => a.TimeStamp - b.TimeStamp);
        const rel = o.relative;
        const pts = vals.filter((v) => v[def.key] != null).map((v) => [rel ? (v.TimeStamp - p.m.TimeStart) / 1000 : v.TimeStamp, v[def.key]]);
        ch.emptyText = t('No data');
        ch.setData([Object.assign({}, def, { label: t(def.label), pts })], rel ? 'relative' : 'time', p.m.TimeStart);
        charts.push(ch);
      });
    });
    return charts;
  };

  /* Standalone HTML with the same CSS; canvases are frozen into PNG images. */
  PQ.reportToHtml = function (container, title) {
    const clone = container.cloneNode(true);
    const src = container.querySelectorAll('canvas');
    clone.querySelectorAll('canvas').forEach((cv, i) => {
      const img = document.createElement('img');
      img.src = src[i].toDataURL('image/png');
      img.alt = cv.dataset.key || '';
      cv.replaceWith(img);
    });
    return `<!doctype html>\n<html lang="${document.documentElement.lang || 'en'}"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>` +
      `<style>html,body{margin:0;background:#e9edf3}body{padding:14px 0}@media print{html,body{background:#fff}body{padding:0}}${PQ.REPORT_CSS}</style></head>` +
      `<body>${clone.outerHTML}</body></html>`;
  };
})();
