import React, { useState } from 'react'
import { api, queuePush, esErrorDeRed, readTenantQueue, writeTenantQueue, sameQueueContext, newOperationId } from '../services/api'
import { pushDeletedId } from '../services/tenant'
import { put, remove } from '../services/db'
import { money, toISO, toDisplay, onEnterNext, isSameMonth, today, parseFecha } from '../utils/helpers.js'
import { Empty } from '../components/ui.jsx'


const PAGE_SIZE=50;
export default function VistaGestion({payments,students,stats,rol,onNew,refresh}){
  const [sel,setSel]=useState(null)
  const [edit,setEdit]=useState(null) // pago a editar
  const [visibles,setVisibles]=useState(PAGE_SIZE) // V43-04: lista larga paginada local
  const [q,setQ]=useState('') // V44-D-10: filtro local (no toca datos ni API)
  const selected=payments.find(p=>String(p.id)===String(sel))
  const totalMes=payments.filter(p=>isSameMonth(p.date, today())).reduce((a,b)=>a+Number(b.amount||0),0)
  const qn=q.trim().toLowerCase();
  const filtrados=!qn?payments:payments.filter(p=>{ const s=students.find(x=>String(x.id)===String(p.studentId)); const hay=`${s?.name||p.alumnoNombre||''} ${p.note||''} ${p.metodo||''} ${p.amount||''} ${toDisplay(p.date)||''}`.toLowerCase(); return hay.includes(qn) })
  // V44-D-10: estado del alumno seleccionado (misma regla +30 días ya usada en notifs/ficha).
  const selAlumno=selected?students.find(s=>String(s.id)===String(selected.studentId)):null;
  const selPagos=selAlumno?payments.filter(p=>String(p.studentId)===String(selAlumno.id)):[];
  const selUltimo=selPagos.slice().sort((a,b)=>(parseFecha(b.date)||new Date(0))-(parseFecha(a.date)||new Date(0)))[0];
  const selVenc=(()=>{ if(!selUltimo) return null; const pd=parseFecha(selUltimo.date); if(!pd) return null; const v=new Date(pd); v.setDate(v.getDate()+30); return v })();
  const selDiff=selVenc?Math.ceil((selVenc-new Date(new Date().setHours(0,0,0,0)))/86400000):null;
  const selEstado=!selAlumno?null:!selUltimo?{label:'Sin pagos',cls:'neutral'}:selDiff<0?{label:'Vencido',cls:'vencido'}:selDiff<=5?{label:`Por vencer (${selDiff}d)`,cls:'warn'}:{label:`Al día (${selDiff}d)`,cls:''};
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
    if(!isUUID){ const opId=newOperationId(); const _patch={alumno_id:Number(sid), monto:data.monto, concepto:data.concepto, metodo:data.metodo};
      // V44-B: editar in-place vía PUT /pagos/{id} (idempotente). Legacy crear+reemplazar solo si el servidor no conoce el id (404).
      try{ await api.actualizarPago(selected.id, _patch, {operationId:opId}); dropPendingPago(); await remove('payments',selected.id); await put('payments',{id:selected.id,_localId:selected._localId||selected.id,studentId:String(sid),amount:data.monto,date:fechaISO,note:data.concepto,metodo:data.metodo}); setEdit(null); setSel(null); refresh(); return }
      catch(err){ console.warn('edit api fallo',err.message); const _net=String(err.message||'').includes('Failed to fetch')||esErrorDeRed(err);
        if(err&&err.status===404){ try{ await api.crearPago(_patch,{operationId:newOperationId()}); pushDeletedId('deleted-pagos',selected.id); dropPendingPago(); await remove('payments',selected.id); setEdit(null); setSel(null); refresh(); return }catch(e2){ console.warn('edit legacy fallo',e2.message) } }
        else if(_net){ if(!coalescePago(_patch,fechaISO)) queuePush('pago', {..._patch, _localId:_lid}, {fecha:fechaISO, operationId:opId}) } } }
    await remove('payments',selected.id); await put('payments',{id:selected.id,_localId:selected._localId||selected.id,studentId:String(sid),amount:data.monto,date:fechaISO,note:data.concepto,metodo:data.metodo})
    coalescePago({alumno_id:isUUID?String(sid):Number(sid), monto:data.monto, concepto:data.concepto, metodo:data.metodo}, fechaISO);
    setEdit(null); setSel(null); refresh()
  }
  return <section className="panel">
    <div className="page-head">
      <div><h2>Pagos</h2><p>Gestioná pagos y vencimientos · {payments.length} pagos registrados</p></div>
      <div className="page-actions">
        <button className="primary" onClick={onNew}>+ Registrar pago</button>
        {rol!=='Empleado'&&<><button className="ghost" onClick={handleEdit}>Editar</button><button className="ghost danger" onClick={handleDelete}>Eliminar</button></>}
      </div>
    </div>
    <div className="cards" style={{marginTop:14,gridTemplateColumns:rol==='Empleado'?'1fr 1fr':'repeat(3,1fr)'}}>
      {rol!=='Empleado'&&<div className="stat accent"><div className="stat-icon" aria-hidden="true">$</div><span>Ingresos</span><strong>{money(totalMes)}</strong></div>}
      <div className="stat green"><div className="stat-icon" aria-hidden="true">🧾</div><span>Pagos</span><strong>{payments.length}</strong></div>
      <div className="stat blue"><div className="stat-icon" aria-hidden="true">✓</div><span>Alumnos al día</span><strong>{stats.alumnosAlDia}</strong></div>
    </div>
    <div className="toolbar">
      <div className="search-wrap"><input className="field-search" aria-label="Buscar pago" placeholder="🔎 Buscar alumno por nombre, concepto o método..." value={q} onChange={e=>{setQ(e.target.value); setVisibles(PAGE_SIZE)}}/></div>
    </div>
    <div className="table" style={{marginTop:0,overflow:'hidden'}}>
      <div className="thead gestion"><span>ID</span><span>Fecha</span><span>Alumno</span><span>Concepto</span><span>Monto ($)</span><span>Medio de Pago</span></div>
      <div style={{maxHeight:420,overflow:'auto'}}>
        {filtrados.slice().reverse().slice(0,visibles).map(p=>{
          const s=students.find(x=>String(x.id)===String(p.studentId))
          const isSel=String(sel)===String(p.id)
          return <div key={p.id} onClick={()=>setSel(p.id)} className={isSel?'trow sel gestion':'trow gestion'} role="row" tabIndex={0} aria-selected={isSel} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();setSel(p.id)}}}>
            <span style={{fontFamily:'monospace'}} className="muted-text">{String(p.id).slice(0,6)}</span><span style={{fontSize:12}}>{toDisplay(p.date)}</span><span><b>{p.alumnoNombre||s?.name||'—'}</b></span><span>{p.note||'Cuota Mensual'}</span><span className="num" style={{fontWeight:700}}>{money(p.amount)}</span><span>{p.metodo||'Efectivo'}</span>
          </div>
        })}
        {!filtrados.length&&<Empty text={q?"Sin resultados para la búsqueda.":"No hay pagos. Registrá el primero."}/>}
        {visibles<filtrados.length&&<button className="ghost" style={{marginTop:10,width:'100%'}} onClick={()=>setVisibles(v=>v+PAGE_SIZE)}>Ver más ({filtrados.length-visibles} restantes)</button>}
        {selected&&<div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',padding:'10px 12px',fontSize:12,borderTop:'1px solid var(--card-border)',background:'var(--selected)'}}><b>{selAlumno?.name||selected.alumnoNombre||'—'}</b>{selEstado&&<span className={`badge ${selEstado.cls}`}>{selEstado.label}</span>}<span className="muted-text">Último pago: {selUltimo?`${toDisplay(selUltimo.date)} · ${money(selUltimo.amount)}`:'—'}{selVenc?` · Vence ${toDisplay(selVenc.toISOString().slice(0,10))}`:''}</span><button className="primary small" style={{marginLeft:'auto'}} onClick={onNew}>+ Registrar pago</button></div>}
      </div>
    </div>
    {edit&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setEdit(null)}}><div className="modal"><div className="modal-head"><h3>Editar Pago</h3><button onClick={()=>setEdit(null)} aria-label="Cerrar">×</button></div>
      <form onSubmit={saveEdit} onKeyDown={onEnterNext} className="form">
        <label>Alumno<select name="alumno" defaultValue={edit.studentId} required>{students.map(a=><option key={a.id} value={a.id}>{a.name} (ID: {String(a.id).slice(0,6)})</option>)}</select></label>
        <label>Monto ($)<input name="monto" type="number" step="0.01" defaultValue={edit.amount} required/></label>
        <label>Concepto<select name="concepto" defaultValue={edit.note||'Cuota Mensual'}><option>Cuota Mensual</option><option>Matricula</option><option>Pase Libre</option><option>Personalizado</option></select></label>
        <label>Medio de Pago<select name="metodo" defaultValue={edit.metodo||'Efectivo'}><option>Efectivo</option><option>Transferencia</option><option>Debito</option><option>Credito</option></select></label>
        <label>Fecha (DD/MM/AAAA)<input name="fecha" defaultValue={edit.date} placeholder="DD/MM/AAAA" required/></label>
        <button className="primary wide">Guardar cambios</button>
      </form>
    </div></div>}
  </section>
}
