/**
 * Estante de libros Vías: un libro = tramo con diseño geométrico cargado.
 * Dentro: capas de la estructura y entregas por capa (grilla tipo Excel).
 */
import { useMemo } from 'react'
import TopoExcelSheet from './TopoExcelSheet'
import { topoSheetStyles } from './topoSheetStyles'
import { useTopoTheme } from './topografiaShared'

const COVER = ['#0e7490', '#0369a1', '#1d4ed8', '#4338ca', '#0f766e', '#b45309']

function fmtN(v, dec = 2) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(dec) : '—'
}

function IconBtn({ title, onClick, disabled, children, danger }) {
  const ui = useTopoTheme()
  const border = ui.t?.border || '#cbd5e1'
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'transparent',
        color: danger ? '#dc2626' : ui.text,
        border: `1px solid ${danger ? '#fca5a5' : border}`,
        borderRadius: 8,
        width: 36,
        height: 36,
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  )
}

export function agruparEntregasPorEjeYCapa(lista, ejes) {
  const byEje = new Map()
  ejes.forEach((e) => {
    byEje.set(e.id, {
      eje: e,
      capas: new Map(),
      entregas: [],
    })
  })
  ;(lista || []).forEach((ent) => {
    const bucket = byEje.get(ent.eje_id) || {
      eje: { id: ent.eje_id, nombre: ent.eje_nombre || 'Tramo' },
      capas: new Map(),
      entregas: [],
    }
    bucket.entregas.push(ent)
    const idx = String(ent.indice_capa ?? 0)
    const nombre = ent.capa_nombre || `Capa ${idx}`
    if (!bucket.capas.has(idx)) {
      bucket.capas.set(idx, { indice: Number(idx), nombre, entregas: [] })
    }
    bucket.capas.get(idx).entregas.push(ent)
    byEje.set(ent.eje_id, bucket)
  })
  return [...byEje.values()].sort((a, b) =>
    String(a.eje?.nombre || '').localeCompare(String(b.eje?.nombre || ''), 'es'),
  )
}

