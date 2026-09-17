import { getCurrentTenant } from './tenant';

const DB_NAME = 'atlos-db'
const DB_VERSION = 3
const STORES = ['students', 'payments', 'attendance', 'routines', 'clases', 'inscripciones', 'profesores', 'library', 'meta']

// V39-06E: solo estos stores usan clave física tenant-scoped. El resto conserva
// keyPath 'id' y comportamiento legacy (son espejos muertos o sistema).
const EFFECTIVE_STORES = ['students', 'payments', 'attendance', 'routines'];

// V39-06B: aislamiento por tenant centralizado aquí. 'meta' es sistema (flags),
// no se filtra. Ningún registro sin gymId es dato activo; ningún gymId ajeno
// se lee, escribe ni elimina. Legacy queda intacto e invisible (cuarentena).

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (event) => {
      const db = request.result
      // Espejos/sistema: idéntico a v2 (con keyPath).
      for (const store of STORES) {
        if (EFFECTIVE_STORES.includes(store)) continue;
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'id' })
        }
      }
      const old = event.oldVersion || 0;
      if (old > 0 && old < 3) {
        // v1/v2 → v3: traslada SOLO filas ya tenantizadas (con gymId) a su clave
        // física; legacy sin gymId se re-inserta con su clave original (cuarentena:
        // presente físicamente, invisible lógicamente). Si algo falla se aborta
        // y la versión NO avanza (reintenta al abrir). Los awaits son microtareas
        // encadenadas sobre requests pendientes: la transacción sigue viva.
        const vtx = request.transaction || null;
        (async () => {
          if (!vtx) throw new Error('no upgrade tx');
          for (const storeName of EFFECTIVE_STORES) {
            if (!db.objectStoreNames.contains(storeName)) { db.createObjectStore(storeName); continue }
            // Cursor para preservar la clave primaria EXACTA de cada fila
            // (incluidos duplicados legacy 123/"123": colapsarlos sería pérdida).
            const pairs = await new Promise((res, rej) => {
              const out = [];
              const rq = vtx.objectStore(storeName).openCursor();
              rq.onsuccess = () => {
                const cur = rq.result;
                if (!cur) return res(out);
                out.push({ pkey: cur.primaryKey, value: cur.value });
                cur.continue();
              };
              rq.onerror = () => rej(rq.error);
            });
            db.deleteObjectStore(storeName);
            const fresh = db.createObjectStore(storeName);
            let expected = 0;
            for (const { pkey, value: row } of pairs) {
              if (row == null) continue;
              const rid = row.id !== undefined && row.id !== null ? String(row.id) : null;
              if (rid == null) continue;
              const gid = row && typeof row === 'object' ? String(row.gymId ?? '') : '';
              // Tenantizada → clave física; legacy → clave ORIGINAL exacta.
              const nk = gid ? (gid + '::' + rid) : pkey;
              await new Promise((res, rej) => {
                const pr = fresh.put(row, nk);
                pr.onsuccess = () => res();
                pr.onerror = () => rej(pr.error);
              });
              expected++;
            }
            const cnt = await new Promise((res, rej) => {
              const cr = fresh.count();
              cr.onsuccess = () => res(cr.result || 0);
              cr.onerror = () => rej(cr.error);
            });
            if (cnt !== expected) throw new Error('migrate verify ' + storeName);
          }
        })().catch(() => { try { vtx.abort() } catch {} });
      } else {
        for (const storeName of EFFECTIVE_STORES) {
          if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
        }
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore(storeName, mode, fn) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const store = tx.objectStore(storeName)
    const result = fn(store)
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error)
  })
}

const SYSTEM_STORES = ['meta'];

// V39-06E: clave física tenant-scoped para stores efectivos. El objeto conserva
// su `id` lógico intacto; la clave es `${gymId}::${id}` y permite coexistencia
// total (A::15 y B::15 son slots distintos). Espejos/sistema usan legacy.
function physicalKey(tenant, id){
  return tenant + '::' + String(id);
}

function activeTenant(){
  try{ return getCurrentTenant() }catch{ return null }
}
function rowGymId(row){
  return row&&typeof row==='object'?String(row.gymId??''):'';
}
function rawList(storeName) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  }))
}
function rawGet(storeName, id) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).get(id)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error)
  }))
}
function rawPut(storeName, value) {
  return withStore(storeName, 'readwrite', (store) => store.put(value))
}
function rawRemove(storeName, id) {
  return withStore(storeName, 'readwrite', (store) => store.delete(id))
}

export async function list(storeName) {
  const rows = await rawList(storeName).catch(() => []);
  if(!EFFECTIVE_STORES.includes(storeName)) return rows;
  const tenant=activeTenant();
  if(!tenant){ try{ console.warn('[db] no tenant, list empty',storeName) }catch{} return [] }
  return rows.filter(r=>rowGymId(r)===tenant);
}

