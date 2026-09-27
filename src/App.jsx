import React, { useEffect, useMemo, useState, useReducer, Suspense, lazy } from 'react'
import { list, put, remove, seed } from './services/db'
import { api, setToken, getRole, clearAuth, isTokenValid, queuePush, getGymHWID, esErrorDeRed, startSession, adoptOwnQueueItems, newOperationId } from './services/api'
import { startSync, stopSync } from './services/sync'
import { tenantGetJSON, tenantSetJSON, clearTenantEntityData, getCurrentTenant, removeDeletedId } from './services/tenant'
import { today, fmtHoy, parseFecha, toISO, toDisplay, isSameMonth } from './utils/helpers.js'
import { estadoMembresia } from './utils/membresia.js'
import { procesarCobro } from './services/cobro.js'
import Login from './components/Login.jsx'
import GymGate from './components/GymGate.jsx'
import Modal from './components/Modal.jsx'
import { StudentForm, PaymentForm, RoutineForm, ClaseForm, ProfesorForm, UsuarioForm } from './components/forms.jsx'
import VistaInicio from './pages/VistaInicio.jsx'
import VistaGestion from './pages/VistaGestion.jsx'
import VistaPlanificacion from './pages/VistaPlanificacion.jsx'
import VistaAsistencia from './pages/VistaAsistencia.jsx'
import VistaClases from './pages/VistaClases.jsx'
import VistaProfesores from './pages/VistaProfesores.jsx'
// V40-03B: vistas pesadas/ocasionales en lazy (recharts, PDF/rutinas, admin).
// El fallback de Suspense es intencionalmente simple.
const VistaReportes = lazy(() => import('./pages/VistaReportes.jsx'))
const VistaPlanes = lazy(() => import('./pages/VistaPlanes.jsx'))
const VistaCaja = lazy(() => import('./pages/VistaCaja.jsx'))
const VistaComercial = lazy(() => import('./pages/VistaComercial.jsx'))
const VistaPersonal = lazy(() => import('./pages/VistaPersonal.jsx'))
const VistaLicencias = lazy(() => import('./pages/VistaLicencias.jsx'))

