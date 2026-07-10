import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE } from '../../apiBase'
import { parseDisenoExcelBuffer } from '../../utils/disenoGeometricoParse'
import DisenoImportConfigModal from './DisenoImportConfigModal'
import DisenoEstructuraPanel, { DisenoNuevaEstructuraModal, sumEspesores } from './DisenoEstructuraPanel'
import TopoConfirmModal from './TopoConfirmModal'
import TopoErrorModal from './TopoErrorModal'
import {
  parseApiError,
  PanelColapsable,
  PermisoAviso,
  puede,
  TopoHelpIcon,
  useTopografiaApi,
  useTopoTheme,
  useTopoViewport,
} from './topografiaShared'

const AYUDA_MODULO_DISENO =
  'Configure el diseño geométrico de la vía por eje: cargue la rasante (capa terminada) con TRAMO, ABSCISA, '
  + 'IZQUIERDA, EJE, DERECHA y ANCHO. Defina el esquema transversal al importar y la estructura de vía con capas '
  + 'y espesores (de terminado hacia abajo).'

function fmtN(v, dec = 3) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(dec) : '—'
}

function fmtOrdenadaCol(o) {
  const n = Number(o)
  if (!Number.isFinite(n)) return '—'
  if (Math.abs(n) < 1e-9) return '0.00'
  return n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2)
}

function cotasEnAbscisa(cotasPorAbscisa, abscisa) {
  for (const [pk, cotas] of cotasPorAbscisa) {
    if (Math.abs(pk - abscisa) < 1e-6) return cotas
  }
  return null
}

