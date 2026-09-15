export const money = n => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n||0))
export const today = () => new Date().toISOString().slice(0,10)
export const fmtHoy = () => new Date().toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'})
export const onEnterNext = e => { if(e.key==='Enter' && e.target.tagName!=='TEXTAREA' && e.target.tagName!=='BUTTON'){ e.preventDefault(); const els=[...e.currentTarget.querySelectorAll('input,select,textarea,button')].filter(el=>!el.disabled && el.type!=='hidden'); const idx=els.indexOf(e.target); if(idx>-1 && idx+1<els.length) els[idx+1].focus() } }
export const parseFecha = s=>{ if(!s) return null; const str=String(s).trim(); if(str.includes('/')){ const [d,m,y]=str.split('/'); const dt=new Date(Number(y), Number(m)-1, Number(d)); return isNaN(dt)?null:dt } if(str.includes('-')){ const [y,m,d]=str.split('-'); const dt=new Date(Number(y), Number(m)-1, Number(d)); return isNaN(dt)?null:dt } const dt=new Date(str); return isNaN(dt)?null:dt }
export const toISO = s=>{ if(!s) return today(); const str=String(s).trim(); if(str.includes('/')){ const [d,m,y]=str.split('/'); return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}` } return str.slice(0,10) }
export const toDisplay = s=>{ if(!s) return ''; const str=String(s).trim(); if(str.includes('-')){ const [y,m,d]=str.split('-'); return `${d}/${m}/${y}` } return str }
export const isSameMonth = (dateStr, refISO=today())=>{ const a=parseFecha(dateStr); const b=parseFecha(refISO); return a&&b&&a.getMonth()===b.getMonth()&&a.getFullYear()===b.getFullYear() }

export function genGymCode(){ const chars='ABCDEF0123456789'; return 'ATLOS-'+Array.from({length:8},()=>chars[Math.floor(Math.random()*chars.length)]).join('') }

export const isUUID = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v||''))
export const safeId = v => {
  if (v === null || v === undefined) return v
  const s = String(v).trim()
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s
}
