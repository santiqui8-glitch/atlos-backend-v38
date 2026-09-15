// ATLOS refactor: split main.jsx into App/pages/components/hooks/utils/services
// Uses tokenizer + brace matching; extracts EXACT source slices (no manual offsets).
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const MAIN = path.join(ROOT, 'src', 'main.jsx');
const src = fs.readFileSync(MAIN, 'utf8');
const n = src.length;

function lineOf(idx) {
  let ln = 1;
  for (let k = 0; k < idx; k++) if (src[k] === '\n') ln++;
  return ln;
}

// ---- pass 1: brace depth per char, ignoring strings/comments/templates ----
const depth = new Int32Array(n + 1);
let d = 0;
let i = 0;
while (i < n) {
  const c = src[i];
  const c1 = src[i + 1];
  if (c === '/' && c1 === '/') { while (i < n && src[i] !== '\n') i++; continue; }
  if (c === '/' && c1 === '*') { i += 2; while (i + 1 < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
  if (c === '"' || c === "'") { const q = c; i++; while (i < n) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === q) { i++; break; } i++; } continue; }
  if (c === '`') { i++; while (i < n) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === '`') { i++; break; } i++; } continue; }
  depth[i] = d;
  if (c === '{') d++;
  else if (c === '}') d = Math.max(0, d - 1);
  i++;
}

// ---- helpers around raw source ----
function skipStr(p) {
  const c = src[p];
  if (c === '"' || c === "'") { const q = c; p++; while (p < n) { if (src[p] === '\\') p += 2; else if (src[p] === q) { p++; break; } else p++; } return p; }
  if (c === '`') { p++; while (p < n) { if (src[p] === '\\') p += 2; else if (src[p] === '`') { p++; break; } else p++; } return p; }
  return p;
}

function findBodyOpen(start) {
  let p = start + 8; // after "function"
  while (p < n && /\s/.test(src[p])) p++;
  while (p < n && /[A-Za-z0-9_$]/.test(src[p])) p++; // name
  while (p < n && /\s/.test(src[p])) p++;
  if (src[p] !== '(') throw new Error('expected ( at index ' + p);
  let pd = 0;
  while (p < n) {
    const c = src[p];
    if (c === '"' || c === "'" || c === '`') { p = skipStr(p); continue; }
    if (c === '(') pd++;
    else if (c === ')') { pd--; if (pd === 0) { p++; break; } }
    p++;
  }
  while (p < n && /\s/.test(src[p])) p++;
  if (src[p] !== '{') throw new Error('expected { at index ' + p);
  return p;
}

function findClosingBrace(openIdx) {
  let p = openIdx + 1; // findBodyOpen returns the index OF the opening brace; skip it (already counted as stack=1)
  let stack = 1;
  let lastLine = 0;
  while (p < n && stack > 0) {
    const c = src[p];
    if (c === '\n') lastLine++;
    if (c === '/' && src[p + 1] === '/') { while (p < n && src[p] !== '\n') p++; continue; }
    if (c === '/' && src[p + 1] === '*') { p += 2; while (p + 1 < n && !(src[p] === '*' && src[p + 1] === '/')) p++; p += 2; continue; }
    if (c === '"' || c === "'" || c === '`') { p = skipStr(p); continue; }
    if (c === '{') stack++;
    else if (c === '}') { stack--; if (stack === 0) return p; }
    p++;
  }
  throw new Error('unbalanced from index ' + openIdx + ' endedAtLine=' + (lineOf(p) - 1) + ' stack=' + stack + ' sample=' + JSON.stringify(src.slice(Math.max(openIdx, p - 200), Math.min(n, p + 40))));
}

// ---- find top-level function declarations ----
const items = [];
const re = /^function\s+([A-Za-z_$][\w$]*)/gm;
let m;
while ((m = re.exec(src)) !== null) {
  if (depth[m.index] !== 0) continue;
  const name = m[1];
  const bodyOpen = findBodyOpen(m.index);
  const closeIdx = findClosingBrace(bodyOpen);
  const endIdx = closeIdx + 1; // include closing brace
  items.push({ name, start: m.index, end: endIdx, text: src.slice(m.index, endIdx) });
}

console.log('=== Top-level items detected ===');
for (const it of items) console.log(`${it.name.padEnd(22)} lines ${String(lineOf(it.start)).padStart(3)}-${String(lineOf(it.end - 1)).padStart(3)}  chars=${it.text.length}`);

const byName = {};
for (const it of items) byName[it.name] = it;

// ---- output helpers ----
function transform(text, mode) {
  if (mode === 'default') return text.replace(/^function\s+/, 'export default function ');
  if (mode === 'named') return text.replace(/^function\s+/, 'export function ');
  return text; // plain
}

const files = {}; // rel -> content
function openFile(rel, header) {
  if (!files[rel]) files[rel] = header;
}
function appendBody(rel, text, mode, blank = true) {
  const sep = blank ? '\n\n' : '\n';
  if (files[rel] !== undefined) files[rel] += sep + transform(text, mode);
  else throw new Error('openFile first: ' + rel);
}

