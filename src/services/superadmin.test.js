// V44-J: esSuperadminATLOS() — bypass de GymGate para el admin global de ATLOS.
// Testea el helper REAL de producción (no una reimplementación).
// El discriminador es el claim `gym_id` del JWT (null = superadmin global),
// NUNCA el nombre del rol: 'Dueño'/'Administrador' son admins DE GIMNASIO.
import { describe, it, expect, beforeEach } from 'vitest';
import { esSuperadminATLOS } from './api.js';

// Token JWT mínimo: solo el payload se decodifica (tok.split('.')[1]).
// Payloads en ASCII para que btoa/atob no fallen por caracteres fuera de Latin-1.
const b64 = (obj) => btoa(JSON.stringify(obj));
const token = (payload) => 'header.' + b64(payload) + '.firma';
const expFuturo = () => Math.floor(Date.now() / 1000) + 3600;
const expPasado = () => Math.floor(Date.now() / 1000) - 60;
const setToken = (t) => localStorage.setItem('atlos-token', t);

beforeEach(() => {
  globalThis.__resetAll();
});

describe('esSuperadminATLOS', () => {
  // 1. JWT valido con gym_id: null  ->  true
  it('1. gym_id null devuelve true (superadmin global)', () => {
    setToken(token({ sub: 'atlos', user_id: 1, gym_id: null, rol: 'Dueño', exp: expFuturo() }));
    expect(esSuperadminATLOS()).toBe(true);
  });

  it('1b. gym_id null es true con cualquier rol (el rol no decide)', () => {
    for (const rol of ['Alumno', 'Empleado', 'Dueño', 'Administrador', 'Superadmin']) {
      setToken(token({ sub: 'atlos', gym_id: null, rol, exp: expFuturo() }));
      expect(esSuperadminATLOS()).toBe(true);
    }
  });

  // 2. JWT valido con gym_id: "un-gym-id"  ->  false
  it('2. gym_id con valor devuelve false (usuario de gimnasio)', () => {
    setToken(token({ sub: 'duenio', gym_id: 'un-gym-id', rol: 'Dueño', exp: expFuturo() }));
    expect(esSuperadminATLOS()).toBe(false);
  });

  it('2b. gym_id numerico (id de gym en la DB) devuelve false', () => {
    setToken(token({ sub: 'duenio', gym_id: 7, rol: 'Administrador', exp: expFuturo() }));
    expect(esSuperadminATLOS()).toBe(false);
  });

  it('2c. rol Dueño/Administrador NO habilita el bypass por sí solo', () => {
    setToken(token({ sub: 'duenio', gym_id: 'gym-9', rol: 'Dueño', exp: expFuturo() }));
    expect(esSuperadminATLOS()).toBe(false);
  });

  // 3. JWT valido SIN claim gym_id  ->  false (fail-closed)
  it('3. sin claim gym_id devuelve false (el backend lo resuelve server-side)', () => {
    setToken(token({ sub: 'duenio', rol: 'Dueño', exp: expFuturo() }));
    expect(esSuperadminATLOS()).toBe(false);
  });

  it('3b. claim gym_id ausente aunque el rol diga Superadmin -> false', () => {
    setToken(token({ sub: 'x', rol: 'Superadmin', exp: expFuturo() }));
    expect(esSuperadminATLOS()).toBe(false);
  });

  // 4. Token ausente, invalido o vencido  ->  false
  it('4a. token ausente devuelve false', () => {
    localStorage.removeItem('atlos-token');
    expect(esSuperadminATLOS()).toBe(false);
  });

  it('4b. token invalido / malformado devuelve false', () => {
    for (const t of ['', 'tok', 'no-es-jwt', 'a.b.c', 'header.%%%.firma', 'header..firma']) {
      setToken(t);
      expect(esSuperadminATLOS()).toBe(false);
    }
  });

  it('4c. token vencido devuelve false (exp en el pasado)', () => {
    setToken(token({ sub: 'atlos', gym_id: null, rol: 'Dueño', exp: expPasado() }));
    expect(esSuperadminATLOS()).toBe(false);
  });

  it('4d. payload no-objeto devuelve false', () => {
    setToken('header.' + btoa('"solo-un-string"') + '.firma');
    expect(esSuperadminATLOS()).toBe(false);
  });
});
