import React, { useState, useEffect, useMemo } from 'react'
import { api, setGymHWID } from '../services/api'
import { PanelTitle } from '../components/ui.jsx'
import { money, toDisplay, onEnterNext, genGymCode } from '../utils/helpers.js'


export default function VistaLicencias(){
  const [lic,setLic]=useState(null); const [loading,setLoading]=useState(true); const [gymInput,setGymInput]=useState(()=> localStorage.getItem('atlos-gym-hwid')||'')
  const [all,setAll]=useState([]); const [q,setQ]=useState('')
  const hwid=localStorage.getItem('atlos-gym-hwid') || localStorage.getItem('atlos-hwid')||'—'
  const fetchLic=async()=>{ setLoading(true); try{ const d=await api.checkLicencia(); setLic(d) }catch(e){ setLic({hwid, activo:false, vence:null, dias_restantes:0, error:e.message})} try{ const rows=await api.listarLicencias(); setAll(Array.isArray(rows)?rows:[]) }catch(e){ console.warn(e.message) } setLoading(false) }
  useEffect(()=>{ fetchLic(); const t=setInterval(fetchLic, 5*60*1000); return ()=>clearInterval(t) },[])
  const renovar=async(meses)=>{ try{ await api.renovarLicencia(hwid, meses, 'Gym '+hwid.slice(-4)); alert(`Licencia renovada ${meses} mes(es)`); fetchLic() }catch(e){ alert('Error al renovar: '+e.message)} }
  const guardarGym=()=>{ if(!gymInput.trim()) return alert('Ingresá el código del gimnasio'); setGymHWID(gymInput.trim().toUpperCase()); localStorage.setItem('atlos-gym-hwid', gymInput.trim().toUpperCase()); alert('Código de gimnasio guardado. Todas las PCs con este código comparten la misma licencia y vencimiento. Refrescá la página.'); fetchLic() }
  // estadísticas de ventas multi-gym: dedup por hwid (fila más reciente)
  const stats=useMemo(()=>{
    const by=new Map(); for(const r of all){ const v=r.vence||r.fecha_expiracion||''; const p=by.get(r.hwid); if(!p || (v && (v>=(p.vence||p.fecha_expiracion||'')))) by.set(r.hwid,{...r}) }
    const rows=[...by.values()]; const monthOf={mensual:1,bimestral:2,trimestral:3,semestral:6,anual:12}
    let activas=0,vencidas=0,porVencer=0,mrr=0
    for(const r of rows){
      const vence=r.vence||r.fecha_expiracion||''; const dias=vence? Math.ceil((new Date(vence)-new Date())/86400000): -999
      const estado=String(r.estado||'').toLowerCase()
      const activo=r.activo!==undefined? !!r.activo : estado==='activa'
      if(estado==='bloqueada' || !activo || dias<0) vencidas++
      else { activas++; if(dias<=7) porVencer++; mrr+=Number(r.precio||0)/(monthOf[String(r.tipo||'mensual').toLowerCase()]||1) }
    }
    return {total:rows.length, activas, vencidas, porVencer, mrr}
  },[all])
  const filtradas=all.filter(r=>{ const hay=''+(r.gym_name||r.cliente||'')+' '+(r.hwid||'')+' '+(r.email||''); if(!q.trim()) return true; return hay.toLowerCase().includes(q.trim().toLowerCase()) })
  if(loading) return <section className="panel"><PanelTitle title="Panel de Ventas"/><p className="copy">Cargando estadísticas y licencias...</p></section>
  const activo=lic?.activo; const dias=lic?.dias_restantes??0; const vence=lic?.vence? toDisplay(lic.vence):'—'
  return <div style={{display:'grid',gap:14}}>
    <section className="panel"><PanelTitle title="Licencia por Gimnasio — Multi-PC"/><p className="copy">Un gimnasio = una licencia <code>HWID</code> compartida. Todas las PCs con el mismo <b>Código de Gimnasio</b> comparten vencimiento y control. Más control que por usuario.</p>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:14}}>
        <div style={{background: activo?'rgba(34,197,94,.08)':'rgba(239,68,68,.08)',border:`1px solid ${activo?'#22C55E':'#EF4444'}`,borderRadius:12,padding:14}}>
          <div style={{fontSize:11,letterSpacing:'.06em',color:'var(--muted)',fontWeight:700}}>{activo?'🟢 ACTIVA':'🔴 VENCIDA'}</div>
          <div style={{fontWeight:900,marginTop:4}}>Gym {lic?.gym_name||hwid.slice(-4)} · {hwid}</div>
          <div style={{fontSize:12,marginTop:4}}><b>Vence:</b> {vence} · <b>Quedan:</b> {dias} días</div>
          <div style={{fontSize:11,color:'var(--muted)',marginTop:4}}>PCs activas: {lic?.pcs||1} · HWID: {lic?.hwid||hwid}</div>
          {!activo&&<div style={{marginTop:10,padding:'8px 10px',background:'rgba(239,68,68,.1)',borderRadius:8,fontSize:12,color:'#EF4444'}}>Licencia vencida — el gym quedará bloqueado. Renová abajo.</div>}
        </div>
        <div style={{border:'1px solid var(--card-border)',borderRadius:12,padding:14,background:'var(--bg)'}}>
          <div style={{fontSize:11,letterSpacing:'.06em',color:'var(--muted)',fontWeight:700,marginBottom:8}}>CÓDIGO DE GIMNASIO (multi-PC)</div>
          <div style={{display:'flex',gap:8}}><input value={gymInput} onChange={e=>setGymInput(e.target.value.toUpperCase())} placeholder="ATLOS-GYM-XXXX" style={{flex:1,border:'1px solid var(--card-border)',background:'var(--input)',color:'var(--text)',borderRadius:8,padding:'10px'}}/><button className="primary" onClick={guardarGym}>Guardar</button></div>
          <div style={{fontSize:11,color:'var(--muted)',marginTop:6}}>Pegá el mismo código en todas las PCs del gym. Ej: <code>ATLOS-GYM-CENTRO</code> · Se guarda en <code>atlos-gym-hwid</code> y se envía como <code>X-HWID</code>.</div>
        </div>
      </div>
      <div style={{display:'flex',gap:8,marginTop:14,flexWrap:'wrap'}}>
        <button className="primary" onClick={()=>renovar(1)}>Renovar 1 mes</button>
        <button className="ghost" onClick={()=>renovar(3)}>Renovar 3 meses</button>
        <button className="ghost" onClick={()=>renovar(12)}>Renovar 12 meses</button>
        <button className="ghost" onClick={fetchLic}>Verificar ahora</button>
      </div>
      <div style={{fontSize:11,color:'var(--muted)',marginTop:8}}>Verificación automática cada 5 min como el desktop <code>verificar_licencia_bloqueante</code>. Si vence, todas las PCs del gym se bloquean.</div>
    </section>
    <section className="panel">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10}}><PanelTitle title="Panel de Ventas — Multi-Gym"/><button className="ghost" onClick={fetchLic}>↻ Actualizar</button></div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginTop:12}}>
        <div className="stat blue"><div className="stat-icon" aria-hidden="true">🏋</div><span>Gyms</span><strong>{stats.total}</strong><small>licencias</small></div>
        <div className="stat green"><div className="stat-icon" aria-hidden="true">🟢</div><span>Activas</span><strong>{stats.activas}</strong><small>al día</small></div>
        <div className="stat orange"><div className="stat-icon" aria-hidden="true">⏳</div><span>Por vencer ≤7d</span><strong>{stats.porVencer}</strong><small>renovar ahora</small></div>
        <div className="stat" style={{background:'rgba(239,68,68,.08)',border:'1px solid #EF4444',color:'#EF4444'}}><div className="stat-icon" aria-hidden="true">🔴</div><span>Vencidas</span><strong>{stats.vencidas}</strong><small>posibles bajas</small></div>
        <div className="stat purple"><div className="stat-icon" aria-hidden="true">💰</div><span>MRR estimado</span><strong>{money(stats.mrr)}</strong><small>por mes activo</small></div>
      </div>
      <div style={{display:'flex',gap:8,margin:'14px 0 0'}}><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar por gym, código (HWID) o email..." style={{flex:1,border:'1px solid var(--card-border)',background:'var(--input)',color:'var(--text)',borderRadius:10,padding:'10px 12px',outline:'none'}}/></div>
      <p style={{fontSize:12,color:'var(--muted)',margin:'10px 0'}}>Solo <code>admin Dueño</code>. Cada fila = un gym con su <code>HWID</code> compartido multi-PC. Renová, bloqueá, desbloqueá o eliminá desde acá.</p>
      <TodasLicenciasTable rows={filtradas} onChange={fetchLic} />
      <div style={{marginTop:14,padding:12,background:'var(--bg)',border:'1px solid var(--card-border)',borderRadius:10}}>
        <div style={{fontSize:12,fontWeight:800,marginBottom:8}}>+ Nueva licencia (vender a otro gym)</div>
        <NuevaLicenciaForm onCreated={fetchLic} />
      </div>
    </section>
  </div>
}

