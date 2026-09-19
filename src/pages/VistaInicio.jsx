import React from 'react'
import useClock from '../hooks/useClock.js'
import { PanelTitle, Empty } from '../components/ui.jsx'
import { money } from '../utils/helpers.js'

// V43-03: reloj+calendario aislados para que el tick (1/s) no re-renderice el Dashboard.
function ClockCalendar(){
  const now=useClock()
  const hora=now.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})
  const fecha=now.toLocaleDateString('es-AR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})
  // calendario simple mes actual
  const y=now.getFullYear(), m=now.getMonth(); const first=new Date(y,m,1).getDay(); const days=new Date(y,m+1,0).getDate()
  const dias=['D','L','M','M','J','V','S']
  return <>
    <section className="panel"><PanelTitle title="HORA ACTUAL"/><div className="clock-time">{hora}</div><small className="clock-date">{fecha}</small></section>
    <section className="panel"><PanelTitle title={`Calendario · ${now.toLocaleDateString('es-AR',{month:'long',year:'numeric'})}`}/><div className="cal-grid">{dias.map(d=><b key={d} className="cal-dow">{d}</b>)}{Array(first).fill(0).map((_,i)=><span key={'e'+i}></span>)}{Array.from({length:days},(_,i)=>{const d=i+1; const isToday=d===now.getDate(); return <span key={d} className={isToday?'cal-day today':'cal-day'}>{d}</span>})}</div></section>
  </>
}

export default function VistaInicio({stats,clases,usuario,onNavigate}){
  const goKey=(e,id)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); onNavigate(id) } }
  return <>
    <section className="hero"><div><span className="eyebrow">ATLOS · CONTROL TOTAL</span><h2>Bienvenido/a, <em>{usuario}</em></h2><p>Gestión de Gimnasios ATLOS</p></div><img src="/logo.png" alt="" width="256" height="175" className="hero-badge-img" onError={e=>e.currentTarget.style.display='none'}/></section>
    <div className="cards">
      <div className="stat green"><div className="stat-icon" aria-hidden="true">👥</div><span>Alumnos</span><strong>{stats.total}</strong><small>{stats.conRutina} con rutina</small></div>
      <div className="stat blue"><div className="stat-icon" aria-hidden="true">🏋</div><span>Asist. hoy</span><strong>{stats.today}</strong><small>Presentes</small></div>
      <div className="stat orange"><div className="stat-icon" aria-hidden="true">$</div><span>Ingresos mes</span><strong>{money(stats.revenue)}</strong><small>{stats.totalPagos} pagos</small></div>
      <div className="stat purple"><div className="stat-icon" aria-hidden="true">📋</div><span>Ejercicios</span><strong>{stats.totalEj}</strong><small>Cargados</small></div>
    </div>
    <div className="grid2">
      <div style={{display:'grid',gap:16}}>
        <ClockCalendar/>
        <div className="quick-grid">
          <div className="quick-card" role="button" tabIndex={0} onClick={()=>onNavigate('planificacion')} onKeyDown={e=>goKey(e,'planificacion')}><i>👥</i><b>Alumnos</b></div>
          <div className="quick-card" role="button" tabIndex={0} onClick={()=>onNavigate('asistencia')} onKeyDown={e=>goKey(e,'asistencia')}><i>✓</i><b>Asistencia</b></div>
          <div className="quick-card" role="button" tabIndex={0} onClick={()=>onNavigate('gestion')} onKeyDown={e=>goKey(e,'gestion')}><i>💳</i><b>Gestión</b></div>
          <div className="quick-card" role="button" tabIndex={0} onClick={()=>onNavigate('planes')} onKeyDown={e=>goKey(e,'planes')}><i>🏋</i><b>Planes</b></div>
        </div>
      </div>
      <section className="panel"><PanelTitle title="Clases del día"/><div className="rows">{clases.length?clases.slice(0,6).map(c=><div className="row" key={c.id}><div className="miniavatar">🗓</div><div className="grow"><b>{c.nombre||c.name}</b><span>{c.dia_mes||c.dia} · {c.hora_inicio||c.inicio}–{c.hora_fin||c.fin} {c.profesor?`· ${c.profesor}`:''}</span></div><span className="badge">{c.capacidad||'-'} cap</span></div>):<Empty text="No hay clases cargadas. Creá una en Clases."/>}</div></section>
    </div>
  </>
}
