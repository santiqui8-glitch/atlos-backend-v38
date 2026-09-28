// V44-H: terminal de acceso (recepcion). Valida con estadoMembresia() local
// para feedback inmediato; el backend es autoridad. Offline: solo se muestra
// permitido con datos locales suficientes; si no, rechazado 'no-identificado'.
// Cola tipos acceso-entrada/acceso-salida (E-05: mismo motor, sin segunda cola).
import { useState, useEffect, useRef, useMemo } from 'react'
import { api, queuePush, esErrorDeRed, newOperationId } from '../services/api'
import { list } from '../services/db'
import { useCalendario } from '../services/calendario.js'
import useClock from '../hooks/useClock.js'
import { today, toDisplay, onEnterNext } from '../utils/helpers.js'
import { estadoMembresia } from '../utils/membresia.js'
import { toCSV, descargarCSV } from '../utils/export.js'
import { buscarAlumnoAcceso, prevalidarAcceso, resumenAccesos, MOTIVOS_ACCESO } from '../utils/acceso.js'
import { Empty, PanelTitle } from '../components/ui.jsx'


export default function VistaAcceso({ students, payments = [], membresias = [], planes = [], clases = [] }) {
  const now = useClock()
  const [modo, setModo] = useState('entrada')
  const [texto, setTexto] = useState('')
  const [res, setRes] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [hist, setHist] = useState([])
  const [fRes, setFRes] = useState('')
  const [fTipo, setFTipo] = useState('')
  const [fQ, setFQ] = useState('')
  const inputRef = useRef(null)

  // V44-J: calendario del día actual (grilla semanal) + resumen operativo de
  // accesos REALES del historial (R2: no se usa asistencias:[] — los contadores
  // salen de las filas que la tabla ya muestr)
  const { diasSemana } = useCalendario({ clases });
  const resumen = useMemo(() => resumenAccesos(hist), [hist]);

  const fetchHist = async () => {
    try {
      const rows = await api.accesos(`desde=${today()}&hasta=${today()}`);
      if (Array.isArray(rows)) { setHist(rows); return }
    } catch {}
    try { setHist(await list('accesos')) } catch {}
  };
  useEffect(() => { fetchHist() }, []);
  const enfocar = () => { try { inputRef.current && inputRef.current.focus() } catch {} };

  const resolver = () => {
    const alum = buscarAlumnoAcceso(students, texto);
    return { alum, prev: prevalidarAcceso(alum, { pagos: payments, membresias, planes, online: navigator.onLine }) };
  };

  const operar = async (tipoOp) => {
    const t = (tipoOp || modo).trim();
    if (cargando) return;
    const { alum, prev } = resolver();
    setCargando(true);
    try {
      const body = alum ? { alumno_id: /^\d+$/.test(String(alum.id)) ? Number(alum.id) : alum.id, tipo: t, metodo: 'manual' }
        : { dni: texto.trim(), tipo: t, metodo: 'manual' };
      const opId = newOperationId();
      const fn = t === 'salida' ? api.accesoSalida : api.accesoEntrada;
      try {
        const r = await fn(body, { operationId: opId });
        setRes({ ...r, pendiente: false, alum: alum || null });
      } catch (e) {
        console.warn('acceso api fallo', e.message);
        if (esErrorDeRed(e)) {
          queuePush(t === 'salida' ? 'acceso-salida' : 'acceso-entrada', { ...body, _localId: 'acc-' + Date.now() }, { operationId: opId });
          setRes({ resultado: prev.permitido ? 'permitido' : 'rechazado', motivo: prev.motivo, pendiente: true, alum: alum || null, offline: true,
            em: alum ? estadoMembresia(alum, { pagos: payments, membresias, planes }) : null });
        } else return alert('No se pudo registrar: ' + e.message);
      }
    } finally {
      setCargando(false);
      setTexto('');
      fetchHist();
      setTimeout(enfocar, 50);
    }
  };

  const filtrados = hist.filter((h) => {
    if (fRes && h.resultado !== fRes) return false;
    if (fTipo && h.tipo !== fTipo) return false;
    if (fQ && !`${h.alumno_nombre || ''} ${h.identificador || ''} ${h.motivo || ''}`.toLowerCase().includes(fQ.trim().toLowerCase())) return false;
    return true;
  });
  const ok = res && res.resultado === 'permitido';
  const emRes = res && res.alum ? estadoMembresia(res.alum, { pagos: payments, membresias, planes }) : null;

  return <section className="panel">
    <div className="page-head">
      <div><h2>Acceso</h2><p>Control de entradas y salidas · {toDisplay(today())}</p></div>
      <div className="page-actions"><span className="muted-text" style={{ fontVariantNumeric: 'tabular-nums' }}>{now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span></div>
    </div>
    <div className="tabs" role="tablist" aria-label="Tipo de acceso">
      <button role="tab" aria-selected={modo === 'entrada'} className={modo === 'entrada' ? 'tab active' : 'tab'} onClick={() => setModo('entrada')}>Entrada</button>
      <button role="tab" aria-selected={modo === 'salida'} className={modo === 'salida' ? 'tab active' : 'tab'} onClick={() => setModo('salida')}>Salida</button>
    </div>
    <form onSubmit={(e) => { e.preventDefault(); operar() }} onKeyDown={onEnterNext} style={{ display: 'grid', gap: 10, marginTop: 12 }}>
      <div className="search-wrap"><input ref={inputRef} autoFocus className="field-search" style={{ height: 52, fontSize: 16 }} aria-label="Buscar alumno por nombre o DNI" placeholder="🔎 Nombre, apellido o DNI..." value={texto} onChange={e => setTexto(e.target.value)} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <button type="button" className="primary" style={{ minHeight: 52 }} disabled={cargando} onClick={() => operar('entrada')}>✓ Entrada</button>
        <button type="button" className="ghost" style={{ minHeight: 52 }} disabled={cargando} onClick={() => operar('salida')}> Salida</button>
      </div>
    </form>
    {res && <div role="status" aria-live="polite" style={{ marginTop: 12, borderRadius: 12, padding: 16, textAlign: 'center', border: `2px solid ${ok ? 'var(--success)' : 'var(--danger)'}`, background: ok ? 'rgba(31,168,92,.08)' : 'rgba(229,72,77,.08)' }}>
      <div style={{ fontSize: 30, fontWeight: 900, color: ok ? 'var(--success)' : 'var(--danger)' }}>{ok ? '✓ ACCESO PERMITIDO' : '✕ ACCESO RECHAZADO'}</div>
      {res.alum && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 8 }}><span className="avatar" aria-hidden="true">{(res.alum.name?.[0] || 'A').toUpperCase()}</span><b style={{ fontSize: 16 }}>{res.alum.name}</b></div>}
      {emRes && emRes.planNombre && <div className="muted-text" style={{ marginTop: 4 }}>{emRes.planNombre}{emRes.vencimiento ? ` · vence ${toDisplay(emRes.vencimiento)}` : ''}</div>}
      {res.motivo ? <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700 }}>{MOTIVOS_ACCESO[res.motivo] || res.motivo}</div> : null}
      {res.pendiente && <div className="muted-text" style={{ marginTop: 4, fontSize: 11 }}>Pendiente de sincronizar (offline)</div>}
    </div>}
    <section className="panel" style={{ marginTop: 14 }}><PanelTitle title="Accesos de hoy" action={<span className="muted-text" style={{ fontVariantNumeric: 'tabular-nums' }}>{resumen.entradas} entradas · {resumen.salidas} salidas · {resumen.dentro} dentro</span>} />
        <div className="rows">
          <div className="row"><div className="miniavatar">→</div><div className="grow"><b>Entradas</b><span>check-ins registrados hoy</span></div><strong>{resumen.entradas}</strong></div>
          <div className="row"><div className="miniavatar green">●</div><div className="grow"><b>Actualmente dentro</b><span>sin salida registrada</span></div><strong>{resumen.dentro}</strong></div>
          <div className="row"><div className="miniavatar">←</div><div className="grow"><b>Salidas</b><span>check-outs registrados hoy</span></div><strong>{resumen.salidas}</strong></div>
        </div>
      </section>
      <section className="panel" style={{ marginTop: 14 }}><PanelTitle title="Calendario semanal" />
        <div className="cal-grid" role="list">
          {diasSemana.map((d) => (
            <div key={d.fechaISO} className={d.esHoy ? 'cal-day today' : 'cal-day'} role="listitem" aria-label={`${d.fecha} — ${d.total} clases`}>
              <b>{d.fecha}</b>
              <span className="muted-text">{d.total} clases</span>
            </div>
          ))}
        </div>
      </section>
      <section className="panel" style={{ marginTop: 14 }}><PanelTitle title="Historial de hoy" />
      <div className="toolbar">
        <select className="field" style={{ maxWidth: 150 }} aria-label="Resultado" value={fRes} onChange={e => setFRes(e.target.value)}><option value="">Permit./Rech.</option><option value="permitido">Permitidos</option><option value="rechazado">Rechazados</option></select>
        <select className="field" style={{ maxWidth: 140 }} aria-label="Tipo" value={fTipo} onChange={e => setFTipo(e.target.value)}><option value="">Entr./Sal.</option><option value="entrada">Entradas</option><option value="salida">Salidas</option></select>
        <div className="search-wrap"><input className="field-search" aria-label="Buscar en historial" placeholder="🔎 Buscar..." value={fQ} onChange={e => setFQ(e.target.value)} /></div>
        <button className="ghost sm" title="Descargar CSV del historial filtrado" onClick={() => descargarCSV(`accesos-${today()}.csv`, toCSV(filtrados, [{ key: 'fecha', label: 'Fecha' }, { key: 'hora', label: 'Hora' }, { key: 'alumno_nombre', label: 'Alumno', get: (h) => h.alumno_nombre || h.identificador || '' }, { key: 'tipo', label: 'Tipo' }, { key: 'resultado', label: 'Resultado' }, { key: 'motivo', label: 'Motivo', get: (h) => MOTIVOS_ACCESO[h.motivo] || h.motivo || '' }, { key: 'metodo', label: 'Método' }]))}>⤓ CSV</button>
      </div>
      <div className="table" style={{ marginTop: 0, overflow: 'hidden' }}>
        <div className="thead gestion"><span>Hora</span><span>Alumno</span><span>Tipo</span><span>Resultado</span><span>Motivo</span><span>Método</span></div>
        <div style={{ maxHeight: 320, overflow: 'auto' }}>
          {filtrados.map((h) => <div key={h.id} className="trow gestion" role="row" tabIndex={0}>
            <span className="muted-text" style={{ fontFamily: 'monospace' }}>{String(h.hora || '').slice(0, 5)}</span>
            <span><b>{h.alumno_nombre || h.identificador || '—'}</b></span>
            <span style={{ textTransform: 'capitalize' }}>{h.tipo || '—'}</span>
            <span><span className={h.resultado === 'permitido' ? 'badge' : 'badge vencido'}>{h.resultado === 'permitido' ? 'Permitido' : 'Rechazado'}</span></span>
            <span className="muted-text">{MOTIVOS_ACCESO[h.motivo] || h.motivo || '—'}</span>
            <span className="muted-text">{h.metodo || '—'}</span>
          </div>)}
          {!filtrados.length && <Empty text="Sin accesos registrados hoy." />}
        </div>
      </div>
    </section>
  </section>
}
