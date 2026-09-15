import React, { useState } from 'react'
import logo from '../assets/logo.png'


export default function Login({onLogin,onChangeGym}){
  const [err,setErr]=useState(null); const [loading,setLoading]=useState(false)
  const submit=async(e)=>{ e.preventDefault(); setLoading(true); setErr(null); const f=new FormData(e.currentTarget); const u=f.get('user'), p=f.get('password'); const msg=await onLogin(u,p); if(msg) setErr(msg); setLoading(false) }
  return <div className="login-shell"><div className="login-card">
    <img src={logo} alt="ATLOS" className="login-logo" onError={e=>e.currentTarget.style.display='none'} />
    <h1>ATLOS</h1><p className="subtitle">GESTIÓN DE GIMNASIO</p><p>Ingresá a tu panel</p>
    <form className="form" onSubmit={submit} style={{gap:16}}>
      <div className="login-field"><i>👤</i><input name="user" placeholder="Usuario" required/></div>
      <div className="login-field"><i>🔒</i><input name="password" type="password" placeholder="Clave" required/></div>
      {err&&<div className="login-error">{err}</div>}
      <button className="login-btn" disabled={loading}>{loading?'INGRESANDO...':'INICIAR SESIÓN'}</button>
    </form>
    <small>Ingresá tus credenciales</small>
    <button type="button" style={{display:'block',margin:'12px auto 0',background:'none',border:0,color:'var(--accent)',fontSize:11,cursor:'pointer',textDecoration:'underline'}} onClick={()=>{ localStorage.removeItem('atlos-gym-hwid'); if(onChangeGym) onChangeGym(); }}>🔁 Cambiar código del gimnasio</button>
  </div></div>
}