export async function get(storeName, id) {
  if(!EFFECTIVE_STORES.includes(storeName)){
    return rawGet(storeName, id).catch(() => null);
  }
  const tenant=activeTenant();
  if(!tenant){ try{ console.warn('[db] no tenant, get null',storeName) }catch{} return null }
  const row = await rawGet(storeName, physicalKey(tenant, id)).catch(() => null);
  if(row&&rowGymId(row)===tenant) return row;
  return null;
}

export async function put(storeName, value) {
  if(!EFFECTIVE_STORES.includes(storeName)){
    return rawPut(storeName, value);
  }
  const tenant=activeTenant();
  if(!tenant){ try{ console.warn('[db] no tenant, put skipped',storeName) }catch{} return null }
  if(!value||typeof value!=='object'||value.id===undefined||value.id===null){ try{ console.warn('[db] invalid id, put skipped',storeName) }catch{} return null }
  const g=String(value.gymId??'');
  if(g&&g!==tenant){ try{ console.warn('[db] foreign gymId, put refused',storeName) }catch{} return null }
  const row=g===tenant?value:{...value, gymId:tenant};
  return withStore(storeName, 'readwrite', (store) => store.put(row, physicalKey(tenant, row.id)));
}

export async function bulkPut(storeName, values) {
  if(!EFFECTIVE_STORES.includes(storeName)){
    return withStore(storeName, 'readwrite', (store) => {
      for (const v of values) {
        if (v && v.id !== undefined && v.id !== null) store.put(v)
      }
      return values.length
    })
  }
  const tenant=activeTenant();
  if(!tenant){ try{ console.warn('[db] no tenant, bulkPut skipped',storeName) }catch{} return 0 }
  const clean=[];
  for (const v of values||[]) {
    if (!v || v.id === undefined || v.id === null) continue;
    const g=String(v.gymId??'');
    if(g&&g!==tenant){ try{ console.warn('[db] foreign gymId, bulkPut skipped row',storeName) }catch{} continue }
    clean.push(g===tenant?v:{...v, gymId:tenant});
  }
  return withStore(storeName, 'readwrite', (store) => {
    for (const v of clean) store.put(v, physicalKey(tenant, v.id))
    return clean.length
  })
}

export async function remove(storeName, id) {
  if(!EFFECTIVE_STORES.includes(storeName)){
    return rawRemove(storeName, id);
  }
  const tenant=activeTenant();
  if(!tenant){ try{ console.warn('[db] no tenant, remove skipped',storeName) }catch{} return }
  // La clave física ya es tenant-scoped: es imposible tocar otro tenant o legacy.
  return rawRemove(storeName, physicalKey(tenant, id));
}

export async function clear(storeName) {
  return withStore(storeName, 'readwrite', (store) => store.clear())
}

export async function count(storeName) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).count()
    req.onsuccess = () => resolve(req.result || 0)
    req.onerror = () => reject(req.error)
  })
}

export async function allData() {
  const out = {}
  for (const s of STORES) out[s] = await list(s)
  return out
}

// Migración idempotente: pasa los ids legacy (numéricos o mezcla) a string consistente.
// Evita que una entidad exista dos veces con key 123 y "123" en el mismo store.
// V39-06E: usa la API pública (tenant-scoped): solo normaliza filas visibles del
// tenant actual; legacy en cuarentena queda intacto.
export async function normalizeKeys() {
  const metas = await list('meta').catch(() => [])
  if (metas.some(m => m.id === 'keys-normalized')) return
  const tenant=activeTenant();
  for (const storeName of STORES) {
    if (storeName === 'meta') continue
    if (!EFFECTIVE_STORES.includes(storeName)) continue
    const rows = await list(storeName)
    for (const row of rows) {
      const sid = String(row.id)
      if (row.id !== sid) {
        await put(storeName, { ...row, id: sid })
        // Con claves físicas ambas variantes caen en el mismo slot: solo se
        // elimina la vieja si realmente es otra clave.
        if (tenant && physicalKey(tenant,row.id)!==physicalKey(tenant,sid)) await remove(storeName, row.id)
      }
    }
  }
  await put('meta', { id: 'keys-normalized', value: true })
}

export async function seed() {
  const students = await list('students')
  if (students.length) return
  const now = new Date().toISOString()
  const demo = [
    { id: crypto.randomUUID(), name: 'Juan Pérez', dni: '40111222', phone: '221 555-0101', joinedAt: now.slice(0,10), status: 'activo', createdAt: now },
    { id: crypto.randomUUID(), name: 'Sofía Gómez', dni: '42999888', phone: '221 555-0102', joinedAt: now.slice(0,10), status: 'activo', createdAt: now },
    { id: crypto.randomUUID(), name: 'Martín Díaz', dni: '38777666', phone: '221 555-0103', joinedAt: now.slice(0,10), status: 'vencido', createdAt: now }
  ]
  for (const s of demo) await put('students', s)
}