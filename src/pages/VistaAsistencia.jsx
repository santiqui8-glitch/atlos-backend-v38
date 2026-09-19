import React, { useState } from 'react'
import useClock from '../hooks/useClock.js'
import { parseFecha } from '../utils/helpers.js'


export default function VistaAsistencia({students,payments=[],onCheckin,refresh}){
  const now=useClock()
  const [dni,setDni]=useState('')
  const [preview,setPreview]=useState(null)
  const [msg,setMsg]=useState('')
  const [dniDisplay,setDniDisplay]=useState('----')
  const buscar= (v)=>{ const q=v.trim(); if(!q){ setPreview(null); setDniDisplay('----'); return } setDniDisplay(q); const a=students.find(s=>String(s.dni)===q || String(s.phone)===q || s.name.toLowerCase().includes(q.toLowerCase())); setPreview(a||null)}
  const onEnter=async()=>{
    const q=dni.trim(); if(!q) return
    try{
      const alum=await onCheckin(q)
      // calcular días en gimnasio y días restantes suscripción mensual
      let diasGym=0; try{ const pdj=parseFecha(alum.joinedAt); if(pdj) diasGym=Math.max(0,Math.floor((Date.now()-pdj)/86400000)) }catch{}
      let diasRest=0; try{
        const pagosAlum=payments.filter(p=>String(p.studentId)===String(alum.id))
        if(pagosAlum.length){
          const last=pagosAlum.slice().sort((a,b)=> parseFecha(b.date)-parseFecha(a.date))[0]
          const pd=parseFecha(last.date)
          if(pd){ const venc=new Date(pd); venc.setDate(venc.getDate()+30); diasRest=Math.ceil((venc-Date.now())/86400000); if(diasRest<0) diasRest=0 }
        } else {
          diasRest=Math.max(0,30 - (diasGym % 30 || 30))
        }
      }catch{}
      setMsg(`Bienvenido ${alum.name} que tengas buen entreno! · ${diasGym} días en el gimnasio · Te quedan ${diasRest} días de suscripción mensual`)
      setDni(''); setPreview(null); setDniDisplay('----'); setTimeout(()=>setMsg(''),6000)
    }catch(e){ setMsg('✗ '+e.message); setTimeout(()=>setMsg(''),3000) }
  }
  return <div style={{background:'var(--surface-deep)',margin:'-28px -24px -50px',padding:0,minHeight:'calc(100vh - 60px)',display:'flex',flexDirection:'column',color:'var(--text)'}}>
    <div style={{flex:1,display:'grid',placeItems:'center',padding:24,textAlign:'center',alignContent:'center',gap:12}}>
      <img src="/logo.png" alt="" width="256" height="175" style={{width:160,opacity:.95}} onError={e=>e.currentTarget.style.display='none'}/>
      <div style={{letterSpacing:'.22em',fontSize:11,color:'var(--accent)',fontWeight:800}}>CONTROL DE ACCESO</div>
      <div style={{fontSize:17,minHeight:42,lineHeight:'1.4',fontWeight:700, padding:'10px 14px',borderRadius:10, background: msg.includes('Bienvenido')?'rgba(34,197,94,.12)': msg.startsWith('✗')?'rgba(239,68,68,.12)':'transparent', border: msg.includes('Bienvenido')?'1px solid rgba(34,197,94,.3)': msg.startsWith('✗')?'1px solid rgba(239,68,68,.3)':'1px solid transparent', color: msg.includes('Bienvenido')?'var(--success)': msg.startsWith('✗')?'var(--danger)':'var(--muted)', maxWidth:560}}>{preview?`→ ${preview.name} · DNI ${preview.dni||'—'}`: msg || 'Ingresa tu DNI'}</div>
      <div style={{textAlign:'center',marginTop:6}}>
        <div style={{fontFamily:'monospace',fontSize:42,letterSpacing:'.06em',fontWeight:900,lineHeight:1, color:'var(--text)'}}>{now.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</div>
        <div style={{fontFamily:'monospace',fontSize:11,color:'var(--muted)',marginTop:6,letterSpacing:'.08em'}}>{now.toLocaleDateString('es-AR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})}</div>
      </div>
    </div>
    <div style={{padding:'0 40px 28px',position:'relative'}} onClick={e=>{const inp=e.currentTarget.querySelector('input'); if(inp) inp.focus()}}>
      <div style={{background:'var(--bg)',border:'2px solid var(--card-border)',padding:'18px',textAlign:'center',cursor:'text'}} onClick={e=>{const inp=e.currentTarget.parentElement.querySelector('input'); if(inp) inp.focus()}}><div style={{fontFamily:'monospace',fontSize:36,fontWeight:900,letterSpacing:'.2em',color:'#E2E8F0'}}>{dniDisplay||'----'}</div></div><input autoFocus value={dni} onChange={e=>{setDni(e.target.value); buscar(e.target.value)}} onKeyDown={e=>e.key==='Enter'&&onEnter()} placeholder="" style={{position:'absolute',left:'50%',top:'50%',width:'1px',height:'1px',opacity:0,pointerEvents:'none'}}/><div style={{textAlign:'center',color:'#64748B',fontFamily:'monospace',fontSize:11,marginTop:8}}>Apoya tu DNI o ingresa el número y presiona Enter · {students.length} alumnos</div></div>
  </div>
}
