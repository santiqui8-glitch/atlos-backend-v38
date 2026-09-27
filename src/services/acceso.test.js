// V44-H: capa API de accesos (rutas, cuerpos, Idempotency-Key, errores).
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

describe('V44-H accesos API', () => {
  it('1. accesos() hace GET con query', async () => {
    globalThis.__setRoutes({ 'GET /accesos': () => ({ status: 200, json: [] }) });
    expect(await api.accesos('desde=2026-01-01')).toEqual([]);
    expect(lastReq('GET', '/accesos')).toBeTruthy();
  });
  it('2. accesoEntrada POST con body y key', async () => {
    globalThis.__setRoutes({ 'POST /accesos/entrada': (body) => ({ status: 200, json: { id: 1, resultado: 'permitido' } }) });
    const r = await api.accesoEntrada({ alumno_id: 1, tipo: 'entrada', metodo: 'dni' }, { operationId: 'op-e1' });
    expect(r.resultado).toBe('permitido');
    expect(lastReq('POST', '/accesos/entrada').body).toMatchObject({ alumno_id: 1 });
    expect(keyOf(lastReq('POST', '/accesos/entrada'))).toBe('op-e1');
  });
  it('3. accesoSalida POST /accesos/salida', async () => {
    globalThis.__setRoutes({ 'POST /accesos/salida': () => ({ status: 200, json: { id: 2, resultado: 'permitido' } }) });
    await api.accesoSalida({ alumno_id: 1, tipo: 'salida' });
    expect(lastReq('POST', '/accesos/salida')).toBeTruthy();
  });
  it('4. errores se propagan con status', async () => {
    globalThis.__setRoutes({ 'POST /accesos/entrada': () => ({ status: 404, json: { detail: 'X' } }) });
    await expect(api.accesoEntrada({})).rejects.toMatchObject({ status: 404 });
  });
});
