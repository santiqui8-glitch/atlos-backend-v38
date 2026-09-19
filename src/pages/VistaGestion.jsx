import React, { useState } from 'react'
import { api, queuePush, readTenantQueue, writeTenantQueue, sameQueueContext } from '../services/api'
import { pushDeletedId } from '../services/tenant'
import { put, remove } from '../services/db'
import { money, toISO, toDisplay, onEnterNext, isSameMonth, today } from '../utils/helpers.js'
import { Empty } from '../components/ui.jsx'


export default function VistaGestion({payments,students,stats,rol,onNew,refresh}){
  const [sel,setSel]=useState(null)
  const [edit,setEdit]=useState(null) // pago a editar
  const selected=payments.find(p=>String(p.id)===String(sel))
  const totalMes=payments.filter(p=>isSameMonth(p.date, today())).reduce((a,b)=>a+Number(b.amount||0),0)
  const handleDelete=async()=>{
    if(!selected) return alert('Seleccioná un pago de la lista.')
    if(!confirm(`¿Eliminar pago ID #${selected.id} de ${selected.alumnoNombre||students.find(s=>String(s.id)===String(selected.studentId))?.name||'—'}?`)) return
    pushDeletedId('deleted-pagos',selected.id)
    // BLOQUE 4K-B: cancelar create pendiente de este pago (evita fantasma en backend, como alumnos).
    try{
      const _q=readTenantQueue();
      if(_q){
        const _id=String(selected._localId||selected.id||'');
        const _f=_q.filter(it=>!(it.type==='pago'&&String(it.payload?._localId||'')===_id && sameQueueContext(it)));
        if(_f.length!==_q.length) writeTenantQueue(_f);
      }
    }catch{}
    await remove('payments',selected.id)
    setSel(null); refresh()
  }
  const handleEdit=()=>{
    if(!selected) return alert('Seleccioná un pago de la lista.')
    setEdit(selected)
  }
  const saveEdit=async(e)=>{
    e.preventDefault(); const f=new FormData(e.currentTarget)
    const sid=f.get('alumno'); const isUUID=String(sid).includes('-')
    const fechaISO=toISO(f.get('fecha')); const data={alumno_id:isUUID?String(sid):Number(sid), monto:Number(f.get('monto')), concepto:f.get('concepto'), metodo:f.get('metodo'), fecha:fechaISO}
    // BLOQUE 4K-B: vínculo local del pago (coalescing por _localId, como alumnos).
    const _lid=String(selected._localId||selected.id||'');
    const coalescePago=(patch,fechaMeta)=>{
      if(!_lid) return false;
      try{
        const _q=readTenantQueue();
        if(!_q) return false;
        let _hit=false;
        const _f=_q.map(it=>{ if(it.type==='pago'&&String(it.payload?._localId||'')===_lid && sameQueueContext(it)){ _hit=true; const _np={...it.payload, ...patch}; const _ni={...it, payload:_np}; if(fechaMeta!==undefined) _ni.fecha=fechaMeta; return _ni } return it });
        if(_hit) writeTenantQueue(_f);
        return _hit;
      }catch{ return false }
    };
    const dropPendingPago=()=>{
      if(!_lid) return;
      try{
        const _q=readTenantQueue();
        if(!_q) return;
        const _f=_q.filter(it=>!(it.type==='pago'&&String(it.payload?._localId||'')===_lid && sameQueueContext(it)));
        if(_f.length!==_q.length) writeTenantQueue(_f);
      }catch{}
    };
    if(!isUUID){ try{ await api.crearPago({alumno_id:Number(sid), monto:data.monto, concepto:data.concepto, metodo:data.metodo}); pushDeletedId('deleted-pagos',selected.id); dropPendingPago(); await remove('payments',selected.id); setEdit(null); setSel(null); refresh(); return }catch(err){ console.warn('edit api fallo',err.message); if(String(err.message).includes('Failed to fetch')){ const _patch={alumno_id:Number(sid), monto:data.monto, concepto:data.concepto, metodo:data.metodo}; if(!coalescePago(_patch,fechaISO)) queuePush('pago', {..._patch, _localId:_lid}, {fecha:fechaISO}) } } }
    await remove('payments',selected.id); await put('payments',{id:selected.id,_localId:selected._localId||selected.id,studentId:String(sid),amount:data.monto,date:fechaISO,note:data.concepto,metodo:data.metodo})
    coalescePago({alumno_id:isUUID?String(sid):Number(sid), monto:data.monto, concepto:data.concepto, metodo:data.metodo}, fechaISO);
    setEdit(null); setSel(null); refresh()
  }
  return <section className="panel">
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:12}}>
      <h3 style={{margin:0,fontSize:14}}>Gestión</h3>
      <div style={{display:'flex',gap:8}}>
        <button className="primary" onClick={onNew}>+ REGISTRAR PAGO</button>
        {rol!=='Empleado'&&<><button className="ghost" onClick={handleEdit}>EDITAR</button><button className="ghost danger" onClick={handleDelete}>ELIMINAR</button></>}
      </div>
    </div>
    <div className="cards" style={{marginTop:14,gridTemplateColumns:rol==='Empleado'?'1fr 1fr':'repeat(3,1fr)'}}>
      {rol!=='Empleado'&&<div className="stat orange"><div className="stat-icon" aria-hidden="true">$</div><span>INGRESOS</span><strong>{money(totalMes)}</strong></div>}
      <div className="stat green"><div className="stat-icon" aria-hidden="true">🧾</div><span>PAGOS</span><strong>{payments.length}</strong></div>
      <div className="stat blue"><div className="stat-icon" aria-hidden="true">✓</div><span>ALUMNOS AL DÍA</span><strong>{stats.alumnosAlDia}</strong></div>
    </div>
    <div className="table" style={{marginTop:14,border:'1px solid var(--card-border)',borderRadius:12,overflow:'hidden'}}>
      <div className="thead" style={{display:'grid',gridTemplateColumns:'60px 120px 1.5fr 1.2fr 110px 120px',background:'var(--table-head)',padding:'10px 8px',margin:0}}><span>ID</span><span>Fecha</span><span>Alumno</span><span>Concepto</span><span>Monto ($)</span><span>Medio de Pago</span></div>
      <div style={{maxHeight:420,overflow:'auto'}}>
        {payments.slice().reverse().map(p=>{
          const s=students.find(x=>String(x.id)===String(p.studentId))
          const isSel=String(sel)===String(p.id)
          return <div key={p.id} onClick={()=>setSel(p.id)} className="trow" style={{display:'grid',gridTemplateColumns:'60px 120px 1.5fr 1.2fr 110px 120px',background:isSel?'var(--selected)':'transparent',cursor:'pointer',borderLeft:isSel?'3px solid var(--accent)':'3px solid transparent',padding:'10px 8px',margin:0}}>
            <span style={{fontFamily:'monospace',fontSize:11,color:'var(--muted)'}}>{String(p.id).slice(0,6)}</span><span style={{fontSize:12}}>{toDisplay(p.date)}</span><span><b>{p.alumnoNombre||s?.name||'—'}</b></span><span>{p.note||'Cuota Mensual'}</span><span style={{fontWeight:700}}>{money(p.amount)}</span><span>{p.metodo||'Efectivo'}</span>
          </div>
        })}
        {!payments.length&&<Empty text="No hay pagos. Registrá el primero."/>}
        {selected&&<div style={{padding:'8px 12px',fontSize:11,color:'var(--muted)',borderTop:'1px solid var(--card-border)',background:'var(--selected)'}}>Seleccionado: ID #{String(selected.id).slice(0,6)} · Click en otro para cambiar · Doble click afuera deselecciona</div>}
      </div>
    </div>
    {edit&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setEdit(null)}}><div className="modal"><div className="modal-head"><h3>Editar Pago</h3><button onClick={()=>setEdit(null)}>×</button></div>
      <form onSubmit={saveEdit} onKeyDown={onEnterNext} className="form">
        <label>Alumno<select name="alumno" defaultValue={edit.studentId} required>{students.map(a=><option key={a.id} value={a.id}>{a.name} (ID: {String(a.id).slice(0,6)})</option>)}</select></label>
        <label>Monto ($)<input name="monto" type="number" step="0.01" defaultValue={edit.amount} required/></label>
        <label>Concepto<select name="concepto" defaultValue={edit.note||'Cuota Mensual'}><option>Cuota Mensual</option><option>Matricula</option><option>Pase Libre</option><option>Personalizado</option></select></label>
        <label>Medio de Pago<select name="metodo" defaultValue={edit.metodo||'Efectivo'}><option>Efectivo</option><option>Transferencia</option><option>Debito</option><option>Credito</option></select></label>
        <label>Fecha (DD/MM/AAAA)<input name="fecha" defaultValue={edit.date} placeholder="DD/MM/AAAA" required/></label>
        <button className="primary wide">GUARDAR CAMBIOS</button>
      </form>
    </div></div>}
  </section>
}
