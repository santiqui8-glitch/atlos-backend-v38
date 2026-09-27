// V44-E: catalogo comercial de planes (entidad separada de Rutinas).
// Usa api.planes()/crearPlan()/actualizarPlan()/desactivarPlan() (E-04),
// queue offline tipos plan/updatePlan (E-05/06) e IDB stores planes (v4).
// Sin backend nuevo, sin endpoints nuevos, sin tocar Rutinas.
import { useState } from 'react'
import { api, queuePush, esErrorDeRed, newOperationId } from '../services/api'
import { pushDeletedId } from '../services/tenant'
import { put, remove } from '../services/db'
import { money, onEnterNext } from '../utils/helpers.js'
import { Empty } from '../components/ui.jsx'


export default function VistaComercial({ planes = [], membresias = [], rol, refresh }) {
  const [sel, setSel] = useState(null)
  const [edit, setEdit] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [q, setQ] = useState('')
  const selected = planes.find((p) => String(p.id) === String(sel))
  const qn = q.trim().toLowerCase();
  const filtrados = !qn ? planes : planes.filter((p) => `${p.nombre || ''}`.toLowerCase().includes(qn));
  const asignados = (pid) => membresias.filter((m) => String(m.plan_id) === String(pid) && m.estado === 'vigente').length;
  const puedeEditar = rol !== 'Empleado';

  const handleDelete = async () => {
    if (!selected) return alert('Seleccioná un plan de la lista.')
    if (!confirm(`¿Desactivar/eliminar plan "${selected.nombre}"? Con asignados se desactiva.`)) return
    const opId = newOperationId();
    try {
      const r = await api.desactivarPlan(selected.id, { operationId: opId });
      // Borrado fisico (sin historial): tombstone + limpieza local.
      if (!r || r.activo !== 0) {
        pushDeletedId('deleted-planes', selected.id);
        try { await remove('planes', selected.id) } catch {}
      }
    } catch (e) {
      console.warn('desactivar plan fallo → encolado', e.message);
      if (esErrorDeRed(e)) queuePush('updatePlan', { id: selected.id, activo: 0 }, { operationId: opId });
      else return alert('No se pudo desactivar: ' + e.message);
    }
    setSel(null); refresh();
  };
  const handleEdit = () => { if (!selected) return alert('Seleccioná un plan.'); setEdit(selected) };
  const savePlan = async (e, isNew) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const data = {
      nombre: String(f.get('nombre') || '').trim(),
      precio: Number(f.get('precio') || 0),
      duracion_dias: Number(f.get('duracion') || 30),
      dias_semana: Number(f.get('dias') || 3),
    };
    if (!data.nombre) return alert('Nombre requerido');
    const opId = newOperationId();
    try {
      if (isNew) {
        const r = await api.crearPlan(data, { operationId: opId });
        void r;
      } else {
        await api.actualizarPlan(edit.id, data, { operationId: opId });
      }
    } catch (err) {
      console.warn('guardar plan fallo', err.message);
      if (esErrorDeRed(err)) {
        if (isNew) {
          const lid = 'plan-' + Date.now();
          queuePush('plan', { ...data, _localId: lid }, { operationId: opId });
          try { await put('planes', { id: lid, ...data, activo: 1 }) } catch {}
        } else {
          queuePush('updatePlan', { id: edit.id, ...data }, { operationId: opId });
        }
      } else return alert('No se pudo guardar: ' + err.message);
    }
    setShowNew(false); setEdit(null); refresh();
  };

  return <section className="panel">
    <div className="page-head">
      <div><h2>Planes</h2><p>Gestioná los planes de membresía · {planes.length} planes</p></div>
      <div className="page-actions">
        {puedeEditar && <><button className="primary" onClick={() => setShowNew(true)}>+ Nuevo plan</button><button className="ghost" onClick={handleEdit}>Editar</button><button className="ghost danger" onClick={handleDelete}>Desactivar</button></>}
      </div>
    </div>
    <div className="toolbar">
      <div className="search-wrap"><input className="field-search" aria-label="Buscar plan" placeholder="🔎 Buscar plan..." value={q} onChange={e => setQ(e.target.value)} /></div>
    </div>
    <div className="table" style={{ marginTop: 0, overflow: 'hidden' }}>
      <div className="thead gestion"><span>ID</span><span>Plan</span><span>Precio</span><span>Duración</span><span>Días/sem</span><span>Estado</span></div>
      <div style={{ maxHeight: 420, overflow: 'auto' }}>
        {filtrados.map((p) => {
          const isSel = String(sel) === String(p.id);
          const n = asignados(p.id);
          return <div key={p.id} onClick={() => setSel(p.id)} onDoubleClick={() => { if (puedeEditar) handleEdit() }} className={isSel ? 'trow sel gestion' : 'trow gestion'} role="row" tabIndex={0} aria-selected={isSel} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setSel(p.id) } }}>
            <span style={{ fontFamily: 'monospace' }} className="muted-text">{String(p.id).slice(0, 6)}</span>
            <span><b>{p.nombre}</b>{n > 0 && <small> · {n} asignado{n === 1 ? '' : 's'}</small>}</span>
            <span className="num" style={{ fontWeight: 700 }}>{money(p.precio || 0)}</span>
            <span>{p.duracion_dias || 30} días</span>
            <span>{p.dias_semana ?? 3}</span>
            <span><span className={p.activo ? 'badge' : 'badge vencido'}>{p.activo ? 'Activo' : 'Inactivo'}</span></span>
          </div>
        })}
        {!filtrados.length && <Empty text={q ? 'Sin resultados para la búsqueda.' : 'No hay planes. Creá el primero con + Nuevo plan.'} />}
        {selected && <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--card-border)', background: 'var(--selected)' }}>Seleccionado: {selected.nombre} · {asignados(selected.id)} vigente(s)</div>}
      </div>
    </div>
    {showNew && <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) setShowNew(false) }}><div className="modal"><div className="modal-head"><h3>Nuevo plan</h3><button onClick={() => setShowNew(false)} aria-label="Cerrar">×</button></div>
      <form onSubmit={e => savePlan(e, true)} onKeyDown={onEnterNext} className="form">
        <label>Nombre*<input name="nombre" required placeholder="Mensual" /></label>
        <div className="form2"><label>Precio ($)<input name="precio" type="number" min="0" step="0.01" defaultValue={0} required /></label><label>Duración (días)<input name="duracion" type="number" min="1" defaultValue={30} required /></label></div>
        <label>Días por semana<input name="dias" type="number" min="0" defaultValue={3} required /></label>
        <button className="primary wide">Crear plan</button>
      </form>
    </div></div>}
    {edit && <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) setEdit(null) }}><div className="modal"><div className="modal-head"><h3>Editar plan</h3><button onClick={() => setEdit(null)} aria-label="Cerrar">×</button></div>
      <form onSubmit={e => savePlan(e, false)} onKeyDown={onEnterNext} className="form">
        <label>Nombre*<input name="nombre" defaultValue={edit.nombre} required /></label>
        <div className="form2"><label>Precio ($)<input name="precio" type="number" min="0" step="0.01" defaultValue={edit.precio || 0} required /></label><label>Duración (días)<input name="duracion" type="number" min="1" defaultValue={edit.duracion_dias || 30} required /></label></div>
        <label>Días por semana<input name="dias" type="number" min="0" defaultValue={edit.dias_semana ?? 3} required /></label>
        <button className="primary wide">Guardar cambios</button>
      </form>
    </div></div>}
  </section>
}
