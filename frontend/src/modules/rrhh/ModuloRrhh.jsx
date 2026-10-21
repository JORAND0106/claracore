import { useCallback, useEffect, useMemo, useState } from 'react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import {
  tFrom,
  isDarkMode,
  isRestMode,
  buildContratoUiTheme,
} from '../../theme/adminPanelTheme'
import DocumentacionTab from './DocumentacionTab'
import { DocsFillBattery, DocsFillLegend } from './DocsFillBattery'
import LiquidacionPanel from './LiquidacionPanel'
import NominaPanel from './NominaPanel'
import TrabajadorFormSheet from './TrabajadorFormSheet'
import { createRrhhApi } from './rrhhApi'
import {
  EMPTY_TRABAJADOR_FORM,
  formFromTrabajador,
  fmtSalario,
  nombreCompleto,
  normalizarCargoNombrePropio,
  payloadFromForm,
  dataUrlToBlob,
  validateTrabajadorForm,
} from './rrhhHelpers'
import { accesoRrhh } from './rrhhPermisos'
import { rrhhSheetCssVars, rrhhSheetStyles, rrhhUi } from './rrhhSheetStyles'
import { pastelForEmpresa } from './rrhhTarjetaStyles'
import CumpleanosFestivoModal, { CumpleanosMesButton } from './CumpleanosFestivoModal'
import EstadoDocumentalInformeModal, {
  EstadoDocumentalInformeButton,
} from './EstadoDocumentalInformeModal'
import { ESTADO_DOCUMENTAL_CODIGO } from './estadoDocumentalInformeOptions.js'
import { auditoriaDocumentalActiva } from './rrhhFeatureFlags.js'
import { PASTEL_ESTADO_VALIDACION } from '../sicoe-obra/sicoeReporteItemsTablaHelpers'
import { createSeguimientoApi } from '../seguimiento/seguimientoApi'
import { trabajadorEsNuevoTrasApagado } from '../seguimiento/bitacoraAsistenciaRrhhPolicy'
import {
  estiloCeldaValidacion,
  labelEstadoValidacion,
  patchFilaValidacionAuditoria,
} from './rrhhValidacionCelda.js'

function iconBtnValidacion(pastel, disabled) {
  return {
    width: 36,
    height: 36,
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    border: `1px solid ${pastel.border}`,
    background: pastel.bg,
    color: pastel.color,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    fontFamily: 'inherit',
  }
}

function resumenValidacionMasiva(result) {
  const nOk = result?.n_actualizados || 0
  const nOmit = result?.n_omitidos || 0
  const nErr = result?.n_errores || 0
  const partes = [`${nOk} actualizado${nOk === 1 ? '' : 's'}`]
  if (nOmit) partes.push(`${nOmit} omitido${nOmit === 1 ? '' : 's'} (ya bloqueados)`)
  if (nErr) {
    const detalle = (result.errores || []).slice(0, 5).map((e) => {
      const falt = (e.faltantes || []).map((f) => f.label || f.tipo).filter(Boolean)
      return falt.length
        ? `${e.nombre}: falta ${falt.join(', ')}`
        : `${e.nombre}: ${e.detail || 'error'}`
    }).join(' · ')
    partes.push(`${nErr} sin cambio${nErr === 1 ? '' : 's'}${detalle ? ` (${detalle}${nErr > 5 ? '…' : ''})` : ''}`)
  }
  return partes.join('. ') + '.'
}

