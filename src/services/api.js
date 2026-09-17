import { list, put, remove } from './db';
import { getCurrentTenant, tenantKey } from './tenant';

const API_URL = import.meta.env.VITE_API_URL || 'https://atlos-api-production.up.railway.app';

function getToken(){ return localStorage.getItem('atlos-token'); }
function getHWID(){
  let hwid=localStorage.getItem('atlos-hwid');
  if(!hwid){ const r=Math.random().toString(36).substring(2,10).toUpperCase(); hwid=`ATLOS-WEB-${r}`; localStorage.setItem('atlos-hwid',hwid); }
  return hwid;
}
export function getGymHWID(){
  return localStorage.getItem('atlos-gym-hwid') || null;
}
export function setGymHWID(hwid){ if(hwid) localStorage.setItem('atlos-gym-hwid', hwid.trim().toUpperCase()); }

// Diferencia errores de red (sin conexión) de errores del servidor: solo los de red se encolan.
export function esErrorDeRed(e){
  if(navigator.onLine===false) return true
  const m=String((e&&e.message)||e||'')
  return /failed to fetch|networkerror|load failed|timed out|aborted|network request/i.test(m)
}

async function request(path,{method='GET',body,auth=true}={}){
  const headers={'Content-Type':'application/json'};
  const tok=getToken(); 
  if(auth && tok) headers['Authorization']=`Bearer ${tok}`;
  
  const hwid=getGymHWID(); 
  if(hwid) headers['X-HWID']=hwid; // Enviamos HWID siempre para identificación
  
  const res=await fetch(`${API_URL}${path}`,{method,headers,body:body?JSON.stringify(body):undefined});
  
  if(!res.ok){
    const t=await res.text(); let msg=t; try{ const j=JSON.parse(t); msg=j.detail||j.message||j.msg||t }catch{}
    const mkErr=(m)=>{ const e=new Error(m); e.status=res.status; e.body=t; return e };
    if(res.status===401){ 
      if(auth) clearAuth(); 
      throw mkErr(msg||'No autorizado') 
    }
    if(res.status===403) throw mkErr(msg||'Acceso denegado');
    throw mkErr(msg||`Error ${res.status}`);
  }
  const ct=res.headers.get('content-type')||''; if(ct.includes('application/json')) return res.json(); return res.text();
}

