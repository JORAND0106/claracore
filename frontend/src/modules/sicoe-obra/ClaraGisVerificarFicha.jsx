/**
 * Ficha de lectura "Verificar" para la ventana incrustada de ClaraGIS.
 * Un registro a la vez; modo Editar queda en el formulario completo existente.
 */
import { useEffect, useMemo, useState } from 'react'
import { listaFotosRegistro } from './sicoeFotosHelpers'
import { listaGraficosRegistro } from './sicoeGraficosHelpers'
import {
  sicoeCorteNumeroDeRegistro,
  sicoeNombreSubcontratistaRegistro,
} from './sicoeRegistroSubcontratista'
import {
  compararCantidadConDibujo,
  fmtCantidadVerificar,
  fmtCostoDirectoVerificar,
  indiceRegistroPorId,
  indiceSiguientePendiente,
  lineaItemVerificar,
  semaforoNivelesRegistro,
  textoSelladoRegistro,
} from './claraGisVerificarHelpers'

function IconBtn({ title, onClick, children, disabled, accent, size = 44 }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(e) => {
        e?.stopPropagation?.()
        onClick?.(e)
      }}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        borderRadius: 12,
        border: '1px solid transparent',
        background: accent || 'transparent',
        color: accent ? '#fff' : 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        fontSize: size >= 52 ? 28 : 18,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  )
}

function PanelSecundario({ t, titulo, onClose, children }) {
  return (
    <div
      role="dialog"
      aria-label={titulo}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 6,
        background: t.card || t.bg || '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 12px',
        borderBottom: `1px solid ${t.border}`,
        flexShrink: 0,
      }}>
        <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)', flex: 1 }}>{titulo}</div>
        <IconBtn title="Cerrar" onClick={onClose} size={40}>✕</IconBtn>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 12, fontSize: 'var(--cc-md)', lineHeight: 1.45 }}>
        {children}
      </div>
    </div>
  )
}

/**
 * @param {object} props
 * @param {object} props.t
 * @param {object[]} props.registros
 * @param {object} props.reporte
 * @param {number|string|null} props.registroId
 * @param {(id: any) => void} props.onRegistroChange
 * @param {(modo: 'verificar'|'editar') => void} props.onCambiarModo
 * @param {(reg) => string} props.estadoMiNivel
 * @param {(reg) => boolean} props.puedeValidarRapido
 * @param {(ids: any[]) => void} props.onAprobar
 * @param {(estado: string, ids: any[]) => void} props.onPedirComentario
 * @param {boolean} props.ejecutando
 * @param {number[]} props.nivelesActivos
 * @param {Record<number,string>} props.encabezadosNivel
 * @param {object} props.nivelesContrato
 * @param {object} props.usuario
 */
