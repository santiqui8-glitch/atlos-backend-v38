import { api, flushQueue } from './api';
import { list, put, bulkPut, normalizeKeys } from './db';
import { tenantKey, tenantGetJSON, getCurrentTenant } from './tenant';

const QUEUE_KEY = 'atlos-queue' // V39-04B: legacy/quarantine. Solo flushQueue la lee para avisar; nada la escribe.
const SYNC_INTERVAL = 60000
// V39-09B-3: espejo desde claves namespaced por tenant. Legacy global en
// cuarentena: NO se lee ni se migra (evita contaminación entre gyms).
const NS_TO_IDB = [
  ['clases', 'clases'],
  ['inscripciones', 'inscripciones'],
  ['profesores', 'profesores'],
  ['library', 'library'],
]

// V39-13B: última versión de sync POR tenant (un gym no hereda ni bloquea el pull de otro).
let lastVersions = {}
let timer = null
let emitChange = null
let cleanupOnline = null
let cleanupVisibility = null

function readQueue() {
  const key=tenantKey('queue');
  if(!key){ try{ console.warn('[sync][queue] no tenant, read skipped') }catch{} return [] }
  try {
    const q = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(q) ? q : []
  } catch { return [] }
}
function writeQueue(q) {
  const key=tenantKey('queue');
  if(!key){ try{ console.warn('[sync][queue] no tenant, write skipped') }catch{} return false }
  try { localStorage.setItem(key, JSON.stringify(q)); return true } catch { return false }
}

// BLOQUE 4D: IDs eliminados por ID (nunca por nombre) para no reinsertar en IDB.
// V39-05B: listas namespaced por tenant (fail-closed: sin tenant no filtra nada).
function readDeletedIds(base) {
  try { const a=tenantGetJSON(base,[]); return new Set((Array.isArray(a)?a:[]).map(String)) } catch { return new Set() }
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
    // V44-E: solo diagnostico (mismo nivel que el resto: warn + conteo).
    if (item.type === 'membresia' || item.type === 'updateMembresia') return hasBadId(pl.alumno_id)
    if (item.type === 'plan' || item.type === 'updatePlan') return !(pl.nombre && String(pl.nombre).trim())
    // V44-G: solo diagnostico (warn + conteo, igual que el resto).
    if (item.type === 'movimiento' || item.type === 'updateMovimiento') return !(pl.concepto && String(pl.concepto).trim())
    if (item.type === 'cierre') return !(pl.fecha && String(pl.fecha).trim())
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
  for (const [base, storeName] of NS_TO_IDB) {
    try {
      const rows = tenantGetJSON(base,[])
      if (Array.isArray(rows) && rows.length) {
        const delIds = storeName==='clases' ? readDeletedIds('deleted-clases') : storeName==='profesores' ? readDeletedIds('deleted-profesores') : null
        const clean = rows.filter(x => x && x.id !== undefined && !(delIds && delIds.has(String(x.id)))).map(x => ({ ...x, id: String(x.id) }))
        if (clean.length) await bulkPut(storeName, clean)
      }
    } catch {}
  }
  try {
    const ext = tenantGetJSON('alumnos-ext',{})
    if (ext && typeof ext === 'object') await put('meta', { id: 'alumnos-ext', value: ext })
  } catch {}
}

