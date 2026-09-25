import React, { useState } from 'react'
import { api, newOperationId } from '../services/api'
import { Empty } from '../components/ui.jsx'


export default function VistaPersonal({usuarios,onNew,refresh}){
  const [q,setQ]=useState('') // V44-D-18: filtro local (no toca datos ni API)
  const qn=q.trim().toLowerCase();
  const filtrados=!qn?usuarios:usuarios.filter(u=>`${u.usuario||u.user||''} ${u.rol||u.role||''}`.toLowerCase().includes(qn));
  return <section className="panel">
    <div className="page-head"><div><h2>Personal</h2><p>Usuarios del gimnasio · {usuarios.length} registrados</p></div><div className="page-actions"><button className="primary" onClick={onNew}>+ Nuevo usuario</button><button className="ghost danger-soft" onClick={async()=>{const sel=prompt('ID a eliminar'); if(sel) {await api.eliminarUsuario(sel,{operationId:newOperationId()}); refresh()}}}>Eliminar</button></div></div>
    <div className="toolbar">
      <div className="search-wrap"><input className="field-search" aria-label="Buscar usuario" placeholder="🔎 Buscar por usuario o rol..." value={q} onChange={e=>setQ(e.target.value)}/></div>
    </div>
    <div className="table" style={{marginTop:0}}><div className="thead personal"><span>ID</span><span>Usuario</span><span>Rol</span></div>{filtrados.map(u=><div className="trow personal" key={u.id}><span>{u.id}</span><span><b>{u.usuario||u.user}</b></span><span><span className="badge">{u.rol||u.role||'Empleado'}</span></span></div>)}{!filtrados.length&&<Empty text={q?"Sin resultados para la búsqueda.":"No hay usuarios registrados."}/>}</div>
    <p className="copy" style={{marginTop:12}}>Solo <b>Dueño</b> ve este panel (igual que desktop `rol==Empleado` oculta `personal`).</p>
  </section>
}
