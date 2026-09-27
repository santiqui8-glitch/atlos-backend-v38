// V44-I: portal del alumno (rol Alumno). Solo lectura propia + cambio de
// clave. Todos los endpoints son own-only por JWT (backend autoridad); el
// frontend JAMAS pide datos ajenos. Reutiliza estadoMembresia() y clases CSS.
import { useState, useEffect } from 'react'
import { api, getUserId } from '../services/api'
import { list } from '../services/db'
import { estadoMembresia } from '../utils/membresia.js'
import { money, toDisplay, onEnterNext } from '../utils/helpers.js'
import { Empty, PanelTitle } from '../components/ui.jsx'

const TABS = [
  ['inicio', '🏠', 'Inicio'],
  ['membresia', '🎫', 'Membresía'],
  ['rutina', '🏋', 'Rutina'],
  ['pagos', '💳', 'Pagos'],
  ['asistencia', '✓', 'Asistencia'],
  ['clases', '🗓', 'Clases'],
  ['perfil', '👤', 'Perfil'],
];

export function alumnoPropio(students, userId) {
  return (students || []).find((s) => String(s.id) === String(userId)) || null;
}

export default function VistaPortal({ usuario, students = [], payments = [], membresias = [], planes = [], attendance = [], clases = [], routines = [], online, onLogout }) {
  const [tab, setTab] = useState('inicio');
  const uid = getUserId();
  const yo = alumnoPropio(students, uid);
  const em = yo ? estadoMembresia(yo, { pagos: payments, membresias, planes }) : null;
  const [rutina, setRutina] = useState(null);
  const [insc, setInsc] = useState({});
  const [claveMsg, setClaveMsg] = useState('');

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (tab === 'rutina' && uid) {
        try {
          const r = await api.routineLatest(uid);
          if (vivo && r) { setRutina(r); return }
        } catch {}
        try {
          const rows = (await list('routines')).filter((x) => String(x.studentId || x.alumno_id) === String(uid));
          if (vivo && rows.length) setRutina({ routine_a: [], routine_b: [], _local: rows });
        } catch {}
      }
      if (tab === 'clases') {
        try {
          const pares = await Promise.all(clases.slice(0, 30).map(async (c) => {
            try {
              const rows = await api.claseAlumnos(c.id);
              return [String(c.id), Array.isArray(rows) && rows.some((a) => String(a.id) === String(uid))];
            } catch { return [String(c.id), null] }
          }));
          if (vivo) setInsc(Object.fromEntries(pares));
        } catch {}
      }
    })();
    return () => { vivo = false };
  }, [tab]);

  const misPagos = payments.filter((p) => String(p.studentId) === String(uid));
  const misAsist = attendance.filter((a) => String(a.studentId) === String(uid)).slice().reverse();
  const cambiarClave = async (e) => {
    e.preventDefault(); setClaveMsg('');
    const f = new FormData(e.currentTarget);
    try {
      await api.cambiarClave(f.get('actual') || '', f.get('nueva') || '');
      setClaveMsg('Clave actualizada.');
      e.currentTarget.reset();
    } catch (err) { setClaveMsg('Error: ' + (err.message || err)) }
  };

  return <div className="portal-wrap">
    <section className="portal-hero">
      <img src="/logo.png" alt="ATLOS" className="portal-logo" onError={e => e.currentTarget.style.display = 'none'} />
      <div><div className="muted-text">Hola,</div><h2>{yo?.name || usuario}</h2>
        {em && <span className={em.estado === 'vigente' ? 'badge' : em.estado === 'por_vencer' ? 'badge warn' : 'badge vencido'}>
          {em.estado === 'vigente' ? `Al día${em.dias != null ? ` (${em.dias}d)` : ''}` : em.estado === 'por_vencer' ? `Por vencer (${em.dias}d)` : em.estado === 'cancelada' ? 'Cancelada' : em.estado === 'sin_pagos' ? 'Sin pagos' : 'Vencida'}
        </span>}</div>
      <button className="ghost sm" onClick={onLogout} aria-label="Cerrar sesión">Salir</button>
    </section>
    {em && (em.estado === 'por_vencer' || em.estado === 'vencida') && <div className="portal-aviso" role="alert">{em.estado === 'vencida' ? '🔴 Tu cuota está vencida. Acercate a recepción para renovar.' : `🟡 Tu cuota vence en ${em.dias} día(s).`}</div>}
    <div className="tabs" role="tablist" aria-label="Portal del alumno">
      {TABS.map(([id, ic, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'tab active' : 'tab'} onClick={() => setTab(id)}>{ic} {label}</button>)}
    </div>

    {tab === 'inicio' && <div style={{ display: 'grid', gap: 12 }}>
      <section className="panel"><PanelTitle title="Accesos rápidos" />
        <div className="quick-grid" style={{ marginTop: 0 }}>
          <div className="quick-card" role="button" tabIndex={0} onClick={() => setTab('rutina')} onKeyDown={e => { if (e.key === 'Enter') setTab('rutina') }}><i>🏋</i><b>Mi rutina</b></div>
          <div className="quick-card" role="button" tabIndex={0} onClick={() => setTab('pagos')} onKeyDown={e => { if (e.key === 'Enter') setTab('pagos') }}><i>💳</i><b>Mis pagos</b></div>
          <div className="quick-card" role="button" tabIndex={0} onClick={() => setTab('asistencia')} onKeyDown={e => { if (e.key === 'Enter') setTab('asistencia') }}><i>✓</i><b>Mi asistencia</b></div>
          <div className="quick-card" role="button" tabIndex={0} onClick={() => setTab('clases')} onKeyDown={e => { if (e.key === 'Enter') setTab('clases') }}><i>🗓</i><b>Mis clases</b></div>
        </div></section>
      <section className="panel"><PanelTitle title="Mi membresía" />
        {em && em.fuente === 'membresia'
          ? <div className="rows"><div className="row"><div className="grow"><b>{em.planNombre || 'Plan'}</b><span>Vence {em.vencimiento ? toDisplay(em.vencimiento) : '—'}</span></div><strong>{em.precio != null ? money(em.precio) : ''}</strong></div></div>
          : <Empty text="Sin membresía registrada. Consultá en recepción." />}</section>
    </div>}

    {tab === 'membresia' && <section className="panel"><PanelTitle title="Mi membresía" />
      {em ? <div className="rows">
        <div className="row"><div className="grow"><b>Plan</b></div><strong>{em.planNombre || '—'}</strong></div>
        <div className="row"><div className="grow"><b>Precio aplicado</b></div><strong>{em.precio != null ? money(em.precio) : '—'}</strong></div>
        <div className="row"><div className="grow"><b>Inicio</b></div><strong>{em.inicio ? toDisplay(em.inicio) : '—'}</strong></div>
        <div className="row"><div className="grow"><b>Vencimiento</b></div><strong>{em.vencimiento ? toDisplay(em.vencimiento) : '—'}</strong></div>
        <div className="row"><div className="grow"><b>Estado</b></div><strong>{em.estado}</strong></div>
      </div> : <Empty text="Sin datos de membresía." />}
      {(() => { const hist = membresias.filter((m) => String(m.alumno_id) === String(uid)).slice().sort((a, b) => String(b.fecha_vencimiento || '') > String(a.fecha_vencimiento || '') ? 1 : -1); return hist.length ? <div style={{ marginTop: 12 }}><PanelTitle title="Historial" /><div className="rows">{hist.map((m) => { const pl = planes.find((p) => String(p.id) === String(m.plan_id)); return <div className="row" key={m.id}><div className="grow"><b>{pl?.nombre || 'Plan'}</b><span>{m.fecha_inicio ? toDisplay(m.fecha_inicio) : ''} → {m.fecha_vencimiento ? toDisplay(m.fecha_vencimiento) : ''}</span></div><span className={m.estado === 'vigente' ? 'badge' : 'badge neutral'}>{m.estado}</span></div> })}</div></div> : null })()}
    </section>}

    {tab === 'rutina' && <section className="panel"><PanelTitle title="Mi rutina" />
      {!rutina ? <Empty text="Todavía no tenés rutina asignada." /> : rutina._local
        ? <div className="rows">{rutina._local.map((r) => <div className="row" key={r.id}><div className="grow"><b>{r.exercise || r.ejercicio}</b><span>{r.day || ''}</span></div></div>)}</div>
        : <div style={{ display: 'grid', gap: 12 }}>
          {(rutina.routine_a || []).length > 0 && <div><b>Rutina A</b><div className="rows">{(rutina.routine_a || []).map((e, i) => <div className="row" key={'a' + i}><div className="grow"><b>{e.name || e.ejercicio}</b><span>{[e.series && `${e.series} series`, e.reps && `${e.reps} reps`, e.peso && `${e.peso} kg`, e.descanso && `descanso ${e.descanso}`].filter(Boolean).join(' · ')}</span></div></div>)}</div></div>}
          {(rutina.routine_b || []).length > 0 && <div><b>Rutina B</b><div className="rows">{(rutina.routine_b || []).map((e, i) => <div className="row" key={'b' + i}><div className="grow"><b>{e.name || e.ejercicio}</b><span>{[e.series && `${e.series} series`, e.reps && `${e.reps} reps`, e.peso && `${e.peso} kg`, e.descanso && `descanso ${e.descanso}`].filter(Boolean).join(' · ')}</span></div></div>)}</div></div>}
        </div>}
    </section>}

    {tab === 'pagos' && <section className="panel"><PanelTitle title="Mis pagos" />
      {!misPagos.length ? <Empty text="Todavía no tenés pagos registrados." /> :
        <div className="rows">{misPagos.slice().reverse().map((p) => <div className="row" key={p.id}><div className="grow"><b>{money(p.amount)}</b><span>{p.date ? toDisplay(p.date) : ''} · {p.note || 'Cuota'} · {p.metodo || 'Efectivo'}</span></div></div>)}</div>}
    </section>}

    {tab === 'asistencia' && <section className="panel"><PanelTitle title="Mi asistencia" />
      {!misAsist.length ? <Empty text="Todavía no registraste asistencias." /> :
        <><div className="rows">{misAsist.slice(0, 10).map((a) => <div className="row" key={a.id}><div className="grow"><b>{a.date ? toDisplay(a.date) : ''}</b><span>Entrada {a.time || '—'}{a.hora_salida ? ` · Salida ${a.hora_salida}` : ''}</span></div></div>)}</div>
        <p className="copy" style={{ marginTop: 8 }}>Total: {misAsist.length} asistencia(s). Última: {misAsist[0]?.date ? toDisplay(misAsist[0].date) : '—'}</p></>}
    </section>}

    {tab === 'clases' && <section className="panel"><PanelTitle title="Mis clases" />
      {!clases.length ? <Empty text="No hay clases publicadas." /> :
        <div className="rows">{clases.map((c) => <div className="row" key={c.id}><div className="miniavatar">🗓</div><div className="grow"><b>{c.nombre || c.name}</b><span>{c.dia_mes || c.dia || ''} · {c.hora_inicio || c.inicio || ''}{c.profesor ? ` · ${c.profesor}` : ''}</span></div>{insc[String(c.id)] === true ? <span className="badge">Inscripto</span> : null}</div>)}</div>}
    </section>}

    {tab === 'perfil' && <div style={{ display: 'grid', gap: 12 }}>
      <section className="panel"><PanelTitle title="Mi perfil" />
        {!yo ? <Empty text="No se encontró tu ficha. Avisá en recepción." /> :
          <div className="rows">
            <div className="row"><div className="grow"><b>Nombre</b></div><strong>{yo.name}</strong></div>
            <div className="row"><div className="grow"><b>DNI</b></div><strong>{yo.dni || '—'}</strong></div>
            <div className="row"><div className="grow"><b>Teléfono</b></div><strong>{yo.phone || '—'}</strong></div>
            <div className="row"><div className="grow"><b>Email</b></div><strong>{yo.mail || yo.email || '—'}</strong></div>
          </div>}
      </section>
      <section className="panel"><PanelTitle title="Cambiar clave" />
        <form onSubmit={cambiarClave} onKeyDown={onEnterNext} className="form" style={{ maxWidth: 360 }}>
          <label>Clave actual<input name="actual" type="password" required autoComplete="current-password" /></label>
          <label>Clave nueva (mín. 4)<input name="nueva" type="password" required minLength={4} autoComplete="new-password" /></label>
          <button className="primary">Actualizar clave</button>
          {claveMsg && <p className="copy">{claveMsg}</p>}
        </form>
      </section>
    </div>}
  </div>
}
