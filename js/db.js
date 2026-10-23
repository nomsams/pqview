/* Data layer: mirrors the original SQLite schema (Baustelle, Messungen, Messwerte,
   Vorlagen, RegModes, PumpModes, Einstellungen). Everything is held in memory and
   written through to IndexedDB so data survives a reload. */
(function () {
  'use strict';
  const PQ = (window.PQ = window.PQ || {});

  PQ.REG_MODES = [
    { ID: 1, Name: 'Injection', ModeCode: 0 },
    { ID: 2, Name: 'Lugeon', ModeCode: 1 },
    { ID: 3, Name: '2K Injection', ModeCode: 2 },
  ];
  PQ.PUMP_MODES = [
    { ID: 1, Name: 'Automatic', ModeCode: 10 },
    { ID: 2, Name: 'GIN Control', ModeCode: 20 },
    { ID: 3, Name: 'GIN Threshold', ModeCode: 21 },
  ];

  const STORES = ['baustelle', 'messungen', 'messwerte', 'vorlagen'];
  const DEFAULT_SETTINGS = {
    RepLogoCustVisible: '0',
    CustGroup1Name: 'Group 1',
    CustGroup2Name: 'Group 2',
    CustGroup3Name: 'Group 3',
    Is2KInjectionEnabled: '0',
    '2ndPressureEnabled': '0',
    Language: 'en',
    DateFormat: 'dot',
    ExportDates: 'iso',
  };

  const data = { baustelle: [], messungen: [], messwerte: [], vorlagen: [] };
  const seq = { baustelle: 0, messungen: 0, messwerte: 0, vorlagen: 0 };
  const settings = Object.assign({}, DEFAULT_SETTINGS);
  const byMessung = new Map();
  let logo = null;
  const sources = new Map(); // raw text of imported XML files (kept so they can be repaired later)
  let idb = null;
  let queue = [];
  let flushTimer = null;

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('IndexedDB not available'));
      const req = indexedDB.open('pq-registration', 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        STORES.forEach((s) => d.createObjectStore(s, { keyPath: 'ID' }));
        d.createObjectStore('kv', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function getAll(store) {
    return new Promise((resolve, reject) => {
      const r = idb.transaction(store, 'readonly').objectStore(store).getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  function enqueue(op) {
    if (!idb) return;
    queue.push(op);
    if (!flushTimer) flushTimer = setTimeout(flush, 30);
  }

  function flush() {
    flushTimer = null;
    const ops = queue;
    queue = [];
    if (!idb || !ops.length) return;
    const names = [...new Set(ops.map((o) => o.s))];
    try {
      const tx = idb.transaction(names, 'readwrite');
      for (const op of ops) {
        const os = tx.objectStore(op.s);
        if (op.t === 'put') os.put(op.v);
        else if (op.t === 'del') os.delete(op.v);
        else if (op.t === 'clear') os.clear();
      }
    } catch (e) {
      console.warn('IndexedDB write failed', e);
    }
  }

  function saveSeq() {
    enqueue({ s: 'kv', t: 'put', v: { key: 'seq', value: Object.assign({}, seq) } });
  }

  function index(v) {
    let arr = byMessung.get(v.Messung);
    if (!arr) byMessung.set(v.Messung, (arr = []));
    arr.push(v);
  }

  PQ.db = {
    data,
    settings,
    persistent: false,

    async init() {
      try {
        idb = await openDb();
        this.persistent = true;
        for (const s of STORES) data[s] = await getAll(s);
        const kv = await getAll('kv');
        for (const row of kv) {
          if (row.key === 'seq') Object.assign(seq, row.value);
          if (row.key === 'settings') Object.assign(settings, row.value);
          if (row.key === 'logo') logo = row.value;
          if (row.key.startsWith('src:')) sources.set(row.value.name, row.value);
        }
      } catch (e) {
        console.warn('Running without persistence:', e);
        idb = null;
        this.persistent = false;
      }
      for (const s of STORES) {
        const maxId = data[s].reduce((m, r) => Math.max(m, r.ID), 0);
        seq[s] = Math.max(seq[s] || 0, maxId);
      }
      byMessung.clear();
      data.messwerte.forEach(index);
    },

    add(store, obj) {
      obj.ID = ++seq[store];
      data[store].push(obj);
      if (store === 'messwerte') index(obj);
      enqueue({ s: store, t: 'put', v: obj });
      saveSeq();
      return obj;
    },

    update(store, obj) {
      enqueue({ s: store, t: 'put', v: obj });
    },

    updateMany(store, objs) {
      for (const o of objs) enqueue({ s: store, t: 'put', v: o });
    },

    /* ON DELETE CASCADE: removing a measurement removes its readings. */
    removeMessungen(ids) {
      const set = new Set(ids);
      for (const id of set) {
        for (const v of byMessung.get(id) || []) enqueue({ s: 'messwerte', t: 'del', v: v.ID });
        byMessung.delete(id);
        enqueue({ s: 'messungen', t: 'del', v: id });
      }
      data.messwerte = data.messwerte.filter((v) => !set.has(v.Messung));
      data.messungen = data.messungen.filter((m) => !set.has(m.ID));
    },

    removeVorlagen(ids) {
      const set = new Set(ids);
      ids.forEach((id) => enqueue({ s: 'vorlagen', t: 'del', v: id }));
      data.vorlagen = data.vorlagen.filter((r) => !set.has(r.ID));
    },

    /* "Clear Database": DELETE FROM Messwerte / Messungen / Baustelle (templates stay). */
    clearMeasurements() {
      for (const s of ['messwerte', 'messungen', 'baustelle']) {
        data[s] = [];
        enqueue({ s, t: 'clear' });
      }
      byMessung.clear();
      [...sources.keys()].forEach((n) => this.removeSource(n));
    },

    values(messungId) {
      return byMessung.get(messungId) || [];
    },

    saveSettings() {
      enqueue({ s: 'kv', t: 'put', v: { key: 'settings', value: Object.assign({}, settings) } });
    },
    setSetting(name, value) {
      settings[name] = String(value);
      this.saveSettings();
    },
    flag(name) {
      return settings[name] === '1';
    },

    /* Imported XML files: newest first, at most 10 are kept. */
    saveSource(name, text) {
      sources.set(name, { name, text, time: Date.now() });
      enqueue({ s: 'kv', t: 'put', v: { key: 'src:' + name, value: sources.get(name) } });
      const old = [...sources.values()].sort((a, b) => b.time - a.time).slice(10);
      old.forEach((o) => this.removeSource(o.name));
    },
    listSources() {
      return [...sources.values()].sort((a, b) => b.time - a.time);
    },
    removeSource(name) {
      sources.delete(name);
      enqueue({ s: 'kv', t: 'del', v: 'src:' + name });
    },

    getLogo() {
      return logo;
    },
    setLogo(dataUrl) {
      logo = dataUrl;
      enqueue({ s: 'kv', t: 'put', v: { key: 'logo', value: dataUrl } });
    },

    /* Full backup / restore (JSON). */
    exportAll() {
      return { app: 'pq-registration-web', version: 1, exported: new Date().toISOString(), settings: Object.assign({}, settings), logo, data: { baustelle: data.baustelle, messungen: data.messungen, messwerte: data.messwerte, vorlagen: data.vorlagen } };
    },
    importAll(obj) {
      if (!obj || obj.app !== 'pq-registration-web' || !obj.data) throw new Error('Not a PQ Registration backup file');
      for (const s of STORES) {
        data[s] = Array.isArray(obj.data[s]) ? obj.data[s] : [];
        enqueue({ s, t: 'clear' });
        data[s].forEach((r) => enqueue({ s, t: 'put', v: r }));
        seq[s] = data[s].reduce((m, r) => Math.max(m, r.ID), 0);
      }
      byMessung.clear();
      data.messwerte.forEach(index);
      Object.assign(settings, DEFAULT_SETTINGS, obj.settings || {});
      this.saveSettings();
      if (obj.logo) this.setLogo(obj.logo);
      saveSeq();
    },

    regMode(id) {
      return PQ.REG_MODES.find((m) => m.ID === id) || null;
    },
    pumpMode(id) {
      return PQ.PUMP_MODES.find((m) => m.ID === id) || null;
    },
    baustelle(id) {
      return data.baustelle.find((b) => b.ID === id) || null;
    },
  };
})();
