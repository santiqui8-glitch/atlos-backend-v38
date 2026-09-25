import React, { useEffect, useState } from 'react'
import { api, queuePush, esErrorDeRed, readTenantQueue, writeTenantQueue, sameQueueContext, newOperationId } from '../services/api'
import { tenantGetJSON, tenantSetJSON } from '../services/tenant'
import { list, put, remove } from '../services/db'

// BLOQUE 4F: guard de doble submit para guardar rutina.
let savingRutina=false;

export default function FormaEditor({student,mode,library=[],routines=[],onClose}){
  const [period,setPeriod]=useState(new Date().toLocaleDateString('es-AR',{month:'long', year:'numeric'}))
  const [s1,setS1]=useState([])
  const [s2,setS2]=useState([])
  const [s3,setS3]=useState([])
  const [s4,setS4]=useState([])
  const goal=(student?.enfoque||student?.goal||'hipertrofia').toLowerCase()
  const daysNum=Number(student?.days_per_week||student?.disponibilidad||3)||3
  const [lib,setLib]=useState(()=> library.length?library: tenantGetJSON('library',[]))
  const [qLib,setQLib]=useState('')
  const [openDrop,setOpenDrop]=useState(null)
  // V44-D-09: semana visible (tabs). Mismo estado s1-s4, solo presentación.
  const [semTab,setSemTab]=useState('1')
  useEffect(()=>{ if(!lib.length){ api.exercisesLibrary().then(d=>{ if(Array.isArray(d)&&d.length){ setLib(d); tenantSetJSON('library',d) } else { const demo=[{id:1,name:'Press banca',focus:'hipertrofia',muscle_group:'Pecho'},{id:2,name:'Sentadilla',focus:'fuerza',muscle_group:'Piernas'},{id:3,name:'Peso muerto',focus:'fuerza',muscle_group:'Espalda'},{id:4,name:'Dominadas',focus:'hipertrofia',muscle_group:'Espalda'},{id:5,name:'Press militar',focus:'fuerza',muscle_group:'Hombros'},{id:6,name:'Curl bíceps',focus:'hipertrofia',muscle_group:'Brazos'}]; setLib(demo); tenantSetJSON('library',demo) } }).catch(()=>{ const demo=[{id:1,name:'Press banca',focus:'hipertrofia',muscle_group:'Pecho'},{id:2,name:'Sentadilla',focus:'fuerza',muscle_group:'Piernas'},{id:3,name:'Peso muerto',focus:'fuerza',muscle_group:'Espalda'}]; if(!lib.length) setLib(demo) }) } },[])
  useEffect(()=>{
    const existing=routines.filter(r=>String(r.studentId||r.alumno_id)===String(student.id))
    if(existing.length){
      const byDay=new Map()
      for(const r of existing){
        const d=r.day||r.dia||'Día 1'
        if(!byDay.has(d)) byDay.set(d,[])
        byDay.get(d).push({name:r.exercise||r.ejercicio||r.nombre||'Ejercicio', detail: (r.series? r.series+' × ':'') + (r.reps||r.repeticiones||'10'), peso: r.peso||''})
      }
      const arr=[...byDay.entries()].map(([name,exs])=>({name, exercises:exs}))
      if(arr.length){
        const chunk=Math.ceil(arr.length/4)||1
        setS1(arr.slice(0,chunk)); setS2(arr.slice(chunk,chunk*2)); setS3(arr.slice(chunk*2,chunk*3)); setS4(arr.slice(chunk*3))
      }
    } else {
      api.routineLatest(student.id).then(r=>{ if(r && (r.routine_a||r.routine_b)){ try{ const a=JSON.parse(r.routine_a||'[]'); const b=JSON.parse(r.routine_b||'[]'); setS1(a.slice(0,Math.ceil(a.length/2))); setS2(b.slice(0,Math.ceil(b.length/2))); setS3(a.slice(Math.ceil(a.length/2))); setS4(b.slice(Math.ceil(b.length/2))); if(r.period) setPeriod(r.period)}catch{}} }).catch(()=>{})
    }
  },[student.id])
  const opts=lib.map(ex=>({id:String(ex.id||ex.name), label:(ex.name||ex.nombre)+( (ex.focus||ex.enfoque||'').toLowerCase()===goal?' · recomendado':''), name:ex.name||ex.nombre}))
  const filteredOpts=qLib? opts.filter(o=> o.name.toLowerCase().includes(qLib.toLowerCase()) || o.label.toLowerCase().includes(qLib.toLowerCase())) : opts
  const autoGen=()=>{
    const rec=lib.filter(ex=> (ex.focus||ex.enfoque||'').toLowerCase()===goal)
    const pool=rec.length?rec:lib
    const mk=(off)=>{
      const res=[]
      for(let i=0;i<daysNum;i++){
        const day={name:'Día '+(i+1), exercises:[]}
        for(let j=0;j<3;j++){ const ex=pool[(i*3+j+off)%pool.length]; if(ex) day.exercises.push({name:ex.name||ex.nombre, detail:'3 × 10', peso:''}) }
        res.push(day)
      }
      return res
    }
    setS1(mk(0)); setS2(mk(1)); setS3(mk(2)); setS4(mk(3))
  }
  const addDay=(k)=>{
    if(k==='1') setS1([...s1, {name:'Día '+(s1.length+1), exercises:[]}])
    else if(k==='2') setS2([...s2, {name:'Día '+(s2.length+1), exercises:[]}])
    else if(k==='3') setS3([...s3, {name:'Día '+(s3.length+1), exercises:[]}])
    else setS4([...s4, {name:'Día '+(s4.length+1), exercises:[]}])
  }
  const removeDay=(k, idx)=>{
    if(k==='1') setS1(s1.filter((_,i)=>i!==idx))
    else if(k==='2') setS2(s2.filter((_,i)=>i!==idx))
    else if(k==='3') setS3(s3.filter((_,i)=>i!==idx))
    else setS4(s4.filter((_,i)=>i!==idx))
  }
  const addEx=(k, dayIdx, name)=>{
    if(!name) return
    const upd=(arr,setter)=>{ const copy=[...arr]; copy[dayIdx]={...copy[dayIdx], exercises:[...copy[dayIdx].exercises, {name, detail:'3 × 10', peso:''}]}; setter(copy) }
    if(k==='1') upd(s1,setS1); else if(k==='2') upd(s2,setS2); else if(k==='3') upd(s3,setS3); else upd(s4,setS4)
  }
  const removeEx=(k, dayIdx, exIdx)=>{
    const upd=(arr,setter)=>{ const copy=[...arr]; copy[dayIdx]={...copy[dayIdx], exercises: copy[dayIdx].exercises.filter((_,i)=>i!==exIdx)}; setter(copy) }
    if(k==='1') upd(s1,setS1); else if(k==='2') upd(s2,setS2); else if(k==='3') upd(s3,setS3); else upd(s4,setS4)
  }
  // V44-D-09: operaciones locales de presentación (no cambian persistencia).
  const dupEx=(k, dayIdx, exIdx)=>{
    const upd=(arr,setter)=>{ const copy=[...arr]; const exs=[...copy[dayIdx].exercises]; exs.splice(exIdx+1,0,{...exs[exIdx]}); copy[dayIdx]={...copy[dayIdx], exercises:exs}; setter(copy) }
    if(k==='1') upd(s1,setS1); else if(k==='2') upd(s2,setS2); else if(k==='3') upd(s3,setS3); else upd(s4,setS4)
  }
  const moveEx=(k, dayIdx, exIdx, dir)=>{
    const upd=(arr,setter)=>{ const copy=[...arr]; const exs=[...copy[dayIdx].exercises]; const j=exIdx+dir; if(j<0||j>=exs.length) return; const t=exs[exIdx]; exs[exIdx]=exs[j]; exs[j]=t; copy[dayIdx]={...copy[dayIdx], exercises:exs}; setter(copy) }
    if(k==='1') upd(s1,setS1); else if(k==='2') upd(s2,setS2); else if(k==='3') upd(s3,setS3); else upd(s4,setS4)
  }
  const dupDay=(k, idx)=>{
    const get=()=> k==='1'?s1:k==='2'?s2:k==='3'?s3:s4;
    const set=v=>{ if(k==='1') setS1(v); else if(k==='2') setS2(v); else if(k==='3') setS3(v); else setS4(v) };
    const arr=get(); const d=arr[idx]; if(!d) return;
    set([...arr.slice(0,idx+1), {...d, name:d.name+' (copia)', exercises:d.exercises.map(e=>({...e}))}, ...arr.slice(idx+1)])
  }
  // V44-D-09: series/reps se editan separados pero persisten en `detail` ("S × R").
  const splitDetail=(detail)=>{ const p=String(detail||'').split('×'); return [(p[0]||'').trim(), (p[1]||'').trim()] }
  const setDetail=(k, plan, dayIdx, exIdx, sv, rv)=>{
    const upd=(arr,setter)=>{ const copy=[...arr]; copy[dayIdx]={...copy[dayIdx], exercises: copy[dayIdx].exercises.map((ee,i)=> i===exIdx? {...ee, detail:`${sv} × ${rv}`}: ee)}; setter(copy) }
    if(k==='1') upd(s1,setS1); else if(k==='2') upd(s2,setS2); else if(k==='3') upd(s3,setS3); else upd(s4,setS4)
  }
  const guardar=async()=>{
    if(!period.trim()) return alert('Ingresá un período')
    if(!s1.length && !s2.length && !s3.length && !s4.length) return alert('Generá o armá al menos una rutina')
    for(const pl of [s1,s2,s3,s4]) for(const d of pl) if(!d.exercises.length) return alert('El '+d.name+' está vacío')
    if(savingRutina) return; savingRutina=true; try{
    const _sId=String(student?.id??'').trim(); const _studentRef=_sId&&/^\d+$/.test(_sId)?Number(_sId):_sId||student?.id
    const payload={student_id:_studentRef, period, routine_a:[...s1,...s3], routine_b:[...s2,...s4]}
    // BLOQUE 4F: coalescing — reemplazar routine pendiente del mismo alumno+período (como clases).
    try{
      const _cs=String(payload.student_id??''); const _cp=String(payload.period??'');
      const _q=readTenantQueue();
      if(_q){
        const _f=_q.filter(it=>!(it.type==='routine' && String(it.payload?.student_id??'')===_cs && String(it.payload?.period??'')===_cp && sameQueueContext(it)));
        if(_f.length!==_q.length) writeTenantQueue(_f);
      }
    }catch{}
    // Diseño unificado: una sola fuente por rutina.
    //  - Con red  -> se guarda por API y se refleja el UUID/id de respuesta en el caché local.
    //  - Sin red  -> se encola el alta (apuntando al mismo id local) y la copia local queda "pending"
    //                hasta que flushQueue la confirme y reconcilie el id con el del servidor.
    const localRoutineId=crypto.randomUUID()
    let serverId=null
    let pendiente=!navigator.onLine
    // V44-B: una sola operationId para el intento online y el fallback encolado.
    const opId=newOperationId();
    if(navigator.onLine){
      try{ const r=await api.crearRoutine(payload,{operationId:opId}); serverId=(r&&(r.id??r._id??r.routine_id))||null }
      catch(e){ console.warn('crearRoutine api fallo', e.message); pendiente=true; if(esErrorDeRed(e)){ queuePush('routine',{...payload,_localId:localRoutineId},{operationId:opId}) } }
    } else {
      queuePush('routine',{...payload,_localId:localRoutineId},{operationId:opId})
    }
    // Limpiar representaciones locales anteriores de este alumno (filas UUID del editor viejo
    // o filas ya encoladas) para no acumular duplicados de la misma rutina.
    const old=await list('routines')
    for(const r of old){ if(String(r.studentId)===String(student.id) && String(r.period??'')===String(period) && (r.via==='atlos-editor' || String(r.id).includes('-'))) await remove('routines', r.id) }
    const baseId=serverId||localRoutineId
    let i=0
    for(const d of [...s1,...s2,...s3,...s4]) for(const ex of d.exercises){
      await put('routines',{id:`${baseId}#${++i}`, studentId:student.id, day:d.name, exercise:ex.name, series: ex.detail.split('×')[0]?.trim()||'3', reps: ex.detail.split('×')[1]?.trim()||'10', peso: ex.peso||'', period, routineId:baseId, serverId:serverId||null, via:'atlos-editor', pending:pendiente})
    }
    try{ const { generarPDFRutina } = await import('../utils/pdf.js'); const doc=generarPDFRutina(student, period, s1,s2,s3,s4); doc.save(`Rutina-${student.name.replace(/\s+/g,'_')}-${period.replace(/\s+/g,'_')}.pdf`) }catch(e){ console.warn('pdf',e.message) }
    onClose(); setTimeout(()=>location.reload(), 400)
  }finally{ savingRutina=false }
  }
  const sems=[['1',s1,'Semana 1'],['2',s2,'Semana 2'],['3',s3,'Semana 3'],['4',s4,'Semana 4']]
  return <div className='overlay' onMouseDown={e=>{if(e.target===e.currentTarget) onClose()}}><div className='modal' style={{width:'min(1440px,98vw)',maxHeight:'95vh',overflow:'auto',padding:0}}>
    <div style={{background:'var(--card)',padding:'16px 20px',borderBottom:'1px solid var(--card-border)',textAlign:'center'}}>
      <div style={{fontFamily:'monospace',fontSize:11,letterSpacing:'.14em',color:'var(--muted)',fontWeight:700}}>PLAN MENSUAL</div>
      <div style={{fontSize:16,fontWeight:900,marginTop:4}}>{student.name} · {daysNum} días por semana</div>
      <div style={{fontSize:11,color:'var(--muted)',marginTop:4}}>La página muestra todos los ejercicios. Los primeros son recomendaciones según el perfil, pero podés elegir cualquiera.</div>
    </div>
    <div style={{display:'flex',gap:10,padding:'12px 16px',alignItems:'center',flexWrap:'wrap',borderBottom:'1px solid var(--card-border)'}}>
      <span style={{fontFamily:'monospace',fontSize:11,fontWeight:700,color:'var(--muted)'}}>Período</span>
      <input value={period} onChange={e=>setPeriod(e.target.value)} style={{border:'1px solid var(--card-border)',background:'var(--input)',color:'var(--text)',borderRadius:8,padding:'8px 10px',minWidth:160}} />
      <button className='ghost' onClick={autoGen} style={{marginLeft:8}}>Auto-generar</button>
      <button className='primary' onClick={guardar} style={{marginLeft:'auto'}}>GUARDAR Y DESCARGAR</button>
      <button className='ghost' onClick={onClose}>Cerrar</button>
    </div>
    <div style={{display:'flex',gap:8,padding:'12px 16px 0',alignItems:'center',flexWrap:'wrap',background:'var(--bg)'}}>
      <div className="rx-weekbar" role="tablist" aria-label="Semanas">
        {sems.map(([key,plan,title])=>{ const n=plan.reduce((a,d)=>a+(d.exercises?.length||0),0); return <button key={key} role="tab" aria-selected={semTab===key} className={semTab===key?'rx-weektab active':'rx-weektab'} onClick={()=>setSemTab(key)}>{title} · {n} ej.</button> })}
      </div>
    </div>
    <div style={{display:'grid',gap:16,padding:16, background:'var(--bg)'}}>
      {sems.filter(([key])=>key===semTab).map(([key,plan,title])=>(
        <div key={key} style={{background:'var(--card)',border:'1px solid var(--card-border)',borderRadius:10,overflow:'hidden',display:'flex',flexDirection:'column'}}>
          <div style={{background:'var(--accent)',color:'#fff',textAlign:'center',padding:'8px',fontFamily:'monospace',fontSize:11,fontWeight:800}}>{title} · {plan.reduce((a,d)=>a+(d.exercises?.length||0),0)} ejercicios</div>
          <div style={{flex:1,overflow:'auto',padding:8,display:'grid',gap:8,alignContent:'start'}}>
            {!plan.length&&<div style={{textAlign:'center',padding:20,color:'var(--muted)',fontSize:12}}>Vacía — usa Auto-generar o agrega días</div>}
            {plan.map((day, dIdx)=>(
              <div key={dIdx} style={{background:'var(--bg)',border:'1px solid var(--card-border)',borderRadius:10,padding:8}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
                  <input value={day.name} aria-label="Nombre del día" onChange={e=>{ const copy=[...plan]; copy[dIdx]={...copy[dIdx], name:e.target.value}; if(key==='1') setS1(copy); else if(key==='2') setS2(copy); else if(key==='3') setS3(copy); else setS4(copy)}} style={{flex:1,border:'1px solid var(--card-border)',background:'var(--input)',color:'var(--text)',borderRadius:6,padding:'6px 8px',fontWeight:700}} />
                  <span className="rx-dayname">{day.exercises.length} ej.</span>
                  <button className='rx-iconbtn' onClick={()=>dupDay(key,dIdx)} title="Duplicar día" aria-label="Duplicar día">⧉</button>
                  <button className='ghost sm danger' onClick={()=>removeDay(key,dIdx)} aria-label="Quitar día">×</button>
                </div>
                {day.exercises.map((ex, eIdx)=>{ const [sv,rv]=splitDetail(ex.detail); return (
                  <div key={eIdx} style={{padding:'8px 6px',borderBottom:'1px solid var(--card-border)',display:'flex',gap:8,alignItems:'flex-start'}}>
                    <span className="rx-num" aria-hidden="true">{String(eIdx+1).padStart(2,'0')}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:700}}>{ex.name}</div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,marginTop:6}}>
                        <div><span className="rx-minilabel">Series</span><input className="rx-mini" value={sv} inputMode="numeric" aria-label={`Series de ${ex.name}`} onChange={e=>setDetail(key,plan,dIdx,eIdx,e.target.value,rv)} /></div>
                        <div><span className="rx-minilabel">Reps</span><input className="rx-mini" value={rv} aria-label={`Repeticiones de ${ex.name}`} onChange={e=>setDetail(key,plan,dIdx,eIdx,sv,e.target.value)} /></div>
                        <div><span className="rx-minilabel">Peso kg</span><input className="rx-mini" value={ex.peso||''} placeholder="0" inputMode="decimal" aria-label={`Peso de ${ex.name}`} onChange={e=>{ const copy=[...plan]; copy[dIdx]={...copy[dIdx], exercises: copy[dIdx].exercises.map((ee,i)=> i===eIdx? {...ee, peso:e.target.value}: ee)}; if(key==='1') setS1(copy); else if(key==='2') setS2(copy); else if(key==='3') setS3(copy); else setS4(copy)}} /></div>
                      </div>
                    </div>
                    <div style={{display:'grid',gap:4}}>
                      <button className='rx-iconbtn' onClick={()=>moveEx(key,dIdx,eIdx,-1)} disabled={eIdx===0} title="Subir" aria-label={`Subir ${ex.name}`}>↑</button>
                      <button className='rx-iconbtn' onClick={()=>moveEx(key,dIdx,eIdx,1)} disabled={eIdx===day.exercises.length-1} title="Bajar" aria-label={`Bajar ${ex.name}`}>↓</button>
                      <button className='rx-iconbtn' onClick={()=>dupEx(key,dIdx,eIdx)} title="Duplicar ejercicio" aria-label={`Duplicar ${ex.name}`}>⧉</button>
                      <button className='rx-iconbtn danger' onClick={()=>removeEx(key,dIdx,eIdx)} title="Quitar ejercicio" aria-label={`Quitar ${ex.name}`}>×</button>
                    </div>
                  </div>
                )})}
                <div style={{display:'flex',gap:6,marginTop:6}}>
                  <div style={{flex:1,position:'relative'}}>
                    <span style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',color:'var(--muted)',fontSize:12,pointerEvents:'none'}}>🔍</span>
                    <input placeholder="Elegir de la biblioteca... (Enter agrega el primero)" value={openDrop===key+'-'+dIdx? qLib: ''} onFocus={()=>setOpenDrop(key+'-'+dIdx)} onBlur={()=>setTimeout(()=>setOpenDrop(null),180)} onChange={e=>{ setQLib(e.target.value); setOpenDrop(key+'-'+dIdx) }} onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); const first=(qLib?filteredOpts:opts)[0]; if(first){ addEx(key,dIdx,first.name); setQLib(''); setOpenDrop(null) } } }} style={{width:'100%',padding:'6px 8px 6px 28px',border:'1px solid var(--card-border)',background:'var(--input)',color:'var(--text)',borderRadius:6,outline:'none',fontSize:12}} />
                    {openDrop===key+'-'+dIdx && (
                      <div style={{position:'absolute',top:'100%',left:0,right:0,marginTop:4,maxHeight:180,overflow:'auto',background:'var(--card)',border:'1px solid var(--card-border)',borderRadius:8,boxShadow:'0 10px 24px rgba(0,0,0,.35)',zIndex:20}}>
                        {(qLib? filteredOpts : opts).slice(0,30).map(o=>(
                          <div key={o.id} onMouseDown={e=>{ e.preventDefault(); addEx(key,dIdx,o.name); setQLib(''); setOpenDrop(null) }} style={{padding:'8px 10px',cursor:'pointer',fontSize:12,borderBottom:'1px solid var(--card-border)'}} onMouseEnter={e=>e.currentTarget.style.background='var(--selected)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>{o.label}</div>
                        ))}
                        {!(qLib? filteredOpts : opts).length && <div style={{padding:'10px',color:'var(--muted)',fontSize:11}}>Sin resultados</div>}
                      </div>
                    )}
                  </div>
                  <button className='ghost' onClick={e=>{ if(qLib.trim()){ addEx(key,dIdx,qLib.trim()); setQLib(''); setOpenDrop(null) } }} style={{whiteSpace:'nowrap'}}>+ ejercicio</button>
                </div>

              </div>
            ))}
            <button className='ghost' onClick={()=>addDay(key)} style={{marginTop:4}}>+ Agregar día</button>
            <div style={{display:'flex',gap:6,marginTop:8,alignItems:'center',borderTop:'1px solid var(--card-border)',paddingTop:8}}>
              <span style={{fontSize:11,color:'var(--muted)',whiteSpace:'nowrap'}}>Duplicar en...</span>
              <select id={'dup-week-'+key} defaultValue='' className="field" style={{flex:1}}>
                <option value=''>Semana...</option>
                <option value='1'>Semana 1</option>
                <option value='2'>Semana 2</option>
                <option value='3'>Semana 3</option>
                <option value='4'>Semana 4</option>
              </select>
              <button className='ghost' onClick={()=>{ const sel=document.getElementById('dup-week-'+key); const t=sel.value; if(!t||t===key){ alert('Elegí una semana destino distinta'); return } const src=plan; if(!src.length){ alert('Esta semana está vacía, nada para duplicar'); return } const copy=src.map(d=>({name:d.name, exercises:d.exercises.map(e=>({...e}))})); if(t==='1') setS1([...copy]); else if(t==='2') setS2([...copy]); else if(t==='3') setS3([...copy]); else setS4([...copy]); sel.value=''; setTimeout(()=>alert('Reemplazado Semana '+t+' con '+copy.length+' día(s) de Semana '+key),100) }} style={{fontSize:11,padding:'4px 8px',whiteSpace:'nowrap'}}>Duplicar</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div></div>
}
