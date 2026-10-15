/**
 * Vista consolidada tipo informe mensual de ejecución:
 * Tramo → Capítulo → Ítem (subtotales) → registros al expandir.
 * Cantidad / costo: mismas reglas que CPI / informe (round2(cant)×VU → round0).
 */
import { costoDirectoDesdeListado, vuEfectivoFila } from './sicoeCantidadesPorItemHelpers.js'
import { chipValidacionNivel } from './sicoeCantidadesGrillaHelpers.js'

export function sicoeTramoLabel(tramo) {
  const s = String(tramo || '').trim()
  return s || 'Sin tramo'
}

export function sicoeClaveItemEjecucion(reg) {
  return [
    sicoeTramoLabel(reg?.tramo),
    String(reg?.capitulo || '').trim() || 'Sin capítulo',
    String(reg?.item_numero || '').trim(),
  ].join('\u0001')
}

function _num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function _cmpStr(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'es', { numeric: true, sensitivity: 'base' })
}

/**
 * Conteos de validación por estado+nivel (chip consolidado de cada registro).
 * @returns {{ chips: Array<{label:string,estado:string,nivel:number|null,count:number}>, total: number }}
 */
export function sicoeContarValidacionItem(registros, nivelesActivos = [1, 2, 3]) {
  const map = new Map()
  for (const r of registros || []) {
    const chip = chipValidacionNivel(r, nivelesActivos)
    const k = `${chip.estado}|${chip.nivel ?? ''}|${chip.label}`
    const prev = map.get(k)
    if (prev) prev.count += 1
    else map.set(k, { label: chip.label, estado: chip.estado, nivel: chip.nivel, count: 1 })
  }
  const chips = [...map.values()].sort((a, b) => {
    const ea = String(a.estado).localeCompare(String(b.estado), 'es')
    if (ea) return ea
    return (Number(a.nivel) || 0) - (Number(b.nivel) || 0)
  })
  return { chips, total: (registros || []).length }
}

/**
 * Enriquece un registro con VU / costo efectivos (paridad CPI / informe).
 */
export function sicoeRegistroCostoEfectivo(reg, payloadVu = null) {
  const vu = vuEfectivoFila(reg, payloadVu)
  const cant = _num(reg?.cantidad_total ?? reg?.cantidad)
  const costo =
    reg?.costo_directo_calc != null && Number.isFinite(Number(reg.costo_directo_calc))
      ? Math.round(Number(reg.costo_directo_calc))
      : costoDirectoDesdeListado(cant, vu)
  return { vu, cant, costo }
}

/**
 * Construye el árbol Tramo → Capítulo → Ítem a partir de registros planos (CPI).
 * Ítems sin número se omiten (igual que CPI general).
 */
export function sicoeConstruirArbolEjecucion(registros, {
  nivelesActivos = [1, 2, 3],
  payloadVu = null,
} = {}) {
  const byTramo = new Map()

  for (const raw of registros || []) {
    if (!String(raw?.item_numero || '').trim()) continue
    const { vu, cant, costo } = sicoeRegistroCostoEfectivo(raw, payloadVu)
    const reg = { ...raw, _vu_efectivo: vu, _cant_efectiva: cant, _costo_efectivo: costo }

    const tramo = sicoeTramoLabel(reg.tramo)
    const capitulo = String(reg.capitulo || '').trim() || 'Sin capítulo'
    const item = String(reg.item_numero || '').trim()

    if (!byTramo.has(tramo)) {
      byTramo.set(tramo, { tramo, cantidad: 0, costo: 0, capitulos: new Map() })
    }
    const tNode = byTramo.get(tramo)
    tNode.cantidad += cant
    tNode.costo += costo

    if (!tNode.capitulos.has(capitulo)) {
      tNode.capitulos.set(capitulo, { capitulo, cantidad: 0, costo: 0, items: new Map() })
    }
    const cNode = tNode.capitulos.get(capitulo)
    cNode.cantidad += cant
    cNode.costo += costo

    const itemKey = item
    if (!cNode.items.has(itemKey)) {
      cNode.items.set(itemKey, {
        item_numero: item,
        descripcion: String(reg.item_descripcion || '').trim(),
        unidad: String(reg.unidad || '').trim(),
        vlr_unitario: vu,
        cantidad: 0,
        costo: 0,
        registros: [],
      })
    }
    const iNode = cNode.items.get(itemKey)
    iNode.cantidad += cant
    iNode.costo += costo
    iNode.registros.push(reg)
    if (!iNode.descripcion && reg.item_descripcion) {
      iNode.descripcion = String(reg.item_descripcion).trim()
    }
    if (!iNode.unidad && reg.unidad) iNode.unidad = String(reg.unidad).trim()
    // Conservar VU si ya hay uno; si el primero era 0 y llega otro, actualizar.
    if (!(iNode.vlr_unitario > 0) && vu > 0) iNode.vlr_unitario = vu
  }

  const tramos = [...byTramo.values()]
    .map((t) => {
      const capitulos = [...t.capitulos.values()]
        .map((c) => {
          const items = [...c.items.values()]
            .map((it) => {
              const regs = [...it.registros].sort((a, b) => {
                const nr = (Number(a.numero_reporte) || 0) - (Number(b.numero_reporte) || 0)
                if (nr) return nr
                return (Number(a.numero_registro) || 0) - (Number(b.numero_registro) || 0)
              })
              return {
                ...it,
                key: `${t.tramo}\u0001${c.capitulo}\u0001${it.item_numero}`,
                registros: regs,
                validacion: sicoeContarValidacionItem(regs, nivelesActivos),
                cantidad: Math.round(it.cantidad * 1000) / 1000,
                costo: Math.round(it.costo),
              }
            })
            .sort((a, b) => _cmpStr(a.item_numero, b.item_numero))
          return {
            key: `${t.tramo}\u0001${c.capitulo}`,
            capitulo: c.capitulo,
            cantidad: Math.round(c.cantidad * 1000) / 1000,
            costo: Math.round(c.costo),
            items,
          }
        })
        .sort((a, b) => _cmpStr(a.capitulo, b.capitulo))
      return {
        key: t.tramo,
        tramo: t.tramo,
        cantidad: Math.round(t.cantidad * 1000) / 1000,
        costo: Math.round(t.costo),
        capitulos,
      }
    })
    .sort((a, b) => _cmpStr(a.tramo, b.tramo))

  let totalCantidad = 0
  let totalCosto = 0
  for (const t of tramos) {
    totalCantidad += t.cantidad
    totalCosto += t.costo
  }

  return {
    tramos,
    totalCantidad: Math.round(totalCantidad * 1000) / 1000,
    totalCosto: Math.round(totalCosto),
    totalRegistros: (registros || []).filter((r) => String(r?.item_numero || '').trim()).length,
    totalItems: tramos.reduce((n, t) => n + t.capitulos.reduce((m, c) => m + c.items.length, 0), 0),
  }
}

