// V40-01: mutex cross-tab vía flushQueue REAL + localStorage pre-sembrado.
// Cubre adquisición, expiración/robo, release con owner-check y stop fail-closed.
// La race literal mismo-milisegundo entre dos hilos no es reproducible en un
// único realm JS (ver Limitaciones): requiere harness de integración manual.
import { describe, it, expect, beforeEach } from 'vitest';
import { queuePush, flushQueue } from './api.js';

const LOCK = 'atlos:GYM-A:flush-lock';
const Q = 'atlos:GYM-A:queue';
const readQueue = () => JSON.parse(localStorage.getItem(Q) || '[]');
const hits = (method, path) => globalThis.__fetchLog.filter((r) => r.method === method && r.path === path).length;
let _op = 0;
const item = (type, payload, extra) => ({
  gymId: 'GYM-A', userId: 'u1', sessionId: 's1',
  operationId: 'op-' + ++_op, type, payload, ts: Date.now(), ...(extra || {}),
});

beforeEach(() => {
  globalThis.__resetAll();
});

describe('mutex cross-tab', () => {
  it('adquisición: flush normal toma y libera el lock namespaced', async () => {
    globalThis.__setRoutes({ 'POST /pagos': () => ({ status: 200, json: { id: 'S' } }) });
    localStorage.setItem(Q, JSON.stringify([item('pago', { alumno_id: '1', monto: 1 })]));
    await flushQueue();
    expect(hits('POST', '/pagos')).toBe(1);
    expect(localStorage.getItem(LOCK)).toBeNull();
  });

  it('segundo owner no puede adquirir: aborta sin POSTs ni escrituras', async () => {
    globalThis.__setRoutes({ 'POST /pagos': () => ({ status: 200, json: { id: 'S' } }) });
    const before = JSON.stringify({ owner: 'otra-pestana', exp: Date.now() + 25000 });
    localStorage.setItem(LOCK, before);
    localStorage.setItem(Q, JSON.stringify([item('pago', { alumno_id: '1', monto: 1 })]));
    await flushQueue();
    expect(hits('POST', '/pagos')).toBe(0);
    expect(JSON.parse(localStorage.getItem(Q)).length).toBe(1);
    expect(localStorage.getItem(LOCK)).toBe(before);
  });

  it('lock expirado puede ser recuperado (robo tras crash)', async () => {
    globalThis.__setRoutes({ 'POST /pagos': () => ({ status: 200, json: { id: 'S' } }) });
    localStorage.setItem(LOCK, JSON.stringify({ owner: 'pestana-muerta', exp: Date.now() - 5000 }));
    localStorage.setItem(Q, JSON.stringify([item('pago', { alumno_id: '1', monto: 1 })]));
    await flushQueue();
    expect(hits('POST', '/pagos')).toBe(1);
    expect(localStorage.getItem(LOCK)).toBeNull();
  });

  it('lock corrupto (JSON inválido) se trata como libre', async () => {
    globalThis.__setRoutes({ 'POST /pagos': () => ({ status: 200, json: { id: 'S' } }) });
    localStorage.setItem(LOCK, '{basura!!!');
    localStorage.setItem(Q, JSON.stringify([item('pago', { alumno_id: '1', monto: 1 })]));
    await flushQueue();
    expect(hits('POST', '/pagos')).toBe(1);
  });

  it('sin identidad no se adquiere lock', async () => {
    globalThis.__setRoutes({ 'POST /pagos': () => ({ status: 200, json: { id: 'S' } }) });
    localStorage.removeItem('atlos-sid');
    localStorage.setItem(Q, JSON.stringify([item('pago', { alumno_id: '1', monto: 1 })]));
    await flushQueue();
    expect(localStorage.getItem(LOCK)).toBeNull();
    expect(hits('POST', '/pagos')).toBe(0);
  });

  it('pérdida de lock a mitad del flush provoca stop fail-closed', async () => {
    let resolveFirst = null;
    let calls = 0;
    globalThis.__setRoutes({
      'POST /pagos': () => {
        calls++;
        if (calls === 1) return new Promise((res) => { resolveFirst = () => res({ status: 200, json: { id: 'P1' } }); });
        return { status: 200, json: { id: 'PX' } };
      },
    });
    localStorage.setItem(Q, JSON.stringify([
      item('pago', { alumno_id: '1', monto: 1 }),
      item('pago', { alumno_id: '2', monto: 2 }),
    ]));
    const p = flushQueue();
    localStorage.setItem(LOCK, JSON.stringify({ owner: 'pestana-muerta', exp: Date.now() - 1000 }));
    resolveFirst();
    await p;
    const q = readQueue();
    expect(hits('POST', '/pagos')).toBe(1);
    expect(q.length).toBe(1);
    expect(q[0].payload.monto).toBe(2);
  });

  it('release en error: retryable también libera', async () => {
    globalThis.__setRoutes({ 'POST /pagos': () => ({ status: 500, json: { detail: 'x' } }) });
    localStorage.setItem(Q, JSON.stringify([item('pago', { alumno_id: '1', monto: 1 })]));
    await flushQueue();
    expect(readQueue().length).toBe(1);
    expect(localStorage.getItem(LOCK)).toBeNull();
  });

  it('pushDuringFlush legítimo se conserva con lock activo', async () => {
    let pushed = false;
    globalThis.__setRoutes({
      'POST /pagos': () => {
        if (!pushed) { pushed = true; queuePush('pago', { alumno_id: '9', monto: 7 }); }
        return { status: 200, json: { id: 'S' } };
      },
    });
    localStorage.setItem(Q, JSON.stringify([item('pago', { alumno_id: '1', monto: 1 })]));
    await flushQueue();
    const q = readQueue();
    expect(q.length).toBe(1);
    expect(q[0].payload.monto).toBe(7);
    expect(localStorage.getItem(LOCK)).toBeNull();
  });
});
