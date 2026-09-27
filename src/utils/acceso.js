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
