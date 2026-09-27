// V44-E-05+E-06: IndexedDB v4 (planes/membresias), migracion v3->v4, queue
// offline, dependencia membresia->pago, reconcile, tenant isolation.
// Sin red real: fetch e IndexedDB mockeados en src/test/setup.js.
import { describe, it, expect, beforeEach } from 'vitest';
import { queuePush, flushQueue } from './api.js';
import { list, put } from './db.js';

const Q = (t = 'GYM-A') => 'atlos:' + t + ':queue';
const readQueue = (t = 'GYM-A') => JSON.parse(localStorage.getItem(Q(t)) || '[]');
const writeQueue = (arr, t = 'GYM-A') => localStorage.setItem(Q(t), JSON.stringify(arr));
const reqs = (method, path) => globalThis.__fetchLog.filter((r) => r.method === method && r.path === path);
const keyOf = (req) => req && req.headers && (req.headers['Idempotency-Key'] || req.headers['idempotency-key']);
let _op = 0;
const item = (type, payload, o = {}) => ({
  gymId: o.tenant || 'GYM-A',
  userId: o.user || 'u1',
  sessionId: o.sid || 's1',
  operationId: o.op === undefined ? 'op-' + ++_op : o.op,
  type,
  payload,
  ts: Date.now(),
  ...(o.extra || {}),
});

beforeEach(() => {
  globalThis.__resetAll();
  globalThis.__setOnline(true);
});

// Abre la DB cruda en v3 con esquema y datos legacy, como una instalacion real.
async function seedV3() {
  const db = await new Promise((resolve, reject) => {
    const rq = globalThis.indexedDB.open('atlos-db', 3);
    rq.onupgradeneeded = (e) => {
      const d = e.target.result;
      for (const s of ['students', 'payments', 'attendance', 'routines']) d.createObjectStore(s);
      for (const s of ['clases', 'inscripciones', 'profesores', 'library', 'meta']) d.createObjectStore(s, { keyPath: 'id' });
    };
    rq.onsuccess = (e) => resolve(e.target.result);
    rq.onerror = () => reject(rq.error);
  });
  const putRaw = (store, value, key) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const rq = tx.objectStore(store).put(value, key);
    rq.onsuccess = () => resolve();
    rq.onerror = () => reject(rq.error);
  });
  await putRaw('students', { id: '1', name: 'Viejo', gymId: 'GYM-A' }, 'GYM-A::1');
  await putRaw('students', { id: '9', name: 'Legacy' }, '9'); // sin gymId: cuarentena
  await putRaw('payments', { id: 'p1', studentId: '1', amount: 100, gymId: 'GYM-A' }, 'GYM-A::p1');
  return db;
}

describe('V44-E migracion v3 -> v4', () => {
  it('1. abrir v3 real y subir a v4 crea planes/membresias', async () => {
    await seedV3();
    await put('planes', { id: 'pl1', nombre: 'Mensual', gymId: 'GYM-A' });
    const rows = await list('planes');
    expect(rows.length).toBe(1);
    expect(rows[0].nombre).toBe('Mensual');
    await put('membresias', { id: 'm1', alumno_id: '1', estado: 'vigente', gymId: 'GYM-A' });
    expect((await list('membresias')).length).toBe(1);
  });
  it('2. registros v3 existentes intactos tras subir', async () => {
    await seedV3();
    const students = await list('students');
    expect(students.map((s) => s.id).sort()).toEqual(['1']);
    expect(students[0].name).toBe('Viejo');
    const payments = await list('payments');
    expect(payments.length).toBe(1);
    expect(payments[0].amount).toBe(100);
  });
  it('3. legacy sin gymId intacto pero invisible', async () => {
    await seedV3();
    // La fila '9' sigue fisicamente (cuarentena) pero list() no la expone.
    expect((await list('students')).some((s) => s.id === '9')).toBe(false);
  });
  it('4. planes tenant-scoped (put/list)', async () => {
    await put('planes', { id: 'a', nombre: 'A', gymId: 'GYM-A' });
    expect((await list('planes')).length).toBe(1);
  });
  it('5. membresias put/list con campos backend 1:1', async () => {
    await put('membresias', { id: 'm', alumno_id: '1', plan_id: 2, fecha_inicio: '2026-01-01', fecha_vencimiento: '2026-01-31', estado: 'vigente', precio_aplicado: 50, gymId: 'GYM-A' });
    const rows = await list('membresias');
    expect(rows[0].plan_id).toBe(2);
    expect(rows[0].precio_aplicado).toBe(50);
  });
  it('6. payment legacy sin membresia_id valido', async () => {
    await put('payments', { id: 'p', studentId: '1', amount: 5, gymId: 'GYM-A' });
    const rows = await list('payments');
    expect(rows[0].membresia_id).toBeUndefined();
  });
  it('7. payment con membresia_id persiste', async () => {
    await put('payments', { id: 'p', studentId: '1', amount: 5, membresia_id: 77, gymId: 'GYM-A' });
    expect((await list('payments'))[0].membresia_id).toBe(77);
  });
  it('8. aislamiento cross-tenant en planes', async () => {
    await put('planes', { id: 'a', nombre: 'A', gymId: 'GYM-A' });
    localStorage.setItem('atlos-gym-hwid', 'GYM-B');
    expect(await list('planes')).toEqual([]);
    await put('planes', { id: 'b', nombre: 'B', gymId: 'GYM-B' });
    expect((await list('planes')).map((p) => p.id)).toEqual(['b']);
    localStorage.setItem('atlos-gym-hwid', 'GYM-A');
    expect((await list('planes')).map((p) => p.id)).toEqual(['a']);
  });
  it('9. alumno legacy sin campos de plan legible', async () => {
    await put('students', { id: '9', name: 'Viejo', gymId: 'GYM-A' });
    const rows = await list('students');
    expect(rows[0].plan_id).toBeUndefined();
    expect(rows[0].fecha_vencimiento).toBeUndefined();
  });
  it('10. membresia legacy sin plan_id legible', async () => {
    await put('membresias', { id: 'm', alumno_id: '1', estado: 'vigente', gymId: 'GYM-A' });
    expect((await list('membresias'))[0].plan_id).toBeUndefined();
  });
});

