import { api, flushQueue } from './api';
import { list, put, bulkPut, normalizeKeys } from './db';

const QUEUE_KEY = 'atlos-queue'
const SYNC_INTERVAL = 60000
const LEGACY_TO_IDB = [
  ['atlos-clases', 'clases'],
  ['atlos-inscripciones', 'inscripciones'],
  ['atlos-profesores', 'profesores'],
  ['atlos-library', 'library'],
]

let lastVersion = null
let timer = null
let emitChange = null
let cleanupOnline = null
let cleanupVisibility = null

function readQueue() {
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
    return Array.isArray(q) ? q : []
  } catch { return [] }
}
function writeQueue(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)) } catch {}
}

// Defensa del bug UUID: un id que se pasó por Number() queda NaN y al persistir en JSON se vuelve null.
// BLOQUE 4A: se detecta y se registra, pero NO se descarta silenciosamente (conserva para diagnóstico/reintento).
export function sanitizeQueue() {
  const q = readQueue()
  if (!q.length) return 0
  const hasBadId = v => v === null || v === undefined || v === '' || v === 'NaN' || Number.isNaN(v)
  const badReason = v => {
    if (v === null) return 'null'
    if (v === undefined) return 'undefined'
    if (v === '') return 'empty-string'
    if (v === 'NaN') return 'string-NaN'
    if (Number.isNaN(v)) return 'numeric-NaN'
    return 'unknown'
  }
  const broken = item => {
    const pl = item.payload || {}
    if (item.type === 'pago' || item.type === 'checkin') return hasBadId(pl.alumno_id)
    if (item.type === 'deleteClase' || item.type === 'updateClase' || item.type === 'updateProfesor' || item.type === 'deleteProfesor') return hasBadId(pl.id)
    return false
  }
  let flagged = 0
  for (const item of q) {
    if (broken(item)) {
      flagged++
      const pl = item.payload || {}
      const v = (item.type === 'pago' || item.type === 'checkin') ? pl.alumno_id : pl.id
      try { console.warn('[sync][sanitize]', item.type, badReason(v), item) } catch {}
    }
  }
  return flagged
}

// Los datos pesados que históricamente vivían en localStorage quedan espejados en IndexedDB.
// Se mantiene la escritura en localStorage para no romper a las páginas que todavía leen ahí.
async function mirrorLocalStorageToIdb() {
  for (const [key, storeName] of LEGACY_TO_IDB) {
    try {
      const rows = JSON.parse(localStorage.getItem(key) || '[]')
      if (Array.isArray(rows) && rows.length) {
        const clean = rows.filter(x => x && x.id !== undefined).map(x => ({ ...x, id: String(x.id) }))
        if (clean.length) await bulkPut(storeName, clean)
      }
    } catch {}
  }
  try {
    const ext = JSON.parse(localStorage.getItem('atlos-alumnos-ext') || '{}')
    if (ext && typeof ext === 'object') await put('meta', { id: 'alumnos-ext', value: ext })
  } catch {}
}

