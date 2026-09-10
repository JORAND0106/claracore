import { useCallback, useEffect, useMemo, useState } from 'react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import {
  tFrom,
  isDarkMode,
  isRestMode,
  buildContratoUiTheme,
} from '../../theme/adminPanelTheme'
import ContratoLaboralBlock from './ContratoLaboralBlock'
import DocumentosTrabajadorBlock from './DocumentosTrabajadorBlock'
import TiposContratoCatalogo from './TiposContratoCatalogo'
import TrabajadorFormSheet from './TrabajadorFormSheet'
import { createRrhhApi } from './rrhhApi'
import {
  EMPTY_TRABAJADOR_FORM,
  formFromTrabajador,
  fmtSalario,
  nombreCompleto,
  payloadFromForm,
} from './rrhhHelpers'
import { accesoRrhh } from './rrhhPermisos'
import { rrhhSheetCssVars, rrhhSheetStyles, rrhhUi } from './rrhhSheetStyles'

/**
 * Módulo RRHH — Documentación para contratación (fase 1).
 * Independiente de Bitácora y Subcontratistas.
 */
export default function ModuloRrhh({ t, usuario, token, contratoId, themeMode }) {
  const theme = themeMode || (isDarkMode(t) ? 'dark' : isRestMode(t) ? 'rest' : 'light')
  const tTok = tFrom(theme) || t || {}
  const uiTheme = buildContratoUiTheme(theme, tTok)
  const sheetUi = rrhhSheetStyles(tTok)
  const sheetCssVars = rrhhSheetCssVars(tTok)
  const S = rrhhUi(theme, tTok)
  const permisos = accesoRrhh(usuario, contratoId)
  const cid = contratoId || usuario?.contrato_id
  const api = useMemo(() => (cid && token ? createRrhhApi(cid, token) : null), [cid, token])

  const [seccion, setSeccion] = useState('trabajadores') // trabajadores | catalogo
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [msg, setMsg] = useState(null)
  const [empresas, setEmpresas] = useState([])
  const [tipos, setTipos] = useState([])
  const [busy, setBusy] = useState(false)

  const [showCrear, setShowCrear] = useState(false)
  const [crearForm, setCrearForm] = useState({ ...EMPTY_TRABAJADOR_FORM })

  const [detalle, setDetalle] = useState(null)
  const [tabDetalle, setTabDetalle] = useState('datos')
  const [editForm, setEditForm] = useState(null)
  const [editando, setEditando] = useState(false)

  const flash = useCallback((type, text) => {
    setMsg({ type, text })
    window.setTimeout(() => setMsg(null), 4200)
  }, [])

  const cargar = useCallback(async () => {
    if (!api || !permisos.ver) return
    setLoading(true)
    try {
      const [trab, emp, tip] = await Promise.all([
        api.listTrabajadores({ q: filtro || undefined }),
        api.listEmpresas(),
        api.listTiposContrato(false),
      ])
      setItems(trab?.items || [])
      setEmpresas(emp?.opciones || [])
      setTipos(tip?.items || [])
    } catch (e) {
      flash('error', e.message || 'No se pudo cargar RRHH.')
    } finally {
      setLoading(false)
    }
  }, [api, permisos.ver, filtro, flash])

  useEffect(() => {
    cargar()
  }, [cargar])

  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    zIndex: 10001,
    background: uiTheme.overlay || 'rgba(15,23,42,0.55)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  }
  const modalStyle = (w) => ({
    width: `min(${w}px, 98vw)`,
    maxHeight: '94vh',
    background: tTok.bgCard,
    borderRadius: 14,
    border: `1px solid ${tTok.border}`,
    boxShadow: uiTheme.shadow,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    ...sheetCssVars,
    fontSize: 'var(--cc-sm)',
    color: 'var(--cc-text)',
    fontFamily: 'inherit',
  })
  const modalHead = {
    padding: '12px 20px 10px',
    borderBottom: `1px solid ${tTok.border}`,
    background: tTok.headerBg || tTok.bgCard,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexShrink: 0,
    gap: 10,
  }
  const modalScroll = {
    flex: 1,
    overflowY: 'auto',
    padding: '14px 20px',
    scrollbarWidth: 'thin',
    background: isDarkMode(theme) ? tTok.bg : (isRestMode(theme) ? tTok.bg : tTok.inputBg),
    WebkitOverflowScrolling: 'touch',
  }

  const tabsDetalle = [
    { id: 'datos', label: 'Registro' },
    { id: 'soporte', label: 'Docs. soporte' },
    { id: 'contrato', label: 'Contrato laboral' },
    { id: 'ingreso', label: 'Docs. ingreso' },
  ]

  const abrirDetalle = async (row) => {
    if (!api) return
    try {
      const full = await api.getTrabajador(row.id)
      setDetalle(full)
      setEditForm(formFromTrabajador(full))
      setEditando(false)
      setTabDetalle('datos')
    } catch (e) {
      flash('error', e.message || 'No se pudo abrir el trabajador.')
    }
  }

  const guardarCrear = async () => {
    if (!api || !permisos.crear) return
    setBusy(true)
    try {
      const created = await api.createTrabajador(payloadFromForm(crearForm))
      flash('success', 'Trabajador registrado.')
      setShowCrear(false)
      setCrearForm({ ...EMPTY_TRABAJADOR_FORM })
      await cargar()
      await abrirDetalle(created)
    } catch (e) {
      flash('error', e.message || 'No se pudo registrar.')
    } finally {
      setBusy(false)
    }
  }

  const guardarEdicion = async () => {
    if (!api || !permisos.editar || !detalle) return
    setBusy(true)
    try {
      const updated = await api.updateTrabajador(detalle.id, payloadFromForm(editForm))
      setDetalle(updated)
      setEditForm(formFromTrabajador(updated))
      setEditando(false)
      flash('success', 'Trabajador actualizado.')
      await cargar()
    } catch (e) {
      flash('error', e.message || 'No se pudo actualizar.')
    } finally {
      setBusy(false)
    }
  }

  const eliminarTrabajador = async () => {
    if (!api || !permisos.eliminar || !detalle) return
    if (!window.confirm(`¿Eliminar a ${nombreCompleto(detalle)}?`)) return
    setBusy(true)
    try {
      await api.deleteTrabajador(detalle.id)
      setDetalle(null)
      flash('success', 'Trabajador eliminado.')
      await cargar()
    } catch (e) {
      flash('error', e.message || 'No se pudo eliminar.')
    } finally {
      setBusy(false)
    }
  }

  if (!permisos.ver) {
    return (
      <div style={{
        maxWidth: 560,
        margin: '0 auto',
        textAlign: 'center',
        padding: '32px 24px',
        background: tTok.bgCard,
        border: `1px solid ${tTok.border}`,
        borderRadius: 12,
      }}>
        <div style={{ fontSize: 'var(--cc-lg)', fontWeight: 700, color: tTok.text, marginBottom: 10 }}>RRHH</div>
        <div style={{ fontSize: 'var(--cc-body)', color: tTok.textMuted, lineHeight: 1.5 }}>
          Tu cargo no tiene permiso para este módulo. Un administrador puede habilitarlo en Panel admin → Control de accesos → función «RRHH» (acción Ver).
        </div>
      </div>
    )
  }

  if (!cid) {
    return (
      <div style={{ padding: 24, color: tTok.textMuted }}>
        Seleccione un contrato de obra para gestionar RRHH.
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, ...sheetCssVars }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        marginBottom: 12,
      }}>
        <div>
          <div style={{ fontSize: 'var(--cc-h2)', fontWeight: 800, color: tTok.text }}>RRHH</div>
          <div style={{ fontSize: 'var(--cc-sm)', color: tTok.textMuted }}>
            Documentación para contratación — registro, contrato laboral y documentos de ingreso
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            style={{
              ...S.btnGhost,
              background: seccion === 'trabajadores' ? `${tTok.primary}22` : 'transparent',
              color: seccion === 'trabajadores' ? tTok.primary : tTok.textMuted,
              borderColor: seccion === 'trabajadores' ? tTok.primary : tTok.border,
            }}
            onClick={() => setSeccion('trabajadores')}
          >
            Trabajadores
          </button>
          <button
            type="button"
            style={{
              ...S.btnGhost,
              background: seccion === 'catalogo' ? `${tTok.primary}22` : 'transparent',
              color: seccion === 'catalogo' ? tTok.primary : tTok.textMuted,
              borderColor: seccion === 'catalogo' ? tTok.primary : tTok.border,
            }}
            onClick={() => setSeccion('catalogo')}
          >
            Tipos de contrato
          </button>
          {seccion === 'trabajadores' && permisos.crear && (
            <button
              type="button"
              style={S.btnPrimary}
              onClick={() => {
                setCrearForm({ ...EMPTY_TRABAJADOR_FORM })
                setShowCrear(true)
              }}
            >
              + Registrar trabajador
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div style={{
          marginBottom: 10,
          padding: '10px 12px',
          borderRadius: 8,
          background: msg.type === 'error' ? 'rgba(220,38,38,0.12)' : 'rgba(4,120,87,0.12)',
          color: msg.type === 'error' ? S.dangerColor : S.successColor,
          fontWeight: 600,
          fontSize: 'var(--cc-sm)',
        }}>
          {msg.text}
        </div>
      )}

      {seccion === 'catalogo' ? (
        <div style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          background: tTok.bgCard,
          border: `1px solid ${tTok.border}`,
          borderRadius: 12,
          padding: 14,
        }}>
          <TiposContratoCatalogo
            theme={theme}
            items={tipos}
            canAdmin={permisos.puedeAdminCatalogo}
            busy={busy}
            onCreate={async (body) => {
              setBusy(true)
              try {
                await api.createTipoContrato(body)
                flash('success', 'Tipo de contrato agregado.')
                await cargar()
              } catch (e) {
                flash('error', e.message || 'No se pudo crear.')
              } finally {
                setBusy(false)
              }
            }}
            onUpdate={async (id, body) => {
              setBusy(true)
              try {
                await api.updateTipoContrato(id, body)
                flash('success', 'Catálogo actualizado.')
                await cargar()
              } catch (e) {
                flash('error', e.message || 'No se pudo actualizar.')
              } finally {
                setBusy(false)
              }
            }}
          />
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <input
              style={{ ...S.input, maxWidth: 360 }}
              placeholder="Buscar por nombre, documento, cargo o empresa…"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            />
            <button type="button" style={S.btnGhost} onClick={cargar}>Actualizar</button>
          </div>
          <div style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            background: tTok.bgCard,
            border: `1px solid ${sheetUi.border}`,
            borderRadius: 8,
            ...sheetCssVars,
          }}>
            <table style={{ ...sheetUi.sheetTable, tableLayout: 'auto' }}>
              <thead>
                <tr>
                  <th style={sheetUi.th}>Trabajador</th>
                  <th style={sheetUi.th}>Documento</th>
                  <th style={sheetUi.th}>Cargo</th>
                  <th style={sheetUi.th}>Empresa</th>
                  <th style={sheetUi.th}>Salario</th>
                  <th style={sheetUi.th}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td style={sheetUi.td} colSpan={6}>Cargando…</td></tr>
                )}
                {!loading && items.length === 0 && (
                  <tr>
                    <td style={sheetUi.td} colSpan={6}>
                      No hay trabajadores registrados. Use «Registrar trabajador» para iniciar la documentación de contratación.
                    </td>
                  </tr>
                )}
                {items.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => abrirDetalle(row)}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = `${tTok.primary}10` }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <td style={sheetUi.td}>{nombreCompleto(row)}</td>
                    <td style={sheetUi.td}>{row.tipo_documento} {row.numero_documento}</td>
                    <td style={sheetUi.td}>{row.cargo_aspira || '—'}</td>
                    <td style={sheetUi.td}>
                      {row.empresa_tipo === 'subcontratista' ? 'Sub · ' : 'Consorcio · '}
                      {row.empresa_nombre}
                    </td>
                    <td style={sheetUi.td}>{fmtSalario(row.salario)}</td>
                    <td style={sheetUi.td}>{row.estado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal crear */}
      {showCrear && (
        <div style={overlayStyle} onClick={() => !busy && setShowCrear(false)}>
          <div style={modalStyle(920)} onClick={(e) => e.stopPropagation()}>
            <CcModalBrandHeader theme={theme} />
            <div style={modalHead}>
              <div style={{ fontWeight: 800, fontSize: 'var(--cc-h2)', color: tTok.text }}>
                Registrar trabajador
              </div>
              <button type="button" style={S.btnGhost} onClick={() => setShowCrear(false)}>Cerrar</button>
            </div>
            <div style={modalScroll}>
              <TrabajadorFormSheet
                theme={theme}
                form={crearForm}
                onChange={setCrearForm}
                canEdit
                empresas={empresas}
                tiposContrato={tipos}
              />
            </div>
            <div style={{
              padding: '12px 20px',
              borderTop: `1px solid ${tTok.border}`,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              background: tTok.bgCard,
            }}>
              <button type="button" style={S.btnGhost} disabled={busy} onClick={() => setShowCrear(false)}>Cancelar</button>
              <button type="button" style={S.btnPrimary} disabled={busy} onClick={guardarCrear}>
                {busy ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal detalle */}
      {detalle && (
        <div style={overlayStyle} onClick={() => !busy && setDetalle(null)}>
          <div style={modalStyle(980)} onClick={(e) => e.stopPropagation()}>
            <CcModalBrandHeader theme={theme} />
            <div style={modalHead}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 'var(--cc-h2)', color: tTok.text }}>
                  {nombreCompleto(detalle)}
                </div>
                <div style={{ fontSize: 'var(--cc-caption)', color: tTok.textMuted }}>
                  {detalle.tipo_documento} {detalle.numero_documento} · {detalle.empresa_nombre}
                </div>
              </div>
              <button type="button" style={S.btnGhost} onClick={() => setDetalle(null)}>Cerrar</button>
            </div>
            <div style={{
              display: 'flex',
              gap: 6,
              padding: '8px 16px',
              borderBottom: `1px solid ${tTok.border}`,
              overflowX: 'auto',
              background: tTok.bgCard,
              flexShrink: 0,
            }}>
              {tabsDetalle.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTabDetalle(tab.id)}
                  style={{
                    ...S.btnGhost,
                    whiteSpace: 'nowrap',
                    background: tabDetalle === tab.id ? `${tTok.primary}22` : 'transparent',
                    color: tabDetalle === tab.id ? tTok.primary : tTok.textMuted,
                    borderColor: tabDetalle === tab.id ? tTok.primary : tTok.border,
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div style={modalScroll}>
              {tabDetalle === 'datos' && (
                <>
                  <TrabajadorFormSheet
                    theme={theme}
                    form={editForm || formFromTrabajador(detalle)}
                    onChange={setEditForm}
                    canEdit={editando && permisos.editar}
                    empresas={empresas}
                    tiposContrato={tipos}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                    {!editando && permisos.editar && (
                      <button type="button" style={S.btnPrimary} onClick={() => setEditando(true)}>Editar</button>
                    )}
                    {editando && (
                      <>
                        <button type="button" style={S.btnPrimary} disabled={busy} onClick={guardarEdicion}>
                          {busy ? 'Guardando…' : 'Guardar cambios'}
                        </button>
                        <button
                          type="button"
                          style={S.btnGhost}
                          disabled={busy}
                          onClick={() => {
                            setEditForm(formFromTrabajador(detalle))
                            setEditando(false)
                          }}
                        >
                          Cancelar
                        </button>
                      </>
                    )}
                    {permisos.eliminar && (
                      <button type="button" style={S.btnDanger} disabled={busy} onClick={eliminarTrabajador}>
                        Eliminar
                      </button>
                    )}
                  </div>
                </>
              )}
              {tabDetalle === 'soporte' && (
                <DocumentosTrabajadorBlock
                  theme={theme}
                  api={api}
                  trabajadorId={detalle.id}
                  categoria="soporte"
                  canEdit={permisos.crear || permisos.editar}
                  onMsg={(m) => flash(m.type, m.text)}
                />
              )}
              {tabDetalle === 'contrato' && (
                <ContratoLaboralBlock
                  theme={theme}
                  api={api}
                  trabajadorId={detalle.id}
                  tiposContrato={tipos}
                  tipoContratoId={editForm?.tipo_contrato_id || detalle.tipo_contrato_id || ''}
                  onTipoContratoChange={(v) => setEditForm((prev) => ({ ...(prev || formFromTrabajador(detalle)), tipo_contrato_id: v }))}
                  canEdit={permisos.crear || permisos.editar}
                  canExport={permisos.exportar || permisos.ver}
                  onMsg={(m) => flash(m.type, m.text)}
                />
              )}
              {tabDetalle === 'ingreso' && (
                <DocumentosTrabajadorBlock
                  theme={theme}
                  api={api}
                  trabajadorId={detalle.id}
                  categoria="ingreso"
                  canEdit={permisos.crear || permisos.editar}
                  onMsg={(m) => flash(m.type, m.text)}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