export const api={
  login:(usuario,clave)=>request('/auth/login',{method:'POST',body:{usuario,clave},auth:false}),
  me:()=>request('/auth/me'),
  alumnos:()=>request('/alumnos'),
  alumno:(id)=>request(`/alumnos/${id}`),
  crearAlumno:(data)=>request('/alumnos',{method:'POST',body:data}),
  actualizarAlumno:(id,data)=>request(`/alumnos/${id}`,{method:'PUT',body:data}),
  eliminarAlumno:(id)=>request(`/alumnos/${id}`,{method:'DELETE'}),
  ejercicios:(params)=>request('/ejercicios'+(params?`?${new URLSearchParams(params)}`:'')),
  crearEjercicio:(data)=>request('/ejercicios',{method:'POST',body:data}),
  crearEjerciciosLote:(arr)=>request('/ejercicios/lote',{method:'POST',body:arr}),
  eliminarEjercicio:(id)=>request(`/ejercicios/${id}`,{method:'DELETE'}),
  pagos:(params)=>request('/pagos'+(params?`?${new URLSearchParams(params)}`:'')),
  crearPago:(data)=>request('/pagos',{method:'POST',body:data}),
  asistencia:(params)=>request('/asistencia'+(params?`?${new URLSearchParams(params)}`:'')),
  checkin:(alumno_id)=>request('/asistencia/checkin',{method:'POST',body:{alumno_id}}),
  checkout:(alumno_id)=>request('/asistencia/checkout',{method:'POST',body:{alumno_id}}),
  clases:()=>request('/clases'),
  crearClase:(data)=>request('/clases',{method:'POST',body:data}),
  actualizarClase:(id,data)=>request(`/clases/${id}`,{method:'PUT',body:data}),
  eliminarClase:(id)=>request(`/clases/${id}`,{method:'DELETE'}),
  claseAlumnos:(id)=>request(`/clases/${id}/alumnos`),
  inscribirClase:(clase_id,alumno_id)=>request(`/clases/${clase_id}/inscribir`,{method:'POST',body:{alumno_id}}),
  cuotas:(params)=>request('/cuotas'+(params?`?${new URLSearchParams(params)}`:'')),
  dashboard:()=>request('/dashboard'),
  exercisesLibrary:()=>request('/exercises-library'),
  
  // CORRECCIÓN FINAL: Rutas en inglés para coincidir con Backend V38
  routines:(params)=>request('/routines'+(params?`?${new URLSearchParams(params)}`:'')),
  routineLatest:(sid)=>request(`/routines/${sid}/latest`),
  crearRoutine:(data)=>request('/routines',{method:'POST',body:data}),
  borrarRoutine:(id)=>request(`/routines/${id}`,{method:'DELETE'}),
  
  // Profesores: CRUD REST de ATLOS.
  profesores:()=>request('/profesores'),
  crearProfesor:(data)=>request('/profesores',{method:'POST',body:data}),
  actualizarProfesor:(id,data)=>request(`/profesores/${id}`,{method:'PUT',body:data}),
  borrarProfesor:(id)=>request(`/profesores/${id}`,{method:'DELETE'}),
  
  syncVersion:()=>request('/sync/version'),
  backup:()=>request('/backup',{method:'POST'}),
  checkLicencia:(hwid)=>request(`/licencias/check?hwid=${encodeURIComponent(hwid||getGymHWID())}`),
  renovarLicencia:(hwid,meses=1,gym_name,clave,extra={})=>request('/licencias/renovar',{method:'POST',body:{hwid:hwid||getGymHWID(), meses, gym_name, ...(clave?{clave}:{}), ...extra}}),
  listarLicencias:()=>request('/licencias'),
  eliminarLicencia:(hwid)=>request(`/licencias/${encodeURIComponent(hwid)}`,{method:'DELETE'}),
  bloquearLicencia:(hwid)=>request(`/licencias/${encodeURIComponent(hwid)}/bloquear`,{method:'POST'}),
  desbloquearLicencia:(hwid)=>request(`/licencias/${encodeURIComponent(hwid)}/desbloquear`,{method:'POST'}),
  getGymConfig:()=>request('/gym/config'),
  updateGymConfig:(changes)=>request('/gym/config',{method:'PUT',body:changes}),
  
  // Personal no existe en API cloud -> mock local
  usuarios:()=>request('/usuarios').catch(()=> Promise.resolve(JSON.parse(localStorage.getItem('atlos-usuarios')||'[{"id":1,"usuario":"admin","rol":"Dueño"}]'))),
  crearUsuario:(data)=>request('/usuarios',{method:'POST',body:data}).catch(()=>{ const arr=JSON.parse(localStorage.getItem('atlos-usuarios')||'[]'); const n={id:Date.now(),...data}; arr.push(n); localStorage.setItem('atlos-usuarios',JSON.stringify(arr)); return n; }),
  eliminarUsuario:(id)=>request(`/usuarios/${id}`,{method:'DELETE'}).catch(()=>{ let arr=JSON.parse(localStorage.getItem('atlos-usuarios')||'[]'); arr=arr.filter(u=>String(u.id)!==String(id)); localStorage.setItem('atlos-usuarios',JSON.stringify(arr)); return {ok:true}; }),
};