export default function DisenoGeometricoForm({ contratoId, token, permisos }) {
  const ui = useTopoTheme()
  const { isCompact } = useTopoViewport()
  const { api } = useTopografiaApi(contratoId, token)
  const fileRef = useRef(null)

  const [lista, setLista] = useState([])
  const [sel, setSel] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [creando, setCreando] = useState(false)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [busy, setBusy] = useState(false)
  const [modalNuevaEstructura, setModalNuevaEstructura] = useState(false)
  const [modalImportConfig, setModalImportConfig] = useState(false)
  const [archivoPendiente, setArchivoPendiente] = useState(null)
  const [confirmEliminar, setConfirmEliminar] = useState(null)
  const [confirmEliminarRasante, setConfirmEliminarRasante] = useState(false)
  const [rasanteAbierta, setRasanteAbierta] = useState(false)
  const [estructuraAbierta, setEstructuraAbierta] = useState(true)
  const [errorModal, setErrorModal] = useState(null)

  const showError = useCallback((err) => {
    setErrorModal(parseApiError(err?.message || String(err)))
  }, [])

  const cargarLista = useCallback(async () => {
    try {
      const data = await api(`/diseno-geometrico/ejes?_=${Date.now()}`)
      setLista(Array.isArray(data) ? data : [])
    } catch (e) {
      showError(e)
    }
  }, [api, showError])

  const cargarDetalle = useCallback(async (id) => {
    setCreando(false)
    setSel(id)
    try {
      const data = await api(`/diseno-geometrico/ejes/${id}?_=${Date.now()}`)
      setDetalle(data)
    } catch (e) {
      showError(e)
    }
  }, [api, showError])

  useEffect(() => {
    cargarLista()
  }, [cargarLista])

  useEffect(() => {
    if (!lista.length || sel || creando) return
    cargarDetalle(lista[0].id)
  }, [lista, sel, creando, cargarDetalle])

  const abrirNuevo = () => {
    setCreando(true)
    setSel(null)
    setDetalle(null)
    setNombreNuevo('')
  }

  const crearEje = async () => {
    const nombre = nombreNuevo.trim()
    if (!nombre) {
      showError(new Error('Indique el nombre del eje.'))
      return
    }
    setBusy(true)
    try {
      const row = await api('/diseno-geometrico/ejes', {
        method: 'POST',
        body: JSON.stringify({ nombre }),
      })
      await cargarLista()
      if (row?.id) await cargarDetalle(row.id)
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
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
      showError(e)
    }
  }

  const onFileSelected = (file) => {
    if (!file) return
    setArchivoPendiente(file)
    setModalImportConfig(true)
    if (fileRef.current) fileRef.current.value = ''
  }

  const ejecutarImportacion = async (config) => {
    if (!sel || !archivoPendiente) return
    setBusy(true)
    try {
      const name = archivoPendiente.name.toLowerCase()
      if (name.endsWith('.csv')) {
        const contenido = await archivoPendiente.text()
        await api(`/diseno-geometrico/ejes/${sel}/import-csv`, {
          method: 'POST',
          body: JSON.stringify({ contenido, reemplazar: true, config }),
        })
      } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const buf = await archivoPendiente.arrayBuffer()
        const filas = parseDisenoExcelBuffer(buf)
        await api(`/diseno-geometrico/ejes/${sel}/import-filas`, {
          method: 'POST',
          body: JSON.stringify({ filas, reemplazar: true, config }),
        })
      } else {
        throw new Error('Use archivo .csv o .xlsx')
      }
      setModalImportConfig(false)
      setArchivoPendiente(null)
      await cargarDetalle(sel)
      await cargarLista()
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const guardarEstructuraVigente = async (capas, nombre) => {
    if (!sel) return
    setBusy(true)
    try {
      await api(`/diseno-geometrico/ejes/${sel}/estructura`, {
        method: 'PUT',
        body: JSON.stringify({ capas, nombre: nombre || undefined }),
      })
      await cargarDetalle(sel)
      await cargarLista()
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const crearNuevaEstructura = async (nombre, capas) => {
    if (!sel) return
    setBusy(true)
    try {
      await api(`/diseno-geometrico/ejes/${sel}/estructura`, {
        method: 'POST',
        body: JSON.stringify({ nombre, capas }),
      })
      setModalNuevaEstructura(false)
      await cargarDetalle(sel)
      await cargarLista()
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const eliminarRasante = async () => {
    if (!sel) return
    setBusy(true)
    try {
      await api(`/diseno-geometrico/ejes/${sel}/rasante`, { method: 'DELETE' })
      setConfirmEliminarRasante(false)
      setRasanteAbierta(false)
      await cargarDetalle(sel)
      await cargarLista()
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const eliminarEje = async () => {
    const id = confirmEliminar?.id
    if (!id) return
    setBusy(true)
    try {
      await api(`/diseno-geometrico/ejes/${id}`, { method: 'DELETE' })
      if (sel === id) {
        setSel(null)
        setDetalle(null)
      }
      setConfirmEliminar(null)
      await cargarLista()
      if (sel === id && lista.length > 1) {
        const rest = lista.filter((e) => e.id !== id)
        if (rest[0]) await cargarDetalle(rest[0].id)
      } else if (sel === id) {
        setCreando(true)
      }
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const eje = detalle?.eje
  const rasante = detalle?.rasante || []
  const perfilPuntos = detalle?.perfil_puntos || []
  const estructuraVigente = detalle?.estructura_vigente
  const estructuras = detalle?.estructuras || []
  const capas = detalle?.capas || []

  const puntosPorAbscisa = useMemo(() => {
    const map = new Map()
    perfilPuntos.forEach((p) => {
      const key = p.abscisa
      if (!map.has(key)) map.set(key, new Map())
      map.get(key).set(p.ordenada, p.cota)
    })
    return map
  }, [perfilPuntos])

  const columnasOrdenada = useMemo(() => {
    if (!perfilPuntos.length) return null
    return [...new Set(perfilPuntos.map((p) => p.ordenada))].sort((a, b) => a - b)
  }, [perfilPuntos])

  const ordenadasReferencia = useMemo(() => {
    const set = new Set()
    perfilPuntos.filter((p) => p.es_referencia).forEach((p) => set.add(p.ordenada))
    return set
  }, [perfilPuntos])

  const seccionLabel = eje?.tipo_seccion && eje?.ancho_via_m
    ? `Sección ${eje.tipo_seccion} · ${fmtN(eje.ancho_via_m, 2)} m`
    : null

  return (
    <div>
      <div style={ui.tabBar} role="tablist" aria-label="Ejes configuración DG">
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <PermisoAviso permisos={permisos} accion="crear">
            <button
              type="button"
              style={{ ...ui.tabBtn(creando), borderStyle: 'dashed', color: ui.accent }}
              onClick={abrirNuevo}
              title="Nuevo eje / tramo"
            >
              + Nuevo
            </button>
          </PermisoAviso>
          <TopoHelpIcon ayuda={AYUDA_MODULO_DISENO} />
        </div>
        {lista.map((n) => {
          const active = sel === n.id && !creando
          const src = sel === n.id && eje ? { ...n, ...eje } : n
          const label = (src.nombre || '').trim() || 'Sin nombre'
          const ok = (src.filas_rasante || 0) > 0 && (src.num_capas || 0) > 0
          return (
            <div key={n.id} style={{ display: 'inline-flex', alignItems: 'stretch', flexShrink: 0 }}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                style={ui.tabBtn(active)}
                onClick={() => cargarDetalle(n.id)}
                title={label}
              >
                <span>{label}</span>
                <small style={{ color: ui.textMuted, fontWeight: 400 }}>
                  ({src.filas_rasante || 0} pk · {src.num_capas || 0} capas{ok ? ' · listo' : ''})
                </small>
              </button>
              {puede(permisos, 'eliminar') && (
                <button
                  type="button"
                  title="Eliminar eje"
                  onClick={(e) => {
                    e.stopPropagation()
                    setConfirmEliminar({ id: n.id, nombre: label })
                  }}
                  style={{
                    ...ui.btnSecondary,
                    color: '#dc2626',
                    padding: '0 8px',
                    marginLeft: -4,
                    borderRadius: '0 8px 0 0',
                    alignSelf: 'stretch',
                    fontSize: 'var(--cc-lg)',
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          )
        })}
      </div>

      {!lista.length && !creando && (
        <p style={{ color: ui.textMuted, fontSize: 'var(--cc-sm)', margin: '0 0 12px' }}>
          Aún no hay ejes. Pulse «+ Nuevo» para comenzar.
        </p>
      )}

      {creando && (
        <PermisoAviso permisos={permisos} accion="crear">
          <div style={{ ...ui.card, marginBottom: 16, padding: '14px 16px' }}>
            <label style={{ display: 'block', marginBottom: 10 }}>
              <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>Nombre del eje / tramo</span>
              <input
                value={nombreNuevo}
                onChange={(e) => setNombreNuevo(e.target.value)}
                placeholder="Eje 1"
                style={{ ...ui.inputStyle, display: 'block', marginTop: 4, maxWidth: 320 }}
              />
            </label>
            <button type="button" style={ui.btnPrimary} onClick={crearEje} disabled={busy}>
              {busy ? 'Creando…' : 'Crear eje'}
            </button>
          </div>
        </PermisoAviso>
      )}

      {detalle && eje && !creando && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ ...ui.card, padding: '14px 16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 16px', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, flex: '1 1 auto', fontSize: 'var(--cc-lg)', color: ui.text }}>
                {eje.nombre}
              </h3>
              <button type="button" style={ui.btnSecondary} onClick={descargarPlantilla}>
                Descargar plantilla CSV
              </button>
              <PermisoAviso permisos={permisos} accion="editar">
                <label style={{ ...ui.btnPrimary, cursor: busy ? 'wait' : 'pointer', margin: 0 }}>
                  {busy ? 'Importando…' : 'Subir CSV / Excel'}
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    style={{ display: 'none' }}
                    disabled={busy}
                    onChange={(e) => onFileSelected(e.target.files?.[0])}
                  />
                </label>
              </PermisoAviso>
              {rasante.length > 0 && puede(permisos, 'editar') && (
                <button
                  type="button"
                  style={{ ...ui.btnSecondary, color: '#dc2626' }}
                  disabled={busy}
                  onClick={() => setConfirmEliminarRasante(true)}
                >
                  Eliminar rasante importada
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
              <span><strong style={{ color: ui.text }}>{rasante.length}</strong> estaciones CSV</span>
              <span><strong style={{ color: ui.text }}>{capas.length}</strong> capas (vigente)</span>
              {eje.estructura_vigente_nombre && (
                <span>Estructura: <strong style={{ color: ui.text }}>{eje.estructura_vigente_nombre}</strong></span>
              )}
              {seccionLabel && <span>{seccionLabel}</span>}
              {eje.calcular_intermedias && eje.paso_intermedias_m && (
                <span>Intermedias transv. cada {fmtN(eje.paso_intermedias_m, 2)} m en ordenadas</span>
              )}
              {perfilPuntos.length > 0 && (
                <span><strong style={{ color: ui.text }}>{perfilPuntos.length}</strong> pts transversales</span>
              )}
              {eje.abscisa_min != null && eje.abscisa_max != null && (
                <span>PK {fmtN(eje.abscisa_min, 2)} – {fmtN(eje.abscisa_max, 2)}</span>
              )}
            </div>

            {!rasante.length && (
              <p style={{ margin: '12px 0 0', fontSize: 'var(--cc-xs)', color: ui.t?.warn || '#b45309' }}>
                Suba el CSV o Excel con el diseño geométrico (rasante / capa terminada).
              </p>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ flex: isCompact ? '1 1 100%' : '0 0 55%', minWidth: isCompact ? 0 : 320, maxWidth: isCompact ? '100%' : 780, width: isCompact ? '100%' : undefined }}>
              <PanelColapsable
                ui={ui}
                titulo="Estructura de vía"
                abierto={estructuraAbierta}
                onToggle={() => setEstructuraAbierta((v) => !v)}
                resumen={[
                  estructuraVigente?.nombre || eje.estructura_vigente_nombre || 'Sin definir',
                  `${capas.length} capas`,
                  capas.length ? `Σ ${sumEspesores(capas.map((c) => ({ espesor_m: c.espesor_m }))).toFixed(3)} m` : null,
                ].filter(Boolean).join(' · ')}
              >
                <DisenoEstructuraPanel
                  embed
                  estructuraVigente={estructuraVigente || (capas.length ? { capas, nombre: eje.estructura_vigente_nombre, vigente: true } : null)}
                  estructuras={estructuras}
                  permisos={permisos}
                  busy={busy}
                  onGuardar={guardarEstructuraVigente}
                />
              </PanelColapsable>
            </div>
            <div style={{ flex: isCompact ? '1 1 100%' : '1 1 35%', minWidth: isCompact ? 0 : 240, width: isCompact ? '100%' : undefined }}>
              <div style={{ ...ui.card, padding: '14px 16px', height: '100%' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: 'var(--cc-base)', color: ui.text }}>
                  Nueva estructura
                </h4>
                <p style={{ margin: '0 0 12px', fontSize: 'var(--cc-xs)', color: ui.textMuted, lineHeight: 1.45 }}>
                  Cree una versión alternativa de la estructura de vía. La vigente queda en el panel izquierdo;
                  la nueva pasa a ser la activa al guardarla.
                </p>
                <PermisoAviso permisos={permisos} accion="editar">
                  <button
                    type="button"
                    style={ui.btnSecondary}
                    onClick={() => setModalNuevaEstructura(true)}
                    disabled={busy}
                  >
                    + Nueva estructura
                  </button>
                </PermisoAviso>
              </div>
            </div>
          </div>

          {rasante.length > 0 && (
            <PanelColapsable
              ui={ui}
              titulo="Rasante importada"
              abierto={rasanteAbierta}
              onToggle={() => setRasanteAbierta((v) => !v)}
              resumen={[
                `${rasante.length} estaciones`,
                columnasOrdenada && eje.calcular_intermedias
                  ? `${columnasOrdenada.length} ordenadas · paso ${fmtN(eje.paso_intermedias_m, 2)} m`
                  : null,
                eje.abscisa_min != null && eje.abscisa_max != null
                  ? `PK ${fmtN(eje.abscisa_min, 2)} – ${fmtN(eje.abscisa_max, 2)}`
                  : null,
                seccionLabel,
              ].filter(Boolean).join(' · ')}
              style={{ marginBottom: 0, padding: '12px 14px' }}
            >
              {eje.calcular_intermedias && columnasOrdenada && (
                <p style={{ margin: '0 0 10px', fontSize: 'var(--cc-xs)', color: ui.textMuted, lineHeight: 1.45 }}>
                  Cotas por ordenada transversal (m). Columnas en negrita = puntos de referencia del CSV;
                  intermedias cada {fmtN(eje.paso_intermedias_m, 2)} m entre borde y eje.
                </p>
              )}
              <div style={{ overflowX: 'auto', maxHeight: isCompact ? 'min(52dvh, 420px)' : 480, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }} className="cc-topo-table-scroll">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-xs)' }}>
                  <thead>
                    <tr>
                      <th style={ui.th}>Tramo</th>
                      <th style={ui.th}>Abscisa</th>
                      {columnasOrdenada ? (
                        columnasOrdenada.map((o) => (
                          <th
                            key={o}
                            style={{
                              ...ui.th,
                              fontWeight: ordenadasReferencia.has(o) ? 700 : 500,
                            }}
                            title={ordenadasReferencia.has(o) ? 'Referencia CSV' : 'Intermedia calculada'}
                          >
                            {fmtOrdenadaCol(o)}
                          </th>
                        ))
                      ) : (
                        <>
                          <th style={ui.th}>Izquierda</th>
                          <th style={ui.th}>Eje</th>
                          <th style={ui.th}>Derecha</th>
                        </>
                      )}
                      <th style={ui.th}>Ancho</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rasante.slice(0, 60).map((r) => {
                      const cotas = cotasEnAbscisa(puntosPorAbscisa, r.abscisa)
                      return (
                        <tr key={r.id || `${r.tramo}-${r.abscisa}`}>
                          <td style={ui.td}>{r.tramo || '—'}</td>
                          <td style={ui.td}>{fmtN(r.abscisa, 2)}</td>
                          {columnasOrdenada ? (
                            columnasOrdenada.map((o) => (
                              <td
                                key={o}
                                style={{
                                  ...ui.td,
                                  fontWeight: ordenadasReferencia.has(o) ? 600 : 400,
                                }}
                              >
                                {fmtN(cotas?.get(o))}
                              </td>
                            ))
                          ) : (
                            <>
                              <td style={ui.td}>{fmtN(r.cota_izquierda)}</td>
                              <td style={ui.td}>{fmtN(r.cota_eje)}</td>
                              <td style={ui.td}>{fmtN(r.cota_derecha)}</td>
                            </>
                          )}
                          <td style={ui.td}>{fmtN(r.ancho, 2)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {rasante.length > 60 && (
                <p style={{ margin: '8px 0 0', fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
                  Mostrando 60 de {rasante.length} estaciones.
                </p>
              )}
            </PanelColapsable>
          )}
        </div>
      )}

      <DisenoImportConfigModal
        open={modalImportConfig}
        nombreArchivo={archivoPendiente?.name}
        onConfirm={ejecutarImportacion}
        onClose={() => {
          if (!busy) {
            setModalImportConfig(false)
            setArchivoPendiente(null)
          }
        }}
      />

      <DisenoNuevaEstructuraModal
        open={modalNuevaEstructura}
        onSave={crearNuevaEstructura}
        onClose={() => { if (!busy) setModalNuevaEstructura(false) }}
        saving={busy}
      />

      {confirmEliminarRasante && (
        <TopoConfirmModal
          theme={ui.t}
          titulo="Eliminar rasante importada"
          confirmLabel={busy ? 'Eliminando…' : 'Eliminar rasante'}
          onCancel={() => { if (!busy) setConfirmEliminarRasante(false) }}
          onConfirm={eliminarRasante}
        >
          ¿Eliminar la rasante importada de <strong>«{eje?.nombre || 'este eje'}»</strong>?
          Se conservan el eje y la estructura de vía; podrá volver a subir el CSV o Excel.
        </TopoConfirmModal>
      )}

      {confirmEliminar && (
        <TopoConfirmModal
          theme={ui.t}
          titulo="Eliminar eje"
          confirmLabel={busy ? 'Eliminando…' : 'Eliminar'}
          onCancel={() => { if (!busy) setConfirmEliminar(null) }}
          onConfirm={eliminarEje}
        >
          ¿Eliminar el eje <strong>«{confirmEliminar.nombre}»</strong> y todo su diseño y estructura?
        </TopoConfirmModal>
      )}

      {errorModal && (
        <TopoErrorModal theme={ui.t} titulo={errorModal.titulo} onClose={() => setErrorModal(null)}>
          {errorModal.mensaje}
        </TopoErrorModal>
      )}
    </div>
  )
}
