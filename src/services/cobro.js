// V44-E-09: orquestacion del cobro comercial ALUMNO -> PLAN -> MEMBRESIA -> PAGO.
// Sin UI, sin backend, sin queue: logica pura + llamadas api inyectadas.
// - Un cobro logico = 2 operationIds (uno por endpoint; la unicidad es por
//   (gym,key) y compartir key entre endpoints distintos replayaria mal).
// - Doble submit: guard in-flight por par de keys + guard savingPago en App.
// - Offline: NO encola aqui; devuelve descriptores para que el llamador use
//   queuePush/put (respeta membresiaLocalId -> membresia_id del motor E-05).
// - Errores 4xx/503 de negocio: se propagan (el llamador alerta; sin duplicar).
// - Precio modificado va SOLO al pago; la membresia congela precio del plan
//   en backend (precio_aplicado). Nunca se recalcula un historico.
import { today } from '../utils/helpers.js';

export const METODOS_PAGO = ['Efectivo', 'Transferencia', 'Debito', 'Credito'];

export function planesActivos(planes) {
  return (planes || []).filter((p) => p && p.activo);
}

export function precioSugerido(plan) {
  const v = Number(plan?.precio ?? 0);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

function sumarDias(iso, dias) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + (Number(dias) || 0));
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Periodo preview (display). El backend recalcula autoritativamente al crear;
// por eso el formulario envia fecha_inicio explicita == inicio preview.
export function calcularPeriodo({ em, plan, hoy } = {}) {
  const h = hoy || today();
  const dur = Number(plan?.duracion_dias) > 0 ? Number(plan.duracion_dias) : 30;
  let inicio = h;
  if (em && em.fuente === 'membresia' && em.vencimiento &&
      (em.estado === 'vigente' || em.estado === 'por_vencer') && em.vencimiento >= h) {
    inicio = em.vencimiento;
  }
  return { inicio, vencimiento: sumarDias(inicio, dur) };
}

export function validarCobro({ alumnoId, plan, monto, metodo }) {
  if (alumnoId == null || String(alumnoId).trim() === '') return 'Seleccioná un alumno';
  if (!plan) return 'Seleccioná un plan';
  if (!plan.activo) return 'El plan no está activo';
  if (!(Number(monto) > 0)) return 'Ingresá un monto válido';
  if (!METODOS_PAGO.includes(metodo)) return 'Método inválido';
  if (!(Number(plan.duracion_dias) > 0)) return 'Duración inválida';
  return null;
}

const enCurso = new Set();

export async function procesarCobro(deps, input) {
  // deps: {api:{crearMembresia,crearPago}, isNetworkError}
  // input: {alumnoId, plan, precio, metodo, concepto, fecha, em, opIdMemb, opIdPago}
  const { alumnoId, plan, precio, metodo, concepto, fecha, em, opIdMemb, opIdPago } = input || {};
  const invalido = validarCobro({ alumnoId, plan, monto: precio, metodo });
  if (invalido) throw { code: 'VALIDACION', message: invalido };
  const key = `${opIdMemb}|${opIdPago}`;
  if (enCurso.has(key)) return { status: 'omitido' };
  enCurso.add(key);
  try {
    const periodo = calcularPeriodo({ em, plan });
    const lidM = `memb-${opIdMemb}`;
    const lidP = `pago-${opIdPago}`;
    let membresia, mid;
    try {
      membresia = await deps.api.crearMembresia(
        { alumno_id: alumnoId, plan_id: plan.id, fecha_inicio: periodo.inicio },
        { operationId: opIdMemb });
      mid = membresia && membresia.id;
      if (mid == null) throw { code: 'MEMBRESIA', message: 'Respuesta inválida del servidor' };
    } catch (e) {
      if (e && e.code) throw e;
      if (deps.isNetworkError && deps.isNetworkError(e)) {
        return {
          status: 'offline', fase: 'membresia', periodo, precio: Number(precio),
          queueOps: [
            { type: 'membresia', payload: { alumno_id: alumnoId, plan_id: plan.id, _localId: lidM }, extra: { operationId: opIdMemb } },
            { type: 'pago', payload: { alumno_id: alumnoId, monto: Number(precio), concepto, metodo, _localId: lidP, membresiaLocalId: lidM }, extra: { fecha, operationId: opIdPago } },
          ],
          local: {
            membresia: { id: lidM, alumno_id: alumnoId, plan_id: plan.id, fecha_inicio: periodo.inicio, fecha_vencimiento: periodo.vencimiento, estado: 'vigente', precio_aplicado: Number(precio) },
            pago: { id: lidP, _localId: lidP, alumno_id: alumnoId, monto: Number(precio), concepto, metodo, fecha, membresiaLocalId: lidM },
          },
        };
      }
      throw { code: 'MEMBRESIA', status: e && e.status, message: (e && e.message) || 'Error al crear membresía' };
    }
    try {
      const pago = await deps.api.crearPago(
        { alumno_id: alumnoId, monto: Number(precio), concepto, metodo, membresia_id: mid },
        { operationId: opIdPago });
      return { status: 'ok', mid, membresia, pago, periodo, precio: Number(precio) };
    } catch (e) {
      if (e && e.code) throw e;
      if (deps.isNetworkError && deps.isNetworkError(e)) {
        return {
          status: 'pago-offline', mid, membresia, periodo, precio: Number(precio),
          queueOps: [
            { type: 'pago', payload: { alumno_id: alumnoId, monto: Number(precio), concepto, metodo, _localId: lidP, membresia_id: mid }, extra: { fecha, operationId: opIdPago } },
          ],
          local: {
            pago: { id: lidP, _localId: lidP, alumno_id: alumnoId, monto: Number(precio), concepto, metodo, fecha, membresia_id: mid },
          },
        };
      }
      // Patron existente (linea 266 legacy): ante 4xx/503 del pago, fallback
      // local sin encolar ni duplicar.
      return {
        status: 'pago-local', mid, membresia, periodo, precio: Number(precio),
        error: (e && e.message) || 'Error al registrar pago',
        local: {
          pago: { id: lidP, _localId: lidP, alumno_id: alumnoId, monto: Number(precio), concepto, metodo, fecha },
        },
      };
    }
  } finally {
    enCurso.delete(key);
  }
}
