// V44-G: capa API de caja (rutas, cuerpos, Idempotency-Key, errores).
import { describe, it, expect, beforeEach } from 'vitest';
import { api } from './api.js';

const lastReq = (method, path) => {
  const all = globalThis.__fetchLog.filter((r) => r.method === method && r.path === path);
  return all[all.length - 1];
};
const keyOf = (req) => req && req.headers && (req.headers['Idempotency-Key'] || req.headers['idempotency-key']);

beforeEach(() => {
  globalThis.__resetAll();
  globalThis.__setOnline(true);
});

describe('V44-G caja API', () => {
  it('1. movimientos() hace GET con query', async () => {
    globalThis.__setRoutes({ 'GET /movimientos': () => ({ status: 200, json: [] }) });
    expect(await api.movimientos('desde=2026-01-01')).toEqual([]);
    expect(lastReq('GET', '/movimientos')).toBeTruthy();
  });
  it('2. crearMovimiento POST con body y key', async () => {
    globalThis.__setRoutes({ 'POST /movimientos': (body) => ({ status: 200, json: { id: 1, ...body } }) });
    const r = await api.crearMovimiento({ tipo: 'egreso', categoria: 'Alquiler', concepto: 'X', monto: 10 }, { operationId: 'op-m1' });
    expect(r.id).toBe(1);
    expect(lastReq('POST', '/movimientos').body).toMatchObject({ tipo: 'egreso', monto: 10 });
    expect(keyOf(lastReq('POST', '/movimientos'))).toBe('op-m1');
  });
  it('3. actualizarMovimiento PUT /movimientos/{id}', async () => {
    globalThis.__setRoutes({ 'PUT /movimientos/4': () => ({ status: 200, json: { id: 4 } }) });
    await api.actualizarMovimiento(4, { concepto: 'Y' });
    expect(lastReq('PUT', '/movimientos/4').body).toMatchObject({ concepto: 'Y' });
  });
  it('4. cierres() y crearCierre', async () => {
    globalThis.__setRoutes({
      'GET /cierres': () => ({ status: 200, json: [] }),
      'POST /cierres': (body) => ({ status: 200, json: { id: 2, ...body } }),
    });
    expect(await api.cierres()).toEqual([]);
    const r = await api.crearCierre({ fecha: '2026-01-10' }, { operationId: 'op-c1' });
    expect(r.id).toBe(2);
    expect(keyOf(lastReq('POST', '/cierres'))).toBe('op-c1');
  });
  it('5. errores 400/404/409/503 se propagan con status', async () => {
    globalThis.__setRoutes({
      'POST /movimientos': () => ({ status: 400, json: { detail: 'MONTO_INVALIDO' } }),
      'POST /cierres': () => ({ status: 409, json: { detail: 'CIERRE_EXISTENTE' } }),
    });
    await expect(api.crearMovimiento({})).rejects.toMatchObject({ status: 400 });
    await expect(api.crearCierre({})).rejects.toMatchObject({ status: 409 });
    globalThis.__setRoutes({ 'POST /movimientos': () => ({ status: 503, json: { detail: 'IDEMPOTENCY_UNAVAILABLE' } }) });
    await expect(api.crearMovimiento({})).rejects.toMatchObject({ status: 503 });
  });
});