function EmpresaLogoPlaceholder({ accent = '#4A7C94', size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="6" y="14" width="36" height="28" rx="3" stroke={accent} strokeWidth="2.2" fill="none" />
      <path d="M16 42V28h6v14M26 42V22h6v20" stroke={accent} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M10 14l14-8 14 8" stroke={accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Módulo Recursos Humanos — Documentación para contratación.
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

  const [items, setItems] = useState([])
  const [grupos, setGrupos] = useState([])
  const [cumpleanosMes, setCumpleanosMes] = useState({ mes: null, items: [] })
  const [showCumpleanos, setShowCumpleanos] = useState(false)
  const [showInformeDocumental, setShowInformeDocumental] = useState(false)
  const [busyInformeDocumental, setBusyInformeDocumental] = useState(false)
  const [empresaSel, setEmpresaSel] = useState(null)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const PAGE = 50
  const [loading, setLoading] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [qAplicado, setQAplicado] = useState('')
  const [msg, setMsg] = useState(null)
  const [empresas, setEmpresas] = useState([])
  const [catalogo, setCatalogo] = useState({})
  const [busy, setBusy] = useState(false)

  const [showCrear, setShowCrear] = useState(false)
  const [crearForm, setCrearForm] = useState({ ...EMPTY_TRABAJADOR_FORM })

  const [detalle, setDetalle] = useState(null)
  const [tabDetalle, setTabDetalle] = useState('datos')
  const [editForm, setEditForm] = useState(null)
  const [editando, setEditando] = useState(false)
  const [seccionModulo, setSeccionModulo] = useState('documentacion') // documentacion | nomina | liquidacion

  const [smmlvVigente, setSmmlvVigente] = useState(null)
  const [selIds, setSelIds] = useState(() => new Set())
  const [busyMasiva, setBusyMasiva] = useState(false)
  const [apagadaEnBitacora, setApagadaEnBitacora] = useState(null)
  const auditoriaActiva = auditoriaDocumentalActiva()
  // Validación masiva: exclusiva Desarrollador (no basta el permiso Validar).
  const canValidarMasivo = Boolean(permisos.esDesarrollador)
  const segApi = useMemo(
    () => (cid && token ? createSeguimientoApi(cid, token) : null),
    [cid, token],
  )

  const flash = useCallback((type, text) => {
    setMsg({ type, text })
    window.setTimeout(() => setMsg(null), type === 'error' || String(text || '').length > 120 ? 8000 : 4200)
  }, [])

  const cargar = useCallback(async () => {
    if (!api || !permisos.ver) return
    setLoading(true)
    try {
      const [emp, cat, res, params] = await Promise.all([
        api.listEmpresas(),
        api.listCatalogoOpciones(),
        api.resumenEmpresas(),
        api.nominaParams().catch(() => null),
      ])
      setEmpresas(emp?.opciones || [])
      setCatalogo(cat?.categorias || {})
      setGrupos(res?.grupos || [])
      setCumpleanosMes(res?.cumpleanos_mes || { mes: null, items: [] })
      if (params?.smmlv != null) setSmmlvVigente(Number(params.smmlv))
    } catch (e) {
      flash('error', e.message || 'No se pudo cargar Recursos Humanos.')
    } finally {
      setLoading(false)
    }
  }, [api, permisos.ver, flash])

  const cargarDetalle = useCallback(async () => {
    if (!api || !permisos.ver || !empresaSel?.empresa_key || seccionModulo !== 'documentacion') {
      return
    }
    setLoading(true)
    try {
      const trab = await api.listTrabajadores({
        q: qAplicado || undefined,
        empresa_key: empresaSel.empresa_key,
        limit: PAGE,
        offset: page * PAGE,
      })
      setItems(trab?.items || [])
      setTotal(trab?.total || 0)
      setSelIds(new Set())
    } catch (e) {
      flash('error', e.message || 'No se pudo cargar la grilla.')
    } finally {
      setLoading(false)
    }
  }, [api, permisos.ver, empresaSel, qAplicado, page, flash, seccionModulo])

  useEffect(() => {
    cargar()
  }, [cargar])

  useEffect(() => {
    cargarDetalle()
  }, [cargarDetalle])

  useEffect(() => {
    if (!canValidarMasivo || !segApi?.getBitacoraAsistenciaRrhhPolicy) {
      setApagadaEnBitacora(null)
      return
    }
    let cancelled = false
    segApi.getBitacoraAsistenciaRrhhPolicy()
      .then((p) => {
        if (!cancelled) setApagadaEnBitacora(p?.apagada_en || null)
      })
      .catch(() => {
        if (!cancelled) setApagadaEnBitacora(null)
      })
    return () => { cancelled = true }
  }, [canValidarMasivo, segApi, empresaSel?.empresa_key])

  useEffect(() => {
    if (seccionModulo !== 'nomina' && seccionModulo !== 'liquidacion') return
    if (!api || !permisos.ver) return
    api.listTrabajadores({ limit: 200, offset: 0 }).then((trab) => {
      setItems(trab?.items || [])
    }).catch(() => {})
  }, [seccionModulo, api, permisos.ver])

  const addCatalogValue = useCallback(async (categoria, valor) => {
    if (!api) return
    const v = categoria === 'cargo'
      ? (normalizarCargoNombrePropio(valor) || String(valor || '').trim())
      : valor
    await api.addCatalogoOpcion(categoria, v)
    setCatalogo((prev) => {
      const list = [...(prev?.[categoria] || [])]
      if (!list.includes(v)) list.push(v)
      list.sort((a, b) => a.localeCompare(b, 'es'))
      return { ...prev, [categoria]: list }
    })
  }, [api])

  const syncMediaPreviews = useCallback(async (trab, formBase) => {
    if (!api || !trab?.id) return formBase
    let next = { ...formBase }
    const revoke = (u) => {
      if (u && String(u).startsWith('blob:')) {
        try { URL.revokeObjectURL(u) } catch { /* ignore */ }
      }
    }
    if (trab.foto_blob_path) {
      try {
        const url = await api.fetchBlobUrl(api.fotoUrl(trab.id))
        revoke(next.foto_preview_url)
        next = { ...next, foto_preview_url: url, _foto_file: null, _foto_clear: false }
      } catch { /* sin foto */ }
    }
    if (trab.firma_blob_path) {
      try {
        const url = await api.fetchBlobUrl(api.firmaUrl(trab.id))
        revoke(next.firma_data_url)
        next = { ...next, firma_data_url: url, _firma_changed: false, _firma_clear: false }
      } catch { /* sin firma */ }
    }
    return next
  }, [api])

  const persistMedia = useCallback(async (trabajadorId, form) => {
    if (!api || !trabajadorId || !form) return
    const errors = []
    if (form._foto_file) {
      try {
        await api.uploadFoto(trabajadorId, form._foto_file)
      } catch (e) {
        errors.push(e.message || 'No se pudo guardar la fotografía.')
      }
    } else if (form._foto_clear) {
      try { await api.deleteFoto(trabajadorId) } catch { /* ignore */ }
    }
    if (form._firma_changed && form.firma_data_url && String(form.firma_data_url).startsWith('data:')) {
      try {
        const blob = dataUrlToBlob(form.firma_data_url)
        if (blob) {
          const file = new File([blob], 'firma.png', { type: blob.type || 'image/png' })
          await api.uploadFirma(trabajadorId, file)
        }
      } catch (e) {
        errors.push(e.message || 'No se pudo guardar la firma.')
      }
    } else if (form._firma_changed && !form.firma_data_url) {
      try { await api.deleteFirma(trabajadorId) } catch { /* ignore */ }
    }
    if (form._cert_bancaria_file) {
      try {
        await api.uploadDocumento(trabajadorId, {
          categoria: 'bancario',
          tipo: 'certificacion_bancaria',
          archivo: form._cert_bancaria_file,
          version_label: 'Original',
          marcar_vigente: true,
        })
      } catch (e) {
        errors.push(e.message || 'No se pudo guardar la certificación bancaria.')
      }
    }
    if (errors.length) {
      const err = new Error(errors.join(' '))
      err.partialMedia = true
      throw err
    }
  }, [api])

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
    { id: 'documentacion', label: 'Documentación' },
  ]

  const abrirDetalle = async (row) => {
    if (!api) return
    try {
      const full = await api.getTrabajador(row.id)
      setDetalle(full)
      const base = formFromTrabajador(full)
      const withMedia = await syncMediaPreviews(full, base)
      setEditForm(withMedia)
      setEditando(false)
      setTabDetalle('datos')
    } catch (e) {
      flash('error', e.message || 'No se pudo abrir el colaborador.')
    }
  }

  const toggleSel = (id, checked) => {
    setSelIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(Number(id))
      else next.delete(Number(id))
      return next
    })
  }

  const idsPagina = useMemo(
    () => items.map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n > 0),
    [items],
  )
  const allPageSelected = idsPagina.length > 0 && idsPagina.every((id) => selIds.has(id))
  const somePageSelected = idsPagina.some((id) => selIds.has(id))

  const toggleSelAllPage = (checked) => {
    setSelIds((prev) => {
      const next = new Set(prev)
      for (const row of items) {
        const id = Number(row.id)
        if (!Number.isFinite(id) || id <= 0) continue
        if (trabajadorEsNuevoTrasApagado(row?.created_at, apagadaEnBitacora)) {
          next.delete(id)
          continue
        }
        if (checked) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  const esNuevoTrasApagado = useCallback((row) => (
    trabajadorEsNuevoTrasApagado(row?.created_at, apagadaEnBitacora)
  ), [apagadaEnBitacora])

  const validacionMasiva = async (estado) => {
    if (!api || !canValidarMasivo) return
    const elegibles = items.filter((r) => selIds.has(Number(r.id)) && !esNuevoTrasApagado(r))
    const excluidosNuevos = items.filter((r) => selIds.has(Number(r.id)) && esNuevoTrasApagado(r))
    const ids = elegibles.map((r) => Number(r.id))
    if (!ids.length) {
      flash(
        'error',
        excluidosNuevos.length
          ? 'Los seleccionados son personal nuevo (tras apagar el interruptor): solo validación individual.'
          : 'Seleccione al menos un colaborador.',
      )
      return
    }
    let observacion = null
    if (estado === 'rechazado' || estado === 'pendiente') {
      const causal = window.prompt(
        estado === 'rechazado'
          ? 'Causal del rechazo (se aplica a todos los seleccionados):'
          : 'Causal / observación de Pendiente (se aplica a todos los seleccionados):',
      )
      if (causal == null) return
      observacion = String(causal).trim()
      if (!observacion) {
        flash('error', 'Indique la causal.')
        return
      }
    }
    if (estado === 'aprobado' && !window.confirm(
      `¿Aprobar ${ids.length} colaborador(es)? Solo se aprobarán quienes tengan completos los documentos obligatorios. Se generará el PDF consolidado y se bloqueará cada registro aprobado.`,
    )) return
    setBusyMasiva(true)
    try {
      const result = await api.setValidacionDocumentacionMasiva({
        trabajador_ids: ids,
        estado,
        observacion,
      })
      const byId = new Map(
        (result.actualizados || [])
          .filter((a) => a.trabajador)
          .map((a) => [Number(a.trabajador_id), a.trabajador]),
      )
      if (byId.size) {
        setItems((prev) => prev.map((r) => {
          const full = byId.get(Number(r.id))
          return full ? { ...r, ...patchFilaValidacionAuditoria(full) } : r
        }))
      }
      setSelIds(new Set())
      flash(result.n_errores ? 'error' : 'success', resumenValidacionMasiva(result))
      await cargar()
    } catch (e) {
      flash('error', e.message || 'No se pudo completar la validación masiva.')
    } finally {
      setBusyMasiva(false)
    }
  }

  const cerrarCrear = () => {
    if (busy) return
    if (crearForm.foto_preview_url && String(crearForm.foto_preview_url).startsWith('blob:')) {
      try { URL.revokeObjectURL(crearForm.foto_preview_url) } catch { /* ignore */ }
    }
    setShowCrear(false)
    setCrearForm({ ...EMPTY_TRABAJADOR_FORM })
  }

  const guardarCrear = async () => {
    if (!api || !permisos.crear) return
    const v = validateTrabajadorForm(crearForm, { smmlv: smmlvVigente, validarSalario: true })
    if (!v.ok) {
      flash('error', v.mensaje)
      return
    }
    setBusy(true)
    try {
      const created = await api.createTrabajador(payloadFromForm(crearForm))
      try {
        await persistMedia(created.id, crearForm)
      } catch (mediaErr) {
        flash('error', `Colaborador registrado, pero ${mediaErr.message || 'falló la carga de foto/firma/documentos.'}`)
        setShowCrear(false)
        setCrearForm({ ...EMPTY_TRABAJADOR_FORM })
        await cargar()
        await abrirDetalle(created)
        return
      }
      flash('success', 'Colaborador registrado.')
      setShowCrear(false)
      setCrearForm({ ...EMPTY_TRABAJADOR_FORM })
      await cargar()
      await abrirDetalle(created)
    } catch (e) {
      if (e.codigo === 'reingreso' && e.trabajador?.id) {
        const nombre = nombreCompleto(e.trabajador)
        if (window.confirm(`Ya existe ${nombre} como retirado. ¿Actualizar ese registro (reingreso) en lugar de crear uno nuevo? Se conservarán datos personales y afiliaciones; deberá cargar la documentación laboral del nuevo ciclo.`)) {
          try {
            const updated = await api.reingresarTrabajador(e.trabajador.id, payloadFromForm(crearForm))
            try {
              await persistMedia(updated.id, crearForm)
            } catch (mediaErr) {
              flash('error', `Reingreso registrado, pero ${mediaErr.message || 'falló la carga de medios.'}`)
              setShowCrear(false)
              setCrearForm({ ...EMPTY_TRABAJADOR_FORM })
              await cargar()
              await abrirDetalle(updated)
              return
            }
            flash('success', `Reingreso registrado (ciclo ${updated.ciclo_documental || 2}). Cargue la documentación laboral del nuevo ingreso.`)
            setShowCrear(false)
            setCrearForm({ ...EMPTY_TRABAJADOR_FORM })
            await cargar()
            await abrirDetalle(updated)
          } catch (err) {
            flash('error', err.message || 'No se pudo completar el reingreso.')
          }
        }
        return
      }
      flash('error', e.message || 'No se pudo registrar.')
    } finally {
      setBusy(false)
    }
  }

  const guardarEdicion = async () => {
    if (!api || !permisos.editar || !detalle) return
    const v = validateTrabajadorForm(editForm, {
      smmlv: smmlvVigente,
      validarSalario: Boolean(permisos.verSalario),
    })
    if (!v.ok) {
      flash('error', v.mensaje)
      return
    }
    setBusy(true)
    try {
      const payload = payloadFromForm(editForm)
      // Quien no puede ver salario no debe sobrescribirlo en ediciones posteriores.
      if (!permisos.verSalario) {
        delete payload.salario
        delete payload.salario_liquidable
      }
      await api.updateTrabajador(detalle.id, payload)
      try {
        await persistMedia(detalle.id, editForm)
      } catch (mediaErr) {
        flash('error', `Datos actualizados, pero ${mediaErr.message || 'falló la carga de medios.'}`)
        const full = await api.getTrabajador(detalle.id)
        setDetalle(full)
        const withMedia = await syncMediaPreviews(full, formFromTrabajador(full))
        setEditForm(withMedia)
        await cargar()
        return
      }
      const full = await api.getTrabajador(detalle.id)
      setDetalle(full)
      const withMedia = await syncMediaPreviews(full, formFromTrabajador(full))
      setEditForm(withMedia)
      setEditando(false)
      flash('success', 'Colaborador actualizado.')
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
      flash('success', 'Colaborador eliminado.')
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
        <div style={{ fontSize: 'var(--cc-lg)', fontWeight: 700, color: tTok.text, marginBottom: 10 }}>Recursos Humanos</div>
        <div style={{ fontSize: 'var(--cc-body)', color: tTok.textMuted, lineHeight: 1.5 }}>
          Tu cargo no tiene permiso para este módulo. Un administrador puede habilitarlo en Panel admin → Control de accesos → función «Recursos Humanos» (acción Ver).
        </div>
      </div>
    )
  }

  if (!cid) {
    return (
      <div style={{ padding: 24, color: tTok.textMuted }}>
        Seleccione un contrato de obra para gestionar Recursos Humanos.
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
          <div style={{ fontSize: 'var(--cc-h2)', fontWeight: 800, color: tTok.text }}>Recursos Humanos</div>
          <div style={{ fontSize: 'var(--cc-sm)', color: tTok.textMuted }}>
            Documentación, nómina y liquidación de colaboradores
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {seccionModulo === 'documentacion' && permisos.exportar && (
            <EstadoDocumentalInformeButton
              onClick={() => setShowInformeDocumental(true)}
              disabled={busyInformeDocumental}
              tTok={tTok}
              S={S}
            />
          )}
          {seccionModulo === 'documentacion' && !empresaSel && (
            <CumpleanosMesButton
              count={(cumpleanosMes?.items || []).length}
              onClick={() => setShowCumpleanos(true)}
              tTok={tTok}
            />
          )}
          {seccionModulo === 'documentacion' && permisos.crear && (
            <button
              type="button"
              style={S.btnPrimary}
              onClick={() => {
                const cons = empresas.find((e) => e.tipo === 'consorcio')
                setCrearForm({
                  ...EMPTY_TRABAJADOR_FORM,
                  empresa_key: 'consorcio',
                  empresa_tipo: 'consorcio',
                  empresa_nombre: cons?.nombre || '',
                  empresa_nit: cons?.nit || '',
                })
                setShowCrear(true)
              }}
            >
              + Registrar colaborador
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          { id: 'documentacion', label: 'Documentación' },
          ...(permisos.verSalario ? [
            { id: 'nomina', label: 'Nómina' },
            { id: 'liquidacion', label: 'Liquidación' },
          ] : []),
        ].map((sec) => (
          <button
            key={sec.id}
            type="button"
            onClick={() => setSeccionModulo(sec.id)}
            style={{
              ...S.btnGhost,
              fontWeight: seccionModulo === sec.id ? 700 : 500,
              background: seccionModulo === sec.id ? `${tTok.primary}18` : 'transparent',
              color: seccionModulo === sec.id ? tTok.primary : tTok.textMuted,
              borderColor: seccionModulo === sec.id ? tTok.primary : tTok.border,
            }}
          >
            {sec.label}
          </button>
        ))}
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

      {seccionModulo === 'nomina' && permisos.verSalario && (
        <NominaPanel
          api={api}
          permisos={permisos}
          trabajadores={items}
          S={S}
          tTok={tTok}
          sheetUi={sheetUi}
          flash={flash}
        />
      )}

      {seccionModulo === 'liquidacion' && permisos.verSalario && (
        <LiquidacionPanel
          api={api}
          permisos={permisos}
          trabajadores={items}
          S={S}
          tTok={tTok}
          sheetUi={sheetUi}
          flash={flash}
          onTrabajadoresChanged={cargar}
        />
      )}

      {seccionModulo === 'documentacion' && (
        <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {empresaSel && (
          <button
            type="button"
            style={S.btnGhost}
            onClick={() => { setEmpresaSel(null); setPage(0); setItems([]); setSelIds(new Set()) }}
          >
            ← Empresas
          </button>
        )}
        <input
          style={{ ...S.input, maxWidth: 360 }}
          placeholder="Buscar por nombre, documento, cargo o empresa…"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setPage(0)
              setQAplicado(filtro)
            }
          }}
        />
        <button
          type="button"
          style={S.btnGhost}
          onClick={() => { setPage(0); setQAplicado(filtro); cargar(); }}
        >
          Actualizar
        </button>
      </div>
      {!empresaSel && (
        <div style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 12,
          alignContent: 'start',
        }}>
          {loading && grupos.length === 0 && (
            <div style={{ color: tTok.textMuted }}>Cargando empresas…</div>
          )}
          {!loading && grupos.length === 0 && (
            <div style={{ color: tTok.textMuted, gridColumn: '1 / -1' }}>
              No hay colaboradores registrados. Use «Registrar colaborador» para iniciar la documentación de contratación.
            </div>
          )}
          {grupos.map((g) => {
            const pastel = pastelForEmpresa(g.empresa_key)
            const nit = g.empresa_nit || empresas.find((e) => e.key === g.empresa_key)?.nit
            const logoSrc = g.logo_url || empresas.find((e) => e.key === g.empresa_key)?.logo_url
            return (
              <button
                key={g.empresa_key}
                type="button"
                onClick={() => { setEmpresaSel(g); setPage(0); setQAplicado(''); setFiltro(''); }}
                style={{
                  textAlign: 'left',
                  background: pastel.bg,
                  border: `1px solid ${pastel.border}`,
                  borderRadius: 14,
                  padding: '16px 16px 14px',
                  cursor: 'pointer',
                  color: pastel.text,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  minHeight: 148,
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  boxShadow: '0 1px 2px rgba(30,40,60,0.04)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(30,40,60,0.08)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none'
                  e.currentTarget.style.boxShadow = '0 1px 2px rgba(30,40,60,0.04)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: 10,
                    background: '#fff',
                    border: `1px solid ${pastel.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    overflow: 'hidden',
                  }}>
                    {logoSrc ? (
                      <img
                        src={logoSrc}
                        alt=""
                        style={{ maxWidth: '88%', maxHeight: '88%', objectFit: 'contain' }}
                      />
                    ) : (
                      <EmpresaLogoPlaceholder accent={pastel.accent} size={30} />
                    )}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontWeight: 800,
                      fontSize: 'var(--cc-lg)',
                      lineHeight: 1.25,
                      color: pastel.text,
                      wordBreak: 'break-word',
                    }}>
                      {g.nombre}
                    </div>
                    <div style={{
                      fontSize: 'var(--cc-sm)',
                      color: pastel.accent,
                      marginTop: 4,
                      fontWeight: 600,
                    }}>
                      NIT {nit || '—'}
                    </div>
                  </div>
                </div>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  marginTop: 'auto',
                  paddingTop: 8,
                  borderTop: `1px solid ${pastel.border}`,
                }}>
                  <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 600, color: pastel.text }}>
                    {g.activos} colaborador{g.activos === 1 ? '' : 'es'} activo{g.activos === 1 ? '' : 's'}
                  </div>
                  <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color: pastel.accent }}>
                    {permisos.verSalario && g.total_nomina != null
                      ? `Nómina ${fmtSalario(g.total_nomina)}`
                      : 'Nómina: Acceso restringido'}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
      {empresaSel && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{
              fontSize: 'var(--cc-sm)',
              color: tTok.textMuted,
              fontWeight: 600,
            }}>
              {empresaSel.nombre}
              {empresaSel.empresa_nit ? ` · NIT ${empresaSel.empresa_nit}` : ''}
              {' · '}
              {empresaSel.activos} activos
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              {canValidarMasivo && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 'var(--cc-caption)', color: tTok.textMuted, fontWeight: 600 }}>
                    {selIds.size ? `${selIds.size} sel.` : 'Validar'}
                  </span>
                  <button
                    type="button"
                    style={iconBtnValidacion(PASTEL_ESTADO_VALIDACION.Aprobado, busyMasiva || !selIds.size)}
                    disabled={busyMasiva || !selIds.size}
                    title="Aprobar seleccionados (solo con documentación obligatoria completa)"
                    aria-label="Aprobar seleccionados"
                    onClick={() => validacionMasiva('aprobado')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    style={iconBtnValidacion(PASTEL_ESTADO_VALIDACION.Pendiente, busyMasiva || !selIds.size)}
                    disabled={busyMasiva || !selIds.size}
                    title="Marcar seleccionados como Pendiente"
                    aria-label="Pendiente seleccionados"
                    onClick={() => validacionMasiva('pendiente')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
                      <path d="M12 8v5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                      <circle cx="12" cy="16.5" r="1.1" fill="currentColor" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    style={iconBtnValidacion(PASTEL_ESTADO_VALIDACION.Rechazado, busyMasiva || !selIds.size)}
                    disabled={busyMasiva || !selIds.size}
                    title="Rechazar seleccionados"
                    aria-label="Rechazar seleccionados"
                    onClick={() => validacionMasiva('rechazado')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              )}
              <DocsFillLegend theme={tTok} />
            </div>
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
                  {canValidarMasivo && (
                    <th style={{ ...sheetUi.th, width: 36, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = !allPageSelected && somePageSelected
                        }}
                        onChange={(e) => toggleSelAllPage(e.target.checked)}
                        title="Seleccionar todos los de esta página"
                        aria-label="Seleccionar todos"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </th>
                  )}
                  <th style={sheetUi.th}>Trabajador</th>
                  <th style={sheetUi.th}>Documento</th>
                  <th style={sheetUi.th}>Cargo</th>
                  <th style={sheetUi.th}>Tipo de contrato</th>
                  <th style={{ ...sheetUi.th, minWidth: 120 }}>Documentación</th>
                  <th style={sheetUi.th}>Validación</th>
                  <th style={sheetUi.th}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td style={sheetUi.td} colSpan={canValidarMasivo ? 8 : 7}>Cargando…</td></tr>
                )}
                {!loading && items.length === 0 && (
                  <tr>
                    <td style={sheetUi.td} colSpan={canValidarMasivo ? 8 : 7}>
                      No hay colaboradores en esta empresa.
                    </td>
                  </tr>
                )}
                {items.map((row) => {
                  const celdaVal = estiloCeldaValidacion(
                    row, theme, uiTheme, sheetUi.td,
                    { mostrarTonoAuditoria: auditoriaActiva },
                  )
                  const selected = selIds.has(Number(row.id))
                  const soloIndividual = esNuevoTrasApagado(row)
                  return (
                  <tr
                    key={row.id}
                    onClick={() => abrirDetalle(row)}
                    style={{ cursor: 'pointer', background: selected ? `${tTok.primary}14` : 'transparent' }}
                    onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = `${tTok.primary}10` }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = selected ? `${tTok.primary}14` : 'transparent' }}
                  >
                    {canValidarMasivo && (
                      <td
                        style={{ ...sheetUi.td, textAlign: 'center', width: 36 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selected && !soloIndividual}
                          disabled={soloIndividual}
                          title={soloIndividual
                            ? 'Personal nuevo: solo validación individual'
                            : `Seleccionar ${nombreCompleto(row)}`}
                          onChange={(e) => toggleSel(row.id, e.target.checked)}
                          aria-label={soloIndividual
                            ? `${nombreCompleto(row)} (solo validación individual)`
                            : `Seleccionar ${nombreCompleto(row)}`}
                        />
                      </td>
                    )}
                    <td style={sheetUi.td}>{nombreCompleto(row)}</td>
                    <td style={sheetUi.td}>{row.tipo_documento} {row.numero_documento}</td>
                    <td style={sheetUi.td}>{row.cargo_aspira || '—'}</td>
                    <td style={sheetUi.td}>{row.tipo_contrato || '—'}</td>
                    <td style={{ ...sheetUi.td, verticalAlign: 'middle' }}>
                      <DocsFillBattery docsFill={row.docs_fill} />
                    </td>
                    <td style={celdaVal.style} title={celdaVal.title}>
                      {celdaVal.label || labelEstadoValidacion(row.doc_validacion_estado)}
                    </td>
                    <td style={sheetUi.td}>{row.estado}</td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {total > PAGE && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
              <button type="button" style={S.btnGhost} disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Anterior</button>
              <span style={{ fontSize: 'var(--cc-sm)', color: tTok.textMuted }}>
                {page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} de {total}
              </span>
              <button type="button" style={S.btnGhost} disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
            </div>
          )}
        </div>
      )}
        </>
      )}

      {/* Modal crear — no cierra al clic fuera */}
      {showCrear && (
        <div style={overlayStyle} role="presentation">
          <div style={modalStyle(1290)} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <CcModalBrandHeader theme={theme} />
            <div style={modalHead}>
              <div style={{ fontWeight: 800, fontSize: 'var(--cc-h2)', color: tTok.text }}>
                Registrar colaborador
              </div>
            </div>
            <div style={modalScroll}>
              <TrabajadorFormSheet
                theme={theme}
                form={crearForm}
                onChange={setCrearForm}
                canEdit
                empresas={empresas}
                catalogo={catalogo}
                onAddCatalogValue={addCatalogValue}
                api={api}
                onMsg={(m) => flash(m.type, m.text)}
                verSalario={Boolean(permisos.verSalario || permisos.crear)}
                diligenciarSalarioCreacion
                smmlv={smmlvVigente}
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
              <button type="button" style={S.btnGhost} disabled={busy} onClick={cerrarCrear}>Cancelar</button>
              <button type="button" style={S.btnPrimary} disabled={busy} onClick={guardarCrear}>
                {busy ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal detalle — no cierra al clic fuera */}
      {detalle && (
        <div style={overlayStyle} role="presentation">
          <div style={modalStyle(1370)} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <CcModalBrandHeader theme={theme} />
            <div style={modalHead}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 'var(--cc-h2)', color: tTok.text }}>
                  {nombreCompleto(detalle)}
                </div>
                <div style={{ fontSize: 'var(--cc-caption)', color: tTok.textMuted }}>
                  {detalle.tipo_documento} {detalle.numero_documento} · {detalle.empresa_nombre}
                  {detalle.empresa_nit ? ` · NIT ${detalle.empresa_nit}` : ''}
                </div>
              </div>
              <button type="button" style={S.btnGhost} onClick={() => !busy && setDetalle(null)}>Cerrar</button>
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
                    catalogo={catalogo}
                    onAddCatalogValue={addCatalogValue}
                    api={api}
                    trabajadorId={detalle.id}
                    docLocked={Boolean(detalle.doc_bloqueado)}
                    onMsg={(m) => flash(m.type, m.text)}
                    verSalario={permisos.verSalario}
                    smmlv={smmlvVigente}
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
              {tabDetalle === 'documentacion' && (
                <DocumentacionTab
                  theme={theme}
                  tTok={tTok}
                  api={api}
                  detalle={detalle}
                  editForm={editForm}
                  setEditForm={setEditForm}
                  catalogo={catalogo}
                  addCatalogValue={addCatalogValue}
                  permisos={permisos}
                  flash={flash}
                  formFromTrabajador={formFromTrabajador}
                  onTrabajadorUpdated={async (full) => {
                    setDetalle(full)
                    const withMedia = await syncMediaPreviews(full, formFromTrabajador(full))
                    setEditForm(withMedia)
                    // Sincroniza estado/auditoría en la grilla sin recargar toda la página.
                    setItems((prev) => prev.map((r) => (
                      Number(r.id) === Number(full.id)
                        ? { ...r, ...patchFilaValidacionAuditoria(full) }
                        : r
                    )))
                    await cargar()
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      <CumpleanosFestivoModal
        open={showCumpleanos}
        onClose={() => setShowCumpleanos(false)}
        cumpleanos={cumpleanosMes}
        api={api}
        theme={theme}
        tTok={tTok}
        flash={flash}
      />

      <EstadoDocumentalInformeModal
        open={showInformeDocumental}
        theme={theme}
        tTok={tTok}
        procesando={busyInformeDocumental}
        onCancel={() => !busyInformeDocumental && setShowInformeDocumental(false)}
        onConfirm={async ({ filtro: fInforme, formato }) => {
          if (!api?.estadoDocumentalInformeUrl || !api?.downloadBlob) return
          setBusyInformeDocumental(true)
          try {
            const ext = formato === 'pdf' ? 'pdf' : 'xlsx'
            const fname = `${ESTADO_DOCUMENTAL_CODIGO}_estado_documental_${fInforme || 'todos'}.${ext}`
            await api.downloadBlob(
              api.estadoDocumentalInformeUrl({ filtro: fInforme, formato }),
              fname,
            )
            setShowInformeDocumental(false)
            flash('ok', 'Informe de estado documental generado.')
          } catch (e) {
            flash('error', e?.message || 'No se pudo generar el informe.')
          } finally {
            setBusyInformeDocumental(false)
          }
        }}
      />
    </div>
  )
}
