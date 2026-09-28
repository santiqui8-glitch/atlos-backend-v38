// V44-J: calendario operativo. Testea los helpers puros y la forma FINAL de la
// semana visible: {fechaISO, esHoy, fecha, total} (R1: la versión previa
// devolvía strings ISO y rompía la grilla). El resumen de accesos no vive aquí
// (R5): vive en utils/acceso.js y se testea en su propio archivo.
import { describe, it, expect } from 'vitest';
import {
  diaDeLaSemana,
  estaEnSemana,
  estaEnMes,
  formatFechaLarga,
  formatHora,
  calendarioSemana,
} from './calendario.js';

// Convención de la grilla: 0=lunes..6=domingo. diaDeLaSemana() sigue el
// contrato original del stash: indice = getDay() (0=domingo..6=sábado).
// Hoy de referencia: lunes 2026-09-28 (mediodía para evitar bordes de TZ).
const HOY = new Date(2026, 8, 28, 12, 0, 0);

describe('diaDeLaSemana', () => {
  it('1. devuelve nombre/corto/indice consistentes con el día real (jueves 1/1)', () => {
    const d = diaDeLaSemana(1);
    expect(d.indice).toBe(new Date(2026, 0, 1).getDay()); // 4 = jueves (getDay)
    expect(d.nombre).toBe('Jueves');
    expect(d.corto).toBe('JUE');
  });

  it('2. miércoles 28/1 mapanea con su índice', () => {
    expect(diaDeLaSemana(28).indice).toBe(new Date(2026, 0, 28).getDay()); // 3
  });

  it('3. fuera de rango devuelve null (misma convención que las clases)', () => {
    expect(diaDeLaSemana(0)).toBeNull();
    expect(diaDeLaSemana(32)).toBeNull();
    expect(diaDeLaSemana(null)).toBeNull();
  });
});

describe('formatHora', () => {
  it('4. normaliza 1 dígito a HH:MM', () => {
    expect(formatHora('8:05')).toBe('08:05');
    expect(formatHora('08:05')).toBe('08:05');
  });
  it('5. vacío/null → — ; texto sin formato se devuelve como viene', () => {
    expect(formatHora('')).toBe('—');
    expect(formatHora(null)).toBe('—');
    expect(formatHora('tarde')).toBe('tarde');
  });
});

describe('formatFechaLarga / estaEnMes / estaEnSemana', () => {
  it('6. formatFechaLarga: "Lunes 28 de septiembre"', () => {
    expect(formatFechaLarga('2026-09-28T12:00:00')).toBe('Lunes 28 de septiembre');
  });

  it('7. estaEnMes compara año+mes', () => {
    expect(estaEnMes('2026-09-15T12:00:00', '2026-09-28T12:00:00')).toBe(true);
    expect(estaEnMes('2026-10-01T12:00:00', '2026-09-28T12:00:00')).toBe(false);
  });

  it('8. estaEnSemana: lun–dom de la semana que contiene a semanaISO', () => {
    const semana = '2026-09-28T12:00:00'; // lunes
    expect(estaEnSemana('2026-09-28T12:00:00', semana)).toBe(true);
    expect(estaEnSemana('2026-10-04T12:00:00', semana)).toBe(true); // domingo
    expect(estaEnSemana('2026-09-27T12:00:00', semana)).toBe(false); // domingo anterior
    expect(estaEnSemana('2026-10-05T12:00:00', semana)).toBe(false); // lunes siguiente
  });
});

describe('calendarioSemana', () => {
  it('9. entrega 7 días con la forma {fechaISO, esHoy, fecha, total}', () => {
    const dias = calendarioSemana({ hoy: HOY });
    expect(dias).toHaveLength(7);
    for (const d of dias) {
      expect(d).toMatchObject({ fechaISO: expect.any(String), esHoy: expect.any(Boolean), fecha: expect.any(String), total: expect.any(Number) });
    }
  });

  it('10. arranca el lunes 28/9, marca esHoy solo en ese día y termina domingo 4/10', () => {
    const dias = calendarioSemana({ hoy: HOY });
    expect(dias[0].fechaISO).toBe('2026-09-28');
    expect(dias[6].fechaISO).toBe('2026-10-04');
    expect(dias.filter((d) => d.esHoy).length).toBe(1);
    expect(dias.find((d) => d.esHoy).fechaISO).toBe('2026-09-28');
    // Etiqueta corta coherente con cada día de la semana.
    expect(dias[0].fecha).toBe('LUN 28');
    expect(dias[6].fecha).toBe('DOM 4');
  });

  it('11. total cuenta clases por día según dia_mes (jueves=1, miércoles=28)', () => {
    const dias = calendarioSemana({
      hoy: HOY,
      clases: [{ dia_mes: 1 }, { dia_mes: 28 }, { dia: 'Lunes' }, { dia: 'Domingo' }, { dia: 'dia-invalido' }],
    });
    // lunes 28/9: clase "Lunes"; martes 29: sin clases; miércoles 30: dia_mes 28; jueves 1/10: dia_mes 1; domingo 4/10: "Domingo".
    expect(dias[0].total).toBe(1);
    expect(dias[1].total).toBe(0);
    expect(dias[2].total).toBe(1);
    expect(dias[3].total).toBe(1);
    expect(dias[4].total).toBe(0);
    expect(dias[5].total).toBe(0);
    expect(dias[6].total).toBe(1);
  });

  it('12. semanaCursor mueve la semana visible (lunes 12/10 para el 15/10)', () => {
    const dias = calendarioSemana({ hoy: HOY, semanaCursor: new Date(2026, 9, 15, 12, 0, 0) });
    expect(dias[0].fechaISO).toBe('2026-10-12');
    expect(dias[6].fechaISO).toBe('2026-10-18');
  });

  it('13. clases con dia_mes duplicado suman en el mismo día', () => {
    const dias = calendarioSemana({ hoy: HOY, clases: [{ dia_mes: 1 }, { dia_mes: 1 }] });
    expect(dias[3].total).toBe(2);
  });
});