/* XML import (Häny V1 format), derived-value calculation, CSV export, helpers. */
(function () {
  'use strict';
  const PQ = (window.PQ = window.PQ || {});
  const db = () => PQ.db;

  /* ---------- helpers ---------- */
  const pad = (n, l = 2) => String(n).padStart(l, '0');

  /* ---- Dates ----
     The instrument writes DATE="dd.MM.yyyy". Letting the browser / Excel guess
     ("03.04.2024" vs "03/04/2024") breaks across countries, so dates are always
     built from explicit components, shown unambiguously, and exported as ISO. */
  PQ.DATE_FORMATS = { dot: 'dd.MM.yyyy', iso: 'yyyy-MM-dd' };

  function validYmd(y, m, d) {
    const t = new Date(y, m - 1, d);
    return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
  }

  /* Returns {y,m,d,ambiguous}; throws on anything that is not a real calendar date. */
  PQ.parseDateParts = function (str) {
    const s = String(str == null ? '' : str).trim();
    let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s); // yyyy-MM-dd (ISO) / yyyy/MM/dd
    let y, mo, d, ambiguous = false;
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = /^(\d{1,2})([./-])(\d{1,2})\2(\d{2}|\d{4})$/.exec(s))) {
      let a = +m[1], b = +m[3];
      y = +m[4]; if (m[4].length === 2) y += 2000;
      if (m[2] === '.') { d = a; mo = b; }                 // dd.MM.yyyy – the instrument's own format
      else if (a > 12) { d = a; mo = b; }                  // 25/03/2024 can only be day-first
      else if (b > 12) { mo = a; d = b; }                  // 03/25/2024 can only be month-first
      else { d = a; mo = b; ambiguous = a !== b; }         // 03/04/2024 – assume day-first, flag it
    } else throw new Error(`Unrecognised date "${s}" (expected dd.MM.yyyy or yyyy-MM-dd)`);
    if (!validYmd(y, mo, d)) throw new Error(`Invalid calendar date "${s}"`);
    return { y, m: mo, d, ambiguous };
  };

  PQ.parseTimeParts = function (str) {
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,]\d+)?\s*(AM|PM)?$/i.exec(String(str == null ? '' : str).trim());
    if (!m) throw new Error(`Unrecognised time "${str}" (expected HH:mm:ss)`);
    let h = +m[1];
    if (m[4]) { h = h % 12 + (m[4].toUpperCase() === 'PM' ? 12 : 0); }
    if (h > 23 || +m[2] > 59 || +(m[3] || 0) > 59) throw new Error(`Invalid time "${str}"`);
    return { h, mi: +m[2], s: +(m[3] || 0) };
  };

  /* Local wall-clock time of the instrument -> epoch ms. `warnings` collects ambiguity notes. */
  PQ.parseDateTime = function (date, time, warnings) {
    const d = PQ.parseDateParts(date), t = PQ.parseTimeParts(time);
    if (d.ambiguous && warnings && !warnings.includes(`Ambiguous date "${date}" read as day/month/year`)) {
      warnings.push(`Ambiguous date "${date}" read as day/month/year`);
    }
    return new Date(d.y, d.m - 1, d.d, t.h, t.mi, t.s).getTime();
  };

  PQ.fmtDate = function (ms, style) {
    const d = new Date(ms);
    style = style || (PQ.db && PQ.db.settings.DateFormat) || 'dot';
    return style === 'iso' ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  };
  PQ.fmtTime = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  PQ.fmtDateTime = function (ms, style) {
    if (ms == null) return '';
    return `${PQ.fmtDate(ms, style)} ${PQ.fmtTime(ms)}`;
  };
  /* CSV defaults to ISO: Excel reads yyyy-MM-dd HH:mm:ss correctly in every country
     (the desktop app's d/M/yyyy export depends on the PC's regional settings).
     "ExportDates = screen" makes exports look exactly like the screen and the report. */
  PQ.fmtCsvDate = function (ms) {
    if (ms == null) return '';
    return PQ.fmtDateTime(ms, PQ.db && PQ.db.settings.ExportDates === 'screen' ? undefined : 'iso');
  };

  /* Rewrites every DATE="…" attribute to ISO yyyy-MM-dd (like the "_KLAR.xml" files of the
     companion tool). Returns {text, changed, warnings}. */
  PQ.normalizeXmlDates = function (text) {
    const warnings = [];
    let changed = 0;
    const out = text.replace(/\bDATE="([^"]*)"/g, (all, val) => {
      try {
        const p = PQ.parseDateParts(val);
        if (p.ambiguous && !warnings.includes(val)) warnings.push(val);
        const iso = `${p.y}-${pad(p.m)}-${pad(p.d)}`;
        if (iso !== val) changed++;
        return `DATE="${iso}"`;
      } catch (e) { warnings.push(e.message); return all; }
    });
    return { text: out, changed, warnings };
  };
  PQ.fmtNum = function (n, digits = 2) {
    if (n == null || Number.isNaN(n)) return '';
    return String(Math.round(n * 10 ** digits) / 10 ** digits);
  };
  PQ.fmtDuration = function (sec) {
    sec = Math.round(sec || 0);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  };

  /* ImportService.parseStringToDouble: a comma means "1.234,5" (European),
     otherwise "1'234.5" / "1234.5". */
  PQ.parseNumber = function (s) {
    if (s == null) return 0;
    s = String(s).trim();
    if (s === '') return 0;
    s = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/'/g, '');
    const n = parseFloat(s);
    if (Number.isNaN(n)) throw new Error(`Invalid number "${s}"`);
    return n;
  };

  /* ---------- derived values (ImportService.calculateNonRegValues) ---------- */
  PQ.calculateNonRegValues = function () {
    for (const m of db().data.messungen) {
      if (m.Perm == null) PQ.computeRunMetrics(m);
      if (m.Calculated === 1) continue;
      const len = m.Length;
      const vals = db().values(m.ID);
      for (const v of vals) {
        v.Flow = v.FlowTotal - v.FlowA - v.FlowB;
        v.Quantity = v.QuantityTotal - v.QuantityA - v.QuantityB;
        let perMetre = 0;
        if (len) {
          v.GIN = (v.Pressure * v.QuantityTotal) / len;
          perMetre = v.FlowTotal / len;
        } else {
          v.GIN = 0;
        }
        v.LUGEON = v.Pressure > 0 ? (perMetre * 10) / v.Pressure : 0;
      }
      db().updateMany('messwerte', vals);
      m.Calculated = 1;
      db().update('messungen', m);
    }
  };

  /* ---------- XML import ---------- */
  PQ.importXML = function (text) {
    const created = [];
    try { return importXMLInner(text, created); }
    catch (e) { db().removeMessungen(created); throw e; } // all-or-nothing per file
  };

  function importXMLInner(text, created) {
    const cleaned = text.replace(/^﻿/, '').replace(/<\?xml[^>]*\?>/i, '');
    const doc = new DOMParser().parseFromString(`<Spaeni>${cleaned}</Spaeni>`, 'application/xml');
    const err = doc.querySelector('parsererror');
    if (err) throw new Error('XML could not be read: ' + err.textContent.split('\n')[0]);

    const open = new Map(); // CH -> {m, samp, n}
    const warnings = [];
    const parseDateTime = (d, t) => PQ.parseDateTime(d, t, warnings);
    const result = { measurements: 0, values: 0, skipped: 0, warnings };
    const nodes = doc.querySelectorAll('header, data, footer');

    for (const node of nodes) {
      const a = (n) => node.getAttribute(n);
      const ch = parseInt(a('CH'), 10);

      if (node.nodeName === 'header') {
        const jobsite = a('JOBSITE') || '';
        let site = db().data.baustelle.find((b) => b.Jobsite === jobsite);
        if (!site) site = db().add('baustelle', { Jobsite: jobsite, State: null, Hinweise: null });
        const modeCode = parseInt(a('MODE'), 10);
        const mode = PQ.REG_MODES.find((r) => r.ModeCode === modeCode) || PQ.REG_MODES[0];
        const m = db().add('messungen', {
          JobSiteID: site.ID, ModeID: mode.ID,
          TimeStart: parseDateTime(a('DATE'), a('TIME')), TimeEnd: null,
          CH: ch, Mix: a('MIX') || '', Hole: a('HOLE') || '', Stage: a('STAGE') || '',
          Length: PQ.parseNumber(a('LENGTH')),
          Duration: null, PressureEnd: null, Quantity: null, QuantityA: null, QuantityB: null, QuantityTotal: null,
          Calculated: 0, Operator: a('USER') || '', Comment: '', Reason: '',
          Samp: parseInt(a('SAMP'), 10) || 1, SN: a('SN') || '', Ver: a('VER') || '', Perm: null, Luge: null, PermSrc: null,
          Group1: a('GRP1') || '', Group2: a('GRP2') || '', Group3: a('GRP3') || '',
        });
        created.push(m.ID);
        open.set(ch, { m, samp: parseInt(a('SAMP'), 10) || 1, n: 0 });
        result.measurements++;
      } else if (node.nodeName === 'data') {
        const st = open.get(ch);
        if (!st) { result.skipped++; continue; }
        const num = (n) => PQ.parseNumber(a(n));
        const aq = num('AQ'), bq = num('BQ'), av = num('AV'), bv = num('BV');
        db().add('messwerte', {
          Messung: st.m.ID,
          TimeStamp: st.m.TimeStart + st.n * st.samp * 1000,
          Pressure: num('P'), PressureSecondary: num('PP'),
          FlowTotal: num('Q'), FlowA: aq, FlowB: bq, FlowAB: aq + bq, Flow: null,
          QuantityTotal: num('V'), QuantityA: av, QuantityB: bv, QuantityAB: av + bv, Quantity: null,
          GIN: null, LUGEON: null,
        });
        st.n++;
        result.values++;
      } else if (node.nodeName === 'footer') {
        const st = open.get(ch);
        if (!st) { result.skipped++; continue; }
        const m = st.m;
        m.TimeEnd = parseDateTime(a('DATE'), a('TIME'));
        m.Duration = parseInt(a('DURA'), 10) || 0;
        m.PressureEnd = PQ.parseNumber(a('PEND'));
        m.Quantity = PQ.parseNumber(a('VEND'));
        m.QuantityA = PQ.parseNumber(a('AVEND'));
        m.QuantityB = PQ.parseNumber(a('BVEND'));
        m.QuantityTotal = m.Quantity + m.QuantityA + m.QuantityB;
        if (a('PERM') != null && a('PERM') !== '') { m.Perm = PQ.parseNumber(a('PERM')); m.PermSrc = 'device'; }
        if (a('LUGE') != null && a('LUGE') !== '') m.Luge = PQ.parseNumber(a('LUGE'));
        m.Reason = a('REASON') || '';
        m.Comment = a('COMMENT') || '';
        db().update('messungen', m);
        open.delete(ch);
      }
    }
    for (const { m } of open.values()) db().update('messungen', m);
    PQ.calculateNonRegValues();
    return result;
  }

  /* ---------- run-level permeability / Lugeon ----------
     Newer firmware writes PERM and LUGE in the footer. PERM equals
     Quantity / (Duration / 60) / Length  [l/min per metre]; LUGE ≈ PERM × 10 / mean pressure.
     When the file does not carry them they are calculated the same way. */
  PQ.computeRunMetrics = function (m) {
    if (m.Duration == null) return;
    if (m.Perm == null) {
      const len = m.Length, q = m.QuantityTotal || 0;
      m.Perm = len > 0 && m.Duration > 0 ? q / (m.Duration / 60) / len : 0;
      m.PermSrc = 'calc';
    }
    if (m.Luge == null) {
      const p = db().values(m.ID).map((v) => v.Pressure).filter((x) => x != null);
      const avg = p.length ? p.reduce((s, x) => s + x, 0) / p.length : 0;
      m.Luge = avg > 0 ? (m.Perm * 10) / avg : 0;
    }
    db().update('messungen', m);
  };

  /* ---------- XML for the desktop program ---------- */
  const trimNum = (v) => (v == null || Number.isNaN(v) ? '0' : String(Math.round(v * 1e6) / 1e6));
  const dotDate = (ms) => { const d = new Date(ms); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; };
  function inferSamp(vals) {
    if (vals.length < 2) return 1;
    const d = [];
    for (let i = 1; i < Math.min(vals.length, 50); i++) d.push(vals[i].TimeStamp - vals[i - 1].TimeStamp);
    d.sort((a, b) => a - b);
    return Math.max(1, Math.round(d[d.length >> 1] / 1000));
  }

  /* Builds header/data/footer records exactly as the desktop importer wants them:
     DATE as dd.MM.yyyy, TIME as HH:mm:ss, integers where it calls Int32.Parse. */
  PQ.xmlForOriginal = function (list) {
    const esc = PQ.xmlEsc;
    const out = [];
    for (const m of list) {
      const site = db().baustelle(m.JobSiteID), mode = db().regMode(m.ModeID);
      const vals = db().values(m.ID).slice().sort((a, b) => a.TimeStamp - b.TimeStamp);
      const samp = m.Samp || inferSamp(vals);
      const two = vals.some((v) => v.PressureSecondary || v.FlowA || v.FlowB || v.QuantityA || v.QuantityB);
      const at = (pairs) => pairs.map(([k, v]) => `${k}="${esc(v)}"`).join(' ');
      out.push(`<header ${at([['CH', m.CH], ['SAMP', samp], ['DATE', dotDate(m.TimeStart)], ['TIME', PQ.fmtTime(m.TimeStart)], ['JOBSITE', site ? site.Jobsite : ''],
        ['GRP1', m.Group1 || ''], ['GRP2', m.Group2 || ''], ['GRP3', m.Group3 || ''], ['USER', m.Operator || ''], ['MIX', m.Mix || ''], ['HOLE', m.Hole || ''],
        ['STAGE', m.Stage || ''], ['LENGTH', trimNum(m.Length)], ['MODE', mode ? mode.ModeCode : 0]])} />`);
      for (const v of vals) {
        const p = [['CH', m.CH]];
        if (two) p.push(['PP', trimNum(v.PressureSecondary)], ['AQ', trimNum(v.FlowA)], ['BQ', trimNum(v.FlowB)], ['AV', trimNum(v.QuantityA)], ['BV', trimNum(v.QuantityB)]);
        p.push(['P', trimNum(v.Pressure)], ['Q', trimNum(v.FlowTotal)], ['V', trimNum(v.QuantityTotal)]);
        out.push(`<data ${at(p)} />`);
      }
      if (m.TimeEnd != null || m.Duration != null) {
        const end = m.TimeEnd != null ? m.TimeEnd : m.TimeStart + (m.Duration || 0) * 1000;
        const f = [['CH', m.CH], ['DATE', dotDate(end)], ['TIME', PQ.fmtTime(end)], ['DURA', Math.round(m.Duration || 0)], ['PEND', trimNum(m.PressureEnd)], ['VEND', trimNum(m.Quantity != null ? m.Quantity : m.QuantityTotal)]];
        if (two || m.QuantityA || m.QuantityB) f.push(['AVEND', trimNum(m.QuantityA)], ['BVEND', trimNum(m.QuantityB)]);
        if (m.Perm != null) f.push(['PERM', trimNum(m.Perm)]);
        if (m.Luge != null) f.push(['LUGE', trimNum(m.Luge)]);
        f.push(['REASON', m.Reason || ''], ['COMMENT', m.Comment || '']);
        out.push(`<footer ${at(f)} />`);
      }
    }
    return out.join('\r\n') + '\r\n';
  };

  /* ---------- QA ---------- */
  PQ.qaCheck = function (m) {
    const w = [];
    const vals = db().values(m.ID).slice().sort((a, b) => a.TimeStamp - b.TimeStamp);
    const add = (level, code, count, detail) => w.push({ level, code, count: count || 1, detail });
    if (!vals.length) add('warn', 'noReadings');
    if (m.TimeEnd == null) add('warn', 'unfinished');
    if (m.QuantityTotal === 0) add('info', 'zeroTake');
    let drops = 0, neg = 0, prev = null;
    for (const v of vals) {
      if (prev != null && v.QuantityTotal < prev - 1e-9) drops++;
      prev = v.QuantityTotal;
      if (v.Pressure < -1) neg++;
    }
    if (drops) add('warn', 'volumeDrops', drops);
    if (neg) add('warn', 'negativePressure', neg);
    const samp = m.Samp || inferSamp(vals);
    if (m.Duration != null && vals.length && Math.abs(m.Duration - vals.length * samp) > 2 * samp) add('info', 'durationMismatch', 1, `${m.Duration} s / ${vals.length}×${samp} s`);
    if (vals.length && m.QuantityTotal != null && Math.abs(vals[vals.length - 1].QuantityTotal - m.QuantityTotal) > 1) add('warn', 'endVolumeMismatch', 1, `${PQ.fmtNum(vals[vals.length - 1].QuantityTotal)} / ${PQ.fmtNum(m.QuantityTotal)} l`);
    if (m.Perm != null && m.Luge != null && m.PermSrc === 'device') {
      const p = vals.map((v) => v.Pressure), avg = p.length ? p.reduce((s, x) => s + x, 0) / p.length : 0;
      const mine = avg > 0 ? (m.Perm * 10) / avg : 0;
      if (mine && Math.abs(mine - m.Luge) / mine > 0.05) add('info', 'lugeonDeviates', 1, `${PQ.fmtNum(m.Luge, 3)} / ${PQ.fmtNum(mine, 3)}`);
    }
    return w;
  };

  /* ---------- hole / stage roll-up ---------- */
  PQ.summaryRows = function (list) {
    const groups = new Map();
    for (const m of list) {
      const site = db().baustelle(m.JobSiteID);
      const key = [site ? site.Jobsite : '', m.Hole, m.Stage].join('\u0001');
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { ID: groups.size + 1, site: site ? site.Jobsite : '', hole: m.Hole, stage: m.Stage, runs: 0, length: 0, duration: 0, quantity: 0, pmax: 0, last: 0, lastLuge: null, runsList: [] }));
      g.runs++; g.runsList.push(m);
      g.length = Math.max(g.length, m.Length || 0);
      g.duration += m.Duration || 0;
      g.quantity += m.QuantityTotal || 0;
      const st = PQ.stats(m); g.pmax = Math.max(g.pmax, st.pressureMax);
      if (m.TimeStart >= g.last) { g.last = m.TimeStart; g.lastLuge = m.Luge; }
    }
    for (const g of groups.values()) {
      g.perm = g.length > 0 && g.duration > 0 ? g.quantity / (g.duration / 60) / g.length : 0;
      g.specific = g.length > 0 ? g.quantity / g.length : 0;
    }
    return [...groups.values()];
  };

  PQ.csvSummary = function (rows) {
    if (!rows.length) return '!!No Data Available or Selected!!\r\n';
    const out = ['Job Site;Hole;Stage;Runs;Length[m];Duration[s];Quantity[l];Specific take[l/m];Max Pressure[bar];Permeability[l/min/m];Last Lugeon;Last start'];
    rows.forEach((g) => out.push([g.site, g.hole, g.stage, g.runs, g.length, g.duration, PQ.fmtNum(g.quantity, 2), PQ.fmtNum(g.specific, 2), PQ.fmtNum(g.pmax, 2), PQ.fmtNum(g.perm, 3), g.lastLuge == null ? '' : PQ.fmtNum(g.lastLuge, 3), PQ.fmtCsvDate(g.last)].join(';')));
    return out.join('\r\n');
  };

  /* ---------- statistics for report ---------- */
  PQ.stats = function (m) {
    const vals = db().values(m.ID);
    const col = (k) => vals.map((v) => v[k]).filter((x) => x != null);
    const max = (a) => (a.length ? Math.max(...a) : 0);
    const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
    const p = col('Pressure'), f = col('FlowTotal');
    return { pressureMax: max(p), pressureAvg: avg(p), flowMax: max(f), flowAvg: avg(f), ginMax: max(col('GIN')), lugeonMax: max(col('LUGEON')) };
  };

  /* ---------- CSV export (semicolon separated, as in the original) ---------- */
  const GENERAL_HEADER = 'Job Site;Start Time;End Time;CH;Mix;Hole;Stage;Length[m];Mode;Duration[s];End Pressure[bar];Quantity Suspension[l];Quantity Additive A[l]; Quantity Additive B[l]; Total Quantity[l]; Permeability[l/min/m]; Lugeon';
  const SERIES_HEADER = 'Time Stamp;Pressure[bar]; 2nd Pressure[bar]; Flow[l/min];Flow Additive A[l/min];Flow Additive B[l/min];Flow Additive A+B[l/min];Flow Total[l/min];Quantity Suspension[l]; Quantity Additive A[l]; Quantity Additive B[l]; Quantity Additive A+B[l]; Quantity Total [l]; GIN; Lugeon';
  const TEMPLATE_HEADER = 'ID;Group1;Group2;Group3;Hole;Stage;Length;Mix;rMode;pMode;pMax;pOperating;pCrack;pCrackMax;tCrack;vMax;qMax;qMin;GIN;InjRatio;PLCStatus';
  const NO_DATA = '!!No Data Available or Selected!!';

  const cell = (v) => (v == null ? '' : String(v));

  function generalData(m) {
    const site = db().baustelle(m.JobSiteID);
    const mode = db().regMode(m.ModeID);
    return [site ? site.Jobsite : '', PQ.fmtCsvDate(m.TimeStart), PQ.fmtCsvDate(m.TimeEnd), m.CH, m.Mix, m.Hole, m.Stage, m.Length,
      mode ? mode.Name : '', m.Duration, m.PressureEnd, m.Quantity, m.QuantityA, m.QuantityB, m.QuantityTotal, m.Perm == null ? '' : PQ.fmtNum(m.Perm, 4), m.Luge == null ? '' : PQ.fmtNum(m.Luge, 4)].map(cell).join(';');
  }

  PQ.csvSeries = function (list) {
    if (!list.length) return NO_DATA + '\r\n';
    const out = [];
    for (const m of list) {
      out.push(GENERAL_HEADER, generalData(m), SERIES_HEADER);
      const vals = db().values(m.ID).slice().sort((a, b) => a.TimeStamp - b.TimeStamp);
      for (const v of vals) {
        out.push([PQ.fmtCsvDate(v.TimeStamp), v.Pressure, v.PressureSecondary, v.Flow, v.FlowA, v.FlowB, v.FlowAB, v.FlowTotal,
          v.Quantity, v.QuantityA, v.QuantityB, v.QuantityAB, v.QuantityTotal, v.GIN, v.LUGEON].map(cell).join(';'));
      }
      out.push('');
    }
    return out.join('\r\n');
  };

  PQ.csvOverview = function (list) {
    if (!list.length) return NO_DATA + '\r\n';
    const site = db().baustelle(list[0].JobSiteID);
    const out = ['Job Site; Hole;', `${site ? site.Jobsite : ''};${list[0].Hole};`, GENERAL_HEADER];
    let dur = 0, qty = 0;
    for (const m of list) {
      out.push(generalData(m));
      dur += m.Duration || 0;
      qty += m.QuantityTotal || 0;
    }
    out.push(';;;;;;;;;Total Duration [s]:;' + dur, ';;;;Total Quantity [l]:;' + qty);
    return out.join('\r\n');
  };

  PQ.csvTemplates = function (list) {
    if (!list.length) return NO_DATA + '\r\n';
    const out = [TEMPLATE_HEADER];
    for (const t of list) {
      const rm = db().regMode(t.RegModeID), pm = db().pumpMode(t.PumpModeID);
      out.push([t.ID, t.Group1, t.Group2, t.Group3, t.Hole, t.Stage, t.Length, t.Mix, rm ? rm.ModeCode : '', pm ? pm.ModeCode : '',
        t.pMax, t.pWork, t.pCrack, t.pCrackMax, t.tCrack, t.vMax, t.qMax, t.qMin, t.GIN, t.InjRatio, 0].map(cell).join(';'));
    }
    return out.join('\r\n');
  };

  PQ.download = function (filename, text, mime = 'text/csv;charset=utf-8', bom = true) {
    PQ.downloadBlob(filename, new Blob(bom ? ['\uFEFF', text] : [text], { type: mime }));
  };

  PQ.downloadBlob = function (filename, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  PQ.stamp = function () {
    const d = new Date();
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  };
})();
