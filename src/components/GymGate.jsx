import React, { useState } from 'react'
import { api, setGymHWID } from '../services/api'
import { genGymCode } from '../utils/helpers.js'


export default function GymGate({onOk}){
  const [codigo,setCodigo]=useState(''); const [loading,setLoading]=useState(false); const [err,setErr]=useState(null); const [copied,setCopied]=useState(false)
  const copy=async()=>{ const v=codigo.trim().toUpperCase()||genGymCode(); setCodigo(v); try{ await navigator.clipboard.writeText(v); setCopied(true); setTimeout(()=>setCopied(false),1500) }catch(e){ alert('No se pudo copiar: '+e.message) } }
  const verificar=async(e)=>{ e.preventDefault(); const c=codigo.trim().toUpperCase(); if(!c) return alert('Ingresá el código del gimnasio'); setLoading(true); setErr(null); try{ const r=await api.checkLicencia(c); if(r && r.activo){ setGymHWID(c); if(onOk) onOk(); } else setErr('Licencia inválida o vencida — comunicate con ATLOS'); }catch(e){ setErr('Licencia inválida o vencida — comunicate con ATLOS'); } setLoading(false) }
  return <div className="login-shell"><div className="login-card">
    <img src="/logo.png" alt="ATLOS" width="256" height="175" className="login-logo" onError={e=>e.currentTarget.style.display='none'} />
    <h1>ATLOS</h1><p className="subtitle">GESTIÓN DE GIMNASIO</p>
    <p>Para activar esta PC necesitás el <b>código del gimnasio (HWID)</b> que te entrega ATLOS.</p>
    <form className="form" onSubmit={verificar} style={{gap:16}}>
      <div className="login-field"><i>🔑</i><input value={codigo} onChange={e=>setCodigo(e.target.value.toUpperCase())} placeholder="ATLOS-XXXXXXXX" required/></div>
      {err&&<div className="login-error">{err}</div>}
      <button className="login-btn" disabled={loading}>{loading?'VERIFICANDO...':'VERIFICAR Y CONTINUAR'}</button>
    </form>
    <div style={{display:'flex',gap:8,marginTop:12}}>
      <button type="button" className="ghost" style={{flex:1}} onClick={()=>setCodigo(genGymCode())}>🎲 Generar</button>
      <button type="button" className="ghost" style={{flex:1}} onClick={copy}>{copied?'✓ Copiado':'📋 Copiar'}</button>
    </div>
    <small>Generá un código para vender una licencia nueva o pegá el de tu gym.</small>
  </div></div>
}
