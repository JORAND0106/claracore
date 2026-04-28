import { useCallback } from 'react'
import PptoFiltroMapaPk from './PptoFiltroMapaPk'
import { formatCOPShort } from '../../utils/formatCOP'

const inp = (t) => ({
  background: t.inputBg,
  border: `1px solid ${t.border}`,
  borderRadius: 5,
  padding: '3px 6px',
  color: t.text,
  fontSize: 'var(--cc-sm)',
  minWidth: 0,
  lineHeight: 1.25,
})
const lab = (t) => ({
  fontSize: 'var(--cc-caption)',
  fontWeight: 700,
  color: t.textMuted,
  marginBottom: 2,
  lineHeight: 1.2,
})
/** Exactamente 2 filas de controles (+ etiquetas): fila1 = cap…pk + texto; fila2 = ubicación y validación. */
const gridFila1 = {
  display: 'grid',
  gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
  gap: '4px 6px',
  alignItems: 'end',
}
const gridFila2 = {
  display: 'grid',
  gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
  gap: '4px 6px',
  alignItems: 'end',
}

/**
 * Filtro tipo SICOE Obra + panel capítulo→ítem + mapa PK.
 * idPol / PK / texto: campos de servidor distintos (id_pol, pk_id, registro+descripción).
 */
export default function PptoFiltroObraVista({
  t,
  s: _s,
  contratoId,
  token,
  f, // { cap, item, idPol, pkCriterio, texto, tramo, calzada, nodoI, nodoF, absA, absB, eje, revisado, preInterv }
  onF,
  capitulosResumen,
  itemsResumen,
  loadingCapitulos,
  capExpandido,
  onToggleCap,
  onPickItem,
  onBuscar,
  onLimpiar,
  /** Vuelve a cargar el listado del cap/ítem actual sin filtro fino (PK, ID-POL, texto). */
  onRestablecerPksItem,
  onRevisorTramos,
  tramoOptions,
  calzadaOptions,
  semaforo, // SEMAFORO
  /** Conteos / paginación que se muestran arriba a la derecha junto a Buscar, Limpiar, etc. */
  barraResumen,
  buscando,
  /** Recarga datos del contrato/capítulo (equivalente al «Actualizar» del toolbar). */
  onActualizar,
  actualizarDisabled,
  onMapPkPick, // (pk: string) => void — padre: set PK y ejecuta búsqueda
  /** null = maestro completo; array (vacío o no) = solo esos PK (alineado con grilla con cap/ítem) */
  pkIdsDeGrilla,
}) {
  const onPk = useCallback(
    (pkVal) => {
      const v = String(pkVal || '').trim()
      if (!v) return
      if (onMapPkPick) onMapPkPick(v)
    },
    [onMapPkPick]
  )

  const hayFiltroFinoPks = !!(
    (f.pkCriterio && String(f.pkCriterio).trim()) ||
    (f.idPol && String(f.idPol).trim()) ||
    (f.texto && String(f.texto).trim())
  )
  const hayCap = !!(f.cap && String(f.cap).trim())

  return (
    <div
      className="cc-ppo-filtro-obra"
      style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10, alignItems: 'flex-start', fontSize: 'var(--cc-body)' }}
    >
      <div
        style={{
          width: 248,
          flexShrink: 0,
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 8,
          padding: 8,
          maxHeight: 432, /* antes 360px; +20 % para más lista visible */
          overflow: 'auto',
          boxShadow: t.shadow,
        }}
      >
        <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 800, color: t.primary, marginBottom: 6 }}>📂 Presupuesto por capítulo</div>
        {loadingCapitulos ? (
          <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>Cargando…</div>
        ) : !capitulosResumen.length ? (
          <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>Sin capítulos</div>
        ) : (
          capitulosResumen.map((c) => {
            const open = capExpandido === c.capitulo
            return (
              <div key={c.capitulo} style={{ marginBottom: 4 }}>
                <button
                  type="button"
                  onClick={() => onToggleCap(c.capitulo)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: f.cap === c.capitulo ? t.primary + '18' : t.bg,
                    border: `1px solid ${f.cap === c.capitulo ? t.primary : t.border}`,
                    borderRadius: 6,
                    padding: '6px 8px',
                    cursor: 'pointer',
                    fontSize: 'var(--cc-sm)',
                    color: t.text,
                  }}
                >
                  <span style={{ fontWeight: 700 }}>{open ? '▼' : '▶'}</span>{' '}
                  <span style={{ fontWeight: 600 }}>{c.capitulo?.length > 32 ? c.capitulo.slice(0, 32) + '…' : c.capitulo}</span>
                  <div style={{ fontSize: 'var(--cc-label)', color: t.textMuted, marginTop: 2 }}>
                    {(c.total_registros ?? 0).toLocaleString('es-CO')} reg. · {formatCOPShort(c.costo_total)}
                  </div>
                </button>
                {open && (
                  <div style={{ marginLeft: 6, marginTop: 4, borderLeft: `2px solid ${t.border}`, paddingLeft: 8 }}>
                    {!itemsResumen.length ? (
                      <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>Cargando ítems…</div>
                    ) : (
                      itemsResumen.map((it) => (
                        <button
                          type="button"
                          key={it.item}
                          onClick={() => onPickItem(it.item)}
                          title={
                            (it.descripcion && String(it.descripcion).trim())
                              ? `${it.item} · ${String(it.descripcion).trim()}`
                              : String(it.item ?? '')
                          }
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            background: f.item === it.item ? t.primary + '22' : 'transparent',
                            border: 'none',
                            borderRadius: 4,
                            padding: '4px 0',
                            cursor: 'pointer',
                            fontSize: 'var(--cc-sm)',
                            color: t.text,
                          }}
                        >
                          <strong>{it.item}</strong> <span style={{ color: t.textMuted }}>· {formatCOPShort(it.costo_total)}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <div style={{ flex: '1 1 260px', minWidth: 260, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 10px', boxShadow: t.shadow }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 6,
            }}
          >
            <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 800, color: t.text, lineHeight: 1.25, flex: '1 1 200px', minWidth: 0 }}>
              Ubicación técnica y criterios (como SICOE Obra)
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                alignItems: 'center',
                justifyContent: 'flex-end',
                flex: '1 1 240px',
              }}
            >
              {barraResumen != null && (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 'var(--cc-sm)', color: t.textMuted }}>
                  {barraResumen}
                </div>
              )}
              <button
                type="button"
                onClick={onBuscar}
                disabled={buscando}
                style={{
                  background: t.primary,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '5px 14px',
                  fontSize: 'var(--cc-caption)',
                  fontWeight: 700,
                  cursor: buscando ? 'wait' : 'pointer',
                }}
              >
                {buscando ? '⏳…' : '🔍 Buscar'}
              </button>
              <button
                type="button"
                onClick={onLimpiar}
                style={{ background: 'transparent', border: `1px solid ${t.border}`, borderRadius: 6, padding: '5px 10px', color: t.textMuted, fontSize: 'var(--cc-caption)', cursor: 'pointer' }}
              >
                Limpiar
              </button>
              {typeof onActualizar === 'function' && (
                <button
                  type="button"
                  onClick={onActualizar}
                  disabled={!!actualizarDisabled}
                  title="Recarga capítulos y datos del filtro actual"
                  style={{
                    background: 'transparent',
                    border: `1px solid ${t.border}`,
                    borderRadius: 6,
                    padding: '5px 10px',
                    color: t.textMuted,
                    fontSize: 'var(--cc-caption)',
                    fontWeight: 600,
                    cursor: actualizarDisabled ? 'wait' : 'pointer',
                    opacity: actualizarDisabled ? 0.65 : 1,
                  }}
                >
                  🔄 Actualizar
                </button>
              )}
              {onRestablecerPksItem && hayFiltroFinoPks && hayCap && (
                <button
                  type="button"
                  onClick={onRestablecerPksItem}
                  disabled={buscando}
                  style={{
                    background: '#0D948820',
                    border: '1px solid #0D9488',
                    borderRadius: 6,
                    padding: '5px 10px',
                    color: '#0D9488',
                    fontSize: 'var(--cc-caption)',
                    fontWeight: 700,
                    cursor: buscando ? 'wait' : 'pointer',
                  }}
                  title="Quita PK, ID-POL y texto; mantiene capítulo, ítem y tramo/validación. Muestra de nuevo todos los PK del listado filtrado."
                >
                  Ver PK
                </button>
              )}
              <button
                type="button"
                onClick={onRevisorTramos}
                style={{ background: '#0D948820', border: '1px solid #0D9488', borderRadius: 6, padding: '5px 10px', color: '#0D9488', fontSize: 'var(--cc-caption)', fontWeight: 700, cursor: 'pointer' }}
                title="Requiere capítulo; carga el capítulo y abre el revisor de tramos"
              >
                🛣️ Tramos
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={gridFila1}>
              <div style={{ gridColumn: 'span 2' }}>
                <div style={lab(t)}>CAPÍTULO</div>
                <input value={f.cap} onChange={(e) => onF({ cap: e.target.value })} placeholder="Capítulo / panel" title="Capítulo (texto o panel)" style={{ ...inp(t), width: '100%' }} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <div style={lab(t)}>ÍTEM</div>
                <input value={f.item} onChange={(e) => onF({ item: e.target.value })} placeholder="Ítem" style={{ ...inp(t), width: '100%' }} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <div style={lab(t)}>ID-POL</div>
                <input value={f.idPol} onChange={(e) => onF({ idPol: e.target.value })} placeholder="id_pol" title="Campo id_pol" style={{ ...inp(t), width: '100%' }} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <div style={lab(t)}>PK</div>
                <input value={f.pkCriterio} onChange={(e) => onF({ pkCriterio: e.target.value })} placeholder="pk_id" title="Campo pk_id" style={{ ...inp(t), width: '100%' }} />
              </div>
              <div style={{ gridColumn: 'span 4' }}>
                <div style={lab(t)}>Texto (registro / descripción)</div>
                <input
                  value={f.texto}
                  onChange={(e) => onF({ texto: e.target.value })}
                  placeholder="Buscar en registro, descripción…"
                  style={{ ...inp(t), width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={gridFila2}>
              <div>
                <div style={lab(t)}>TRAMO</div>
                <select value={f.tramo} onChange={(e) => onF({ tramo: e.target.value })} title="Maestro PK" style={{ ...inp(t), width: '100%' }}>
                  <option value="">— Todos —</option>
                  {(tramoOptions || []).map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div style={lab(t)}>CALZADA</div>
                <select value={f.calzada} onChange={(e) => onF({ calzada: e.target.value })} title="Maestro PK" style={{ ...inp(t), width: '100%' }}>
                  <option value="">— Todos —</option>
                  {(calzadaOptions || []).map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div style={lab(t)}>NODO INI.</div>
                <input value={f.nodoI} onChange={(e) => onF({ nodoI: e.target.value })} style={{ ...inp(t), width: '100%' }} />
              </div>
              <div>
                <div style={lab(t)}>NODO FIN</div>
                <input value={f.nodoF} onChange={(e) => onF({ nodoF: e.target.value })} style={{ ...inp(t), width: '100%' }} />
              </div>
              <div>
                <div style={lab(t)}>ABS. DESDE</div>
                <input value={f.absA} onChange={(e) => onF({ absA: e.target.value })} style={{ ...inp(t), width: '100%' }} />
              </div>
              <div>
                <div style={lab(t)}>ABS. HASTA</div>
                <input value={f.absB} onChange={(e) => onF({ absB: e.target.value })} style={{ ...inp(t), width: '100%' }} />
              </div>
              <div>
                <div style={lab(t)}>VALID.</div>
                <select value={f.eje || 'interv'} onChange={(e) => onF({ eje: e.target.value, revisado: '', preInterv: '' })} title="Interventoría o depuración" style={{ ...inp(t), width: '100%' }}>
                  <option value="interv">Interventoría</option>
                  <option value="depur">Depuración</option>
                </select>
              </div>
              <div>
                <div style={lab(t)}>{(f.eje || 'interv') === 'depur' ? 'Estado dep.' : 'Estado int.'}</div>
                <select
                  value={(f.eje || 'interv') === 'depur' ? f.preInterv : f.revisado}
                  onChange={(e) => {
                    if ((f.eje || 'interv') === 'depur') onF({ preInterv: e.target.value })
                    else onF({ revisado: e.target.value })
                  }}
                  style={{ ...inp(t), width: '100%' }}
                >
                  <option value="">— Todos —</option>
                  {(semaforo || []).map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.label} {o.valor}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <p style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, margin: '4px 0 0', lineHeight: 1.35 }}>
            Criterios en servidor; la grilla refleja el filtro.
          </p>
        </div>
        <PptoFiltroMapaPk t={t} token={token} contratoId={contratoId} onPkPick={onPk} pkIdsDeGrilla={pkIdsDeGrilla} />
      </div>
    </div>
  )
}
