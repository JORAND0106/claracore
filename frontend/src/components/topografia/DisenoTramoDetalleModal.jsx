/**
 * Popup de detalle de tramo: abscisas, estructuras/sectores, carga de diseño geométrico.
 * Se abre de inmediato (puede mostrar estado de carga).
 */
import { useMemo, useRef, useState } from 'react'
import { API_BASE } from '../../apiBase'
import { parseDisenoExcelBuffer } from '../../utils/disenoGeometricoParse'
import { formatFechaHoraColombia } from '../../utils/fechaColombia'
import CcModalBrandHeader from '../CcModalBrandHeader'
import DisenoImportConfigModal from './DisenoImportConfigModal'
import DisenoPreviewCotasModal from './DisenoPreviewCotasModal'
import {
  IconClose,
  IconDownload,
  IconEdit,
  IconEye,
  IconTrash,
  IconUpload,
} from './disenoDgIcons'
import TopoExcelSheet from './TopoExcelSheet'
import { topoSheetStyles } from './topoSheetStyles'
import { PermisoAviso, puede, useTopoTheme } from './topografiaShared'

function fmtN(v, dec = 3) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(dec) : '—'
}

const SECTOR_COLS = [
  { key: 'est', label: 'Estructura' },
  { key: 'esp', label: 'Espesor total', width: 120 },
  { key: 'rango', label: 'Sector (abscisas)', width: 180 },
]

function IconAction({
  title, onClick, disabled, danger, primary, children, style,
  as: Tag = 'button', ...rest
}) {
  const ui = useTopoTheme()
  const base = primary ? ui.btnPrimary : ui.btnSecondary
  return (
    <Tag
      type={Tag === 'button' ? 'button' : undefined}
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={Tag === 'button' ? disabled : undefined}
      style={{
        ...base,
        width: 40,
        height: 40,
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: danger ? '#dc2626' : (primary ? undefined : ui.text),
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        margin: 0,
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  )
}

function SectionCard({ ui, titulo, right, children }) {
  return (
    <section style={{
      marginTop: 14,
      padding: '14px 16px',
      borderRadius: 12,
      border: `1px solid ${ui.t?.border || '#e2e8f0'}`,
      background: ui.t?.bg || 'transparent',
    }}>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8,
        alignItems: 'center', marginBottom: 10,
      }}>
        <h4 style={{
          margin: 0, flex: 1, fontSize: 'var(--cc-sm)',
          fontWeight: 800, letterSpacing: '0.01em', color: ui.text,
        }}>
          {titulo}
        </h4>
        {right}
      </div>
      {children}
    </section>
  )
}

