import { list, put, remove } from './db';
import { getCurrentTenant, tenantKey, tenantGetJSON, tenantSetJSON, removeDeletedId } from './tenant';

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

async function request(path,{method='GET',body,auth=true,timeout=0}={}){
  const headers={'Content-Type':'application/json'};
  const tok=getToken(); 
  if(auth && tok) headers['Authorization']=`Bearer ${tok}`;
  
  const hwid=getGymHWID(); 
  if(hwid) headers['X-HWID']=hwid; // Enviamos HWID siempre para identificación
  
  // V39-08B: timeout solo cuando el llamador lo pide (flush). Sin timeout el
  // comportamiento es idéntico al anterior (requests de UI intactas).
  const ctrl=(timeout>0 && typeof AbortController!=='undefined')?new AbortController():null;
  let timer=null;
  if(ctrl){ try{ timer=setTimeout(()=>{ try{ctrl.abort()}catch{} },timeout) }catch{} }
  try{
  const res=await fetch(`${API_URL}${path}`,{method,headers,body:body?JSON.stringify(body):undefined,signal:ctrl?ctrl.signal:undefined});
  
  if(!res.ok){
    const t=await res.text(); let msg=t; try{ const j=JSON.parse(t); msg=j.detail||j.message||j.msg||t }catch{}
    const mkErr=(m)=>{ const e=new Error(m); e.status=res.status; e.body=t; try{ e.retryAfter=res.headers.get('retry-after') }catch{} return e };
    if(res.status===401){ 
      if(auth) clearAuth(); 
      throw mkErr(msg||'No autorizado') 
    }
    if(res.status===403) throw mkErr(msg||'Acceso denegado');
    throw mkErr(msg||`Error ${res.status}`);
  }
  const ct=res.headers.get('content-type')||'';
  // V39-08B: un 2xx manda por status. Si el body no es JSON válido, se devuelve
  // el texto en lugar de convertir el éxito en error (evita duplicar el envío).
  if(!ct.includes('application/json')) return res.text();
  const t=await res.text();
  if(!t) return null;
  try{ return JSON.parse(t) }catch{ return t }
  }finally{ if(timer){ try{ clearTimeout(timer) }catch{} } }
}