function TodasLicenciasTable({rows=[],onChange}){
  const [copied,setCopied]=useState('')
  const copiar=async(hwid)=>{ try{ await navigator.clipboard.writeText(hwid); setCopied(hwid); setTimeout(()=>setCopied(''),1500) }catch{} }
  const handleEliminar=async(hwid)=>{ if(!confirm(`¿Eliminar licencia ${hwid}?`)) return; try{ await api.eliminarLicencia(hwid); alert('Licencia eliminada'); onChange&&onChange() }catch(e){ alert('Error al eliminar: '+e.message)} }
  const handleBloquear=async(l)=>{ const vence=l.vence||l.fecha_expiracion||''; const dias=vence? Math.ceil((new Date(vence)-new Date())/86400000): -999; const isAct=(l.activo!==undefined? !!l.activo : String(l.estado||'').toLowerCase()==='activa') && dias>=0; if(isAct){ if(!confirm(`¿Bloquear ${l.hwid}?`)) return; try{ await api.bloquearLicencia(l.hwid); alert('Licencia bloqueada'); onChange&&onChange() }catch(e){ alert(e.message)} } else { if(!confirm(`¿Desbloquear ${l.hwid}? Se renueva 30 días`)) return; try{ await api.desbloquearLicencia(l.hwid); alert('Licencia desbloqueada'); onChange&&onChange() }catch(e){ alert(e.message)} } }
  const renovar=async(l,meses)=>{ if(!confirm(`¿Renovar ${l.hwid} ${meses} mes(es)?`)) return; try{ await api.renovarLicencia(l.hwid, meses, l.gym_name||l.cliente); alert('Licencia renovada'); onChange&&onChange() }catch(e){ alert('Error: '+e.message)} }
  if(!rows.length) return <div style={{padding:12,color:'var(--muted)',fontSize:12}}>No hay licencias que coincidan. Creá la primera abajo.</div>
  return <div style={{overflow:'auto',border:'1px solid var(--card-border)',borderRadius:10}}>
    <div style={{display:'grid',gridTemplateColumns:'1.1fr 1.2fr 1.7fr 85px 90px 105px 115px 220px',gap:0,background:'var(--table-head)',padding:'10px 8px',fontSize:10,letterSpacing:'.06em',textTransform:'uppercase',color:'var(--muted)',fontWeight:700}}><span>Gym</span><span>Email</span><span>HWID</span><span>Plan</span><span>Precio</span><span>Vence</span><span>Estado</span><span>Acciones</span></div>
    {rows.map(l=>{
      const vence=l.vence||l.fecha_expiracion||''; const dias=vence? Math.ceil((new Date(vence)-new Date())/86400000): -999
      const estado=String(l.estado||'').toLowerCase(); const activo=l.activo!==undefined? !!l.activo : estado==='activa'
      const isAct=activo && dias>=0
      const chip=estado==='bloqueada'?['Bloqueada','#EF4444']:(!isAct?['Vencida','#EF4444']:(dias<=7?[`Por vencer ${dias}d`,'#F59E0B']:['Activa','#22C55E']))
      return <div key={l.hwid} style={{display:'grid',gridTemplateColumns:'1.1fr 1.2fr 1.7fr 85px 90px 105px 115px 220px',gap:0,padding:'10px 8px',borderTop:'1px solid var(--card-border)',fontSize:12,background:isAct?'transparent':'rgba(239,68,68,.04)',alignItems:'center'}}>
        <span><b>{l.gym_name||l.cliente||'—'}</b></span>
        <span style={{fontSize:11,color:'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.email||'—'}</span>
        <span style={{display:'flex',alignItems:'center',gap:5}}><span style={{fontFamily:'monospace',fontSize:10}}>{l.hwid}</span><button className="ghost" onClick={()=>copiar(l.hwid)} title="Copiar HWID" style={{padding:'2px 6px',fontSize:10}}>{copied===l.hwid?'✓':'📋'}</button></span>
        <span style={{textTransform:'capitalize',fontSize:11}}>{String(l.tipo||'mensual')}</span>
        <span>{Number(l.precio||0)? money(l.precio):'—'}</span>
        <span>{vence? toDisplay(vence):'—'}</span>
        <span><span style={{background:chip[1]+'1e',color:chip[1],padding:'4px 8px',borderRadius:999,fontSize:11,fontWeight:800,whiteSpace:'nowrap'}}>{chip[0]}</span></span>
        <span style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
          <button className="ghost" onClick={()=>renovar(l,1)} style={{padding:'4px 8px',fontSize:10,color:'#22C55E'}}>+1m</button>
          <button className="ghost" onClick={()=>renovar(l,3)} style={{padding:'4px 8px',fontSize:10,color:'#22C55E'}}>+3m</button>
          <button className="ghost" onClick={()=>handleBloquear(l)} style={{padding:'4px 8px',fontSize:10,color:isAct?'#EF4444':'#22C55E'}}>{isAct?'Bloquear':'Desbloquear'}</button>
          <button className="ghost" onClick={()=>handleEliminar(l.hwid)} style={{padding:'4px 8px',fontSize:10,color:'var(--danger)',borderColor:'var(--danger)'}}>Eliminar</button>
        </span>
      </div>
    })}
  </div>
}

function NuevaLicenciaForm({onCreated}){
  const [hwid,setHwid]=useState(''); const [gym,setGym]=useState(''); const [meses,setMeses]=useState(1); const [clave,setClave]=useState(''); const [email,setEmail]=useState(''); const [plan,setPlan]=useState('mensual'); const [precio,setPrecio]=useState(''); const [loading,setLoading]=useState(false); const [copied,setCopied]=useState(false)
  const copyHwid=async()=>{ const v=hwid.trim().toUpperCase()||genGymCode(); setHwid(v); try{ await navigator.clipboard.writeText(v); setCopied(true); setTimeout(()=>setCopied(false),1500) }catch(e){ alert('No se pudo copiar: '+e.message) } }
  const crear=async(e)=>{ e.preventDefault(); if(!hwid.trim()||!gym.trim()) return alert('HWID y Gym requeridos'); setLoading(true); try{ const resp=await api.renovarLicencia(hwid.trim().toUpperCase(), Number(meses), gym.trim(), clave.trim()||undefined, {email: email.trim()||undefined, tipo: plan, precio: Number(precio)||0}); const adminMsg=resp?.admin?`\nAdmin del gym: admin · Clave: ${resp.clave}`:''; alert(`Licencia creada para ${hwid.toUpperCase()} — ${gym} — ${meses} mes(es)${adminMsg}`); setHwid(''); setGym(''); setClave(''); setEmail(''); setPrecio(''); if(onCreated) onCreated() }catch(err){ alert('Error: '+err.message)} setLoading(false) }
  return <form onSubmit={crear} onKeyDown={onEnterNext} style={{display:'grid',gap:8}}>
    <div style={{display:'grid',gridTemplateColumns:'1.1fr 1fr 110px',gap:8}}><label style={{display:'grid',gap:4,fontSize:11,color:'var(--muted)'}}>HWID<div style={{display:'flex',gap:6}}><input value={hwid} onChange={e=>setHwid(e.target.value.toUpperCase())} placeholder="ATLOS-GYM-SUR" required style={{flex:1,border:'1px solid var(--card-border)',background:'var(--input)',color:'var(--text)',borderRadius:8,padding:'10px'}}/><button type="button" className="ghost" onClick={()=>setHwid(genGymCode())} style={{padding:'8px',fontSize:12}} title="Generar HWID">🎲</button><button type="button" className="ghost" onClick={copyHwid} style={{padding:'8px',fontSize:12}} title="Copiar HWID">{copied?'✓':'📋'}</button></div></label><label style={{display:'grid',gap:4,fontSize:11,color:'var(--muted)'}}>Gym<input value={gym} onChange={e=>setGym(e.target.value)} placeholder="Gym Sur" required style={{border:'1px solid var(--card-border)',background:'var(--input)',color:'var(--text)',borderRadius:8,padding:'10px'}}/></label><label style={{display:'grid',gap:4,fontSize:11,color:'var(--muted)'}}>Plan<select value={plan} onChange={e=>setPlan(e.target.value)} style={{border:'1px solid var(--card-border)',background:'var(--input)',color:'var(--text)',borderRadius:8,padding:'10px'}}><option value="mensual">Mensual</option><option value="trimestral">Trimestral</option><option value="semestral">Semestral</option><option value="anual">Anual</option></select></label></div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 110px',gap:8}}><label style={{display:'grid',gap:4,fontSize:11,color:'var(--muted)'}}>Email del dueño<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="dueño@gym.com" style={{border:'1px solid var(--card-border)',background:'var(--input)',color:'var(--text)',borderRadius:8,padding:'10px'}}/></label><label style={{display:'grid',gap:4,fontSize:11,color:'var(--muted)'}}>Meses<select value={meses} onChange={e=>setMeses(e.target.value)} style={{border:'1px solid var(--card-border)',background:'var(--input)',color:'var(--text)',borderRadius:8,padding:'10px'}}><option value={1}>1 mes</option><option value={3}>3 meses</option><option value={6}>6 meses</option><option value={12}>12 meses</option></select></label><label style={{display:'grid',gap:4,fontSize:11,color:'var(--muted)'}}>Precio ($)<input type="number" min="0" value={precio} onChange={e=>setPrecio(e.target.value)} placeholder="0" style={{border:'1px solid var(--card-border)',background:'var(--input)',color:'var(--text)',borderRadius:8,padding:'10px'}}/></label></div>
    <label style={{display:'grid',gap:4,fontSize:11,color:'var(--muted)'}}>Clave del gimnasio (opcional)<div style={{display:'flex',gap:6}}><input type="password" value={clave} onChange={e=>setClave(e.target.value)} placeholder="Si el gym no tiene admin, se crea con esta clave (default 3808)" style={{flex:1,border:'1px solid var(--card-border)',background:'var(--input)',color:'var(--text)',borderRadius:8,padding:'10px'}}/></div><span style={{fontSize:10,color:'var(--muted)',opacity:.8}}>El backend crea el usuario admin del gym con esta clave si todavía no existe.</span></label>
    <button className="primary" disabled={loading} style={{justifySelf:'start'}}>{loading?'Creando...':'+ Crear licencia'}</button>
  </form>
}
