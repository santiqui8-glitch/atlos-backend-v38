// V44-E-04: capa API de planes/membresias (rutas, cuerpos, Idempotency-Key,
// propagacion de errores). Sin red real: fetch mockeado en src/test/setup.js.
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

describe('V44-E planes API', () => {
  it('1. planes() hace GET /planes', async () => {
    globalThis.__setRoutes({ 'GET /planes': () => ({ status: 200, json: [] }) });
    const r = await api.planes();
    expect(r).toEqual([]);
    expect(lastReq('GET', '/planes')).toBeTruthy();
  });
  it('2. crearPlan hace POST con body y key', async () => {
    globalThis.__setRoutes({ 'POST /planes': (body) => ({ status: 200, json: { id: 1, ...body } }) });
    const r = await api.crearPlan({ nombre: 'Mensual', precio: 100 }, { operationId: 'op-plan-1' });
    expect(r.id).toBe(1);
    const req = lastReq('POST', '/planes');
    expect(req.body).toMatchObject({ nombre: 'Mensual', precio: 100 });
    expect(keyOf(req)).toBe('op-plan-1');
  });
  it('3. crearPlan sin opts no envia header', async () => {
    globalThis.__setRoutes({ 'POST /planes': () => ({ status: 200, json: { id: 2 } }) });
    await api.crearPlan({ nombre: 'X' });
    expect(keyOf(lastReq('POST', '/planes'))).toBeUndefined();
  });
  it('4. actualizarPlan hace PUT /planes/{id}', async () => {
    globalThis.__setRoutes({ 'PUT /planes/7': (body) => ({ status: 200, json: { id: 7, ...body } }) });
    const r = await api.actualizarPlan(7, { precio: 200 }, { operationId: 'op-p7' });
    expect(r.precio).toBe(200);
    expect(keyOf(lastReq('PUT', '/planes/7'))).toBe('op-p7');
  });
  it('5. desactivarPlan hace DELETE /planes/{id}', async () => {
    globalThis.__setRoutes({ 'DELETE /planes/7': () => ({ status: 200, json: { id: 7, activo: 0 } }) });
    const r = await api.desactivarPlan(7);
    expect(r.activo).toBe(0);
    expect(lastReq('DELETE', '/planes/7')).toBeTruthy();
  });
  it('6. error 409 de plan se propaga con status', async () => {
    globalThis.__setRoutes({ 'POST /planes': () => ({ status: 409, json: { detail: 'PLAN_DUPLICADO' } }) });
    await expect(api.crearPlan({ nombre: 'Dup' })).rejects.toMatchObject({ status: 409 });
  });
});

describe('V44-E membresias API', () => {
  it('7. membresias() hace GET /membresias', async () => {
    globalThis.__setRoutes({ 'GET /membresias': () => ({ status: 200, json: [] }) });
    expect(await api.membresias()).toEqual([]);
  });
  it('8. crearMembresia hace POST con body y key', async () => {
    globalThis.__setRoutes({ 'POST /membresias': (body) => ({ status: 200, json: { id: 3, ...body } }) });
    const r = await api.crearMembresia({ alumno_id: 1, plan_id: 2 }, { operationId: 'op-m1' });
    expect(r.id).toBe(3);
    const req = lastReq('POST', '/membresias');
    expect(req.body).toMatchObject({ alumno_id: 1, plan_id: 2 });
    expect(keyOf(req)).toBe('op-m1');
  });
  it('9. actualizarMembresia hace PUT /membresias/{id}', async () => {
    globalThis.__setRoutes({ 'PUT /membresias/3': () => ({ status: 200, json: { id: 3, estado: 'cancelada' } }) });
    const r = await api.actualizarMembresia(3, { estado: 'cancelada' });
    expect(r.estado).toBe('cancelada');
  });
  it('10. error 404 se propaga con status', async () => {
    globalThis.__setRoutes({ 'POST /membresias': () => ({ status: 404, json: { detail: 'Alumno no encontrado' } }) });
    await expect(api.crearMembresia({ alumno_id: 999, plan_id: 1 })).rejects.toMatchObject({ status: 404 });
  });
  it('11. error 503 se propaga con status', async () => {
    globalThis.__setRoutes({ 'POST /membresias': () => ({ status: 503, json: { detail: 'IDEMPOTENCY_UNAVAILABLE' } }) });
    await expect(api.crearMembresia({ alumno_id: 1, plan_id: 1 })).rejects.toMatchObject({ status: 503 });
  });
});

describe('V44-E pagos con membresia_id', () => {
  it('12. crearPago pasa membresia_id en el body', async () => {
    globalThis.__setRoutes({ 'POST /pagos': (body) => ({ status: 200, json: { id: 9 } }) });
    await api.crearPago({ alumno_id: 1, monto: 100, membresia_id: 5 }, { operationId: 'op-pay-1' });
    const req = lastReq('POST', '/pagos');
    expect(req.body).toMatchObject({ membresia_id: 5 });
    expect(keyOf(req)).toBe('op-pay-1');
  });
  it('13. crearPago legacy sin membresia_id intacto', async () => {
    globalThis.__setRoutes({ 'POST /pagos': (body) => ({ status: 200, json: { id: 10 } }) });
    await api.crearPago({ alumno_id: 1, monto: 100 });
    const req = lastReq('POST', '/pagos');
    expect(req.body.membresia_id).toBeUndefined();
    expect(keyOf(req)).toBeUndefined();
  });
});
