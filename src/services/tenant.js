// V39-03: identidad local del tenant (gimnasio). IDENTIDAD, no autorización.
// El tenant canónico es `atlos-gym-hwid`, normalizado exactamente como siempre:
// trim().toUpperCase(). El backend decide la autorización real; esto solo
// genera namespaces locales deterministas.
// Fail-closed: sin tenant válido NO se genera namespace (null). Nunca se usan
// 'undefined', 'null', 'default' ni 'unknown' como tenant activo.
// Este módulo NO migra datos ni cambia comportamiento existente: V38.1 intacto.
// Clave de origen (la misma que api.js getGymHWID/setGymHWID). Lectura directa aquí
// para que api.js pueda depender de tenant.js sin ciclo de imports.
const GYM_HWID_KEY='atlos-gym-hwid';

const NS_PREFIX = 'atlos';

// Normaliza un valor a tenant canónico o null si inválido.
// Rechaza: no-strings, vacío, 'undefined', 'null' (en cualquier capitalización).
export function normalizeTenant(value){
  if(typeof value !== 'string') return null;
  const t=value.trim().toUpperCase();
  if(!t) return null;
  if(t==='UNDEFINED'||t==='NULL') return null;
  return t;
}

export function isValidTenant(value){
  return normalizeTenant(value)!==null;
}

// Tenant vigente (o null si no hay / es inválido / falla el storage).
export function getCurrentTenant(){
  try{ return normalizeTenant(localStorage.getItem(GYM_HWID_KEY)) }catch{ return null }
}

// Namespace determinista `atlos:{TENANT}:{BASE}` o null (fail-closed).
// baseKey: sufijo actual sin prefijo, ej 'queue', 'clases', 'deleted-alumnos'.
// Se rechazan bases vacías o con caracteres ambiguos (':' o espacios).
export function tenantKey(baseKey){
  const tenant=getCurrentTenant();
  if(!tenant) return null;
  const base=String(baseKey??'').trim().replace(/^atlos:/i,'').replace(/^:+|:+$/g,'');
  if(!base) return null;
  if(/[:\s]/.test(base)) return null;
  return `${NS_PREFIX}:${tenant}:${base}`;
}

// V39-05B: acceso JSON fail-closed a claves namespaced. Sin tenant válido no
// lee ni escribe nada global: lectura devuelve el fallback, escritura se omite.
export function tenantGetJSON(baseKey, fallback){
  const key=tenantKey(baseKey);
  if(!key){ try{ console.warn('[tenant] no tenant, read skipped',baseKey) }catch{} return fallback }
  try{
    const raw=localStorage.getItem(key);
    if(raw==null) return fallback;
    return JSON.parse(raw);
  }catch(err){ console.warn('[tenant] read failed',baseKey,err?.message||err); return fallback }
}
export function tenantSetJSON(baseKey, value){
  const key=tenantKey(baseKey);
  if(!key){ try{ console.warn('[tenant] no tenant, write skipped',baseKey) }catch{} return false }
  try{ localStorage.setItem(key,JSON.stringify(value)); return true }catch(err){ console.warn('[tenant] write failed',baseKey,err?.message||err); return false }
}

// V39-09B-3: borra las entidades locales namespaced del tenant vigente
// (clases/profesores/inscripciones/library). Legacy global intacto (cuarentena).
// V39-10: se incluye 'alumnos-ext' (ya namespaced vía tenantGetJSON/SetJSON).
// No toca cola, IDB, auth ni sesión. Devuelve la cantidad de claves eliminadas.
const ENTITY_BASES=['clases','profesores','inscripciones','library','alumnos-ext'];

// V39-12B: tombstones acotados. Al agregar un ID a deleted-* se deduplica y se
// aplica tope FIFO (defecto 500) para que la lista no crezca indefinidamente.
// Legacy global intacto (cuarentena). Devuelve la lista resultante.
export function pushDeletedId(baseKey, id, max=500){
  const sid=String(id??'').trim();
  if(!sid) return tenantGetJSON(baseKey,[]);
  let arr=tenantGetJSON(baseKey,[]);
  if(!Array.isArray(arr)) arr=[];
  const clean=arr.map(String).filter(x=>x!==sid);
  clean.push(sid);
  const cap=(typeof max==='number'&&max>0)?Math.floor(max):500;
  const out=clean.length>cap?clean.slice(clean.length-cap):clean;
  tenantSetJSON(baseKey,out);
  return out;
}
// V39-12B: des-tombstoning por ID. Si el sid vuelve a existir (re-creación o
// reutilización del backend), se libera para que no se filtre. Devuelve true
// si eliminó al menos una entrada.
export function removeDeletedId(baseKey, id){
  const sid=String(id??'').trim();
  if(!sid) return false;
  const arr=tenantGetJSON(baseKey,[]);
  if(!Array.isArray(arr)) return false;
  const out=arr.map(String).filter(x=>x!==sid);
  if(out.length===arr.length) return false;
  tenantSetJSON(baseKey,out);
  return true;
}
export function clearTenantEntityData(){
  const tenant=getCurrentTenant();
  if(!tenant) return 0;
  let n=0;
  for(const base of ENTITY_BASES){
    const key=`${NS_PREFIX}:${tenant}:${base}`;
    try{ if(localStorage.getItem(key)!=null){ localStorage.removeItem(key); n++ } }catch{}
  }
  return n;
}
