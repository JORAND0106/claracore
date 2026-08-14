import { useMemo, useState, useEffect } from 'react'
import { formatCOP } from '../../utils/formatCOP'
import {
  pptoConstruirTramosUnicos,
  pptoFiltrarTramosUnicos,
  pptoFilasDeTramo,
} from './pptoTramoBusqueda'

const cc = {
  caption: 'var(--cc-caption)',
  sm: 'var(--cc-sm)',
  label: 'var(--cc-label)',
  md: 'var(--cc-md)',
  pad: 'var(--cc-space-3)',
  padSm: 'var(--cc-space-2)',
}

/**
 * Tab Tramos de edición masiva — misma lógica que el botón «Tramos»:
 * pares `no_inicio → no_final` sobre registros cargados con fObra
 * (`pptoEp().list` / conteo), luego lista → detalle.
 */
export default function PptoEdicionMasivaTramosPanel({
  t,
  filasFuente = [],
  cargando = false,
  meta = null,
  esSellado,
  tramoSelec,
  onSelectTramo,
  tramosSelIds,
  setTramosSelIds,
  editCompetenciaTramos,
  setEditCompetenciaTramos,
  competenciasOpciones = [],
  busy = false,
  onAplicar,
}) {
  const [busqueda, setBusqueda] = useState('')

  const tramosUnicos = useMemo(
    () => pptoConstruirTramosUnicos(filasFuente),
    [filasFuente],
  )

  const tramosFiltrados = useMemo(
    () => pptoFiltrarTramosUnicos(tramosUnicos, busqueda),
    [tramosUnicos, busqueda],
  )

  const filasTramo = useMemo(
    () => pptoFilasDeTramo(filasFuente, tramoSelec),
    [filasFuente, tramoSelec],
  )

  const filasTramoEditables = useMemo(
    () => filasTramo.filter((r) => !(typeof esSellado === 'function' && esSellado(r))),
    [filasTramo, esSellado],
  )

  const tramoIdx = useMemo(() => {
    if (!tramoSelec) return -1
    return tramosUnicos.findIndex(
      (tr) => tr.no_inicio === tramoSelec.no_inicio && tr.no_final === tramoSelec.no_final,
    )
  }, [tramosUnicos, tramoSelec])

  useEffect(() => {
    if (!tramoSelec) {
      setTramosSelIds(new Set())
      return
    }
    const valid = new Set(filasTramoEditables.map((r) => r.id))
    setTramosSelIds((prev) => {
      const next = new Set()
      for (const id of prev) {
        if (valid.has(id)) next.add(id)
      }
      return next
    })
  }, [tramoSelec, filasTramoEditables, setTramosSelIds])

  const irRelativo = (delta) => {
    if (tramoIdx < 0) return
    const dest = tramosUnicos[tramoIdx + delta]
    if (!dest) return
    setBusqueda('')
    onSelectTramo(dest)
  }

  const idsEditables = filasTramoEditables.map((r) => r.id)
  const todosSel = idsEditables.length > 0 && idsEditables.every((id) => tramosSelIds.has(id))

  const navBtn = (disabled) => ({
    background: disabled ? t.bg : t.bgCard,
    border: `1px solid ${disabled ? t.border : t.primary + '55'}`,
    borderRadius: 8,
    padding: '5px 12px',
    fontSize: cc.sm,
    fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer',
    color: disabled ? t.textMuted : t.primary,
    opacity: disabled ? 0.45 : 1,
    whiteSpace: 'nowrap',
  })

  if (cargando) {
    return (
      <div style={{
        padding: 28,
        textAlign: 'center',
        color: t.textMuted,
        fontSize: cc.sm,
        background: t.bg,
        borderRadius: 10,
        border: `1px dashed ${t.border}`,
      }}>
        Cargando tramos con los filtros activos de la obra…
      </div>
    )
  }

  // ── Vista lista ──────────────────────────────────────────────────────────
  if (!tramoSelec) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: cc.sm, fontWeight: 800, color: t.text, letterSpacing: 0.3 }}>
            TRAMOS DISPONIBLES
            <span style={{
              marginLeft: 8,
              background: t.primary + '22',
              color: t.primary,
              borderRadius: 20,
              padding: '2px 10px',
              fontSize: cc.sm,
              fontWeight: 700,
            }}>
              {tramosUnicos.length}
            </span>
          </div>
          {meta?.cap && (
            <div style={{ fontSize: cc.caption, color: t.textMuted }}>
              Cap: {meta.cap}
              {meta.fuente === 'api' ? ' · filtros fObra' : ''}
            </div>
          )}
        </div>

        <p style={{ margin: 0, fontSize: cc.caption, color: t.textMuted, lineHeight: 1.45 }}>
          Misma lógica que el botón Tramos: pares nodo inicio → nodo fin sobre los registros
          del capítulo con los filtros activos de la obra.
        </p>

        {meta?.aviso && (
          <div style={{ fontSize: cc.caption, color: '#D97706', background: '#FEF9C3', borderRadius: 8, padding: '8px 10px' }}>
            {meta.aviso}
          </div>
        )}
        {meta?.error && (
          <div style={{ fontSize: cc.caption, color: '#B91C1C', background: '#FEE2E2', borderRadius: 8, padding: '8px 10px' }}>
            {meta.error}
          </div>
        )}

        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: cc.label,
            pointerEvents: 'none',
          }}>
            🔍
          </span>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nodo inicio o fin…"
            style={{
              width: '100%',
              background: t.inputBg,
              border: `1.5px solid ${busqueda ? t.primary : t.border}`,
              borderRadius: 10,
              padding: '9px 12px 9px 32px',
              color: t.text,
              fontSize: cc.sm,
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
        </div>

        {tramosUnicos.length === 0 ? (
          <div style={{
            padding: 20,
            textAlign: 'center',
            color: t.textMuted,
            fontSize: cc.sm,
            fontStyle: 'italic',
            background: t.bg,
            borderRadius: 10,
            border: `1px dashed ${t.border}`,
          }}>
            No hay tramos definidos en este capítulo
          </div>
        ) : tramosFiltrados.length === 0 ? (
          <div style={{
            padding: 16,
            textAlign: 'center',
            color: t.textMuted,
            fontSize: cc.sm,
            fontStyle: 'italic',
          }}>
            Sin coincidencias para «{busqueda.trim()}».
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 320, overflowY: 'auto' }}>
            {tramosFiltrados.map((tr) => {
              const nRegs = pptoFilasDeTramo(filasFuente, tr).length
              return (
                <div
                  key={tr.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setBusqueda('')
                    onSelectTramo(tr)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setBusqueda('')
                      onSelectTramo(tr)
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    background: t.bg,
                    border: `1.5px solid ${t.border}`,
                    transition: 'all .15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = t.primary
                    e.currentTarget.style.background = t.primary + '0D'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = t.border
                    e.currentTarget.style.background = t.bg
                  }}
                >
                  <div style={{ fontSize: cc.sm, fontWeight: 700, color: t.text }}>{tr.label}</div>
                  <div style={{ fontSize: cc.caption, color: t.textMuted, fontWeight: 600 }}>
                    {nRegs} reg.
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Vista detalle ────────────────────────────────────────────────────────
  const puedeAplicar = tramosSelIds.size > 0 && !!String(editCompetenciaTramos || '').trim() && !busy

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        flexWrap: 'wrap',
      }}>
        <button
          type="button"
          onClick={() => onSelectTramo(null)}
          style={{
            background: 'transparent',
            border: `1px solid ${t.border}`,
            borderRadius: 7,
            padding: '5px 12px',
            fontSize: cc.sm,
            cursor: 'pointer',
            color: t.textMuted,
          }}
        >
          ← Volver a tramos
        </button>
        {tramosUnicos.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              disabled={tramoIdx <= 0}
              onClick={() => irRelativo(-1)}
              style={navBtn(tramoIdx <= 0)}
            >
              ‹ Anterior
            </button>
            <span style={{ fontSize: cc.caption, color: t.textMuted, fontWeight: 600, whiteSpace: 'nowrap' }}>
              {tramoIdx + 1} / {tramosUnicos.length}
            </span>
            <button
              type="button"
              disabled={tramoIdx < 0 || tramoIdx >= tramosUnicos.length - 1}
              onClick={() => irRelativo(1)}
              style={navBtn(tramoIdx < 0 || tramoIdx >= tramosUnicos.length - 1)}
            >
              Siguiente ›
            </button>
          </div>
        )}
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: cc.md, fontWeight: 800, color: t.primary }}>
            {tramoSelec.label}
          </div>
          <div style={{ fontSize: cc.caption, color: t.textMuted, marginTop: 2 }}>
            {filasTramo.length} registro{filasTramo.length !== 1 ? 's' : ''}
            {' · '}
            {tramosSelIds.size} seleccionado{tramosSelIds.size !== 1 ? 's' : ''}
            {filasTramo.length !== filasTramoEditables.length
              ? ` · ${filasTramo.length - filasTramoEditables.length} sellado(s)`
              : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setTramosSelIds((prev) => {
              const next = new Set(prev)
              if (todosSel) idsEditables.forEach((id) => next.delete(id))
              else idsEditables.forEach((id) => next.add(id))
              return next
            })
          }}
          disabled={!idsEditables.length}
          style={{
            background: t.bgCard,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: cc.caption,
            fontWeight: 700,
            color: t.primary,
            cursor: idsEditables.length ? 'pointer' : 'default',
            opacity: idsEditables.length ? 1 : 0.5,
          }}
        >
          {todosSel ? 'Deseleccionar todos' : 'Seleccionar todos'}
        </button>
      </div>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        alignItems: 'flex-end',
        padding: cc.padSm,
        background: t.bg,
        borderRadius: 10,
        border: `1px solid ${t.border}`,
      }}>
        <div style={{ flex: '1 1 220px' }}>
          <div style={{
            fontSize: cc.caption,
            fontWeight: 700,
            color: t.textMuted,
            marginBottom: 6,
            letterSpacing: 0.3,
          }}>
            NUEVA COMPETENCIA
          </div>
          <select
            value={editCompetenciaTramos}
            onChange={(e) => setEditCompetenciaTramos(e.target.value)}
            disabled={busy}
            style={{
              width: '100%',
              background: t.inputBg,
              border: `1.5px solid ${editCompetenciaTramos ? t.primary : t.border}`,
              borderRadius: 9,
              padding: '9px 12px',
              color: t.text,
              fontSize: cc.sm,
              cursor: 'pointer',
            }}
          >
            <option value="">— Seleccione —</option>
            {(competenciasOpciones || []).map((c) => {
              const val = typeof c === 'string' ? c : (c?.value ?? c?.nombre ?? '')
              const lab = typeof c === 'string' ? c : (c?.label ?? c?.nombre ?? val)
              return <option key={val} value={val}>{lab}</option>
            })}
          </select>
        </div>
        <button
          type="button"
          onClick={() => onAplicar?.()}
          disabled={!puedeAplicar}
          style={{
            background: puedeAplicar ? t.primary : t.bgCard,
            color: puedeAplicar ? '#fff' : t.textMuted,
            border: puedeAplicar ? 'none' : `1px solid ${t.border}`,
            borderRadius: 9,
            padding: '10px 18px',
            fontWeight: 700,
            fontSize: cc.sm,
            cursor: puedeAplicar ? 'pointer' : 'not-allowed',
            opacity: busy ? 0.7 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {busy ? 'Aplicando…' : 'Aplicar a seleccionados'}
        </button>
      </div>

      {filasTramo.length === 0 ? (
        <div style={{
          padding: cc.pad,
          background: t.bg,
          borderRadius: 10,
          border: `1px dashed ${t.border}`,
          color: t.textMuted,
          fontSize: cc.sm,
        }}>
          No hay registros en este tramo.
        </div>
      ) : (
        <div style={{
          border: `1px solid ${t.border}`,
          borderRadius: 10,
          overflow: 'hidden',
          background: t.bgCard,
        }}>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: cc.sm }}>
              <thead>
                <tr style={{ background: t.bg, position: 'sticky', top: 0, zIndex: 1 }}>
                  {[
                    { h: '', align: 'left' },
                    { h: 'ID_POL', align: 'left' },
                    { h: 'Ítem', align: 'left' },
                    { h: 'Descripción', align: 'left' },
                    { h: 'Cantidad', align: 'right' },
                    { h: 'Costo Directo', align: 'right' },
                    { h: 'Competencia actual', align: 'left' },
                  ].map(({ h, align }) => (
                    <th
                      key={h || 'chk'}
                      style={{
                        padding: `${cc.padSm} 10px`,
                        textAlign: align,
                        color: t.textMuted,
                        fontWeight: 700,
                        fontSize: cc.caption,
                        borderBottom: `1px solid ${t.border}`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filasTramo.map((r) => {
                  const sellado = typeof esSellado === 'function' && esSellado(r)
                  const checked = tramosSelIds.has(r.id)
                  return (
                    <tr
                      key={r.id}
                      style={{
                        borderBottom: `1px solid ${t.border}`,
                        opacity: sellado ? 0.55 : 1,
                      }}
                    >
                      <td style={{ padding: `${cc.padSm} 10px`, width: 36 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={sellado}
                          title={sellado ? 'Registro sellado' : undefined}
                          onChange={() => {
                            if (sellado) return
                            setTramosSelIds((prev) => {
                              const next = new Set(prev)
                              if (next.has(r.id)) next.delete(r.id)
                              else next.add(r.id)
                              return next
                            })
                          }}
                          style={{ width: 16, height: 16, accentColor: t.primary, cursor: sellado ? 'not-allowed' : 'pointer' }}
                        />
                      </td>
                      <td
                        style={{
                          padding: `${cc.padSm} 10px`,
                          color: t.text,
                          fontFamily: 'ui-monospace, monospace',
                          fontSize: cc.caption,
                          fontWeight: 600,
                          maxWidth: 140,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={String(r.id_pol || r.pk_id || '')}
                      >
                        {r.id_pol || r.pk_id || '—'}
                      </td>
                      <td style={{ padding: `${cc.padSm} 10px`, color: t.text, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {r.item || '—'}
                      </td>
                      <td
                        style={{
                          padding: `${cc.padSm} 10px`,
                          color: t.textMuted,
                          maxWidth: 220,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={r.descripcion || ''}
                      >
                        {r.descripcion || '—'}
                      </td>
                      <td style={{ padding: `${cc.padSm} 10px`, textAlign: 'right', color: t.text }}>
                        {r.cant_total != null
                          ? Number(r.cant_total).toLocaleString('es-CO', { maximumFractionDigits: 2 })
                          : '—'}
                      </td>
                      <td style={{ padding: `${cc.padSm} 10px`, textAlign: 'right', color: t.text }}>
                        {r.costo_directo != null ? formatCOP(r.costo_directo) : '—'}
                      </td>
                      <td style={{ padding: `${cc.padSm} 10px`, color: t.text }}>
                        {r.competencia || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