async function pullAll() {
  const empty = []
  const [students, payments, attendance, routines, clases, profesores] = await Promise.all([
    api.alumnos().catch(() => empty),
    api.pagos().catch(() => empty),
    api.asistencia().catch(() => empty),
    api.routines().catch(() => empty),
    api.clases().catch(() => empty),
    api.profesores().catch(() => empty),
  ])
  let extMap = {}
  try { extMap = JSON.parse(localStorage.getItem('atlos-alumnos-ext') || '{}') } catch {}
  const existing = await list('students')
  const byId = new Map(existing.map(x => [String(x.id), x]))
  const now = new Date().toISOString()
  const studentsToPut = []
  for (const s of students) {
    const ex = extMap[String(s.nombre || '').toLowerCase()]
    const prev = byId.get(String(s.id)) || {}
    studentsToPut.push({
      id: String(s.id),
      name: s.nombre || s.name || 'Sin nombre',
      dni: ex?.dni || s.dni || prev.dni || s.telefono || '',
      phone: s.telefono || s.phone || prev.phone || '',
      mail: ex?.mail || s.email || prev.mail || '',
      apellido: ex?.apellido || prev.apellido || '',
      fecha_nacimiento: ex?.fecha_nacimiento || prev.fecha_nacimiento || '',
      enfoque: ex?.enfoque || prev.enfoque || '',
      observaciones: ex?.observaciones || prev.observaciones || '',
      edad: s.edad ?? prev.edad ?? null,
      joinedAt: s.fecha_ingreso || prev.joinedAt || '',
      status: prev.status || 'activo',
      createdAt: prev.createdAt || now,
    })
  }
  if (studentsToPut.length) await bulkPut('students', studentsToPut)
  const pRows = payments.map(p => ({
    id: String(p.id),
    studentId: String(p.alumno_id || p.student_id || p.studentId || ''),
    amount: p.monto ?? p.amount ?? 0,
    date: String(p.fecha || p.date || '').slice(0, 10),
    note: p.concepto || p.note || '',
    metodo: p.metodo || 'Efectivo',
    alumnoNombre: p.alumno_nombre || p.alumno || '',
  }))
  if (pRows.length) await bulkPut('payments', pRows)
  const aRows = attendance.map(a => ({
    id: String(a.id),
    studentId: String(a.alumno_id || a.student_id || a.studentId || ''),
    date: String(a.fecha || a.date || '').slice(0, 10),
    time: a.hora_entrada || a.time || '',
    alumnoNombre: a.alumno_nombre || '',
  }))
  if (aRows.length) await bulkPut('attendance', aRows)
  const rRows = routines.map(r => ({
    id: String(r.id),
    studentId: String(r.student_id || r.studentId || r.alumno_id || ''),
    day: r.period || r.dia || 'Rutina',
    exercise: JSON.stringify(r.routine_a || r.routine_b || r.exercise || []),
    series: r.series || '',
    reps: r.reps || '',
    peso: r.peso || '',
    period: r.period || '',
  }))
  if (rRows.length) await bulkPut('routines', rRows)
  const cRows = Array.isArray(clases) ? clases.map(c => ({
    id: String(c.id),
    nombre: c.nombre || c.name || '',
    dia_mes: c.dia_mes || c.dia || '',
    hora_inicio: c.hora_inicio || c.inicio || '',
    hora_fin: c.hora_fin || c.fin || '',
    capacidad: c.capacidad || c.cap || 0,
    profesor: c.profesor || '',
    inscriptos: c.inscriptos || c.inscriptos_count || 0,
  })) : []
  if (cRows.length) await bulkPut('clases', cRows)
  const prRows = Array.isArray(profesores) ? profesores.map(x => {
    const nombreCompleto = x.nombreCompleto || `${x.nombre || ''} ${x.apellido || ''}`.trim()
    return {
      id: String(x.id),
      nombre: x.nombre || '',
      apellido: x.apellido || '',
      telefono: x.telefono || '',
      especialidad: x.especialidad || 'General',
      nombreCompleto,
    }
  }) : []
  if (prRows.length) await bulkPut('profesores', prRows)
  if (extMap && typeof extMap === 'object') await put('meta', { id: 'alumnos-ext', value: extMap }).catch(() => {})
}

async function verify() {
  try {
    sanitizeQueue()
    if (navigator.onLine) await flushQueue().catch(() => {})
    const data = await api.syncVersion().catch(() => null)
    const ver = data && data.version
    if (ver && ver !== lastVersion) {
      lastVersion = ver
      await pullAll()
      if (typeof emitChange === 'function') emitChange()
    } else if (lastVersion === null && navigator.onLine) {
      lastVersion = ver || 'initial'
      await pullAll()
      if (typeof emitChange === 'function') emitChange()
    }
  } catch (e) {
    console.log('[sync]', e && e.message)
  }
}

export function startSync(onUpdate) {
  stopSync()
  emitChange = onUpdate
  const bootstrap = async () => {
    await normalizeKeys().catch(() => {})
    await mirrorLocalStorageToIdb()
    await verify()
  }
  const onOnline = () => verify()
  const onVisibility = () => { if (document.visibilityState === 'visible') verify() }
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisibility)
  cleanupOnline = () => window.removeEventListener('online', onOnline)
  cleanupVisibility = () => document.removeEventListener('visibilitychange', onVisibility)
  bootstrap()
  timer = setInterval(verify, SYNC_INTERVAL)
}

export function stopSync() {
  if (timer) { clearInterval(timer); timer = null }
  if (cleanupOnline) { cleanupOnline(); cleanupOnline = null }
  if (cleanupVisibility) { cleanupVisibility(); cleanupVisibility = null }
  emitChange = null
  lastVersion = null
}

export function syncNow() {
  return verify()
}