export default function DisenoTramoDetalleModal({
  open,
  detalle,
  loading = false,
  resumen = null,
  contratoId,
  token,
  permisos,
  busy,
  api,
  onReload,
  onEdit,
  onClose,
  onError,
}) {
  const ui = useTopoTheme()
  const sheet = useMemo(() => topoSheetStyles(ui.t), [ui.t])
  const fileRef = useRef(null)
  const [archivoPendiente, setArchivoPendiente] = useState(null)
  const [modalImportConfig, setModalImportConfig] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [localBusy, setLocalBusy] = useState(false)

  if (!open) return null

  const eje = detalle?.eje || resumen || {}
  const sectores = detalle?.sectores || []
  const rasante = detalle?.rasante || []
  const pks = detalle?.pks || []
  const alerta = detalle?.alerta_abscisas
  const working = busy || localBusy || loading
  const nombre = eje.nombre || resumen?.nombre || 'Tramo'
  const absIni = eje.abscisa_inicio ?? resumen?.abscisa_inicio ?? resumen?.abscisa_min
  const absFin = eje.abscisa_fin ?? resumen?.abscisa_fin ?? resumen?.abscisa_max

  const descargarPlantilla = async () => {
    try {
      const res = await fetch(
        `${API_BASE}/topografia/${contratoId}/diseno-geometrico/plantilla.csv`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      )
      if (!res.ok) throw new Error('No se pudo descargar la plantilla.')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'plantilla_diseno_geometrico.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      onError?.(e)
    }
  }

  const onFileSelected = (file) => {
    if (!file || loading) return
    setArchivoPendiente(file)
    setModalImportConfig(true)
    if (fileRef.current) fileRef.current.value = ''
  }

  const ejecutarImportacion = async (config) => {
    if (!eje.id || !archivoPendiente) return
    setLocalBusy(true)
    try {
      const name = archivoPendiente.name.toLowerCase()
      if (name.endsWith('.csv')) {
        const contenido = await archivoPendiente.text()
        await api(`/diseno-geometrico/ejes/${eje.id}/import-csv`, {
          method: 'POST',
          body: JSON.stringify({ contenido, reemplazar: true, config }),
        })
      } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const buf = await archivoPendiente.arrayBuffer()
        const filas = parseDisenoExcelBuffer(buf)
        await api(`/diseno-geometrico/ejes/${eje.id}/import-filas`, {
          method: 'POST',
          body: JSON.stringify({ filas, reemplazar: true, config }),
        })
      } else {
        throw new Error('Use archivo .csv o .xlsx')
      }
      setModalImportConfig(false)
      setArchivoPendiente(null)
      await onReload?.(eje.id)
    } catch (e) {
      onError?.(e)
    } finally {
      setLocalBusy(false)
    }
  }

  const eliminarRasante = async () => {
    if (!eje.id) return
    setLocalBusy(true)
    try {
      await api(`/diseno-geometrico/ejes/${eje.id}/rasante`, { method: 'DELETE' })
      await onReload?.(eje.id)
    } catch (e) {
      onError?.(e)
    } finally {
      setLocalBusy(false)
    }
  }

  const badge = (ok) => (
    <span style={{
      fontSize: 'var(--cc-xs)',
      fontWeight: 800,
      padding: '3px 10px',
      borderRadius: 999,
      background: ok ? `${ui.t?.success || '#16a34a'}22` : `${ui.t?.warn || '#b45309'}22`,
      color: ok ? (ui.t?.success || '#16a34a') : (ui.t?.warn || '#b45309'),
    }}>
      {ok ? `Cargado · ${rasante.length} pk` : 'Pendiente'}
    </span>
  )

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 100055,
          background: 'rgba(15,23,42,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}
        onClick={() => { if (!working && !modalImportConfig && !previewOpen) onClose?.() }}
      >
        <div
          style={{
            ...ui.card,
            width: 'min(900px, 96vw)',
            maxHeight: '92vh',
            overflow: 'auto',
            padding: 0,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <CcModalBrandHeader theme={ui.t} />

          <div style={{
            padding: '16px 20px 14px',
            borderBottom: `1px solid ${ui.t?.border || '#e2e8f0'}`,
            background: `linear-gradient(180deg, ${ui.t?.bg || 'transparent'} 0%, transparent 100%)`,
          }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 'var(--cc-caption)', fontWeight: 700,
                  color: ui.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>
                  Información del tramo
                </div>
                <h3 style={{
                  margin: '4px 0 0', color: ui.text, fontSize: 'var(--cc-xl)',
                  lineHeight: 1.2, wordBreak: 'break-word',
                }}>
                  {nombre}
                </h3>
                <p style={{ margin: '8px 0 0', fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
                  Abscisas <strong style={{ color: ui.text }}>{fmtN(absIni, 2)} – {fmtN(absFin, 2)}</strong>
                  {eje.updated_at ? ` · Actualizado ${formatFechaHoraColombia(eje.updated_at)}` : ''}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {puede(permisos, 'editar') && !loading && (
                  <IconAction
                    title="Editar tramo"
                    disabled={working}
                    onClick={() => onEdit?.(detalle)}
                  >
                    <IconEdit />
                  </IconAction>
                )}
                <IconAction title="Cerrar" onClick={onClose}>
                  <IconClose />
                </IconAction>
              </div>
            </div>
          </div>

          <div style={{ padding: '6px 20px 20px' }}>
            {loading && (
              <p style={{
                margin: '12px 0 0', padding: '12px 14px', borderRadius: 10,
                border: `1px dashed ${ui.t?.border || '#cbd5e1'}`,
                color: ui.textMuted, fontSize: 'var(--cc-sm)',
              }}>
                Cargando información del tramo…
              </p>
            )}

            {!loading && alerta && (
              <div style={{
                marginTop: 12, padding: '10px 12px', borderRadius: 10,
                background: `${ui.t?.warn || '#b45309'}18`,
                border: `1px solid ${ui.t?.warn || '#b45309'}`,
                color: ui.t?.warn || '#b45309',
                fontSize: 'var(--cc-xs)', lineHeight: 1.45, fontWeight: 600,
              }}>
                Alerta de abscisas: {alerta.mensaje}
              </div>
            )}

            {!loading && (
              <>
                <SectionCard ui={ui} titulo="PK del mapa">
                  {pks.length ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {pks.map((p) => {
                        const label = p.pk_label || p.pk_id
                        const bits = [
                          p.costado ? `Costado ${p.costado}` : null,
                          p.infraestructura || null,
                          p.tramo_plataforma || null,
                        ].filter(Boolean)
                        return (
                          <div
                            key={p.id || p.pk_id}
                            style={{
                              padding: '8px 10px',
                              borderRadius: 10,
                              border: `1px solid ${ui.t?.border || '#e2e8f0'}`,
                              background: ui.card?.background || ui.t?.bgCard || 'transparent',
                              minWidth: 120,
                            }}
                          >
                            <div style={{ fontWeight: 800, color: ui.text, fontSize: 'var(--cc-sm)' }}>{label}</div>
                            {bits.length > 0 && (
                              <div style={{ marginTop: 2, fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
                                {bits.join(' · ')}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: 'var(--cc-xs)', color: ui.textMuted }}>Sin PK asociados</p>
                  )}
                </SectionCard>

                <SectionCard ui={ui} titulo="Estructura(s) y sectores">
                  <TopoExcelSheet sheet={sheet} columns={SECTOR_COLS} minWidth={420}>
                    {(sectores.length ? sectores : [{
                      estructura: detalle?.estructura_vigente,
                      abscisa_inicio: absIni,
                      abscisa_fin: absFin,
                    }]).map((s, idx) => (
                      <tr key={s.id || idx}>
                        <td style={sheet.td}>
                          <strong>{s.estructura?.nombre || '—'}</strong>
                          {(s.estructura?.capas?.length) ? (
                            <div style={{ fontSize: 'var(--cc-caption)', color: ui.textMuted }}>
                              {s.estructura.capas.length} capa(s)
                            </div>
                          ) : null}
                        </td>
                        <td style={sheet.td}>
                          {s.estructura?.espesor_total_m != null
                            ? `${Number(s.estructura.espesor_total_m).toFixed(3)} m`
                            : '—'}
                        </td>
                        <td style={sheet.td}>
                          {fmtN(s.abscisa_inicio, 2)} – {fmtN(s.abscisa_fin, 2)}
                        </td>
                      </tr>
                    ))}
                  </TopoExcelSheet>
                </SectionCard>

                <SectionCard
                  ui={ui}
                  titulo="Diseño geométrico"
                  right={badge(rasante.length > 0)}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    <IconAction title="Descargar plantilla CSV" onClick={descargarPlantilla} disabled={working}>
                      <IconDownload />
                    </IconAction>
                    <PermisoAviso permisos={permisos} accion="editar">
                      {puede(permisos, 'editar') && (
                        <IconAction
                          as="label"
                          title="Cargar diseño geométrico (CSV o Excel)"
                          primary
                          disabled={working}
                          style={{ cursor: working ? 'wait' : 'pointer' }}
                        >
                          <IconUpload />
                          <input
                            ref={fileRef}
                            type="file"
                            accept=".csv,.xlsx,.xls"
                            style={{ display: 'none' }}
                            disabled={working}
                            onChange={(e) => onFileSelected(e.target.files?.[0])}
                          />
                        </IconAction>
                      )}
                    </PermisoAviso>
                    {rasante.length > 0 && (
                      <IconAction title="Vista previa del diseño" onClick={() => setPreviewOpen(true)} disabled={working}>
                        <IconEye />
                      </IconAction>
                    )}
                    {rasante.length > 0 && puede(permisos, 'editar') && (
                      <IconAction
                        title="Eliminar rasante importada"
                        danger
                        onClick={eliminarRasante}
                        disabled={working}
                      >
                        <IconTrash />
                      </IconAction>
                    )}
                  </div>
                  {!rasante.length && (
                    <p style={{ margin: 0, fontSize: 'var(--cc-xs)', color: ui.textMuted, lineHeight: 1.45 }}>
                      Descargue la plantilla o cargue CSV/Excel con rasante / capa terminada.
                    </p>
                  )}
                </SectionCard>
              </>
            )}
          </div>
        </div>
      </div>

      <DisenoImportConfigModal
        open={modalImportConfig}
        nombreArchivo={archivoPendiente?.name}
        zIndex={100080}
        onConfirm={ejecutarImportacion}
        onClose={() => {
          if (!localBusy) {
            setModalImportConfig(false)
            setArchivoPendiente(null)
          }
        }}
      />

      <DisenoPreviewCotasModal
        open={previewOpen}
        eje={eje}
        rasante={rasante}
        perfilPuntos={detalle?.perfil_puntos || []}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  )
}