describe('V44-E queue offline planes/membresias', () => {
  it('11. crear plan offline encola type plan con operationId', async () => {
    queuePush('plan', { nombre: 'Mensual', _localId: 'l1' });
    const q = readQueue();
    expect(q.length).toBe(1);
    expect(q[0].type).toBe('plan');
    expect(typeof q[0].operationId).toBe('string');
  });
  it('12. flush crea y actualiza plan (PUT con campos)', async () => {
    globalThis.__setRoutes({
      'POST /planes': () => ({ status: 200, json: { id: 11 } }),
      'PUT /planes/11': (body) => ({ status: 200, json: { id: 11, ...body } }),
    });
    queuePush('plan', { nombre: 'M', _localId: 'l1' });
    await flushQueue();
    expect(reqs('POST', '/planes').length).toBe(1);
    expect(readQueue().length).toBe(0);
    queuePush('updatePlan', { id: 11, nombre: 'M2', precio: 5, duracion_dias: 30, dias_semana: 3, activo: 1 });
    await flushQueue();
    const putReq = reqs('PUT', '/planes/11')[0];
    expect(putReq.body).toMatchObject({ nombre: 'M2', precio: 5 });
    expect(readQueue().length).toBe(0);
  });
  it('13. crear membresia offline y flush POST', async () => {
    globalThis.__setRoutes({ 'POST /membresias': () => ({ status: 200, json: { id: 21 } }) });
    queuePush('membresia', { alumno_id: 1, plan_id: 2, _localId: 'lm1' });
    await flushQueue();
    expect(reqs('POST', '/membresias').length).toBe(1);
    expect(readQueue().length).toBe(0);
  });
  it('14. cancelar membresia offline via updateMembresia', async () => {
    globalThis.__setRoutes({ 'PUT /membresias/21': () => ({ status: 200, json: { id: 21, estado: 'cancelada' } }) });
    queuePush('updateMembresia', { id: 21, estado: 'cancelada' });
    await flushQueue();
    expect(reqs('PUT', '/membresias/21')[0].body).toMatchObject({ estado: 'cancelada' });
    expect(readQueue().length).toBe(0);
  });
  it('15. queue conserva operationId estable', async () => {
    queuePush('plan', { nombre: 'X' });
    const op = readQueue()[0].operationId;
    expect(op).toBeTruthy();
    expect(readQueue()[0].operationId).toBe(op);
  });
  it('16. flush conserva operationId en header', async () => {
    globalThis.__setRoutes({ 'POST /planes': () => ({ status: 200, json: { id: 1 } }) });
    queuePush('plan', { nombre: 'X' });
    const op = readQueue()[0].operationId;
    await flushQueue();
    expect(keyOf(reqs('POST', '/planes')[0])).toBe(op);
  });
  it('17. reconcile: membresia resuelve id en pago dependiente', async () => {
    globalThis.__setRoutes({
      'POST /membresias': () => ({ status: 200, json: { id: 77 } }),
      'POST /pagos': () => ({ status: 200, json: { id: 88 } }),
    });
    queuePush('membresia', { alumno_id: 1, plan_id: 2, _localId: 'lm9' });
    queuePush('pago', { alumno_id: 1, monto: 100, _localId: 'lp9', membresiaLocalId: 'lm9' });
    await flushQueue();
    const pagoReq = reqs('POST', '/pagos')[0];
    expect(pagoReq.body.membresia_id).toBe(77);
    expect(pagoReq.body.membresiaLocalId).toBeUndefined();
    expect(readQueue().length).toBe(0);
  });
  it('18. membresia antes que pago aunque se encole despues', async () => {
    globalThis.__setRoutes({
      'POST /membresias': () => ({ status: 200, json: { id: 78 } }),
      'POST /pagos': () => ({ status: 200, json: { id: 89 } }),
    });
    queuePush('pago', { alumno_id: 1, monto: 100, _localId: 'lp8', membresiaLocalId: 'lm8' });
    queuePush('membresia', { alumno_id: 1, plan_id: 2, _localId: 'lm8' });
    await flushQueue(); // ronda 1: membresia sale, pago se difiere
    expect(reqs('POST', '/membresias').length).toBe(1);
    expect(reqs('POST', '/pagos').length).toBe(0);
    expect(readQueue().length).toBe(1);
    await flushQueue(); // ronda 2: pago sale con id real
    const pagoReq = reqs('POST', '/pagos')[0];
    expect(pagoReq.body.membresia_id).toBe(78);
    expect(readQueue().length).toBe(0);
  });
  it('19. retry no duplica: misma key en reintentos', async () => {
    let n = 0;
    globalThis.__setRoutes({
      'POST /planes': () => (++n === 1 ? { __network: true } : { status: 200, json: { id: 5 } }),
    });
    queuePush('plan', { nombre: 'R' });
    const op = readQueue()[0].operationId;
    await flushQueue();
    expect(readQueue().length).toBe(1);
    const q = readQueue();
    q[0].nextRetryAt = 0;
    localStorage.setItem(Q(), JSON.stringify(q));
    await flushQueue();
    const all = reqs('POST', '/planes');
    expect(all.length).toBe(2);
    expect(keyOf(all[0])).toBe(op);
    expect(keyOf(all[1])).toBe(op);
    expect(readQueue().length).toBe(0);
  });
  it('20. error 409 en plan => conflict conservado', async () => {
    globalThis.__setRoutes({ 'POST /planes': () => ({ status: 409, json: { detail: 'PLAN_DUPLICADO' } }) });
    writeQueue([item('plan', { nombre: 'D' })]);
    await flushQueue();
    const q = readQueue();
    expect(q.length).toBe(1);
    expect(q[0].state).toBe('conflict');
  });
  it('21. error 404 en membresia => terminal', async () => {
    globalThis.__setRoutes({ 'POST /membresias': () => ({ status: 404, json: { detail: 'Alumno no encontrado' } }) });
    writeQueue([item('membresia', { alumno_id: 999 })]);
    await flushQueue();
    const q = readQueue();
    expect(q.length).toBe(1);
    expect(q[0].state).toBe('terminal');
  });
  it('22. error 503 => retryable con backoff', async () => {
    globalThis.__setRoutes({ 'POST /planes': () => ({ status: 503, json: { detail: 'IDEMPOTENCY_UNAVAILABLE' } }) });
    writeQueue([item('plan', { nombre: 'S' })]);
    await flushQueue();
    const q = readQueue();
    expect(q.length).toBe(1);
    expect(q[0].state).not.toBe('terminal');
    expect(typeof q[0].nextRetryAt).toBe('number');
  });
  it('23. legacy: pago sin membresiaLocalId sale limpio', async () => {
    globalThis.__setRoutes({ 'POST /pagos': () => ({ status: 200, json: { id: 'S' } }) });
    writeQueue([item('pago', { alumno_id: '1', monto: 1 })]);
    await flushQueue();
    const body = reqs('POST', '/pagos')[0].body;
    expect('membresia_id' in body).toBe(false);
    expect('membresiaLocalId' in body).toBe(false);
    expect(readQueue().length).toBe(0);
  });
});