export function setToken(t){ if(t) localStorage.setItem('atlos-token',t); else localStorage.removeItem('atlos-token'); }
export function clearAuth(){ localStorage.removeItem('atlos-token'); localStorage.removeItem('atlos-session'); localStorage.removeItem('atlos-rol'); localStorage.removeItem('atlos-usuario'); }
export function isTokenValid(){ try{ const tok=getToken(); if(!tok) return false; const p=JSON.parse(atob(tok.split('.')[1]||'')); if(p.exp && Date.now()/1000 > p.exp) return false; return true }catch{ return false } }
export function getRole(){ try{ const tok=getToken(); if(!tok) return null; const p=JSON.parse(atob(tok.split('.')[1]||'')); if(p.exp && Date.now()/1000 > p.exp) return null; return p.rol||p.role||null; }catch{ return null } }
// BLOQUE 4C: mutex simple + registro de push durante flush (sin cambiar formato de atlos-queue).
let flushing=false;
let pushDuringFlush=false;
export function queuePush(type,payload,extra){
  const tenant=getCurrentTenant();
  if(!tenant){ try{ console.warn('[queuePush] no tenant, item not queued',type) }catch{} return }
  const key=tenantKey('queue');
  if(!key){ try{ console.warn('[queuePush] no tenant key, item not queued',type) }catch{} return }
  try{ const q=JSON.parse(localStorage.getItem(key)||'[]'); q.push({gymId:tenant,type,payload,ts:Date.now(),...(extra&&typeof extra==='object'?extra:{})}); localStorage.setItem(key, JSON.stringify(q)); if(flushing) pushDuringFlush=true }catch(err){ console.warn('[queuePush]',type,err?.message||err) }
}

// V39-04B: acceso único a la queue del tenant (fail-closed: null si no hay tenant
// o la lectura falla; nunca lee/escribe la queue global legacy).
export function readTenantQueue(){
  const key=tenantKey('queue');
  if(!key){ try{ console.warn('[queue] no tenant, read skipped') }catch{} return null }
  try{ const q=JSON.parse(localStorage.getItem(key)||'[]'); return Array.isArray(q)?q:[] }catch(err){ console.warn('[queue] read failed',err?.message||err); return null }
}
export function writeTenantQueue(q){
  const key=tenantKey('queue');
  if(!key){ try{ console.warn('[queue] no tenant, write skipped') }catch{} return false }
  try{ localStorage.setItem(key,JSON.stringify(q)); return true }catch(err){ console.warn('[queue] write failed',err?.message||err); return false }
}

// BLOQUE 4J-B: remapea referencias UUID → sid en items de cola (mismo objeto, sin cambiar formato).
function remapPendingAlumno(items, lid, sid){
  let n=0;
  for(const it of items||[]){
    const pl=it&&it.payload; if(!pl||typeof pl!=='object') continue;
    if(it.type==='checkin'&&String(pl.alumno_id??'')===lid){ pl.alumno_id=sid; n++ }
    else if(it.type==='routine'&&String(pl.student_id??'')===lid){ pl.student_id=sid; n++ }
    else if(it.type==='pago'&&String(pl.alumno_id??'')===lid){ pl.alumno_id=sid; n++ }
  }
  return n;
}

async function flushAlumnoCrear(item){
  const { _localId, ...body }=(item.payload||{});
  const r=await api.crearAlumno(body);
  const lid=_localId?String(_localId):null;
  if(!lid) return null;
  const sid=(r&&(r.id??r._id))||null;
  if(!sid) return null;
  try{
    const rows=await list('students');
    const row=rows.find(x=>String(x.id)===lid);
    if(!row) return null;
    await put('students',{...row, id:String(sid), serverId:String(sid), pending:false});
    await remove('students',row.id);
  }catch(e){ console.warn('[flush] alumno reconcile',e?.message||e,lid); return null }
  // BLOQUE 4J-B: migrar referencias locales UUID → sid (solo tras reconcile exitoso).
  const nsid=String(sid);
  for(const store of ['payments','attendance','routines']){
    try{
      const rows=await list(store);
      for(const row of rows){ if(String(row.studentId)===lid){ await put(store,{...row, studentId:nsid}) } }
    }catch(e){ console.warn('[flush] alumno dependents',store,e?.message||e,lid) }
  }
  return {lid, sid:nsid};
}

