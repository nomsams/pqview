/* Generates demo data in the XML import format (header / data / footer records).
   Works in the browser ("Load demo data") and in Node (to write sample/sample-import.xml). */
(function (root) {
  'use strict';
  const PQ = (root.PQ = root.PQ || {});

  function mulberry(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const p2 = (n) => String(n).padStart(2, '0');
  const d = (dt) => `${p2(dt.getDate())}.${p2(dt.getMonth() + 1)}.${dt.getFullYear()}`;
  const tm = (dt) => `${p2(dt.getHours())}:${p2(dt.getMinutes())}:${p2(dt.getSeconds())}`;

  /* Each run: a pressure ramp towards the target, flow falling as the hole fills. */
  PQ.sampleXML = function () {
    const rnd = mulberry(7);
    const base = new Date();
    base.setHours(8, 0, 0, 0);
    const runs = [
      { ch: 1, mode: 0, hole: 'B-101', stage: '1', len: 5, mix: 'Cement 1:1', pEnd: 18, secs: 240, q0: 14, user: 'M. Keller', reason: 'Max pressure', comment: '' },
      { ch: 1, mode: 0, hole: 'B-101', stage: '2', len: 5, mix: 'Cement 1:1', pEnd: 22, secs: 300, q0: 9, user: 'M. Keller', reason: 'Flow minimum', comment: 'Slight leakage at collar' },
      { ch: 2, mode: 1, hole: 'B-102', stage: '1', len: 4, mix: 'Water', pEnd: 10, secs: 180, q0: 22, user: 'S. Meier', reason: 'Time elapsed', comment: 'Lugeon test' },
    ];
    let out = '';
    let cursor = base.getTime();
    runs.forEach((r, i) => {
      const start = new Date(cursor);
      const end = new Date(cursor + r.secs * 1000);
      out += `<header CH="${r.ch}" SAMP="1" DATE="${d(start)}" TIME="${tm(start)}" JOBSITE="Demo Dam Grouting" GRP1="Section ${i < 2 ? 'A' : 'B'}" GRP2="Row 3" GRP3="" USER="${r.user}" MIX="${r.mix}" HOLE="${r.hole}" STAGE="${r.stage}" LENGTH="${r.len}" MODE="${r.mode}"/>\n`;
      let qty = 0, pLast = 0;
      for (let s = 0; s < r.secs; s++) {
        const x = s / r.secs;
        const p = Math.min(r.pEnd, r.pEnd * (1 - Math.exp(-5 * x))) + (rnd() - 0.5) * 0.3;
        const q = Math.max(0.4, r.q0 * Math.exp(-2.6 * x) + (rnd() - 0.5) * 0.6);
        qty += q / 60;
        pLast = Math.max(0, p);
        // second run uses European decimal commas to exercise the parser
        const f = (n) => (i === 1 ? n.toFixed(2).replace('.', ',') : n.toFixed(2));
        out += `<data CH="${r.ch}" PP="0" AQ="0" BQ="0" AV="0" BV="0" P="${f(pLast)}" Q="${f(q)}" V="${f(qty)}"/>\n`;
      }
      out += `<footer CH="${r.ch}" DATE="${d(end)}" TIME="${tm(end)}" DURA="${r.secs}" PEND="${pLast.toFixed(2)}" VEND="${qty.toFixed(2)}" AVEND="0" BVEND="0" REASON="${r.reason}" COMMENT="${r.comment}"/>\n`;
      cursor += (r.secs + 600) * 1000;
    });
    return out;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = PQ;
})(typeof window !== 'undefined' ? window : globalThis);
