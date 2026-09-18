import React, { useEffect, useMemo, useState, useReducer } from 'react'
import { list, put, remove, seed } from './services/db'
import { api, setToken, getRole, clearAuth, isTokenValid, queuePush, getGymHWID, esErrorDeRed, startSession, adoptOwnQueueItems } from './services/api'
import { startSync, stopSync } from './services/sync'
import { tenantGetJSON, tenantSetJSON, clearTenantEntityData, getCurrentTenant } from './services/tenant'
import { today, fmtHoy, parseFecha, toISO, toDisplay, isSameMonth } from './utils/helpers.js'
import logo from './assets/logo.png'
import Login from './components/Login.jsx'
import GymGate from './components/GymGate.jsx'
import Modal from './components/Modal.jsx'
import { StudentForm, PaymentForm, RoutineForm, ClaseForm, ProfesorForm, UsuarioForm } from './components/forms.jsx'
import VistaInicio from './pages/VistaInicio.jsx'
import VistaGestion from './pages/VistaGestion.jsx'
import VistaReportes from './pages/VistaReportes.jsx'
import VistaPlanificacion from './pages/VistaPlanificacion.jsx'
import VistaAsistencia from './pages/VistaAsistencia.jsx'
import VistaClases from './pages/VistaClases.jsx'
import VistaPlanes from './pages/VistaPlanes.jsx'
import VistaProfesores from './pages/VistaProfesores.jsx'
import VistaPersonal from './pages/VistaPersonal.jsx'
import VistaLicencias from './pages/VistaLicencias.jsx'

// BLOQUE 4F: guards de doble submit (sin cambiar UI ni payloads).
// V39-11B: in-flight protection de refresh (sin solapamientos).
let refreshing=false;
let savingClase=false;
let savingProfesor=false;
let savingAlumno=false;
let savingPago=false;
// BLOQUE 4L-B: guard + cooldown de torniquete (por alumno, configurable).
let savingCheckin=false;
const lastCheckin=new Map();
const CHECKIN_COOLDOWN_MS=60_000;

