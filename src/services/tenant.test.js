// V40-01: tests de tenant.js REAL (sin duplicar lógica de producción).
import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeTenant,
  isValidTenant,
  getCurrentTenant,
  tenantKey,
  tenantGetJSON,
  tenantSetJSON,
  pushDeletedId,
  removeDeletedId,
  clearTenantEntityData,
} from './tenant.js';

beforeEach(() => {
  globalThis.__resetAll();
});

describe('normalizeTenant', () => {
  it('normaliza trim + mayúsculas', () => {
    expect(normalizeTenant('  gym-a ')).toBe('GYM-A');
  });
  it('rechaza vacío, undefined, null y no-strings', () => {
    expect(normalizeTenant('')).toBeNull();
    expect(normalizeTenant('   ')).toBeNull();
    expect(normalizeTenant('undefined')).toBeNull();
    expect(normalizeTenant('NULL')).toBeNull();
    expect(normalizeTenant(null)).toBeNull();
    expect(normalizeTenant(123)).toBeNull();
  });
});

describe('isValidTenant', () => {
  it('valida/invalida', () => {
    expect(isValidTenant('GYM-A')).toBe(true);
    expect(isValidTenant('')).toBe(false);
  });
});

describe('tenantKey', () => {
  it('1. genera claves distintas para A/B', () => {
    expect(tenantKey('clases')).toBe('atlos:GYM-A:clases');
    localStorage.setItem('atlos-gym-hwid', 'GYM-B');
    expect(tenantKey('clases')).toBe('atlos:GYM-B:clases');
    expect(tenantKey('clases')).not.toBe('atlos:GYM-A:clases');
  });
  it('2. tenant inválido falla cerrado (null)', () => {
    localStorage.removeItem('atlos-gym-hwid');
    expect(getCurrentTenant()).toBeNull();
    expect(tenantKey('clases')).toBeNull();
    expect(tenantGetJSON('clases', [])).toEqual([]);
    expect(tenantSetJSON('clases', [{ id: 1 }])).toBe(false);
    expect(localStorage.getItem('atlos:GYM-A:clases')).toBeNull();
  });
  it('rechaza bases ambiguas', () => {
    expect(tenantKey('')).toBeNull();
    expect(tenantKey('a:b')).toBeNull();
    expect(tenantKey('a b')).toBeNull();
  });
});

describe('deleted helpers', () => {
  it('pushDeletedId deduplica y acota FIFO', () => {
    pushDeletedId('deleted-clases', 'c1');
    pushDeletedId('deleted-clases', 'c1');
    expect(tenantGetJSON('deleted-clases', [])).toEqual(['c1']);
    for (let i = 0; i < 505; i++) pushDeletedId('deleted-pagos', 'p' + i);
    const l = tenantGetJSON('deleted-pagos', []);
    expect(l.length).toBe(500);
    expect(l).not.toContain('p0');
    expect(l).toContain('p504');
  });
  it('removeDeletedId es idempotente', () => {
    pushDeletedId('deleted-clases', 'c9');
    expect(removeDeletedId('deleted-clases', 'c9')).toBe(true);
    expect(removeDeletedId('deleted-clases', 'c9')).toBe(false);
  });
  it('clearTenantEntityData borra 6 claves del activo sin tocar otros', () => {
    for (const b of ['clases', 'profesores', 'inscripciones', 'library', 'alumnos-ext', 'gymconf']) {
      tenantSetJSON(b, [{ id: 'a' }]);
    }
    localStorage.setItem('atlos-gym-hwid', 'GYM-B');
    tenantSetJSON('gymconf', { gym_name: 'B' });
    localStorage.setItem('atlos-gym-hwid', 'GYM-A');
    expect(clearTenantEntityData()).toBe(6);
    expect(localStorage.getItem('atlos:GYM-A:gymconf')).toBeNull();
    expect(localStorage.getItem('atlos:GYM-B:gymconf')).not.toBeNull();
  });
});