/**
 * Filas planas para Excel: subtotales de tramo/capítulo/ítem + opcional detalle de registros.
 * `incluirRegistros=false` → solo niveles agregados (como vista recogida).
 */
export function sicoeFilasExcelEjecucion(arbol, { verEco = true, incluirRegistros = true } = {}) {
  const headers = [
    'Nivel',
    'Tramo',
    'Capítulo',
    'Ítem',
    'Descripción',
    'Und',
    ...(verEco ? ['Vlr unitario'] : []),
    'Cantidad',
    ...(verEco ? ['Costo Directo'] : []),
    'Validación',
    'N° Reporte',
    'N° Registro',
  ]
  const rows = []
  for (const t of arbol?.tramos || []) {
    rows.push([
      'Tramo',
      t.tramo,
      '',
      '',
      '',
      '',
      ...(verEco ? [''] : []),
      t.cantidad,
      ...(verEco ? [t.costo] : []),
      '',
      '',
      '',
    ])
    for (const c of t.capitulos || []) {
      rows.push([
        'Capítulo',
        t.tramo,
        c.capitulo,
        '',
        '',
        '',
        ...(verEco ? [''] : []),
        c.cantidad,
        ...(verEco ? [c.costo] : []),
        '',
        '',
        '',
      ])
      for (const it of c.items || []) {
        const valTxt = (it.validacion?.chips || [])
          .map((ch) => `${ch.count}× ${ch.estado}${ch.nivel != null ? ` N${ch.nivel}` : ''}`)
          .join('; ')
        rows.push([
          'Ítem',
          t.tramo,
          c.capitulo,
          it.item_numero,
          it.descripcion,
          it.unidad,
          ...(verEco ? [it.vlr_unitario || ''] : []),
          it.cantidad,
          ...(verEco ? [it.costo] : []),
          valTxt,
          '',
          '',
        ])
        if (incluirRegistros) {
          for (const r of it.registros || []) {
            const chip = chipValidacionNivel(r)
            rows.push([
              'Registro',
              t.tramo,
              c.capitulo,
              it.item_numero,
              it.descripcion,
              it.unidad,
              ...(verEco ? [r._vu_efectivo ?? it.vlr_unitario ?? ''] : []),
              r._cant_efectiva ?? r.cantidad_total ?? '',
              ...(verEco ? [r._costo_efectivo ?? ''] : []),
              `${chip.estado}${chip.nivel != null ? ` N${chip.nivel}` : ''}`,
              r.numero_reporte ?? '',
              r.numero_registro ?? '',
            ])
          }
        }
      }
    }
  }
  rows.push([
    'TOTAL',
    '',
    '',
    '',
    '',
    '',
    ...(verEco ? [''] : []),
    arbol?.totalCantidad ?? 0,
    ...(verEco ? [arbol?.totalCosto ?? 0] : []),
    '',
    '',
    '',
  ])
  return { headers, rows }
}
