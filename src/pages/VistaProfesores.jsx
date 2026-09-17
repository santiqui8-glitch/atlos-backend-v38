import React, { useState } from 'react'
import { api, queuePush, esErrorDeRed, readTenantQueue, writeTenantQueue } from '../services/api'
import { tenantGetJSON, tenantSetJSON } from '../services/tenant'
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
      try{ await api.borrarProfesor(targetId) }
      catch(e){ console.warn('borrar profesor api fallo → encolado', e.message); if(esErrorDeRed(e)) queuePush('deleteProfesor',{id:targetId}) }
    } else if(selected.pending){
      // profesor creado offline sin confirmar: cancelar su alta encolada
      const q=readTenantQueue()
      if(q) writeTenantQueue(q.filter(it=>!(it.type==='profesor' && String(it.payload._localId||it.payload.id)===String(selected.id))))
    }
    // BLOQUE 4O: cancelar updateProfesor pendiente del mismo profesor (evita PUT huérfano).
    try{
      const _q=readTenantQueue()
      if(_q){
        const _ids=[selected.serverId,selected.id].filter(Boolean).map(String)
        const _f=_q.filter(it=>!(it.type==='updateProfesor' && _ids.includes(String(it.payload?.id??''))))
        if(_f.length!==_q.length) writeTenantQueue(_f)
      }
    }catch{}
    const arr=JSON.parse(localStorage.getItem('atlos-profesores')||'[]'); const filt=arr.filter(x=>String(x.id)!==String(selected.id)); localStorage.setItem('atlos-profesores',JSON.stringify(filt))
    try{ await remove('profesores',selected.id).catch(()=>{}); await remove('profesores',String(selected.id)).catch(()=>{}); if(selected.serverId && String(selected.serverId)!==String(selected.id)) await remove('profesores',String(selected.serverId)).catch(()=>{}) }catch{}
    const del=tenantGetJSON('deleted-profesores',[]); del.push(String(selected.id)); tenantSetJSON('deleted-profesores',del)
    setSel(null); refresh()
  }
  const handleEdit=()=>{ if(!selected) return alert('Seleccioná un profesor.'); setEdit(selected) }
  const saveEdit=async(e)=>{
    e.preventDefault(); const f=new FormData(e.currentTarget); const nombre=f.get('nombre')?.trim(); const apellido=f.get('apellido')?.trim(); const telefono=f.get('telefono')?.trim(); const especialidad=f.get('especialidad')?.trim()||'General'; if(!nombre||!apellido) return alert('Nombre y apellido requeridos')
    const arr=JSON.parse(localStorage.getItem('atlos-profesores')||'[]'); const idx=arr.findIndex(x=>String(x.id)===String(edit.id))
    const updated={...(arr[idx]||edit), nombre, apellido, telefono, especialidad, nombreCompleto:`${nombre} ${apellido}`}
    const prevRec=idx>=0?arr[idx]:null;
    if(idx>=0){ arr[idx]=updated; localStorage.setItem('atlos-profesores',JSON.stringify(arr)) }
    if(updated.serverId){
      // ENDPOINT ESPERADO: PUT /profesores/{id}. Primero la API; solo si falla la red se encola.
      try{ await api.actualizarProfesor(updated.serverId, {nombre, apellido, telefono, especialidad}) }
      catch(e){ console.warn('actualizar profesor api fallo → encolado', e.message); if(esErrorDeRed(e)) queuePush('updateProfesor', {id:updated.serverId, nombre, apellido, telefono, especialidad}); else if(prevRec){ try{ const _a=JSON.parse(localStorage.getItem('atlos-profesores')||'[]'); const _i=_a.findIndex(x=>String(x.id)===String(edit.id)); if(_i>=0){ _a[_i]=prevRec; localStorage.setItem('atlos-profesores',JSON.stringify(_a)) } }catch{} } }
    }
    setEdit(null); refresh()
  }
  return <section className="panel">
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:12}}><h3 style={{margin:0,fontSize:14}}>Profesores</h3><div style={{display:'flex',gap:8}}><button className="primary" onClick={onNew}>+ NUEVO PROFESOR</button><button className="ghost" onClick={handleEdit}>EDITAR</button><button className="ghost" onClick={handleDelete} style={{color:'var(--danger)',borderColor:'var(--danger)'}}>ELIMINAR</button></div></div>
    <div className="table" style={{marginTop:14,border:'1px solid var(--card-border)',borderRadius:12,overflow:'hidden'}}>
      <div className="thead" style={{display:'grid',gridTemplateColumns:'60px 1.4fr 1fr 140px 1.2fr',gap:0,background:'var(--table-head)',padding:'10px 8px'}}><span>ID</span><span>Nombre</span><span>Apellido</span><span>Teléfono</span><span>Especialidad</span></div>
      <div style={{maxHeight:380,overflow:'auto'}}>
        {profesores.map(p=>{
          const isSel=String(sel)===String(p.id)
          return <div key={p.id} onClick={()=>setSel(p.id)} onDoubleClick={handleEdit} style={{display:'grid',gridTemplateColumns:'60px 1.4fr 1fr 140px 1.2fr',gap:0,background:isSel?'var(--selected)':'transparent',cursor:'pointer',borderLeft:isSel?'3px solid var(--accent)':'3px solid transparent',padding:'10px 8px',borderBottom:'1px solid var(--card-border)'}}>
            <span style={{fontFamily:'monospace',fontSize:11,color:'var(--muted)'}}>{String(p.id).slice(0,6)}</span><span><b>{p.nombre}</b></span><span>{p.apellido}</span><span>{p.telefono||'—'}</span><span><span style={{background:'rgba(99,102,241,.12)',color:'#6366F1',padding:'4px 8px',borderRadius:999,fontSize:11,fontWeight:700}}>{p.especialidad}</span></span>
          </div>
        })}
        {!profesores.length&&<Empty text="No hay profesores. Creá el primero con + NUEVO PROFESOR."/>}
        {selected&&<div style={{padding:'8px 12px',fontSize:11,color:'var(--muted)',background:'var(--selected)',borderTop:'1px solid var(--card-border)'}}>Seleccionado: {selected.nombreCompleto||`${selected.nombre} ${selected.apellido}`} · Doble click para editar</div>}
      </div>
    </div>
    {edit&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setEdit(null)}}><div className="modal"><div className="modal-head"><h3>Editar Profesor</h3><button onClick={()=>setEdit(null)}>×</button></div>
      <form onSubmit={saveEdit} onKeyDown={onEnterNext} className="form">
        <div className="form2"><label>Nombre*<input name="nombre" defaultValue={edit.nombre} required/></label><label>Apellido*<input name="apellido" defaultValue={edit.apellido} required/></label></div>
        <label>Teléfono<input name="telefono" defaultValue={edit.telefono||''}/></label>
        <label>Especialidad<select name="especialidad" defaultValue={edit.especialidad||'General'}><option>General</option><option>Musculación</option><option>Funcional</option><option>CrossFit</option><option>Yoga</option><option>Pilates</option><option>Spinning</option><option>Boxeo</option></select></label>
        <button className="primary wide">GUARDAR CAMBIOS</button>
      </form>
    </div></div>}
  </section>
}
