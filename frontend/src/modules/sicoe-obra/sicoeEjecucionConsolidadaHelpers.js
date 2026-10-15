/**
 * Vista consolidada tipo informe mensual de ejecución:
 * Tramo → Capítulo → Ítem (subtotales) → registros al expandir.
 * Cantidad / costo: mismas reglas que CPI / informe (round2(cant)×VU → round0).
 * Capítulo de agrupación: capitulo_efectivo del ítem (listado), no el del reporte.
 */
import { costoDirectoDesdeListado, vuEfectivoFila } from './sicoeCantidadesPorItemHelpers.js'
import { chipValidacionNivel } from './sicoeCantidadesGrillaHelpers.js'

export function sicoeTramoLabel(tramo) {
  const s = String(tramo || '').trim()
  return s || 'Sin tramo'
}

/** Capítulo de agrupación: efectivo del listado si viene; si no, el guardado. */
export function sicoeCapituloEfectivoLabel(reg) {
  const eff = String(reg?.capitulo_efectivo || '').trim()
  if (eff) return eff
  const raw = String(reg?.capitulo || '').trim()
  return raw || 'Sin capítulo'
}

export function sicoeClaveItemEjecucion(reg) {
  return [
    sicoeTramoLabel(reg?.tramo),
    sicoeCapituloEfectivoLabel(reg),
    String(reg?.item_numero || '').trim() || 'Sin ítem',
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
 * Agrupa por capítulo efectivo del ítem. Incluye registros sin ítem (para cuadrar
 * con el encabezado del panel /analisis).
 */
export function sicoeConstruirArbolEjecucion(registros, {
  nivelesActivos = [1, 2, 3],
  payloadVu = null,
} = {}) {
  const byTramo = new Map()

  for (const raw of registros || []) {
    const { vu, cant, costo } = sicoeRegistroCostoEfectivo(raw, payloadVu)
    const capitulo = sicoeCapituloEfectivoLabel(raw)
    const item = String(raw?.item_numero || '').trim() || 'Sin ítem'
    const sinPrecio = !!raw?.sin_precio_listado || (item !== 'Sin ítem' && !(vu > 0))
    const reg = {
      ...raw,
      _vu_efectivo: vu,
      _cant_efectiva: cant,
      _costo_efectivo: costo,
      _capitulo_efectivo: capitulo,
      _sin_precio_listado: sinPrecio,
    }

    const tramo = sicoeTramoLabel(reg.tramo)

    if (!byTramo.has(tramo)) {
      byTramo.set(tramo, { tramo, cantidad: 0, costo: 0, capitulos: new Map() })
    }
    const tNode = byTramo.get(tramo)

    if (!tNode.capitulos.has(capitulo)) {
      tNode.capitulos.set(capitulo, { capitulo, cantidad: 0, costo: 0, items: new Map() })
    }
    const cNode = tNode.capitulos.get(capitulo)

    const itemKey = item
    if (!cNode.items.has(itemKey)) {
      cNode.items.set(itemKey, {
        item_numero: item,
        descripcion: String(reg.item_descripcion || '').trim(),
        unidad: String(reg.unidad || '').trim(),
        vlr_unitario: vu,
        sin_precio_listado: sinPrecio,
        cantidad: 0,
        costo: 0,
        registros: [],
      })
    }
    const iNode = cNode.items.get(itemKey)
    iNode.registros.push(reg)
    if (!iNode.descripcion && reg.item_descripcion) {
      iNode.descripcion = String(reg.item_descripcion).trim()
    }
    if (!iNode.unidad && reg.unidad) iNode.unidad = String(reg.unidad).trim()
    if (!(iNode.vlr_unitario > 0) && vu > 0) iNode.vlr_unitario = vu
    if (sinPrecio) iNode.sin_precio_listado = true
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
              // Canónico panel /analisis: ROUND0(ROUND(Σcant,2)×VU) por ítem.
              const cantSum = regs.reduce((s, r) => s + _num(r._cant_efectiva), 0)
              const cant = Math.round(cantSum * 100) / 100
              const vu = it.vlr_unitario > 0 ? it.vlr_unitario : 0
              const costo = it.sin_precio_listado || !(vu > 0)
                ? 0
                : costoDirectoDesdeListado(cant, vu)
              return {
                ...it,
                key: `${t.tramo}\u0001${c.capitulo}\u0001${it.item_numero}`,
                registros: regs,
                validacion: sicoeContarValidacionItem(regs, nivelesActivos),
                cantidad: cant,
                costo,
              }
            })
            .sort((a, b) => {
              if (a.item_numero === 'Sin ítem') return 1
              if (b.item_numero === 'Sin ítem') return -1
              return _cmpStr(a.item_numero, b.item_numero)
            })
          const cantidad = Math.round(items.reduce((s, it) => s + it.cantidad, 0) * 1000) / 1000
          const costo = Math.round(items.reduce((s, it) => s + it.costo, 0))
          return {
            key: `${t.tramo}\u0001${c.capitulo}`,
            capitulo: c.capitulo,
            cantidad,
            costo,
            items,
          }
        })
        .sort((a, b) => _cmpStr(a.capitulo, b.capitulo))
      const cantidad = Math.round(capitulos.reduce((s, c) => s + c.cantidad, 0) * 1000) / 1000
      const costo = Math.round(capitulos.reduce((s, c) => s + c.costo, 0))
      return {
        key: t.tramo,
        tramo: t.tramo,
        cantidad,
        costo,
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

  const totalRegistros = (registros || []).length
  const itemsSinPrecio = []
  for (const t of tramos) {
    for (const c of t.capitulos) {
      for (const it of c.items) {
        if (it.sin_precio_listado && it.item_numero !== 'Sin ítem') {
          itemsSinPrecio.push({
            tramo: t.tramo,
            capitulo: c.capitulo,
            item: it.item_numero,
            nRegs: (it.registros || []).length,
          })
        }
      }
    }
  }

  return {
    tramos,
    totalCantidad: Math.round(totalCantidad * 1000) / 1000,
    totalCosto: Math.round(totalCosto),
    totalRegistros,
    totalItems: tramos.reduce((n, t) => n + t.capitulos.reduce((m, c) => m + c.items.length, 0), 0),
    itemsSinPrecio,
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
    ...(verEco ? ['Sin precio listado'] : []),
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
      ...(verEco ? [''] : []),
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
        ...(verEco ? [''] : []),
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
          ...(verEco ? [it.sin_precio_listado ? '' : (it.vlr_unitario || '')] : []),
          it.cantidad,
          ...(verEco ? [it.sin_precio_listado ? '' : it.costo] : []),
          valTxt,
          '',
          '',
          ...(verEco ? [it.sin_precio_listado ? 'Sí' : ''] : []),
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
              ...(verEco ? [r._sin_precio_listado ? '' : (r._vu_efectivo ?? it.vlr_unitario ?? '')] : []),
              r._cant_efectiva ?? r.cantidad_total ?? '',
              ...(verEco ? [r._sin_precio_listado ? '' : (r._costo_efectivo ?? '')] : []),
              `${chip.estado}${chip.nivel != null ? ` N${chip.nivel}` : ''}`,
              r.numero_reporte ?? '',
              r.numero_registro ?? '',
              ...(verEco ? [r._sin_precio_listado ? 'Sí' : ''] : []),
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
    ...(verEco ? [''] : []),
  ])
  return { headers, rows }
}
