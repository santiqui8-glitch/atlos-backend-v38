import React, { useState, useEffect } from 'react'
import { api, readTenantQueue, writeTenantQueue, sameQueueContext, newOperationId } from '../services/api'
import { tenantGetJSON, tenantSetJSON, pushDeletedId } from '../services/tenant'
import { list, put, remove } from '../services/db'
import { money, today, parseFecha, toDisplay, isSameMonth, onEnterNext } from '../utils/helpers.js'
import { estadoMembresia } from '../utils/membresia.js'
import { Empty } from '../components/ui.jsx'


export default function VistaPlanificacion({students,query,setQuery,stats,payments=[],attendance=[],routines=[],planes=[],membresias=[],onNew,onRenew,refresh}){
  const [sel,setSel]=useState(null)
  const [edit,setEdit]=useState(null)
  const [detail,setDetail]=useState(null)
  const [page,setPage]=useState(1)
  const pageSize=20
  // V44-F: filtros locales por estado de membresía y plan (sin API nueva).
  const [fEstado,setFEstado]=useState('todos')
  const [fPlan,setFPlan]=useState('todos')
  const emDe=(s)=>estadoMembresia(s,{pagos:payments,membresias,planes});
  useEffect(()=>{ setPage(1) },[query, students.length, fEstado, fPlan])
  const filtrados=students.filter(s=>{
    if(fEstado!=='todos' && emDe(s).estado!==fEstado) return false;
    if(fPlan==='sin-plan'){ const e=emDe(s); if(e.fuente==='membresia') return false; }
    else if(fPlan!=='todos'){ const e=emDe(s); if(String(e.planId??'')!==String(fPlan)) return false; }
    return true;
  });
  const totalPages=Math.max(1, Math.ceil(filtrados.length/pageSize))
  const pageStudents=filtrados.slice((page-1)*pageSize, page*pageSize)
  const hayFiltro=Boolean(query)||fEstado!=='todos'||fPlan!=='todos';
  const emptyTxt=hayFiltro?'Sin resultados para la búsqueda o filtros.':'No hay alumnos. Registrá el primero con + Nuevo alumno.';
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
        const _f=_q.filter(it=>!(it.type==='alumno' && String(it.payload?._localId||'')===_id && sameQueueContext(it)));
        if(_f.length!==_q.length) writeTenantQueue(_f);
      }
    }catch{}
    pushDeletedId('deleted-alumnos',target.id)
    pushDeletedId('deleted-alumnos-names',target.name.toLowerCase())
    const ext=tenantGetJSON('alumnos-ext',{}); delete ext[target.name.toLowerCase()]; tenantSetJSON('alumnos-ext',ext)
    // borrar pagos y asistencia locales de ese alumno
    for(const p of await list('payments')){ if(String(p.studentId)===String(target.id) || (p.alumnoNombre&&p.alumnoNombre.toLowerCase()===target.name.toLowerCase())) await remove('payments',p.id) }
    for(const a of await list('attendance')){ if(String(a.studentId)===String(target.id)) await remove('attendance',a.id) }
    // BLOQUE 4P: cascada local — borrar inscripciones del alumno eliminado.
    try{
      const _ins=tenantGetJSON('inscripciones',[]);
      const _ids=[target.id,target.serverId].filter(Boolean).map(String);
      const _f=_ins.filter(x=>!_ids.includes(String(x.alumno_id??'')));
      if(_f.length!==_ins.length) tenantSetJSON('inscripciones',_f);
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
      try{ await api.actualizarAlumno(Number(edit.id),{nombre:nombreCompleto, telefono, email:mail||'', edad:edad?Number(edad):null},{operationId:newOperationId()});
        const cur=students.find(x=>String(x.id)===String(edit.id))
        if(cur){ await put('students',{...cur, name:nombreCompleto, apellido, dni:dni||cur.dni, phone:telefono, mail, fecha_nacimiento:fecha_nac||cur.fecha_nacimiento||'', enfoque, observaciones, joinedAt:fecha, edad:edad?Number(edad):null})}
        // actualizar extMap también
        const ext=tenantGetJSON('alumnos-ext',{}); const k=nombreCompleto.toLowerCase(); ext[k]={apellido,dni,mail,fecha_nacimiento:fecha_nac,enfoque,observaciones}; tenantSetJSON('alumnos-ext',ext)
        setEdit(null); refresh(); return
      }catch(err){ console.warn('actualizar api fallo',err.message)}
    }
    await put('students',{id:edit.id, name:nombreCompleto, apellido, dni: dni||edit.dni, phone:telefono, mail:mail||edit.mail||'', fecha_nacimiento:fecha_nac||edit.fecha_nacimiento||'', enfoque, observaciones, joinedAt:fecha||edit.joinedAt, status:edit.status||'activo', edad:edad?Number(edad):null, createdAt:edit.createdAt||new Date().toISOString()})
    // BLOQUE 4H: si este alumno tiene un POST pendiente, actualizarlo (coalescing por _localId, como clases).
    try{
      const _q=readTenantQueue();
      if(_q){
        const _id=String(edit.id);
        const _f=_q.map(it=> (it.type==='alumno' && String(it.payload?._localId||'')===_id && sameQueueContext(it)) ? {...it, payload:{...it.payload, nombre:nombreCompleto, telefono, email:mail||'', edad:edad?Number(edad):null, fecha_ingreso:fecha||edit.joinedAt}} : it);
        writeTenantQueue(_f);
      }
    }catch{}
    // actualizar extMap para que refresh lo preserve
    { const ext=tenantGetJSON('alumnos-ext',{}); const k=nombreCompleto.toLowerCase(); ext[k]={apellido,dni,mail,fecha_nacimiento:fecha_nac,enfoque,observaciones}; tenantSetJSON('alumnos-ext',ext) }
    setEdit(null); refresh()
  }
  return <section className="panel">
    <div className="page-head">
      <div><h2>Alumnos</h2><p>{students.length} alumnos registrados</p></div>
      <div className="page-actions">
        <button className="primary" onClick={onNew}>+ Nuevo alumno</button>
        <button className="ghost" onClick={handleEdit}>Editar</button>
        <button className="ghost danger" onClick={handleDelete}>Eliminar</button>
      </div>
    </div>
    <div className="toolbar">
      <div className="search-wrap"><input className="field-search" aria-label="Buscar alumno" placeholder="🔎 Buscar por nombre, apellido, DNI o teléfono..." value={query} onChange={e=>setQuery(e.target.value)}/></div>
      <select className="field" style={{maxWidth:170}} aria-label="Filtrar por estado" value={fEstado} onChange={e=>setFEstado(e.target.value)}>
        <option value="todos">Todos los estados</option>
        <option value="vigente">Al día</option>
        <option value="por_vencer">Por vencer</option>
        <option value="vencida">Vencidos</option>
        <option value="sin_pagos">Sin pagos</option>
        <option value="cancelada">Cancelada</option>
      </select>
      <select className="field" style={{maxWidth:180}} aria-label="Filtrar por plan" value={fPlan} onChange={e=>setFPlan(e.target.value)}>
        <option value="todos">Todos los planes</option>
        <option value="sin-plan">Sin membresía</option>
        {planes.filter(p=>p.activo).map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}
      </select>
    </div>
    <div className="cards" style={{gridTemplateColumns:'repeat(3,1fr)',marginTop:0}}><div className="stat green"><div className="stat-icon" aria-hidden="true">👥</div><span>Alumnos</span><strong>{stats.total}</strong></div><div className="stat accent"><div className="stat-icon" aria-hidden="true">📋</div><span>Con rutina</span><strong>{stats.conRutina}</strong></div><div className="stat blue"><div className="stat-icon" aria-hidden="true">🏋</div><span>Ejercicios</span><strong>{stats.totalEj}</strong></div></div>
    <div style={{marginTop:14,display:'grid',gap:6}}>
      <div className="alumnos-table">
      <div className="grid-planificacion alumnos-head"><span></span><span style={{display:'flex',alignItems:'center'}}>Alumno</span><span style={{display:'flex',alignItems:'center'}}>Contacto</span><span style={{display:'flex',alignItems:'center'}}>Plan</span><span style={{display:'flex',alignItems:'center'}}>Estado</span><span style={{display:'flex',alignItems:'center'}}>Vencimiento</span><span></span></div>
      <div style={{display:'grid',maxHeight:480,overflow:'auto'}}>
        {pageStudents.map(s=>{
          const isSel=String(sel)===String(s.id)
          const nombreCompleto=[s.name,s.apellido].filter(Boolean).join(' ')||'-';
          const em=emDe(s);
          const pill=em.estado==='vigente'?['Al día','badge']:em.estado==='por_vencer'?[`Por vencer (${em.dias}d)`,'badge warn']:em.estado==='cancelada'?['Cancelada','badge neutral']:em.estado==='sin_pagos'?['Sin pagos','badge neutral']:['Vencida','badge vencido'];
          return <div key={s.id} onClick={()=>setSel(s.id)} onDoubleClick={()=>handleOpenDetail(s)} className={isSel?'grid-planificacion alumnos-row sel':'grid-planificacion alumnos-row'} role="row" tabIndex={0} aria-selected={isSel} aria-label={`${nombreCompleto}, ${pill[0]}`} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();setSel(s.id)}}}>
            <span className="avatar" aria-hidden="true">{(nombreCompleto[0]||'A').toUpperCase()}</span>
            <span style={{display:'block',minWidth:0,cursor:'pointer'}} onClick={(e)=>{e.stopPropagation(); handleOpenDetail(s)}}><b style={{fontSize:13,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',display:'block',textDecoration:'underline',textDecorationColor:'var(--accent)'}}>{nombreCompleto}</b><small className="muted-text" style={{fontFamily:'monospace'}}>DNI {s.dni||'—'}</small></span>
            <span style={{fontSize:12,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.phone||'—'}</span>
            <span style={{fontSize:12,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{em.planNombre||'—'}</span>
            <span><span className={pill[1]}>{pill[0]}</span></span>
            <span style={{fontSize:11,color:'var(--muted)',whiteSpace:'nowrap'}}>{em.vencimiento?toDisplay(em.vencimiento):'—'}</span>
            <span aria-hidden="true" style={{color:'var(--faint)',fontWeight:800}}>›</span>
          </div>
        })}
        {!filtrados.length&&<Empty text={emptyTxt}/>}
      </div>
      </div>
              {filtrados.length>pageSize&&<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:10,padding:'8px 4px',fontSize:12,color:'var(--muted)'}}><span>Mostrando {(page-1)*pageSize+1}-{Math.min(page*pageSize,filtrados.length)} de {filtrados.length}</span><div style={{display:'flex',gap:8}}><button className="ghost sm" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>‹ Anterior</button><span style={{alignSelf:'center',fontWeight:700}}>{page} / {totalPages}</span><button className="ghost sm" disabled={page>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Siguiente ›</button></div></div>}
{selected&&<div style={{padding:'8px 12px',fontSize:11,color:'var(--muted)',background:'var(--selected)',border:'1px solid var(--card-border)',borderRadius:8}}>Seleccionado: {selected.name} · Doble click para detalle · Editar/Eliminar</div>}
    </div>
    {edit&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setEdit(null)}}><div className="modal" style={{maxHeight:'90vh',overflow:'auto'}}><div className="modal-head"><h3>Editar Alumno</h3><button onClick={()=>setEdit(null)} aria-label="Cerrar">×</button></div>
      <form onSubmit={saveEdit} onKeyDown={onEnterNext} className="form">
        <div className="form2"><label>Nombre*<input name="nombre" defaultValue={edit.name?.split(' ')[0]||edit.name} required/></label><label>Apellido*<input name="apellido" defaultValue={edit.apellido||edit.name?.split(' ').slice(1).join(' ')||''} required/></label></div>
        <div className="form2"><label>Edad<input name="edad" defaultValue={edit.edad||''} placeholder="Ej. 25"/></label><label>DNI<input name="dni" defaultValue={edit.dni||''} placeholder="Solo números"/></label></div>
        <label>Fecha de nacimiento<input name="fecha_nac" type="date" defaultValue={edit.fecha_nacimiento||''} /></label>
        <div className="form2"><label>Enfoque<select name="enfoque" defaultValue={edit.enfoque||'Hipertrofia'}><option>Hipertrofia</option><option>Fuerza</option><option>Resistencia</option><option>Definición</option><option>Funcional</option><option>Rehabilitación</option></select></label><label>Nro de teléfono<input name="telefono" defaultValue={edit.phone||''} placeholder="221 555-0100"/></label></div>
        <label>Mail<input name="mail" type="email" defaultValue={edit.mail||edit.email||''} placeholder="ej@mail.com"/></label>
        <label>Observaciones<textarea name="observaciones" defaultValue={edit.observaciones||''} rows="2" placeholder="Alergias, lesiones, objetivos..." style={{resize:'vertical',border:'1px solid var(--card-border)',background:'var(--input)',color:'var(--text)',borderRadius:10,padding:'10px'}}/></label>
        <label>Fecha de ingreso (DD/MM/AAAA)<input name="fecha" defaultValue={edit.joinedAt||today()} required/></label>
        <button className="primary wide">Guardar cambios</button>
      </form>
    </div></div>}
    {detail&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setDetail(null)}}><div className="modal" style={{width:'min(720px,95vw)',maxHeight:'90vh',overflow:'auto'}}><div className="modal-head"><h3 style={{display:'flex',alignItems:'center',gap:10}}><span className="avatar" aria-hidden="true">{(detail.name?.[0]||'A').toUpperCase()}</span>{detail.name}{(()=>{ const e=estadoMembresia(detail,{pagos:payments,membresias,planes}); const lbl=e.estado==='vigente'?'Al día':e.estado==='por_vencer'?'Por vencer':e.estado==='cancelada'?'Cancelada':e.estado==='sin_pagos'?'Sin pagos':'Vencida'; const cls=e.estado==='vigente'?'badge':e.estado==='por_vencer'?'badge warn':(e.estado==='sin_pagos'||e.estado==='cancelada')?'badge neutral':'badge vencido'; return <span className={cls}>{lbl}</span> })()}</h3><button onClick={()=>setDetail(null)} aria-label="Cerrar">×</button></div>
      {(()=>{ const pagosAlum=payments.filter(p=>String(p.studentId)===String(detail.id));
        // V44-E: fuente unica de estado/vencimiento (membresia canonica o fallback +30).
        const em=estadoMembresia(detail,{pagos:payments,membresias,planes});
        const estadoCuota=em.estado==='vigente'?{label:`Al día (${em.dias}d)`,color:'var(--success)',dot:'🟢'}:em.estado==='por_vencer'?{label:`Por vencer (${em.dias}d)`,color:'var(--warning)',dot:'🟡'}:em.estado==='cancelada'?{label:'Cancelada',color:'var(--muted)',dot:'⚪'}:em.estado==='sin_pagos'?{label:'Sin pagos',color:'var(--muted)',dot:'🔴'}:{label:'Vencida',color:'var(--danger)',dot:'🔴'};
        const asistAlum=attendance.filter(a=>String(a.studentId)===String(detail.id)); const ultimoIng=asistAlum.slice().sort((a,b)=> parseFecha(b.date)-parseFecha(a.date))[0]; const asistMes=asistAlum.filter(a=> isSameMonth(a.date, today())).length; const rutinaAlum=routines.filter(r=>String(r.studentId||r.alumno_id)===String(detail.id)); return <>
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
          <div style={{fontSize:11,letterSpacing:'.06em',color:'var(--muted)',fontWeight:700,marginBottom:8}}>MEMBRESÍA</div>
          {em.fuente==='membresia'
            ? <div style={{display:'grid',gap:6,fontSize:12}}><div><b>Plan:</b> {em.planNombre||'—'}{em.precio!=null?` · ${money(em.precio)}`:''}</div><div><b>Inicio:</b> {em.inicio?toDisplay(em.inicio):'—'}</div><div><b>Vencimiento:</b> {em.vencimiento?toDisplay(em.vencimiento):'—'}</div></div>
            : <div style={{fontSize:12,color:'var(--muted)'}}>Sin membresía — se usa último pago + 30 días.<br/>El flujo completo de planes llega en E-09.</div>}
        </div>
        {(()=>{ const hist=membresias.filter(m=>String(m.alumno_id)===String(detail.id)).slice().sort((a,b)=>String(b.fecha_vencimiento||'')>String(a.fecha_vencimiento||'')?1:-1); if(!hist.length) return null; return <div style={{background:'var(--bg)',border:'1px solid var(--card-border)',borderRadius:12,padding:12,marginBottom:12}}>
          <div style={{fontSize:11,letterSpacing:'.06em',color:'var(--muted)',fontWeight:700,marginBottom:8}}>HISTORIAL DE MEMBRESÍAS</div>
          {hist.map(m=>{ const pl=planes.find(p=>String(p.id)===String(m.plan_id)); return <div key={m.id} style={{display:'flex',justifyContent:'space-between',gap:8,padding:'6px 0',borderBottom:'1px solid var(--card-border)',fontSize:12}}><span>{pl?.nombre||'Plan'} · {m.fecha_inicio?toDisplay(m.fecha_inicio):'—'} → {m.fecha_vencimiento?toDisplay(m.fecha_vencimiento):'—'}</span><span className={m.estado==='vigente'?'badge':m.estado==='cancelada'?'badge neutral':'badge vencido'}>{m.estado==='vigente'?'Vigente':m.estado==='cancelada'?'Cancelada':'Vencida'}</span></div> })}
        </div> })()}
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
            <button className="ghost" onClick={()=>{ const tel=String(detail.phone||'').replace(/[^0-9]/g,''); if(!tel) return alert('Sin teléfono'); const venc=(()=>{ const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(em.vencimiento||''); return m?`${m[3]}/${m[2]}`:'—' })(); const msg=encodeURIComponent(`Hola ${detail.name.split(' ')[0]} 👋\nTe recordamos que tu cuota de ATLOS Gym vence el día ${venc}.\n¡Gracias por entrenar con nosotros! 💪`); window.open(`whatsapp://send?phone=549${tel}&text=${msg}`,'_blank') }} style={{background:'var(--whatsapp)',color:'#fff',border:'1px solid var(--whatsapp)',fontSize:11}}>Enviar recordatorio de cuota</button>
            <button className="ghost" onClick={()=>{ const tel=String(detail.phone||'').replace(/[^0-9]/g,''); if(!tel) return alert('Sin teléfono'); const venc=(()=>{ const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(em.vencimiento||''); return m?`${m[3]}/${m[2]}`:'—' })(); const msg=encodeURIComponent(`Hola ${detail.name.split(' ')[0]} 👋\nTe recordamos que tu cuota de ATLOS Gym vence el día ${venc}.\n¡Gracias por entrenar con nosotros! 💪`); window.open(`whatsapp://send?phone=549${tel}&text=${msg}`,'_blank') }} style={{fontSize:11}}>Mensaje automático</button>
            <button className="ghost" onClick={()=>{ const tel=String(detail.phone||'').replace(/[^0-9]/g,''); if(!tel) return alert('Sin teléfono'); const msg=encodeURIComponent(`Hola ${detail.name.split(' ')[0]} 👋\nTe recordamos que tu cuota vence pronto. ¡No te quedes sin entrenar! 💪`); window.open(`whatsapp://send?phone=549${tel}&text=${msg}`,'_blank') }} style={{fontSize:11}}>Recordatorio de vencimiento</button>
            <button className="ghost" onClick={()=>{ const tel=String(detail.phone||'').replace(/[^0-9]/g,''); if(!tel) return alert('Sin teléfono'); const msg=encodeURIComponent(`Hola ${detail.name.split(' ')[0]} 👋\nTu cuota está vencida. Por favor regularizá tu situación para seguir entrenando. ¡Te esperamos! 🔴`); window.open(`whatsapp://send?phone=549${tel}&text=${msg}`,'_blank') }} style={{fontSize:11,borderColor:'var(--danger)',color:'var(--danger)'}}>Aviso de cuota vencida</button>
            <button className="ghost" onClick={()=>{ const tel=String(detail.phone||'').replace(/[^0-9]/g,''); if(!tel) return alert('Sin teléfono'); const msg=encodeURIComponent(`¡Feliz cumpleaños ${detail.name.split(' ')[0]}! 🎂🥳\nTe desea todo el equipo de ATLOS Gym. ¡Que tengas un gran día! 🎉`); window.open(`whatsapp://send?phone=549${tel}&text=${msg}`,'_blank') }} style={{fontSize:11,borderColor:'var(--accent-pink)',color:'var(--accent-pink)'}}>🎂 Feliz cumpleaños</button>
            <button className="ghost" onClick={()=>{ const tel=String(detail.phone||'').replace(/[^0-9]/g,''); if(!tel) return alert('Sin teléfono'); const last=asistAlum.slice().sort((a,b)=> parseFecha(b.date)-parseFecha(a.date))[0]; const dias=last? Math.floor((new Date() - parseFecha(last.date))/86400000) : 7; const msg=encodeURIComponent(`Hola ${detail.name.split(' ')[0]} 👋\nNotamos que no venís hace ${dias} días. ¡Te esperamos para retomar! 💪`); window.open(`whatsapp://send?phone=549${tel}&text=${msg}`,'_blank') }} style={{fontSize:11,borderColor:'var(--brand-secondary)',color:'var(--brand-secondary)'}}>Aviso de ausencia</button>
            
            <button className="ghost" onClick={()=>{ const tel=String(detail.phone||'').replace(/[^0-9]/g,''); if(!tel) return alert('Sin teléfono'); const msg=encodeURIComponent(`Hola ${detail.name}! Te habla ATLOS. Te quedan pocos días de cuota.`); window.open(`whatsapp://send?phone=549${tel}&text=${msg}`,'_blank') }} style={{fontSize:11,background:'var(--whatsapp)',color:'#fff',border:'1px solid var(--whatsapp)'}}>WhatsApp directo</button>
          </div>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button className="primary" onClick={()=>{ setDetail(null); if(onRenew) onRenew(detail); else { setEdit(detail) } }} style={{flex:1}}>Renovar cuota</button>
          <button className="ghost" title="Abrir cobro para elegir otro plan (el backend cierra la anterior)" onClick={()=>{ setDetail(null); if(onRenew) onRenew(detail); else { setEdit(detail) } }}>Cambiar plan</button>
          <button className="ghost" onClick={()=>{setDetail(null); setEdit(detail)}}>Editar</button>
          <button className="ghost" onClick={()=>setDetail(null)}>Cerrar</button>
        </div>
      </>})()}
    </div></div>}
  </section>
}
