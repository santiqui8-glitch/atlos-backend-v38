// V44-E-09: flujo comercial membresia -> pago (api inyectada, sin red).
import { describe, it, expect } from 'vitest';
import { calcularPeriodo, procesarCobro, precioSugerido, planesActivos } from './cobro.js';
import { today } from '../utils/helpers.js';

const PLAN = { id: 7, nombre: 'Mensual', precio: 30000, duracion_dias: 30, dias_semana: 5, activo: 1 };
const HOY = today(); // fecha real: los calculos usan hoy del sistema, no fecha fija
const _p2 = (n) => String(n).padStart(2, '0');
const _iso = (d) => `${d.getFullYear()}-${_p2(d.getMonth() + 1)}-${_p2(d.getDate())}`;
const _parseLocal = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const mas = (n) => { const d = _parseLocal(HOY); d.setDate(d.getDate() + n); return _iso(d); };
const net = (e) => /NET_FAIL/.test(String((e && e.message) || e || ''));
const err = (status, message) => Object.assign(new Error(message), { status });
const okDeps = (calls) => ({
  isNetworkError: net,
  api: {
    crearMembresia: async (body, opts) => { calls.push(['membresia', body, opts]); return { id: 55, ...body }; },
    crearPago: async (body, opts) => { calls.push(['pago', body, opts]); return { id: 77 }; },
  },
});
const base = { alumnoId: 1, plan: PLAN, precio: 30000, metodo: 'Efectivo', concepto: 'Cuota Mensual', fecha: HOY, em: null, opIdMemb: 'm1', opIdPago: 'p1' };

