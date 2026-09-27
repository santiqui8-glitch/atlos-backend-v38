// V44-G: IDB v5 (movimientos/cierres), queue offline, flush, tenant isolation.
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

describe('V44-G offline caja', () => {
  it('1. IDB v5 expone movimientos/cierres tenant-scoped', async () => {
    await put('movimientos', { id: 'm1', tipo: 'egreso', monto: 10, gymId: 'GYM-A' });
    await put('cierres', { id: 'c1', fecha: '2026-01-10', gymId: 'GYM-A' });
    expect((await list('movimientos')).length).toBe(1);
    expect((await list('cierres')).length).toBe(1);
    localStorage.setItem('atlos-gym-hwid', 'GYM-B');
    expect(await list('movimientos')).toEqual([]);
    expect(await list('cierres')).toEqual([]);
  });
  it('2. crear gasto offline encola con operationId', async () => {
    queuePush('movimiento', { tipo: 'egreso', categoria: 'Alquiler', concepto: 'X', monto: 5, _localId: 'lm1' });
    const q = readQueue();
    expect(q.length).toBe(1);
    expect(typeof q[0].operationId).toBe('string');
  });
  it('3. flush envia movimiento con key y lo saca de cola', async () => {
    globalThis.__setRoutes({ 'POST /movimientos': () => ({ status: 200, json: { id: 3 } }) });
    queuePush('movimiento', { tipo: 'egreso', concepto: 'X', monto: 5, _localId: 'lm1' });
    const op = readQueue()[0].operationId;
    await flushQueue();
    expect(keyOf(reqs('POST', '/movimientos')[0])).toBe(op);
    expect(readQueue().length).toBe(0);
  });
  it('4. flush cierre con key', async () => {
    globalThis.__setRoutes({ 'POST /cierres': () => ({ status: 200, json: { id: 4 } }) });
    queuePush('cierre', { fecha: '2026-01-10', _localId: 'lc1' });
    await flushQueue();
    expect(reqs('POST', '/cierres').length).toBe(1);
    expect(readQueue().length).toBe(0);
  });
  it('5. retry misma key sin duplicar envio logico', async () => {
    let n = 0;
    globalThis.__setRoutes({ 'POST /movimientos': () => (++n === 1 ? { __network: true } : { status: 200, json: { id: 6 } }) });
    queuePush('movimiento', { tipo: 'egreso', concepto: 'X', monto: 5 });
    const op = readQueue()[0].operationId;
    await flushQueue();
    const q = readQueue();
    q[0].nextRetryAt = 0;
    localStorage.setItem(Q(), JSON.stringify(q));
    await flushQueue();
    const all = reqs('POST', '/movimientos');
    expect(all.length).toBe(2);
    expect(keyOf(all[0])).toBe(op);
    expect(keyOf(all[1])).toBe(op);
  });
  it('6. 409 en cierre => conflict conservado', async () => {
    globalThis.__setRoutes({ 'POST /cierres': () => ({ status: 409, json: { detail: 'CIERRE_EXISTENTE' } }) });
    writeQueue([item('cierre', { fecha: '2026-01-10' })]);
    await flushQueue();
    expect(readQueue()[0].state).toBe('conflict');
  });
  it('7. pago offline preexistente intacto (sin regresion)', async () => {
    globalThis.__setRoutes({ 'POST /pagos': () => ({ status: 200, json: { id: 'S' } }) });
    writeQueue([item('pago', { alumno_id: '1', monto: 1 })]);
    await flushQueue();
    expect(reqs('POST', '/pagos').length).toBe(1);
    expect(readQueue().length).toBe(0);
  });
});
