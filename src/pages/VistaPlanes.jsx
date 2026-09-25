import React, { useState, useEffect } from 'react'
import { api } from '../services/api'
import { tenantGetJSON, tenantSetJSON } from '../services/tenant'
import FormaEditor from '../components/FormaEditor.jsx'
import { today, onEnterNext } from '../utils/helpers.js'
import { Empty } from '../components/ui.jsx'


export default function VistaPlanes({students,routines,ejercicios}){
  const [tab,setTab]=useState('alumnos')
  const [library,setLibrary]=useState([])
  const [modalRutina,setModalRutina]=useState(null)
  const [verRutina,setVerRutina]=useState(null)
  const [showCargar,setShowCargar]=useState(false)
  const [selEx,setSelEx]=useState(null)
  const [editEx,setEditEx]=useState(null)
  const [qPlanes,setQPlanes]=useState('')
  useEffect(()=>{ if(tab==='ejercicios') api.exercisesLibrary().then(setLibrary).catch(()=>setLibrary(tenantGetJSON('library',[]))) },[tab])
  const getInitials=n=> String(n||'').split(' ').filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('') || 'AL'
  const LABELS={hipertrofia:'Hipertrofia', fuerza:'Fuerza', resistencia:'Resistencia', definicion:'Definición', funcional:'Funcional', rehabilitacion:'Rehabilitación'}
  const alumnosConRutina=new Set(routines.map(r=>String(r.studentId||r.alumno_id))).size
  return <div style={{display:'grid',gap:0}}>
    <div className="page-head">
      <div><h2>Rutinas</h2><p>Organizá el entrenamiento de cada alumno · {students.length} alumnos · {alumnosConRutina} con rutina</p></div>
      <div className="page-actions"><button className="primary" onClick={()=>{const el=document.getElementById('rx-search'); if(el) el.focus()}}>+ Nueva rutina</button></div>
    </div>
    <div className="tabs" role="tablist" aria-label="Secciones de rutinas">
      <button role="tab" aria-selected={tab==='alumnos'} className={tab==='alumnos'?'tab active':'tab'} onClick={()=>setTab('alumnos')}>Mis rutinas</button>
      <button role="tab" aria-selected={tab==='ejercicios'} className={tab==='ejercicios'?'tab active':'tab'} onClick={()=>setTab('ejercicios')}>Biblioteca</button>
    </div>
    <div className="toolbar">
      <div className="search-wrap"><input id="rx-search" value={qPlanes} onChange={e=>setQPlanes(e.target.value)} placeholder={tab==='alumnos'?'🔎 Buscar alumno por nombre o DNI...':'🔎 Buscar ejercicio...'} aria-label="Buscar" className="field-search" /></div>
    </div>
    {tab==='alumnos'?<>
      <div className="table" style={{overflow:'hidden'}}>
      <div className="grid-planes-head"><span style={{paddingLeft:50}}>ALUMNO</span><span style={{textAlign:'center'}}>EDAD</span><span style={{textAlign:'center'}}>ENFOQUE</span><span style={{textAlign:'center'}}>DISPONIBILIDAD</span><span></span></div>
      <div style={{display:'grid',maxHeight:480,overflow:'auto'}}>
        {!students.length&&<Empty text="Sin alumnos. Cargá uno para crear su rutina."/>}
        {students.length>0&&!students.filter(s=> !qPlanes || s.name.toLowerCase().includes(qPlanes.toLowerCase()) || String(s.dni||'').includes(qPlanes)).length&&<Empty text="Sin resultados para la búsqueda."/>}
        {students.filter(s=> !qPlanes || s.name.toLowerCase().includes(qPlanes.toLowerCase()) || String(s.dni||'').includes(qPlanes) ).map(s=>{
          const edad=s.edad||''; const edadTxt=String(edad).trim().match(/^\d+$/)?`${edad} años`: (String(edad).trim()||'-')
          const goal=(s.enfoque||s.goal||'hipertrofia').toLowerCase(); const label=LABELS[goal]||s.enfoque||s.goal||'Hipertrofia'
          const days=s.days_per_week||s.disponibilidad||3; const dispTxt=String(days).match(/^\d+$/)?`${days} días/sem.`:String(days)
          const hasRutina=routines.some(r=>String(r.studentId||r.alumno_id)===String(s.id))
          return <div key={s.id} className="grid-planes-row flat-row">
            <span style={{display:'flex',alignItems:'center',gap:10,overflow:'hidden'}}><span className="avatar" aria-hidden="true">{getInitials(s.name)}</span><b style={{fontSize:13,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',cursor:'pointer'}} onClick={()=>setShowCargar(s)}>{s.name.length>26? s.name.slice(0,26)+'…': s.name}</b>{hasRutina&&<span className="badge accent" title="Tiene rutina cargada">Rutina</span>}</span>
            <span style={{textAlign:'center',fontSize:12}}>{edadTxt}</span>
            <span style={{display:'flex',justifyContent:'center'}}><span className="badge accent">{label}</span></span>
            <span style={{textAlign:'center',fontSize:12}}>{dispTxt}</span>
            <span style={{display:'flex',gap:6,justifyContent:'flex-end'}}><button className="ghost sm" onClick={()=>setVerRutina(s)}>Ver rutina</button><button className="primary small" onClick={()=>setModalRutina(s)}>Crear rutina</button></span>
          </div>
        })}
      </div>
      </div>
      {showCargar&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setShowCargar(false)}}><div className="modal"><div className="modal-head"><h3>{showCargar?.id?'Editar alumno':'Cargar alumno'}</h3><button onClick={()=>setShowCargar(false)} aria-label="Cerrar">×</button></div>
        <form onSubmit={async e=>{e.preventDefault(); const f=new FormData(e.currentTarget); const nombre=f.get('nombre').trim(); const edad=f.get('edad').trim(); const enfoque=f.get('enfoque'); const dias=f.get('dias'); if(!nombre) return alert('Nombre'); const data={nombre, telefono:'', email:'', edad:edad?Number(edad):null, fecha_ingreso:today()}; try{ await api.crearAlumno(data)}catch{} setShowCargar(false); location.reload() }} onKeyDown={onEnterNext} className="form">
          <label>Nombre completo<input name="nombre" defaultValue={showCargar?.name||''} required/></label>
          <label>Edad<input name="edad" defaultValue={showCargar?.edad||''} placeholder="Ej. 25"/></label>
          <label>Enfoque<select name="enfoque" defaultValue={(showCargar?.enfoque||'hipertrofia').toLowerCase()}><option value="hipertrofia">Hipertrofia</option><option value="fuerza">Fuerza</option><option value="resistencia">Resistencia</option><option value="definicion">Definición</option><option value="funcional">Funcional</option></select></label>
          <label>Disponibilidad (días/sem)<select name="dias" defaultValue={showCargar?.days_per_week||3}><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option></select></label>
          <button className="primary wide">Guardar</button>
        </form>
      </div></div>}
      {(verRutina||modalRutina)&&<FormaEditor student={verRutina||modalRutina} mode={verRutina?'ver':'crear'} library={library} routines={routines} onClose={()=>{setVerRutina(null); setModalRutina(null)}} />}
    </>:<>
      {(()=>{ const libList=library.length?library:tenantGetJSON('library',[]); const selectedEx=libList.find(x=>String(x.id)===String(selEx)); return <>
      <div className="page-head" style={{marginBottom:12}}><div><h2 style={{fontSize:16}}>Biblioteca de ejercicios</h2><p>Encontrá y gestioná los ejercicios de tus rutinas · {libList.length} ejercicios</p></div><div className="page-actions"><button className="primary" onClick={()=>{ const m={id:null}; setEditEx(m) }}>+ Nuevo ejercicio</button><button className="ghost" onClick={()=>{ if(!selectedEx) return alert('Seleccioná un ejercicio'); setEditEx(selectedEx) }}>Editar</button><button className="ghost danger" onClick={()=>{ if(!selectedEx) return alert('Seleccioná un ejercicio'); if(!confirm(`¿Eliminar "${selectedEx.name||selectedEx.nombre}"?`)) return; const cur=tenantGetJSON('library',[]); const filt=cur.filter(x=>String(x.id)!==String(selectedEx.id)); tenantSetJSON('library',filt); if(library.length) setLibrary(filt); else tenantSetJSON('library',filt); setSelEx(null) }}>Eliminar</button></div></div>
      <div className="table" style={{overflow:'hidden'}}>
      <div className="grid-ejercicios-head" style={{width:'100%'}}><span>EJERCICIO</span><span>ENFOQUE</span><span>GRUPO</span><span>NIVEL MÍN.</span><span>EQUIPO</span></div>
      <div style={{display:'grid',maxHeight:'calc(100vh - 300px)', minHeight:200, overflow:'auto', width:'100%'}}>
        {libList.filter(ex=> !qPlanes || String(ex.name||ex.nombre||'').toLowerCase().includes(qPlanes.toLowerCase()) ).map(ex=>{
          const isSel=String(selEx)===String(ex.id)
          return <div key={ex.id||ex.name} onClick={()=>setSelEx(ex.id)} onDoubleClick={()=>setEditEx(ex)} className={isSel?"grid-ejercicios-row flat-row sel":"grid-ejercicios-row flat-row"} role="row" tabIndex={0} aria-selected={isSel} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();setSelEx(ex.id)}}} style={{fontSize:12,width:'100%'}}>
            <span><b>{ex.name||ex.nombre}</b></span><span><span className="badge neutral">{LABELS[(ex.focus||ex.enfoque||'').toLowerCase()]||ex.focus||ex.enfoque||'—'}</span></span><span>{ex.muscle_group||ex.grupo||'—'}</span><span>{ex.min_experience||ex.nivel||'—'}</span><span>{ex.equipment||ex.equipo||'—'}</span>
          </div>
        })}
        {!libList.length && <div style={{textAlign:'center',padding:20,color:'var(--muted)',background:'var(--card)',border:'1px solid var(--card-border)',borderRadius:10}}>No hay ejercicios en la biblioteca.</div>}
        {libList.length>0&&!libList.filter(ex=> !qPlanes || String(ex.name||ex.nombre||'').toLowerCase().includes(qPlanes.toLowerCase())).length&&<div style={{textAlign:'center',padding:20,color:'var(--muted)',background:'var(--card)',border:'1px solid var(--card-border)',borderRadius:10}}>Sin resultados para la búsqueda.</div>}
        {selectedEx&&<div style={{padding:'8px 12px',fontSize:11,color:'var(--muted)',background:'var(--selected)',border:'1px solid var(--card-border)',borderRadius:8}}>Seleccionado: {selectedEx.name||selectedEx.nombre} · Doble click para editar</div>}
      </div>
      </div>
      {editEx&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setEditEx(null)}}><div className="modal"><div className="modal-head"><h3>{editEx.id?'Editar ejercicio':'Nuevo ejercicio'}</h3><button onClick={()=>setEditEx(null)} aria-label="Cerrar">×</button></div>
        <form onSubmit={e=>{e.preventDefault(); const f=new FormData(e.currentTarget); const data={id: editEx.id||Date.now(), name:f.get('nombre').trim(), focus:f.get('enfoque')||'general', muscle_group:f.get('grupo')||'general', min_experience:f.get('nivel')||'principiante', equipment:f.get('equipo')||''}; if(!data.name) return alert('Nombre requerido'); const cur=tenantGetJSON('library',[]); if(editEx.id){ const idx=cur.findIndex(x=>String(x.id)===String(editEx.id)); if(idx>=0) cur[idx]=data; } else cur.push(data); tenantSetJSON('library',cur); setLibrary([...cur]); setEditEx(null); setSelEx(null) }} onKeyDown={onEnterNext} className="form">
          <label>Ejercicio<input name="nombre" defaultValue={editEx.name||editEx.nombre||''} required/></label>
          <div className="form2"><label>Enfoque<select name="enfoque" defaultValue={editEx.focus||editEx.enfoque||'general'}><option value="general">General</option><option value="hipertrofia">Hipertrofia</option><option value="fuerza">Fuerza</option><option value="resistencia">Resistencia</option><option value="funcional">Funcional</option></select></label><label>Grupo muscular<input name="grupo" defaultValue={editEx.muscle_group||editEx.grupo||''} placeholder="Pecho, Espalda..."/></label></div>
          <div className="form2"><label>Nivel mínimo<select name="nivel" defaultValue={editEx.min_experience||editEx.nivel||'principiante'}><option value="principiante">Principiante</option><option value="intermedio">Intermedio</option><option value="avanzado">Avanzado</option></select></label><label>Equipo<input name="equipo" defaultValue={editEx.equipment||editEx.equipo||''} placeholder="Mancuernas, Barra..."/></label></div>
          <button className="primary wide">{editEx.id?'Guardar cambios':'Crear ejercicio'}</button>
        </form>
      </div></div>}
      </>})()}
    </>}
  </div>
}
