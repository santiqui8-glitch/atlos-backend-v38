import React from 'react'
import useClock from '../hooks/useClock.js'
import { PanelTitle, Empty } from '../components/ui.jsx'
import { money } from '../utils/helpers.js'

export default function VistaInicio({stats,clases,usuario,onNavigate}){
  const now=useClock()
  const hora=now.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})
  const fecha=now.toLocaleDateString('es-AR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})
  // calendario simple mes actual
  const y=now.getFullYear(), m=now.getMonth(); const first=new Date(y,m,1).getDay(); const days=new Date(y,m+1,0).getDate()
  const dias=['D','L','M','M','J','V','S']
  return <>
    <section className="hero"><div><span className="eyebrow">ATLOS · CONTROL TOTAL</span><h2>Bienvenido/a, <em>{usuario}</em></h2><p>Gestión de Gimnasios ATLOS — v37 web</p></div><img src="/logo.png" alt="" width="256" height="175" className="hero-badge-img" onError={e=>e.currentTarget.style.display='none'}/></section>
    <div className="cards">
      <div className="stat green"><div className="stat-icon" aria-hidden="true">👥</div><span>Alumnos</span><strong>{stats.total}</strong><small>{stats.conRutina} con rutina</small></div>
      <div className="stat blue"><div className="stat-icon" aria-hidden="true">🏋</div><span>Asist. hoy</span><strong>{stats.today}</strong><small>Presentes</small></div>
      <div className="stat orange"><div className="stat-icon" aria-hidden="true">$</div><span>Ingresos mes</span><strong>{money(stats.revenue)}</strong><small>{stats.totalPagos} pagos</small></div>
      <div className="stat purple"><div className="stat-icon" aria-hidden="true">📋</div><span>Ejercicios</span><strong>{stats.totalEj}</strong><small>Cargados</small></div>
    </div>
    <div className="grid2">
      <div style={{display:'grid',gap:16}}>
        <section className="panel"><h3 style={{margin:0,fontSize:13,letterSpacing:'.1em',color:'var(--accent)'}}>HORA ACTUAL</h3><div style={{fontSize:30,fontWeight:900,marginTop:6,color:'var(--text)'}}>{hora}</div><small style={{color:'var(--muted)'}}>{fecha}</small></section>
        <section className="panel"><PanelTitle title={`Calendario · ${now.toLocaleDateString('es-AR',{month:'long',year:'numeric'})}`}/><div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:6,textAlign:'center',fontSize:12}}>{dias.map(d=><b key={d} style={{color:'var(--accent)'}}>{d}</b>)}{Array(first).fill(0).map((_,i)=><span key={'e'+i}></span>)}{Array.from({length:days},(_,i)=>{const d=i+1; const isToday=d===now.getDate(); return <span key={d} style={{padding:'8px',borderRadius:8,background:isToday?'var(--accent)':'transparent',color:isToday?'var(--text)':'var(--muted)',fontWeight:isToday?800:500,border:isToday?'none':'1px solid transparent'}}>{d}</span>})}</div></section>
        <div className="quick-grid">
          <div className="quick-card" onClick={()=>onNavigate('planificacion')}><i>👥</i><b>Alumnos</b></div>
          <div className="quick-card" onClick={()=>onNavigate('asistencia')}><i>✓</i><b>Asistencia</b></div>
          <div className="quick-card" onClick={()=>onNavigate('gestion')}><i>💳</i><b>Gestión</b></div>
          <div className="quick-card" onClick={()=>onNavigate('planes')}><i>🏋</i><b>Planes</b></div>
        </div>
      </div>
      <section className="panel"><PanelTitle title="Clases del día"/><div className="rows">{clases.length?clases.slice(0,6).map(c=><div className="row" key={c.id}><div className="miniavatar">🗓</div><div className="grow"><b>{c.nombre||c.name}</b><span>{c.dia_mes||c.dia} · {c.hora_inicio||c.inicio}–{c.hora_fin||c.fin} {c.profesor?`· ${c.profesor}`:''}</span></div><span className="badge">{c.capacidad||'-'} cap</span></div>):<Empty text="No hay clases cargadas. Creá una en Clases."/>}</div></section>
    </div>
  </>
}