async function flushProfesorCrear(item){
  const lid=String(item.payload._localId||item.payload.id||'')
  const arr=JSON.parse(localStorage.getItem('atlos-profesores')||'[]')
  const rec=arr.find(x=>String(x.id)===lid)
  if(!rec) throw new Error('profesor local no encontrado para sincronizar')
  const r=await api.crearProfesor({nombre:rec.nombre, apellido:rec.apellido, telefono:rec.telefono||'', especialidad:rec.especialidad||'General'})
  const sid=(r&&(r.id??r._id))||null
  const idx=arr.findIndex(x=>String(x.id)===lid)
  if(idx>=0){ arr[idx]={...rec, id: sid?String(sid):lid, serverId: sid?String(sid):rec.serverId, pending:false} }
  localStorage.setItem('atlos-profesores', JSON.stringify(arr))
}
async function flushRoutine(item){
  const { _localId, ...body }=item.payload
  const r=await api.crearRoutine(body)
  const lid=_localId
  if(!lid) return
  const sid=(r&&(r.id??r._id??r.routine_id))||null
  if(!sid){
    const rows0=await list('routines')
    for(const row of rows0){ if(row.routineId===lid){ await put('routines',{...row, pending:false, serverId:row.serverId||null}) } }
    return
  }
  const nsid=String(sid);
  const rows=await list('routines')
  for(const row of rows){
    if(row.routineId!==lid) continue;
    const oldId=String(row.id);
    const suffix=oldId.startsWith(String(lid))? oldId.slice(String(lid).length) : '';
    const nid=suffix? nsid+suffix : nsid+'#'+oldId;
    await put('routines',{...row, id:nid, routineId:nsid, serverId:nsid, pending:false});
    if(nid!==oldId) await remove('routines', row.id);
  }
}
async function flushClaseCrear(item){
  const { _localId, ...body }=item.payload
  const r=await api.crearClase(body)
  const lid=_localId
  if(!lid) return
  const sid=(r&&(r.id??r._id))||null
  const arr=JSON.parse(localStorage.getItem('atlos-clases')||'[]')
  const idx=arr.findIndex(c=>String(c.id)===String(lid))
  if(idx>=0 && sid){ arr[idx]={...arr[idx], id:String(sid), pending:false, serverId:String(sid)} }
  localStorage.setItem('atlos-clases',JSON.stringify(arr))
  // BLOQUE 4N: migrar inscripciones _localId → sid (solo con sid válido, como 4J-B).
  if(sid && lid){
    try{
      const ins=JSON.parse(localStorage.getItem('atlos-inscripciones')||'[]');
      if(Array.isArray(ins)){
        let ch=false;
        for(const it of ins){ if(it&&String(it.clase_id??'')===String(lid)){ it.clase_id=String(sid); ch=true } }
        if(ch) localStorage.setItem('atlos-inscripciones',JSON.stringify(ins));
      }
    }catch(e){ console.warn('[flush] clase inscripciones',e?.message||e,lid) }
  }
}

