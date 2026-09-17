import React, { useState, useEffect } from 'react'
import { api, readTenantQueue, writeTenantQueue } from '../services/api'
import { list, put, remove } from '../services/db'
import { money, today, parseFecha, toDisplay, isSameMonth, onEnterNext } from '../utils/helpers.js'
import { Empty } from '../components/ui.jsx'


export default function VistaPlanificacion({students,query,setQuery,stats,payments=[],attendance=[],routines=[],onNew,onRenew,refresh}){
  const [sel,setSel]=useState(null)
  const [edit,setEdit]=useState(null)
  const [detail,setDetail]=useState(null)
  const [page,setPage]=useState(1)
  const pageSize=20
  useEffect(()=>{ setPage(1) },[query, students.length])
  const totalPages=Math.max(1, Math.ceil(students.length/pageSize))
  const pageStudents=students.slice((page-1)*pageSize, page*pageSize)
  const selected=students.find(s=>String(s.id)===String(sel))
  const handleDelete=async()=>{
    const target=selected || students.find(s=>String(s.id)===String(sel))
    if(!target) return alert('Seleccioná un alumno de la lista.')
    if(!confirm(`¿Eliminar a "${target.name}"? Se eliminarán también sus pagos y asistencia.`)) return
    const isUUID=String(target.id).includes('-')
    try{ if(!isUUID) await api.eliminarAlumno(Number(target.id)) }catch(e){ console.warn('eliminar alumno api fallo',e.message)}
    // borrar local y duplicados por nombre (soluciona duplicado UUID+cloud que hacía que "vuelva a aparecer")
    await remove('students',target.id)
    for(const s of students){ if(s.name?.toLowerCase()===target.name?.toLowerCase() && String(s.id)!==String(target.id)){ await remove('students',s.id) } }
    // BLOQUE 4H: cancelar POST pendiente de este alumno offline (evita fantasma en backend).
    try{
      const _q=readTenantQueue();
      if(_q){
        const _id=String(target.id);
        const _f=_q.filter(it=>!(it.type==='alumno' && String(it.payload?._localId||'')===_id));
        if(_f.length!==_q.length) writeTenantQueue(_f);
      }
    }catch{}
    const del=JSON.parse(localStorage.getItem('atlos-deleted-alumnos')||'[]'); del.push(String(target.id)); localStorage.setItem('atlos-deleted-alumnos',JSON.stringify(del))
    const delNames=JSON.parse(localStorage.getItem('atlos-deleted-alumnos-names')||'[]'); delNames.push(target.name.toLowerCase()); localStorage.setItem('atlos-deleted-alumnos-names',JSON.stringify([...new Set(delNames)]))
    const ext=JSON.parse(localStorage.getItem('atlos-alumnos-ext')||'{}'); delete ext[target.name.toLowerCase()]; localStorage.setItem('atlos-alumnos-ext',JSON.stringify(ext))
    // borrar pagos y asistencia locales de ese alumno
    for(const p of await list('payments')){ if(String(p.studentId)===String(target.id) || (p.alumnoNombre&&p.alumnoNombre.toLowerCase()===target.name.toLowerCase())) await remove('payments',p.id) }
    for(const a of await list('attendance')){ if(String(a.studentId)===String(target.id)) await remove('attendance',a.id) }
    // BLOQUE 4P: cascada local — borrar inscripciones del alumno eliminado.
    try{
      const _ins=JSON.parse(localStorage.getItem('atlos-inscripciones')||'[]');
      const _ids=[target.id,target.serverId].filter(Boolean).map(String);
      const _f=_ins.filter(x=>!_ids.includes(String(x.alumno_id??'')));
      if(_f.length!==_ins.length) localStorage.setItem('atlos-inscripciones',JSON.stringify(_f));
    }catch{}
    setSel(null); refresh()
  }
  const handleEdit=()=>{ if(!selected) return alert('Seleccioná un alumno de la lista.'); setEdit(selected) }
  const handleOpenDetail=(s)=>{ setSel(String(s.id)); setDetail(s) }
  const saveEdit=async(e)=>{
    e.preventDefault(); const f=new FormData(e.currentTarget)
    const nombre=f.get('nombre')?.trim(); const apellido=f.get('apellido')?.trim(); const nombreCompleto=[nombre,apellido].filter(Boolean).join(' ').trim(); const dni=f.get('dni')?.trim(); const edad=f.get('edad')?.trim(); const telefono=f.get('telefono')?.trim(); const mail=f.get('mail')?.trim(); const fecha_nac=f.get('fecha_nac')?.trim()||''; const enfoque=f.get('enfoque')?.trim()||edit.enfoque||'Hipertrofia'; const observaciones=f.get('observaciones')?.trim()||''; const fecha=f.get('fecha')?.trim()
    if(!nombre) return alert('Ingresá el nombre.'); if(!apellido) return alert('Ingresá el apellido.')
    if(edad && !/^\d+$/.test(edad)) return alert('La edad debe ser un número.')
    if(dni && !/^\d+$/.test(dni)) return alert('DNI debe ser numérico.')
    if(mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return alert('Mail inválido.')
    const isUUID=String(edit.id).includes('-')
    if(!isUUID){
      try{ await api.actualizarAlumno(Number(edit.id),{nombre:nombreCompleto, telefono, email:mail||'', edad:edad?Number(edad):null});
        const cur=students.find(x=>String(x.id)===String(edit.id))
        if(cur){ await put('students',{...cur, name:nombreCompleto, apellido, dni:dni||cur.dni, phone:telefono, mail, fecha_nacimiento:fecha_nac||cur.fecha_nacimiento||'', enfoque, observaciones, joinedAt:fecha, edad:edad?Number(edad):null})}
        // actualizar extMap también
        const extKey='atlos-alumnos-ext'; const ext=JSON.parse(localStorage.getItem(extKey)||'{}'); const k=nombreCompleto.toLowerCase(); ext[k]={apellido,dni,mail,fecha_nacimiento:fecha_nac,enfoque,observaciones}; localStorage.setItem(extKey,JSON.stringify(ext))
        setEdit(null); refresh(); return
      }catch(err){ console.warn('actualizar api fallo',err.message)}
    }
    await put('students',{id:edit.id, name:nombreCompleto, apellido, dni: dni||edit.dni, phone:telefono, mail:mail||edit.mail||'', fecha_nacimiento:fecha_nac||edit.fecha_nacimiento||'', enfoque, observaciones, joinedAt:fecha||edit.joinedAt, status:edit.status||'activo', edad:edad?Number(edad):null, createdAt:edit.createdAt||new Date().toISOString()})
    // BLOQUE 4H: si este alumno tiene un POST pendiente, actualizarlo (coalescing por _localId, como clases).
    try{
      const _q=readTenantQueue();
      if(_q){
        const _id=String(edit.id);
        const _f=_q.map(it=> (it.type==='alumno' && String(it.payload?._localId||'')===_id) ? {...it, payload:{...it.payload, nombre:nombreCompleto, telefono, email:mail||'', edad:edad?Number(edad):null, fecha_ingreso:fecha||edit.joinedAt}} : it);
        writeTenantQueue(_f);
      }
    }catch{}
    // actualizar extMap para que refresh lo preserve
    { const extKey='atlos-alumnos-ext'; const ext=JSON.parse(localStorage.getItem(extKey)||'{}'); const k=nombreCompleto.toLowerCase(); ext[k]={apellido,dni,mail,fecha_nacimiento:fecha_nac,enfoque,observaciones}; localStorage.setItem(extKey,JSON.stringify(ext)) }
    setEdit(null); refresh()
  }
  return <section className="panel">
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:12}}>
      <h3 style={{margin:0,fontSize:14}}>Alumnos</h3>
      <div style={{display:'flex',gap:8}}>
        <button className="primary" onClick={onNew}>+ NUEVO ALUMNO</button>
        <button className="ghost" onClick={handleEdit}>EDITAR</button>
        <button className="ghost" onClick={handleDelete} style={{color:'var(--danger)',borderColor:'var(--danger)'}}>ELIMINAR</button>
      </div>
    </div>
    <div style={{display:'flex',gap:12,marginTop:14,alignItems:'center'}}>
      <div style={{flex:1,position:'relative'}}><span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--muted)'}}>🔍</span><input style={{width:'100%',padding:'11px 12px 11px 32px',border:'1px solid var(--card-border)',background:'var(--input)',color:'var(--text)',borderRadius:10}} placeholder="Buscar alumno..." value={query} onChange={e=>setQuery(e.target.value)}/></div>
      <span style={{fontSize:11,color:'var(--muted)',whiteSpace:'nowrap'}}>{students.length} alumnos</span>
    </div>
    <div className="cards" style={{gridTemplateColumns:'repeat(3,1fr)',marginTop:12}}><div className="stat green"><div className="stat-icon">👥</div><span>ALUMNOS</span><strong>{stats.total}</strong></div><div className="stat orange"><div className="stat-icon">📋</div><span>CON RUTINA</span><strong>{stats.conRutina}</strong></div><div className="stat blue"><div className="stat-icon">🏋</div><span>EJERCICIOS</span><strong>{stats.totalEj}</strong></div></div>
    <div style={{marginTop:14,display:'grid',gap:6}}>
      <div style={{display:'grid',gridTemplateColumns:'48px 1fr 1fr 64px 118px 108px 132px 1.5fr 1.7fr 108px',gap:14,padding:'12px 14px',fontSize:10,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--muted)',fontWeight:700,opacity:.85,alignItems:'center',borderBottom:'1px solid var(--card-border)',background:'var(--table-head)',borderRadius:'8px 8px 0 0'}}><span style={{display:'flex',alignItems:'center',justifyContent:'center'}}>ID</span><span style={{display:'flex',alignItems:'center'}}>Nombre</span><span style={{display:'flex',alignItems:'center'}}>Apellido</span><span style={{display:'flex',alignItems:'center',justifyContent:'center'}}>Edad</span><span style={{display:'flex',alignItems:'center',justifyContent:'center'}}>Enfoque</span><span style={{display:'flex',alignItems:'center',justifyContent:'center'}}>DNI</span><span style={{display:'flex',alignItems:'center',justifyContent:'center'}}>Teléfono</span><span style={{display:'flex',alignItems:'center'}}>Mail</span><span style={{display:'flex',alignItems:'center'}}>Observaciones</span><span style={{display:'flex',alignItems:'center',justifyContent:'center'}}>Ingreso</span></div>
      <div style={{display:'grid',gap:8,maxHeight:480,overflow:'auto',paddingBottom:4}}>
        {pageStudents.map(s=>{
          const isSel=String(sel)===String(s.id)
          const nombreCompleto=s.name||'-'; const apellido=s.apellido||''
          const enfoqueColor={Hipertrofia:'#22C55E',Fuerza:'#EF4444',Resistencia:'#F59E0B','Definición':'#06B6D4',Funcional:'#6366F1','Rehabilitación':'#8B5CF6'}[s.enfoque]||'var(--accent)'
          return <div key={s.id} onClick={()=>setSel(s.id)} onDoubleClick={()=>handleOpenDetail(s)} style={{display:'grid',gridTemplateColumns:'48px 1fr 1fr 64px 118px 108px 132px 1.5fr 1.7fr 108px',gap:14,alignItems:'center',background:isSel?'var(--selected)':'var(--card)',border:`1px solid ${isSel?'var(--accent)':'var(--card-border)'}`,borderLeft:isSel?'3px solid var(--accent)':'1px solid var(--card-border)',borderRadius:12,padding:'14px 14px',cursor:'pointer',transition:'.15s',boxShadow:isSel?'0 4px 14px rgba(22,143,232,.15)':'0 1px 4px rgba(0,0,0,.2)'}}>
            <span style={{fontFamily:'monospace',fontSize:10,color:'var(--muted)',background:'var(--bg)',padding:'4px 6px',borderRadius:6,justifySelf:'start'}}>{String(s.id).slice(0,6)}</span>
            <span style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}} onClick={(e)=>{e.stopPropagation(); handleOpenDetail(s)}}><span style={{width:28,height:28,borderRadius:8,background:'var(--selected)',color:'var(--accent)',display:'grid',placeItems:'center',fontWeight:800,fontSize:12,flexShrink:0}}>{nombreCompleto[0]?.toUpperCase()}</span><b style={{fontSize:13,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',textDecoration:'underline',textDecorationColor:'var(--accent)'}}>{nombreCompleto}</b></span>
            <span style={{fontSize:13,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{apellido||'—'}</span>
            <span style={{display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{background:'var(--bg)',padding:'4px 8px',borderRadius:8,fontSize:12,fontWeight:700}}>{s.edad||'—'}</span></span>
            <span style={{display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{background:enfoqueColor+'18',color:enfoqueColor,border:`1px solid ${enfoqueColor}30`,padding:'4px 8px',borderRadius:999,fontSize:10,fontWeight:800,whiteSpace:'nowrap'}}>{s.enfoque||'—'}</span></span>
            <span style={{display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'monospace',fontSize:11,color:'var(--muted)'}}>{s.dni||'—'}</span>
            <span style={{display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,color:'var(--text)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.phone||'—'}</span>
            <span style={{fontSize:11,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:s.mail||s.email?'var(--accent)':'var(--muted)'}}>{s.mail||s.email||'—'}</span>
            <span style={{fontSize:11,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:s.observaciones?'var(--text)':'var(--muted)',fontStyle:s.observaciones?'normal':'italic'}} title={s.observaciones||''}>{s.observaciones||'—'}</span>
            <span style={{display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,color:'var(--muted)',whiteSpace:'nowrap'}}>{s.joinedAt}</span>
          </div>
        })}
        {!students.length&&<Empty text="No hay alumnos. Registrá el primero con + NUEVO ALUMNO."/>}
      </div>
              {students.length>pageSize&&<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:10,padding:'8px 4px',fontSize:12,color:'var(--muted)'}}><span>Mostrando {(page-1)*pageSize+1}-{Math.min(page*pageSize,students.length)} de {students.length}</span><div style={{display:'flex',gap:8}}><button className="ghost" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>‹ Anterior</button><span style={{alignSelf:'center',fontWeight:700}}>{page} / {totalPages}</span><button className="ghost" disabled={page>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Siguiente ›</button></div></div>}
{selected&&<div style={{padding:'8px 12px',fontSize:11,color:'var(--muted)',background:'var(--selected)',border:'1px solid var(--card-border)',borderRadius:8}}>Seleccionado: {selected.name} · Doble click para detalle · EDITAR/ELIMINAR</div>}
    </div>
    {edit&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setEdit(null)}}><div className="modal" style={{maxHeight:'90vh',overflow:'auto'}}><div className="modal-head"><h3>Editar Alumno</h3><button onClick={()=>setEdit(null)}>×</button></div>
      <form onSubmit={saveEdit} onKeyDown={onEnterNext} className="form">
        <div className="form2"><label>Nombre*<input name="nombre" defaultValue={edit.name?.split(' ')[0]||edit.name} required/></label><label>Apellido*<input name="apellido" defaultValue={edit.apellido||edit.name?.split(' ').slice(1).join(' ')||''} required/></label></div>
        <div className="form2"><label>Edad<input name="edad" defaultValue={edit.edad||''} placeholder="Ej. 25"/></label><label>DNI<input name="dni" defaultValue={edit.dni||''} placeholder="Solo números"/></label></div>
        <label>Fecha de nacimiento<input name="fecha_nac" type="date" defaultValue={edit.fecha_nacimiento||''} /></label>
        <div className="form2"><label>Enfoque<select name="enfoque" defaultValue={edit.enfoque||'Hipertrofia'}><option>Hipertrofia</option><option>Fuerza</option><option>Resistencia</option><option>Definición</option><option>Funcional</option><option>Rehabilitación</option></select></label><label>Nro de teléfono<input name="telefono" defaultValue={edit.phone||''} placeholder="221 555-0100"/></label></div>
        <label>Mail<input name="mail" type="email" defaultValue={edit.mail||edit.email||''} placeholder="ej@mail.com"/></label>
        <label>Observaciones<textarea name="observaciones" defaultValue={edit.observaciones||''} rows="2" placeholder="Alergias, lesiones, objetivos..." style={{resize:'vertical',border:'1px solid var(--card-border)',background:'var(--input)',color:'var(--text)',borderRadius:10,padding:'10px'}}/></label>
        <label>Fecha de ingreso (DD/MM/AAAA)<input name="fecha" defaultValue={edit.joinedAt||today()} required/></label>
        <button className="primary wide">GUARDAR CAMBIOS</button>
      </form>
    </div></div>}
    {detail&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setDetail(null)}}><div className="modal" style={{width:'min(720px,95vw)',maxHeight:'90vh',overflow:'auto'}}><div className="modal-head"><h3>{detail.name}</h3><button onClick={()=>setDetail(null)}>×</button></div>
      {(()=>{ const pagosAlum=payments.filter(p=>String(p.studentId)===String(detail.id)); const ultimoPago=pagosAlum.slice().sort((a,b)=> parseFecha(b.date)-parseFecha(a.date))[0]; const estadoCuota=(()=>{ if(!ultimoPago) return {label:'Sin pagos',color:'#94A3B8',dot:'🔴'}; const pd=parseFecha(ultimoPago.date); if(!pd) return {label:'Vencida',color:'#EF4444',dot:'🔴'}; const venc=new Date(pd); venc.setDate(venc.getDate()+30); const diff=Math.ceil((venc - new Date())/86400000); if(diff<0) return {label:'Vencida',color:'#EF4444',dot:'🔴'}; if(diff<=5) return {label:`Por vencer (${diff}d)`,color:'#F59E0B',dot:'🟡'}; return {label:`Al día (${diff}d)`,color:'#22C55E',dot:'🟢'} })(); const asistAlum=attendance.filter(a=>String(a.studentId)===String(detail.id)); const ultimoIng=asistAlum.slice().sort((a,b)=> parseFecha(b.date)-parseFecha(a.date))[0]; const asistMes=asistAlum.filter(a=> isSameMonth(a.date, today())).length; const rutinaAlum=routines.filter(r=>String(r.studentId||r.alumno_id)===String(detail.id)); return <>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
          <div style={{background:'var(--bg)',border:'1px solid var(--card-border)',borderRadius:12,padding:12}}>
            <div style={{fontSize:11,letterSpacing:'.06em',color:'var(--muted)',fontWeight:700,marginBottom:8}}>DATOS PERSONALES</div>
            <div style={{display:'grid',gap:6,fontSize:13}}><div><b>Nombre:</b> {detail.name}</div><div><b>DNI:</b> {detail.dni||'—'}</div><div><b>Edad:</b> {detail.edad||'—'}</div><div><b>Nacimiento:</b> {detail.fecha_nacimiento? toDisplay(detail.fecha_nacimiento):'—'}</div><div><b>Tel:</b> {detail.phone||'—'}</div><div><b>Mail:</b> {detail.mail||detail.email||'—'}</div><div><b>Ingreso:</b> {detail.joinedAt}</div><div><b>Enfoque:</b> {detail.enfoque||detail.goal||'—'}</div></div>
          </div>
          <div style={{background:'var(--bg)',border:'1px solid var(--card-border)',borderRadius:12,padding:12}}>
            <div style={{fontSize:11,letterSpacing:'.06em',color:'var(--muted)',fontWeight:700,marginBottom:8}}>ESTADO</div>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}><span style={{fontSize:18}}>{estadoCuota.dot}</span><span style={{background: estadoCuota.color+'18',color:estadoCuota.color,padding:'4px 8px',borderRadius:999,fontSize:11,fontWeight:800,border:`1px solid ${estadoCuota.color}30`}}>{estadoCuota.label}</span></div>
            <div style={{display:'grid',gap:6,fontSize:12}}><div><b>Último ingreso:</b> {ultimoIng? `${toDisplay(ultimoIng.date)} ${ultimoIng.time||''}`:'—'}</div><div><b>Asistencias del mes:</b> {asistMes}</div><div><b>Rutina actual:</b> {rutinaAlum.length? `${rutinaAlum.length} ejercicios`:'Sin rutina'}</div>{rutinaAlum.slice(0,2).map(r=><div key={r.id} style={{fontSize:11,color:'var(--muted)'}}>• {r.exercise||r.ejercicio} {r.day?'· '+r.day:''}</div>)}</div>
          </div>
        </div>
        <div style={{background:'var(--bg)',border:'1px solid var(--card-border)',borderRadius:12,padding:12,marginBottom:12}}>
          <div style={{fontSize:11,letterSpacing:'.06em',color:'var(--muted)',fontWeight:700,marginBottom:8}}>HISTORIAL DE PAGOS</div>
          {pagosAlum.length? pagosAlum.slice(-5).reverse().map(p=><div key={p.id} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--card-border)',fontSize:12}}><span>{toDisplay(p.date)} · {p.note||'Cuota'}</span><span style={{fontWeight:700}}>{money(p.amount)}</span></div>) : <div style={{fontSize:12,color:'var(--muted)'}}>Sin pagos registrados</div>}
        </div>
        {(detail.observaciones||detail.enfoque||detail.goal)&&<div style={{background:'var(--bg)',border:'1px solid var(--card-border)',borderRadius:12,padding:12,marginBottom:12}}>
          {detail.observaciones&&<div style={{fontSize:12,marginBottom:6}}><b>Observaciones:</b> {detail.observaciones}</div>}
          <div style={{fontSize:12}}><b>Objetivo:</b> {detail.enfoque||detail.goal||'—'}</div>
        </div>}
        <div style={{background:'var(--bg)',border:'1px solid var(--card-border)',borderRadius:12,padding:12,marginBottom:12}}>
          <div style={{fontSize:11,letterSpacing:'.06em',color:'var(--muted)',fontWeight:700,marginBottom:8}}>WHATSAPP INTEGRADO</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <button className="ghost" onClick={()=>{ const tel=String(detail.phone||'').replace(/[^0-9]/g,''); if(!tel) return alert('Sin teléfono'); const venc=(()=>{ const p=pagosAlum.slice().sort((a,b)=> parseFecha(b.date)-parseFecha(a.date))[0]; if(!p) return '10/09'; const d=parseFecha(p.date); if(!d) return '10/09'; d.setDate(d.getDate()+30); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}` })(); const msg=encodeURIComponent(`Hola ${detail.name.split(' ')[0]} 👋\nTe recordamos que tu cuota de ATLOS Gym vence el día ${venc}.\n¡Gracias por entrenar con nosotros! 💪`); window.open(`whatsapp://send?phone=549${tel}&text=${msg}`,'_blank') }} style={{background:'#25D366',color:'#fff',border:'1px solid #25D366',fontSize:11}}>Enviar recordatorio de cuota</button>
            <button className="ghost" onClick={()=>{ const tel=String(detail.phone||'').replace(/[^0-9]/g,''); if(!tel) return alert('Sin teléfono'); const venc=(()=>{ const p=pagosAlum.slice().sort((a,b)=> parseFecha(b.date)-parseFecha(a.date))[0]; if(!p) return '10/09'; const d=parseFecha(p.date); if(!d) return '10/09'; d.setDate(d.getDate()+30); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}` })(); const msg=encodeURIComponent(`Hola ${detail.name.split(' ')[0]} 👋\nTe recordamos que tu cuota de ATLOS Gym vence el día ${venc}.\n¡Gracias por entrenar con nosotros! 💪`); window.open(`whatsapp://send?phone=549${tel}&text=${msg}`,'_blank') }} style={{fontSize:11}}>Mensaje automático</button>
            <button className="ghost" onClick={()=>{ const tel=String(detail.phone||'').replace(/[^0-9]/g,''); if(!tel) return alert('Sin teléfono'); const msg=encodeURIComponent(`Hola ${detail.name.split(' ')[0]} 👋\nTe recordamos que tu cuota vence pronto. ¡No te quedes sin entrenar! 💪`); window.open(`whatsapp://send?phone=549${tel}&text=${msg}`,'_blank') }} style={{fontSize:11}}>Recordatorio de vencimiento</button>
            <button className="ghost" onClick={()=>{ const tel=String(detail.phone||'').replace(/[^0-9]/g,''); if(!tel) return alert('Sin teléfono'); const msg=encodeURIComponent(`Hola ${detail.name.split(' ')[0]} 👋\nTu cuota está vencida. Por favor regularizá tu situación para seguir entrenando. ¡Te esperamos! 🔴`); window.open(`whatsapp://send?phone=549${tel}&text=${msg}`,'_blank') }} style={{fontSize:11,borderColor:'#EF4444',color:'#EF4444'}}>Aviso de cuota vencida</button>
            <button className="ghost" onClick={()=>{ const tel=String(detail.phone||'').replace(/[^0-9]/g,''); if(!tel) return alert('Sin teléfono'); const msg=encodeURIComponent(`¡Feliz cumpleaños ${detail.name.split(' ')[0]}! 🎂🥳\nTe desea todo el equipo de ATLOS Gym. ¡Que tengas un gran día! 🎉`); window.open(`whatsapp://send?phone=549${tel}&text=${msg}`,'_blank') }} style={{fontSize:11,borderColor:'#EC4899',color:'#EC4899'}}>🎂 Feliz cumpleaños</button>
            <button className="ghost" onClick={()=>{ const tel=String(detail.phone||'').replace(/[^0-9]/g,''); if(!tel) return alert('Sin teléfono'); const last=asistAlum.slice().sort((a,b)=> parseFecha(b.date)-parseFecha(a.date))[0]; const dias=last? Math.floor((new Date() - parseFecha(last.date))/86400000) : 7; const msg=encodeURIComponent(`Hola ${detail.name.split(' ')[0]} 👋\nNotamos que no venís hace ${dias} días. ¡Te esperamos para retomar! 💪`); window.open(`whatsapp://send?phone=549${tel}&text=${msg}`,'_blank') }} style={{fontSize:11,borderColor:'#F97316',color:'#F97316'}}>Aviso de ausencia</button>
            
            <button className="ghost" onClick={()=>{ const tel=String(detail.phone||'').replace(/[^0-9]/g,''); if(!tel) return alert('Sin teléfono'); const msg=encodeURIComponent(`Hola ${detail.name}! Te habla ATLOS. Te quedan pocos días de cuota.`); window.open(`whatsapp://send?phone=549${tel}&text=${msg}`,'_blank') }} style={{fontSize:11,background:'#25D366',color:'#fff',border:'1px solid #25D366'}}>WhatsApp directo</button>
          </div>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button className="primary" onClick={()=>{ setDetail(null); if(onRenew) onRenew(detail); else { setEdit(detail) } }} style={{flex:1}}>Renovar cuota</button>
          <button className="ghost" onClick={()=>{setDetail(null); setEdit(detail)}}>Editar</button>
          <button className="ghost" onClick={()=>setDetail(null)}>Cerrar</button>
        </div>
      </>})()}
    </div></div>}
  </section>
}