// ---- file plans ----
const PLANS = [
  { rel: 'src/App.jsx', header: [
    "import React, { useEffect, useMemo, useState, useReducer } from 'react'",
    "import { list, put, remove, seed } from './services/db'",
    "import { api, setToken, getRole, clearAuth, isTokenValid, queuePush, getGymHWID } from './services/api'",
    "import { startSync, stopSync } from './services/sync'",
    "import { today, fmtHoy, parseFecha, toISO, toDisplay, isSameMonth } from './utils/helpers.js'",
    "import logo from './assets/logo.png'",
    "import Login from './components/Login.jsx'",
    "import GymGate from './components/GymGate.jsx'",
    "import Modal from './components/Modal.jsx'",
    "import { StudentForm, PaymentForm, RoutineForm, ClaseForm, ProfesorForm, UsuarioForm } from './components/forms.jsx'",
    "import VistaInicio from './pages/VistaInicio.jsx'",
    "import VistaGestion from './pages/VistaGestion.jsx'",
    "import VistaReportes from './pages/VistaReportes.jsx'",
    "import VistaPlanificacion from './pages/VistaPlanificacion.jsx'",
    "import VistaAsistencia from './pages/VistaAsistencia.jsx'",
    "import VistaClases from './pages/VistaClases.jsx'",
    "import VistaPlanes from './pages/VistaPlanes.jsx'",
    "import VistaProfesores from './pages/VistaProfesores.jsx'",
    "import VistaPersonal from './pages/VistaPersonal.jsx'",
    "import VistaMiGym from './pages/VistaMiGym.jsx'",
    "import VistaLicencias from './pages/VistaLicencias.jsx'",
    ''
  ].join('\n'), bodies: [['App', 'default']] },

  { rel: 'src/components/Login.jsx', header: [
    "import React, { useState } from 'react'",
    "import logo from '../assets/logo.png'",
    ''
  ].join('\n'), bodies: [['Login', 'default']] },

  { rel: 'src/components/GymGate.jsx', header: [
    "import React, { useState } from 'react'",
    "import { api, setGymHWID } from '../services/api'",
    "import { genGymCode } from '../utils/helpers.js'",
    "import logo from '../assets/logo.png'",
    ''
  ].join('\n'), bodies: [['GymGate', 'default']] },

  { rel: 'src/components/ui.jsx', header: [
    "import React from 'react'",
    ''
  ].join('\n'), bodies: [['PanelTitle', 'named'], ['Badge', 'named'], ['Empty', 'named']] },

  { rel: 'src/components/Modal.jsx', header: [
    "import React from 'react'",
    ''
  ].join('\n'), bodies: [['Modal', 'default']] },

  { rel: 'src/components/forms.jsx', header: [
    "import React from 'react'",
    "import { onEnterNext, today } from '../utils/helpers.js'",
    ''
  ].join('\n'), bodies: [['StudentForm', 'named'], ['PaymentForm', 'named'], ['RoutineForm', 'named'], ['ClaseForm', 'named'], ['ProfesorForm', 'named'], ['UsuarioForm', 'named']] },

  { rel: 'src/pages/VistaInicio.jsx', header: [
    "import React from 'react'",
    "import useClock from '../hooks/useClock.js'",
    "import { PanelTitle, Empty } from '../components/ui.jsx'",
    "import { money } from '../utils/helpers.js'",
    "import logo from '../assets/logo.png'",
    ''
  ].join('\n'), bodies: [['VistaInicio', 'default']] },

  { rel: 'src/pages/VistaGestion.jsx', header: [
    "import React, { useState } from 'react'",
    "import { api, queuePush } from '../services/api'",
    "import { put, remove } from '../services/db'",
    "import { money, toISO, toDisplay, onEnterNext } from '../utils/helpers.js'",
    "import { Empty } from '../components/ui.jsx'",
    ''
  ].join('\n'), bodies: [['VistaGestion', 'default']] },

  { rel: 'src/pages/VistaReportes.jsx', header: [
    "import React from 'react'",
    "import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from 'recharts'",
    "import { PanelTitle, Empty } from '../components/ui.jsx'",
    "import { money, toISO, today } from '../utils/helpers.js'",
    ''
  ].join('\n'), bodies: [['VistaReportes', 'default']] },

  { rel: 'src/pages/VistaPlanificacion.jsx', header: [
    "import React, { useState, useEffect } from 'react'",
    "import { api } from '../services/api'",
    "import { list, put, remove } from '../services/db'",
    "import { money, today, parseFecha, toDisplay, isSameMonth, onEnterNext } from '../utils/helpers.js'",
    "import { Empty } from '../components/ui.jsx'",
    ''
  ].join('\n'), bodies: [['VistaPlanificacion', 'default']] },

  { rel: 'src/pages/VistaAsistencia.jsx', header: [
    "import React, { useState } from 'react'",
    "import useClock from '../hooks/useClock.js'",
    "import { parseFecha } from '../utils/helpers.js'",
    "import logo from '../assets/logo.png'",
    ''
  ].join('\n'), bodies: [['VistaAsistencia', 'default']] },

  { rel: 'src/pages/VistaClases.jsx', header: [
    "import React, { useState } from 'react'",
    "import { api } from '../services/api'",
    "import { today, onEnterNext } from '../utils/helpers.js'",
    "import { Empty } from '../components/ui.jsx'",
    ''
  ].join('\n'), bodies: [['VistaClases', 'default']] },

  { rel: 'src/pages/VistaPlanes.jsx', header: [
    "import React, { useState, useEffect } from 'react'",
    "import { api } from '../services/api'",
    "import FormaEditor from '../components/FormaEditor.jsx'",
    "import { today, onEnterNext } from '../utils/helpers.js'",
    ''
  ].join('\n'), bodies: [['VistaPlanes', 'default']] },

  { rel: 'src/pages/VistaProfesores.jsx', header: [
    "import React, { useState } from 'react'",
    "import { onEnterNext } from '../utils/helpers.js'",
    "import { Empty } from '../components/ui.jsx'",
    ''
  ].join('\n'), bodies: [['VistaProfesores', 'default']] },

  { rel: 'src/pages/VistaPersonal.jsx', header: [
    "import React from 'react'",
    "import { api } from '../services/api'",
    "import { PanelTitle, Empty } from '../components/ui.jsx'",
    ''
  ].join('\n'), bodies: [['VistaPersonal', 'default']] },

  { rel: 'src/pages/VistaMiGym.jsx', header: [
    "import React, { useState, useEffect } from 'react'",
    "import { api } from '../services/api'",
    ''
  ].join('\n'), bodies: [['VistaMiGym', 'default']] },

  { rel: 'src/pages/VistaLicencias.jsx', header: [
    "import React, { useState, useEffect, useMemo } from 'react'",
    "import { api, setGymHWID } from '../services/api'",
    "import { PanelTitle } from '../components/ui.jsx'",
    "import { money, toDisplay, onEnterNext, genGymCode } from '../utils/helpers.js'",
    ''
  ].join('\n'), bodies: [['VistaLicencias', 'default'], ['TodasLicenciasTable', 'plain'], ['NuevaLicenciaForm', 'plain']] },
];

