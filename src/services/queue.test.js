// V40-01: tests de api.js REAL (clasificación, identidad, reconcile_pending,
// backoff). Sin red real: fetch e IndexedDB mockeados en src/test/setup.js.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  classifyQueueError,
  esErrorDeRed,
  queuePush,
  flushQueue,
} from './api.js';

const Q = (t = 'GYM-A') => 'atlos:' + t + ':queue';
const readQueue = (t = 'GYM-A') => JSON.parse(localStorage.getItem(Q(t)) || '[]');
const writeQueue = (arr, t = 'GYM-A') => localStorage.setItem(Q(t), JSON.stringify(arr));
const hits = (method, path) => globalThis.__fetchLog.filter((r) => r.method === method && r.path === path).length;
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

describe('classifyQueueError (3-9)', () => {
  const err = (status, message = 'x') => Object.assign(new Error(message), { status });
  it('3. 2xx exitoso => SUCCESS (el item sale de la cola)', async () => {
    globalThis.__setRoutes({ 'POST /pagos': () => ({ status: 200, json: { id: 'S' } }) });
    writeQueue([item('pago', { alumno_id: '1', monto: 1 })]);
    await flushQueue();
    expect(hits('POST', '/pagos')).toBe(1);
    expect(readQueue().length).toBe(0);
  });
  it('4. 400 => TERMINAL (dead-letter, sin backoff)', async () => {
    globalThis.__setRoutes({ 'POST /pagos': () => ({ status: 400, json: { detail: 'bad' } }) });
    writeQueue([item('pago', { alumno_id: '1', monto: 1 })]);
    await flushQueue();
    const q = readQueue();
    expect(classifyQueueError(err(400))).toBe('TERMINAL');
    expect(q.length).toBe(1);
    expect(q[0].state).toBe('terminal');
    expect(q[0].nextRetryAt).toBeUndefined();
    expect(q[0].attempts).toBe(1);
  });
  it('5. 401 => AUTH_BLOCKED (conserva + limpia token)', async () => {
    globalThis.__setRoutes({ 'POST /pagos': () => ({ status: 401, json: { detail: 'no' } }) });
    writeQueue([item('pago', { alumno_id: '1', monto: 1 })]);
    await flushQueue();
    const q = readQueue();
    expect(classifyQueueError(err(401))).toBe('AUTH_BLOCKED');
    expect(q.length).toBe(1);
    expect(q[0].state).not.toBe('terminal');
    expect(q[0].state).not.toBe('conflict');
    expect(localStorage.getItem('atlos-token')).toBeNull();
  });
  it('6. 409 => CONFLICT (conserva, sin backoff)', async () => {
    globalThis.__setRoutes({ 'POST /pagos': () => ({ status: 409, json: { detail: 'dup' } }) });
    writeQueue([item('pago', { alumno_id: '1', monto: 1 })]);
    await flushQueue();
    const q = readQueue();
    expect(classifyQueueError(err(409))).toBe('CONFLICT');
    expect(q[0].state).toBe('conflict');
    expect(q[0].nextRetryAt).toBeUndefined();
  });
  it('7. 429 => RETRYABLE', () => {
    expect(classifyQueueError(err(429))).toBe('RETRYABLE');
  });
  it('8. 500 => RETRYABLE con backoff futuro', async () => {
    globalThis.__setRoutes({ 'POST /pagos': () => ({ status: 500, json: { detail: 'boom' } }) });
    writeQueue([item('pago', { alumno_id: '1', monto: 1 })]);
    await flushQueue();
    const q = readQueue();
    expect(classifyQueueError(err(500))).toBe('RETRYABLE');
    expect(q.length).toBe(1);
    expect(typeof q[0].nextRetryAt).toBe('number');
    expect(q[0].nextRetryAt).toBeGreaterThan(Date.now());
  });
  it('timeout (abort sin status) => RETRYABLE', () => {
    const abortErr = new Error('The operation was aborted');
    expect(classifyQueueError(abortErr)).toBe('RETRYABLE');
    expect(esErrorDeRed(abortErr)).toBe(true);
  });
  it('9. error de red => RETRYABLE', async () => {
    expect(esErrorDeRed(new Error('Failed to fetch'))).toBe(true);
    expect(esErrorDeRed(new Error('boom inesperado'))).toBe(false);
    globalThis.__setRoutes({ 'POST /pagos': () => ({ __network: true }) });
    writeQueue([item('pago', { alumno_id: '1', monto: 1 })]);
    await flushQueue();
    const q = readQueue();
    expect(q.length).toBe(1);
    expect(q[0].attempts).toBe(1);
    expect(typeof q[0].nextRetryAt).toBe('number');
  });
});

