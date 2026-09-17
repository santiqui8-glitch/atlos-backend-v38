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
