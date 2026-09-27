// V44-H: IDB v6 (accesos), queue offline, flush, tenant isolation.
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

describe('V44-H offline accesos', () => {
  it('1. IDB v6 expone accesos tenant-scoped', async () => {
    await put('accesos', { id: 'a1', tipo: 'entrada', resultado: 'permitido', gymId: 'GYM-A' });
    expect((await list('accesos')).length).toBe(1);
    localStorage.setItem('atlos-gym-hwid', 'GYM-B');
    expect(await list('accesos')).toEqual([]);
  });
  it('2. entrada offline encola con operationId', async () => {
    queuePush('acceso-entrada', { alumno_id: 1, tipo: 'entrada', metodo: 'dni', _localId: 'la1' });
    const q = readQueue();
    expect(q.length).toBe(1);
    expect(typeof q[0].operationId).toBe('string');
  });
  it('3. flush envia con key y saca de cola', async () => {
    globalThis.__setRoutes({ 'POST /accesos/entrada': () => ({ status: 200, json: { id: 5, resultado: 'permitido' } }) });
    queuePush('acceso-entrada', { alumno_id: 1, _localId: 'la1' });
    const op = readQueue()[0].operationId;
    await flushQueue();
    expect(keyOf(reqs('POST', '/accesos/entrada')[0])).toBe(op);
    expect(readQueue().length).toBe(0);
  });
  it('4. flush salida', async () => {
    globalThis.__setRoutes({ 'POST /accesos/salida': () => ({ status: 200, json: { id: 6, resultado: 'permitido' } }) });
    queuePush('acceso-salida', { alumno_id: 1, _localId: 'la2' });
    await flushQueue();
    expect(reqs('POST', '/accesos/salida').length).toBe(1);
    expect(readQueue().length).toBe(0);
  });
  it('5. 400 terminal, 503 retryable', async () => {
    globalThis.__setRoutes({ 'POST /accesos/entrada': () => ({ status: 400, json: { detail: 'TIPO_INVALIDO' } }) });
    writeQueue([item('acceso-entrada', { alumno_id: 1 })]);
    await flushQueue();
    expect(readQueue()[0].state).toBe('terminal');
    globalThis.__setRoutes({ 'POST /accesos/entrada': () => ({ status: 503, json: { detail: 'IDEMPOTENCY_UNAVAILABLE' } }) });
    const q = readQueue();
    q[0].state = undefined; q[0].nextRetryAt = 0;
    localStorage.setItem(Q(), JSON.stringify(q));
    await flushQueue();
    expect(typeof readQueue()[0].nextRetryAt).toBe('number');
  });
  it('6. asistencia preexistente intacta (sin regresion)', async () => {
    globalThis.__setRoutes({ 'POST /asistencia/checkin': () => ({ status: 200, json: { id: 'S' } }) });
    writeQueue([item('checkin', { alumno_id: '1' })]);
    await flushQueue();
    expect(reqs('POST', '/asistencia/checkin').length).toBe(1);
  });
});
