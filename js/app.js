/* UI controller: ribbon, grids, chart, templates, report, settings. */
(function () {
  'use strict';
  const PQ = window.PQ;
  const db = PQ.db;
  const t = (s) => PQ.t(s);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tick = () => new Promise((r) => setTimeout(r, 20));

  /* ---------- persisted UI state ---------- */
  const ui = {
    view: 'reg', relative: false, theme: null, overlay: false, tableStep: 0,
    ch: { Pressure: true, FlowTotal: true, QuantityTotal: true, PressureSecondary: false, Flow: false, FlowA: false, FlowB: false, FlowAB: false, Quantity: false, QuantityA: false, QuantityB: false, QuantityAB: false, GIN: false, LUGEON: false },
  };
  try {
    const saved = JSON.parse(localStorage.getItem('pq.ui') || '{}');
    if (saved.ch) Object.assign(ui.ch, saved.ch);
    if (saved.relative != null) ui.relative = !!saved.relative;
    if (saved.theme) ui.theme = saved.theme;
    if (saved.overlay != null) ui.overlay = !!saved.overlay;
    if (saved.tableStep != null) ui.tableStep = +saved.tableStep || 0;
  } catch (e) { /* storage unavailable */ }
  const saveUi = () => { try { localStorage.setItem('pq.ui', JSON.stringify({ ch: ui.ch, relative: ui.relative, theme: ui.theme, overlay: ui.overlay, tableStep: ui.tableStep })); } catch (e) { /* ignore */ } };

  const groupNames = () => [1, 2, 3].map((n) => { const v = db.settings['CustGroup' + n + 'Name']; return v === 'Group ' + n ? t(v) : v; });
  const has2nd = () => db.flag('2ndPressureEnabled');
  const has2K = () => db.flag('Is2KInjectionEnabled');
  const ADD_KEYS = ['Flow', 'FlowA', 'FlowB', 'FlowAB', 'Quantity', 'QuantityA', 'QuantityB', 'QuantityAB'];
  const channelOn = (k) => !!ui.ch[k] && (k === 'PressureSecondary' ? has2nd() : ADD_KEYS.includes(k) ? has2K() : true);
  const activeChannels = () => PQ.SERIES.map((s) => s.key).filter(channelOn);

  /* ---------- toast / busy / dialogs ---------- */
  function toast(msg, isErr) {
    const el = document.createElement('div');
    el.className = 'toast' + (isErr ? ' err' : '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), isErr ? 9000 : 4500);
  }
  const busy = (on, msg) => { $('#busy span').textContent = msg || t('Importing…'); $('#busy').hidden = !on; };

  function confirmDialog(title, msg) {
    return new Promise((resolve) => {
      const dlg = $('#dlgConfirm');
      $('#dlgConfirmTitle').textContent = title;
      $('#dlgConfirmMsg').textContent = msg;
      const done = (v) => { dlg.close(); resolve(v); };
      $('#dlgConfirmYes').onclick = () => done(true);
      $('#dlgConfirmNo').onclick = () => done(false);
      dlg.oncancel = () => resolve(false);
      dlg.showModal();
    });
  }

  function inputDialog(title, initial) {
    return new Promise((resolve) => {
      const dlg = $('#dlgInput'), ta = $('#dlgInputText');
      $('#dlgInputTitle').textContent = title;
      ta.value = initial || '';
      let result = null;
      $('#formInput').onsubmit = () => { result = ta.value; };
      $('#dlgInputCancel').onclick = () => dlg.close();
      dlg.onclose = () => resolve(result);
      dlg.showModal();
      ta.focus();
    });
  }

  /* ---------- generic data grid ---------- */
  class Grid {
    constructor(el, o) {
      this.el = el; this.columns = o.columns; this.onSelect = o.onSelect || (() => {}); this.onOpen = o.onOpen; this.emptyKey = o.emptyKey;
      this.rows = []; this.byId = new Map(); this.order = []; this.sel = new Set();
      this.primary = null; this.anchor = null; this.sortKey = null; this.sortDir = 1; this.filter = '';
      el.addEventListener('click', (e) => this.onClick(e));
      el.addEventListener('dblclick', (e) => { const tr = e.target.closest('tbody tr'); if (tr && this.onOpen) this.onOpen(this.byId.get(+tr.dataset.id)); });
      el.addEventListener('keydown', (e) => this.onKey(e));
    }
    cols() { return this.columns().filter((c) => !c.vis || c.vis()); }
    setRows(rows) {
      this.rows = rows;
      this.byId = new Map(rows.map((r) => [r.ID, r]));
      for (const id of [...this.sel]) if (!this.byId.has(id)) this.sel.delete(id);
      if (this.primary != null && !this.byId.has(this.primary)) this.primary = [...this.sel].pop() ?? null;
      this.render(); this.emit();
    }
    view(cols) {
      let rows = this.rows;
      const f = this.filter.trim().toLowerCase();
      if (f) rows = rows.filter((r) => cols.some((c) => String(c.get(r) ?? '').toLowerCase().includes(f)));
      if (this.sortKey) {
        const c = cols.find((x) => x.k === this.sortKey);
        if (c) {
          const val = (r) => (c.sort ? c.sort(r) : c.get(r));
          rows = rows.slice().sort((a, b) => {
            const x = val(a), y = val(b);
            if (x == null || x === '') return 1; if (y == null || y === '') return -1;
            return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * this.sortDir;
          });
        }
      }
      return rows;
    }
    render() {
      const cols = this.cols(), rows = this.view(cols);
      this.order = rows.map((r) => r.ID);
      const top = this.el.scrollTop;
      if (!rows.length) { this.el.innerHTML = `<div class="empty">${esc(t(this.emptyKey || 'No data'))}</div>`; return; }
      const arrow = (c) => (c.k === this.sortKey ? `<span class="arrow">${this.sortDir > 0 ? '▲' : '▼'}</span>` : '');
      let h = '<table><thead><tr>' + cols.map((c) => `<th data-k="${c.k}" class="${c.num ? 'num' : ''}">${esc(c.h())}${arrow(c)}</th>`).join('') + '</tr></thead><tbody>';
      for (const r of rows) {
        h += `<tr data-id="${r.ID}">` + cols.map((c) => `<td class="${c.num ? 'num' : ''}">${esc(c.get(r) ?? '')}</td>`).join('') + '</tr>';
      }
      this.el.innerHTML = h + '</tbody></table>';
      this.el.scrollTop = top;
      this.paint();
    }
    paint() {
      $$('tbody tr', this.el).forEach((tr) => {
        const id = +tr.dataset.id;
        tr.classList.toggle('sel', this.sel.has(id));
        tr.classList.toggle('primary', id === this.primary);
      });
    }
    selected() { return this.order.filter((id) => this.sel.has(id)).map((id) => this.byId.get(id)); }
    primaryRow() { return this.primary != null ? this.byId.get(this.primary) || null : null; }
    emit() { this.onSelect(this.selected(), this.primaryRow()); }
    onClick(e) {
      const th = e.target.closest('th');
      if (th) {
        const k = th.dataset.k;
        if (this.sortKey === k) this.sortDir = -this.sortDir; else { this.sortKey = k; this.sortDir = 1; }
        return this.render();
      }
      const tr = e.target.closest('tbody tr');
      if (!tr) return;
      const id = +tr.dataset.id;
      if (e.shiftKey && this.anchor != null) {
        const a = this.order.indexOf(this.anchor), b = this.order.indexOf(id);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        if (!(e.ctrlKey || e.metaKey)) this.sel.clear();
        this.order.slice(lo, hi + 1).forEach((x) => this.sel.add(x));
        this.primary = id;
      } else if (e.ctrlKey || e.metaKey) {
        if (this.sel.has(id)) { this.sel.delete(id); this.primary = [...this.sel].pop() ?? null; } else { this.sel.add(id); this.primary = id; }
        this.anchor = id;
      } else {
        this.sel = new Set([id]); this.primary = id; this.anchor = id;
      }
      this.paint(); this.emit();
    }
    onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault(); this.order.forEach((id) => this.sel.add(id)); this.paint(); return this.emit();
      }
      if (e.key === 'Enter' && this.onOpen && this.primaryRow()) return this.onOpen(this.primaryRow());
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      if (!this.order.length) return;
      let i = this.primary != null ? this.order.indexOf(this.primary) : -1;
      i = Math.max(0, Math.min(this.order.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
      const id = this.order[i];
      if (e.shiftKey && this.anchor != null) {
        const a = this.order.indexOf(this.anchor);
        const [lo, hi] = a < i ? [a, i] : [i, a];
        this.sel = new Set(this.order.slice(lo, hi + 1));
      } else { this.sel = new Set([id]); this.anchor = id; }
      this.primary = id;
      this.paint(); this.emit();
      const tr = $(`tbody tr[data-id="${id}"]`, this.el);
      if (tr) tr.scrollIntoView({ block: 'nearest' });
    }
  }

  /* ---------- registration grid ---------- */
  const site = (m) => db.baustelle(m.JobSiteID);
  const n2 = (v) => PQ.fmtNum(v, 2);
  const regColumns = () => {
    const g = groupNames();
    return [
      { k: 'site', h: () => t('Job Site'), get: (m) => (site(m) || {}).Jobsite },
      { k: 'g1', h: () => g[0], get: (m) => m.Group1 },
      { k: 'g2', h: () => g[1], get: (m) => m.Group2 },
      { k: 'g3', h: () => g[2], get: (m) => m.Group3 },
      { k: 'start', h: () => t('Start Time'), get: (m) => PQ.fmtDateTime(m.TimeStart), sort: (m) => m.TimeStart },
      { k: 'end', h: () => t('Stop Time'), get: (m) => PQ.fmtDateTime(m.TimeEnd), sort: (m) => m.TimeEnd },
      { k: 'ch', h: () => t('CH'), get: (m) => m.CH, num: true },
      { k: 'mix', h: () => t('Mix'), get: (m) => m.Mix },
      { k: 'hole', h: () => t('Hole'), get: (m) => m.Hole },
      { k: 'stage', h: () => t('Stage'), get: (m) => m.Stage },
      { k: 'len', h: () => t('Length [m]'), get: (m) => n2(m.Length), sort: (m) => m.Length, num: true },
      { k: 'mode', h: () => t('Mode'), get: (m) => { const r = db.regMode(m.ModeID); return r ? t(r.Name) : ''; } },
      { k: 'dur', h: () => t('Duration [s]'), get: (m) => m.Duration, num: true },
      { k: 'pend', h: () => t('End P [bar]'), get: (m) => n2(m.PressureEnd), sort: (m) => m.PressureEnd, num: true },
      { k: 'q', h: () => t('Tot. Susp. [l]'), get: (m) => n2(m.Quantity), sort: (m) => m.Quantity, num: true },
      { k: 'qa', h: () => t('Tot. Add. A [l]'), get: (m) => n2(m.QuantityA), sort: (m) => m.QuantityA, num: true, vis: () => channelOn('QuantityA') },
      { k: 'qb', h: () => t('Tot. Add. B [l]'), get: (m) => n2(m.QuantityB), sort: (m) => m.QuantityB, num: true, vis: () => channelOn('QuantityB') },
      { k: 'qt', h: () => t('Tot. Injected [l]'), get: (m) => n2(m.QuantityTotal), sort: (m) => m.QuantityTotal, num: true, vis: () => channelOn('QuantityTotal') },
      { k: 'perm', h: () => t('Permeability [l/min/m]'), get: (m) => (m.Perm == null ? '' : PQ.fmtNum(m.Perm, 3)), sort: (m) => m.Perm, num: true },
      { k: 'luge', h: () => t('Lugeon (run)'), get: (m) => (m.Luge == null ? '' : PQ.fmtNum(m.Luge, 3)), sort: (m) => m.Luge, num: true },
      { k: 'reason', h: () => t('Stop Reason'), get: (m) => m.Reason },
      { k: 'comment', h: () => t('Comment'), get: (m) => m.Comment },
      { k: 'op', h: () => t('Operator'), get: (m) => m.Operator },
    ];
  };

  const regGrid = new Grid($('#gridReg'), { columns: regColumns, emptyKey: 'No registrations yet — use XML Import or Load demo data.', onSelect: onRegSelect });

  /* ---------- chart ---------- */
  const chart = new PQ.Chart($('#chart'));
  function updateChart() {
    const m = regGrid.primaryRow();
    if (ui.overlay && regGrid.sel.size > 1) return overlayChart(regGrid.selected());
    $('#regSite').textContent = m && site(m) ? site(m).Jobsite : '–';
    chart.emptyText = t('Select a registration to see its graph');
    if (!m) { chart.setData([], 'time'); $('#legend').innerHTML = ''; return; }
    const vals = db.values(m.ID).slice().sort((a, b) => a.TimeStamp - b.TimeStamp);
    const rel = ui.relative;
    const series = PQ.SERIES.filter((s) => channelOn(s.key)).map((s) => Object.assign({}, s, {
      label: t(s.label),
      pts: vals.filter((v) => v[s.key] != null).map((v) => [rel ? (v.TimeStamp - m.TimeStart) / 1000 : v.TimeStamp, v[s.key]]),
    }));
    chart.setData(series, rel ? 'relative' : 'time', m.TimeStart);
    $('#legend').innerHTML = series.filter((s) => s.pts.length).map((s) => `<span class="chip"><i style="background:${s.color}"></i>${esc(s.label)}${s.unit ? ' [' + esc(s.unit) + ']' : ''}</span>`).join('');
  }

  const PALETTE = ['#d32f2f', '#1976d2', '#2e7d32', '#f9a825', '#7b1fa2', '#00838f', '#c2185b', '#5d4037', '#455a64', '#ef6c00'];
  /* Compare runs: one channel (the first ticked one), every selected run on a shared axis, relative time. */
  function overlayChart(sel) {
    const def = PQ.SERIES.find((s) => channelOn(s.key)) || PQ.SERIES[0];
    const series = sel.slice(0, PALETTE.length * 2).map((m, i) => {
      const label = `${m.Hole} / ${m.Stage} · ${PQ.fmtDateTime(m.TimeStart)}`;
      const vals = db.values(m.ID).slice().sort((a, b) => a.TimeStamp - b.TimeStamp);
      return { key: def.key, axis: def.key, axisTitle: t(def.label), label, unit: def.unit, color: PALETTE[i % PALETTE.length], tip: label + ': {v} ' + def.unit,
        pts: vals.filter((v) => v[def.key] != null).map((v) => [(v.TimeStamp - m.TimeStart) / 1000, v[def.key]]) };
    });
    chart.emptyText = t('No data');
    chart.setData(series, 'relative', 0);
    $('#regSite').textContent = [...new Set(sel.map((m) => (site(m) || {}).Jobsite))].join(', ');
    $('#legend').innerHTML = `<span class="chip"><b>${esc(t(def.label))}${def.unit ? ' [' + esc(def.unit) + ']' : ''}:</b></span>` + series.map((s) => `<span class="chip"><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('');
  }

  function onRegSelect(sel) {
    updateChart();
    const n = sel.length, any = n > 0;
    ['btnDelete', 'btnOperator', 'btnComment', 'btnCsvSeries', 'btnCsvOverview', 'btnReport', 'btnPrint', 'btnReportHtml', 'btnPdf', 'btnXmlOriginal', 'btnQa'].forEach((id) => { $('#' + id).disabled = !any; });
    updateStatus();
  }

  function refreshReg() {
    regGrid.setRows(db.data.messungen);
    $('#btnClear').disabled = !db.data.messungen.length;
    updateStatus();
  }

  function updateStatus() {
    const total = db.data.messungen.length, sel = regGrid.sel.size;
    $('#statusLeft').textContent = ui.view === 'tpl'
      ? `${db.data.vorlagen.length} ${t('templates')} · ${tplGrid.sel.size} ${t('selected')}`
      : `${total} ${t('registrations')} · ${sel} ${t('selected')}`;
    $('#statusRight').textContent = db.persistent ? t('Data is stored locally in this browser') : t('Not persistent: browser storage unavailable');
  }

  /* ---------- channel checkboxes ---------- */
  const CH_INJ = [['FlowTotal', 'Flow Total'], ['QuantityTotal', 'Quantity Total'], ['Pressure', 'Main Pressure'], ['PressureSecondary', '2nd Pressure']];
  const CH_ADD = [['Flow', 'Flow Pump'], ['FlowA', 'Flow Add.[A]'], ['FlowB', 'Flow Add.[B]'], ['FlowAB', 'Flow [A+B]'], ['Quantity', 'Quantity Pump'], ['QuantityA', 'Quantity Add.[A]'], ['QuantityB', 'Quantity Add.[B]'], ['QuantityAB', 'Quantity [A+B]']];
  const CH_SET = [['GIN', 'GIN'], ['LUGEON', 'Lugeon'], ['_rel', 'Relative Timebase'], ['_overlay', 'Overlay selected runs']];

  function buildChannelBoxes() {
    const mk = (list) => list.map(([k, label]) => {
      const checked = k === '_rel' ? ui.relative : k === '_overlay' ? ui.overlay : ui.ch[k];
      const hidden = (k === 'PressureSecondary' && !has2nd()) ? 'hidden' : '';
      return `<label ${hidden}><input type="checkbox" data-key="${k}" ${checked ? 'checked' : ''}> ${esc(t(label))}</label>`;
    }).join('');
    $('#chInjection').innerHTML = mk(CH_INJ);
    $('#chAdditional').innerHTML = mk(CH_ADD);
    $('#chSettings').innerHTML = mk(CH_SET);
    $('#chAdditionalWrap').hidden = !has2K();
  }
  $('.channels').addEventListener('change', (e) => {
    const k = e.target.dataset.key;
    if (!k) return;
    if (k === '_rel') ui.relative = e.target.checked; else if (k === '_overlay') ui.overlay = e.target.checked; else ui.ch[k] = e.target.checked;
    saveUi();
    regGrid.render();
    updateChart();
    if (ui.view === 'report') renderReport();
  });

  function applyFeatureFlags() {
    if (!has2nd()) ui.ch.PressureSecondary = false;   // reset2ndPressure
    if (!has2K()) ADD_KEYS.forEach((k) => { ui.ch[k] = false; }); // reset2KInjection
    saveUi();
    buildChannelBoxes();
    regGrid.render(); tplGrid.render(); updateChart();
  }

  /* ---------- views / tabs ---------- */
  function showView(v) {
    ui.view = v;
    $$('.tabs button').forEach((b) => { const on = b.dataset.view === v; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
    $$('.ribbon-panel').forEach((p) => { p.hidden = p.dataset.panel !== v; });
    $$('.view').forEach((el) => { el.hidden = el.id !== 'view-' + v; });
    if (v === 'report') renderReport();
    if (v === 'sum') refreshSummary();
    if (v === 'reg') requestAnimationFrame(() => chart.draw());
    updateStatus();
  }
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

  /* ---------- import / delete / clear / demo / date fix ---------- */
  $('#btnImport').onclick = () => $('#fileXml').click();
  $('#fileXml').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (files.length) await importFiles(files);
  });

  async function importFiles(files) {
    busy(true); await tick();
    const total = { measurements: 0, values: 0 }, warns = [];
    for (const f of files) {
      try {
        const r = PQ.importXML(await f.text());
        total.measurements += r.measurements; total.values += r.values;
        r.warnings.forEach((w) => warns.push(`${f.name}: ${w}`));
        if (r.skipped) warns.push(`${f.name}: ${r.skipped} ${t('records without header were skipped')}`);
      } catch (err) {
        toast(`${t('Import Exception')} (${f.name}): ${err.message}`, true);
      }
      await tick();
    }
    busy(false);
    refreshReg();
    if (total.measurements) toast(`${t('Imported')}: ${total.measurements} ${t('registrations')}, ${total.values} ${t('readings')}`);
    else if (!warns.length) toast(t('Import cancelled!'), true);
    warns.slice(0, 3).forEach((w) => toast('⚠ ' + w, true));
  }

  $('#btnDemo').onclick = async () => {
    busy(true); await tick();
    try { PQ.importXML(PQ.sampleXML()); } catch (e) { toast(e.message, true); }
    busy(false); refreshReg();
    toast(t('Demo data loaded'));
  };

  $('#btnDelete').onclick = async () => {
    const sel = regGrid.selected();
    if (!sel.length) return;
    if (!(await confirmDialog(t('Delete Selected'), `${sel.length} ${t('registration(s) will be deleted. Continue?')}`))) return;
    db.removeMessungen(sel.map((m) => m.ID));
    regGrid.sel.clear(); regGrid.primary = null;
    refreshReg();
  };

  $('#btnClear').onclick = async () => {
    if (!(await confirmDialog(t('Important Question'), t('Clear Database?')))) return;
    db.clearMeasurements();
    regGrid.sel.clear(); regGrid.primary = null;
    refreshReg();
  };

  async function setField(field, titleKey) {
    const sel = regGrid.selected();
    if (!sel.length) return;
    const v = await inputDialog(t(titleKey), sel.length === 1 ? sel[0][field] : '');
    if (v == null) return;
    sel.forEach((m) => { m[field] = v; });
    db.updateMany('messungen', sel);
    regGrid.render();
  }
  $('#btnOperator').onclick = () => setField('Operator', 'Set Operator');
  $('#btnComment').onclick = () => setField('Comment', 'Set Comment');

  $('#regFilter').addEventListener('input', (e) => { regGrid.filter = e.target.value; regGrid.render(); });

  /* ---------- CSV export ---------- */
  $('#btnCsvSeries').onclick = () => { try { PQ.download(`ExportData_${PQ.stamp()}.csv`, PQ.csvSeries(regGrid.selected())); } catch (e) { toast(t('Export selected data failed! ') + e.message, true); } };
  $('#btnCsvOverview').onclick = () => { try { PQ.download(`ExportOverview_${PQ.stamp()}.csv`, PQ.csvOverview(regGrid.selected())); } catch (e) { toast(t('Export selected data failed! ') + e.message, true); } };

  /* ---------- report ---------- */
  let reportCharts = [];
  function reportOpts() {
    return {
      channels: activeChannels(), relative: ui.relative, tableStep: ui.tableStep, groupNames: groupNames(), dateStyle: db.settings.DateFormat,
      logo: db.flag('RepLogoCustVisible') ? db.getLogo() : null,
    };
  }
  function renderReport() {
    reportCharts = PQ.buildReport($('#reportPages'), regGrid.selected(), reportOpts());
  }
  $('#btnReport').onclick = () => { showView('report'); };
  $('#btnPrint').onclick = () => { showView('report'); requestAnimationFrame(() => window.print()); };
  $('#btnReportHtml').onclick = () => {
    if (ui.view !== 'report') showView('report');
    PQ.download(`PQ-Report_${PQ.stamp()}.html`, PQ.reportToHtml($('#reportPages'), t('PQ Registration Report')), 'text/html;charset=utf-8', false);
  };
  // Ctrl+P from any tab prints the report, then returns to the previous tab
  let viewBeforePrint = null;
  window.addEventListener('beforeprint', () => {
    if (ui.view !== 'report') { viewBeforePrint = ui.view; showView('report'); }
  });
  window.addEventListener('afterprint', () => {
    if (viewBeforePrint) { const v = viewBeforePrint; viewBeforePrint = null; showView(v); }
  });

  /* ---------- templates ---------- */
  const tplColumns = () => {
    const g = groupNames();
    const mode = (id, fn) => { const m = fn(id); return m ? t(m.Name) : ''; };
    return [
      { k: 'g1', h: () => g[0], get: (r) => r.Group1 },
      { k: 'g2', h: () => g[1], get: (r) => r.Group2 },
      { k: 'g3', h: () => g[2], get: (r) => r.Group3 },
      { k: 'hole', h: () => t('Hole'), get: (r) => r.Hole },
      { k: 'stage', h: () => t('Stage'), get: (r) => r.Stage },
      { k: 'len', h: () => t('Length [m]'), get: (r) => n2(r.Length), sort: (r) => r.Length, num: true },
      { k: 'mix', h: () => t('Mix'), get: (r) => r.Mix },
      { k: 'rm', h: () => t('Reg Mode'), get: (r) => mode(r.RegModeID, (i) => db.regMode(i)) },
      { k: 'inj', h: () => t('2K Inj. Ratio [%]'), get: (r) => n2(r.InjRatio), sort: (r) => r.InjRatio, num: true, vis: has2K },
      { k: 'pm', h: () => t('Pump Mode'), get: (r) => mode(r.PumpModeID, (i) => db.pumpMode(i)) },
      { k: 'pmax', h: () => t('P-Max [bar]'), get: (r) => n2(r.pMax), sort: (r) => r.pMax, num: true },
      { k: 'pwork', h: () => t('P-Operating [bar]'), get: (r) => n2(r.pWork), sort: (r) => r.pWork, num: true },
      { k: 'pcrack', h: () => t('P-Crack [bar]'), get: (r) => n2(r.pCrack), sort: (r) => r.pCrack, num: true },
      { k: 'pcm', h: () => t('P-Crack Max [bar]'), get: (r) => n2(r.pCrackMax), sort: (r) => r.pCrackMax, num: true },
      { k: 'tc', h: () => t('T-Crack [s]'), get: (r) => n2(r.tCrack), sort: (r) => r.tCrack, num: true },
      { k: 'vmax', h: () => t('V-Max [l]'), get: (r) => n2(r.vMax), sort: (r) => r.vMax, num: true },
      { k: 'qmin', h: () => t('Q-Min [l/min]'), get: (r) => n2(r.qMin), sort: (r) => r.qMin, num: true },
      { k: 'qmax', h: () => t('Speed-Max [%]'), get: (r) => r.qMax, num: true },
      { k: 'gin', h: () => t('GIN [bar*l/m]'), get: (r) => n2(r.GIN), sort: (r) => r.GIN, num: true },
    ];
  };
  const tplGrid = new Grid($('#gridTpl'), {
    columns: tplColumns, emptyKey: 'No templates yet — use New Template.', onOpen: () => editTemplate(),
    onSelect: (sel) => {
      const any = sel.length > 0;
      ['btnTplEdit', 'btnTplDelete', 'btnTplExportSel'].forEach((id) => { $('#' + id).disabled = !any; });
      updateStatus();
    },
  });
  function refreshTpl() {
    tplGrid.setRows(db.data.vorlagen);
    $('#btnTplExportAll').disabled = !db.data.vorlagen.length;
  }

  const NUM_RE = /^[0-9]+(\.([0-9]{1,2})?)?$/;
  const BLANK_TPL = () => ({ Group1: 'Edit', Group2: 'Edit', Group3: 'Edit', Hole: 'Edit', Stage: '0', Length: 0, Mix: 'Edit', pMax: 0, pWork: 0, pCrack: 0, pCrackMax: 0, tCrack: 0, vMax: 0, qMin: 0, qMax: 0, GIN: 0, InjRatio: 0, PumpModeID: 1, RegModeID: 1 });

  /* Opens the editor; resolves with the entered values (and interval settings) or null. */
  function templateDialog(tpl, isNew) {
    return new Promise((resolve) => {
      const dlg = $('#dlgTemplate'), box = $('#tplFields'), hint = $('#tplHint');
      const g = groupNames();
      const regModes = PQ.REG_MODES.filter((r) => has2K() || r.ModeCode !== 2 || r.ID === tpl.RegModeID);
      const numeric = [['Length', 'Length[m]:'], ['pMax', 'Pump Max. Pressure [bar]:'], ['pWork', 'Pump Operating Pressure [bar]:'], ['pCrack', 'Pump Crack Pressure [bar]:'], ['pCrackMax', 'Pump Max. Crack Pressure [bar]:'], ['tCrack', 'Pump Crack Time [s]:'], ['vMax', 'Pump max. Volume [l]:'], ['qMin', 'Pump Flow min [l/min]:'], ['qMax', 'Pump Speed max [%]:'], ['GIN', 'GIN [bar*l/m]:'], ['InjRatio', '2K Injection Ratio [%]:']];
      const row = (id, label, control) => `<label for="${id}">${esc(label)}</label>${control}`;
      const text = (k, label) => row('f_' + k, label, `<input id="f_${k}" data-k="${k}" type="text" maxlength="60" value="${esc(tpl[k])}">`);
      const num = (k, label) => row('f_' + k, label, `<input id="f_${k}" data-k="${k}" class="numeric" type="text" inputmode="decimal" value="${esc(tpl[k])}">`);
      const sel = (id, label, opts, cur) => row(id, label, `<select id="${id}">${opts.map((o) => `<option value="${o.ID}" ${o.ID === cur ? 'selected' : ''}>${esc(t(o.Name))}</option>`).join('')}</select>`);

      let h = text('Group1', g[0] + ' ' + t('Data:')) + text('Group2', g[1] + ' ' + t('Data:')) + text('Group3', g[2] + ' ' + t('Data:')) + text('Hole', t('Hole:')) + text('Stage', t('Stage:'));
      if (isNew) {
        h += `<label for="f_interval">${esc(t('Interval Enable:'))}</label><input id="f_interval" type="checkbox" style="justify-self:start;width:auto">`;
        h += `<div class="interval">` +
          `<label for="f_post">${esc(t('Stage Postfix:'))}</label><input id="f_post" type="text" maxlength="20" disabled>` +
          `<label for="f_min">${esc(t('Min:'))}</label><input id="f_min" class="numeric" inputmode="decimal" type="text" value="0" disabled>` +
          `<label for="f_max">${esc(t('Max:'))}</label><input id="f_max" class="numeric" inputmode="decimal" type="text" value="0" disabled>` +
          `<label for="f_step">${esc(t('Interval:'))}</label><input id="f_step" class="numeric" inputmode="decimal" type="text" value="1" disabled></div>`;
      }
      h += num('Length', t(numeric[0][1])) + text('Mix', t('Mix:')) + sel('f_reg', t('Registration Mode:'), regModes, tpl.RegModeID) + sel('f_pump', t('Pump Mode:'), PQ.PUMP_MODES, tpl.PumpModeID);
      numeric.slice(1).forEach(([k, l]) => { h += num(k, t(l)); });
      box.innerHTML = h;
      $('#dlgTemplateTitle').textContent = isNew ? t('New Template') : t('Edit Template');
      hint.hidden = true;

      const f = (id) => $('#' + id, box);
      const syncState = () => {
        const iv = isNew && f('f_interval').checked;
        f('f_Stage').disabled = iv;
        if (isNew) ['f_post', 'f_min', 'f_max', 'f_step'].forEach((id) => { f(id).disabled = !iv; });
        const is2k = PQ.REG_MODES.find((r) => r.ID === +f('f_reg').value).ModeCode === 2;
        f('f_InjRatio').disabled = !is2k;
      };
      const showHint = (msg) => { hint.textContent = msg; hint.hidden = !msg; };

      $$('input.numeric', box).forEach((inp) => {
        inp._last = inp.value;
        inp.addEventListener('input', () => {
          const v = inp.value.replace(',', '.');
          if (v === '' || NUM_RE.test(v)) { inp.value = v; inp._last = v; showHint(''); }
          else { inp.value = inp._last; showHint(t('Only positive numbers! Maximal 2 digits after point! Examples: 10.00 / 1000 / 10.25')); }
        });
      });
      box.addEventListener('change', syncState);
      syncState();

      let result = null;
      $('#formTemplate').onsubmit = (ev) => {
        const vals = {};
        $$('input[data-k]', box).forEach((inp) => { vals[inp.dataset.k] = inp.value; });
        numeric.forEach(([k]) => { vals[k] = parseFloat(vals[k] || '0') || 0; });
        vals.qMax = Math.round(vals.qMax);
        vals.RegModeID = +f('f_reg').value;
        vals.PumpModeID = +f('f_pump').value;
        if (f('f_InjRatio').disabled) vals.InjRatio = 0;
        const iv = isNew && f('f_interval').checked;
        if (iv) {
          const min = parseFloat(f('f_min').value || '0'), max = parseFloat(f('f_max').value || '0'), step = parseFloat(f('f_step').value || '0');
          if (!(step > 0) || max < min || (max - min) / step > 500) {
            ev.preventDefault();
            showHint(t('Interval: Max must be ≥ Min, the step must be > 0 and at most 500 stages.'));
            return;
          }
          result = { vals, interval: { min, max, step, stepText: f('f_step').value, postfix: f('f_post').value } };
        } else result = { vals, interval: null };
      };
      $('#tplCancel').onclick = () => dlg.close();
      dlg.onclose = () => resolve(result);
      dlg.showModal();
    });
  }

  /* Stage numbers use as many decimals as the interval has (0.5 → "1.5", 0.25 → "1.25"). */
  function stageLabel(x, stepText) {
    const dec = stepText.includes('.') ? Math.min(2, stepText.length - stepText.indexOf('.') - 1) : 0;
    return dec === 0 ? String(Math.round(x * 100) / 100) : x.toFixed(dec);
  }

  async function newTemplate() {
    const r = await templateDialog(BLANK_TPL(), true);
    if (!r) return;
    if (r.interval) {
      const { min, max, step, stepText, postfix } = r.interval;
      for (let i = 0, x = min; x <= max + 1e-9 && i < 500; i++, x = min + (i * step)) {
        db.add('vorlagen', Object.assign({}, r.vals, { Stage: stageLabel(x, stepText) + postfix }));
      }
    } else db.add('vorlagen', Object.assign({}, r.vals));
    refreshTpl();
  }
  async function editTemplate() {
    const cur = tplGrid.primaryRow() || tplGrid.selected()[0];
    if (!cur) return;
    const r = await templateDialog(cur, false);
    if (!r) return;
    Object.assign(cur, r.vals);
    db.update('vorlagen', cur);
    tplGrid.render();
  }
  $('#btnTplNew').onclick = newTemplate;
  $('#btnTplEdit').onclick = editTemplate;
  $('#btnTplDelete').onclick = async () => {
    const sel = tplGrid.selected();
    if (!sel.length) return;
    if (!(await confirmDialog(t('Delete Template'), `${sel.length} ${t('template(s) will be deleted. Continue?')}`))) return;
    db.removeVorlagen(sel.map((r) => r.ID));
    tplGrid.sel.clear(); tplGrid.primary = null;
    refreshTpl();
  };
  $('#btnTplExportSel').onclick = () => PQ.download(`ExportTemplates_${PQ.stamp()}.csv`, PQ.csvTemplates(tplGrid.selected()));
  $('#btnTplExportAll').onclick = () => PQ.download(`ExportTemplates_${PQ.stamp()}.csv`, PQ.csvTemplates(db.data.vorlagen));

  /* ---------- XML for the desktop program ---------- */
  $('#btnXmlOriginal').onclick = () => {
    const sel = regGrid.selected();
    if (!sel.length) return;
    const xml = PQ.xmlForOriginal(sel);
    const check = PQ.analyzeXml(xml);
    if (check.blocking) return toast(t('Generated XML failed its own check – please report this.'), true);
    PQ.download(`PQ-Registration_${PQ.stamp()}.xml`, xml, 'application/xml', false);
    toast(`${sel.length} ${t('registrations')} → ${t('XML for the desktop program. Import it there with XML Import.')}`);
  };

  /* ---------- XML repair ---------- */
  const ISSUE_TEXT = {
    noRecords: 'No header / data / footer records found.',
    xmlDecl: 'Contains an XML declaration (<?xml …?>) – the desktop program cannot read it.',
    spaeniRoot: 'Wrapped in a <Spaeni> root element – the desktop program adds its own.',
    strayText: 'Unexpected text outside the records.',
    headerWithoutFooter: 'A new header starts before the previous run was closed.',
    orphanData: 'Data record without a header.',
    orphanFooter: 'Footer without a header.',
    unclosedRun: 'File ends without a footer for this run.',
    isoDates: 'Dates are written as yyyy-MM-dd. The desktop program only accepts dd.MM.yyyy and aborts with “Import Exception”.',
    mixedDates: 'Dates use mixed formats.',
    badDates: 'Dates that are not real calendar dates.',
    nonInteger: 'Decimal value where the desktop program needs a whole number (CH, SAMP, MODE, DURA).',
    missingAttr: 'Missing attribute the desktop program requires:',
    volumeDrops: 'Quantity decreases during the run.',
    negativePressure: 'Pressure below −1 bar.',
    durationMismatch: 'Footer duration differs from readings × sample interval.',
    extraAttrs: 'Extra attributes from newer firmware (ignored by the desktop program, kept):',
    noReadings: 'No readings.',
    unfinished: 'Run has no end (no footer).',
    zeroTake: 'Zero take – no material injected.',
    endVolumeMismatch: 'Last reading differs from the reported total quantity.',
    lugeonDeviates: 'Device Lugeon deviates more than 5% from permeability × 10 / mean pressure.',
  };
  const issueLi = (i) => `<li class="lvl-${i.level}">${esc(t(ISSUE_TEXT[i.code] || i.code))}${i.count > 1 && i.code !== 'extraAttrs' ? ` ×${i.count}` : ''}${i.example || i.detail ? ` <span class="muted">(${esc(i.example || i.detail)})</span>` : ''}</li>`;

  let repairFiles = [];
  function renderRepair() {
    const list = $('#repairList');
    const target = $('#repairTarget').value;
    if (!repairFiles.length) { list.innerHTML = `<div class="empty">${esc(t('Choose or drop one or more XML files.'))}</div>`; }
    else list.innerHTML = repairFiles.map((f) => {
      const a = f.analysis;
      const verdict = a.blocking ? `<span class="badge error">${esc(t('Needs repair'))}</span>` : `<span class="badge ok">${esc(t('OK for desktop program'))}</span>`;
      const dev = a.meta.sn || a.meta.ver ? ` · ${esc([a.meta.sn, a.meta.ver && 'VER ' + a.meta.ver].filter(Boolean).join(' / '))}` : '';
      return `<div class="rcard"><div class="rhead"><span class="rname">${esc(f.name)}</span>${verdict}<span class="muted">${a.runs} ${esc(t('runs'))} · ${a.rows} ${esc(t('readings'))}${dev}</span></div>` +
        (a.issues.length ? `<ul>${a.issues.map(issueLi).join('')}</ul>` : '') +
        (a.blocking && target === 'original' ? `<div class="muted" style="margin-top:4px">${esc(t('The repaired file keeps all values; only the listed problems are changed.'))}</div>` : '') + '</div>';
    }).join('');
    const any = repairFiles.length > 0;
    ['repairDownload', 'repairZip', 'repairImport'].forEach((id) => { $('#' + id).disabled = !any; });
  }
  async function addRepairFiles(files) {
    for (const f of files) {
      try {
        const text = await f.text();
        repairFiles.push({ name: f.name, text, analysis: PQ.analyzeXml(text) });
      } catch (e) { toast(`${f.name}: ${e.message}`, true); }
    }
    renderRepair();
  }
  const repaired = (f) => {
    const target = $('#repairTarget').value;
    const r = PQ.repairXml(f.text, target);
    return { name: f.name.replace(/\.xml$/i, '') + (target === 'original' ? '_original-format' : '_KLAR') + '.xml', text: r.text };
  };
  $('#btnRepair').onclick = () => { repairFiles = []; renderRepair(); $('#dlgRepair').showModal(); };
  $('#repairClose').onclick = () => $('#dlgRepair').close();
  $('#repairPick').onclick = () => $('#fileRepair').click();
  $('#repairTarget').onchange = renderRepair;
  $('#fileRepair').addEventListener('change', async (e) => { const fs = [...e.target.files]; e.target.value = ''; await addRepairFiles(fs); });
  $('#repairDownload').onclick = () => {
    repairFiles.forEach((f) => { const r = repaired(f); PQ.download(r.name, r.text, 'application/xml', false); });
    toast(t('Repaired file(s) downloaded. Import them in the desktop program with XML Import.'));
  };
  $('#repairZip').onclick = () => {
    PQ.downloadBlob(`PQ-repaired_${PQ.stamp()}.zip`, new Blob([PQ.zip(repairFiles.map((f) => { const r = repaired(f); return { name: r.name, data: r.text }; }))], { type: 'application/zip' }));
  };
  $('#repairImport').onclick = async () => {
    $('#dlgRepair').close();
    busy(true); await tick();
    let n = 0;
    for (const f of repairFiles) { try { n += PQ.importXML(f.text).measurements; } catch (e) { toast(`${f.name}: ${e.message}`, true); } }
    busy(false); refreshReg(); toast(`${t('Imported')}: ${n} ${t('registrations')}`);
  };

  /* ---------- QA ---------- */
  $('#btnQa').onclick = () => {
    const sel = regGrid.selected();
    const list = sel.length ? sel : db.data.messungen;
    $('#qaList').innerHTML = list.map((m) => {
      const w = PQ.qaCheck(m);
      const head = `${esc((site(m) || {}).Jobsite)} · ${esc(m.Hole)} / ${esc(m.Stage)} · ${esc(PQ.fmtDateTime(m.TimeStart))}`;
      return `<div class="rcard"><div class="rhead"><span class="rname">${head}</span>${w.length ? `<span class="badge warn">${w.length}</span>` : `<span class="badge ok">OK</span>`}</div>${w.length ? `<ul>${w.map(issueLi).join('')}</ul>` : ''}</div>`;
    }).join('') || `<div class="empty">${esc(t('No registrations yet — use XML Import or Load demo data.'))}</div>`;
    $('#dlgQa').showModal();
  };

  /* ---------- PDF ---------- */
  $('#btnPdf').onclick = async () => {
    showView('report');
    if (!regGrid.selected().length) return;
    busy(true, t('Creating PDF…')); await tick();
    try {
      const blob = await PQ.reportToPdf($('#reportPages'), t('PQ Registration Report'), (i, n) => { $('#busy span').textContent = `${t('Creating PDF…')} ${i}/${n}`; });
      PQ.downloadBlob(`PQ-Report_${PQ.stamp()}.pdf`, blob);
    } catch (e) {
      toast(`${t('PDF could not be created directly – use Print / Save PDF instead.')} (${e.message})`, true);
    }
    busy(false);
  };
  $('#selTable').value = String(ui.tableStep);
  $('#selTable').onchange = (e) => { ui.tableStep = +e.target.value; saveUi(); if (ui.view === 'report') renderReport(); };

  /* ---------- summary ---------- */
  const sumGrid = new Grid($('#gridSum'), {
    emptyKey: 'No registrations yet — use XML Import or Load demo data.',
    columns: () => [
      { k: 'site', h: () => t('Job Site'), get: (g) => g.site },
      { k: 'hole', h: () => t('Hole'), get: (g) => g.hole },
      { k: 'stage', h: () => t('Stage'), get: (g) => g.stage },
      { k: 'runs', h: () => t('Runs'), get: (g) => g.runs, num: true },
      { k: 'len', h: () => t('Length [m]'), get: (g) => n2(g.length), sort: (g) => g.length, num: true },
      { k: 'dur', h: () => t('Duration [s]'), get: (g) => g.duration, num: true },
      { k: 'qty', h: () => t('Quantity [l]'), get: (g) => n2(g.quantity), sort: (g) => g.quantity, num: true },
      { k: 'spec', h: () => t('Specific take [l/m]'), get: (g) => n2(g.specific), sort: (g) => g.specific, num: true },
      { k: 'pmax', h: () => t('Max pressure [bar]'), get: (g) => n2(g.pmax), sort: (g) => g.pmax, num: true },
      { k: 'perm', h: () => t('Permeability [l/min/m]'), get: (g) => PQ.fmtNum(g.perm, 3), sort: (g) => g.perm, num: true },
      { k: 'luge', h: () => t('Lugeon (last run)'), get: (g) => (g.lastLuge == null ? '' : PQ.fmtNum(g.lastLuge, 3)), sort: (g) => g.lastLuge, num: true },
      { k: 'last', h: () => t('Last start'), get: (g) => PQ.fmtDateTime(g.last), sort: (g) => g.last },
    ],
    onOpen: (g) => { $('#regFilter').value = g.hole; regGrid.filter = g.hole; regGrid.render(); showView('reg'); },
  });
  function refreshSummary() { sumGrid.setRows(PQ.summaryRows(db.data.messungen)); $('#btnSumCsv').disabled = !sumGrid.rows.length; }
  $('#btnSumCsv').onclick = () => PQ.download(`Summary_${PQ.stamp()}.csv`, PQ.csvSummary(sumGrid.rows));

  /* ---------- backstage / settings ---------- */
  const openBackstage = () => { $('#backstage').hidden = false; $('#storageInfo').textContent = db.persistent ? t('Data is stored locally in this browser (IndexedDB). Nothing is uploaded.') : t('Not persistent: browser storage unavailable'); };
  $('#fileBtn').onclick = openBackstage;
  $('#bsClose').onclick = () => { $('#backstage').hidden = true; };
  $$('.bs-item').forEach((b) => b.addEventListener('click', () => {
    $$('.bs-item').forEach((x) => x.classList.toggle('active', x === b));
    $$('[data-bs-page]').forEach((p) => { p.hidden = p.dataset.bsPage !== b.dataset.bs; });
  }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#backstage').hidden) $('#backstage').hidden = true; });

  function syncSettingsUi() {
    $('#set2nd').checked = has2nd();
    $('#set2k').checked = has2K();
    $('#setLogo').checked = db.flag('RepLogoCustVisible');
    $('#setG1').value = db.settings.CustGroup1Name; $('#setG2').value = db.settings.CustGroup2Name; $('#setG3').value = db.settings.CustGroup3Name;
    $('#setDate').value = db.settings.DateFormat;
    $('#setExportDates').value = db.settings.ExportDates || 'iso';
    const logo = db.getLogo(); $('#logoPreview').hidden = !logo; if (logo) $('#logoPreview').src = logo;
  }
  const rerenderAll = () => { regGrid.render(); tplGrid.render(); updateChart(); updateStatus(); if (ui.view === 'report') renderReport(); };
  $('#set2nd').onchange = (e) => { db.setSetting('2ndPressureEnabled', e.target.checked ? 1 : 0); applyFeatureFlags(); };
  $('#set2k').onchange = (e) => { db.setSetting('Is2KInjectionEnabled', e.target.checked ? 1 : 0); applyFeatureFlags(); };
  $('#setLogo').onchange = (e) => { db.setSetting('RepLogoCustVisible', e.target.checked ? 1 : 0); if (ui.view === 'report') renderReport(); };
  ['1', '2', '3'].forEach((n) => $('#setG' + n).addEventListener('input', (e) => { db.setSetting('CustGroup' + n + 'Name', e.target.value); rerenderAll(); }));
  $('#setDate').onchange = (e) => { db.setSetting('DateFormat', e.target.value); rerenderAll(); };
  $('#setExportDates').onchange = (e) => db.setSetting('ExportDates', e.target.value);
  $('#btnBackup').onclick = () => PQ.download(`PQ-Registration-backup_${PQ.stamp()}.json`, JSON.stringify(db.exportAll()), 'application/json', false);
  $('#btnRestore').onclick = () => $('#fileBackup').click();
  $('#fileBackup').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (!(await confirmDialog(t('Restore backup'), t('All current data will be replaced by the backup. Continue?')))) return;
    try {
      db.importAll(JSON.parse(await f.text()));
      PQ.setLang(db.settings.Language || 'en'); applyLang(); syncSettingsUi(); applyFeatureFlags(); refreshReg(); refreshTpl();
      toast(t('Backup restored'));
    } catch (err) { toast(err.message, true); }
  });
  $('#btnLogo').onclick = () => $('#fileLogo').click();
  $('#fileLogo').addEventListener('change', (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (f.size > 1.5 * 1024 * 1024) return toast(t('Logo is too large (max 1.5 MB)'), true);
    const rd = new FileReader();
    rd.onload = () => { db.setLogo(rd.result); syncSettingsUi(); if (ui.view === 'report') renderReport(); };
    rd.readAsDataURL(f);
  });

  /* ---------- language / theme ---------- */
  function applyLang() {
    document.documentElement.lang = PQ.lang;
    $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
    $('#langSel').value = PQ.lang;
    buildChannelBoxes();
  }
  $('#langSel').onchange = (e) => { PQ.setLang(e.target.value); db.setSetting('Language', e.target.value); applyLang(); rerenderAll(); };

  function applyTheme() {
    if (ui.theme) document.documentElement.dataset.theme = ui.theme; else delete document.documentElement.dataset.theme;
  }
  $('#themeBtn').onclick = () => {
    const dark = ui.theme ? ui.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    ui.theme = dark ? 'light' : 'dark'; saveUi(); applyTheme(); chart.draw();
  };

  /* ---------- drag & drop import ---------- */
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { dragDepth++; $('#dropHint').hidden = false; } });
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#dropHint').hidden = true; });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault(); dragDepth = 0; $('#dropHint').hidden = true;
    const files = [...(e.dataTransfer?.files || [])].filter((f) => /\.xml$/i.test(f.name));
    if (files.length && $('#dlgRepair').open) addRepairFiles(files);
    else if (files.length) { showView('reg'); importFiles(files); }
  });

  /* ---------- boot ---------- */
  async function boot() {
    const style = document.createElement('style');
    style.id = 'reportStyle';
    style.textContent = PQ.REPORT_CSS;
    document.head.appendChild(style);

    await db.init();
    PQ.calculateNonRegValues(); // back-fills run-level permeability / Lugeon for older data
    PQ.setLang(db.settings.Language || 'en');
    applyTheme();
    applyLang();
    syncSettingsUi();
    refreshReg();
    refreshTpl();
    showView('reg');
  }
  PQ.app = { ui, regGrid, tplGrid, sumGrid, chart, importFiles, showView, renderReport };
  boot().catch((e) => { console.error(e); toast(String(e.message || e), true); });
})();