// DEV PREVIEW ONLY — never active outside Vite development mode.
// Bypass VISUAL del overlay de licencia vencida, solo para revisar el
// rediseño en localhost. Requiere DEV + VITE_DEV_PREVIEW=true. En build de
// producción import.meta.env.DEV es false y el bypass no puede activarse.
// No altera auth, tenant, RBAC, licencias reales, backend ni offline engine.
const DEV_PREVIEW = import.meta.env.DEV === true && import.meta.env.VITE_DEV_PREVIEW === "true";
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
  // V44-E: catalogo comercial + membresias (refresh los puebla, IDB de respaldo).
  const [planes,setPlanes]=useState([])
  const [membresias,setMembresias]=useState([])
  const [online,setOnline]=useState(navigator.onLine)
  const [modal,setModal]=useState(null)
  const [renewAlumno,setRenewAlumno]=useState(null)
  const [query,setQuery]=useState('')
  // DEV PREVIEW ONLY — declarado junto al resto de hooks iniciales (evita TDZ:
  // se usa en línea ~76) y antes de todos los early returns (Rules of Hooks).
  const [preview,setPreview]=useState(false);
  const [,force]=useReducer(x=>x+1,0)

  // V44-D-05: etiquetas visibles según referencia oficial (los ids internos no cambian).
  const navBase=[
    ['inicio','⌂','Dashboard'],
    ['gestion','💳','Pagos'],
    ['caja','🧾','Caja'],
    ['reportes','📊','Reportes'],
    ['planificacion','👥','Alumnos'],
    ['asistencia','✓','Asistencia'],
    ['turnos','🗓','Clases'],
    ['planes','🏋','Rutinas'],
    ['profesores','🎓','Profesores'],
    ['personal','👤','Personal'],
    ['comercial','🏷','Planes'],
  ]
  let nav=rol==='Empleado' ? navBase.filter(([k])=>!['personal','reportes','caja'].includes(k)) : [...navBase]
  if(usuario.toLowerCase()==='admin' && ['Dueño','Administrador'].includes(rol)) nav=[...nav,['licencias','📈','Licencias']]
  // DEV PREVIEW ONLY — permisos mínimos de navegación visual: sin personal ni licencias.
  if(preview) nav=nav.filter(([k])=>!['personal','licencias','comercial','caja'].includes(k))

  const refresh=async()=>{
    // V39-11B: sin solapamientos + snapshot de tenant ANTES de la primera
    // petición. Si el tenant cambia mid-flight, no se toca el estado (fail-closed).
    if(refreshing) return;
    refreshing=true;
    const ctxTenant=getCurrentTenant();
    try{
      const [sRaw,pRaw,aRaw,rRaw,cRaw,eRaw,dRaw,uRaw,profsRaw,plRaw,mbRaw]=await Promise.all([
        api.alumnos().catch(err=>{ console.warn('[refresh]','alumnos',err?.message||err); return null }),
        api.pagos().catch(err=>{ console.warn('[refresh]','pagos',err?.message||err); return null }),
        api.asistencia().catch(err=>{ console.warn('[refresh]','asistencia',err?.message||err); return null }),
        api.routines().catch(err=>{ console.warn('[refresh]','routines',err?.message||err); return null }),
        api.clases().catch(err=>{ console.warn('[refresh]','clases',err?.message||err); return null }),
        api.ejercicios().catch(err=>{ console.warn('[refresh]','ejercicios',err?.message||err); return null }),
        api.dashboard().catch(err=>{ console.warn('[refresh]','dashboard',err?.message||err); return null }),
        api.usuarios().catch(err=>{ console.warn('[refresh]','usuarios',err?.message||err); return null }),
        api.profesores().catch(err=>{ console.warn('[refresh]','profesores',err?.message||err); return null }),
        api.planes().catch(err=>{ console.warn('[refresh]','planes',err?.message||err); return null }),
        api.membresias().catch(err=>{ console.warn('[refresh]','membresias',err?.message||err); return null }),
      ])
      const localS=await list('students'); const localP=await list('payments'); const localA=await list('attendance'); const localR=await list('routines')
      const sCloud=Array.isArray(sRaw)?sRaw.map(j=>({id:String(j.id),name:j.nombre||j.name||'Sin nombre',dni:j.dni||j.telefono||'',phone:j.telefono||j.phone||'',joinedAt:j.fecha_ingreso||j.joinedAt||today(),status:j.status||'activo',edad:j.edad||null,email:j.email||'', experience:j.experience||'principiante', goal:j.goal||j.enfoque||'hipertrofia', days_per_week:j.days_per_week||3, notes:j.notes||''})):null
      const pCloud=Array.isArray(pRaw)?pRaw.map(j=>({id:j.id,studentId:String(j.alumno_id||j.studentId),amount:j.monto??j.amount??0,date:(j.fecha||j.date||''),note:j.concepto||j.note||'',metodo:j.metodo||'Efectivo',alumnoNombre:j.alumno_nombre||j.alumno||null})):null
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
      // V44-E: planes (dedup uuid-vs-servidor por nombre, gana servidor) y
      // membresias (server + locales no duplicadas) con tombstones propios.
      const delPlanes=new Set(tenantGetJSON('deleted-planes',[]).map(String))
      const delMembs=new Set(tenantGetJSON('deleted-membresias',[]).map(String))
      const localPl=await list('planes'); const localMb=await list('membresias');
      let pls;
      if(Array.isArray(plRaw)){
        const byNombre=new Map();
        for(const x of [...plRaw, ...localPl]){
          const k=String(x.nombre||'').toLowerCase().trim();
          if(!byNombre.has(k)) byNombre.set(k,x);
          else { const ex=byNombre.get(k); const isExUUID=String(ex.id).includes('-'); const isNewUUID=String(x.id).includes('-'); if(isExUUID&&!isNewUUID) byNombre.set(k,x) }
        }
        pls=Array.from(byNombre.values());
      } else pls=localPl;
      pls=pls.filter(x=>!delPlanes.has(String(x.id)));
      let mbs;
      if(Array.isArray(mbRaw)){
        const srvKeys=new Set(mbRaw.map(m=>`${m.alumno_id}|${m.fecha_inicio}`));
        const locales=localMb.filter(m=>String(m.id).includes('-')?!srvKeys.has(`${m.alumno_id}|${m.fecha_inicio}`):true);
        mbs=Array.from(new Map([...mbRaw.map(m=>({...m,id:String(m.id)})),...locales].map(x=>[String(x.id),x])).values());
      } else mbs=localMb;
      mbs=mbs.filter(x=>!delMembs.has(String(x.id)));
      // V39-11B: fail-closed — el estado solo se actualiza para el tenant que inició el refresh.
      if(getCurrentTenant()!==ctxTenant) return;
      if(!s.length){
        // no reseed demo si el usuario ya borró alumnos (los 3 demo Juan/Sofía/Martín volvían siempre)
        if(import.meta.env.DEV && delAlumnos.size===0){ await seed(); const seeded=await list('students'); const filteredSeeded=seeded.filter(x=>!delAlumnos.has(String(x.id))); setStudents(filteredSeeded) } else { setStudents([]) }
      } else setStudents(s)
      setPayments(p); setAttendance(a); setRoutines(r); setClases(c); setEjercicios(prev=> e ?? prev); setProfesores(profs); setPlanes(pls); setMembresias(mbs); if(dRaw) setDashboard(dRaw); if(Array.isArray(uRaw)) setUsuarios(uRaw)
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
    { const k=nombreCompleto.toLowerCase(); removeDeletedId('deleted-alumnos-names',k) }
    
    const data={nombre:nombreCompleto, telefono, email:mail||'', edad:edad?Number(edad):null, fecha_ingreso:fecha}; 
    let cloudOk=false; 
    // V44-B: una sola operationId para el intento online y el fallback encolado.
    const opId=newOperationId();
    try{ await api.crearAlumno(data,{operationId:opId}); cloudOk=true }catch(err){ console.warn('crearAlumno api fallo',err.message)}

    if(!cloudOk){
      const localId=crypto.randomUUID();
      await put('students',{id:localId,name:nombreCompleto,apellido,dni:dni||'',phone:telefono,mail:mail||'',fecha_nacimiento:fecha_nac,edad:edad?Number(edad):null,enfoque,observaciones,joinedAt:fecha,status:'activo',createdAt:new Date().toISOString()});
      queuePush('alumno', {...data, _localId:localId}, {operationId:opId})
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
    const f=new FormData(e.currentTarget); const sid=f.get('studentId'); const isLocalUUID=String(sid).includes('-');
    const planId=f.get('planId')||''; const monto=Number(f.get('amount')); const fecha=f.get('date')||today();
    const note=f.get('note')||'Cuota Mensual'; const metodo=f.get('metodo')||'Efectivo';
    const localId=crypto.randomUUID();
    const plan=planes.find(p=>String(p.id)===String(planId));
    if(!isLocalUUID && plan){
      // V44-E-09: flujo comercial ALUMNO -> PLAN -> MEMBRESIA -> PAGO.
      const alum=students.find(s=>String(s.id)===String(sid));
      const em=estadoMembresia(alum||{id:sid},{pagos:payments,membresias,planes});
      const opM=newOperationId(), opP=newOperationId();
      let res;
      try{ res=await procesarCobro({api,isNetworkError:esErrorDeRed},{alumnoId:Number(sid),plan,precio:monto,metodo,concepto:note,fecha,em,opIdMemb:opM,opIdPago:opP}); }
      catch(err){ alert('No se pudo registrar: '+((err&&err.message)||err)); return }
      if(res.status==='omitido') return; // doble submit concurrente con mismas keys
      if(res.status==='offline'){
        for(const op of res.queueOps) queuePush(op.type,op.payload,op.extra);
        try{ await put('membresias',res.local.membresia) }catch{}
        try{ await put('payments',{...res.local.pago,studentId:String(sid)}) }catch{}
        setModal(null); refresh(); return;
      }
      if(res.status==='pago-offline'){
        const op=res.queueOps[0]; queuePush(op.type,op.payload,op.extra);
        try{ await put('payments',{...res.local.pago,studentId:String(sid)}) }catch{}
        setModal(null); refresh(); return;
      }
      if(res.status==='pago-local'){
        try{ await put('payments',{...res.local.pago,studentId:String(sid)}) }catch{}
        if(res.error) alert('Pago registrado localmente. Aviso: '+res.error);
        setModal(null); refresh(); return;
      }
      setModal(null); refresh(); return; // ok
    }
    // Legacy: sin plan (o alumno local) — flujo anterior intacto.
    if(!isLocalUUID){ const opId=newOperationId(); try{ await api.crearPago({alumno_id:Number(sid), monto, concepto:note, metodo},{operationId:opId}); setModal(null); refresh(); return }catch(err){ console.warn('crearPago api fallo, fallback local',err.message); if(String(err.message).includes('Failed to fetch')||String(err.message).includes('fetch')) queuePush('pago', {alumno_id:Number(sid), monto, concepto:note, metodo, _localId:localId}, {fecha, operationId:opId}) } }
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
      const opId=newOperationId();
      try{ await api.checkin(alumnoRef,{operationId:opId}); lastCheckin.set(_ck,Date.now()); }catch(err){ await put('attendance',{id:localId,_localId:localId,studentId:alum.id,date:_fecha,time:_hora}); lastCheckin.set(_ck,Date.now()); if(/Failed to fetch|fetch/.test(String(err.message||''))) queuePush('checkin', {alumno_id:alumnoRef,_localId:localId}, {fecha:_fecha,hora:_hora,operationId:opId}) }
      refresh()
      return alum
    }finally{ savingCheckin=false }
  }
  const saveRoutine=async(e)=>{ e.preventDefault(); const f=new FormData(e.currentTarget); await put('routines',{id:crypto.randomUUID(),studentId:f.get('studentId'),day:f.get('day'),exercise:f.get('exercise'),series:f.get('series'),reps:f.get('reps'),notes:f.get('notes')||''}); setModal(null); refresh() }
  const saveClase=async(e)=>{ e.preventDefault(); if(savingClase) return; savingClase=true; try{
    const f=new FormData(e.currentTarget); const data={nombre:f.get('nombre'), dia_mes:f.get('dia')||'Lunes', hora_inicio:f.get('inicio')||'08:00', hora_fin:f.get('fin')||'09:00', capacidad: f.get('cap')==='Ilimitada'? 999 : Number(f.get('cap')||20), profesor:f.get('profesor')||''}
    const localId='clase-'+Date.now(); let ok=false; let serverId=null; let pendiente=false
    const opId=newOperationId();
    if(navigator.onLine){
      try{ const r=await api.crearClase(data,{operationId:opId}); ok=true; serverId=(r&&(r.id??r._id))||null }catch(err){ console.warn('crearClase api',err.message); pendiente=true; if(esErrorDeRed(err)){ queuePush('clase',{...data,_localId:localId},{operationId:opId}) } }
    } else { queuePush('clase',{...data,_localId:localId},{operationId:opId}); pendiente=true }
    if(serverId) removeDeletedId('deleted-clases',serverId);
    if(!ok){ const local=tenantGetJSON('clases',[]); local.push({id: serverId?String(serverId):localId, serverId:serverId?String(serverId):null, ...data, inscriptos:0, pending:pendiente}); tenantSetJSON('clases',local) }
    setModal(null); refresh() }finally{ savingClase=false } }
  const saveProfesor=async(e)=>{ e.preventDefault(); const f=new FormData(e.currentTarget); const nombre=f.get('nombre')?.trim(); const apellido=f.get('apellido')?.trim(); const telefono=f.get('telefono')?.trim(); const especialidad=f.get('especialidad')?.trim()||'General'; if(!nombre||!apellido) return alert('Nombre y apellido requeridos');
    if(savingProfesor) return; savingProfesor=true; try{
    const localId=Date.now().toString(); const localRec={id:localId, nombre, apellido, telefono:telefono||'', especialidad, nombreCompleto:`${nombre} ${apellido}`}
    let serverId=null; let pendiente=false
    const opId=newOperationId();
    if(navigator.onLine){
      try{ const r=await api.crearProfesor({nombre, apellido, telefono:telefono||'', especialidad},{operationId:opId}); serverId=(r&&(r.id??r._id))||null }
      catch(err){ console.warn('crearProfesor api fallo → encolado', err.message); pendiente=true; if(esErrorDeRed(err)){ queuePush('profesor', {_localId:localId}, {operationId:opId}) } }
    } else { queuePush('profesor', {_localId:localId}, {operationId:opId}); pendiente=true }
    if(serverId) removeDeletedId('deleted-profesores',serverId);
    const arr=tenantGetJSON('profesores',[])
    arr.push(serverId ? {...localRec, id:String(serverId), serverId:String(serverId), pending:false} : {...localRec, pending:pendiente})
    tenantSetJSON('profesores',arr); setModal(null); refresh() }finally{ savingProfesor=false } }
  const saveUsuario=async(e)=>{ e.preventDefault(); const f=new FormData(e.currentTarget); const data={usuario:f.get('usuario'), clave:f.get('clave'), rol:f.get('rol')||'Empleado'}; await api.crearUsuario(data,{operationId:newOperationId()}); setModal(null); refresh() }

  const filtered=useMemo(()=> students.filter(s=>`${s.name} ${s.apellido||''} ${s.dni} ${s.phone||''}`.toLowerCase().includes(query.toLowerCase())), [students,query])
  const handleDeleteAlumno=async(id)=>{ if(!confirm('¿Eliminar alumno?')) return; const _sid=String(id??'').trim(); try{ if(/^\d+$/.test(_sid)) await api.eliminarAlumno(_sid,{operationId:newOperationId()}); else await remove('students',id) }catch{ await remove('students',id) } refresh() }

  const [gymConf,setGymConf]=useState(null)
  const [licencia,setLicencia]=useState(null)
  // DEV PREVIEW ONLY — sesión visual local y efímera (sin token, sin /auth/login,
  // sin backend). Reutiliza identidad local guardada o marca "Preview" con rol
  // mínimo. No escribe localStorage, IDB ni licencia. Solo bajo DEV_PREVIEW.
  const enterPreview=()=>{ if(!DEV_PREVIEW) return; try{ setUsuario(localStorage.getItem('atlos-usuario')||'Preview'); setRol(localStorage.getItem('atlos-rol')||'Empleado') }catch{ setUsuario('Preview'); setRol('Empleado') } setPreview(true); setLogged(true) };
  useEffect(()=>{ if(logged && !preview){ if(!isTokenValid()){ clearAuth(); setLogged(false); return } api.me().then(u=>{       if(u?.rol){ setRol(u.rol); localStorage.setItem('atlos-rol',u.rol)} if(u?.usuario){ setUsuario(u.usuario); localStorage.setItem('atlos-usuario',u.usuario) }
    }).catch(e=>{ const msg=String(e.message||''); if(msg.includes('No autorizado')||msg.includes('expirada')||msg.includes('401')||msg.includes('403')){ clearAuth(); setLogged(false) } })
    api.getGymConfig().then(cfg=>{ if(cfg && typeof cfg==='object'){ setGymConf(cfg); tenantSetJSON('gymconf',cfg) } }).catch(()=>{ const local=tenantGetJSON('gymconf',null); if(local) setGymConf(local) })
  } },[preview])
  useEffect(()=>{ if(!logged) return; const checkLic=async()=>{ try{ const lic=await api.checkLicencia(); setLicencia(lic); if(!lic.activo){ console.warn('Licencia vencida',lic) } }catch{} }; checkLic(); const t=setInterval(checkLic, 5*60*1000); return ()=>clearInterval(t) },[logged])
  // FIX BLUE SCREEN: estos hooks deben correr en TODOS los renders, antes de
  // cualquier early return (Rules of Hooks). Contenido 100% intacto.
  const notifs=useMemo(()=>{
    const arr=[]
    const hoy=new Date(); hoy.setHours(0,0,0,0)
    for(const s of students){
      // V44-E: fuente unica de vencimiento (membresia canonica o fallback +30).
      const em=estadoMembresia(s,{pagos:payments,membresias,planes});
      if(em.estado==='por_vencer') arr.push({id:`vence-${s.id}`, icon:'⚠️', text:`Cuota vence en ${em.dias} días — ${s.name}`, color:'var(--warning)'})
      else if(em.estado==='vencida') arr.push({id:`vencida-${s.id}`, icon:'🔴', text:`Cuota vencida — ${s.name}`, color:'var(--danger)'})
      else if(em.estado==='sin_pagos') arr.push({id:`pend-${s.id}`, icon:'💰', text:`Pago pendiente — ${s.name} no tiene pagos`, color:'var(--warning)'})
      // asistencias
      const asistAlum=attendance.filter(a=>String(a.studentId)===String(s.id))
      const lastAsist=asistAlum.slice().sort((a,b)=> (parseFecha(b.date)||new Date(0)) - (parseFecha(a.date)||new Date(0)))[0]
      const lastDate=lastAsist? parseFecha(lastAsist.date) : parseFecha(s.joinedAt)
      if(lastDate){ const diffAsist=Math.floor((hoy - lastDate)/86400000); if(diffAsist>=12) arr.push({id:`no12-${s.id}`, icon:'🔴', text:`${s.name} no asiste hace ${diffAsist} días`, color:'var(--danger)'}); else if(diffAsist>=7) arr.push({id:`no7-${s.id}`, icon:'🟡', text:`${s.name} no vino hace ${diffAsist} días`, color:'var(--accent-yellow)'}); else if(diffAsist>=5) arr.push({id:`perd-${s.id}`, icon:'🟠', text:`${s.name} perdió asistencia`, color:'var(--brand-secondary)'}) }
      // nuevo alumno 7 días
      const ing=parseFecha(s.joinedAt); if(ing){ const dIng=Math.floor((hoy - ing)/86400000); if(dIng>=0 && dIng<=7) arr.push({id:`nuevo-${s.id}`, icon:'🟢', text:`Nuevo alumno — ${s.name}`, color:'var(--success)'}) }
      // cumpleaños: usa fecha_nacimiento real
      if(s.fecha_nacimiento){
        const f=parseFecha(s.fecha_nacimiento); if(f && f.getDate()===hoy.getDate() && f.getMonth()===hoy.getMonth()) arr.push({id:`cumple-${s.id}`, icon:'🎂', text:`Hoy cumple años ${s.name}`, color:'var(--accent-pink)'})
      }
    }
    // dedup por id
    const seen=new Set(); return arr.filter(n=>{ if(seen.has(n.id)) return false; seen.add(n.id); return true }).slice(0,20)
  },[students,payments,attendance,membresias,planes])
  const [showNotifs,setShowNotifs]=useState(false)
  if(logged && licencia && !licencia.activo && !['Dueño','Administrador'].includes(rol) && !DEV_PREVIEW){
    return <div className="overlay" style={{background:'rgba(15,23,42,.96)',backdropFilter:'blur(6px)'}}><div className="modal" style={{textAlign:'center',maxWidth:460}}><div style={{fontSize:40}}>🔴</div><h3>Licencia vencida</h3><p style={{color:'var(--muted)',fontSize:13}}>Gimnasio <b>{licencia.gym_name||licencia.hwid}</b> — <code>{licencia.hwid}</code><br/>Venció el <b>{toDisplay(licencia.vence)}</b> — {licencia.dias_restantes} días restantes<br/>Todas las PCs con este código quedan bloqueadas.</p><p style={{fontSize:12,color:'var(--muted)'}}>Pedile al Dueño que entre a <b>Licencias</b> y renueve. Multi-PC con mismo <code>HWID</code>.</p><div style={{display:'flex',gap:8,marginTop:14}}><button className="primary" style={{flex:1}} onClick={()=>{ clearTenantEntityData(); clearAuth(); setLogged(false); setLicencia(null)}}>Cerrar sesión</button></div></div></div>
  }
  // DEV PREVIEW ONLY — botón de entrada al shell visual, solo en desarrollo.
  const previewBtn=DEV_PREVIEW?<button type="button" className="ghost" style={{position:'fixed',bottom:16,right:16,zIndex:50}} onClick={enterPreview}>👁 Entrar en modo preview</button>:null;
  if(!logged){
    const gymHwid=getGymHWID();
    if(!gymHwid) return <>{previewBtn}<GymGate onOk={force}/></>;
    return <>{previewBtn}<Login onChangeGym={force} onLogin={async (u,p)=>{ try{ const r=await api.login(u,p); if(!r || (!r.token && !r.access_token)) return 'Respuesta inválida del servidor'; const tok=r.token||r.access_token; setToken(tok); const r2=await api.me().catch(()=>null); const rolResp=r2?.rol||r.rol||r.role||getRole()||'Dueño'; const usu=r2?.usuario||r.usuario||r.nombre||r.user||u; localStorage.setItem('atlos-session','1'); localStorage.setItem('atlos-usuario',usu); localStorage.setItem('atlos-rol',rolResp); setUsuario(usu); setRol(rolResp); startSession(); adoptOwnQueueItems(); setLogged(true); return null; }catch(e){ return e.message } }}/></>
  }

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><div className="brand-logo"><img src="/logo.png" alt="ATLOS" width="256" height="175" onError={e=>{e.currentTarget.style.display='none'; const fb=e.currentTarget.nextSibling; if(fb) fb.style.display='grid'}}/><div className="logo-fallback" style={{display:'none'}}>A</div></div><div><b>ATLOS</b><span>Gestión de gimnasios</span></div></div>
      <nav>{nav.map(([id,ic,label])=><button key={id} className={page===id?'active':''} onClick={()=>setPage(id)} title={label} aria-label={label} aria-current={page===id?'page':undefined}><span aria-hidden="true">{ic}</span>{label}</button>)}</nav>
      <div className="sidebar-foot"><div className={`status ${online?'on':'off'}`}></div><div><b>{online?'Online':'Modo offline'}</b><span>{usuario} · {rol}</span></div></div>
    </aside>
    <main className="main">
      {preview&&<div role="status" style={{marginBottom:12,padding:'8px 14px',borderRadius:10,border:'1px dashed var(--accent)',background:'rgba(27,150,236,.08)',color:'var(--accent-hover)',fontSize:12,fontWeight:800,letterSpacing:'.06em',textAlign:'center'}}>👁 MODO PREVIEW LOCAL — solo revisión visual, sin sesión real</div>}
      <header><div><h1>{nav.find(x=>x[0]===page)?.[2]||page}</h1><p>{usuario} · {rol} · {fmtHoy()} · {online?'☁ Sincronización':'◉ Local'}</p></div><div className="header-actions">
        <div className="notif-wrap">
          <button className="icon-btn" onClick={()=>setShowNotifs(v=>!v)} title="Notificaciones" aria-label="Notificaciones" aria-expanded={showNotifs}>🔔{notifs.length>0&&<span className="notif-badge">{notifs.length}</span>}</button>
          {showNotifs&&<div className="notif-pop" role="dialog" aria-label="Notificaciones">
            <div className="notif-head"><b>Notificaciones</b><button className="notif-x" onClick={()=>setShowNotifs(false)} aria-label="Cerrar notificaciones">×</button></div>
            {notifs.length? notifs.map(n=>(
              <div key={n.id} className="notif-item">
                <span aria-hidden="true">{n.icon}</span>
                <div><div className="notif-text" style={{color:n.color}}>{n.text}</div><div className="notif-sub">ATLOS trabaja para vos</div></div>
              </div>
            )) : <div className="notif-empty">Sin notificaciones — todo al día ✓</div>}
            <div className="notif-foot"><button className="ghost" style={{width:'100%'}} onClick={()=>setShowNotifs(false)}>Cerrar</button></div>
          </div>}
        </div>
        <div className="sync">{online?'Sincronizado':'Guardando local'}</div><button className="logout-btn" title="Cerrar sesión" onClick={()=>{clearTenantEntityData(); clearAuth(); setLogged(false); setPreview(false); setUsuario('admin'); setRol('Dueño')}}>Cerrar sesión</button></div></header>
      <Suspense fallback={<div style={{padding:20,minHeight:400,textAlign:'center',color:'var(--muted)',fontSize:12}}>Cargando...</div>}>
      {page==='inicio'&&<VistaInicio stats={stats} clases={clases} usuario={usuario} onNavigate={setPage}/>}
      {page==='gestion'&&<VistaGestion payments={payments} students={students} stats={stats} rol={rol} planes={planes} membresias={membresias} onNew={()=>setModal('payment')} refresh={refresh}/>}
      {page==='caja'&&<VistaCaja rol={rol}/>}
      {page==='reportes'&&<VistaReportes payments={payments} students={students} clases={clases} ejercicios={ejercicios} attendance={attendance} dashboard={dashboard}/>}
      {page==='planificacion'&&<VistaPlanificacion students={filtered} query={query} setQuery={setQuery} stats={stats} payments={payments} attendance={attendance} routines={routines} planes={planes} membresias={membresias} onNew={()=>setModal('student')} onRenew={(alumno)=>{ setRenewAlumno(String(alumno.id)); setModal('payment') }} refresh={refresh}/>}
      {page==='asistencia'&&<VistaAsistencia students={students} attendance={attendance} payments={payments} membresias={membresias} query={query} setQuery={setQuery} onCheckin={markAttendanceDNI} refresh={refresh}/>}
      {page==='turnos'&&<VistaClases clases={clases} students={students} profesores={profesores} onNew={()=>setModal('clase')} refresh={refresh}/>}
      {page==='planes'&&<VistaPlanes students={students} routines={routines} ejercicios={ejercicios} onNew={()=>setModal('routine')} refresh={refresh}/>}
      {page==='profesores'&&<VistaProfesores profesores={profesores} onNew={()=>setModal('profesor')} refresh={refresh}/>}
      {page==='personal'&&<VistaPersonal usuarios={usuarios} onNew={()=>setModal('usuario')} refresh={refresh}/>}
      {page==='comercial'&&<VistaComercial planes={planes} membresias={membresias} rol={rol} refresh={refresh}/>}
      {page==='licencias'&&<VistaLicencias/>}
      </Suspense>
    </main>
    {modal&&<Modal title={{student:'Nuevo alumno',payment:'Registrar pago',routine:'Agregar ejercicio',clase:'Nueva clase',usuario:'Nuevo usuario',profesor:'Nuevo profesor'}[modal]||modal} onClose={()=>{setModal(null); setRenewAlumno(null)}}>
      {modal==='student'&&<StudentForm onSubmit={saveStudent}/>}
      {modal==='payment'&&<PaymentForm students={students} planes={planes} membresias={membresias} payments={payments} onSubmit={(e)=>{ setRenewAlumno(null); return savePayment(e)}} initialStudentId={renewAlumno}/>}
      {modal==='routine'&&<RoutineForm students={students} onSubmit={saveRoutine}/>}
      {modal==='clase'&&<ClaseForm profesores={profesores} onSubmit={saveClase}/>}
      {modal==='usuario'&&<UsuarioForm onSubmit={saveUsuario}/>}
      {modal==='profesor'&&<ProfesorForm onSubmit={saveProfesor}/>}
    </Modal>}
  </div>
}
