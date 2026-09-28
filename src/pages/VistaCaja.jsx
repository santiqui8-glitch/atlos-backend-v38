// V44-G: caja (movimientos + cierres). Auto-fetch como VistaLicencias (sin
// tocar el refresh global). Offline: IDB v5 + queue tipos movimiento/cierre.
import { useState, useEffect } from 'react'
import { api, queuePush, esErrorDeRed, newOperationId } from '../services/api'
import { list, put } from '../services/db'
import { money, today, toDisplay, onEnterNext } from '../utils/helpers.js'
import { resumenCaja, efectivoCaja, filtrarMovimientos } from '../utils/caja.js'
import { toCSV, descargarCSV } from '../utils/export.js'
import { Empty, PanelTitle } from '../components/ui.jsx'

const CATS = {
  ingreso: ['Membresía', 'Clase', 'Otro ingreso'],
  egreso: ['Alquiler', 'Servicios', 'Sueldos', 'Mantenimiento', 'Limpieza', 'Equipamiento', 'Insumos', 'Impuestos', 'Otro gasto'],
};
const METODOS = ['Efectivo', 'Transferencia', 'Debito', 'Credito'];

export default function VistaCaja({ rol }) {
  const [movs, setMovs] = useState([])
  const [cierres, setCierres] = useState([])
  const [loading, setLoading] = useState(true)
  const [desde, setDesde] = useState(today())
  const [hasta, setHasta] = useState(today())
  const [tipo, setTipo] = useState('')
  const [categoria, setCategoria] = useState('')
  const [metodo, setMetodo] = useState('')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)
  const [showGasto, setShowGasto] = useState(false)
  const [edit, setEdit] = useState(null)
  const puedeEditar = rol !== 'Empleado';

  const fetchAll = async (f = {}) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (f.desde ?? desde) params.set('desde', f.desde ?? desde);
      if (f.hasta ?? hasta) params.set('hasta', f.hasta ?? hasta);
      const [m, c] = await Promise.all([
        api.movimientos(params.toString()).catch(() => null),
        api.cierres().catch(() => null),
      ]);
      if (Array.isArray(m)) setMovs(m); else setMovs(await list('movimientos'));
      if (Array.isArray(c)) setCierres(c); else setCierres(await list('cierres'));
    } catch { try { setMovs(await list('movimientos')); setCierres(await list('cierres')) } catch {} }
    setLoading(false);
  };
  useEffect(() => { fetchAll() }, []);

  const filtrados = filtrarMovimientos(movs, { tipo, categoria, metodo, q }).filter((m) => {
    const f = String(m.fecha || '').slice(0, 10);
    if (desde && f < desde) return false;
    if (hasta && f > hasta) return false;
    return true;
  });
  const res = resumenCaja(filtrados);
  const efe = efectivoCaja(filtrados);
  const cierreHoy = cierres.find((c) => String(c.fecha || '').slice(0, 10) === today());
  const selected = movs.find((m) => String(m.id) === String(sel));

  const saveGasto = async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const data = {
      tipo: 'egreso',
      categoria: f.get('categoria') || 'Otro gasto',
      concepto: String(f.get('concepto') || '').trim(),
      monto: Number(f.get('monto')),
      metodo: f.get('metodo') || 'Efectivo',
      fecha: f.get('fecha') || today(),
      observaciones: String(f.get('observaciones') || '').trim(),
    };
    if (!data.concepto) return alert('Ingresá el concepto.');
    if (!(data.monto > 0)) return alert('Ingresá un monto válido.');
    const opId = newOperationId();
    try {
      await api.crearMovimiento(data, { operationId: opId });
    } catch (err) {
      console.warn('crear gasto fallo', err.message);
      if (esErrorDeRed(err)) {
        const lid = 'mov-' + Date.now();
        queuePush('movimiento', { ...data, _localId: lid }, { operationId: opId });
        try { await put('movimientos', { id: lid, ...data, referencia_tipo: null, referencia_id: null, estado: 'activo' }) } catch {}
      } else return alert('No se pudo registrar: ' + err.message);
    }
    setShowGasto(false); fetchAll();
  };
  const saveEdit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const data = {
      categoria: f.get('categoria') || edit.categoria,
      concepto: String(f.get('concepto') || '').trim(),
      observaciones: String(f.get('observaciones') || '').trim(),
    };
    if (!data.concepto) return alert('Ingresá el concepto.');
    const opId = newOperationId();
    try {
      await api.actualizarMovimiento(edit.id, data, { operationId: opId });
    } catch (err) {
      console.warn('editar movimiento fallo', err.message);
      if (esErrorDeRed(err)) queuePush('updateMovimiento', { id: edit.id, ...data }, { operationId: opId });
      else return alert('No se pudo guardar: ' + err.message);
    }
    setEdit(null); setSel(null); fetchAll();
  };
  const handleEdit = () => { if (!selected) return alert('Seleccioná un movimiento.'); setEdit(selected) };
  const doCierre = async () => {
    if (!confirm(`¿Cerrar la caja del ${toDisplay(today())}? Se congelan los totales del día.`)) return;
    const opId = newOperationId();
    try {
      await api.crearCierre({ fecha: today() }, { operationId: opId });
    } catch (err) {
      console.warn('cierre fallo', err.message);
      if (esErrorDeRed(err)) queuePush('cierre', { fecha: today(), _localId: 'cierre-' + Date.now() }, { operationId: opId });
      else return alert('No se pudo cerrar: ' + err.message);
    }
    fetchAll();
  };
  const hora = (m) => { const c = String(m.created_at || ''); return c.length >= 16 ? c.slice(11, 16) : '—'; };

  return <section className="panel">
    <div className="page-head">
      <div><h2>Caja</h2><p>{toDisplay(today())} · {cierreHoy ? 'Cerrada' : 'Abierta'}</p></div>
      <div className="page-actions">
        {puedeEditar && <><button className="primary" onClick={() => setShowGasto(true)}>+ Nuevo gasto</button><button className="ghost" onClick={handleEdit}>Editar</button><button className="ghost" onClick={doCierre}>Cerrar caja</button></>}
        <button className="ghost" onClick={() => fetchAll()}>↻ Actualizar</button>
      </div>
    </div>
    {loading ? <Empty text="Cargando caja..." /> : <>
      <div className="cards" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginTop: 0 }}>
        <div className="stat green"><div className="stat-icon" aria-hidden="true">$</div><span>Ingresos</span><strong>{money(res.ingresos)}</strong></div>
        <div className="stat pink"><div className="stat-icon" aria-hidden="true">↓</div><span>Egresos</span><strong>{money(res.egresos)}</strong></div>
        <div className="stat accent"><div className="stat-icon" aria-hidden="true">=</div><span>Saldo</span><strong className={res.saldo < 0 ? 'danger' : ''}>{money(res.saldo)}</strong></div>
        <div className="stat blue"><div className="stat-icon" aria-hidden="true">💵</div><span>Efectivo neto</span><strong>{money(efe)}</strong></div>
      </div>
      <div className="toolbar">
        <input className="field" style={{ maxWidth: 150 }} type="date" aria-label="Desde" value={desde} onChange={e => setDesde(e.target.value)} />
        <input className="field" style={{ maxWidth: 150 }} type="date" aria-label="Hasta" value={hasta} onChange={e => setHasta(e.target.value)} />
        <select className="field" style={{ maxWidth: 130 }} aria-label="Tipo" value={tipo} onChange={e => { setTipo(e.target.value); setCategoria('') }}><option value="">Ing/Egr</option><option value="ingreso">Ingresos</option><option value="egreso">Egresos</option></select>
        <select className="field" style={{ maxWidth: 160 }} aria-label="Categoría" value={categoria} onChange={e => setCategoria(e.target.value)}><option value="">Categoría</option>{[...CATS.ingreso, ...CATS.egreso].map(c => <option key={c}>{c}</option>)}</select>
        <select className="field" style={{ maxWidth: 150 }} aria-label="Método" value={metodo} onChange={e => setMetodo(e.target.value)}><option value="">Método</option>{METODOS.map(m => <option key={m}>{m}</option>)}</select>
        <div className="search-wrap"><input className="field-search" aria-label="Buscar movimiento" placeholder="🔎 Buscar..." value={q} onChange={e => setQ(e.target.value)} /></div>
        <button className="ghost sm" title="Descargar CSV de movimientos filtrados" onClick={() => descargarCSV(`caja-${desde || 'todos'}-${hasta || ''}.csv`, toCSV(filtrados, [{ key: 'fecha', label: 'Fecha' }, { key: 'tipo', label: 'Tipo' }, { key: 'concepto', label: 'Concepto' }, { key: 'categoria', label: 'Categoría' }, { key: 'monto', label: 'Monto' }, { key: 'metodo', label: 'Método' }]))}>⤓ CSV</button>
      </div>
      <div className="table" style={{ marginTop: 0, overflow: 'hidden' }}>
        <div className="thead gestion"><span>Hora</span><span>Tipo</span><span>Concepto</span><span>Categoría</span><span>Monto</span><span>Método</span></div>
        <div style={{ maxHeight: 380, overflow: 'auto' }}>
          {filtrados.map((m) => {
            const isSel = String(sel) === String(m.id);
            return <div key={m.id} onClick={() => setSel(m.id)} className={isSel ? 'trow sel gestion' : 'trow gestion'} role="row" tabIndex={0} aria-selected={isSel} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setSel(m.id) } }}>
              <span className="muted-text" style={{ fontFamily: 'monospace' }}>{hora(m)}</span>
              <span><span className={m.tipo === 'ingreso' ? 'badge' : 'badge vencido'}>{m.tipo === 'ingreso' ? '+ Ingreso' : '− Egreso'}</span></span>
              <span><b>{m.concepto}</b>{m.referencia_tipo ? <small> · vinc. {m.referencia_tipo} #{String(m.referencia_id).slice(0, 6)}</small> : null}</span>
              <span>{m.categoria || '—'}</span>
              <span className="num" style={{ fontWeight: 700 }}>{m.tipo === 'ingreso' ? '+' : '−'}{money(m.monto)}</span>
              <span>{m.metodo || 'Efectivo'}</span>
            </div>
          })}
          {!filtrados.length && <Empty text="Sin movimientos para los filtros." />}
        </div>
      </div>
      {!!cierres.length && <section className="panel" style={{ marginTop: 14 }}><PanelTitle title="Historial de cierres" /><div className="rows">{cierres.slice(0, 7).map((c) => <div className="row" key={c.id}><div className="miniavatar">🔒</div><div className="grow"><b>{toDisplay(c.fecha)}</b><span>Ing {money(c.total_ingresos)} · Egr {money(c.total_egresos)} · {c.usuario || ''}</span></div><strong>{money(c.saldo)}</strong></div>)}</div></section>}
    </>}
    {showGasto && <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) setShowGasto(false) }}><div className="modal"><div className="modal-head"><h3>Nuevo gasto</h3><button onClick={() => setShowGasto(false)} aria-label="Cerrar">×</button></div>
      <form onSubmit={saveGasto} onKeyDown={onEnterNext} className="form">
        <label>Categoría<select name="categoria" required defaultValue="Alquiler">{CATS.egreso.map(c => <option key={c}>{c}</option>)}</select></label>
        <label>Concepto<input name="concepto" required placeholder="Ej. Alquiler del local" /></label>
        <div className="form2"><label>Monto ($)<input name="monto" type="number" min="0.01" step="0.01" required /></label><label>Fecha<input name="fecha" type="date" defaultValue={today()} required /></label></div>
        <label>Método<select name="metodo" defaultValue="Efectivo">{METODOS.map(m => <option key={m}>{m}</option>)}</select></label>
        <label>Observaciones<input name="observaciones" placeholder="Opcional" /></label>
        <button className="primary wide">Registrar gasto</button>
      </form>
    </div></div>}
    {edit && <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) setEdit(null) }}><div className="modal"><div className="modal-head"><h3>Editar movimiento</h3><button onClick={() => setEdit(null)} aria-label="Cerrar">×</button></div>
      <form onSubmit={saveEdit} onKeyDown={onEnterNext} className="form">
        <label>Categoría<select name="categoria" defaultValue={edit.categoria}>{(edit.tipo === 'ingreso' ? CATS.ingreso : CATS.egreso).map(c => <option key={c}>{c}</option>)}</select></label>
        <label>Concepto<input name="concepto" defaultValue={edit.concepto} required /></label>
        <label>Observaciones<input name="observaciones" defaultValue={edit.observaciones || ''} /></label>
        <button className="primary wide">Guardar cambios</button>
      </form>
    </div></div>}
  </section>
}