export async function flushQueue(){
  if(flushing){ try{ console.warn('[flush] skipped concurrent execution') }catch{} return }
  // V39-04B: solo la queue del tenant vigente. Legacy global = quarantine (solo aviso).
  const tenant=getCurrentTenant();
  if(!tenant){ try{ console.warn('[flush] no tenant, skipped (no global flush)') }catch{} return }
  const key=tenantKey('queue');
  if(!key){ try{ console.warn('[flush] no tenant key, skipped') }catch{} return }
  try{
    const legacy=JSON.parse(localStorage.getItem('atlos-queue')||'[]');
    if(Array.isArray(legacy)&&legacy.length) console.warn('[flush] legacy queue quarantined',legacy.length,'items in atlos-queue (not processed)');
  }catch{}
  flushing=true; pushDuringFlush=false;
  try{
  let qAll=null;
  try{ qAll=JSON.parse(localStorage.getItem(key)||'[]'); if(!Array.isArray(qAll)) qAll=[] }catch(err){ console.error('[flush] corrupt queue, aborting without deleting',err?.message||err); return }
  if(!qAll.length) return;
  const own=[], kept=[];
  let nLegacy=0, nForeign=0;
  for(const it of qAll){
    const g=it&&typeof it==='object'?String(it.gymId??''):'';
    if(g===tenant) own.push(it);
    else { kept.push(it); if(!g) nLegacy++; else nForeign++; }
  }
  if(nLegacy||nForeign){ try{ console.warn('[flush] non-tenant items kept',nLegacy,'legacy',nForeign,'foreign') }catch{} }
  const remain=[];
  for(const item of own){
    try{
      if(item.type==='alumno'){ const _m=await flushAlumnoCrear(item); if(_m){ remapPendingAlumno(own,_m.lid,_m.sid);
        // BLOQUE 4J-B: misma migración en storage + inscripciones (bloque síncrono, sin await entremedio).
        // V39-04B: se usa la clave snapshot del flush (no se re-deriva el tenant).
        try{
          const _cq=JSON.parse(localStorage.getItem(key)||'[]');
          if(Array.isArray(_cq)&&remapPendingAlumno(_cq,_m.lid,_m.sid)) localStorage.setItem(key,JSON.stringify(_cq));
          const _ins=JSON.parse(localStorage.getItem('atlos-inscripciones')||'[]');
          if(Array.isArray(_ins)){
            let _ic=false;
            for(const _x of _ins){ if(_x&&String(_x.alumno_id??'')===_m.lid){ _x.alumno_id=_m.sid; _ic=true } }
            if(_ic) localStorage.setItem('atlos-inscripciones',JSON.stringify(_ins));
          }
        }catch(_e){ console.warn('[flush] alumno dependents storage',_e?.message||_e,_m.lid) }
      } }
      else if(item.type==='pago'){ const {_localId, ...pagoBody}=(item.payload||{}); await api.crearPago(pagoBody); }
      else if(item.type==='checkin'){ const _lid=item.payload&&typeof item.payload==='object'?String(item.payload._localId||''):''; await api.checkin(item.payload.alumno_id); if(_lid){ try{ await remove('attendance',_lid) }catch(e){ console.warn('[flush] checkin reconcile',e?.message||e,_lid) } } }
      else if(item.type==='clase') await flushClaseCrear(item);
      else if(item.type==='deleteClase') await api.eliminarClase(item.payload.id);
      else if(item.type==='updateClase') await api.actualizarClase(item.payload.id,{nombre:item.payload.nombre,dia_mes:item.payload.dia_mes,hora_inicio:item.payload.hora_inicio,hora_fin:item.payload.hora_fin,capacidad:item.payload.capacidad,profesor:item.payload.profesor});
      else if(item.type==='routine') await flushRoutine(item);
      else if(item.type==='profesor') await flushProfesorCrear(item);
      else if(item.type==='updateProfesor') await api.actualizarProfesor(item.payload.id,{nombre:item.payload.nombre,apellido:item.payload.apellido,telefono:item.payload.telefono,especialidad:item.payload.especialidad});
      else if(item.type==='deleteProfesor') await api.borrarProfesor(item.payload.id);
      else remain.push(item);
    }catch(e){ const _pl=item.payload||{}; const _ref=_pl._localId||_pl.id||_pl.alumno_id||''; try{ console.warn('[flush]',item.type,e?.status??'no-status',e?.message||e,_ref) }catch{} remain.push(item) }
  }
  // BLOQUE 4C: preservar operaciones agregadas durante el flush (multiset por JSON para no perder duplicados idénticos).
  // V39-04B: relectura y escritura sobre la clave snapshot del flush.
  let finalRemain=remain;
  if(pushDuringFlush){
    let current=null;
    try{ current=JSON.parse(localStorage.getItem(key)||'[]'); if(!Array.isArray(current)) current=null }catch(err){ console.error('[flush] reread failed, keeping remain only',err?.message||err); current=null }
    if(current){
      const counts=new Map();
      for(const it of qAll){ const k=JSON.stringify(it); counts.set(k,(counts.get(k)||0)+1) }
      const extra=[];
      for(const it of current){ const k=JSON.stringify(it); const n=counts.get(k)||0; if(n>0) counts.set(k,n-1); else extra.push(it) }
      if(extra.length){ try{ console.warn('[flush] preserved',extra.length,'queued during flush') }catch{} }
      finalRemain=[...remain, ...kept, ...extra];
    } else finalRemain=[...remain, ...kept];
  } else if(kept.length) finalRemain=[...remain, ...kept];
  try{ localStorage.setItem(key, JSON.stringify(finalRemain)) }catch(err){ console.error('[flush] persist failed, queue kept on storage',err?.message||err); return }
  if(finalRemain.length!==qAll.length || pushDuringFlush) window.dispatchEvent(new Event('atlos-queue-flushed'))
  }finally{ flushing=false; pushDuringFlush=false }
}