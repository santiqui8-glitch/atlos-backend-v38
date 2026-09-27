// V44-H: prevalidacion local de acceso (pura; el backend es autoridad).
import { describe, it, expect } from 'vitest';
import { buscarAlumnoAcceso, prevalidarAcceso } from './acceso.js';

const HOY = new Date(2026, 8, 26);
const A = (o = {}) => ({ id: '1', name: 'Juan', dni: '123', phone: '555', ...o });
const M = (o = {}) => ({ id: 1, alumno_id: '1', plan_id: 7, fecha_inicio: '2026-09-01', fecha_vencimiento: '2026-10-01', estado: 'vigente', precio_aplicado: 100, ...o });

describe('V44-H acceso local', () => {
  it('1. buscar por dni exacto', () => {
    expect(buscarAlumnoAcceso([A()], '123')?.id).toBe('1');
  });
  it('2. buscar por nombre parcial', () => {
    expect(buscarAlumnoAcceso([A()], 'jua')?.id).toBe('1');
  });
  it('3. sin texto no matchea', () => {
    expect(buscarAlumnoAcceso([A()], '')).toBeNull();
  });
  it('4. vigente => permitido', () => {
    const r = prevalidarAcceso(A(), { membresias: [M()], hoy: HOY });
    expect(r).toMatchObject({ permitido: true, motivo: '' });
  });
  it('5. vencida => rechazado con motivo', () => {
    const r = prevalidarAcceso(A(), { membresias: [M({ fecha_vencimiento: '2026-09-01' })], hoy: HOY });
    expect(r).toMatchObject({ permitido: false, motivo: 'membresia-vencida' });
  });
  it('6. cancelada => rechazado', () => {
    const r = prevalidarAcceso(A(), { membresias: [M({ estado: 'cancelada' })], hoy: HOY });
    expect(r).toMatchObject({ permitido: false, motivo: 'membresia-cancelada' });
  });
  it('7. sin alumno online => alumno-no-encontrado', () => {
    expect(prevalidarAcceso(null, {})).toMatchObject({ permitido: false, motivo: 'alumno-no-encontrado' });
  });
  it('8. offline sin identificar => no-identificado (nunca permitido a ciegas)', () => {
    expect(prevalidarAcceso(null, { online: false }).motivo).toBe('no-identificado');
  });
  it('9. offline con datos locales => provisional', () => {
    const r = prevalidarAcceso(A(), { membresias: [M()], online: false, hoy: HOY });
    expect(r.permitido).toBe(true);
  });
});
