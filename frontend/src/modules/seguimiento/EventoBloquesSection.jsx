import { useState } from 'react'
import ActividadesEventoGrid from './ActividadesEventoGrid'
import BitacoraAdjuntos from './BitacoraAdjuntos'
import IdeaClaraModal from './IdeaClaraModal'
import TemaRichEditor from './TemaRichEditor'
import VisitantesEventoGrid, { emptyVisitanteRow } from './VisitantesEventoGrid'
import {
  EVENTO_TIPOS,
  eventoTieneDestinatario,
} from './bitacoraConstants'
import { emptyActividadRow } from './bitacoraEventoActividades'
import {
  emptyEventoBloque,
  emptyEventoDetalle,
  eventosFromEntrada,
  eventosParaPayload,
} from './eventoBloquesHelpers'
import { htmlToPlainText, plainTextToHtml } from './richTextUtils'

export {
  emptyEventoBloque,
  emptyEventoDetalle,
  eventosFromEntrada,
  eventosParaPayload,
}

/**
 * Sección de bloques de evento repetibles dentro del Reporte Diario.
 */
export default function EventoBloquesSection({
  t,
  api,
  ui,
  eventos = [],
  onChange,
  disabled = false,
  compact = false,
  onPickMapActividad,
}) {
  const list = Array.isArray(eventos) ? eventos : []
  /** @type {[null|string, Function]} id del bloque con Clara abierta */
  const [claraBloqueId, setClaraBloqueId] = useState(null)
  const claraBloque = list.find((b) => b.id === claraBloqueId) || null

  const btnGhost = {
    border: `1px solid ${t.border}`,
    background: t.bg,
    color: t.text,
    borderRadius: 8,
    padding: '6px 10px',
    fontWeight: 700,
    fontSize: 'var(--cc-xs)',
    cursor: disabled ? 'default' : 'pointer',
  }

  const patchBloque = (bloqueId, patch) => {
    onChange?.(list.map((b) => (b.id === bloqueId ? { ...b, ...patch } : b)))
  }

  const patchDetalle = (bloqueId, patchOrFn) => {
    onChange?.(list.map((b) => {
      if (b.id !== bloqueId) return b
      const prev = b.evento_detalle && typeof b.evento_detalle === 'object' ? b.evento_detalle : {}
      const next = typeof patchOrFn === 'function' ? patchOrFn(prev) : { ...prev, ...patchOrFn }
      return { ...b, evento_detalle: next }
    }))
  }

  const addBloque = () => {
    onChange?.([...list, emptyEventoBloque()])
  }

  const removeBloque = (bloqueId) => {
    onChange?.(list.filter((b) => b.id !== bloqueId))
  }

  const changeTipo = (bloque, nextTipo) => {
    const prev = bloque.evento_detalle && typeof bloque.evento_detalle === 'object'
      ? bloque.evento_detalle
      : {}
    const actividades = Array.isArray(prev.actividades) && prev.actividades.length
      ? prev.actividades
      : [emptyActividadRow()]
    patchBloque(bloque.id, {
      evento_tipo: nextTipo,
      dirigido_a: eventoTieneDestinatario(nextTipo) ? (bloque.dirigido_a || '') : '',
      evento_detalle: {
        ...emptyEventoDetalle(nextTipo),
        actividades,
      },
    })
  }

  return (
    <div className="cc-bitacora-evento-bloques">
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <div style={{ ...(ui?.sectionTitle || {}), marginBottom: 0 }}>Eventos</div>
        {!disabled && (
          <button type="button" onClick={addBloque} style={btnGhost}>
            + Agregar evento
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <div style={{
          fontSize: 'var(--cc-xs)',
          color: t.textMuted,
          padding: '10px 8px',
          border: `1px dashed ${t.border}`,
          borderRadius: 6,
          background: t.bg,
        }}>
          Sin eventos. Use «+ Agregar evento».
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.map((bloque, idx) => {
            const tipo = bloque.evento_tipo || 'reporte_actividades'
            const detalle = bloque.evento_detalle && typeof bloque.evento_detalle === 'object'
              ? bloque.evento_detalle
              : emptyEventoDetalle(tipo)
            return (
              <div
                key={bloque.id || `ev-${idx}`}
                style={{
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  padding: 10,
                  background: t.bgCard || t.bg,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ ...(ui?.sheetWrap || {}), flex: '1 1 240px' }}>
                    <table style={ui?.sheetTable}>
                      <thead>
                        <tr><th style={ui?.th}>Tipo de evento</th></tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={ui?.td}>
                            <select
                              disabled={disabled}
                              value={tipo}
                              onChange={(e) => changeTipo(bloque, e.target.value)}
                              style={{ ...(ui?.cellInp || {}), height: 30 }}
                            >
                              {EVENTO_TIPOS.map((x) => (
                                <option key={x.value} value={x.value}>{x.label}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {eventoTieneDestinatario(tipo) && (
                    <div style={{ ...(ui?.sheetWrap || {}), flex: '1 1 240px' }}>
                      <table style={ui?.sheetTable}>
                        <thead>
                          <tr><th style={ui?.th}>A quién se dirige</th></tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td style={ui?.td}>
                              <input
                                disabled={disabled}
                                value={bloque.dirigido_a || ''}
                                onChange={(e) => patchBloque(bloque.id, { dirigido_a: e.target.value })}
                                placeholder="Destinatario…"
                                style={ui?.cellInp}
                              />
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => removeBloque(bloque.id)}
                      title="Quitar evento"
                      style={{
                        ...(ui?.clipBtn || {}),
                        color: '#B91C1C',
                        alignSelf: 'center',
                        fontSize: 18,
                        padding: '4px 8px',
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>

                {tipo === 'incidente_sst' && (
                  <div style={ui?.sheetWrap}>
                    <table style={ui?.sheetTable}>
                      <thead>
                        <tr>
                          <th style={ui?.th} colSpan={2}>
                            Incidente SST (independiente de Auditor SST IA)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ['descripcion_incidente', 'Descripción'],
                          ['lugar', 'Lugar'],
                          ['personas_involucradas', 'Personas involucradas'],
                          ['acciones_inmediatas', 'Acciones inmediatas'],
                        ].map(([key, lab]) => (
                          <tr key={key}>
                            <td style={{ ...(ui?.td || {}), width: '22%', fontWeight: 600, fontSize: 'var(--cc-xs)' }}>{lab}</td>
                            <td style={ui?.td}>
                              <input
                                disabled={disabled}
                                value={detalle[key] || ''}
                                onChange={(e) => patchDetalle(bloque.id, { [key]: e.target.value })}
                                style={ui?.cellInp}
                              />
                            </td>
                          </tr>
                        ))}
                        <tr>
                          <td style={{ ...(ui?.td || {}), fontWeight: 600, fontSize: 'var(--cc-xs)' }}>Gravedad</td>
                          <td style={ui?.td}>
                            <select
                              disabled={disabled}
                              value={detalle.gravedad || 'leve'}
                              onChange={(e) => patchDetalle(bloque.id, { gravedad: e.target.value })}
                              style={{ ...(ui?.cellInp || {}), height: 30 }}
                            >
                              <option value="leve">Leve</option>
                              <option value="moderada">Moderada</option>
                              <option value="grave">Grave</option>
                            </select>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {tipo === 'visita_terceros' && (
                  <div style={ui?.sheetWrap}>
                    <VisitantesEventoGrid
                      t={t}
                      api={api}
                      rows={detalle.visitantes_lista || [emptyVisitanteRow()]}
                      disabled={disabled}
                      sheetStyles={ui}
                      onChange={(lista) => patchDetalle(bloque.id, {
                        visitantes_lista: lista,
                        visitantes: (lista || [])
                          .filter((v) => v && String(v.nombre || '').trim())
                          .map((v) => (v.cargo ? `${v.nombre} (${v.cargo})` : v.nombre))
                          .join(', '),
                      })}
                    />
                    <table style={{ ...(ui?.sheetTable || {}), marginTop: 10 }}>
                      <tbody>
                        {[
                          ['entidad', 'Entidad'],
                          ['motivo', 'Motivo'],
                        ].map(([key, lab]) => (
                          <tr key={key}>
                            <td style={{ ...(ui?.td || {}), width: '22%', fontWeight: 600, fontSize: 'var(--cc-xs)' }}>{lab}</td>
                            <td style={ui?.td}>
                              <input
                                disabled={disabled}
                                value={detalle[key] || ''}
                                onChange={(e) => patchDetalle(bloque.id, { [key]: e.target.value })}
                                style={ui?.cellInp}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="cc-bitacora-evento-stack">
                  <div className="cc-bitacora-evento-stack__actividades">
                    <ActividadesEventoGrid
                      t={t}
                      rows={detalle.actividades || [emptyActividadRow()]}
                      disabled={disabled}
                      sheetStyles={ui}
                      compact={compact}
                      onChange={(lista) => patchDetalle(bloque.id, { actividades: lista })}
                      onPickUbicacion={
                        onPickMapActividad
                          ? (actividadIdx) => onPickMapActividad(bloque.id, actividadIdx)
                          : undefined
                      }
                    />
                  </div>
                  <div className="cc-bitacora-evento-stack__texto">
                    <div style={{
                      display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
                      justifyContent: 'space-between', marginBottom: 6,
                    }}>
                      <div style={{ ...(ui?.sectionTitle || {}), marginBottom: 0 }}>
                        Reporte
                      </div>
                      {!disabled && (
                        <button
                          type="button"
                          onClick={() => setClaraBloqueId(bloque.id)}
                          style={btnGhost}
                        >
                          Redactar con Clara
                        </button>
                      )}
                    </div>
                    <TemaRichEditor
                      t={t}
                      value={bloque.cuerpo_html || ''}
                      onChange={(html) => patchBloque(bloque.id, { cuerpo_html: html })}
                      editable={!disabled}
                      minHeight={110}
                      placeholder="Describa el evento…"
                    />
                    <div style={{ marginTop: 8 }}>
                      <BitacoraAdjuntos
                        t={t}
                        api={api}
                        imagenes={Array.isArray(bloque.imagenes) ? bloque.imagenes : []}
                        onChange={(imgs) => patchBloque(bloque.id, { imagenes: imgs })}
                        disabled={disabled}
                        singleLine
                      />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {claraBloque && (
        <IdeaClaraModal
          t={t}
          api={api}
          textoInicial={htmlToPlainText(claraBloque.cuerpo_html || '')}
          onClose={() => setClaraBloqueId(null)}
          aplicarLabel="Aplicar al reporte"
          subtitulo="Mejore la redacción del reporte del evento con Clara."
          textoLabel="Reporte"
          modo="redaccion"
          zIndex={14000}
          onEnviarAlActa={(texto) => {
            patchBloque(claraBloque.id, { cuerpo_html: plainTextToHtml(texto) })
            setClaraBloqueId(null)
          }}
        />
      )}
    </div>
  )
}
