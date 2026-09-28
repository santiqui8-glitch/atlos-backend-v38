// V44-H: prevalidacion LOCAL de acceso (solo display/provisional; el backend
// es autoridad). Reutiliza estadoMembresia(): NO duplica la regla.
// Devuelve {permitido, motivo} donde motivo es '' si permitido, o uno de:
// 'alumno-no-encontrado' | 'membresia-vencida' | 'sin-pagos' |
// 'membresia-cancelada' | 'no-identificado'.
// Offline: sin alumno identificado -> rechazado 'no-identificado' (nunca se
// muestra permitido sin informacion suficiente).
import { estadoMembresia } from './membresia.js';

export function buscarAlumnoAcceso(students, texto) {
  const q = String(texto || '').trim().toLowerCase();
  if (!q) return null;
  return (students || []).find((s) =>
    String(s.dni || '') === String(texto || '').trim() ||
    String(s.phone || '') === String(texto || '').trim() ||
    String(s.name || '').toLowerCase().includes(q)) || null;
}

export function prevalidarAcceso(alumno, { pagos = [], membresias = [], planes = [], online = true, hoy } = {}) {
  if (!alumno) {
    return online
      ? { permitido: false, motivo: 'alumno-no-encontrado' }
      : { permitido: false, motivo: 'no-identificado' };
  }
  const em = estadoMembresia(alumno, { pagos, membresias, planes, ...(hoy ? { hoy } : {}) });
  if (em.estado === 'vigente' || em.estado === 'por_vencer') {
    return { permitido: true, motivo: '', em };
  }
  const motivo = em.estado === 'cancelada' ? 'membresia-cancelada'
    : em.estado === 'sin_pagos' ? 'sin-pagos' : 'membresia-vencida';
  return { permitido: false, motivo, em };
}

// V44-J: resumen operativo de accesos de un dia (misma fuente que la tabla).
// "Dentro": ultimo evento del alumno = entrada permitida sin salida posterior.
export function resumenAccesos(rows) {
  let entradas = 0, salidas = 0, rechazados = 0;
  let ultimo = null;
  const porAlumno = new Map();
  for (const r of rows || []) {
    if (r?.tipo === 'entrada' && r?.resultado === 'permitido') entradas++;
    else if (r?.tipo === 'salida' && r?.resultado === 'permitido') salidas++;
    if (r?.resultado === 'rechazado') rechazados++;
    const k = r?.alumno_id != null ? String(r.alumno_id) : null;
    if (k) {
      const prev = porAlumno.get(k);
      const t = `${r?.fecha || ''} ${r?.hora || ''} #${r?.id ?? ''}`;
      if (!prev || t >= prev.t) porAlumno.set(k, { t, r });
    }
    const rt = `${r?.fecha || ''} ${r?.hora || ''} #${r?.id ?? ''}`;
    if (!ultimo || rt >= ultimo.t) ultimo = { t: rt, r };
  }
  const dentro = [];
  for (const [, v] of porAlumno) {
    if (v.r?.tipo === 'entrada' && v.r?.resultado === 'permitido') dentro.push(v.r);
  }
  return { entradas, salidas, rechazados, ultimo: ultimo ? ultimo.r : null, dentro };
}

export const MOTIVOS_ACCESO = {
  '': '',
  'alumno-no-encontrado': 'Alumno no encontrado',
  'membresia-vencida': 'Membresía vencida',
  'sin-pagos': 'Sin pagos registrados',
  'membresia-cancelada': 'Membresía cancelada',
  'sin-entrada-abierta': 'Sin entrada abierta hoy',
  'sesion-activa': 'Sesión ya abierta',
  'no-identificado': 'Sin conexión: alumno no identificado',
};