export default function ViasLibrosVista({
  ejes = [],
  lista = [],
  libroId = null,
  onAbrirLibro,
  onCerrarLibro,
  onNuevaEntrega,
  onAbrirEntrega,
  onEliminarEntrega,
  canCreate,
  canDelete,
}) {
  const ui = useTopoTheme()
  const sheet = useMemo(() => topoSheetStyles(ui.t), [ui.t])
  const libros = useMemo(() => agruparEntregasPorEjeYCapa(lista, ejes), [lista, ejes])
  const libro = libroId ? libros.find((l) => l.eje.id === libroId) : null

  if (!libroId) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <h3 style={{ margin: 0, flex: 1, fontSize: 'var(--cc-lg)', color: ui.text }}>Vías</h3>
          <p style={{ margin: 0, fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
            Cada libro es un tramo con diseño geométrico cargado
          </p>
        </div>
        {!libros.length ? (
          <div style={{
            textAlign: 'center', padding: '40px 16px', color: ui.textMuted,
            border: `1px dashed ${ui.t?.border || '#cbd5e1'}`, borderRadius: 16,
            fontSize: 'var(--cc-sm)',
          }}>
            No hay tramos con diseño cargado. Complete Configuración DG (estructura + rasante) para ver libros aquí.
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 20,
            padding: '8px 4px',
          }}>
            {libros.map((l, i) => {
              const cover = COVER[i % COVER.length]
              const nEnt = l.entregas.length
              const abs = l.eje.abscisa_inicio != null
                ? `${fmtN(l.eje.abscisa_inicio)} – ${fmtN(l.eje.abscisa_fin)}`
                : ''
              return (
                <button
                  key={l.eje.id}
                  type="button"
                  title={`Abrir libro ${l.eje.nombre || 'Tramo'}`}
                  aria-label={`Abrir libro ${l.eje.nombre || 'Tramo'}`}
                  onClick={() => onAbrirLibro?.(l.eje.id)}
                  style={{
                    width: '100%',
                    aspectRatio: '3 / 4',
                    maxWidth: 170,
                    border: 'none',
                    borderRadius: '4px 10px 10px 4px',
                    cursor: 'pointer',
                    background: `linear-gradient(90deg, ${cover} 0 10px, ${cover}dd 10px)`,
                    boxShadow: '4px 6px 14px rgba(0,0,0,0.22)',
                    color: '#fffef5',
                    fontWeight: 800,
                    fontSize: 14,
                    padding: '18px 14px 14px 20px',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                  }}
                >
                  <span style={{ wordBreak: 'break-word', lineHeight: 1.25, textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}>
                    {l.eje.nombre || 'Tramo'}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.92 }}>
                    {abs ? `${abs} · ` : ''}{nEnt} entrega{nEnt === 1 ? '' : 's'}
                  </span>
                  <span aria-hidden style={{
                    position: 'absolute', left: 0, top: 12, bottom: 12, width: 8,
                    background: 'rgba(0,0,0,0.18)', borderRadius: '2px 0 0 2px',
                  }} />
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  if (!libro) {
    return (
      <div>
        <IconBtn title="Volver a libros" onClick={onCerrarLibro}>←</IconBtn>
        <p style={{ color: ui.textMuted }}>Libro no encontrado.</p>
      </div>
    )
  }

  const capasOrden = [...libro.capas.values()].sort((a, b) => a.indice - b.indice)
  const capasEje = libro.eje.capas_nombres || capasOrden.map((c) => c.nombre)

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <IconBtn title="Volver a libros" onClick={onCerrarLibro}>←</IconBtn>
        <div style={{ flex: 1, minWidth: 160 }}>
          <h3 style={{ margin: 0, fontSize: 'var(--cc-lg)', color: ui.text }}>
            {libro.eje.nombre || 'Tramo'}
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
            Abscisas {fmtN(libro.eje.abscisa_inicio)} – {fmtN(libro.eje.abscisa_fin)}
            {capasEje?.length ? ` · ${capasEje.length} capa(s)` : ''}
          </p>
        </div>
        {canCreate && (
          <IconBtn title="Nueva entrega en este tramo" onClick={() => onNuevaEntrega?.(libro.eje.id)}>
            +
          </IconBtn>
        )}
      </div>

      {capasOrden.length === 0 ? (
        <p style={{ color: ui.textMuted, fontSize: 'var(--cc-sm)' }}>
          Aún no hay entregas en este tramo. Cree una para la capa que desea verificar.
        </p>
      ) : capasOrden.map((capa) => {
        const cols = [
          { key: 'nom', label: 'Entrega' },
          { key: 'rango', label: 'Abscisas', width: 160 },
          { key: 'avance', label: 'Avance', width: 100 },
          { key: 'est', label: 'Estado', width: 140 },
          { key: 'acc', label: '', width: 88 },
        ]
        return (
          <section key={capa.indice} style={{
            marginBottom: 16,
            padding: '12px 14px',
            borderRadius: 12,
            border: `1px solid ${ui.t?.border || '#e2e8f0'}`,
            background: ui.t?.bg || 'transparent',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <h4 style={{ margin: 0, flex: 1, fontSize: 'var(--cc-sm)', color: ui.text, fontWeight: 800 }}>
                {capa.nombre}
              </h4>
              <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
                {capa.entregas.length} entrega(s)
              </span>
            </div>
            <TopoExcelSheet sheet={sheet} columns={cols} minWidth={560}>
              {capa.entregas.map((e) => {
                const tot = e.abscisas_total || e.totales?.abscisas || 0
                const ok = e.abscisas_entregadas ?? e.totales?.entregadas ?? 0
                const parcial = e.abscisas_parciales ?? e.totales?.parciales ?? 0
                const pend = e.abscisas_pendientes ?? e.totales?.pendientes ?? Math.max(0, tot - ok - parcial)
                return (
                  <tr
                    key={e.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onAbrirEntrega?.(e.id)}
                    title={`Abrir entrega ${e.nombre}`}
                  >
                    <td style={sheet.td}>{e.nombre || 'Sin nombre'}</td>
                    <td style={sheet.td}>
                      {fmtN(e.abscisa_desde)} – {fmtN(e.abscisa_hasta)}
                    </td>
                    <td style={sheet.td}>{e.avance_pct ?? 0}%</td>
                    <td style={sheet.td}>
                      {ok} ent. · {parcial} parc. · {pend} pend.
                    </td>
                    <td style={sheet.td} onClick={(ev) => ev.stopPropagation()}>
                      <div style={{ display: 'inline-flex', gap: 4 }}>
                        <IconBtn title="Abrir entrega" onClick={() => onAbrirEntrega?.(e.id)}>↗</IconBtn>
                        {canDelete && (
                          <IconBtn title="Eliminar entrega" danger onClick={() => onEliminarEntrega?.(e)}>
                            ×
                          </IconBtn>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </TopoExcelSheet>
          </section>
        )
      })}
    </div>
  )
}
