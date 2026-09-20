// V44-B: tests de idempotencia frontend (header Idempotency-Key, threading
// operationId en queuePush/flush, requestMutation). Sin red real: fetch
// mockeado en src/test/setup.js.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  api,
  queuePush,
  flushQueue,
  newOperationId,
  requestMutation,
  readTenantQueue,
  writeTenantQueue,
} from './api.js';

const lastReq = (method, path) => {
  const all = globalThis.__fetchLog.filter((r) => r.method === method && r.path === path);
  return all[all.length - 1];
};
const keyOf = (req) => req && req.headers && (req.headers['Idempotency-Key'] || req.headers['idempotency-key']);

beforeEach(() => {
  globalThis.__resetAll();
  globalThis.__setOnline(true);
});

describe('V44-B header Idempotency-Key', () => {
  it('1. crearAlumno online envía la operationId como Idempotency-Key', async () => {
    globalThis.__setRoutes({ 'POST /alumnos': () => ({ status: 200, json: { id: 7 } }) });
    const op = newOperationId();
    await api.crearAlumno({ nombre: 'Test' }, { operationId: op });
    expect(keyOf(lastReq('POST', '/alumnos'))).toBe(op);
  });
  it('2. sin operationId NO se envía el header (flujo legacy intacto)', async () => {
    globalThis.__setRoutes({ 'POST /alumnos': () => ({ status: 200, json: { id: 7 } }) });
    await api.crearAlumno({ nombre: 'Test' });
    expect(keyOf(lastReq('POST', '/alumnos'))).toBeUndefined();
  });
  it('3. newOperationId genera UUID v4 únicos', () => {
    const a = newOperationId();
    const b = newOperationId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
  it('4. requestMutation autogenera y envía la key', async () => {
    globalThis.__setRoutes({ 'POST /pagos': () => ({ status: 200, json: { id: 1 } }) });
    await requestMutation('/pagos', { body: { monto: 1 } });
    const k = keyOf(lastReq('POST', '/pagos'));
    expect(typeof k).toBe('string');
    expect(k.length).toBeGreaterThanOrEqual(8);
  });
  it('5. DELETE con opts propaga la key', async () => {
    globalThis.__setRoutes({ 'DELETE /clases/5': () => ({ status: 200, json: { ok: true } }) });
    const op = newOperationId();
    await api.eliminarClase('5', { operationId: op });
    expect(keyOf(lastReq('DELETE', '/clases/5'))).toBe(op);
  });
  it('6. queuePush guarda operationId + _localId y flush reenvía LA MISMA key', async () => {
    globalThis.__setRoutes({ 'POST /pagos': () => ({ status: 200, json: { id: 'S' } }) });
    queuePush('pago', { alumno_id: 1, monto: 100, _localId: 'x-1' }, { operationId: 'op-fija-123' });
    const q = readTenantQueue();
    expect(q.length).toBe(1);
    expect(q[0].operationId).toBe('op-fija-123');
    expect(q[0].payload._localId).toBe('x-1');
    await flushQueue();
    expect(keyOf(lastReq('POST', '/pagos'))).toBe('op-fija-123');
    expect(readTenantQueue().length).toBe(0);
  });
  it('7. flush NO regenera operationId (retry = misma key)', async () => {
    let n = 0;
    globalThis.__setRoutes({
      'POST /pagos': () => {
        n += 1;
        return n === 1 ? { __network: true } : { status: 200, json: { id: 'S' } };
      },
    });
    queuePush('pago', { alumno_id: 1, monto: 5, _localId: 'x-9' }, { operationId: 'op-retry-9' });
    await flushQueue();
    expect(n).toBe(1);
    expect(readTenantQueue().length).toBe(1);
    // Forzar vencimiento del backoff para el retry inmediato.
    writeTenantQueue(readTenantQueue().map((it) => ({ ...it, nextRetryAt: Date.now() - 1 })));
    await flushQueue();
    expect(n).toBe(2);
    const reqs = globalThis.__fetchLog.filter((r) => r.method === 'POST' && r.path === '/pagos');
    expect(reqs.length).toBe(2);
    expect(keyOf(reqs[0])).toBe('op-retry-9');
    expect(keyOf(reqs[1])).toBe('op-retry-9');
    expect(readTenantQueue().length).toBe(0);
  });
  it('8. actualizarPago (PUT /pagos/{id}) propaga la key', async () => {
    globalThis.__setRoutes({ 'PUT /pagos/4': () => ({ status: 200, json: { id: 4 } }) });
    const op = newOperationId();
    await api.actualizarPago(4, { monto: 50 }, { operationId: op });
    expect(keyOf(lastReq('PUT', '/pagos/4'))).toBe(op);
  });
});