describe('reconcile_pending (10-12)', () => {
  it('10/11/12. 2xx sin ID: una sola vez, conserva operationId estable, no reenvía', async () => {
    globalThis.__setRoutes({ 'POST /alumnos': () => ({ status: 200, json: { created: true } }) });
    const op = 'op-rp-1';
    writeQueue([item('alumno', { _localId: 'L1', nombre: 'Z' }, { op })]);
    await flushQueue();
    expect(hits('POST', '/alumnos')).toBe(1);
    let q = readQueue();
    expect(q.length).toBe(1);
    expect(q[0].state).toBe('reconcile_pending');
    expect(q[0].operationId).toBe(op);
    expect(q[0].payload).toEqual({ _localId: 'L1', nombre: 'Z' });
    globalThis.__fetchLog.length = 0;
    await flushQueue();
    expect(hits('POST', '/alumnos')).toBe(0);
    q = readQueue();
    expect(q.length).toBe(1);
    expect(q[0].operationId).toBe(op);
  });
  it('pushDuringFlush no clona el reconcile_pending', async () => {
    let pushed = false;
    globalThis.__setRoutes({
      'POST /alumnos': () => {
        if (!pushed) { pushed = true; queuePush('alumno', { _localId: 'L2', nombre: 'Nuevo' }); }
        return { status: 200, json: { created: true } };
      },
    });
    const op = 'op-rp-2';
    writeQueue([item('alumno', { _localId: 'L1', nombre: 'Z' }, { op })]);
    await flushQueue();
    const q = readQueue();
    expect(q.length).toBe(2);
    expect(q.filter((i) => i.operationId === op).length).toBe(1);
    expect(q.find((i) => i.operationId === op).state).toBe('reconcile_pending');
  });
});

describe('identidad de cola (13-15)', () => {
  it('13. sin identidad no se procesa', async () => {
    globalThis.__setRoutes({ 'POST /pagos': () => ({ status: 200, json: { id: 'S' } }) });
    localStorage.removeItem('atlos-sid');
    writeQueue([item('pago', { alumno_id: '1', monto: 1 })]);
    await flushQueue();
    expect(hits('POST', '/pagos')).toBe(0);
    expect(readQueue().length).toBe(1);
  });
  it('14. item de tenant A no se procesa en tenant B', async () => {
    globalThis.__setRoutes({ 'POST /pagos': () => ({ status: 200, json: { id: 'S' } }) });
    writeQueue([item('pago', { alumno_id: '1', monto: 1 }, { tenant: 'GYM-B' })], 'GYM-A');
    await flushQueue();
    expect(hits('POST', '/pagos')).toBe(0);
    const q = readQueue('GYM-A');
    expect(q.length).toBe(1);
    expect(q[0].gymId).toBe('GYM-B');
  });
  it('15. item de usuario A no se procesa en usuario B', async () => {
    globalThis.__setRoutes({ 'POST /pagos': () => ({ status: 200, json: { id: 'S' } }) });
    writeQueue([item('pago', { alumno_id: '1', monto: 1 }, { user: 'u2', sid: 's2' })]);
    await flushQueue();
    expect(hits('POST', '/pagos')).toBe(0);
    expect(readQueue().length).toBe(1);
  });
});

describe('backoff (16-17)', () => {
  it('16. backoff no permite retry antes de nextRetryAt', async () => {
    globalThis.__setRoutes({ 'POST /pagos': () => ({ status: 200, json: { id: 'S' } }) });
    writeQueue([item('pago', { alumno_id: '1', monto: 1 }, { extra: { nextRetryAt: Date.now() + 60000 } })]);
    await flushQueue();
    expect(hits('POST', '/pagos')).toBe(0);
    expect(readQueue().length).toBe(1);
  });
  it('17. Retry-After se respeta y acota el backoff', async () => {
    globalThis.__setRoutes({
      'POST /pagos': () => ({ status: 429, json: { detail: 'slow' }, headers: { 'retry-after': '2' } }),
    });
    writeQueue([item('pago', { alumno_id: '1', monto: 1 })]);
    await flushQueue();
    const q = readQueue();
    expect(q.length).toBe(1);
    expect(q[0].attempts).toBe(1);
    expect(typeof q[0].nextRetryAt).toBe('number');
    const delta = q[0].nextRetryAt - Date.now();
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThanOrEqual(30 * 60 * 1000 + 5000);
  });
});
