import React from 'react'


export default function Modal({title,onClose,children}){return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="modal"><div className="modal-head"><h3>{title}</h3><button onClick={onClose}>×</button></div>{children}</div></div>}
