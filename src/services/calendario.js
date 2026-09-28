// V44-J: calendario operativo de la semana visible para la terminal/portal.
// R1: diasSemana se entrega como objetos {fechaISO, esHoy, fecha, total}
// (la versión previa devolvía strings ISO y rompía el render de la grilla).
// R5: NO exporta resumenAccesos: el resumen de accesos del día vive en
// utils/acceso.js (una sola definición, evita dos shapes distintos).
// Clases: {id, nombre, dia_mes, dia, hora_inicio, hora_fin, capacidad, profesor, inscriptos}
import { useMemo } from 'react';

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DIAS_CORTO = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_NOMBRE = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Fecha local YYYY-MM-DD (sin UTC para no correr por zonas horarias).
function localISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- utilidades puras ----------

// dia_mes (1-31) → objeto de semana. El día real depende del mes; se usa enero
// 2026 (31 días) como mes de referencia estable para mapear día→semana.
export function diaDeLaSemana(dia_mes) {
  if (dia_mes == null || dia_mes < 1 || dia_mes > 31) return null;
  const ref = new Date(2026, 0, Number(dia_mes));
  return {
    nombre: DIAS_SEMANA[ref.getDay()],
    corto: DIAS_CORTO[ref.getDay()],
    indice: ref.getDay(),
  };
}

// Día de la semana en convención de grilla: 0=lunes..6=domingo.
// Acepta dia_mes (1-31) o dia (nombre en español). -1 si no se puede mapear.
function diaDeLaSemanaFromClass(c) {
  if (c && c.dia_mes != null) {
    const d = new Date(2026, 0, Number(c.dia_mes));
    return (d.getDay() + 6) % 7;
  }
  const dd = String((c && c.dia) || '').toLowerCase();
  const i = DIAS_NOMBRE.indexOf(dd); // DIAS_NOMBRE está en orden getDay (domingo=0)
  return i >= 0 ? (i + 6) % 7 : -1;  // se convierte a lunes=0, igual que dia_mes
}

// True si fechaISO cae en la semana (lun–dom) que contiene a semanaISO.
export function estaEnSemana(fechaISO, semanaISO) {
  const f = new Date(fechaISO);
  const s = new Date(semanaISO);
  if (isNaN(f) || isNaN(s)) return false;
  const dow = (s.getDay() + 6) % 7;
  s.setDate(s.getDate() - dow);
  const lunes = localISO(s);
  s.setDate(s.getDate() + 6);
  const domingo = localISO(s);
  const fISO = localISO(f);
  return fISO >= lunes && fISO <= domingo;
}

// True si fechaISO cae en el mismo mes/año que mesISO.
export function estaEnMes(fechaISO, mesISO) {
  const f = new Date(fechaISO);
  const m = new Date(mesISO);
  return !isNaN(f) && !isNaN(m) && f.getFullYear() === m.getFullYear() && f.getMonth() === m.getMonth();
}

export function formatFechaLarga(fechaISO) {
  const d = new Date(fechaISO);
  if (isNaN(d)) return '';
  return `${DIAS_SEMANA[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

export function formatHora(hora) {
  if (hora == null || hora === '') return '—';
  const m = String(hora).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return String(hora);
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

// Semana visible: 7 días desde el lunes de la semana del cursor (o de hoy).
// Devuelve [{fechaISO, esHoy, fecha, total}] — total = clases de ese día según
// la convención dia_mes/dia (idéntica a diaDeLaSemanaFromClass).
export function calendarioSemana({ hoy = new Date(), clases = [], semanaCursor = null } = {}) {
  const base = semanaCursor ? new Date(semanaCursor) : new Date(hoy);
  if (isNaN(base)) return [];
  const dow = (base.getDay() + 6) % 7;
  base.setDate(base.getDate() - dow);
  const hISO = localISO(new Date(hoy));
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    const fechaISO = localISO(d);
    const dowIdx = (d.getDay() + 6) % 7;
    dias.push({
      fechaISO,
      esHoy: fechaISO === hISO,
      // dowIdx usa lunes=0; DIAS_CORTO está indexado por getDay() (domingo=0).
      fecha: `${DIAS_CORTO[(dowIdx + 1) % 7]} ${d.getDate()}`,
      total: (clases || []).reduce((n, c) => n + (diaDeLaSemanaFromClass(c) === dowIdx ? 1 : 0), 0),
    });
  }
  return dias;
}

// ---------- hook ----------

export function useCalendario({ clases = [], semanaCursor = null } = {}) {
  return useMemo(() => {
    const hoy = new Date();
    return {
      hoy: localISO(hoy),
      diasSemana: calendarioSemana({ clases, semanaCursor }),
    };
  }, [clases, semanaCursor]);
}