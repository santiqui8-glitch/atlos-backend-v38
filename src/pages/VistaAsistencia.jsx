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
  // V44-D-06/D-11: terminal centrado (misma funcionalidad: kiosco DNI + reloj).
  const msgTone=msg.includes('Bienvenido')?'ok':msg.startsWith('✗')?'err':'';
  return <div className="kiosk-bleed">
    <div className="page-head">
      <div><h2>Asistencia</h2><p>Control de acceso y presentismo · {students.length} alumnos</p></div>
      <div className="page-actions"><span className="muted-text" style={{fontVariantNumeric:'tabular-nums'}}>{now.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})} · {now.toLocaleDateString('es-AR',{weekday:'short',day:'2-digit',month:'short'})}</span></div>
    </div>
    <div className="kiosk-center">
      <section className="panel kiosk-terminal" aria-label="Terminal de acceso">
        <img src="/logo.png" alt="ATLOS" width="256" height="175" className="kiosk-logo" onError={e=>e.currentTarget.style.display='none'}/>
        <div className="kiosk-eyebrow">CONTROL DE ACCESO</div>
        <div className={msgTone?`kiosk-msg ${msgTone}`:'kiosk-msg'} role="status" aria-live="polite">{preview?`→ ${preview.name} · DNI ${preview.dni||'—'}`: msg || 'Ingresá tu DNI'}</div>
        <div style={{position:'relative',width:'100%',display:'grid',justifyItems:'center'}} onClick={e=>{const inp=e.currentTarget.querySelector('input'); if(inp) inp.focus()}}>
          <div className="dni-pad" onClick={e=>{const inp=e.currentTarget.parentElement.querySelector('input'); if(inp) inp.focus()}}><div className="dni-digits">{dniDisplay||'----'}</div></div><input className="dni-hidden" autoFocus value={dni} onChange={e=>{setDni(e.target.value); buscar(e.target.value)}} onKeyDown={e=>e.key==='Enter'&&onEnter()} placeholder="" aria-label="DNI del alumno"/><div className="dni-hint">Apoyá tu DNI o ingresá el número y presioná Enter</div>
        </div>
      </section>
    </div>
  </div>
}
