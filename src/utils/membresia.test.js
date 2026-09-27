// V44-E: tests de la fuente unica estadoMembresia (funcion pura, sin mocks).
import { describe, it, expect } from 'vitest';
import { estadoMembresia } from './membresia.js';

const HOY = new Date(2026, 8, 26); // 26/09/2026 fijo
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mas = (n) => { const d = new Date(HOY); d.setDate(d.getDate() + n); return iso(d); };
const alum = (id = '1') => ({ id });
const memb = (o = {}) => ({ id: 1, alumno_id: '1', plan_id: 7, fecha_inicio: mas(-10), fecha_vencimiento: mas(20), estado: 'vigente', precio_aplicado: 30000, ...o });
const pago = (date, id = '1') => ({ id, studentId: '1', date, amount: 100 });
const planes = [{ id: 7, nombre: 'Mensual', precio: 30000 }];

describe('V44-E estadoMembresia', () => {
  it('1. vigente con membresia', () => {
    const r = estadoMembresia(alum(), { membresias: [memb()], planes, hoy: HOY });
    expect(r.fuente).toBe('membresia');
    expect(r.estado).toBe('vigente');
    expect(r.dias).toBe(20);
    expect(r.planNombre).toBe('Mensual');
    expect(r.precio).toBe(30000);
  });
  it('2. por vencer (<=5 dias)', () => {
    const r = estadoMembresia(alum(), { membresias: [memb({ fecha_vencimiento: mas(3) })], hoy: HOY });
    expect(r.estado).toBe('por_vencer');
    expect(r.dias).toBe(3);
  });
  it('3. vencida por fecha', () => {
    const r = estadoMembresia(alum(), { membresias: [memb({ fecha_vencimiento: mas(-2) })], hoy: HOY });
    expect(r.estado).toBe('vencida');
    expect(r.dias).toBe(-2);
  });
  it('4. cancelada terminal sin fallback', () => {
    const r = estadoMembresia(alum(), { membresias: [memb({ estado: 'cancelada' })], pagos: [pago(mas(-5))], hoy: HOY });
    expect(r.fuente).toBe('membresia');
    expect(r.estado).toBe('cancelada');
  });
  it('5. legacy sin membresia ni pagos', () => {
    const r = estadoMembresia(alum(), { hoy: HOY });
    expect(r.fuente).toBe('legacy');
    expect(r.estado).toBe('sin_pagos');
    expect(r.vencimiento).toBe('');
  });
  it('6. fallback ultimo pago +30', () => {
    const r = estadoMembresia(alum(), { pagos: [pago(mas(-40)), pago(mas(-10))], hoy: HOY });
    expect(r.fuente).toBe('legacy');
    expect(r.vencimiento).toBe(mas(20));
    expect(r.dias).toBe(20);
  });
  it('7. membresia prevalece sobre fallback', () => {
    const r = estadoMembresia(alum(), { membresias: [memb({ fecha_vencimiento: mas(-1) })], pagos: [pago(mas(-5))], hoy: HOY });
    expect(r.fuente).toBe('membresia');
    expect(r.estado).toBe('vencida');
  });
  it('8. cambio de plan: solo una vigente (la de mayor vencimiento)', () => {
    const vieja = memb({ id: 1, estado: 'cancelada', fecha_vencimiento: mas(-30) });
    const nueva = memb({ id: 2, plan_id: 9, fecha_vencimiento: mas(25), precio_aplicado: 40000 });
    const r = estadoMembresia(alum(), { membresias: [vieja, nueva], planes: [...planes, { id: 9, nombre: 'Plus', precio: 40000 }], hoy: HOY });
    expect(r.estado).toBe('vigente');
    expect(r.planId).toBe(9);
    expect(r.precio).toBe(40000);
  });
  it('9. alumno sin plan continua (legacy)', () => {
    const r = estadoMembresia(alum('99'), { pagos: [{ id: 'x', studentId: '99', date: mas(-50), amount: 10 }], hoy: HOY });
    expect(r.fuente).toBe('legacy');
    expect(r.estado).toBe('vencida');
    expect(r.dias).toBe(-20);
  });
  it('10. forma apta para dashboard (dias + estado)', () => {
    const r = estadoMembresia(alum(), { membresias: [memb({ fecha_vencimiento: mas(2) })], hoy: HOY });
    expect(typeof r.dias).toBe('number');
    expect(['vigente', 'por_vencer', 'vencida', 'cancelada', 'sin_pagos']).toContain(r.estado);
  });
  it('11. forma apta para WhatsApp (vencimiento ISO)', () => {
    const r = estadoMembresia(alum(), { membresias: [memb()], hoy: HOY });
    expect(r.vencimiento).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('12. forma apta para asistencia (dias restantes)', () => {
    const r = estadoMembresia(alum(), { pagos: [pago(mas(-10))], hoy: HOY });
    expect(r.dias).toBe(20);
  });
  it('13. pago con fecha invalida no rompe', () => {
    const r = estadoMembresia(alum(), { pagos: [{ id: 'x', studentId: '1', date: 'no-fecha' }], hoy: HOY });
    expect(r.estado).toBe('sin_pagos');
  });
});
