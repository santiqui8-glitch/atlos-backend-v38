import React from 'react'


export function PanelTitle({title,action}){return <div className="panel-title"><h3>{title}</h3>{action}</div>}

export function Badge({status}){return <span className={`badge ${status}`}>{status==='activo'?'Activo':'Vencido'}</span>}

export function Empty({text}){return <div className="empty">{text}</div>}
