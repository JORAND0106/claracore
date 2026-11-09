/**
 * Popup de detalle de tramo: abscisas, estructuras/sectores, carga de diseño geométrico.
 * Se abre de inmediato (puede mostrar estado de carga).
 */
import { useMemo, useRef, useState } from 'react'
import { API_BASE } from '../../apiBase'
import {
  listDisenoExcelSheetNames,
  parseDisenoExcelBuffer,
} from '../../utils/disenoGeometricoParse'
import { formatFechaHoraColombia } from '../../utils/fechaColombia'
import CcModalBrandHeader from '../CcModalBrandHeader'
import DisenoExcelHojaModal from './DisenoExcelHojaModal'
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

/** Botón solo ícono — estilo institucional (borde + transparente), sin azul sólido. */
function IconAction({
  title, onClick, disabled, danger, children, style,
  as: Tag = 'button', ...rest
}) {
  const ui = useTopoTheme()
  const border = ui.t?.border || '#cbd5e1'
  return (
    <Tag
      type={Tag === 'button' ? 'button' : undefined}
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={Tag === 'button' ? disabled : undefined}
      style={{
        background: 'transparent',
        color: danger ? '#dc2626' : ui.text,
        border: `1px solid ${danger ? '#fca5a5' : border}`,
        borderRadius: 8,
        width: 40,
        height: 40,
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        margin: 0,
        lineHeight: 1,
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
  const [excelBuffer, setExcelBuffer] = useState(null)
  const [excelHojas, setExcelHojas] = useState([])
  const [excelHojaSel, setExcelHojaSel] = useState('')
  const [modalExcelHoja, setModalExcelHoja] = useState(false)
  const [modalImportConfig, setModalImportConfig] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [localBusy, setLocalBusy] = useState(false)
  const [faseImport, setFaseImport] = useState('') // leyendo | configurando | importando | ''
  const [avisoImport, setAvisoImport] = useState(null) // { tipo: 'ok'|'error'|'info', texto }

  if (!open) return null

  const eje = detalle?.eje || resumen || {}
  const sectores = detalle?.sectores || []
  const rasante = detalle?.rasante || []
  const pks = detalle?.pks || []
  const alerta = detalle?.alerta_abscisas
  const importing = localBusy || !!faseImport
  const working = busy || importing
  const nombre = eje.nombre || resumen?.nombre || 'Tramo'
  const absIni = eje.abscisa_inicio ?? resumen?.abscisa_inicio ?? resumen?.abscisa_min
  const absFin = eje.abscisa_fin ?? resumen?.abscisa_fin ?? resumen?.abscisa_max

  const mostrarAviso = (tipo, texto) => {
    setAvisoImport({ tipo, texto })
    if (tipo === 'error') onError?.(new Error(texto))
  }

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
      mostrarAviso('error', e?.message || 'No se pudo descargar la plantilla.')
    }
  }

  const resetArchivo = () => {
    setArchivoPendiente(null)
    setExcelBuffer(null)
    setExcelHojas([])
    setExcelHojaSel('')
    setModalExcelHoja(false)
    setModalImportConfig(false)
    setFaseImport('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const abrirSelectorArchivo = () => {
    setAvisoImport(null)
    if (importing) {
      mostrarAviso('info', 'Espere: hay una importación en curso.')
      return
    }
    if (loading && !eje?.id) {
      mostrarAviso('info', 'Espere a que termine de cargar la información del tramo.')
      return
    }
    if (!eje?.id) {
      mostrarAviso('error', 'No se identificó el tramo. Cierre el popup e inténtelo de nuevo.')
      return
    }
    try {
      fileRef.current?.click()
    } catch (e) {
      mostrarAviso('error', e?.message || 'No se pudo abrir el selector de archivos.')
    }
  }

  const onFileSelected = async (file) => {
    if (!file) return
    if (importing) {
      mostrarAviso('info', 'Espere: hay una importación en curso.')
      return
    }
    const name = file.name.toLowerCase()
    setAvisoImport(null)
    setFaseImport('leyendo')
    try {
      if (name.endsWith('.csv')) {
        setArchivoPendiente(file)
        setExcelBuffer(null)
        setExcelHojas([])
        setExcelHojaSel('')
        setFaseImport('configurando')
        setModalImportConfig(true)
      } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const buf = await file.arrayBuffer()
        const hojas = listDisenoExcelSheetNames(buf)
        setArchivoPendiente(file)
        setExcelBuffer(buf)
        setExcelHojas(hojas)
        setExcelHojaSel(hojas[0] || '')
        if (hojas.length <= 1) {
          setFaseImport('configurando')
          setModalImportConfig(true)
        } else {
          setFaseImport('configurando')
          setModalExcelHoja(true)
        }
      } else {
        throw new Error('Use un archivo .csv o .xlsx / .xls')
      }
    } catch (e) {
      resetArchivo()
      mostrarAviso('error', e?.message || 'No se pudo leer el archivo.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
      // Si quedó abierto un modal de config/hoja, faseImport sigue en 'configurando'
      setFaseImport((prev) => (prev === 'leyendo' ? '' : prev))
    }
  }

  const ejecutarImportacion = async (config) => {
    if (localBusy) return
    if (!eje?.id) {
      mostrarAviso('error', 'No se identificó el tramo. Cierre el popup e inténtelo de nuevo.')
      return
    }
    if (!archivoPendiente) {
      mostrarAviso('error', 'No hay archivo seleccionado. Vuelva a elegir el archivo.')
      resetArchivo()
      return
    }
    setLocalBusy(true)
    setFaseImport('importando')
    setAvisoImport(null)
    try {
      const name = archivoPendiente.name.toLowerCase()
      let resultado = null
      if (name.endsWith('.csv')) {
        const contenido = await archivoPendiente.text()
        resultado = await api(`/diseno-geometrico/ejes/${eje.id}/import-csv`, {
          method: 'POST',
          body: JSON.stringify({ contenido, reemplazar: true, config }),
        })
      } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const buf = excelBuffer || await archivoPendiente.arrayBuffer()
        const filas = parseDisenoExcelBuffer(buf, {
          sheetName: excelHojaSel || undefined,
        })
        resultado = await api(`/diseno-geometrico/ejes/${eje.id}/import-filas`, {
          method: 'POST',
          body: JSON.stringify({ filas, reemplazar: true, config }),
        })
      } else {
        throw new Error('Use un archivo .csv o .xlsx / .xls')
      }
      if (!resultado?.ok) {
        throw new Error('El servidor no confirmó la importación. Inténtelo de nuevo.')
      }
      const estaciones = resultado.estaciones ?? resultado.filas_importadas ?? 0
      const cotas = resultado.cotas_leidas ?? 0
      resetArchivo()
      await onReload?.(eje.id)
      mostrarAviso(
        'ok',
        `Importación exitosa: ${estaciones} estación(es) y ${cotas} cota(s) leídas.`,
      )
    } catch (e) {
      setFaseImport('configurando')
      mostrarAviso('error', e?.message || 'No se pudo importar el diseño geométrico.')
    } finally {
      setLocalBusy(false)
      setFaseImport((prev) => (prev === 'importando' ? '' : prev))
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
        onClick={() => { if (!working && !modalImportConfig && !modalExcelHoja && !previewOpen && !importing) onClose?.() }}
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
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    style={{ display: 'none' }}
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={(e) => { void onFileSelected(e.target.files?.[0]) }}
                  />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <IconAction title="Descargar plantilla CSV" onClick={descargarPlantilla} disabled={importing}>
                      <IconDownload />
                    </IconAction>
                    <PermisoAviso permisos={permisos} accion="editar">
                      {puede(permisos, 'editar') && (
                        <IconAction
                          title={importing ? 'Importando diseño…' : 'Cargar diseño geométrico (CSV o Excel)'}
                          onClick={abrirSelectorArchivo}
                          disabled={importing}
                          style={{ cursor: importing ? 'wait' : 'pointer' }}
                        >
                          <IconUpload />
                        </IconAction>
                      )}
                    </PermisoAviso>
                    {rasante.length > 0 && (
                      <IconAction title="Vista previa del diseño" onClick={() => setPreviewOpen(true)} disabled={importing}>
                        <IconEye />
                      </IconAction>
                    )}
                    {rasante.length > 0 && puede(permisos, 'editar') && (
                      <IconAction
                        title="Eliminar rasante importada"
                        danger
                        onClick={eliminarRasante}
                        disabled={importing}
                      >
                        <IconTrash />
                      </IconAction>
                    )}
                    {importing && (
                      <span
                        role="status"
                        aria-live="polite"
                        style={{
                          fontSize: 'var(--cc-xs)',
                          color: ui.textMuted,
                          fontWeight: 600,
                        }}
                      >
                        {faseImport === 'leyendo' && 'Leyendo archivo…'}
                        {faseImport === 'configurando' && 'Configure la sección para continuar…'}
                        {faseImport === 'importando' && 'Importando diseño…'}
                        {!faseImport && 'Procesando…'}
                      </span>
                    )}
                  </div>
                  {avisoImport && (
                    <div
                      role="alert"
                      style={{
                        marginBottom: 8,
                        padding: '8px 10px',
                        borderRadius: 8,
                        fontSize: 'var(--cc-xs)',
                        lineHeight: 1.45,
                        border: `1px solid ${
                          avisoImport.tipo === 'ok' ? '#86efac'
                            : avisoImport.tipo === 'error' ? '#fca5a5'
                              : (ui.t?.border || '#cbd5e1')
                        }`,
                        background: avisoImport.tipo === 'ok' ? '#f0fdf4'
                          : avisoImport.tipo === 'error' ? '#fef2f2'
                            : (ui.t?.bg || 'transparent'),
                        color: avisoImport.tipo === 'ok' ? '#166534'
                          : avisoImport.tipo === 'error' ? '#991b1b'
                            : ui.text,
                      }}
                    >
                      {avisoImport.texto}
                    </div>
                  )}
                  {!rasante.length && !avisoImport && (
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

      <DisenoExcelHojaModal
        open={modalExcelHoja}
        nombreArchivo={archivoPendiente?.name}
        hojas={excelHojas}
        selected={excelHojaSel}
        zIndex={100085}
        onSelect={setExcelHojaSel}
        onConfirm={(hoja) => {
          setExcelHojaSel(hoja)
          setModalExcelHoja(false)
          setFaseImport('configurando')
          setModalImportConfig(true)
        }}
        onClose={() => {
          if (!localBusy) {
            resetArchivo()
            setAvisoImport({ tipo: 'info', texto: 'Importación cancelada.' })
          }
        }}
      />

      <DisenoImportConfigModal
        open={modalImportConfig}
        nombreArchivo={
          (archivoPendiente?.name || '')
            + (excelHojaSel && excelHojas.length > 1 ? ` · hoja «${excelHojaSel}»` : '')
        }
        zIndex={100090}
        busy={localBusy}
        onConfirm={ejecutarImportacion}
        onClose={() => {
          if (!localBusy) {
            resetArchivo()
            setAvisoImport({ tipo: 'info', texto: 'Importación cancelada.' })
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

      {faseImport === 'importando' && (
        <div
          role="status"
          aria-live="assertive"
          aria-label="Importando diseño geométrico"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100095,
            background: 'rgba(15,23,42,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'all',
          }}
        >
          <div style={{
            ...ui.card,
            padding: '18px 22px',
            minWidth: 240,
            textAlign: 'center',
            fontWeight: 700,
            color: ui.text,
          }}>
            Importando diseño…
          </div>
        </div>
      )}
    </>
  )
}
