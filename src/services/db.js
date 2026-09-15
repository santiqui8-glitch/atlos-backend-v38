const DB_NAME = 'atlos-db'
const DB_VERSION = 2
const STORES = ['students', 'payments', 'attendance', 'routines', 'clases', 'inscripciones', 'profesores', 'library', 'meta']

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'id' })
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

export async function list(storeName) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

export async function get(storeName, id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).get(id)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function put(storeName, value) {
  return withStore(storeName, 'readwrite', (store) => store.put(value))
}

export async function bulkPut(storeName, values) {
  return withStore(storeName, 'readwrite', (store) => {
    for (const v of values) {
      if (v && v.id !== undefined && v.id !== null) store.put(v)
    }
    return values.length
  })
}

export async function remove(storeName, id) {
  return withStore(storeName, 'readwrite', (store) => store.delete(id))
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
export async function normalizeKeys() {
  const metas = await list('meta').catch(() => [])
  if (metas.some(m => m.id === 'keys-normalized')) return
  for (const storeName of STORES) {
    if (storeName === 'meta') continue
    const rows = await list(storeName)
    for (const row of rows) {
      const sid = String(row.id)
      if (row.id !== sid) {
        await put(storeName, { ...row, id: sid })
        await remove(storeName, row.id)
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