export const api={
  login:(usuario,clave)=>request('/auth/login',{method:'POST',body:{usuario,clave},auth:false}),
  me:()=>request('/auth/me'),
  alumnos:()=>request('/alumnos'),
  alumno:(id)=>request(`/alumnos/${id}`),
  crearAlumno:(data,opts)=>request('/alumnos',{method:'POST',body:data,...(opts||{})}),
  actualizarAlumno:(id,data)=>request(`/alumnos/${id}`,{method:'PUT',body:data}),
  eliminarAlumno:(id)=>request(`/alumnos/${id}`,{method:'DELETE'}),
  ejercicios:(params)=>request('/ejercicios'+(params?`?${new URLSearchParams(params)}`:'')),
  crearEjercicio:(data)=>request('/ejercicios',{method:'POST',body:data}),
  crearEjerciciosLote:(arr)=>request('/ejercicios/lote',{method:'POST',body:arr}),
  eliminarEjercicio:(id)=>request(`/ejercicios/${id}`,{method:'DELETE'}),
  pagos:(params)=>request('/pagos'+(params?`?${new URLSearchParams(params)}`:'')),
  crearPago:(data,opts)=>request('/pagos',{method:'POST',body:data,...(opts||{})}),
  asistencia:(params)=>request('/asistencia'+(params?`?${new URLSearchParams(params)}`:'')),
  checkin:(alumno_id,opts)=>request('/asistencia/checkin',{method:'POST',body:{alumno_id},...(opts||{})}),
  checkout:(alumno_id)=>request('/asistencia/checkout',{method:'POST',body:{alumno_id}}),
  clases:()=>request('/clases'),
  crearClase:(data,opts)=>request('/clases',{method:'POST',body:data,...(opts||{})}),
  actualizarClase:(id,data,opts)=>request(`/clases/${id}`,{method:'PUT',body:data,...(opts||{})}),
  eliminarClase:(id,opts)=>request(`/clases/${id}`,{method:'DELETE',...(opts||{})}),
  claseAlumnos:(id)=>request(`/clases/${id}/alumnos`),
  inscribirClase:(clase_id,alumno_id)=>request(`/clases/${clase_id}/inscribir`,{method:'POST',body:{alumno_id}}),
  cuotas:(params)=>request('/cuotas'+(params?`?${new URLSearchParams(params)}`:'')),
  dashboard:()=>request('/dashboard'),
  exercisesLibrary:()=>request('/exercises-library'),
  
  // CORRECCIÓN FINAL: Rutas en inglés para coincidir con Backend V38
  routines:(params)=>request('/routines'+(params?`?${new URLSearchParams(params)}`:'')),
  routineLatest:(sid)=>request(`/routines/${sid}/latest`),
  crearRoutine:(data,opts)=>request('/routines',{method:'POST',body:data,...(opts||{})}),
  borrarRoutine:(id)=>request(`/routines/${id}`,{method:'DELETE'}),
  
  // Profesores: CRUD REST de ATLOS.
  profesores:()=>request('/profesores'),
  crearProfesor:(data,opts)=>request('/profesores',{method:'POST',body:data,...(opts||{})}),
  actualizarProfesor:(id,data,opts)=>request(`/profesores/${id}`,{method:'PUT',body:data,...(opts||{})}),
  borrarProfesor:(id,opts)=>request(`/profesores/${id}`,{method:'DELETE',...(opts||{})}),
  
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
export function clearAuth(){ localStorage.removeItem('atlos-token'); localStorage.removeItem('atlos-session'); localStorage.removeItem('atlos-rol'); localStorage.removeItem('atlos-usuario'); try{ localStorage.removeItem('atlos-sid') }catch{} }
export function isTokenValid(){ try{ const tok=getToken(); if(!tok) return false; const p=JSON.parse(atob(tok.split('.')[1]||'')); if(p.exp && Date.now()/1000 > p.exp) return false; return true }catch{ return false } }
export function getRole(){ try{ const tok=getToken(); if(!tok) return null; const p=JSON.parse(atob(tok.split('.')[1]||'')); if(p.exp && Date.now()/1000 > p.exp) return null; return p.rol||p.role||null; }catch{ return null } }
// BLOQUE 4C: mutex simple + registro de push durante flush (sin cambiar formato de atlos-queue).
let flushing=false;
let pushDuringFlush=false;
export function queuePush(type,payload,extra){
  const tenant=getCurrentTenant();
  const user=getCurrentUserId();
  const session=getCurrentSessionId();
  if(!tenant||!user||!session){ try{ console.warn('[queuePush] no identity, item not queued',type) }catch{} return }
  const key=tenantKey('queue');
  if(!key){ try{ console.warn('[queuePush] no tenant key, item not queued',type) }catch{} return }
  let opId=null;
  try{ opId=crypto.randomUUID() }catch(err){ console.warn('[queuePush] no operationId, item not queued',type); return }
  try{ const q=JSON.parse(localStorage.getItem(key)||'[]'); q.push({gymId:tenant,userId:user,sessionId:session,operationId:opId,type,payload,ts:Date.now(),...(extra&&typeof extra==='object'?extra:{})}); localStorage.setItem(key, JSON.stringify(q)); if(flushing) pushDuringFlush=true }catch(err){ console.warn('[queuePush]',type,err?.message||err) }
}

// V39-07B: identidad de usuario/sesión (metadatos locales, jamás viajan al backend).
// userId = 'atlos-usuario' (identidad existente, no sensible). sessionId = 'atlos-sid'
// creado en login e invalidado en clearAuth/logout.
export function getCurrentUserId(){
  try{
    const u=localStorage.getItem('atlos-usuario');
    const s=u==null?'':String(u).trim();
    return s||null;
  }catch{ return null }
}
export function getCurrentSessionId(){
  try{ const s=localStorage.getItem('atlos-sid'); return s||null }catch{ return null }
}
export function startSession(){
  try{ const sid=crypto.randomUUID(); localStorage.setItem('atlos-sid',sid); return sid }catch{ return null }
}
function readContext(){
  return {tenant:getCurrentTenant(), user:getCurrentUserId(), session:getCurrentSessionId()};
}
// true solo si el item pertenece al contexto vigente (misma sesión del mismo usuario).
// Legacy sin identidad nunca matchea: queda en cuarentena.
export function sameQueueContext(it){
  const c=readContext();
  if(!c.tenant||!c.user||!c.session) return false;
  if(!it||typeof it!=='object') return false;
  return String(it.userId??'')===c.user && String(it.sessionId??'')===c.session;
}
// V39-07B: al iniciar sesión, los items del propio usuario/tenant adoptan la
// sesión nueva (misma persona, mismo gym). Ajenos y legacy quedan intactos.
export function adoptOwnQueueItems(){
  const c=readContext();
  if(!c.tenant||!c.user||!c.session) return 0;
  const q=readTenantQueue();
  if(!q) return 0;
  let n=0;
  for(const it of q){
    if(it&&typeof it==='object'&&String(it.gymId??'')===c.tenant&&String(it.userId??'')===c.user&&String(it.sessionId??'')!==c.session){ it.sessionId=c.session; n++ }
  }
  if(n) writeTenantQueue(q);
  return n;
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

// V39-09B-1: devuelve {ok:true,lid,sid} al reconciliar por completo, o
// {ok:false,code:'no-server-id'|'reconcile-error',lid,sid} si el 2xx no aportó ID
// de servidor (o la reconciliación local falló). El llamador conserva el item.
async function flushAlumnoCrear(item){
  const _pl=(item&&item.payload)||{};
  const { _localId, ...body }=_pl;
  const r=await api.crearAlumno(body,FLUSH_OPTS);
  const lid=_localId?String(_localId):null;
  const sid=(r&&(r.id??r._id))||null;
  // V39-09B-1: 2xx sin ID de servidor → el item NO sale de cola (reconcile pendiente).
  if(!sid) return {ok:false, code:'no-server-id', lid, sid:null};
  const nsid=String(sid);
  try{
    const rows=await list('students');
    const row=rows.find(x=>String(x.id)===lid);
    if(row){
      await put('students',{...row, id:nsid, serverId:nsid, pending:false});
      await remove('students',row.id);
    }
    // BLOQUE 4J-B: migrar referencias locales UUID → sid (tras reconcile exitoso).
    for(const store of ['payments','attendance','routines']){
      try{
        const rows2=await list(store);
        for(const row2 of rows2){ if(String(row2.studentId)===lid){ await put(store,{...row2, studentId:nsid}) } }
      }catch(e){ console.warn('[flush] alumno dependents',store,e?.message||e,lid) }
    }
    return {ok:true, lid, sid:nsid};
  }catch(e){ console.warn('[flush] alumno reconcile',e?.message||e,lid); return {ok:false, code:'reconcile-error', lid, sid:nsid} }
}

async function flushProfesorCrear(item){
  const _pl=(item&&item.payload)||{};
  const lid=String(_pl._localId||_pl.id||'')
  const arr=tenantGetJSON('profesores',[])
  const rec=arr.find(x=>String(x.id)===lid)
  if(!rec) throw new Error('profesor local no encontrado para sincronizar')
  const r=await api.crearProfesor({nombre:rec.nombre, apellido:rec.apellido, telefono:rec.telefono||'', especialidad:rec.especialidad||'General'},FLUSH_OPTS)
  const sid=(r&&(r.id??r._id))||null
  // V39-09B-1: 2xx sin ID de servidor → reconcile pendiente; el registro local
  // no se marca sincronizado y el item NO sale de cola.
  if(!sid) return {ok:false, code:'no-server-id', lid, sid:null}
  const nsid=String(sid)
  try{
    const arr2=tenantGetJSON('profesores',[])
    const idx=arr2.findIndex(x=>String(x.id)===lid)
    if(idx>=0){ arr2[idx]={...arr2[idx], id:nsid, serverId:nsid, pending:false} }
    tenantSetJSON('profesores',arr2)
    // V39-12B: si el sid estaba tombstoned, la re-creación lo revive.
    removeDeletedId('deleted-profesores',nsid)
    return {ok:true, lid, sid:nsid}
  }catch(e){ console.warn('[flush] profesor reconcile',e?.message||e,lid); return {ok:false, code:'reconcile-error', lid, sid:nsid} }
}
async function flushRoutine(item){
  const _pl=(item&&item.payload)||{};
  const { _localId, ...body }=_pl
  const r=await api.crearRoutine(body,FLUSH_OPTS)
  const lid=_localId?String(_localId):null
  const sid=(r&&(r.id??r._id??r.routine_id))||null
  // V39-09B-1: 2xx sin ID de servidor → reconcile pendiente. Las filas locales
  // NO se marcan sincronizadas y el item NO sale de cola (evita duplicado).
  if(!sid) return {ok:false, code:'no-server-id', lid, sid:null}
  const nsid=String(sid);
  try{
    const rows=await list('routines')
    for(const row of rows){
      if(row.routineId!==lid) continue;
      const oldId=String(row.id);
      const suffix=oldId.startsWith(String(lid))? oldId.slice(String(lid).length) : '';
      const nid=suffix? nsid+suffix : nsid+'#'+oldId;
      await put('routines',{...row, id:nid, routineId:nsid, serverId:nsid, pending:false});
      if(nid!==oldId) await remove('routines', row.id);
    }
    return {ok:true, lid, sid:nsid}
  }catch(e){ console.warn('[flush] routine reconcile',e?.message||e,lid); return {ok:false, code:'reconcile-error', lid, sid:nsid} }
}
async function flushClaseCrear(item){
  const _pl=(item&&item.payload)||{};
  const { _localId, ...body }=_pl
  const r=await api.crearClase(body,FLUSH_OPTS)
  const lid=_localId?String(_localId):null
  const sid=(r&&(r.id??r._id))||null
  // V39-09B-1: 2xx sin ID de servidor → reconcile pendiente; el registro local NO
  // se marca sincronizado y el item NO sale de cola.
  if(!sid) return {ok:false, code:'no-server-id', lid, sid:null}
  const nsid=String(sid)
  try{
    const arr=tenantGetJSON('clases',[])
    const idx=arr.findIndex(c=>String(c.id)===String(lid))
    if(idx>=0){ arr[idx]={...arr[idx], id:nsid, pending:false, serverId:nsid} }
    tenantSetJSON('clases',arr)
    // V39-12B: si el sid estaba tombstoned, la re-creación lo revive.
    removeDeletedId('deleted-clases',nsid)
    // BLOQUE 4N: migrar inscripciones _localId → sid (solo con sid válido, como 4J-B).
    if(lid){
      const ins=tenantGetJSON('inscripciones',[]);
      if(Array.isArray(ins)){
        let ch=false;
        for(const it of ins){ if(it&&String(it.clase_id??'')===String(lid)){ it.clase_id=nsid; ch=true } }
        if(ch) tenantSetJSON('inscripciones',ins);
      }
    }
    return {ok:true, lid, sid:nsid}
  }catch(e){ console.warn('[flush] clase reconcile',e?.message||e,lid); return {ok:false, code:'reconcile-error', lid, sid:nsid} }
}

// V39-08B: clasificación central y determinista de errores de cola.
// SUCCESS se resuelve en el llamador (2xx no lanza). El resto:
// - 'RETRYABLE': transitorio, permanece con backoff.
// - 'TERMINAL': definitivo (400/403/404/422 y otros 4xx), dead-letter sin reenvío.
// - 'CONFLICT': 409, backend-dependiente: se conserva sin reenvío automático.
// - 'AUTH_BLOCKED': 401, se conserva; clearAuth() ya corrió en request().
export function classifyQueueError(err){
  const status=err&&typeof err.status==='number'?err.status:null;
  if(status===401) return 'AUTH_BLOCKED';
  if(status===409) return 'CONFLICT';
  if(status===400||status===403||status===404||status===422) return 'TERMINAL';
  if(status===408||status===429) return 'RETRYABLE';
  if(status!=null&&status>=400&&status<500) return 'TERMINAL';
  return 'RETRYABLE';
}
// V39-09B-1: un 2xx exitoso pero SIN ID de servidor (o con reconciliación local
// incompleta) NO se considera reconciliado. Se conserva el item persistido con
// state='reconcile_pending': no se reenvía (evita duplicados en backend) y queda
// disponible para recuperación/diagnóstico. Payload, operationId, ts e identidad
// permanecen intactos.
function markReconcilePending(item, reason){
  item.state='reconcile_pending';
  try{ item.lastError={status:null, message:String(reason||'2xx sin ID de servidor').slice(0,300), at:Date.now()} }catch{}
  try{ delete item.nextRetryAt }catch{}
  try{ console.warn('[flush] reconcile_pending, no se reenvía',item.type,reason) }catch{}
}
// V39-08B: Retry-After en segundos o fecha HTTP → ms. null si ausente/inválido.
function parseRetryAfterMs(v){
  if(v==null) return null;
  if(typeof v==='number'&&isFinite(v)&&v>=0) return v*1000;
  const s=String(v).trim();
  if(!s) return null;
  if(/^\d+$/.test(s)) return Number(s)*1000;
  const t=Date.parse(s);
  if(!isNaN(t)){ const d=t-Date.now(); return d>0?d:null }
  return null;
}
const FLUSH_TIMEOUT_MS=30000;
const RETRY_BASE_MS=60000, RETRY_CAP_MS=15*60000, RETRY_AFTER_CAP_MS=30*60000;
function backoffDelay(attempts, retryAfterMs){
  if(typeof retryAfterMs==='number'&&retryAfterMs>0) return Math.min(retryAfterMs,RETRY_AFTER_CAP_MS);
  const d=RETRY_BASE_MS*Math.pow(2,Math.max(0,(attempts||1)-1));
  return Math.min(d,RETRY_CAP_MS);
}
const FLUSH_OPTS={timeout:FLUSH_TIMEOUT_MS};

// V39-09B-2: mutex cross-tab en localStorage, namespace por tenant:
// `atlos:{TENANT}:flush-lock` = {owner, exp}. El timestamp de expiración evita
// deadlocks si la pestaña muere sin liberar; `owner` evita que una pestaña
// libere el lock de otra. Heartbeat por iteración del flush.
const FLUSH_LOCK_TTL_MS=30000;
function acquireFlushLock(lockKey){
  if(!lockKey) return null;
  const now=Date.now();
  try{
    const raw=localStorage.getItem(lockKey);
    if(raw!=null){
      try{
        const cur=JSON.parse(raw);
        if(cur&&typeof cur==='object'&&typeof cur.exp==='number'&&cur.exp>now&&typeof cur.owner==='string'&&cur.owner) return null;
      }catch{}
    }
  }catch{ return null }
  let owner=null;
  try{ owner=crypto.randomUUID() }catch{ owner='lock-'+now+'-'+Math.random().toString(36).slice(2) }
  if(!owner) return null;
  try{ localStorage.setItem(lockKey, JSON.stringify({owner, exp:now+FLUSH_LOCK_TTL_MS})) }catch{ return null }
  try{
    const back=JSON.parse(localStorage.getItem(lockKey)||'null');
    if(back&&back.owner===owner) return owner;
  }catch{}
  return null;
}
function touchFlushLock(lockKey,owner){
  if(!lockKey||!owner) return false;
  try{
    const cur=JSON.parse(localStorage.getItem(lockKey)||'null');
    if(!cur||cur.owner!==owner) return false;
    localStorage.setItem(lockKey, JSON.stringify({owner, exp:Date.now()+FLUSH_LOCK_TTL_MS}));
    return true;
  }catch{ return false }
}
function releaseFlushLock(lockKey,owner){
  if(!lockKey||!owner) return;
  try{
    const cur=JSON.parse(localStorage.getItem(lockKey)||'null');
    if(cur&&cur.owner===owner) localStorage.removeItem(lockKey);
  }catch{}
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
  // V39-07B: contexto del flush (tenant+usuario+sesión). Sin identidad completa no se procesa.
  // (Antes de adquirir el lock para no retenerlo en la salida temprana.)
  const ctx0=readContext();
  if(!ctx0.user||!ctx0.session){ try{ console.warn('[flush] no identity, skipped') }catch{} return }
  // V39-09B-2: exclusión mutua cross-tab por tenant. Si otra pestaña tiene el
  // lock vigente, abortar silenciosamente (sin requests ni cambios de estado).
  const lockKey=tenantKey('flush-lock');
  const lockOwner=acquireFlushLock(lockKey);
  if(!lockOwner){ try{ console.warn('[flush] lock held by another tab, skipping') }catch{} return }
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
  // V39-09B-1C: operationIds que ya tienen un representante reconcile_pending en
  // esta cola. Un clon sin state del mismo operationId (artefacto de un
  // pushDuringFlush previo) no debe reenviarse jamás: se descarta al vuelo.
  const rpOps=new Set();
  for(const it of own){ if(it&&it.state==='reconcile_pending'&&typeof it.operationId==='string'&&it.operationId) rpOps.add(it.operationId) }
  let nSkipped=0, drifted=false;
  for(let idx=0; idx<own.length; idx++){
    const item=own[idx];
    // V39-07B: contexto fresco por item; ante deriva se detiene fail-closed.
    const ctx=readContext();
    if(ctx.tenant!==ctx0.tenant||ctx.user!==ctx0.user||ctx.session!==ctx0.session){
      try{ console.warn('[flush] context drift, stopping') }catch{}
      for(let j=idx;j<own.length;j++) remain.push(own[j]);
      drifted=true; break;
    }
    // V39-09B-2: heartbeat del lock; si otra pestaña lo tomó (o expiró y fue
    // robado), detener fail-closed conservando lo pendiente en remain.
    if(!touchFlushLock(lockKey,lockOwner)){
      try{ console.warn('[flush] lock lost, stopping') }catch{}
      for(let j=idx;j<own.length;j++) remain.push(own[j]);
      drifted=true; break;
    }
    // V39-07B: solo items de esta misma sesión; el resto queda en cuarentena intacto.
    if(String(item?.userId??'')!==ctx.user||String(item?.sessionId??'')!==ctx.session){
      nSkipped++; remain.push(item); continue;
    }
    // V39-09B-1C: si el operationId ya tiene un representante reconcile_pending,
    // esta copia sin state es un artefacto duplicado y NO se reenvía: se descarta
    // (el representante reconcile_pending permanece como única verdad en la cola).
    if(item.state!=='reconcile_pending'&&typeof item.operationId==='string'&&item.operationId&&rpOps.has(item.operationId)){
      try{ console.warn('[flush] duplicate reconcile_pending dropped',item.type,item.operationId) }catch{}
      continue;
    }
    // V39-08B: terminal/conflict no se reenvían; backoff respeta nextRetryAt.
    // V39-09B-1: reconcile_pending (2xx sin ID) tampoco se reenvía.
    // Todo queda persistido en remain (dead-letter visible, nunca silencioso).
    if(item.state==='terminal'||item.state==='conflict'||item.state==='reconcile_pending'){ remain.push(item); continue; }
    if(typeof item.nextRetryAt==='number'&&item.nextRetryAt>Date.now()){ remain.push(item); continue; }
    try{
      if(item.type==='alumno'){
        // V39-09B-1: si el 2xx NO aportó ID (o la reconciliación local falló) el
        // item se conserva con state='reconcile_pending' (no sale de cola).
        const _r=await flushAlumnoCrear(item);
        if(_r&&_r.ok){
          // V39-12B: si el sid estaba tombstoned, la re-creación lo revive.
          if(_r.sid) removeDeletedId('deleted-alumnos',_r.sid);
          if(_r.lid&&_r.sid){ remapPendingAlumno(own,_r.lid,_r.sid);
            // BLOQUE 4J-B: misma migración en storage + inscripciones (bloque síncrono, sin await entremedio).
            // V39-04B: se usa la clave snapshot del flush (no se re-deriva el tenant).
            try{
              const _cq=JSON.parse(localStorage.getItem(key)||'[]');
              if(Array.isArray(_cq)&&remapPendingAlumno(_cq,_r.lid,_r.sid)) localStorage.setItem(key,JSON.stringify(_cq));
              const _ins=tenantGetJSON('inscripciones',[]);
              if(Array.isArray(_ins)){
                let _ic=false;
                for(const _x of _ins){ if(_x&&String(_x.alumno_id??'')===_r.lid){ _x.alumno_id=_r.sid; _ic=true } }
                if(_ic) tenantSetJSON('inscripciones',_ins);
              }
            }catch(_e){ console.warn('[flush] alumno dependents storage',_e?.message||_e,_r.lid) }
          }
        }
        else if(_r&&_r.code){ markReconcilePending(item, _r.code==='no-server-id'?'alumno: 2xx sin ID de servidor':'alumno: reconciliación local incompleta'); remain.push(item); }
        else remain.push(item);
      }
      else if(item.type==='pago'){ const {_localId, ...pagoBody}=(item.payload||{}); await api.crearPago(pagoBody,FLUSH_OPTS); }
      else if(item.type==='checkin'){ const _lid=item.payload&&typeof item.payload==='object'?String(item.payload._localId||''):''; await api.checkin(item.payload.alumno_id,FLUSH_OPTS); if(_lid){ try{ await remove('attendance',_lid) }catch(e){ console.warn('[flush] checkin reconcile',e?.message||e,_lid) } } }
      else if(item.type==='clase'){
        const _r=await flushClaseCrear(item);
        if(_r&&_r.ok){/* reconciliación completa (clases/inscripciones ya migradas) */}
        else if(_r&&_r.code){ markReconcilePending(item, _r.code==='no-server-id'?'clase: 2xx sin ID de servidor':'clase: reconciliación local incompleta'); remain.push(item); }
        else remain.push(item);
      }
      else if(item.type==='deleteClase') await api.eliminarClase(item.payload.id,FLUSH_OPTS);
      else if(item.type==='updateClase') await api.actualizarClase(item.payload.id,{nombre:item.payload.nombre,dia_mes:item.payload.dia_mes,hora_inicio:item.payload.hora_inicio,hora_fin:item.payload.hora_fin,capacidad:item.payload.capacidad,profesor:item.payload.profesor},FLUSH_OPTS);
      else if(item.type==='routine'){
        const _r=await flushRoutine(item);
        if(_r&&_r.ok){/* reconciliación completa (filas ya remapeadas) */}
        else if(_r&&_r.code){ markReconcilePending(item, _r.code==='no-server-id'?'routine: 2xx sin ID de servidor':'routine: reconciliación local incompleta'); remain.push(item); }
        else remain.push(item);
      }
      else if(item.type==='profesor'){
        const _r=await flushProfesorCrear(item);
        if(_r&&_r.ok){/* reconciliación completa (profesores namespaced ya actualizado) */}
        else if(_r&&_r.code){ markReconcilePending(item, _r.code==='no-server-id'?'profesor: 2xx sin ID de servidor':'profesor: reconciliación local incompleta'); remain.push(item); }
        else remain.push(item);
      }
      else if(item.type==='updateProfesor') await api.actualizarProfesor(item.payload.id,{nombre:item.payload.nombre,apellido:item.payload.apellido,telefono:item.payload.telefono,especialidad:item.payload.especialidad},FLUSH_OPTS);
      else if(item.type==='deleteProfesor') await api.borrarProfesor(item.payload.id,FLUSH_OPTS);
      else remain.push(item);
    }catch(e){
      const _pl=item.payload||{};
      const _ref=_pl._localId||_pl.id||_pl.alumno_id||'';
      const _cls=classifyQueueError(e);
      item.attempts=(Number(item.attempts)||0)+1;
      try{ item.lastError={status:(e&&typeof e.status==='number'?e.status:null), message:String((e&&e.message)||e||'').slice(0,300), at:Date.now()} }catch{}
      if(_cls==='TERMINAL'){ item.state='terminal'; try{ console.warn('[flush] terminal, kept without retry',item.type,e?.status??'no-status',e?.message||e,_ref) }catch{} }
      else if(_cls==='CONFLICT'){ item.state='conflict'; try{ console.warn('[flush] conflict, kept without retry',item.type,e?.status??'no-status',e?.message||e,_ref) }catch{} }
      else {
        if(_cls==='AUTH_BLOCKED'){ try{ console.warn('[flush] auth blocked, kept',item.type,_ref) }catch{} }
        else { try{ console.warn('[flush]',item.type,e?.status??'no-status',e?.message||e,_ref) }catch{} }
        item.nextRetryAt=Date.now()+backoffDelay(item.attempts,parseRetryAfterMs(e&&e.retryAfter));
      }
      remain.push(item);
    }
  }
  if(nSkipped){ try{ console.warn('[flush] identity-quarantined items kept',nSkipped) }catch{} }
  // BLOQUE 4C: preservar operaciones agregadas durante el flush (multiset por JSON para no perder duplicados idénticos).
  // V39-04B: relectura y escritura sobre la clave snapshot del flush.
  let finalRemain=remain;
  if(pushDuringFlush){
    let current=null;
    try{ current=JSON.parse(localStorage.getItem(key)||'[]'); if(!Array.isArray(current)) current=null }catch(err){ console.error('[flush] reread failed, keeping remain only',err?.message||err); current=null }
    if(current){
      const counts=new Map();
      for(const it of qAll){ const k=JSON.stringify(it); counts.set(k,(counts.get(k)||0)+1) }
      // V39-09B-1C: no reinyectar desde storage la copia de un item ya conservado
      // en remain/kept. El item pudo mutarse in-place durante el flush (p.ej.
      // reconcile_pending) mientras storage aún guarda su versión previa; dedup
      // por operationId evita materializar un clon reenviable.
      const keptOps=new Set();
      for(const it of remain){ if(it&&typeof it.operationId==='string'&&it.operationId) keptOps.add(it.operationId) }
      for(const it of kept){ if(it&&typeof it.operationId==='string'&&it.operationId) keptOps.add(it.operationId) }
      const extra=[];
      for(const it of current){
        const op=(it&&typeof it.operationId==='string'&&it.operationId)?it.operationId:null;
        if(op&&keptOps.has(op)) continue;
        const k=JSON.stringify(it); const n=counts.get(k)||0; if(n>0) counts.set(k,n-1); else extra.push(it);
      }
      if(extra.length){ try{ console.warn('[flush] preserved',extra.length,'queued during flush') }catch{} }
      finalRemain=[...remain, ...kept, ...extra];
    } else finalRemain=[...remain, ...kept];
  } else if(kept.length) finalRemain=[...remain, ...kept];
  try{ localStorage.setItem(key, JSON.stringify(finalRemain)) }catch(err){ console.error('[flush] persist failed, queue kept on storage',err?.message||err); return }
  if(finalRemain.length!==qAll.length || pushDuringFlush) window.dispatchEvent(new Event('atlos-queue-flushed'))
  }finally{ releaseFlushLock(lockKey,lockOwner); flushing=false; pushDuringFlush=false }
}