// V44-J: exportación CSV local. Testea toCSV() (puro) y descargarCSV()
// (Blob + enlace con URL.createObjectURL), que es lo que usa cada pantalla.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { toCSV, descargarCSV } from './export.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('toCSV', () => {
  it('1. encabezado con etiquetas y filas separadas por ;', () => {
    const rows = [{ a: 'x', b: 'y' }];
    const cols = [{ key: 'a', label: 'Campo A' }, { key: 'b', label: 'Campo B' }];
    const csv = toCSV(rows, cols);
    expect(csv).toBe('\uFEFFCampo A;Campo B\nx;y');
  });

  it('2. arranca con BOM UTF-8 (Excel lee tildes/ñ correctamente)', () => {
    const csv = toCSV([{ a: 1 }], [{ key: 'a', label: 'A' }]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
  });

  it('3. escapa comillas, separador ; y saltos de línea (RFC 4180)', () => {
    const csv = toCSV([{ a: 'va;l"ue\nx' }], [{ key: 'a', label: 'V' }]);
    expect(csv).toContain('"va;l""ue\nx"');
  });

  it('4. usa get(row) para valores derivados', () => {
    const csv = toCSV([{ x: 7 }], [{ key: 'x', label: 'X', get: (r) => 'der:' + r.x }]);
    expect(csv).toContain('der:7');
  });

  it('5. null/undefined quedan como celda vacía', () => {
    const rows = [{ a: null }, { a: undefined }];
    const csv = toCSV(rows, [{ key: 'a', label: 'A' }]);
    expect(csv).toBe('\uFEFFA\n\n');
  });

  it('6. sin filas devuelve solo el encabezado con BOM', () => {
    expect(toCSV([], [{ key: 'a', label: 'A' }])).toBe('\uFEFFA');
  });
});

describe('descargarCSV', () => {
  it('7. crea el Blob, enlaza, hace click y revoca la URL', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:test');
    const revokeObjectURL = vi.fn();
    const click = vi.fn();
    const anchor = { href: '', download: '', click, remove: vi.fn() };
    const appendChild = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.stubGlobal('document', { createElement: (tag) => (tag === 'a' ? anchor : {}), body: { appendChild } });

    descargarCSV('salida.csv', '\uFEFFa;b');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(anchor.href).toBe('blob:test');
    expect(anchor.download).toBe('salida.csv');
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(click).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1500);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });
});