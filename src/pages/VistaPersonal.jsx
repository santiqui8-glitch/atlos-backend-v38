import React from 'react'
import { api } from '../services/api'
import { PanelTitle, Empty } from '../components/ui.jsx'


export default function VistaPersonal({usuarios,onNew,refresh}){
  return <section className="panel"><PanelTitle title={`Personal (${usuarios.length})`} action={<><button className="primary" onClick={onNew}>+ NUEVO USUARIO</button><button className="ghost danger-soft" onClick={async()=>{const sel=prompt('ID a eliminar'); if(sel) {await api.eliminarUsuario(sel); refresh()}}}>ELIMINAR</button></>}/>
    <div className="table" style={{marginTop:14}}><div className="thead personal"><span>ID</span><span>Usuario</span><span>Rol</span></div>{usuarios.map(u=><div className="trow personal" key={u.id}><span>{u.id}</span><span><b>{u.usuario||u.user}</b></span><span><span className="badge">{u.rol||u.role||'Empleado'}</span></span></div>)}{!usuarios.length&&<Empty text="Solo admin ve Personal."/>}</div>
    <p className="copy" style={{marginTop:12}}>Solo <b>Dueño</b> ve este panel (igual que desktop `rol==Empleado` oculta `personal`).</p>
  </section>
}
