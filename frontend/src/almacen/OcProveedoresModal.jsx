import { useMemo, useState } from 'react'
import { fmtCant, fmtMoney, useAlmacenTheme } from './almacenShared'
import {
  itemIdsDeGrupos,
  totalProveedoresSeleccionados,
} from './ocProveedoresSeleccion'

/**
 * Antes de generar: elige con qué proveedores se crea la OC.
 * Quien no ve valores económicos ve el listado sin cifras.
 */
export default function OcProveedoresModal({
  grupos = [],
  sinInsumoCount = 0,
  verEconomicos = true,
  busy = false,
  onCancel,
  onConfirm,
}) {
  const ui = useAlmacenTheme()
  const [marcados, setMarcados] = useState(() => grupos.map((g) => g.key))
  const [abiertos, setAbiertos] = useState({})

  const total = useMemo(
    () => totalProveedoresSeleccionados(grupos, marcados),
    [grupos, marcados],
  )
  const todos = grupos.length > 0 && marcados.length === grupos.length

  const toggle = (key) => {
    setMarcados((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  const confirmar = () => {
    const ids = itemIdsDeGrupos(grupos, marcados)
    if (!ids.length) return
    onConfirm?.(ids)
  }

  return (
    <div
      data-testid="oc-proveedores"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100058,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (!busy) onCancel?.()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="oc-proveedores-titulo"
        onClick={(e) => e.stopPropagation()}
        style={{
          ...ui.card,
          width: 'min(720px, 100%)',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: 20,
        }}
      >
        <div id="oc-proveedores-titulo" style={{ fontWeight: 800, fontSize: 'var(--cc-title)', marginBottom: 6 }}>
          Proveedores de la orden de compra
        </div>
        <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginBottom: 12 }}>
          Se genera una OC por cada proveedor marcado. Los que queden sin marcar no generan orden y se pueden generar después.
        </div>
        {sinInsumoCount > 0 && (
          <div style={{ marginBottom: 12, fontSize: 'var(--cc-sm)', color: '#92400e' }}>
            {sinInsumoCount} línea(s) sin insumo del catálogo no entran en esta selección.
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button
            type="button"
            style={ui.btnSecondary}
            disabled={busy || !grupos.length}
            data-testid="oc-proveedores-todos"
            onClick={() => setMarcados(todos ? [] : grupos.map((g) => g.key))}
          >
            {todos ? 'Desmarcar todos' : 'Marcar todos'}
          </button>
        </div>
        {grupos.length === 0 ? (
          <div style={{ color: ui.textMuted, fontSize: 'var(--cc-sm)' }}>
            No hay proveedores pendientes de generar.
          </div>
        ) : grupos.map((g) => {
          const abierto = Boolean(abiertos[g.key])
          return (
            <div key={g.key} style={{ borderTop: `1px solid ${ui.textMuted}33`, padding: '10px 0' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <input
                  type="checkbox"
                  checked={marcados.includes(g.key)}
                  disabled={busy}
                  aria-label={g.nombre}
                  data-testid="oc-proveedor-check"
                  onChange={() => toggle(g.key)}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{g.nombre}</div>
                  <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
                    {g.lineas.length} línea(s)
                    {verEconomicos ? ` · ${fmtMoney(g.total)} con IVA` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  style={{ ...ui.btnSecondary, padding: '2px 8px' }}
                  onClick={() => setAbiertos((prev) => ({ ...prev, [g.key]: !prev[g.key] }))}
                >
                  {abierto ? 'Ocultar' : 'Ver líneas'}
                </button>
              </div>
              {abierto && (
                <table style={{ width: '100%', marginTop: 8, fontSize: 'var(--cc-sm)' }}>
                  <thead>
                    <tr>
                      <th style={ui.th}>Insumo</th>
                      <th style={ui.th}>Cant.</th>
                      {verEconomicos && <th style={ui.th}>V. unit.</th>}
                      {verEconomicos && <th style={ui.th}>Valor</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {g.lineas.map((linea) => (
                      <tr key={linea.id}>
                        <td style={ui.td}>{linea.insumo}</td>
                        <td style={ui.td}>{fmtCant(linea.cantidad)} {linea.unidad}</td>
                        {verEconomicos && <td style={ui.td}>{fmtMoney(linea.valorUnitario)}</td>}
                        {verEconomicos && <td style={ui.td}>{linea.valorLinea == null ? '—' : fmtMoney(linea.valorLinea)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )
        })}
        {verEconomicos && (
          <div
            data-testid="oc-proveedores-total"
            style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontWeight: 800 }}
          >
            <span>Total de los proveedores seleccionados</span>
            <span>{fmtMoney(total)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" style={ui.btnSecondary} disabled={busy} onClick={() => onCancel?.()}>
            Cancelar
          </button>
          <button
            type="button"
            style={ui.btnPrimary}
            data-testid="oc-proveedores-confirmar"
            disabled={busy || marcados.length === 0}
            onClick={confirmar}
          >
            {busy ? 'Generando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
