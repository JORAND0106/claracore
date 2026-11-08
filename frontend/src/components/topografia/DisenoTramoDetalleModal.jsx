/**
 * Popup de detalle de tramo: abscisas, estructuras/sectores, carga de diseño geométrico.
 */
import { useMemo, useRef, useState } from 'react'
import { API_BASE } from '../../apiBase'
import { parseDisenoExcelBuffer } from '../../utils/disenoGeometricoParse'
import { formatFechaHoraColombia } from '../../utils/fechaColombia'
import CcModalBrandHeader from '../CcModalBrandHeader'
import DisenoImportConfigModal from './DisenoImportConfigModal'
import DisenoPreviewCotasModal from './DisenoPreviewCotasModal'
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
  { key: 'esp', label: 'Espesor total', width: 110 },
  { key: 'ini', label: 'Abscisa inicio', width: 120 },
  { key: 'fin', label: 'Abscisa fin', width: 120 },
]

export default function DisenoTramoDetalleModal({
  open,
  detalle,
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

  if (!open || !detalle) return null

  const eje = detalle.eje || {}
  const sectores = detalle.sectores || []
  const rasante = detalle.rasante || []
  const pks = detalle.pks || []
  const alerta = detalle.alerta_abscisas
  const working = busy || localBusy

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
    if (!file) return
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

  const iconBtn = (title, onClick, children, opts = {}) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={opts.disabled || working}
      style={{
        ...ui.btnSecondary,
        padding: '6px 10px',
        color: opts.danger ? '#dc2626' : ui.text,
        opacity: (opts.disabled || working) ? 0.5 : 1,
      }}
    >
      {children}
    </button>
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
            width: 'min(860px, 96vw)',
            maxHeight: '92vh',
            overflow: 'auto',
            padding: '18px 22px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <CcModalBrandHeader theme={ui.t} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
            <div style={{ flex: '1 1 220px' }}>
              <h3 style={{ margin: 0, color: ui.text, fontSize: 'var(--cc-lg)' }}>{eje.nombre}</h3>
              <p style={{ margin: '4px 0 0', fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
                Abscisas {fmtN(eje.abscisa_inicio, 2)} – {fmtN(eje.abscisa_fin, 2)}
                {eje.updated_at ? ` · ${formatFechaHoraColombia(eje.updated_at)}` : ''}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {puede(permisos, 'editar') && iconBtn('Editar tramo', () => onEdit?.(detalle), '✎')}
              {iconBtn('Cerrar', onClose, '✕')}
            </div>
          </div>

          {alerta && (
            <div style={{
              marginBottom: 12, padding: '10px 12px', borderRadius: 8,
              background: `${ui.t?.warn || '#b45309'}18`,
              border: `1px solid ${ui.t?.warn || '#b45309'}`,
              color: ui.t?.warn || '#b45309',
              fontSize: 'var(--cc-xs)', lineHeight: 1.45, fontWeight: 600,
            }}>
              Alerta de abscisas: {alerta.mensaje}
            </div>
          )}

          <p style={{ margin: '0 0 6px', fontSize: 'var(--cc-xs)', fontWeight: 600, color: ui.text }}>
            PK del mapa
          </p>
          <p style={{ margin: '0 0 12px', fontSize: 'var(--cc-xs)', color: ui.textMuted, lineHeight: 1.45 }}>
            {pks.length
              ? pks.map((p) => {
                const bits = [
                  p.pk_label || p.pk_id,
                  p.costado ? `costado ${p.costado}` : null,
                  p.infraestructura || null,
                  p.tramo_plataforma || null,
                ].filter(Boolean)
                return bits.join(' · ')
              }).join(' | ')
              : 'Sin PK asociados'}
          </p>

          <p style={{ margin: '0 0 8px', fontSize: 'var(--cc-xs)', fontWeight: 600, color: ui.text }}>
            Estructura(s) y sectores
          </p>
          <TopoExcelSheet sheet={sheet} columns={SECTOR_COLS} minWidth={420}>
            {(sectores.length ? sectores : [{
              estructura: detalle.estructura_vigente,
              abscisa_inicio: eje.abscisa_inicio,
              abscisa_fin: eje.abscisa_fin,
            }]).map((s, idx) => (
              <tr key={s.id || idx}>
                <td style={sheet.td}>{s.estructura?.nombre || '—'}</td>
                <td style={sheet.td}>
                  {s.estructura?.espesor_total_m != null
                    ? `${Number(s.estructura.espesor_total_m).toFixed(3)} m`
                    : '—'}
                </td>
                <td style={sheet.td}>{fmtN(s.abscisa_inicio, 2)}</td>
                <td style={sheet.td}>{fmtN(s.abscisa_fin, 2)}</td>
              </tr>
            ))}
          </TopoExcelSheet>

          <div style={{
            marginTop: 16, paddingTop: 14,
            borderTop: `1px solid ${ui.t?.border || '#e2e8f0'}`,
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <h4 style={{ margin: 0, flex: 1, fontSize: 'var(--cc-base)', color: ui.text }}>
                Diseño geométrico
              </h4>
              <span style={{
                fontSize: 'var(--cc-xs)', fontWeight: 700,
                color: rasante.length ? (ui.t?.success || '#16a34a') : (ui.t?.warn || '#b45309'),
              }}>
                {rasante.length ? `Cargado (${rasante.length} pk)` : 'Pendiente'}
              </span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {iconBtn('Descargar plantilla CSV', descargarPlantilla, '⇩')}
              <PermisoAviso permisos={permisos} accion="editar">
                {puede(permisos, 'editar') && (
                  <label
                    title="Cargar diseño geométrico (CSV o Excel)"
                    aria-label="Cargar diseño geométrico (CSV o Excel)"
                    style={{
                      ...ui.btnPrimary,
                      cursor: working ? 'wait' : 'pointer',
                      margin: 0,
                      padding: '6px 10px',
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    ⇧
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      style={{ display: 'none' }}
                      disabled={working}
                      onChange={(e) => onFileSelected(e.target.files?.[0])}
                    />
                  </label>
                )}
              </PermisoAviso>
              {rasante.length > 0 && iconBtn('Vista previa de cotas', () => setPreviewOpen(true), '👁')}
              {rasante.length > 0 && puede(permisos, 'editar') && (
                iconBtn('Eliminar rasante importada', eliminarRasante, '🗑', { danger: true })
              )}
            </div>

            {!rasante.length && (
              <p style={{ margin: 0, fontSize: 'var(--cc-xs)', color: ui.textMuted, lineHeight: 1.45 }}>
                Descargue la plantilla o suba CSV/Excel con rasante / capa terminada (TRAMO, ABSCISA, IZQUIERDA, EJE, DERECHA, ANCHO).
              </p>
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
        perfilPuntos={detalle.perfil_puntos || []}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  )
}
