// V40-01: entorno global de tests. Mocks de APIs de navegador; el código de
// producción NO se modifica. Los tests controlan el entorno vía __helpers.
const LS = new Map();
globalThis.localStorage = {
  getItem: (k) => (LS.has(String(k)) ? LS.get(String(k)) : null),
  setItem: (k, v) => { LS.set(String(k), String(v)); },
  removeItem: (k) => { LS.delete(String(k)); },
  clear: () => { LS.clear(); },
};

let onLine = true;
try {
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
} catch { /* noop */ }
Object.defineProperty(globalThis.navigator, 'onLine', { get: () => onLine, configurable: true });

globalThis.Event = class Event { constructor(type) { this.type = type; } };
const dispatched = [];
globalThis.window = { dispatchEvent: (e) => { dispatched.push(e && e.type); return true; }, addEventListener: () => {} };

// Fake mínimo pero funcional de IndexedDB (suficiente para db.js: open,
// upgrade con createObjectStore, transaction, put/get/getAll/delete/count).
const fakeDB = (() => {
  const DBs = new Map();
  const mkReq = () => ({ onsuccess: null, onerror: null, result: undefined, error: null });
  const succeed = (req, val) => { setTimeout(() => { req.result = val; if (req.onsuccess) req.onsuccess({ target: req }); }, 0); };
  const fail = (req, err) => { setTimeout(() => { req.error = err; if (req.onerror) req.onerror({ target: req }); }, 0); };
  function handle(store) {
    return {
      put(value, key) {
        const req = mkReq();
        try {
          const k = store.keyPath != null ? value[store.keyPath] : key;
          if (k === undefined || k === null) throw new Error('no key');
          store.data.set(String(k), value);
          succeed(req, String(k));
        } catch (e) { fail(req, e); }
        return req;
      },
      get(id) { const req = mkReq(); const v = store.data.get(String(id)); succeed(req, v === undefined ? undefined : v); return req; },
      getAll() { const req = mkReq(); succeed(req, Array.from(store.data.values())); return req; },
      delete(id) { const req = mkReq(); store.data.delete(String(id)); succeed(req, undefined); return req; },
      count() { const req = mkReq(); succeed(req, store.data.size); return req; },
      openCursor() {
        const req = mkReq();
        const entries = Array.from(store.data.entries());
        let i = 0;
        const step = () => {
          if (i < entries.length) {
            const [pk, val] = entries[i++];
            req.result = { primaryKey: pk, value: val, continue: () => setTimeout(step, 0) };
          } else { req.result = null; }
          if (req.onsuccess) req.onsuccess({ target: req });
        };
        setTimeout(step, 0);
        return req;
      },
    };
  }
  const indexedDB = {
    open(name, version) {
      const req = mkReq();
      setTimeout(() => {
        let db = DBs.get(name);
        const isNew = !db;
        if (isNew) { db = { version: 0, stores: new Map() }; DBs.set(name, db); }
        const oldVersion = db.version;
        const dbObj = {
          objectStoreNames: { contains: (s) => db.stores.has(s) },
          createObjectStore: (s, opts) => { db.stores.set(s, { keyPath: (opts && opts.keyPath) || null, data: new Map() }); return handle(db.stores.get(s)); },
          deleteObjectStore: (s) => { db.stores.delete(s); },
          transaction: (st) => {
            const tx = { objectStore: (n) => handle(db.stores.get(n)), oncomplete: null, onerror: null, error: null, abort: () => {} };
            setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0);
            return tx;
          },
        };
        req.result = dbObj;
        if (oldVersion < version) {
          db.version = version;
          if (req.onupgradeneeded) req.onupgradeneeded({ oldVersion, target: req });
        }
        if (req.onsuccess) req.onsuccess({ target: req });
      }, 0);
      return req;
    },
  };
  return {
    indexedDB,
    rawStore: (name, store) => { const db = DBs.get(name); return db && db.stores.get(store); },
    clear: () => DBs.clear(),
  };
})();
globalThis.indexedDB = fakeDB.indexedDB;

let _uuid = 0;
const _nativeRandomUUID = globalThis.crypto && globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID.bind(globalThis.crypto) : null;
if (globalThis.crypto && _nativeRandomUUID) {
  globalThis.crypto.randomUUID = () => '00000000-0000-4000-8000-' + String(++_uuid).padStart(12, '0');
}

// Fetch controlado: __routes mapea "METHOD /path" -> handler(body) que devuelve
// {status, json, headers} o {__network:true} para simular error de red.
let routes = {};
const fetchLog = [];
function mkRes(status, json, headers = {}) {
  const text = json === null || json === undefined ? '' : JSON.stringify(json);
  const lower = {};
  for (const k of Object.keys(headers)) lower[k.toLowerCase()] = headers[k];
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (h) => {
        const l = String(h).toLowerCase();
        if (l in lower) return lower[l];
        if (l === 'content-type') return 'application/json';
        return null;
      },
    },
    async text() { return text; },
  };
}
globalThis.fetch = async (url, opts = {}) => {
  const method = (opts.method || 'GET').toUpperCase();
  let path = String(url);
  try { path = new URL(String(url)).pathname; } catch { /* relative URL */ }
  path = path.split('?')[0];
  let body = null;
  try { body = opts.body ? JSON.parse(opts.body) : null; } catch { body = opts.body; }
  fetchLog.push({ method, path, body, headers: opts.headers || {} });
  const clean = path.startsWith('http') ? path : path;
  const h = routes[method + ' ' + clean];
  if (!h) return mkRes(200, {});
  const r = await h(body, clean, opts);
  if (r && r.__network) throw new Error('Failed to fetch');
  return mkRes(r.status == null ? 200 : r.status, r.json === undefined ? null : r.json, r.headers || {});
};

// Helpers de control para los tests (no son parte de producción).
globalThis.__resetAll = (tenant = 'GYM-A', user = 'u1', sid = 's1') => {
  LS.clear();
  fakeDB.clear();
  routes = {};
  fetchLog.length = 0;
  dispatched.length = 0;
  localStorage.setItem('atlos-gym-hwid', tenant);
  localStorage.setItem('atlos-usuario', user);
  localStorage.setItem('atlos-sid', sid);
  localStorage.setItem('atlos-token', 'tok');
};
globalThis.__setRoutes = (r) => { routes = r || {}; };
globalThis.__fetchLog = fetchLog;
globalThis.__dispatched = dispatched;
globalThis.__setOnline = (v) => { onLine = !!v; };
globalThis.__rawStore = fakeDB.rawStore;
