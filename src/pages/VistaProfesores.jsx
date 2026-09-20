import React, { useState } from 'react'
import { api, queuePush, esErrorDeRed, readTenantQueue, writeTenantQueue, sameQueueContext, newOperationId } from '../services/api'
import { tenantGetJSON, tenantSetJSON, pushDeletedId } from '../services/tenant'
import { remove } from '../services/db'
import { onEnterNext } from '../utils/helpers.js'
import { Empty } from '../components/ui.jsx'


export default function VistaProfesores({profesores,onNew,refresh}){
  const [sel,setSel]=useState(null)
  const [edit,setEdit]=useState(null)
  const selected=profesores.find(p=>String(p.id)===String(sel))
  const handleDelete=async()=>{
    if(!selected) return alert('Seleccioná un profesor de la lista.')
    if(!confirm(`¿Eliminar profesor "${selected.nombreCompleto||`${selected.nombre} ${selected.apellido}`}"?`)) return
    const targetId=selected.serverId||null
    if(targetId){
      // ENDPOINT ESPERADO: DELETE /profesores/{id}. Primero la API; solo si falla la red se encola.
      const opId=newOperationId();
      try{ await api.borrarProfesor(targetId,{operationId:opId}) }
      catch(e){ console.warn('borrar profesor api fallo → encolado', e.message); if(esErrorDeRed(e)) queuePush('deleteProfesor',{id:targetId},{operationId:opId}) }
    } else if(selected.pending){
      // profesor creado offline sin confirmar: cancelar su alta encolada
      const q=readTenantQueue()
      if(q) writeTenantQueue(q.filter(it=>!(it.type==='profesor' && String(it.payload._localId||it.payload.id)===String(selected.id) && sameQueueContext(it))))
    }
    // BLOQUE 4O: cancelar updateProfesor pendiente del mismo profesor (evita PUT huérfano).
    try{
      const _q=readTenantQueue()
      if(_q){
        const _ids=[selected.serverId,selected.id].filter(Boolean).map(String)
        const _f=_q.filter(it=>!(it.type==='updateProfesor' && _ids.includes(String(it.payload?.id??'')) && sameQueueContext(it)))
        if(_f.length!==_q.length) writeTenantQueue(_f)
      }
    }catch{}
    const arr=tenantGetJSON('profesores',[]); const filt=arr.filter(x=>String(x.id)!==String(selected.id)); tenantSetJSON('profesores',filt)
    try{ await remove('profesores',selected.id).catch(()=>{}); await remove('profesores',String(selected.id)).catch(()=>{}); if(selected.serverId && String(selected.serverId)!==String(selected.id)) await remove('profesores',String(selected.serverId)).catch(()=>{}) }catch{}
    pushDeletedId('deleted-profesores',selected.id)
    setSel(null); refresh()
  }
  const handleEdit=()=>{ if(!selected) return alert('Seleccioná un profesor.'); setEdit(selected) }
  const saveEdit=async(e)=>{
    e.preventDefault(); const f=new FormData(e.currentTarget); const nombre=f.get('nombre')?.trim(); const apellido=f.get('apellido')?.trim(); const telefono=f.get('telefono')?.trim(); const especialidad=f.get('especialidad')?.trim()||'General'; if(!nombre||!apellido) return alert('Nombre y apellido requeridos')
    const arr=tenantGetJSON('profesores',[]); const idx=arr.findIndex(x=>String(x.id)===String(edit.id))
    const updated={...(arr[idx]||edit), nombre, apellido, telefono, especialidad, nombreCompleto:`${nombre} ${apellido}`}
    const prevRec=idx>=0?arr[idx]:null;
    if(idx>=0){ arr[idx]=updated; tenantSetJSON('profesores',arr) }
    if(updated.serverId){
      // ENDPOINT ESPERADO: PUT /profesores/{id}. Primero la API; solo si falla la red se encola.
      const opId=newOperationId();
      try{ await api.actualizarProfesor(updated.serverId, {nombre, apellido, telefono, especialidad}, {operationId:opId}) }
      catch(e){ console.warn('actualizar profesor api fallo → encolado', e.message); if(esErrorDeRed(e)) queuePush('updateProfesor', {id:updated.serverId, nombre, apellido, telefono, especialidad}, {operationId:opId}); else if(prevRec){ try{ const _a=tenantGetJSON('profesores',[]); const _i=_a.findIndex(x=>String(x.id)===String(edit.id)); if(_i>=0){ _a[_i]=prevRec; tenantSetJSON('profesores',_a) } }catch{} } }
    }
    setEdit(null); refresh()
  }
  return <section className="panel">
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:12}}><h3 style={{margin:0,fontSize:14}}>Profesores</h3><div style={{display:'flex',gap:8}}><button className="primary" onClick={onNew}>+ NUEVO PROFESOR</button><button className="ghost" onClick={handleEdit}>EDITAR</button><button className="ghost danger" onClick={handleDelete}>ELIMINAR</button></div></div>
    <div className="table" style={{marginTop:14,border:'1px solid var(--card-border)',borderRadius:12,overflow:'hidden'}}>
      <div className="thead profesores"><span>ID</span><span>Nombre</span><span>Apellido</span><span>Teléfono</span><span>Especialidad</span></div>
      <div style={{maxHeight:380,overflow:'auto'}}>
        {profesores.map(p=>{
          const isSel=String(sel)===String(p.id)
          return <div key={p.id} onClick={()=>setSel(p.id)} onDoubleClick={handleEdit} className={isSel?'trow sel profesores':'trow profesores'} role="row" tabIndex={0} aria-selected={isSel} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();setSel(p.id)}}}>
            <span style={{fontFamily:'monospace'}} className="muted-text">{String(p.id).slice(0,6)}</span><span><b>{p.nombre}</b></span><span>{p.apellido}</span><span>{p.telefono||'—'}</span><span><span style={{background:'rgba(99,102,241,.12)',color:'var(--info)',padding:'4px 8px',borderRadius:999,fontSize:11,fontWeight:700}}>{p.especialidad}</span></span>
          </div>
        })}
        {!profesores.length&&<Empty text="No hay profesores. Creá el primero con + NUEVO PROFESOR."/>}
        {selected&&<div style={{padding:'8px 12px',fontSize:11,color:'var(--muted)',background:'var(--selected)',borderTop:'1px solid var(--card-border)'}}>Seleccionado: {selected.nombreCompleto||`${selected.nombre} ${selected.apellido}`} · Doble click para editar</div>}
      </div>
    </div>
    {edit&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setEdit(null)}}><div className="modal"><div className="modal-head"><h3>Editar Profesor</h3><button onClick={()=>setEdit(null)} aria-label="Cerrar">×</button></div>
      <form onSubmit={saveEdit} onKeyDown={onEnterNext} className="form">
        <div className="form2"><label>Nombre*<input name="nombre" defaultValue={edit.nombre} required/></label><label>Apellido*<input name="apellido" defaultValue={edit.apellido} required/></label></div>
        <label>Teléfono<input name="telefono" defaultValue={edit.telefono||''}/></label>
        <label>Especialidad<select name="especialidad" defaultValue={edit.especialidad||'General'}><option>General</option><option>Musculación</option><option>Funcional</option><option>CrossFit</option><option>Yoga</option><option>Pilates</option><option>Spinning</option><option>Boxeo</option></select></label>
        <button className="primary wide">GUARDAR CAMBIOS</button>
      </form>
    </div></div>}
  </section>
}
