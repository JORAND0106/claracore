/**
 * Verificador estructural de DXF ASCII (AutoCAD 2013+).
 * No intenta ser un parser completo: detecta fallos que hacen crash típico.
 */

/**
 * @param {string} dxfText
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
export function validateEsquemaDxf(dxfText) {
  const errors = []
  const warnings = []
  const s = String(dxfText || '')
  if (!s.trim()) {
    return { ok: false, errors: ['DXF vacío'], warnings }
  }

  const lines = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  if (lines.length < 10) errors.push('Demasiado corto para un DXF válido')

  // Pares code/value
  if (lines.length % 2 !== 0) {
    // Trailing empty line is OK
    const last = lines[lines.length - 1]
    if (last !== '') errors.push('Número impar de líneas (pares code/value rotos)')
  }

  const text = s
  if (!/\$ACADVER/i.test(text)) errors.push('Falta $ACADVER en HEADER')
  if (!/\$INSUNITS/i.test(text)) warnings.push('Sin $INSUNITS')
  if (!/SECTION[\s\S]*TABLES/i.test(text)) errors.push('Falta SECTION TABLES')
  if (!/\nLAYER\n/i.test(text) && !/\n2\nLAYER\n/i.test(text)) {
    // LAYER table marker as group 2
    if (!/TABLE[\s\S]*\n2\nLAYER\n/i.test(text)) errors.push('Falta tabla LAYER')
  }
  if (!/TABLE[\s\S]*\n2\nLTYPE\n/i.test(text)) errors.push('Falta tabla LTYPE (CONTINUOUS)')
  if (!/TABLE[\s\S]*\n2\nSTYLE\n/i.test(text)) errors.push('Falta tabla STYLE (STANDARD)')
  if (!/SECTION[\s\S]*ENTITIES/i.test(text)) errors.push('Falta SECTION ENTITIES')
  if (!/\n0\nEOF\s*$/i.test(text.trimEnd() + '\n') && !/\n0\nEOF\n?$/i.test(text)) {
    errors.push('Falta EOF final')
  }

  // NaN / Infinity en coordenadas
  if (/\bNaN\b/i.test(text) || /\bInfinity\b/i.test(text)) {
    errors.push('Contiene NaN o Infinity (AutoCAD aborta)')
  }

  // Códigos de grupo deben ser enteros
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = String(lines[i] ?? '').trim()
    if (code === '' && i === lines.length - 2) continue
    if (!/^-?\d+$/.test(code)) {
      errors.push(`Código de grupo inválido en línea ${i + 1}: "${code}"`)
      break
    }
  }

  return { ok: errors.length === 0, errors, warnings }
}
