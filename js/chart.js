/* Multi-axis time-series canvas chart (replacement for the Telerik RadCartesianChart):
   one vertical axis per series, drag-to-zoom, wheel zoom, shift+drag pan,
   double-click reset and a trackball tooltip. */
(function () {
  'use strict';
  const PQ = (window.PQ = window.PQ || {});

  PQ.SERIES = [
    { key: 'Pressure', label: 'Pressure', unit: 'bar', color: '#d32f2f', tip: 'Pressure: {v}bar' },
    { key: 'PressureSecondary', label: '2nd Pressure', unit: 'bar', color: '#ef6c00', tip: '2nd Pressure: {v}bar' },
    { key: 'FlowTotal', label: 'Flow Total', unit: 'l/min', color: '#1976d2', tip: 'Flow Total: {v} l/min' },
    { key: 'Flow', label: 'Flow', unit: 'l/min', color: '#0097a7', tip: 'Flow: {v} l/min' },
    { key: 'FlowA', label: 'Flow Additive A', unit: 'l/min', color: '#7b1fa2', tip: 'Flow Additive A: {v} l/min' },
    { key: 'FlowB', label: 'Flow Additive B', unit: 'l/min', color: '#c2185b', tip: 'Flow Additive B: {v} l/min' },
    { key: 'FlowAB', label: 'Flow Add. A+B', unit: 'l/min', color: '#512da8', tip: 'Flow Add. A+B: {v} l/min' },
    { key: 'QuantityTotal', label: 'Quantity Total', unit: 'l', color: '#2e7d32', tip: 'Quantity Total: {v} l' },
    { key: 'Quantity', label: 'Quantity', unit: 'l', color: '#689f38', tip: 'Quantity: {v} l' },
    { key: 'QuantityA', label: 'Quantity A', unit: 'l', color: '#00796b', tip: 'Quantity A: {v} l' },
    { key: 'QuantityB', label: 'Quantity B', unit: 'l', color: '#5d4037', tip: 'Quantity B: {v} l' },
    { key: 'QuantityAB', label: 'Quantity A+B', unit: 'l', color: '#455a64', tip: 'Quantity A+B: {v} l' },
    { key: 'GIN', label: 'GIN', unit: '', color: '#f9a825', tip: 'GIN: {v}' },
    { key: 'LUGEON', label: 'Lugeon', unit: '', color: '#6d4c41', tip: 'Lugeon: {v}' },
  ];

  const AXIS_W = 52;
  const NICE = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 21600, 43200, 86400];
  const pad = (n) => String(n).padStart(2, '0');

  function niceNum(range, ticks) {
    const rough = range / ticks;
    const pow = Math.pow(10, Math.floor(Math.log10(rough || 1)));
    const f = rough / pow;
    const nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
    return nf * pow;
  }
  function fmtY(v, step) {
    const dec = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)));
    return v.toFixed(dec);
  }

  class Chart {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.interactive = opts.interactive !== false;
      this.pixelRatio = opts.pixelRatio || 0;
      this.series = [];
      this.xMode = 'time';
      this.view = null;
      this.drag = null;
      this.hover = null;
      this.t0 = 0;
      if (this.interactive) this.bind();
      if (window.ResizeObserver) {
        this.ro = new ResizeObserver(() => this.draw());
        this.ro.observe(canvas.parentElement || canvas);
      }
    }

    /* series: [{key,label,unit,color,tip, pts:[[x,y],...]}] ; x in ms (time) or seconds (relative) */
    setData(series, xMode, t0) {
      this.series = series.filter((s) => s.pts.length);
      this.xMode = xMode;
      this.t0 = t0 || 0;
      // series sharing an `axis` id (e.g. overlaid runs of one channel) share one vertical axis
      const groups = new Map();
      this.series.forEach((s, i) => {
        const id = s.axis || 's' + i;
        let g = groups.get(id);
        if (!g) groups.set(id, (g = { id, lo: Infinity, hi: -Infinity, first: s, many: false }));
        else g.many = true;
        for (const p of s.pts) { if (p[1] < g.lo) g.lo = p[1]; if (p[1] > g.hi) g.hi = p[1]; }
        s._g = g;
      });
      this.axes = [...groups.values()];
      this.axes.forEach((g) => { g.min = Math.min(0, g.lo); g.max = g.hi > g.min ? g.hi * 1.1 : g.min + 1; });
      this.series.forEach((s) => { s.min = s._g.min; s.max = s._g.max; });
      let a = Infinity, b = -Infinity;
      this.series.forEach((s) => { a = Math.min(a, s.pts[0][0]); b = Math.max(b, s.pts[s.pts.length - 1][0]); });
      this.full = isFinite(a) ? { x0: a, x1: b > a ? b : a + 1 } : { x0: 0, x1: 1 };
      this.resetZoom(false);
      this.draw();
    }

    resetZoom(redraw = true) {
      this.view = { x0: this.full.x0, x1: this.full.x1, f0: 0, f1: 1 };
      if (redraw) this.draw();
    }

    layout() {
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      const left = Math.max(1, (this.axes || []).length) * AXIS_W + 6;
      return { w, h, px: left, py: 10, pw: Math.max(10, w - left - 16), ph: Math.max(10, h - 10 - 28) };
    }

    css(name, fallback) {
      return getComputedStyle(this.canvas).getPropertyValue(name).trim() || fallback;
    }

    xToPx(x, L) { return L.px + ((x - this.view.x0) / (this.view.x1 - this.view.x0)) * L.pw; }
    pxToX(px, L) { return this.view.x0 + ((px - L.px) / L.pw) * (this.view.x1 - this.view.x0); }
    yToPx(s, v, L) {
      const frac = (v - s.min) / (s.max - s.min);
      const sf = (frac - this.view.f0) / (this.view.f1 - this.view.f0);
      return L.py + L.ph - sf * L.ph;
    }

    xLabel(x, step) {
      if (this.xMode === 'relative') {
        const s = Math.round(x);
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
        return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
      }
      const d = new Date(x);
      return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    draw() {
      const c = this.canvas;
      const dpr = this.pixelRatio || window.devicePixelRatio || 1;
      const w = c.clientWidth, h = c.clientHeight;
      if (!w || !h) return;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      const ctx = this.ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const text = this.css('--text', '#222'), grid = this.css('--grid', '#e3e7ee'), muted = this.css('--muted', '#667');
      ctx.font = '11px system-ui, sans-serif';

      if (!this.series.length) {
        ctx.fillStyle = muted;
        ctx.textAlign = 'center';
        ctx.fillText(this.emptyText || 'No data', w / 2, h / 2);
        return;
      }
      const L = this.layout();
      const v = this.view;

      // horizontal grid (5 divisions)
      ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 0; i <= 5; i++) {
        const y = Math.round(L.py + (L.ph * i) / 5) + 0.5;
        ctx.moveTo(L.px, y); ctx.lineTo(L.px + L.pw, y);
      }
      ctx.stroke();

      // x ticks
      const spanSec = this.xMode === 'time' ? (v.x1 - v.x0) / 1000 : v.x1 - v.x0;
      const want = Math.max(2, Math.floor(L.pw / 95));
      let step = NICE.find((n) => spanSec / n <= want) || NICE[NICE.length - 1];
      const unit = this.xMode === 'time' ? 1000 : 1;
      const tz = this.xMode === 'time' ? new Date(v.x0).getTimezoneOffset() * 60 : 0;
      // ticks align to local wall-clock multiples of `step` seconds
      const first = this.xMode === 'time' ? Math.ceil((v.x0 / 1000 - tz) / step) * step + tz : Math.ceil(v.x0 / step) * step;
      ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.beginPath();
      for (let t = first; t <= v.x1 / unit + 1e-9; t += step) {
        const x = this.xToPx(t * unit, L);
        if (x < L.px - 1 || x > L.px + L.pw + 1) continue;
        ctx.strokeStyle = grid;
        ctx.moveTo(Math.round(x) + 0.5, L.py); ctx.lineTo(Math.round(x) + 0.5, L.py + L.ph + 4);
        ctx.fillText(this.xLabel(t * unit, step), x, L.py + L.ph + 17);
      }
      ctx.stroke();

      // axes (one per series, stacked leftwards)
      this.axes.forEach((g, i) => {
        const s = Object.assign({}, g.first, { min: g.min, max: g.max });
        const col = g.many ? muted : s.color;
        const ax = L.px - i * AXIS_W;
        ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(ax - 0.5, L.py); ctx.lineTo(ax - 0.5, L.py + L.ph); ctx.stroke();
        const lo = s.min + v.f0 * (s.max - s.min), hi = s.min + v.f1 * (s.max - s.min);
        const st = niceNum(hi - lo, 5);
        ctx.textAlign = 'right';
        for (let val = Math.ceil(lo / st) * st; val <= hi + 1e-9; val += st) {
          const y = this.yToPx(s, val, L);
          ctx.beginPath(); ctx.moveTo(ax - 4, Math.round(y) + 0.5); ctx.lineTo(ax, Math.round(y) + 0.5); ctx.stroke();
          ctx.fillText(fmtY(val, st), ax - 6, y + 3.5);
        }
        ctx.save();
        ctx.translate(ax - AXIS_W + 11, L.py + L.ph / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        const title = g.many ? (s.axisTitle || s.label) : s.label;
        ctx.fillText(s.unit ? `${title} [${s.unit}]` : title, 0, 0);
        ctx.restore();
      });

      // series
      ctx.save();
      ctx.beginPath(); ctx.rect(L.px, L.py, L.pw, L.ph); ctx.clip();
      this.series.forEach((s) => {
        ctx.strokeStyle = s.color; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
        ctx.beginPath();
        let started = false, lastCol = null, colMin = 0, colMax = 0;
        const pts = s.pts;
        // binary-search the first visible point
        let lo = 0, hi = pts.length - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (pts[mid][0] < v.x0) lo = mid + 1; else hi = mid; }
        for (let i = Math.max(0, lo - 1); i < pts.length; i++) {
          const px = this.xToPx(pts[i][0], L), py = this.yToPx(s, pts[i][1], L);
          const col = Math.round(px);
          if (lastCol === col) { // decimate: keep min/max per pixel column
            if (py < colMin) colMin = py;
            if (py > colMax) colMax = py;
            continue;
          }
          if (lastCol !== null && colMax !== colMin) { ctx.lineTo(lastCol, colMin); ctx.lineTo(lastCol, colMax); }
          lastCol = col; colMin = colMax = py;
          if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
          if (px > L.px + L.pw + 2) break;
        }
        ctx.stroke();
      });
      ctx.restore();

      // plot frame
      ctx.strokeStyle = grid; ctx.strokeRect(L.px + 0.5, L.py + 0.5, L.pw, L.ph);

      // zoom rectangle
      if (this.drag && this.drag.mode === 'zoom') {
        const d = this.drag;
        ctx.fillStyle = 'rgba(25,118,210,.15)'; ctx.strokeStyle = 'rgba(25,118,210,.8)';
        const rx = Math.min(d.x0, d.x1), ry = Math.min(d.y0, d.y1);
        ctx.fillRect(rx, ry, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
        ctx.strokeRect(rx + 0.5, ry + 0.5, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
      }

      // trackball
      if (this.hover && !this.drag) this.drawTrackball(ctx, L, text);
    }

    nearest(pts, x) {
      let lo = 0, hi = pts.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (pts[mid][0] < x) lo = mid + 1; else hi = mid; }
      if (lo > 0 && Math.abs(pts[lo - 1][0] - x) < Math.abs(pts[lo][0] - x)) lo--;
      return pts[lo];
    }

    drawTrackball(ctx, L, text) {
      const x = this.pxToX(this.hover.x, L);
      const ref = this.nearest(this.series[0].pts, x);
      const tx = this.xToPx(ref[0], L);
      if (tx < L.px || tx > L.px + L.pw) return;
      ctx.strokeStyle = this.css('--muted', '#667'); ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(Math.round(tx) + 0.5, L.py); ctx.lineTo(Math.round(tx) + 0.5, L.py + L.ph); ctx.stroke();
      ctx.setLineDash([]);
      const rows = [];
      for (const s of this.series) {
        const p = this.nearest(s.pts, ref[0]);
        ctx.fillStyle = s.color;
        ctx.beginPath(); ctx.arc(this.xToPx(p[0], L), this.yToPx(s, p[1], L), 3.5, 0, Math.PI * 2); ctx.fill();
        rows.push({ color: s.color, text: (s.tip || '{v}').replace('{v}', +p[1].toFixed(3)) });
      }
      const head = this.xLabel(ref[0]);
      const lh = 15, bw = Math.max(ctx.measureText(head).width, ...rows.map((r) => ctx.measureText(r.text).width + 14)) + 16;
      const bh = (rows.length + 1) * lh + 10;
      let bx = tx + 12; if (bx + bw > L.w - 4) bx = tx - 12 - bw;
      const by = Math.max(L.py, Math.min(L.py + L.ph - bh, this.hover.y - bh / 2));
      ctx.fillStyle = this.css('--panel', '#fff'); ctx.strokeStyle = this.css('--border', '#bbb');
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, 5) : ctx.rect(bx, by, bw, bh);
      ctx.fill(); ctx.stroke();
      ctx.textAlign = 'left'; ctx.fillStyle = text; ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillText(head, bx + 8, by + 16);
      ctx.font = '11px system-ui, sans-serif';
      rows.forEach((r, i) => {
        ctx.fillStyle = r.color; ctx.fillRect(bx + 8, by + 24 + i * lh, 8, 8);
        ctx.fillStyle = text; ctx.fillText(r.text, bx + 22, by + 32 + i * lh);
      });
    }

    bind() {
      const c = this.canvas;
      const pos = (e) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      c.addEventListener('pointerdown', (e) => {
        if (!this.series.length || e.button !== 0) return;
        const p = pos(e); c.setPointerCapture(e.pointerId);
        this.drag = { mode: e.shiftKey ? 'pan' : 'zoom', x0: p.x, y0: p.y, x1: p.x, y1: p.y, view: { ...this.view } };
        this.hover = null;
      });
      c.addEventListener('pointermove', (e) => {
        if (!this.series.length) return;
        const p = pos(e), L = this.layout();
        if (this.drag) {
          this.drag.x1 = p.x; this.drag.y1 = p.y;
          if (this.drag.mode === 'pan') {
            const dv = this.drag.view, dx = ((p.x - this.drag.x0) / L.pw) * (dv.x1 - dv.x0);
            const df = ((p.y - this.drag.y0) / L.ph) * (dv.f1 - dv.f0);
            this.view = { x0: dv.x0 - dx, x1: dv.x1 - dx, f0: dv.f0 + df, f1: dv.f1 + df };
          }
        } else {
          this.hover = p.x >= L.px && p.x <= L.px + L.pw && p.y >= L.py && p.y <= L.py + L.ph ? p : null;
        }
        this.draw();
      });
      const end = (e) => {
        if (!this.drag) return;
        const d = this.drag; this.drag = null;
        if (d.mode === 'zoom' && Math.abs(d.x1 - d.x0) > 6) {
          const L = this.layout();
          const xa = this.pxToX(Math.min(d.x0, d.x1), L), xb = this.pxToX(Math.max(d.x0, d.x1), L);
          let fa = this.view.f0, fb = this.view.f1;
          if (Math.abs(d.y1 - d.y0) > 6) {
            const sf = (py) => this.view.f0 + (1 - (py - L.py) / L.ph) * (this.view.f1 - this.view.f0);
            fa = Math.min(sf(d.y0), sf(d.y1)); fb = Math.max(sf(d.y0), sf(d.y1));
          }
          this.view = { x0: xa, x1: xb, f0: Math.max(0, fa), f1: Math.min(1, fb) };
        }
        this.draw();
      };
      c.addEventListener('pointerup', end);
      c.addEventListener('pointercancel', end);
      c.addEventListener('pointerleave', () => { if (!this.drag) { this.hover = null; this.draw(); } });
      c.addEventListener('dblclick', () => this.resetZoom());
      c.addEventListener('wheel', (e) => {
        if (!this.series.length) return;
        e.preventDefault();
        const L = this.layout(), p = pos(e), x = this.pxToX(p.x, L);
        const k = e.deltaY < 0 ? 0.8 : 1.25, v = this.view;
        let x0 = x - (x - v.x0) * k, x1 = x + (v.x1 - x) * k;
        x0 = Math.max(this.full.x0, x0); x1 = Math.min(this.full.x1, x1);
        if (x1 - x0 < (this.full.x1 - this.full.x0) / 1e4) return;
        this.view = { ...v, x0, x1 }; this.draw();
      }, { passive: false });
    }
  }

  PQ.Chart = Chart;
})();
