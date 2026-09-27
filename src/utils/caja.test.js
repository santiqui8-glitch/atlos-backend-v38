// V44-G: calculos puros de caja (misma fuente que la tabla).
import { describe, it, expect } from 'vitest';
import { resumenCaja, efectivoCaja, filtrarMovimientos, esHoy } from './caja.js';

const M = (o = {}) => ({ id: '1', tipo: 'ingreso', categoria: 'Membresía', concepto: 'Cuota', monto: 100, metodo: 'Efectivo', fecha: '2026-01-10', ...o });

describe('V44-G caja pura', () => {
  it('1. resumen ingresos/egresos/saldo', () => {
    const r = resumenCaja([M({ monto: 100 }), M({ tipo: 'egreso', monto: 40 })]);
    expect(r).toMatchObject({ ingresos: 100, egresos: 40, saldo: 60 });
  });
  it('2. ignora tipos desconocidos', () => {
    expect(resumenCaja([M({ tipo: 'raro', monto: 999 })])).toMatchObject({ ingresos: 0, egresos: 0, saldo: 0 });
  });
  it('3. efectivo neto solo Efectivo', () => {
    expect(efectivoCaja([M({ monto: 100 }), M({ monto: 50, metodo: 'Transferencia' }), M({ tipo: 'egreso', monto: 30 })])).toBe(70);
  });
  it('4. filtro por rango de fecha', () => {
    const rows = [M({ fecha: '2026-01-10' }), M({ fecha: '2026-02-10' })];
    expect(filtrarMovimientos(rows, { desde: '2026-02-01', hasta: '2026-02-28' }).length).toBe(1);
  });
  it('5. filtro tipo/categoria/metodo', () => {
    const rows = [M({}), M({ tipo: 'egreso', categoria: 'Alquiler' })];
    expect(filtrarMovimientos(rows, { tipo: 'egreso' }).length).toBe(1);
    expect(filtrarMovimientos(rows, { categoria: 'Alquiler' }).length).toBe(1);
    expect(filtrarMovimientos(rows, { metodo: 'Debito' }).length).toBe(0);
  });
  it('6. busqueda por texto', () => {
    const rows = [M({ concepto: 'Alquiler local' }), M({ concepto: 'Cuota' })];
    expect(filtrarMovimientos(rows, { q: 'alquiler' }).length).toBe(1);
  });
  it('7. esHoy', () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    expect(esHoy(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`)).toBe(true);
    expect(esHoy('2000-01-01')).toBe(false);
  });
});
