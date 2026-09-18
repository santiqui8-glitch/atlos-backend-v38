import React from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from 'recharts'
import { PanelTitle, Empty } from '../components/ui.jsx'
import { money, toISO, today } from '../utils/helpers.js'


export default function VistaReportes({payments,students,clases,ejercicios,attendance,dashboard}){
  const totalAlumnos=students.length
  const totalPagos=payments.reduce((a,b)=>a+Number(b.amount||0),0)
  const presentesHoy=attendance.filter(a=> toISO(a.date)===today()).length
  const porMetodo=payments.reduce((acc,p)=>{const m=p.metodo||'Efectivo'; acc[m]=(acc[m]||0)+Number(p.amount||0); return acc}, {})
  const porMes=payments.reduce((acc,p)=>{const mes=toISO(p.date).slice(0,7); if(mes) acc[mes]=(acc[mes]||0)+Number(p.amount||0); return acc}, {})
  const recientes=students.slice(-5).reverse()
  const chartMes=Object.entries(porMes).sort((a,b)=>a[0].localeCompare(b[0])).slice(-6).map(([mes,total])=>({mes:mes.slice(0,7), total}))
  const chartMetodo=Object.entries(porMetodo).map(([name,value])=>({name,value}))
  const COLORS=['#168FE8','#22C55E','#F59E0B','#EF4444','#6366F1','#06B6D4']
  return <div style={{display:'grid',gap:16}}>
    <div className="panel"><h3 style={{margin:0,color:'var(--accent)',letterSpacing:'.12em'}}>RESUMEN GENERAL</h3><div className="cards">
      <div className="stat green"><div className="stat-icon" aria-hidden="true">👥</div><span>Alumnos</span><strong>{totalAlumnos}</strong></div>
      <div className="stat orange"><div className="stat-icon" aria-hidden="true">$</div><span>Total pagos</span><strong>{money(totalPagos)}</strong></div>
      <div className="stat blue"><div className="stat-icon" aria-hidden="true">🏋</div><span>Ejercicios</span><strong>{ejercicios.length}</strong></div>
      <div className="stat pink"><div className="stat-icon" aria-hidden="true">✓</div><span>Presentes hoy</span><strong>{presentesHoy}</strong></div>
      <div className="stat purple"><div className="stat-icon" aria-hidden="true">🗓</div><span>Clases</span><strong>{clases.length}</strong></div>
    </div></div>
    <div className="grid2">
      <section className="panel"><PanelTitle title="Pagos por método"/><div className="rows">{Object.entries(porMetodo).map(([k,v])=><div className="row" key={k}><div className="miniavatar">$</div><div className="grow"><b>{k}</b></div><strong>{money(v)}</strong></div>)}{!Object.keys(porMetodo).length&&<Empty text="Sin datos"/>}</div></section>
      <section className="panel"><PanelTitle title="Pagos por mes (últimos 6)"/><div className="rows">{Object.entries(porMes).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,6).map(([k,v])=><div className="row" key={k}><div className="grow"><b>{k}</b></div><strong>{money(v)}</strong></div>)}{!Object.keys(porMes).length&&<Empty text="Sin datos"/>}</div></section>
    </div>
    <div className="grid2">
      <section className="panel"><PanelTitle title="Ingresos por mes (gráfico)"/>{chartMes.length?<ResponsiveContainer width="100%" height={220}><BarChart data={chartMes}><CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)"/><XAxis dataKey="mes" tick={{fill:'var(--muted)',fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:'var(--muted)',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>money(v).replace('ARS','').trim()}/><Tooltip formatter={v=>money(v)} contentStyle={{background:'var(--card)',border:'1px solid var(--card-border)',borderRadius:8}} cursor={{fill:'var(--selected)'}}/><Bar dataKey="total" fill="var(--accent)" radius={[6,6,0,0]} /></BarChart></ResponsiveContainer>:<Empty text="Sin datos para gráfico"/>}</section>
      <section className="panel"><PanelTitle title="Distribución por método"/>{chartMetodo.length?<ResponsiveContainer width="100%" height={220}><PieChart><Pie data={chartMetodo} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}>{chartMetodo.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}</Pie><Tooltip formatter={v=>money(v)} contentStyle={{background:'var(--card)',border:'1px solid var(--card-border)',borderRadius:8}} /></PieChart></ResponsiveContainer>:<Empty text="Sin datos para gráfico"/>}</section>
    </div>
    <div className="grid2">
      <section className="panel"><PanelTitle title="Alumnos recientes"/><div className="rows">{recientes.map(s=><div className="row" key={s.id}><div className="miniavatar">{s.name[0]}</div><div className="grow"><b>{s.name}</b><span>{s.joinedAt}</span></div></div>)}</div></section>
      <section className="panel"><PanelTitle title="Clases populares"/><div className="rows">{clases.slice(0,5).map(c=><div className="row" key={c.id}><div className="miniavatar">🗓</div><div className="grow"><b>{c.nombre||c.name}</b><span>{c.profesor||'—'}</span></div></div>)}{!clases.length&&<Empty text="Sin clases"/>}</div></section>
    </div>
  </div>
}