// ---- generate files ----
for (const plan of PLANS) {
  openFile(plan.rel, plan.header);
  for (const [name, mode] of plan.bodies) {
    if (!byName[name]) throw new Error('item not extracted: ' + name);
    appendBody(plan.rel, byName[name].text, mode, true);
  }
}

// write files
for (const rel of Object.keys(files)) {
  const target = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, files[rel].trimEnd() + '\n');
  console.log('WRITTEN', rel, '-', (files[rel].length / 1024).toFixed(1), 'KB');
}

// ---- main.jsx entry ----
const mainEntry = [
  "import React from 'react'",
  "import { createRoot } from 'react-dom/client'",
  "import { registerSW } from 'virtual:pwa-register'",
  "import App from './App.jsx'",
  "import './styles.css'",
  '',
  "registerSW({ immediate: true })",
  '',
  "createRoot(document.getElementById('root')).render(<App/>)",
  ''
].join('\n');
fs.writeFileSync(path.join(ROOT, 'src', 'main.jsx'), mainEntry);
console.log('WRITTEN src/main.jsx -', (mainEntry.length / 1024).toFixed(1), 'KB');

// ---- services: move api/db/sync ----
for (const f of ['api.js', 'db.js', 'sync.js']) {
  const from = path.join(ROOT, 'src', f);
  const to = path.join(ROOT, 'src', 'services', f);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, fs.readFileSync(from, 'utf8'));
  fs.rmSync(from);
  console.log('MOVED src/' + f + ' -> src/services/' + f);
}

// ---- FormaEditor -> components with adjusted imports ----
const fePath = path.join(ROOT, 'src', 'FormaEditor.jsx');
const fe2 = fs.readFileSync(fePath, 'utf8')
  .replace(/from '\.\/api'/g, "from '../services/api'")
  .replace(/from '\.\/db'/g, "from '../services/db'")
  .replace(/'\.\/utils\/pdf\.js'/g, "'../utils/pdf.js'");
fs.writeFileSync(path.join(ROOT, 'src', 'components', 'FormaEditor.jsx'), fe2.trimEnd() + '\n');
fs.rmSync(fePath);
console.log('MOVED src/FormaEditor.jsx -> src/components/FormaEditor.jsx');

// ---- helpers.js: append genGymCode ----
const helpersPath = path.join(ROOT, 'src', 'utils', 'helpers.js');
if (!byName['genGymCode']) throw new Error('genGymCode not extracted');
const appended = fs.readFileSync(helpersPath, 'utf8').replace(/\n*$/, '') + '\n\nexport ' + byName['genGymCode'].text.replace(/^function\s+/, 'function ') + '\n';
fs.writeFileSync(helpersPath, appended);
console.log('APPENDED genGymCode -> src/utils/helpers.js');

console.log('=== DONE ===');