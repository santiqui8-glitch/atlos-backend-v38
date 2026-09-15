import React, { useState } from 'react'
import { api, queuePush, esErrorDeRed } from '../services/api'
import { today, onEnterNext } from '../utils/helpers.js'
import { Empty } from '../components/ui.jsx'


export default function VistaClases({clases,students,profesores=[],onNew,refresh}){
  const [sel,setSel]=useState(null)
  const [edit,setEdit]=useState(null)
  const [inscribir,setInscribir]=useState(null)
  const selected=clases.find(c=>String(c.id)===String(sel))
  const totalIns=clases.reduce((a,c)=>a+Number(c.inscriptos||c.inscriptos_count||0),0)
  const handleDelete=async()=>{
    if(!selected) return alert('Seleccioná una clase de la lista.')
    if(!confirm(`¿Eliminar clase "${selected.nombre||selected.name}"?`)) return
    const isLocal=String(selected.id).includes('-') || String(selected.id).length>10
    const targetId=selected.serverId || (isLocal? null : selected.id)
    if(targetId){
      // ENDPOINT ESPERADO: DELETE /clases/{id} (backend en desarrollo). Primero la API; solo si falla la red se encola.
      try{ await api.eliminarClase(targetId) }
      catch(e){ console.warn('eliminar clase api fallo → encolado', e.message); if(esErrorDeRed(e)) queuePush('deleteClase',{id:targetId}) }
    } else if(selected.pending){
      // clase creada offline todavía sin id de servidor: cancelar su alta encolada
      const q=JSON.parse(localStorage.getItem('atlos-queue')||'[]')
      localStorage.setItem('atlos-queue', JSON.stringify(q.filter(it=>!(it.type==='clase' && String(it.payload._localId||it.payload.id)===String(selected.id)))))
    }
    const local=JSON.parse(localStorage.getItem('atlos-clases')||'[]'); const filt=local.filter(c=>String(c.id)!==String(selected.id)); localStorage.setItem('atlos-clases',JSON.stringify(filt))
    const del=JSON.parse(localStorage.getItem('atlos-deleted-clases')||'[]'); del.push(String(selected.id)); localStorage.setItem('atlos-deleted-clases',JSON.stringify(del))
    setSel(null); refresh()
  }
  const handleEdit=()=>{ if(!selected) return alert('Seleccioná una clase de la lista.'); setEdit(selected) }
  const handleInscribir=()=>{ if(!selected) return alert('Seleccioná una clase para inscribir.'); setInscribir(selected) }
  const saveEdit=async(e)=>{
    e.preventDefault(); const f=new FormData(e.currentTarget)
    const capVal=f.get('cap'); const capNum=capVal==='Ilimitada'?999:Number(capVal)
    const data={nombre:f.get('nombre'), dia_mes:f.get('dia'), hora_inicio:f.get('inicio'), hora_fin:f.get('fin'), capacidad:capNum, profesor:f.get('profesor')}
    const isLocal=String(edit.id).includes('-') || String(edit.id).length>10
    const targetId=edit.serverId || (isLocal? null : edit.id)
    if(targetId){
      // ENDPOINT ESPERADO: PUT /clases/{id}. Antes se hacía crearClase() y duplicaba la clase en la nube.
      try{ await api.actualizarClase(targetId, data) }
      catch(err){ console.warn('editar clase api',err.message); if(esErrorDeRed(err)) queuePush('updateClase',{id:targetId, ...data}) }
    } else if(edit.pending){
      // clase creada offline sin confirmar: pisar el payload encolado con los datos editados
      const q=JSON.parse(localStorage.getItem('atlos-queue')||'[]')
      const q2=q.map(it=> (it.type==='clase' && String(it.payload._localId||it.payload.id)===String(edit.id)) ? {...it, payload:{...it.payload, ...data}} : it)
      localStorage.setItem('atlos-queue', JSON.stringify(q2))
    }
    // local fallback: actualizar en atlos-clases
    const local=JSON.parse(localStorage.getItem('atlos-clases')||'[]'); const idx=local.findIndex(c=>String(c.id)===String(edit.id))
    if(idx>=0){ local[idx]={...local[idx],...data}; localStorage.setItem('atlos-clases',JSON.stringify(local)) }
    else { // si era de la nube, crear override local
      local.push({id:edit.serverId||edit.id, serverId:edit.serverId||null, pending:edit.pending||false, ...data, inscriptos: edit.inscriptos||0}); localStorage.setItem('atlos-clases',JSON.stringify(local))
    }
    setEdit(null); refresh()
  }
  const doInscribir=async(e)=>{
    e.preventDefault(); const f=new FormData(e.currentTarget); const alumnoId=f.get('alumno')
    const _aSid=String(alumnoId??'').trim(); const _alumnoRef=/^\d+$/.test(_aSid)?Number(_aSid):_aSid
    try{ await api.inscribirClase(selected.id, _alumnoRef) }catch(err){ console.warn('inscribir api',err.message); // local fallback: incrementar inscriptos
      const local=JSON.parse(localStorage.getItem('atlos-clases')||'[]'); const idx=local.findIndex(c=>String(c.id)===String(selected.id))
      if(idx>=0){ local[idx].inscriptos=(Number(local[idx].inscriptos)||0)+1; localStorage.setItem('atlos-clases',JSON.stringify(local)) }
      else { const cloudIdx=clases.findIndex(c=>String(c.id)===String(selected.id)); if(cloudIdx>=0){ const copy=[...clases]; copy[cloudIdx]={...copy[cloudIdx], inscriptos:(Number(copy[cloudIdx].inscriptos)||0)+1}; localStorage.setItem('atlos-clases',JSON.stringify(copy)) } }
      // guardar inscripción local para detalle
      const ins=JSON.parse(localStorage.getItem('atlos-inscripciones')||'[]'); ins.push({clase_id:selected.id, alumno_id:alumnoId, fecha:today()}); localStorage.setItem('atlos-inscripciones',JSON.stringify(ins))
    }
    setInscribir(null); refresh()
  }
  return <section className="panel">
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:12}}>
      <h3 style={{margin:0,fontSize:14}}>Clases</h3>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <button className="primary" onClick={onNew}>+ NUEVA CLASE</button>
        <button className="ghost" onClick={handleEdit}>EDITAR</button>
        <button className="ghost" onClick={handleDelete} style={{color:'var(--danger)',borderColor:'var(--danger)'}}>ELIMINAR</button>
        <button className="primary" onClick={handleInscribir} style={{background:'#0ea5e9'}}>INSCRIBIR</button>
      </div>
    </div>
    <div className="cards" style={{gridTemplateColumns:'1fr 1fr',marginTop:12}}><div className="stat blue"><div className="stat-icon">🗓</div><span>CLASES</span><strong>{clases.length}</strong></div><div className="stat orange"><div className="stat-icon">👥</div><span>INSCRIPCIONES</span><strong>{totalIns}</strong></div></div>
    <div className="table" style={{marginTop:14,border:'1px solid var(--card-border)',borderRadius:12,overflow:'hidden'}}>
      <div className="thead" style={{display:'grid',gridTemplateColumns:'50px 1.6fr 70px 85px 85px 65px 1.2fr 70px',gap:0,background:'var(--table-head)',padding:'10px 8px'}}><span>ID</span><span>Clase</span><span>Día</span><span>Inicio</span><span>Fin</span><span>Cap.</span><span>Profesor</span><span>Insc.</span></div>
      <div style={{maxHeight:380,overflow:'auto'}}>
        {clases.map(c=>{
          const isSel=String(sel)===String(c.id)
          return <div key={c.id} onClick={()=>setSel(c.id)} onDoubleClick={handleEdit} style={{display:'grid',gridTemplateColumns:'50px 1.6fr 70px 85px 85px 65px 1.2fr 70px',gap:0,background:isSel?'var(--selected)':'transparent',cursor:'pointer',borderLeft:isSel?'3px solid var(--accent)':'3px solid transparent',padding:'10px 8px',borderBottom:'1px solid var(--card-border)'}}>
            <span style={{fontFamily:'monospace',fontSize:11,color:'var(--muted)'}}>{String(c.id).slice(0,6)}</span><span><b>{c.nombre||c.name}</b></span><span>{c.dia_mes||c.dia||'-'}</span><span>{c.hora_inicio||c.inicio||'-'}</span><span>{c.hora_fin||c.fin||'-'}</span><span>{c.capacidad||c.cap||'-'}</span><span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.profesor||'—'}</span><span style={{fontWeight:700,textAlign:'center'}}>{c.inscriptos||c.inscriptos_count||0}</span>
          </div>
        })}
        {!clases.length&&<Empty text="No hay clases. Creá la primera con + NUEVA CLASE."/>}
        {selected&&<div style={{padding:'8px 12px',fontSize:11,color:'var(--muted)',background:'var(--selected)',borderTop:'1px solid var(--card-border)'}}>Seleccionado: {selected.nombre||selected.name} · Doble click para editar · INSCRIBIR para anotar alumno</div>}
      </div>
    </div>
    {edit&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setEdit(null)}}><div className="modal"><div className="modal-head"><h3>Editar Clase</h3><button onClick={()=>setEdit(null)}>×</button></div>
      <form onSubmit={saveEdit} onKeyDown={onEnterNext} className="form">
        <label>Nombre de la clase<input name="nombre" defaultValue={edit.nombre||edit.name} required/></label>
        <div className="form2"><label>Día<select name="dia" defaultValue={edit.dia_mes||edit.dia||'Lunes'} required><option>Lunes</option><option>Martes</option><option>Miércoles</option><option>Jueves</option><option>Viernes</option><option>Sábado</option><option>Domingo</option></select></label><label>Profesor<select name="profesor" defaultValue={edit.profesor||''} required><option value="">Seleccionar...</option>{profesores.map(p=><option key={p.id} value={p.nombreCompleto||`${p.nombre} ${p.apellido}`}>{p.nombreCompleto||`${p.nombre} ${p.apellido}`} — {p.especialidad}</option>)}{!profesores.length&&<option disabled>No hay profesores — cargalos en Profesores</option>}</select></label></div>
        <div className="form2"><label>Inicio<input name="inicio" type="time" defaultValue={edit.hora_inicio||edit.inicio||'08:00'}/></label><label>Fin<input name="fin" type="time" defaultValue={edit.hora_fin||edit.fin||'09:00'}/></label></div>
        <label>Capacidad<select name="cap" defaultValue={String(edit.capacidad||edit.cap||20)==='999'?'Ilimitada':String(edit.capacidad||edit.cap||20)}><option>2</option><option>4</option><option>6</option><option>8</option><option>10</option><option>12</option><option>14</option><option>16</option><option>18</option><option>20</option><option>22</option><option>24</option><option>26</option><option>28</option><option>30</option><option>Ilimitada</option></select></label>
        <button className="primary wide">GUARDAR CAMBIOS</button>
      </form>
    </div></div>}
    {inscribir&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setInscribir(null)}}><div className="modal"><div className="modal-head"><h3>Inscribir a {inscribir.nombre||inscribir.name}</h3><button onClick={()=>setInscribir(null)}>×</button></div>
      <form onSubmit={doInscribir} onKeyDown={onEnterNext} className="form">
        <label>Alumno<select name="alumno" required><option value="">Seleccionar...</option>{students.map(s=><option key={s.id} value={s.id}>{s.name} — DNI {s.dni||'—'}</option>)}</select></label>
        <button className="primary wide">INSCRIBIR</button>
      </form>
    </div></div>}
  </section>
}
