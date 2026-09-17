export const PERIODICIDAD_MESES = [1, 2, 3, 6, 12]

/** Periodicidades alineadas con backend (rrhh_trabajadores.contrato_periodicidad_renovacion). */
export const PERIODICIDAD_RENOVACION_OPTS = [
  { value: 'mensual', label: 'Mensual', meses: 1 },
  { value: 'bimestral', label: 'Bimestral', meses: 2 },
  { value: 'trimestral', label: 'Trimestral', meses: 3 },
  { value: 'semestral', label: 'Semestral', meses: 6 },
  { value: 'anual', label: 'Anual', meses: 12 },
]

export const CLAUSULA_LEY_1581 =
  'Asimismo, el colaborador autoriza el tratamiento de sus datos personales conforme a la Ley 1581 de 2012 y su reglamentación (Decreto 1377 de 2013 y normas que la complementen, modifiquen o sustituyan), para los fines propios de la relación laboral y las obligaciones legales derivadas de la misma.'

export function empresaKeyFromRow(row) {
  if (!row) return 'consorcio'
  if (row.empresa_tipo === 'subcontratista' && row.empresa_subcontratista_id != null) {
    return `sub:${row.empresa_subcontratista_id}`
  }
  if (row.empresa_tipo === 'subcontratista') {
    return `subnombre:${String(row.empresa_nombre || '').trim().toLowerCase() || 'sin_asignar'}`
  }
  return 'consorcio'
}

export function agruparPorEmpresa(items = [], { verSalario = true } = {}) {
  const grupos = new Map()
  for (const row of items) {
    const key = empresaKeyFromRow(row)
    let g = grupos.get(key)
    if (!g) {
      g = {
        empresa_key: key,
        empresa_tipo: row.empresa_tipo || 'consorcio',
        nombre: (row.empresa_nombre || 'Consorcio').trim() || 'Consorcio',
        empresa_nit: row.empresa_nit,
        subcontratista_id: row.empresa_subcontratista_id ?? null,
        activos: 0,
        total: 0,
        total_nomina: 0,
        por_cargo: new Map(),
      }
      grupos.set(key, g)
    }
    g.total += 1
    if (String(row.estado || '').toLowerCase() === 'activo') g.activos += 1
    const cargo = (row.cargo_aspira || 'Sin cargo').trim() || 'Sin cargo'
    let c = g.por_cargo.get(cargo)
    if (!c) {
      c = { cargo, cantidad: 0, total_nomina: 0 }
      g.por_cargo.set(cargo, c)
    }
    c.cantidad += 1
    // Nunca sumar texto formateado ("$ 1.234.567"); solo el valor numérico.
    let sal = 0
    if (typeof row.salario === 'number' && Number.isFinite(row.salario)) {
      sal = row.salario
    } else if (row.salario != null && row.salario !== '') {
      const digits = String(row.salario).replace(/[^\d]/g, '')
      const n = digits ? Number(digits) : NaN
      sal = Number.isFinite(n) ? n : 0
    }
    g.total_nomina += sal
    c.total_nomina += sal
  }
  const out = []
  for (const g of grupos.values()) {
    const cargos = [...g.por_cargo.values()].sort((a, b) => b.cantidad - a.cantidad || a.cargo.localeCompare(b.cargo, 'es'))
    out.push({
      ...g,
      total_nomina: verSalario ? g.total_nomina : null,
      por_cargo: cargos.map((c) => ({
        ...c,
        total_nomina: verSalario ? c.total_nomina : null,
      })),
    })
  }
  out.sort((a, b) => {
    if (a.empresa_key === 'consorcio') return -1
    if (b.empresa_key === 'consorcio') return 1
    return a.nombre.localeCompare(b.nombre, 'es')
  })
  return out
}
