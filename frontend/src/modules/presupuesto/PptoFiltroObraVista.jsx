import { useCallback } from 'react'
import PptoFiltroMapaPk from './PptoFiltroMapaPk'

const inp = (t) => ({ background: t.inputBg, border: `1.5px solid ${t.border}`, borderRadius: 7, padding: '6px 10px', color: t.text, fontSize: 12, minWidth: 0 })
const lab = (t) => ({ fontSize: 10, fontWeight: 700, color: t.textMuted, marginBottom: 4 })

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
  buscando,
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
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14, alignItems: 'stretch' }}>
      <div
        style={{
          width: 280,
          flexShrink: 0,
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 10,
          padding: 10,
          maxHeight: 480,
          overflow: 'auto',
          boxShadow: t.shadow,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 800, color: t.primary, marginBottom: 8 }}>📂 Presupuesto por capítulo</div>
        {loadingCapitulos ? (
          <div style={{ fontSize: 12, color: t.textMuted }}>Cargando…</div>
        ) : !capitulosResumen.length ? (
          <div style={{ fontSize: 12, color: t.textMuted }}>Sin capítulos</div>
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
                    fontSize: 11,
                    color: t.text,
                  }}
                >
                  <span style={{ fontWeight: 700 }}>{open ? '▼' : '▶'}</span>{' '}
                  <span style={{ fontWeight: 600 }}>{c.capitulo?.length > 32 ? c.capitulo.slice(0, 32) + '…' : c.capitulo}</span>
                  <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>
                    {(c.total_registros ?? 0).toLocaleString('es-CO')} reg. · {fmtM(c.costo_total)}
                  </div>
                </button>
                {open && (
                  <div style={{ marginLeft: 6, marginTop: 4, borderLeft: `2px solid ${t.border}`, paddingLeft: 8 }}>
                    {!itemsResumen.length ? (
                      <div style={{ fontSize: 10, color: t.textMuted }}>Cargando ítems…</div>
                    ) : (
                      itemsResumen.map((it) => (
                        <button
                          type="button"
                          key={it.item}
                          onClick={() => onPickItem(it.item)}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            background: f.item === it.item ? t.primary + '22' : 'transparent',
                            border: 'none',
                            borderRadius: 4,
                            padding: '4px 0',
                            cursor: 'pointer',
                            fontSize: 10,
                            color: t.text,
                          }}
                        >
                          <strong>{it.item}</strong> <span style={{ color: t.textMuted }}>· {fmtM(it.costo_total)}</span>
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

      <div style={{ flex: 1, minWidth: 280, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 10, padding: 12, boxShadow: t.shadow }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: t.text, marginBottom: 10 }}>Ubicación técnica y criterios (como SICOE Obra)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, alignItems: 'end' }}>
            <div>
              <div style={lab(t)}>CAPÍTULO (texto o panel)</div>
              <input value={f.cap} onChange={(e) => onF({ cap: e.target.value })} placeholder="Capítulo" style={inp(t)} />
            </div>
            <div>
              <div style={lab(t)}>ÍTEM</div>
              <input value={f.item} onChange={(e) => onF({ item: e.target.value })} placeholder="Ítem" style={inp(t)} />
            </div>
            <div>
              <div style={lab(t)}>ID-POL (campo id_pol)</div>
              <input value={f.idPol} onChange={(e) => onF({ idPol: e.target.value })} placeholder="Filtro id_pol" style={inp(t)} />
            </div>
            <div>
              <div style={lab(t)}>PK (campo pk_id)</div>
              <input value={f.pkCriterio} onChange={(e) => onF({ pkCriterio: e.target.value })} placeholder="Código / etiqueta PK" style={inp(t)} />
            </div>
            <div>
              <div style={lab(t)}>Texto (registro y descripción)</div>
              <input value={f.texto} onChange={(e) => onF({ texto: e.target.value })} placeholder="Busca en registro, descripción…" style={{ ...inp(t), minWidth: 200 }} />
            </div>
            <div>
              <div style={lab(t)}>TRAMO (maestro PK)</div>
              <select value={f.tramo} onChange={(e) => onF({ tramo: e.target.value })} style={inp(t)}>
                <option value="">— Todos —</option>
                {(tramoOptions || []).map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div style={lab(t)}>CALZADA / MARGEN (maestro PK)</div>
              <select value={f.calzada} onChange={(e) => onF({ calzada: e.target.value })} style={inp(t)}>
                <option value="">— Todos —</option>
                {(calzadaOptions || []).map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div style={lab(t)}>NODO INICIO</div>
              <input value={f.nodoI} onChange={(e) => onF({ nodoI: e.target.value })} style={inp(t)} />
            </div>
            <div>
              <div style={lab(t)}>NODO FIN</div>
              <input value={f.nodoF} onChange={(e) => onF({ nodoF: e.target.value })} style={inp(t)} />
            </div>
            <div>
              <div style={lab(t)}>ABS. DESDE</div>
              <input value={f.absA} onChange={(e) => onF({ absA: e.target.value })} style={inp(t)} />
            </div>
            <div>
              <div style={lab(t)}>ABS. HASTA</div>
              <input value={f.absB} onChange={(e) => onF({ absB: e.target.value })} style={inp(t)} />
            </div>
            <div>
              <div style={lab(t)}>VALIDACIÓN</div>
              <select value={f.eje || 'interv'} onChange={(e) => onF({ eje: e.target.value, revisado: '', preInterv: '' })} style={inp(t)}>
                <option value="interv">Interventoría (revisado)</option>
                <option value="depur">Depuración / Obra (pre_interv)</option>
              </select>
            </div>
            <div>
              <div style={lab(t)}>{(f.eje || 'interv') === 'depur' ? 'Estado (depuración)' : 'Estado (Interventoría)'}</div>
              <select
                value={(f.eje || 'interv') === 'depur' ? f.preInterv : f.revisado}
                onChange={(e) => {
                  if ((f.eje || 'interv') === 'depur') onF({ preInterv: e.target.value })
                  else onF({ revisado: e.target.value })
                }}
                style={inp(t)}
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <button
              type="button"
              onClick={onBuscar}
              disabled={buscando}
              style={{
                background: t.primary,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 700,
                cursor: buscando ? 'wait' : 'pointer',
              }}
            >
              {buscando ? '⏳ Buscando…' : '🔍 Buscar'}
            </button>
            <button
              type="button"
              onClick={onLimpiar}
              style={{ background: 'transparent', border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 16px', color: t.textMuted, fontSize: 12, cursor: 'pointer' }}
            >
              Limpiar filtros
            </button>
            {onRestablecerPksItem && hayFiltroFinoPks && hayCap && (
              <button
                type="button"
                onClick={onRestablecerPksItem}
                disabled={buscando}
                style={{
                  background: '#0D948820',
                  border: '1px solid #0D9488',
                  borderRadius: 8,
                  padding: '8px 14px',
                  color: '#0D9488',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: buscando ? 'wait' : 'pointer',
                }}
                title="Quita PK, ID-POL y texto; mantiene capítulo, ítem y tramo/validación. Muestra de nuevo todos los PK del listado filtrado."
              >
                Ver todos los PK
              </button>
            )}
            <button
              type="button"
              onClick={onRevisorTramos}
              style={{ background: '#0D948820', border: '1px solid #0D9488', borderRadius: 8, padding: '8px 16px', color: '#0D9488', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              title="Requiere capítulo; carga el capítulo y abre el revisor de tramos"
            >
              🛣️ Consultar por tramos
            </button>
            <span style={{ fontSize: 10, color: t.textMuted, flex: 1, minWidth: 200 }}>Criterios en servidor. Combine cualquier criterio; la grilla refleja el filtro.</span>
          </div>
        </div>
        <PptoFiltroMapaPk t={t} token={token} contratoId={contratoId} onPkPick={onPk} pkIdsDeGrilla={pkIdsDeGrilla} />
      </div>
    </div>
  )
}

function fmtM(n) {
  if (n == null || n === '') return '—'
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K'
  return '$' + Math.round(n)
}
