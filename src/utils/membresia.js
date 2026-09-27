// V44-E: FUENTE UNICA de estado/vencimiento de membresia comercial.
// Prioridad: membresia canonica > fallback legacy (ultimo pago + 30 dias).
// NO inventa datos: sin membresia ni pagos devuelve 'sin_pagos'.
// Formas aceptadas: membresias en shape backend/IDB (snake_case), pagos en
// shape App (studentId/date) o backend (alumno_id/fecha).
import { parseFecha } from './helpers.js';

const POR_VENCER_DIAS = 5;
const LEGACY_DIAS = 30;

function medianoche(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function pagoFecha(p) {
  return parseFecha(p.date ?? p.fecha ?? '');
}

function pagoAlumno(p) {
  const v = p.studentId ?? p.alumno_id ?? p.student_id ?? '';
  return String(v ?? '');
}

function ultimoPago(pagos, alumnoId) {
  const rows = (pagos || []).filter((p) => pagoAlumno(p) === String(alumnoId));
  rows.sort((a, b) => (pagoFecha(b) || new Date(0)) - (pagoFecha(a) || new Date(0)));
  return rows[0] || null;
}

function planDe(membresia, planes) {
  if (!membresia || membresia.plan_id == null) return null;
  return (planes || []).find((pl) => String(pl.id) === String(membresia.plan_id)) || null;
}

// Estado canonico de un alumno. Devuelve:
// {fuente:'membresia'|'legacy', estado, vencimiento (ISO '' si no hay),
//  dias (int|null), inicio, planNombre, precio, membresia}
export function estadoMembresia(alumno, { pagos = [], membresias = [], planes = [], hoy = new Date() } = {}) {
  const aid = String(alumno?.id ?? '');
  const base = medianoche(hoy).getTime();
  const mrows = (membresias || []).filter((m) => String(m.alumno_id ?? '') === aid);
  const vigentes = mrows.filter((m) => m.estado === 'vigente');
  const pick = vigentes.length
    ? vigentes.slice().sort((a, b) => String(b.fecha_vencimiento || '') > String(a.fecha_vencimiento || '') ? 1 : -1)[0]
    : null;
  if (pick) {
    const plan = planDe(pick, planes);
    const v = parseFecha(pick.fecha_vencimiento || '');
    const dias = v ? Math.ceil((medianoche(v).getTime() - base) / 86400000) : null;
    const estado = dias == null ? 'vigente' : dias < 0 ? 'vencida' : dias <= POR_VENCER_DIAS ? 'por_vencer' : 'vigente';
    return {
      fuente: 'membresia', estado,
      vencimiento: pick.fecha_vencimiento || '', dias,
      inicio: pick.fecha_inicio || '',
      planNombre: plan?.nombre || '', planId: pick.plan_id ?? null,
      precio: pick.precio_aplicado ?? plan?.precio ?? null,
      membresia: pick,
    };
  }
  // Sin vigente: la ultima membresia manda (cancelada terminal, o vencida con
  // su propio vencimiento). Solo sin filas se usa el fallback legacy.
  if (mrows.length) {
    const last = mrows.slice().sort((a, b) => String(b.fecha_vencimiento || '') > String(a.fecha_vencimiento || '') ? 1 : -1)[0];
    const plan = planDe(last, planes);
    if (last.estado === 'cancelada') {
      return {
        fuente: 'membresia', estado: 'cancelada',
        vencimiento: last.fecha_vencimiento || '', dias: null,
        inicio: last.fecha_inicio || '',
        planNombre: plan?.nombre || '', planId: last.plan_id ?? null,
        precio: last.precio_aplicado ?? plan?.precio ?? null,
        membresia: last,
      };
    }
    const v = parseFecha(last.fecha_vencimiento || '');
    const dias = v ? Math.ceil((medianoche(v).getTime() - base) / 86400000) : null;
    return {
      fuente: 'membresia', estado: 'vencida',
      vencimiento: last.fecha_vencimiento || '', dias,
      inicio: last.fecha_inicio || '',
      planNombre: plan?.nombre || '', planId: last.plan_id ?? null,
      precio: last.precio_aplicado ?? plan?.precio ?? null,
      membresia: last,
    };
  }
  const last = ultimoPago(pagos, aid);
  if (!last) {
    return { fuente: 'legacy', estado: 'sin_pagos', vencimiento: '', dias: null, inicio: '', planNombre: '', planId: null, precio: null, membresia: null };
  }
  const pd = pagoFecha(last);
  if (!pd) {
    return { fuente: 'legacy', estado: 'sin_pagos', vencimiento: '', dias: null, inicio: '', planNombre: '', planId: null, precio: null, membresia: null };
  }
  const venc = new Date(pd);
  venc.setDate(venc.getDate() + LEGACY_DIAS);
  const dias = Math.ceil((medianoche(venc).getTime() - base) / 86400000);
  const iso = `${venc.getFullYear()}-${String(venc.getMonth() + 1).padStart(2, '0')}-${String(venc.getDate()).padStart(2, '0')}`;
  const estado = dias < 0 ? 'vencida' : dias <= POR_VENCER_DIAS ? 'por_vencer' : 'vigente';
  return { fuente: 'legacy', estado, vencimiento: iso, dias, inicio: '', planNombre: '', planId: null, precio: null, membresia: null };
}