describe('V44-E-09 cobro comercial', () => {
  it('1. sin alumno -> VALIDACION', async () => {
    await expect(procesarCobro(okDeps([]), { ...base, alumnoId: '' })).rejects.toMatchObject({ code: 'VALIDACION' });
  });
  it('2. plan inactivo -> VALIDACION', async () => {
    await expect(procesarCobro(okDeps([]), { ...base, plan: { ...PLAN, activo: 0 } })).rejects.toMatchObject({ code: 'VALIDACION' });
  });
  it('3. precio inicial desde plan', () => {
    expect(precioSugerido(PLAN)).toBe(30000);
    expect(planesActivos([PLAN, { ...PLAN, id: 8, activo: 0 }]).length).toBe(1);
  });
  it('4. precio modificado va al pago', async () => {
    const calls = [];
    await procesarCobro(okDeps(calls), { ...base, precio: 25000, opIdMemb: 'm4', opIdPago: 'p4' });
    expect(calls[1][1].monto).toBe(25000);
  });
  it('5. vigente: inicio = vencimiento actual', () => {
    const em = { fuente: 'membresia', estado: 'vigente', vencimiento: '2026-10-20' };
    expect(calcularPeriodo({ em, plan: PLAN, hoy: HOY })).toEqual({ inicio: '2026-10-20', vencimiento: '2026-11-19' });
  });
  it('6. vencida: inicio = hoy', () => {
    const em = { fuente: 'membresia', estado: 'vencida', vencimiento: '2026-09-01' };
    expect(calcularPeriodo({ em, plan: PLAN, hoy: HOY })).toEqual({ inicio: HOY, vencimiento: mas(30) });
  });
  it('7. legacy: inicio = hoy', () => {
    const em = { fuente: 'legacy', estado: 'sin_pagos', vencimiento: '' };
    expect(calcularPeriodo({ em, plan: PLAN, hoy: HOY })).toEqual({ inicio: HOY, vencimiento: mas(30) });
  });
  it('8. cambio de plan usa plan nuevo', async () => {
    const calls = [];
    const planB = { ...PLAN, id: 9, nombre: 'Plus' };
    await procesarCobro(okDeps(calls), { ...base, plan: planB, opIdMemb: 'm8', opIdPago: 'p8' });
    expect(calls[0][1]).toMatchObject({ alumno_id: 1, plan_id: 9 });
  });
  it('9. payload membresia exacto', async () => {
    const calls = [];
    await procesarCobro(okDeps(calls), { ...base, opIdMemb: 'm9', opIdPago: 'p9' });
    expect(calls[0]).toEqual(['membresia', { alumno_id: 1, plan_id: 7, fecha_inicio: HOY }, { operationId: 'm9' }]);
  });
  it('10. payload pago con membresia_id real', async () => {
    const calls = [];
    const r = await procesarCobro(okDeps(calls), { ...base, opIdMemb: 'm10', opIdPago: 'p10' });
    expect(r.status).toBe('ok');
    expect(r.mid).toBe(55);
    expect(calls[1][1]).toMatchObject({ alumno_id: 1, monto: 30000, concepto: 'Cuota Mensual', metodo: 'Efectivo', membresia_id: 55 });
    expect(calls[1][2]).toEqual({ operationId: 'p10' });
  });
  it('11. online: orden membresia -> pago, una vez cada uno', async () => {
    const calls = [];
    await procesarCobro(okDeps(calls), { ...base, opIdMemb: 'm11', opIdPago: 'p11' });
    expect(calls.map((c) => c[0])).toEqual(['membresia', 'pago']);
  });
  it('12. offline: membresia+pago vinculados por membresiaLocalId', async () => {
    const calls = [];
    const deps = { isNetworkError: net, api: { crearMembresia: async () => { throw new Error('NET_FAIL'); }, crearPago: async (b) => { calls.push(b); return { id: 1 }; } } };
    const r = await procesarCobro(deps, { ...base, opIdMemb: 'm12', opIdPago: 'p12' });
    expect(r.status).toBe('offline');
    expect(r.queueOps.length).toBe(2);
    expect(r.queueOps[1].payload.membresiaLocalId).toBe(r.queueOps[0].payload._localId);
    expect(r.local.membresia.estado).toBe('vigente');
    expect(calls.length).toBe(0);
  });
  it('13. doble click concurrente: segundo omitido', async () => {
    let n = 0;
    const deps = { isNetworkError: net, api: { crearMembresia: async (b) => { n++; await new Promise((r) => setTimeout(r, 10)); return { id: 1 }; }, crearPago: async () => ({ id: 2 }) } };
    const inp = { ...base, opIdMemb: 'm13', opIdPago: 'p13' };
    const [r1, r2] = await Promise.all([procesarCobro(deps, inp), procesarCobro(deps, inp)]);
    expect([r1.status, r2.status].sort()).toEqual(['ok', 'omitido']);
    expect(n).toBe(1);
  });
  it('14. 409 en membresia: throw, pago no llamado', async () => {
    let pagoLlamado = false;
    const deps = { isNetworkError: net, api: { crearMembresia: async () => { throw err(409, 'ALREADY'); }, crearPago: async () => { pagoLlamado = true; return {}; } } };
    await expect(procesarCobro(deps, { ...base, opIdMemb: 'm14', opIdPago: 'p14' })).rejects.toMatchObject({ code: 'MEMBRESIA', status: 409 });
    expect(pagoLlamado).toBe(false);
  });
  it('15. 404 en membresia: throw sin encolar', async () => {
    const deps = { isNetworkError: net, api: { crearMembresia: async () => { throw err(404, 'Plan no encontrado'); }, crearPago: async () => ({}) } };
    const r = await procesarCobro(deps, { ...base, opIdMemb: 'm15', opIdPago: 'p15' }).catch((e) => e);
    expect(r.code).toBe('MEMBRESIA');
    expect(r.queueOps).toBeUndefined();
  });
  it('16. 503 en pago: fallback local, no queue', async () => {
    const deps = { isNetworkError: net, api: { crearMembresia: async () => ({ id: 5 }), crearPago: async () => { throw err(503, 'IDEMPOTENCY_UNAVAILABLE'); } } };
    const r = await procesarCobro(deps, { ...base, opIdMemb: 'm16', opIdPago: 'p16' });
    expect(r.status).toBe('pago-local');
    expect(r.queueOps).toBeUndefined();
    expect(r.local.pago.monto).toBe(30000);
  });
  it('17. sin plan -> VALIDACION (legacy va por via anterior)', async () => {
    await expect(procesarCobro(okDeps([]), { ...base, plan: null })).rejects.toMatchObject({ code: 'VALIDACION' });
  });
  it('18. payloads sin tocar historicos', async () => {
    const calls = [];
    await procesarCobro(okDeps(calls), { ...base, opIdMemb: 'm18', opIdPago: 'p18' });
    expect(Object.keys(calls[0][1]).sort()).toEqual(['alumno_id', 'fecha_inicio', 'plan_id']);
    expect(Object.keys(calls[1][1]).sort()).toEqual(['alumno_id', 'concepto', 'membresia_id', 'metodo', 'monto']);
  });
  it('19. precio congelado: membresia no lleva precio', async () => {
    const calls = [];
    await procesarCobro(okDeps(calls), { ...base, precio: 99999, opIdMemb: 'm19', opIdPago: 'p19' });
    expect('precio' in calls[0][1]).toBe(false);
    expect('precio_aplicado' in calls[0][1]).toBe(false);
    expect(calls[1][1].monto).toBe(99999);
  });
  it('20. resultado trae lo necesario para refresh', async () => {
    const r = await procesarCobro(okDeps([]), { ...base, opIdMemb: 'm20', opIdPago: 'p20' });
    expect(r.mid).toBe(55);
    expect(r.membresia).toBeTruthy();
    expect(r.pago).toBeTruthy();
    expect(r.periodo.inicio).toBe(HOY);
  });
});
