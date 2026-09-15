import React, { useState, useEffect } from 'react'
import { api } from '../services/api'
import FormaEditor from '../components/FormaEditor.jsx'
import { today, onEnterNext } from '../utils/helpers.js'


export default function VistaPlanes({students,routines,ejercicios}){
  const [tab,setTab]=useState('alumnos')
  const [library,setLibrary]=useState([])
  const [modalRutina,setModalRutina]=useState(null)
  const [verRutina,setVerRutina]=useState(null)
  const [showCargar,setShowCargar]=useState(false)
  const [selEx,setSelEx]=useState(null)
  const [editEx,setEditEx]=useState(null)
  const [qPlanes,setQPlanes]=useState('')
  useEffect(()=>{ if(tab==='ejercicios') api.exercisesLibrary().then(setLibrary).catch(()=>setLibrary(JSON.parse(localStorage.getItem('atlos-library')||'[]'))) },[tab])
  const getInitials=n=> String(n||'').split(' ').filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('') || 'AL'
  const LABELS={hipertrofia:'Hipertrofia', fuerza:'Fuerza', resistencia:'Resistencia', definicion:'Definición', funcional:'Funcional', rehabilitacion:'Rehabilitación'}
  const alumnosConRutina=new Set(routines.map(r=>String(r.studentId||r.alumno_id))).size
  return <div style={{display:'grid',gap:0}}>
    <div style={{textAlign:'center',padding:'6px 0 14px'}}>
      <div style={{fontFamily:'monospace',fontSize:10,letterSpacing:'.16em',color:'var(--muted)'}}>GESTIÓN DE RUTINAS</div>
      <div style={{fontSize:24,fontWeight:900,color:'var(--text)',lineHeight:1.15}}>Planes personalizados,</div>
      <div style={{fontSize:24,fontWeight:900,color:'var(--accent)',lineHeight:1.15}}>sin rehacerlos de cero.</div>
      <p className="copy" style={{maxWidth:560,margin:'8px auto',textAlign:'center'}}>Crea rutinas A/B por alumno según objetivo y disponibilidad. Los ejercicios se recomiendan automáticamente.</p>
    </div>
    <div style={{display:'flex',justifyContent:'center',borderBottom:'1px solid var(--card-border)',paddingBottom:0,marginBottom:14}}>
      <button onClick={()=>setTab('alumnos')} onMouseEnter={e=>{if(tab!=='alumnos') e.currentTarget.style.background='var(--card)'}} onMouseLeave={e=>{if(tab!=='alumnos') e.currentTarget.style.background='transparent'}} style={{background:tab==='alumnos'?'var(--accent)':'transparent',color:tab==='alumnos'?'#fff':'var(--muted)',border:0,padding:'8px 18px',borderRadius:'8px 8px 0 0',fontWeight:tab==='alumnos'?800:500,cursor:'pointer',borderBottom:tab==='alumnos'?'3px solid var(--accent)':'3px solid transparent'}}>Alumnos</button>
      <button onClick={()=>setTab('ejercicios')} onMouseEnter={e=>{if(tab!=='ejercicios') e.currentTarget.style.background='var(--card)'}} onMouseLeave={e=>{if(tab!=='ejercicios') e.currentTarget.style.background='transparent'}} style={{background:tab==='ejercicios'?'var(--accent)':'transparent',color:tab==='ejercicios'?'#fff':'var(--muted)',border:0,padding:'8px 18px',borderRadius:'8px 8px 0 0',cursor:'pointer',borderBottom:tab==='ejercicios'?'3px solid var(--accent)':'3px solid transparent'}}>Ejercicios</button>
    </div>
    <div style={{display:'flex',justifyContent:'center',margin:'10px 0 14px'}}>
      <div style={{position:'relative',width:'min(420px,95%)'}}>
        <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'var(--muted)',fontSize:14}}>🔍</span>
        <input value={qPlanes} onChange={e=>setQPlanes(e.target.value)} placeholder={tab==='alumnos'?'Buscar alumno...':'Buscar ejercicio...'} style={{width:'100%',padding:'10px 12px 10px 36px',border:'1px solid var(--card-border)',background:'var(--input)',color:'var(--text)',borderRadius:10,outline:'none'}} />
      </div>
    </div>
    {tab==='alumnos'?<>
      <div style={{display:'flex',justifyContent:'flex-start',alignItems:'center',marginBottom:10,gap:8}}><span style={{fontSize:13,fontWeight:800}}>Alumnos</span><span style={{fontSize:11,color:'var(--muted)'}}>{students.length} alumnos cargados</span></div>
      <div style={{display:'grid',gridTemplateColumns:'3fr 1fr 1fr 1fr 1.8fr',gap:0,background:'var(--card)',border:'1px solid var(--card-border)',borderRadius:'10px 10px 0 0',padding:'10px 8px',fontSize:10,letterSpacing:'.06em',textTransform:'uppercase',color:'var(--muted)',fontWeight:700}}><span style={{paddingLeft:50}}>ALUMNO</span><span style={{textAlign:'center'}}>EDAD</span><span style={{textAlign:'center'}}>ENFOQUE</span><span style={{textAlign:'center'}}>DISPONIBILIDAD</span><span></span></div>
      <div style={{display:'grid',gap:6,marginTop:6, maxHeight:420, overflow:'auto'}}>
        {!students.length&&<div style={{textAlign:'center',padding:20,color:'var(--muted)',background:'var(--card)',border:'1px solid var(--card-border)',borderRadius:10}}>Sin alumnos. Carga uno para crear rutina.</div>}
        {students.filter(s=> !qPlanes || s.name.toLowerCase().includes(qPlanes.toLowerCase()) || String(s.dni||'').includes(qPlanes) ).map(s=>{
          const edad=s.edad||''; const edadTxt=String(edad).trim().match(/^\d+$/)?`${edad} años`: (String(edad).trim()||'-')
          const goal=(s.enfoque||s.goal||'hipertrofia').toLowerCase(); const label=LABELS[goal]||s.enfoque||s.goal||'Hipertrofia'
          const days=s.days_per_week||s.disponibilidad||3; const dispTxt=String(days).match(/^\d+$/)?`${days} días/sem.`:String(days)
          const hasRutina=routines.some(r=>String(r.studentId||r.alumno_id)===String(s.id))
          return <div key={s.id} style={{display:'grid',gridTemplateColumns:'3fr 1fr 1fr 1fr 1.8fr',gap:0,alignItems:'center',background:'var(--card)',border:'1px solid var(--card-border)',borderRadius:10,padding:'10px 8px'}}>
            <span style={{display:'flex',alignItems:'center',gap:10,overflow:'hidden'}}><span style={{width:32,height:32,borderRadius:8,background:'var(--text)',color:'var(--accent)',display:'grid',placeItems:'center',fontWeight:800,fontSize:11,flexShrink:0}}>{getInitials(s.name)}</span><b style={{fontSize:13,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',cursor:'pointer'}} onClick={()=>setShowCargar(s)}>{s.name.length>26? s.name.slice(0,26)+'…': s.name}</b></span>
            <span style={{textAlign:'center',fontSize:12}}>{edadTxt}</span>
            <span style={{display:'flex',justifyContent:'center'}}><span style={{background: 'var(--accent)',color:'#fff',padding:'4px 10px',borderRadius:999,fontSize:10,fontWeight:800}}>{label}</span></span>
            <span style={{textAlign:'center',fontSize:12}}>{dispTxt}</span>
            <span style={{display:'flex',gap:6,justifyContent:'flex-end'}}><button className="ghost" onClick={()=>setVerRutina(s)} style={{padding:'6px 10px',fontSize:11}}>Ver rutina</button><button className="primary" onClick={()=>setModalRutina(s)} style={{padding:'6px 12px',fontSize:11}}>Crear rutina</button></span>
          </div>
        })}
      </div>
      {showCargar&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setShowCargar(false)}}><div className="modal"><div className="modal-head"><h3>{showCargar?.id?'Editar alumno':'Cargar alumno'}</h3><button onClick={()=>setShowCargar(false)}>×</button></div>
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
      {(()=>{ const libList=library.length?library:JSON.parse(localStorage.getItem('atlos-library')||'[]'); const selectedEx=libList.find(x=>String(x.id)===String(selEx)); return <>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,flexWrap:'wrap',gap:8}}><span style={{fontWeight:800}}>Biblioteca de ejercicios</span><div style={{display:'flex',gap:8}}><button className="ghost" onClick={()=>{ if(!selectedEx) return alert('Seleccioná un ejercicio'); setEditEx(selectedEx) }}>Editar ejercicio</button><button className="ghost" onClick={()=>{ if(!selectedEx) return alert('Seleccioná un ejercicio'); if(!confirm(`¿Eliminar "${selectedEx.name||selectedEx.nombre}"?`)) return; const cur=JSON.parse(localStorage.getItem('atlos-library')||'[]'); const filt=cur.filter(x=>String(x.id)!==String(selectedEx.id)); localStorage.setItem('atlos-library',JSON.stringify(filt)); if(library.length) setLibrary(filt); else localStorage.setItem('atlos-library',JSON.stringify(filt)); setSelEx(null) }} style={{color:'var(--danger)',borderColor:'var(--danger)'}}>Eliminar</button><button className="primary" onClick={()=>{ const m={id:null}; setEditEx(m) }}>+ Cargar ejercicio</button></div></div>
      <div style={{display:'grid',gridTemplateColumns:'1.8fr 1fr 1fr 1fr 1fr',gap:0,background:'var(--card)',border:'1px solid var(--card-border)',borderRadius:'10px 10px 0 0',padding:'12px 10px',fontSize:10,letterSpacing:'.06em',textTransform:'uppercase',color:'var(--muted)',fontWeight:700,width:'100%'}}><span>EJERCICIO</span><span>ENFOQUE</span><span>GRUPO</span><span>NIVEL MÍN.</span><span>EQUIPO</span></div>
      <div style={{display:'grid',gap:6,marginTop:6, maxHeight:'calc(100vh - 300px)', minHeight:200, overflow:'auto', width:'100%'}}>
        {libList.filter(ex=> !qPlanes || String(ex.name||ex.nombre||'').toLowerCase().includes(qPlanes.toLowerCase()) ).map(ex=>{
          const isSel=String(selEx)===String(ex.id)
          return <div key={ex.id||ex.name} onClick={()=>setSelEx(ex.id)} onDoubleClick={()=>setEditEx(ex)} style={{display:'grid',gridTemplateColumns:'1.8fr 1fr 1fr 1fr 1fr',gap:0,background:isSel?'var(--selected)':'var(--card)',border:`1px solid ${isSel?'var(--accent)':'var(--card-border)'}`,borderLeft:isSel?'3px solid var(--accent)':'1px solid var(--card-border)',borderRadius:10,padding:'12px 10px',fontSize:12,cursor:'pointer',width:'100%'}}>
            <span><b>{ex.name||ex.nombre}</b></span><span>{ex.focus||ex.enfoque||'—'}</span><span>{ex.muscle_group||ex.grupo||'—'}</span><span>{ex.min_experience||ex.nivel||'—'}</span><span>{ex.equipment||ex.equipo||'—'}</span>
          </div>
        })}
        {!libList.length && <div style={{textAlign:'center',padding:20,color:'var(--muted)',background:'var(--card)',border:'1px solid var(--card-border)',borderRadius:10}}>No hay ejercicios en la biblioteca.</div>}
        {selectedEx&&<div style={{padding:'8px 12px',fontSize:11,color:'var(--muted)',background:'var(--selected)',border:'1px solid var(--card-border)',borderRadius:8}}>Seleccionado: {selectedEx.name||selectedEx.nombre} · Doble click para editar</div>}
      </div>
      {editEx&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setEditEx(null)}}><div className="modal"><div className="modal-head"><h3>{editEx.id?'Editar ejercicio':'Cargar ejercicio'}</h3><button onClick={()=>setEditEx(null)}>×</button></div>
        <form onSubmit={e=>{e.preventDefault(); const f=new FormData(e.currentTarget); const data={id: editEx.id||Date.now(), name:f.get('nombre').trim(), focus:f.get('enfoque')||'general', muscle_group:f.get('grupo')||'general', min_experience:f.get('nivel')||'principiante', equipment:f.get('equipo')||''}; if(!data.name) return alert('Nombre requerido'); const cur=JSON.parse(localStorage.getItem('atlos-library')||'[]'); if(editEx.id){ const idx=cur.findIndex(x=>String(x.id)===String(editEx.id)); if(idx>=0) cur[idx]=data; } else cur.push(data); localStorage.setItem('atlos-library',JSON.stringify(cur)); setLibrary([...cur]); setEditEx(null); setSelEx(null) }} onKeyDown={onEnterNext} className="form">
          <label>Ejercicio<input name="nombre" defaultValue={editEx.name||editEx.nombre||''} required/></label>
          <div className="form2"><label>Enfoque<select name="enfoque" defaultValue={editEx.focus||editEx.enfoque||'general'}><option value="general">General</option><option value="hipertrofia">Hipertrofia</option><option value="fuerza">Fuerza</option><option value="resistencia">Resistencia</option><option value="funcional">Funcional</option></select></label><label>Grupo muscular<input name="grupo" defaultValue={editEx.muscle_group||editEx.grupo||''} placeholder="Pecho, Espalda..."/></label></div>
          <div className="form2"><label>Nivel mínimo<select name="nivel" defaultValue={editEx.min_experience||editEx.nivel||'principiante'}><option value="principiante">Principiante</option><option value="intermedio">Intermedio</option><option value="avanzado">Avanzado</option></select></label><label>Equipo<input name="equipo" defaultValue={editEx.equipment||editEx.equipo||''} placeholder="Mancuernas, Barra..."/></label></div>
          <button className="primary wide">{editEx.id?'GUARDAR CAMBIOS':'CARGAR EJERCICIO'}</button>
        </form>
      </div></div>}
      </>})()}
    </>}
  </div>
}
