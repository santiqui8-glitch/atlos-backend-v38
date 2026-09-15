import { list, put } from './db';

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
export function queuePush(type,payload){ try{ const q=JSON.parse(localStorage.getItem('atlos-queue')||'[]'); q.push({type,payload,ts:Date.now()}); localStorage.setItem('atlos-queue', JSON.stringify(q)) }catch(err){ console.warn('[queuePush]',type,err?.message||err) } }

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
  const rows=await list('routines')
  for(const row of rows){ if(row.routineId===lid){ await put('routines',{...row, id:row.id, pending:false, serverId:sid||row.serverId}) } }
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
}

export async function flushQueue(){
  const q=JSON.parse(localStorage.getItem('atlos-queue')||'[]'); if(!q.length) return;
  const remain=[];
  for(const item of q){
    try{
      if(item.type==='alumno') await api.crearAlumno(item.payload);
      else if(item.type==='pago') await api.crearPago(item.payload);
      else if(item.type==='checkin') await api.checkin(item.payload.alumno_id);
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
  localStorage.setItem('atlos-queue', JSON.stringify(remain));
  if(remain.length!==q.length) window.dispatchEvent(new Event('atlos-queue-flushed'))
}