export default function App(){
  const [logged,setLogged]=useState(()=>localStorage.getItem('atlos-session')==='1' && isTokenValid())
  const [usuario,setUsuario]=useState(()=>localStorage.getItem('atlos-usuario')||'admin')
  const [rol,setRol]=useState(()=> getRole() || localStorage.getItem('atlos-rol')||'Dueño')
  const [page,setPage]=useState('inicio')
  const [students,setStudents]=useState([])
  const [payments,setPayments]=useState([])
  const [attendance,setAttendance]=useState([])
  const [routines,setRoutines]=useState([])
  const [clases,setClases]=useState([])
  const [ejercicios,setEjercicios]=useState([])
  const [profesores,setProfesores]=useState([])
  const [dashboard,setDashboard]=useState(null)
  const [usuarios,setUsuarios]=useState([])
  const [online,setOnline]=useState(navigator.onLine)
  const [modal,setModal]=useState(null)
  const [renewAlumno,setRenewAlumno]=useState(null)
  const [query,setQuery]=useState('')
  const [,force]=useReducer(x=>x+1,0)

  const navBase=[
    ['inicio','⌂','Inicio'],
    ['gestion','💳','Gestión'],
    ['reportes','📊','Reportes'],
    ['planificacion','👥','Alumnos'],
    ['asistencia','✓','Asistencia'],
    ['turnos','🗓','Clases'],
    ['planes','🏋','Planes'],
    ['profesores','🎓','Profesores'],
    ['personal','👤','Personal'],
  ]
  let nav=rol==='Empleado' ? navBase.filter(([k])=>!['personal','reportes'].includes(k)) : [...navBase]
  if(usuario.toLowerCase()==='admin' && ['Dueño','Administrador'].includes(rol)) nav=[...nav,['licencias','📈','Ventas']]

  const refresh=async()=>{
    // V39-11B: sin solapamientos + snapshot de tenant ANTES de la primera
    // petición. Si el tenant cambia mid-flight, no se toca el estado (fail-closed).
    if(refreshing) return;
    refreshing=true;
    const ctxTenant=getCurrentTenant();
    try{
      const [sRaw,pRaw,aRaw,rRaw,cRaw,eRaw,dRaw,uRaw,profsRaw]=await Promise.all([
        api.alumnos().catch(err=>{ console.warn('[refresh]','alumnos',err?.message||err); return null }),
        api.pagos().catch(err=>{ console.warn('[refresh]','pagos',err?.message||err); return null }),
        api.asistencia().catch(err=>{ console.warn('[refresh]','asistencia',err?.message||err); return null }),
        api.routines().catch(err=>{ console.warn('[refresh]','routines',err?.message||err); return null }),
        api.clases().catch(err=>{ console.warn('[refresh]','clases',err?.message||err); return null }),
        api.ejercicios().catch(err=>{ console.warn('[refresh]','ejercicios',err?.message||err); return null }),
        api.dashboard().catch(err=>{ console.warn('[refresh]','dashboard',err?.message||err); return null }),
        api.usuarios().catch(err=>{ console.warn('[refresh]','usuarios',err?.message||err); return null }),
        api.profesores().catch(err=>{ console.warn('[refresh]','profesores',err?.message||err); return null }),
      ])
      const localS=await list('students'); const localP=await list('payments'); const localA=await list('attendance'); const localR=await list('routines')
      const sCloud=Array.isArray(sRaw)?sRaw.map(j=>({id:String(j.id),name:j.nombre||j.name||'Sin nombre',dni:j.dni||j.telefono||'',phone:j.telefono||j.phone||'',joinedAt:j.fecha_ingreso||j.joinedAt||today(),status:j.status||'activo',edad:j.edad||null,email:j.email||'', experience:j.experience||'principiante', goal:j.goal||j.enfoque||'hipertrofia', days_per_week:j.days_per_week||3, notes:j.notes||''})):null
      const pCloud=Array.isArray(pRaw)?pRaw.map(j=>({id:j.id,studentId:String(j.alumno_id||j.studentId),amount:j.monto??j.amount??0,date:j.fecha||j.date||today(),note:j.concepto||j.note||'',metodo:j.metodo||'Efectivo',alumnoNombre:j.alumno_nombre||j.alumno||null})):null
      const aCloud=Array.isArray(aRaw)?aRaw.map(j=>({id:j.id,studentId:String(j.alumno_id||j.studentId),date:j.fecha||j.date||today(),time:j.hora_entrada||j.time||'',activo:j.activo,alumnoNombre:j.alumno_nombre})):null
      const rCloud=Array.isArray(rRaw)?rRaw:null
      const delAlumnos=new Set(tenantGetJSON('deleted-alumnos',[]).map(String))
      const delPagos=new Set(tenantGetJSON('deleted-pagos',[]).map(String))
      const extMap=tenantGetJSON('alumnos-ext',{})
      let s=sCloud? Array.from(new Map([...sCloud.map(x=>{const k=x.name?.toLowerCase(); const ex=extMap[k]; if(ex) return {...x, apellido:ex.apellido, dni:ex.dni||x.dni, mail:ex.mail||x.mail||x.email, fecha_nacimiento:ex.fecha_nacimiento||x.fecha_nacimiento||'', enfoque:ex.enfoque, observaciones:ex.observaciones}; return x}),...localS].map(x=>[String(x.id),x])).values()) : localS
      s=s.filter(x=>!delAlumnos.has(String(x.id)))
      // dedup: solo colapsa duplicado UUID+cloud del mismo nombre (evitar perder homónimos con distinto DNI)
      { const byName=new Map(); for(const x of s){ const nameKey=String(x.name||'').toLowerCase().trim(); const dniKey=String(x.dni||'').trim().toLowerCase(); const k=nameKey+'|'+dniKey; if(!nameKey){ byName.set(String(x.id),x); continue }
        // si ya existe mismo nombre, verificar DNI: si ambos tienen DNI distinto y no vacío, son homónimos distintos -> no dedup
        let existingKey=null; for(const [ek,ev] of byName.entries()){ if(String(ev.name||'').toLowerCase().trim()===nameKey){ const edni=String(ev.dni||'').trim().toLowerCase(); if(edni && dniKey && edni!==dniKey) continue; existingKey=ek; break } }
        if(!existingKey) byName.set(k,x); else { const ex=byName.get(existingKey); const isExUUID=String(ex.id).includes('-'); const isNewUUID=String(x.id).includes('-'); if(isExUUID && !isNewUUID) { byName.delete(existingKey); byName.set(k,x) } }
      } s=Array.from(byName.values()) }
      // dedup pagos por contenido (evita duplicado nube UUID + numérico mismo monto/fecha/concepto)
      let p
      if(pCloud){
        const byContent=new Map()
        for(const x of [...pCloud, ...localP]){
          const key=`${x.studentId}|${x.amount}|${x.date}|${x.note}|${x.metodo}`
          if(!byContent.has(key)) byContent.set(key,x)
          else {
            const ex=byContent.get(key)
            const isExUUID=String(ex.id).includes('-')
            const isNewUUID=String(x.id).includes('-')
            if(isExUUID && !isNewUUID) byContent.set(key,x)
          }
        }
        p=Array.from(byContent.values())
      } else p=localP
      p=p.filter(x=>!delPagos.has(String(x.id)) && !delAlumnos.has(String(x.studentId)))
      const a=aCloud? Array.from(new Map([...aCloud,...localA].map(x=>[String(x.id),x])).values()).filter(x=>!delAlumnos.has(String(x.studentId))) : localA.filter(x=>!delAlumnos.has(String(x.studentId)))
      const r=rCloud? Array.from(new Map([...rCloud,...localR].map(x=>[String(x.id),x])).values()) : localR
      const delClases=new Set(tenantGetJSON('deleted-clases',[]).map(String))
      const localC=tenantGetJSON('clases',[])
      let cRawMapped=[]
      if(Array.isArray(cRaw)){ cRawMapped=cRaw.map(j=>({id:j.id, nombre:j.nombre||j.name, dia_mes:j.dia_mes||j.dia, hora_inicio:j.hora_inicio||j.inicio, hora_fin:j.hora_fin||j.fin, capacidad:j.capacidad||j.cap, profesor:j.profesor||'', inscriptos:j.inscriptos||j.inscriptos_count||0})) }
      const mergedC=[...cRawMapped, ...localC]
      const mapC=new Map(mergedC.map(x=>[String(x.id), x]))
      let c=Array.from(mapC.values()).filter(x=>!delClases.has(String(x.id)))
      if(!Array.isArray(cRaw)) c=localC.filter(x=>!delClases.has(String(x.id)))
      // merge inscripciones locales al contador
      try{ const ins=tenantGetJSON('inscripciones',[]); const cnt=new Map(); for(const it of ins){ const k=String(it.clase_id); cnt.set(k,(cnt.get(k)||0)+1)} const cc=[]; for(const x of c){ const y={}; for(const kk in x) y[kk]=x[kk]; y.inscriptos=(Number(x.inscriptos)||0)+(cnt.get(String(x.id))||0); cc.push(y) } c=cc }catch{}
      const e=Array.isArray(eRaw)?eRaw:null
      const delProfs=new Set(tenantGetJSON('deleted-profesores',[]).map(String))
      const localProfs=tenantGetJSON('profesores',[]).filter(x=>!delProfs.has(String(x.id)))
      // merge profesores nube + local (el registro de la nube tiene prioridad cuando llega con serverId)
      const profsCloud=Array.isArray(profsRaw)?profsRaw.map(j=>({id:String(j.id), serverId:String(j.id), nombre:j.nombre||j.name||'', apellido:j.apellido||'', telefono:j.telefono||'', especialidad:j.especialidad||'General', nombreCompleto:j.nombreCompleto||[j.nombre||j.name,j.apellido].filter(Boolean).join(' ').trim(), pending:false})):[]
      const profByKey=new Map()
      for(const x of [...profsCloud, ...localProfs]){
        if(delProfs.has(String(x.id))) continue
        const key=String(x.nombre||'').toLowerCase().trim()+'|'+String(x.apellido||'').toLowerCase().trim()
        const prev=profByKey.get(key)
        if(!prev){ profByKey.set(key,x); continue }
        const prevCloud=Boolean(prev.serverId)||(!String(prev.id).includes('-')&&!prev.pending)
        const curCloud=Boolean(x.serverId)||(!String(x.id).includes('-')&&!x.pending)
        if(curCloud&&!prevCloud) profByKey.set(key,x)
      }
      const profs=Array.from(profByKey.values()).filter(x=>!delProfs.has(String(x.id)))
      // V39-11B: fail-closed — el estado solo se actualiza para el tenant que inició el refresh.
      if(getCurrentTenant()!==ctxTenant) return;
      if(!s.length){
        // no reseed demo si el usuario ya borró alumnos (los 3 demo Juan/Sofía/Martín volvían siempre)
        if(import.meta.env.DEV && delAlumnos.size===0){ await seed(); const seeded=await list('students'); const filteredSeeded=seeded.filter(x=>!delAlumnos.has(String(x.id))); setStudents(filteredSeeded) } else { setStudents([]) }
      } else setStudents(s)
      setPayments(p); setAttendance(a); setRoutines(r); setClases(c); setEjercicios(prev=> e ?? prev); setProfesores(profs); if(dRaw) setDashboard(dRaw); if(Array.isArray(uRaw)) setUsuarios(uRaw)
      return
    }catch(e){ console.error('refresh',e); return }
    finally{ refreshing=false }
  }
  const purgeDemo=async()=>{ if(import.meta.env.DEV) return; try{ const localS=await list('students'); for(const x of localS){ const n=String(x.name||'').toLowerCase(); if(['juan pérez','sofía gómez','martín día'].includes(n)) await remove('students',x.id) } }catch(e){ console.warn('purgeDemo',e) } }
  useEffect(()=>{ if(logged) {purgeDemo().then(()=>refresh()); startSync(refresh); return ()=>stopSync()}},[logged])
  useEffect(()=>{ const on=()=>setOnline(true), off=()=>setOnline(false); addEventListener('online',on); addEventListener('offline',off); return()=>{removeEventListener('online',on);removeEventListener('offline',off)}},[])

  const stats=useMemo(()=>({
    total:students.length,
    conRutina:new Set(ejercicios.map(e=>String(e.alumno_id||e.studentId))).size,
    totalEj:ejercicios.length,
    today:attendance.filter(a=> toISO(a.date)===today()).length,
    revenue:payments.filter(p=> isSameMonth(p.date, today())).reduce((a,b)=>a+Number(b.amount||0),0),
    totalPagos:payments.length,
    alumnosAlDia:students.filter(s=>payments.some(p=>String(p.studentId)===String(s.id))).length
  }),[students,payments,attendance,ejercicios])

   const saveStudent=async(e)=>{ 
    e.preventDefault(); 
    const f=new FormData(e.currentTarget); 
    const nombre=f.get('nombre')?.trim(); 
    const apellido=f.get('apellido')?.trim(); 
    const nombreCompleto=[nombre,apellido].filter(Boolean).join(' ').trim(); 
    const dni=f.get('dni')?.trim(); 
    const telefono=f.get('phone')?.trim(); 
    const mail=f.get('mail')?.trim(); 
    const edad=f.get('edad')?.trim(); 
    const fecha_nac=f.get('fecha_nac')?.trim()||''; 
    const enfoque=f.get('enfoque')?.trim()||'Hipertrofia'; 
    const observaciones=f.get('observaciones')?.trim()||''; 
    const fecha=f.get('joinedAt')?.trim()||today(); 
    
    if(!nombre) return alert('Ingresá el nombre.'); 
    if(!apellido) return alert('Ingresá el apellido.'); 
    if(edad && !/^\d+$/.test(edad)) return alert('La edad debe ser un número.'); 
    if(dni && !/^\d+$/.test(dni)) return alert('DNI debe ser numérico.'); 
    if(mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return alert('Mail inválido.');
    if(savingAlumno) return; savingAlumno=true; try{
    
    // si re-crea un nombre previamente borrado, liberar el filtro para que no se borre al refrescar
    { 
      const k=nombreCompleto.toLowerCase(); 
      const delN=tenantGetJSON('deleted-alumnos-names',[]);
      const filt=delN.filter(n=>String(n).toLowerCase()!==k);
      if(filt.length!==delN.length) tenantSetJSON('deleted-alumnos-names',filt)
    }
    
    const data={nombre:nombreCompleto, telefono, email:mail||'', edad:edad?Number(edad):null, fecha_ingreso:fecha}; 
    let cloudOk=false; 
    try{ await api.crearAlumno(data); cloudOk=true }catch(err){ console.warn('crearAlumno api fallo',err.message)}
    
    if(!cloudOk){ 
      const localId=crypto.randomUUID();
      await put('students',{id:localId,name:nombreCompleto,apellido,dni:dni||'',phone:telefono,mail:mail||'',fecha_nacimiento:fecha_nac,edad:edad?Number(edad):null,enfoque,observaciones,joinedAt:fecha,status:'activo',createdAt:new Date().toISOString()});
      queuePush('alumno', {...data, _localId:localId})
    } else if(dni||mail||enfoque||observaciones||apellido||fecha_nac){
      const ext=tenantGetJSON('alumnos-ext',{});
      ext[nombreCompleto.toLowerCase()]={apellido,dni,mail,fecha_nacimiento:fecha_nac,enfoque,observaciones};
      tenantSetJSON('alumnos-ext',ext)
    }
    
    setModal(null); 
    refresh() 
    }finally{ savingAlumno=false }
  }
  const savePayment=async(e)=>{ e.preventDefault(); if(savingPago) return; savingPago=true; try{
    const f=new FormData(e.currentTarget); const sid=f.get('studentId'); const isLocalUUID=String(sid).includes('-'); const monto=Number(f.get('amount')); const fecha=f.get('date')||today(); const note=f.get('note')||'Cuota Mensual'; const metodo='Efectivo'
    const localId=crypto.randomUUID();
    if(!isLocalUUID){ try{ await api.crearPago({alumno_id:Number(sid), monto, concepto:note, metodo}); setModal(null); refresh(); return }catch(err){ console.warn('crearPago api fallo, fallback local',err.message); if(String(err.message).includes('Failed to fetch')||String(err.message).includes('fetch')) queuePush('pago', {alumno_id:Number(sid), monto, concepto:note, metodo, _localId:localId}, {fecha}) } }
    await put('payments',{id:localId,_localId:localId,studentId:String(sid),amount:monto,date:fecha,note,metodo}); setModal(null); refresh() }finally{ savingPago=false } }
  const markAttendanceDNI=async(dni)=>{ // torniquete por DNI
    const alum=students.find(s=>String(s.dni)===String(dni).trim() || String(s.phone)===String(dni).trim())
    if(!alum) throw new Error('DNI no encontrado')
    const safeId=String(alum.id); const alumnoRef=/^\d+$/.test(safeId)? Number(safeId) : safeId; // UUID offline se preserva (Number(uuid)=NaN)
    const _ck=String(alumnoRef);
    if(savingCheckin) return alum;
    if(Date.now()-(_ck? (lastCheckin.get(_ck)||0):0)<CHECKIN_COOLDOWN_MS) return alum;
    savingCheckin=true;
    try{
      const localId=crypto.randomUUID();
      const _fecha=today(); const _hora=new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
      try{ await api.checkin(alumnoRef); lastCheckin.set(_ck,Date.now()); }catch(err){ await put('attendance',{id:localId,_localId:localId,studentId:alum.id,date:_fecha,time:_hora}); lastCheckin.set(_ck,Date.now()); if(/Failed to fetch|fetch/.test(String(err.message||''))) queuePush('checkin', {alumno_id:alumnoRef,_localId:localId}, {fecha:_fecha,hora:_hora}) }
      refresh()
      return alum
    }finally{ savingCheckin=false }
  }
  const saveRoutine=async(e)=>{ e.preventDefault(); const f=new FormData(e.currentTarget); await put('routines',{id:crypto.randomUUID(),studentId:f.get('studentId'),day:f.get('day'),exercise:f.get('exercise'),series:f.get('series'),reps:f.get('reps'),notes:f.get('notes')||''}); setModal(null); refresh() }
  const saveClase=async(e)=>{ e.preventDefault(); if(savingClase) return; savingClase=true; try{
    const f=new FormData(e.currentTarget); const data={nombre:f.get('nombre'), dia_mes:f.get('dia')||'Lunes', hora_inicio:f.get('inicio')||'08:00', hora_fin:f.get('fin')||'09:00', capacidad: f.get('cap')==='Ilimitada'? 999 : Number(f.get('cap')||20), profesor:f.get('profesor')||''}
    const localId='clase-'+Date.now(); let ok=false; let serverId=null; let pendiente=false
    if(navigator.onLine){
      try{ const r=await api.crearClase(data); ok=true; serverId=(r&&(r.id??r._id))||null }catch(err){ console.warn('crearClase api',err.message); pendiente=true; if(esErrorDeRed(err)){ queuePush('clase',{...data,_localId:localId}) } }
    } else { queuePush('clase',{...data,_localId:localId}); pendiente=true }
    if(!ok){ const local=tenantGetJSON('clases',[]); local.push({id: serverId?String(serverId):localId, serverId:serverId?String(serverId):null, ...data, inscriptos:0, pending:pendiente}); tenantSetJSON('clases',local) }
    setModal(null); refresh() }finally{ savingClase=false } }
  const saveProfesor=async(e)=>{ e.preventDefault(); const f=new FormData(e.currentTarget); const nombre=f.get('nombre')?.trim(); const apellido=f.get('apellido')?.trim(); const telefono=f.get('telefono')?.trim(); const especialidad=f.get('especialidad')?.trim()||'General'; if(!nombre||!apellido) return alert('Nombre y apellido requeridos');
    if(savingProfesor) return; savingProfesor=true; try{
    const localId=Date.now().toString(); const localRec={id:localId, nombre, apellido, telefono:telefono||'', especialidad, nombreCompleto:`${nombre} ${apellido}`}
    let serverId=null; let pendiente=false
    if(navigator.onLine){
      try{ const r=await api.crearProfesor({nombre, apellido, telefono:telefono||'', especialidad}); serverId=(r&&(r.id??r._id))||null }
      catch(err){ console.warn('crearProfesor api fallo → encolado', err.message); pendiente=true; if(esErrorDeRed(err)){ queuePush('profesor', {_localId:localId}) } }
    } else { queuePush('profesor', {_localId:localId}); pendiente=true }
    const arr=tenantGetJSON('profesores',[])
    arr.push(serverId ? {...localRec, id:String(serverId), serverId:String(serverId), pending:false} : {...localRec, pending:pendiente})
    tenantSetJSON('profesores',arr); setModal(null); refresh() }finally{ savingProfesor=false } }
  const saveUsuario=async(e)=>{ e.preventDefault(); const f=new FormData(e.currentTarget); const data={usuario:f.get('usuario'), clave:f.get('clave'), rol:f.get('rol')||'Empleado'}; await api.crearUsuario(data); setModal(null); refresh() }

  const filtered=useMemo(()=> students.filter(s=>`${s.name} ${s.dni}`.toLowerCase().includes(query.toLowerCase())), [students,query])
  const handleDeleteAlumno=async(id)=>{ if(!confirm('¿Eliminar alumno?')) return; const _sid=String(id??'').trim(); try{ if(/^\d+$/.test(_sid)) await api.eliminarAlumno(_sid); else await remove('students',id) }catch{ await remove('students',id) } refresh() }

  const [gymConf,setGymConf]=useState(null)
  const [licencia,setLicencia]=useState(null)
  useEffect(()=>{ if(logged){ if(!isTokenValid()){ clearAuth(); setLogged(false); return } api.me().then(u=>{       if(u?.rol){ setRol(u.rol); localStorage.setItem('atlos-rol',u.rol)} if(u?.usuario){ setUsuario(u.usuario); localStorage.setItem('atlos-usuario',u.usuario) }
    }).catch(e=>{ const msg=String(e.message||''); if(msg.includes('No autorizado')||msg.includes('expirada')||msg.includes('401')||msg.includes('403')){ clearAuth(); setLogged(false) } })
    api.getGymConfig().then(cfg=>{ if(cfg && typeof cfg==='object'){ setGymConf(cfg); localStorage.setItem('atlos-gymconf', JSON.stringify(cfg)) } }).catch(()=>{ const local=JSON.parse(localStorage.getItem('atlos-gymconf')||'null'); if(local) setGymConf(local) })
  } },[])
  useEffect(()=>{ if(!logged) return; const checkLic=async()=>{ try{ const lic=await api.checkLicencia(); setLicencia(lic); if(!lic.activo){ console.warn('Licencia vencida',lic) } }catch{} }; checkLic(); const t=setInterval(checkLic, 5*60*1000); return ()=>clearInterval(t) },[logged])
  if(logged && licencia && !licencia.activo && !['Dueño','Administrador'].includes(rol)){
    return <div className="overlay" style={{background:'rgba(15,23,42,.96)',backdropFilter:'blur(6px)'}}><div className="modal" style={{textAlign:'center',maxWidth:460}}><div style={{fontSize:40}}>🔴</div><h3>Licencia vencida</h3><p style={{color:'var(--muted)',fontSize:13}}>Gimnasio <b>{licencia.gym_name||licencia.hwid}</b> — <code>{licencia.hwid}</code><br/>Venció el <b>{toDisplay(licencia.vence)}</b> — {licencia.dias_restantes} días restantes<br/>Todas las PCs con este código quedan bloqueadas.</p><p style={{fontSize:12,color:'var(--muted)'}}>Pedile al Dueño que entre a <b>Licencias</b> y renueve. Multi-PC con mismo <code>HWID</code>.</p><div style={{display:'flex',gap:8,marginTop:14}}><button className="primary" style={{flex:1}} onClick={()=>{ clearTenantEntityData(); clearAuth(); setLogged(false); setLicencia(null)}}>Cerrar sesión</button></div></div></div>
  }
  if(!logged){
    const gymHwid=getGymHWID();
    if(!gymHwid) return <GymGate onOk={force}/>;
    return <Login onChangeGym={force} onLogin={async (u,p)=>{ try{ const r=await api.login(u,p); if(!r || (!r.token && !r.access_token)) return 'Respuesta inválida del servidor'; const tok=r.token||r.access_token; setToken(tok); const r2=await api.me().catch(()=>null); const rolResp=r2?.rol||r.rol||r.role||getRole()||'Dueño'; const usu=r2?.usuario||r.usuario||r.nombre||r.user||u; localStorage.setItem('atlos-session','1'); localStorage.setItem('atlos-usuario',usu); localStorage.setItem('atlos-rol',rolResp); setUsuario(usu); setRol(rolResp); startSession(); adoptOwnQueueItems(); setLogged(true); return null; }catch(e){ return e.message } }}/>
  }

  const notifs=useMemo(()=>{
    const arr=[]
    const hoy=new Date(); hoy.setHours(0,0,0,0)
    for(const s of students){
      const pagosAlum=payments.filter(p=>String(p.studentId)===String(s.id))
      const lastPago=pagosAlum.slice().sort((a,b)=> (parseFecha(b.date)||new Date(0)) - (parseFecha(a.date)||new Date(0)))[0]
      let venc=null; if(lastPago){ const pd=parseFecha(lastPago.date); if(pd){ venc=new Date(pd); venc.setDate(venc.getDate()+30) } }
      const diffVenc=venc? Math.ceil((venc - hoy)/86400000) : null
      if(venc && diffVenc!==null && diffVenc>=0 && diffVenc<=3) arr.push({id:`vence-${s.id}`, icon:'⚠️', text:`Cuota vence en ${diffVenc} días — ${s.name}`, color:'#F59E0B'})
      if(venc && diffVenc!==null && diffVenc<0) arr.push({id:`vencida-${s.id}`, icon:'🔴', text:`Cuota vencida — ${s.name}`, color:'#EF4444'})
      if(!venc && !pagosAlum.length) arr.push({id:`pend-${s.id}`, icon:'💰', text:`Pago pendiente — ${s.name} no tiene pagos`, color:'#F59E0B'})
      // asistencias
      const asistAlum=attendance.filter(a=>String(a.studentId)===String(s.id))
      const lastAsist=asistAlum.slice().sort((a,b)=> (parseFecha(b.date)||new Date(0)) - (parseFecha(a.date)||new Date(0)))[0]
      const lastDate=lastAsist? parseFecha(lastAsist.date) : parseFecha(s.joinedAt)
      if(lastDate){ const diffAsist=Math.floor((hoy - lastDate)/86400000); if(diffAsist>=12) arr.push({id:`no12-${s.id}`, icon:'🔴', text:`${s.name} no asiste hace ${diffAsist} días`, color:'#EF4444'}); else if(diffAsist>=7) arr.push({id:`no7-${s.id}`, icon:'🟡', text:`${s.name} no vino hace ${diffAsist} días`, color:'#EAB308'}); else if(diffAsist>=5) arr.push({id:`perd-${s.id}`, icon:'🟠', text:`${s.name} perdió asistencia`, color:'#F97316'}) }
      // nuevo alumno 7 días
      const ing=parseFecha(s.joinedAt); if(ing){ const dIng=Math.floor((hoy - ing)/86400000); if(dIng>=0 && dIng<=7) arr.push({id:`nuevo-${s.id}`, icon:'🟢', text:`Nuevo alumno — ${s.name}`, color:'#22C55E'}) }
      // cumpleaños: usa fecha_nacimiento real
      if(s.fecha_nacimiento){
        const f=parseFecha(s.fecha_nacimiento); if(f && f.getDate()===hoy.getDate() && f.getMonth()===hoy.getMonth()) arr.push({id:`cumple-${s.id}`, icon:'🎂', text:`Hoy cumple años ${s.name}`, color:'#EC4899'})
      }
    }
    // dedup por id
    const seen=new Set(); return arr.filter(n=>{ if(seen.has(n.id)) return false; seen.add(n.id); return true }).slice(0,20)
  },[students,payments,attendance])
  const [showNotifs,setShowNotifs]=useState(false)
  useEffect(()=>{ if(notifs.length) console.log('🔔 ATLOS notifs',notifs) },[notifs.length])
  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><div className="brand-logo"><img src={logo} alt="ATLOS" onError={e=>{e.currentTarget.style.display='none'; const fb=e.currentTarget.nextSibling; if(fb) fb.style.display='grid'}}/><div className="logo-fallback" style={{display:'none'}}>A</div></div><div><b>ATLOS</b><span>Gestión de gimnasios</span></div></div>
      <nav>{nav.map(([id,ic,label])=><button key={id} className={page===id?'active':''} onClick={()=>setPage(id)}><span>{ic}</span>{label}</button>)}</nav>
      <div className="sidebar-foot"><div className={`status ${online?'on':'off'}`}></div><div><b>{online?'Online':'Modo offline'}</b><span>{usuario} · {rol}</span></div></div>
    </aside>
    <main className="main">
      <header><div><h1>{nav.find(x=>x[0]===page)?.[2]||page}</h1><p>{usuario} · {rol} · {fmtHoy()} · {online?'☁ Sincronización':'◉ Local'}</p></div><div className="header-actions">
        <div style={{position:'relative'}}>
          <button onClick={()=>setShowNotifs(v=>!v)} title="Notificaciones" style={{position:'relative',width:40,height:40,borderRadius:10,border:'1px solid var(--card-border)',background:'var(--card)',cursor:'pointer',fontSize:18}}>🔔{notifs.length>0&&<span style={{position:'absolute',top:-6,right:-6,background:'#EF4444',color:'#fff',fontSize:10,fontWeight:800,padding:'2px 6px',borderRadius:999, minWidth:18,textAlign:'center'}}>{notifs.length}</span>}</button>
          {showNotifs&&<div style={{position:'absolute',top:'48px',right:0,width:340,maxHeight:420,overflow:'auto',background:'var(--card)',border:'1px solid var(--card-border)',borderRadius:12,boxShadow:'0 12px 32px rgba(0,0,0,.35)',zIndex:30}}>
            <div style={{padding:'12px 14px',borderBottom:'1px solid var(--card-border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}><b style={{fontSize:13}}>Notificaciones</b><button onClick={()=>setShowNotifs(false)} style={{border:0,background:'transparent',color:'var(--muted)',cursor:'pointer'}}>×</button></div>
            {notifs.length? notifs.map(n=>(
              <div key={n.id} style={{display:'flex',gap:10,padding:'10px 12px',borderBottom:'1px solid var(--card-border)',alignItems:'flex-start'}}>
                <span style={{fontSize:16}}>{n.icon}</span>
                <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600, color:n.color}}>{n.text}</div><div style={{fontSize:10,color:'var(--muted)',marginTop:2}}>ATLOS trabaja para vos</div></div>
              </div>
            )) : <div style={{padding:20,textAlign:'center',color:'var(--muted)',fontSize:12}}>Sin notificaciones — todo al día ✓</div>}
            <div style={{padding:'8px 12px',textAlign:'center'}}><button className="ghost" style={{width:'100%',fontSize:11}} onClick={()=>setShowNotifs(false)}>Cerrar</button></div>
          </div>}
        </div>
        <div className="sync">{online?'Sincronizado':'Guardando local'}</div><button className="logout-btn" title="Cerrar sesión" onClick={()=>{clearTenantEntityData(); clearAuth(); setLogged(false); setUsuario('admin'); setRol('Dueño')}}>Cerrar sesión</button></div></header>
      {page==='inicio'&&<VistaInicio stats={stats} clases={clases} usuario={usuario} onNavigate={setPage}/>}
      {page==='gestion'&&<VistaGestion payments={payments} students={students} stats={stats} rol={rol} onNew={()=>setModal('payment')} refresh={refresh}/>}
      {page==='reportes'&&<VistaReportes payments={payments} students={students} clases={clases} ejercicios={ejercicios} attendance={attendance} dashboard={dashboard}/>}
      {page==='planificacion'&&<VistaPlanificacion students={filtered} query={query} setQuery={setQuery} stats={stats} payments={payments} attendance={attendance} routines={routines} onNew={()=>setModal('student')} onRenew={(alumno)=>{ setRenewAlumno(String(alumno.id)); setModal('payment') }} refresh={refresh}/>}
      {page==='asistencia'&&<VistaAsistencia students={students} attendance={attendance} payments={payments} query={query} setQuery={setQuery} onCheckin={markAttendanceDNI} refresh={refresh}/>}
      {page==='turnos'&&<VistaClases clases={clases} students={students} profesores={profesores} onNew={()=>setModal('clase')} refresh={refresh}/>}
      {page==='planes'&&<VistaPlanes students={students} routines={routines} ejercicios={ejercicios} onNew={()=>setModal('routine')} refresh={refresh}/>}
      {page==='profesores'&&<VistaProfesores profesores={profesores} onNew={()=>setModal('profesor')} refresh={refresh}/>}
      {page==='personal'&&<VistaPersonal usuarios={usuarios} onNew={()=>setModal('usuario')} refresh={refresh}/>}
      {page==='licencias'&&<VistaLicencias/>}
    </main>
    {modal&&<Modal title={{student:'Nuevo alumno',payment:'Registrar pago',routine:'Agregar ejercicio',clase:'Nueva clase',usuario:'Nuevo usuario',profesor:'Nuevo profesor'}[modal]||modal} onClose={()=>{setModal(null); setRenewAlumno(null)}}>
      {modal==='student'&&<StudentForm onSubmit={saveStudent}/>}
      {modal==='payment'&&<PaymentForm students={students} onSubmit={(e)=>{ setRenewAlumno(null); return savePayment(e)}} initialStudentId={renewAlumno}/>}
      {modal==='routine'&&<RoutineForm students={students} onSubmit={saveRoutine}/>}
      {modal==='clase'&&<ClaseForm profesores={profesores} onSubmit={saveClase}/>}
      {modal==='usuario'&&<UsuarioForm onSubmit={saveUsuario}/>}
      {modal==='profesor'&&<ProfesorForm onSubmit={saveProfesor}/>}
    </Modal>}
  </div>
}