export default function ClaraGisVerificarFicha({
  t,
  registros = [],
  reporte,
  registroId = null,
  onRegistroChange,
  onCambiarModo,
  estadoMiNivel,
  puedeValidarRapido,
  onAprobar,
  onPedirComentario,
  ejecutando = false,
  nivelesActivos = [1, 2, 3],
  encabezadosNivel = {},
  nivelesContrato = null,
}) {
  const regs = Array.isArray(registros) ? registros : []
  const [idx, setIdx] = useState(() => indiceRegistroPorId(regs, registroId))
  const [fotoIdx, setFotoIdx] = useState(0)
  const [lightbox, setLightbox] = useState(null)
  const [itemDetalle, setItemDetalle] = useState(false)
  const [panel, setPanel] = useState(null) // 'obs' | 'adjuntos' | 'graficos' | 'reversion' | null
  const [tipNivel, setTipNivel] = useState(null)

  useEffect(() => {
    const next = indiceRegistroPorId(regs, registroId)
    setIdx(next)
  }, [registroId, regs])

  useEffect(() => {
    setFotoIdx(0)
    setPanel(null)
    setItemDetalle(false)
    setTipNivel(null)
  }, [idx])

  const reg = regs[idx] || null
  const total = regs.length

  const irA = (nextIdx) => {
    if (nextIdx < 0 || nextIdx >= total) return
    setIdx(nextIdx)
    const r = regs[nextIdx]
    if (r?.id != null) onRegistroChange?.(r.id)
  }

  const fotos = useMemo(() => (reg ? listaFotosRegistro(reg) : []), [reg])
  const graficos = useMemo(() => (reg ? listaGraficosRegistro(reg) : []), [reg])
  const fotoActual = fotos[fotoIdx] || null

  const comparacion = useMemo(
    () => (reg ? compararCantidadConDibujo(reg, reporte?.dibujo_geojson || reporte?.perimetro_geojson) : null),
    [reg, reporte?.dibujo_geojson, reporte?.perimetro_geojson],
  )

  const semaforo = useMemo(
    () => (reg ? semaforoNivelesRegistro(reg, nivelesActivos, encabezadosNivel) : []),
    [reg, nivelesActivos, encabezadosNivel],
  )

  const puedeDecidir = !!(reg && typeof puedeValidarRapido === 'function' && puedeValidarRapido(reg))
  const estadoYo = reg && typeof estadoMiNivel === 'function' ? estadoMiNivel(reg) : 'No Revisado'

  const selladoTip = textoSelladoRegistro(reg, nivelesContrato)
  const subNombre = sicoeNombreSubcontratistaRegistro({
    registro: reg,
    reporte,
  }) || 'Sin subcontratista'
  const corteNum = sicoeCorteNumeroDeRegistro({ registro: reg, reporte })

  const trasDecision = () => {
    const next = indiceSiguientePendiente(regs, idx, {
      estadoMiNivel,
      puedeValidar: puedeValidarRapido,
      omitirIds: reg?.id != null ? [reg.id] : [],
    })
    if (next >= 0 && next !== idx) irA(next)
  }

  const aprobar = () => {
    if (!reg || !puedeDecidir) return
    onAprobar?.([reg.id])
    // El optimistic update puede tardar; avanzar al siguiente pendiente.
    setTimeout(trasDecision, 80)
  }

  const rechazar = () => {
    if (!reg || !puedeDecidir) return
    onPedirComentario?.('Rechazado', [reg.id])
  }

  if (!reg) {
    return (
      <div style={{ padding: 16, color: t.textMuted, fontSize: 'var(--cc-md)' }}>
        No hay registros con ítem en este reporte.
      </div>
    )
  }

  const textMain = t.text || '#e2e8f0'
  const muted = t.textMuted || '#94a3b8'
  const border = t.border || '#334155'
  const cardBg = t.card || t.bgSecondary || '#111827'

  return (
    <div
      className="cc-claragis-verificar"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        color: textMain,
        fontSize: 'var(--cc-md)',
      }}
    >
      {/* Nav superior */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 2px 10px',
        flexShrink: 0,
      }}>
        <IconBtn title="Registro anterior" onClick={() => irA(idx - 1)} disabled={idx <= 0} size={40}>◀</IconBtn>
        <div style={{ fontWeight: 800, fontSize: 'var(--cc-lg)', minWidth: 64, textAlign: 'center' }}>
          {idx + 1}/{total}
        </div>
        <IconBtn title="Registro siguiente" onClick={() => irA(idx + 1)} disabled={idx >= total - 1} size={40}>▶</IconBtn>
        <div style={{ flex: 1 }} />
        <IconBtn
          title="Editar (formulario completo)"
          onClick={() => onCambiarModo?.('editar')}
          size={42}
        >
          ✏️
        </IconBtn>
      </div>

      {/* Contenido scrollable */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', paddingBottom: puedeDecidir ? 72 : 8 }}>
        {/* Foto */}
        <div
          onClick={() => { if (fotoActual?.url) setLightbox(fotoActual.url) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && fotoActual?.url) setLightbox(fotoActual.url) }}
          role={fotoActual?.url ? 'button' : undefined}
          tabIndex={fotoActual?.url ? 0 : undefined}
          title={fotoActual?.url ? 'Ampliar foto' : undefined}
          style={{
            width: '100%',
            aspectRatio: fotoActual?.url ? '4 / 3' : '16 / 7',
            borderRadius: 12,
            background: fotoActual?.url ? '#0b1220' : '#1e293b',
            border: `1px solid ${border}`,
            overflow: 'hidden',
            position: 'relative',
            cursor: fotoActual?.url ? 'zoom-in' : 'default',
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {fotoActual?.url ? (
            <img
              src={fotoActual.url}
              alt={`Foto ${fotoIdx + 1}`}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div style={{ color: muted, fontSize: 36, opacity: 0.7 }}>📷</div>
          )}
          {fotos.length > 1 && (
            <div style={{
              position: 'absolute',
              bottom: 8,
              left: 0,
              right: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}>
              <IconBtn
                title="Foto anterior"
                size={36}
                onClick={(e) => { e.stopPropagation(); setFotoIdx((i) => (i - 1 + fotos.length) % fotos.length) }}
              >
                ‹
              </IconBtn>
              <span style={{
                background: 'rgba(15,23,42,0.75)',
                color: '#fff',
                borderRadius: 999,
                padding: '2px 10px',
                fontWeight: 700,
                fontSize: 'var(--cc-sm)',
              }}>
                {fotoIdx + 1}/{fotos.length}
              </span>
              <IconBtn
                title="Foto siguiente"
                size={36}
                onClick={(e) => { e.stopPropagation(); setFotoIdx((i) => (i + 1) % fotos.length) }}
              >
                ›
              </IconBtn>
            </div>
          )}
        </div>

        {/* Ítem */}
        <button
          type="button"
          onClick={() => setItemDetalle((v) => !v)}
          title="Ver detalle del ítem"
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            background: 'transparent',
            border: 'none',
            color: textMain,
            fontWeight: 700,
            fontSize: 'var(--cc-lg)',
            lineHeight: 1.35,
            padding: '0 2px 8px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {lineaItemVerificar(reg)}
        </button>
        {itemDetalle && (
          <div style={{
            margin: '0 0 12px',
            padding: 12,
            borderRadius: 10,
            background: cardBg,
            border: `1px solid ${border}`,
            fontSize: 'var(--cc-md)',
            lineHeight: 1.45,
          }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>{reg.item_numero}</div>
            <div style={{ marginBottom: 8 }}>{reg.item_descripcion || '—'}</div>
            <div style={{ color: muted }}>
              Capítulo: {reg.capitulo || reporte?.capitulo || '—'}
              {' · '}Unidad: {reg.unidad || '—'}
              {' · '}V.U.: {fmtCostoDirectoVerificar(reg.vlr_unitario)}
            </div>
          </div>
        )}

        {/* Cantidad */}
        <div style={{
          fontSize: 'calc(var(--cc-lg) * 1.55)',
          fontWeight: 800,
          lineHeight: 1.25,
          letterSpacing: '-0.01em',
          padding: '4px 2px 6px',
          wordBreak: 'break-word',
        }}>
          {fmtCantidadVerificar(reg)}
        </div>

        {/* Costo */}
        <div style={{
          fontSize: 'calc(var(--cc-lg) * 1.35)',
          fontWeight: 800,
          color: '#16a34a',
          padding: '0 2px 8px',
        }}>
          {fmtCostoDirectoVerificar(reg.costo_directo)}
        </div>

        {/* Comparación dibujo */}
        {comparacion && (
          <div style={{
            padding: '0 2px 12px',
            fontSize: 'var(--cc-md)',
            fontWeight: 700,
            color: comparacion.ok ? '#16a34a' : '#d97706',
          }}>
            {comparacion.texto}
          </div>
        )}

        {/* Semáforo */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
          padding: '4px 2px 14px',
          position: 'relative',
        }}>
          {semaforo.map((s) => (
            <button
              key={s.nivel}
              type="button"
              title={`${s.encabezado}: ${s.estado}${s.usuario ? ` · ${s.usuario}` : ''}${s.fecha ? ` · ${s.fecha}` : ''}`}
              onClick={() => setTipNivel(tipNivel === s.nivel ? null : s.nivel)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'transparent',
                border: 'none',
                color: textMain,
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 'var(--cc-md)',
                padding: 0,
              }}
            >
              <span>{s.label}</span>
              <span style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: s.color,
                boxShadow: `0 0 0 2px ${border}`,
              }} />
            </button>
          ))}
          {tipNivel != null && (() => {
            const s = semaforo.find((x) => x.nivel === tipNivel)
            if (!s) return null
            return (
              <div style={{
                width: '100%',
                marginTop: 4,
                padding: 10,
                borderRadius: 8,
                background: cardBg,
                border: `1px solid ${border}`,
                fontSize: 'var(--cc-sm)',
                color: muted,
              }}>
                <strong style={{ color: textMain }}>{s.encabezado}</strong>
                {' · '}{s.estado}
                {s.usuario ? ` · ${s.usuario}` : ''}
                {s.fecha ? ` · ${s.fecha}` : ''}
              </div>
            )
          })()}
        </div>

        {/* Iconos secundarios */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          padding: '0 0 8px',
          borderTop: `1px solid ${border}`,
          paddingTop: 10,
        }}>
          <IconBtn title={selladoTip} size={40}>🔒</IconBtn>
          <IconBtn title="Reversión de sellado" size={40} onClick={() => setPanel('reversion')}>♻️</IconBtn>
          <IconBtn title={`Subcontratista: ${subNombre}`} size={40}>👷</IconBtn>
          <IconBtn
            title={corteNum != null ? `Corte: ${corteNum}` : 'Sin corte'}
            size={40}
          >
            ✂️
          </IconBtn>
          <IconBtn title="Observación" size={40} onClick={() => setPanel('obs')}>📝</IconBtn>
          <IconBtn title="Adjuntos / enlace soporte" size={40} onClick={() => setPanel('adjuntos')}>📎</IconBtn>
          <IconBtn title="Galería de gráficos" size={40} onClick={() => setPanel('graficos')}>🖼️</IconBtn>
        </div>
      </div>

      {/* Footer decisión fijo */}
      {puedeDecidir && (
        <div style={{
          position: 'sticky',
          bottom: 0,
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'center',
          gap: 20,
          padding: '10px 8px 6px',
          background: `linear-gradient(180deg, transparent, ${cardBg} 28%)`,
          borderTop: `1px solid ${border}`,
        }}>
          <IconBtn
            title={estadoYo === 'Aprobado' ? 'Ya aprobado' : 'Aprobar'}
            accent="#16a34a"
            size={56}
            disabled={ejecutando || estadoYo === 'Aprobado'}
            onClick={aprobar}
          >
            ✓
          </IconBtn>
          <IconBtn
            title="Rechazar"
            accent="#dc2626"
            size={56}
            disabled={ejecutando}
            onClick={rechazar}
          >
            ✗
          </IconBtn>
        </div>
      )}

      {/* Paneles secundarios (dentro de la ficha) */}
      {panel === 'obs' && (
        <PanelSecundario t={t} titulo="Observación" onClose={() => setPanel(null)}>
          {String(reg.observacion || '').trim() || 'Sin observación.'}
        </PanelSecundario>
      )}
      {panel === 'adjuntos' && (
        <PanelSecundario t={t} titulo="Adjuntos" onClose={() => setPanel(null)}>
          {(() => {
            let urls = []
            try {
              const raw = reg.enlace_soporte || reporte?.enlace_soporte
              if (Array.isArray(raw)) urls = raw
              else if (typeof raw === 'string' && raw.trim()) {
                const j = JSON.parse(raw)
                urls = Array.isArray(j) ? j : (raw.startsWith('http') ? [raw] : [])
              }
            } catch {
              const s = String(reg.enlace_soporte || '').trim()
              if (s.startsWith('http')) urls = [s]
            }
            urls = urls.filter(Boolean)
            if (!urls.length) return 'Sin adjuntos.'
            return (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {urls.map((u) => (
                  <li key={u} style={{ marginBottom: 8 }}>
                    <a href={u} target="_blank" rel="noopener noreferrer" style={{ color: t.primary }}>
                      {u}
                    </a>
                  </li>
                ))}
              </ul>
            )
          })()}
        </PanelSecundario>
      )}
      {panel === 'graficos' && (
        <PanelSecundario t={t} titulo="Gráficos" onClose={() => setPanel(null)}>
          {!graficos.length ? 'Sin gráficos.' : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {graficos.map((g, i) => (
                <button
                  key={`${g.url}-${i}`}
                  type="button"
                  onClick={() => setLightbox(g.url)}
                  style={{
                    border: `1px solid ${border}`,
                    borderRadius: 10,
                    overflow: 'hidden',
                    padding: 0,
                    background: '#0b1220',
                    cursor: 'zoom-in',
                  }}
                >
                  <img src={g.url} alt={`Gráfico ${i + 1}`} style={{ width: '100%', display: 'block' }} />
                </button>
              ))}
            </div>
          )}
        </PanelSecundario>
      )}
      {panel === 'reversion' && (
        <PanelSecundario t={t} titulo="Reversión de sellado" onClose={() => setPanel(null)}>
          <p style={{ marginTop: 0 }}>
            {selladoTip}
          </p>
          <p style={{ color: muted }}>
            Para solicitar o completar la reversión de sellado use el modo Editar (icono ✏️), donde está el flujo completo de doble llave.
          </p>
          <button
            type="button"
            onClick={() => onCambiarModo?.('editar')}
            style={{
              marginTop: 8,
              padding: '10px 14px',
              borderRadius: 10,
              border: 'none',
              background: t.primary,
              color: '#fff',
              fontWeight: 800,
              cursor: 'pointer',
              minHeight: 44,
            }}
          >
            Ir a Editar
          </button>
        </PanelSecundario>
      )}

      {/* Lightbox foto/gráfico */}
      {lightbox && (
        <div
          role="dialog"
          aria-label="Vista ampliada"
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 12,
          }}
        >
          <img
            src={lightbox}
            alt="Ampliada"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }}
          />
          <button
            type="button"
            title="Cerrar"
            onClick={() => setLightbox(null)}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              width: 48,
              height: 48,
              borderRadius: 12,
              border: 'none',
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              fontSize: 22,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
