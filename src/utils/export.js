// V44-J: exportacion CSV local (Blob nativo, sin dependencias). Solo datos
// que la pantalla ya muestra y el usuario puede consultar (mismo scope).
function esc(v) {
  const s = v == null ? '' : String(v);
  // Si el valor contiene separador, comillas o saltos, se encierra entre
  // comillas y las comillas internas se duplican (RFC 4180 con ';').
  return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// columns: [{key, label, get?}] — get(row) opcional para valores derivados.
export function toCSV(rows, columns) {
  const head = columns.map((c) => esc(c.label)).join(';');
  const lines = (rows || []).map((r) => columns.map((c) => esc(c.get ? c.get(r) : r && r[c.key])).join(';'));
  // BOM UTF-8: Excel reconoce el CSV como UTF-8 y respeta tildes/ñ.
  return '\uFEFF' + [head, ...lines].join('\n');
}

export function descargarCSV(nombre, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}