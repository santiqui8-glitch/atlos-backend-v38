// V44-I: selectores puros del portal + metodo cambiarClave.
import { describe, it, expect, beforeEach } from 'vitest';
import { alumnoPropio } from '../pages/VistaPortal.jsx';
import { api, getUserId } from '../services/api.js';

const lastReq = (method, path) => {
  const all = globalThis.__fetchLog.filter((r) => r.method === method && r.path === path);
  return all[all.length - 1];
};

beforeEach(() => {
  globalThis.__resetAll();
  globalThis.__setOnline(true);
});

describe('V44-I portal', () => {
  it('1. alumnoPropio matchea por id string/numero', () => {
    const rows = [{ id: 5, name: 'A' }, { id: '9', name: 'B' }];
    expect(alumnoPropio(rows, 5)?.name).toBe('A');
    expect(alumnoPropio(rows, '9')?.name).toBe('B');
    expect(alumnoPropio(rows, 999)).toBeNull();
    expect(alumnoPropio([], 1)).toBeNull();
  });
  it('2. cambiarClave POST /auth/cambiar-clave con body', async () => {
    globalThis.__setRoutes({ 'POST /auth/cambiar-clave': () => ({ status: 200, json: { mensaje: 'Clave actualizada' } }) });
    const r = await api.cambiarClave('vieja', 'nueva123');
    expect(r.mensaje).toBe('Clave actualizada');
    expect(lastReq('POST', '/auth/cambiar-clave').body).toMatchObject({ clave_actual: 'vieja', clave_nueva: 'nueva123' });
  });
  it('3. cambiarClave 401 se propaga', async () => {
    globalThis.__setRoutes({ 'POST /auth/cambiar-clave': () => ({ status: 401, json: { detail: 'Clave actual incorrecta' } }) });
    await expect(api.cambiarClave('mal', 'nueva123')).rejects.toMatchObject({ status: 401 });
  });
  it('4. getUserId lee user_id del JWT sin red', () => {
    const payload = btoa(JSON.stringify({ user_id: 42, rol: 'Alumno', exp: 9999999999 }));
    localStorage.setItem('atlos-token', `h.${payload}.s`);
    expect(getUserId()).toBe(42);
    localStorage.removeItem('atlos-token');
    expect(getUserId()).toBeNull();
  });
});