async function pullAll() {
  // V39-11B: snapshot del tenant ANTES de la primera petición de red. Si cambia
  // mid-flight, la persistencia se descarta (fail-closed): ningún bulkPut corre.
  const ctxTenant=getCurrentTenant();
  const drifted=()=>getCurrentTenant()!==ctxTenant;
  const empty = []
  const [students, payments, attendance, routines, clases, profesores, planes, membresias, movs, cierres] = await Promise.all([
    api.alumnos().catch(() => empty),
    api.pagos().catch(() => empty),
    api.asistencia().catch(() => empty),
    api.routines().catch(() => empty),
    api.clases().catch(() => empty),
    api.profesores().catch(() => empty),
    // V44-E: pull de planes/membresias (mismo patron; fallo aislado por endpoint).
    api.planes().catch(() => empty),
    api.membresias().catch(() => empty),
    // V44-G: pull de caja (mismo patron; sin tombstones porque no hay borrado).
    api.movimientos().catch(() => empty),
    api.cierres().catch(() => empty),
  ])
  let extMap = {}
  try { extMap = tenantGetJSON('alumnos-ext',{}) } catch {}
  const existing = await list('students')
  const byId = new Map(existing.map(x => [String(x.id), x]))
  const delAlumnosIds = readDeletedIds('deleted-alumnos')
  const delPagosIds = readDeletedIds('deleted-pagos')
  const delClasesIds = readDeletedIds('deleted-clases')
  const delProfsIds = readDeletedIds('deleted-profesores')
  const delPlanesIds = readDeletedIds('deleted-planes')
  const delMembsIds = readDeletedIds('deleted-membresias')
  const now = new Date().toISOString()
  const studentsToPut = []
  for (const s of students) {
    if(delAlumnosIds.has(String(s.id))) continue
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
  if(drifted()){ try{ console.warn('[sync] tenant drift, pullAll discarded') }catch{} return }
  if (studentsToPut.length && !drifted()) await bulkPut('students', studentsToPut)
  const pRows = payments.filter(p=>!delPagosIds.has(String(p.id)) && !delAlumnosIds.has(String(p.alumno_id||p.student_id||p.studentId||''))).map(p => ({
    id: String(p.id),
    studentId: String(p.alumno_id || p.student_id || p.studentId || ''),
    amount: p.monto ?? p.amount ?? 0,
    date: String(p.fecha || p.date || '').slice(0, 10),
    note: p.concepto || p.note || '',
    metodo: p.metodo || 'Efectivo',
    alumnoNombre: p.alumno_nombre || p.alumno || '',
    // V44-E: membresia asociada (null = pago legacy). Sin recalculo.
    membresia_id: p.membresia_id ?? null,
  }))
  if (pRows.length && !drifted()) await bulkPut('payments', pRows)
  const aRows = attendance.filter(a=>!delAlumnosIds.has(String(a.alumno_id||a.student_id||a.studentId||''))).map(a => ({
    id: String(a.id),
    studentId: String(a.alumno_id || a.student_id || a.studentId || ''),
    date: String(a.fecha || a.date || '').slice(0, 10),
    time: a.hora_entrada || a.time || '',
    alumnoNombre: a.alumno_nombre || '',
  }))
  if (aRows.length && !drifted()) await bulkPut('attendance', aRows)
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
  if (rRows.length && !drifted()) await bulkPut('routines', rRows)
  const cRows = Array.isArray(clases) ? clases.filter(c=>!delClasesIds.has(String(c.id))).map(c => ({
    id: String(c.id),
    nombre: c.nombre || c.name || '',
    dia_mes: c.dia_mes || c.dia || '',
    hora_inicio: c.hora_inicio || c.inicio || '',
    hora_fin: c.hora_fin || c.fin || '',
    capacidad: c.capacidad || c.cap || 0,
    profesor: c.profesor || '',
    inscriptos: c.inscriptos || c.inscriptos_count || 0,
  })) : []
  if (cRows.length && !drifted()) await bulkPut('clases', cRows)
  const prRows = Array.isArray(profesores) ? profesores.filter(x=>!delProfsIds.has(String(x.id))).map(x => {
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
  if (prRows.length && !drifted()) await bulkPut('profesores', prRows)
  // V44-E: planes/membresias (nombres backend 1:1; tombstones propios;
  // membresias de alumnos eliminados se descartan como los pagos).
  const plRows = Array.isArray(planes) ? planes.filter(x=>!delPlanesIds.has(String(x.id))).map(x => ({
    id: String(x.id),
    nombre: x.nombre || '',
    precio: x.precio ?? 0,
    duracion_dias: x.duracion_dias ?? 30,
    dias_semana: x.dias_semana ?? 3,
    activo: x.activo ?? 1,
  })) : []
  if (plRows.length && !drifted()) await bulkPut('planes', plRows)
  const mRows = Array.isArray(membresias) ? membresias.filter(m=>!delMembsIds.has(String(m.id)) && !delAlumnosIds.has(String(m.alumno_id||''))).map(m => ({
    id: String(m.id),
    alumno_id: m.alumno_id,
    plan_id: m.plan_id ?? null,
    fecha_inicio: m.fecha_inicio || '',
    fecha_vencimiento: m.fecha_vencimiento || '',
    estado: m.estado || 'vigente',
    precio_aplicado: m.precio_aplicado ?? 0,
  })) : []
  if (mRows.length && !drifted()) await bulkPut('membresias', mRows)
  // V44-G: movimientos/cierres (nombres backend 1:1; sin borrado -> sin tombstones).
  const mvRows = Array.isArray(movs) ? movs.map(m => ({
    id: String(m.id),
    tipo: m.tipo || '',
    categoria: m.categoria || '',
    concepto: m.concepto || '',
    monto: m.monto ?? 0,
    metodo: m.metodo || 'Efectivo',
    fecha: String(m.fecha || '').slice(0, 10),
    referencia_tipo: m.referencia_tipo ?? null,
    referencia_id: m.referencia_id ?? null,
    observaciones: m.observaciones || '',
    estado: m.estado || 'activo',
  })) : []
  if (mvRows.length && !drifted()) await bulkPut('movimientos', mvRows)
  const ciRows = Array.isArray(cierres) ? cierres.map(c => ({
    id: String(c.id),
    fecha: String(c.fecha || '').slice(0, 10),
    total_ingresos: c.total_ingresos ?? 0,
    total_egresos: c.total_egresos ?? 0,
    saldo: c.saldo ?? 0,
    efectivo_esperado: c.efectivo_esperado ?? null,
    efectivo_declarado: c.efectivo_declarado ?? null,
    diferencia: c.diferencia ?? null,
    usuario: c.usuario || '',
  })) : []
  if (ciRows.length && !drifted()) await bulkPut('cierres', ciRows)
  if (!drifted() && extMap && typeof extMap === 'object') await put('meta', { id: 'alumnos-ext', value: extMap }).catch(() => {})
}

// V39-11B: in-flight protection (sin solapamientos) + snapshot de tenant.
let verifying=false;
async function verify() {
  if(verifying){ try{ console.log('[sync] verify in-flight, skipped') }catch{} return }
  verifying=true;
  // Snapshot ANTES de la primera petición; si el tenant cambia mid-flight se
  // descarta el pull/emit (fail-closed). La versión solo avanza sin drift y
  // por tenant (lastVersions).
  const ctxTenant=getCurrentTenant();
  const drifted=()=>getCurrentTenant()!==ctxTenant;
  const lastVer=ctxTenant?(lastVersions[ctxTenant] ?? null):null;
  try {
    sanitizeQueue()
    if (navigator.onLine) await flushQueue().catch(() => {})
    const data = await api.syncVersion().catch(() => null)
    const ver = data && data.version
    if(drifted()){ try{ console.warn('[sync] tenant drift, verify discarded') }catch{} return }
    if (ver && ver !== lastVer) {
      if(ctxTenant) lastVersions[ctxTenant] = ver
      await pullAll()
      if(drifted()){ try{ console.warn('[sync] tenant drift, emit skipped') }catch{} return }
      if (typeof emitChange === 'function') emitChange()
    } else if (lastVer === null && navigator.onLine) {
      if(ctxTenant) lastVersions[ctxTenant] = ver || 'initial'
      await pullAll()
      if(drifted()){ try{ console.warn('[sync] tenant drift, emit skipped') }catch{} return }
      if (typeof emitChange === 'function') emitChange()
    }
  } catch (e) {
    console.log('[sync]', e && e.message)
  } finally { verifying=false }
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
  lastVersions = {}
}

export function syncNow() {
  return verify()
}