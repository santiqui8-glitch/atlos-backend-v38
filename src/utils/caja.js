// V44-G: calculos puros de caja sobre movimientos ya cargados (misma fuente
// que lista la tabla, por lo que los totales siempre coinciden con lo visto).
// Formas aceptadas: filas backend/IDB (tipo/categoria/monto/metodo/fecha).
export const TIPOS = ['ingreso', 'egreso'];

export function resumenCaja(movs) {
  let ingresos = 0, egresos = 0;
  const porMetodo = {};
  for (const m of movs || []) {
    const v = Number(m?.monto) || 0;
    if (m?.tipo === 'ingreso') ingresos += v;
    else if (m?.tipo === 'egreso') egresos += v;
    else continue;
    const k = m.metodo || 'Efectivo';
    porMetodo[k] = (porMetodo[k] || 0) + v;
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  return { ingresos: r2(ingresos), egresos: r2(egresos), saldo: r2(ingresos - egresos), porMetodo };
}

export function efectivoCaja(movs) {
  let t = 0;
  for (const m of movs || []) {
    if (m?.tipo === 'ingreso' && (m.metodo || 'Efectivo') === 'Efectivo') t += Number(m.monto) || 0;
    if (m?.tipo === 'egreso' && (m.metodo || 'Efectivo') === 'Efectivo') t -= Number(m.monto) || 0;
  }
  return Math.round(t * 100) / 100;
}

export function filtrarMovimientos(movs, { desde = '', hasta = '', tipo = '', categoria = '', metodo = '', q = '' } = {}) {
  const needle = String(q || '').trim().toLowerCase();
  return (movs || []).filter((m) => {
    const f = String(m?.fecha || '').slice(0, 10);
    if (desde && f < desde) return false;
    if (hasta && f > hasta) return false;
    if (tipo && m?.tipo !== tipo) return false;
    if (categoria && (m?.categoria || '') !== categoria) return false;
    if (metodo && (m?.metodo || 'Efectivo') !== metodo) return false;
    if (needle) {
      const hay = `${m?.concepto || ''} ${m?.categoria || ''} ${m?.observaciones || ''}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

export function esHoy(iso) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return iso === `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
