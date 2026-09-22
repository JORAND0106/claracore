import { useCallback, useEffect, useMemo, useState } from 'react'
import { API_BASE, apiFetchSignal } from '../../apiBase'
import ActaEditor from './ActaEditor'
import BitacoraEntradaEditor from './BitacoraEntradaEditor'
import SeguimientoCalendario from './SeguimientoCalendario'
import { accesoBitacora } from './bitacoraPermisos'
import { mergeDiariosParaEditor } from './bitacoraMergeDiarios'
import { createSeguimientoApi } from './seguimientoApi'
import { accesoSeguimiento } from './seguimientoPermisos'
import { useSeguimientoCompact } from './seguimientoShared'

/**
 * Host reutilizable del calendario de Seguimiento + editores de Acta y Bitácora.
 * Usado por el módulo Seguimiento y por la página de inicio (misma lógica).
 */
export default function SeguimientoCalendarioPanel({
  t,
  usuario,
  token,
  contratoId,
  viewportCompact: viewportCompactProp,
  refreshKey = 0,
  showFilters = true,
  widgetMode = false,
}) {
  const cid = contratoId ?? usuario?.contrato_id
  const permisos = useMemo(() => accesoSeguimiento(usuario, cid), [usuario, cid])
  const permisosBitacora = useMemo(() => accesoBitacora(usuario, cid), [usuario, cid])
  const api = useMemo(() => createSeguimientoApi(cid, token), [cid, token])
  const compactHook = useSeguimientoCompact()
  const viewportCompact = viewportCompactProp ?? compactHook

  const [usuariosContrato, setUsuariosContrato] = useState([])
  const [editingActaId, setEditingActaId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [fechaActaInicial, setFechaActaInicial] = useState(null)
  const [bitacoraEditor, setBitacoraEditor] = useState(null)
  const [localKey, setLocalKey] = useState(0)

  const loadUsuarios = useCallback(async () => {
    if (!cid || !token) return
    try {
      const data = await api.listUsuarios()
      setUsuariosContrato(Array.isArray(data) ? data : [])
    } catch {
      try {
        const sig = apiFetchSignal(20000)
        const res = await fetch(`${API_BASE}/actas/${cid}/usuarios-contrato`, {
          headers: { Authorization: `Bearer ${token}` },
          ...(sig ? { signal: sig } : {}),
        })
        if (res.ok) {
          const data = await res.json()
          setUsuariosContrato(Array.isArray(data) ? data : [])
        }
      } catch { /* ignore */ }
    }
  }, [api, cid, token])

  useEffect(() => { loadUsuarios() }, [loadUsuarios])

  const closeBitacoraEditor = useCallback(() => {
    setBitacoraEditor(null)
    setLocalKey((n) => n + 1)
  }, [])

  /** Abre el diario del día: si aún hay varios por tramo, fusiona en memoria para el editor. */
  const openDiariosDeFecha = useCallback(async (fechaStr) => {
    if (!fechaStr || !api?.getBitacoraDiariosFecha) return false
    const data = await api.getBitacoraDiariosFecha(fechaStr)
    const diarios = Array.isArray(data?.diarios) ? data.diarios : []
    if (!diarios.length) return false

    // Rehidratar cada diario (incluye equipos_uso) antes de fusionar.
    const hydrated = []
    for (const d of diarios) {
      if (d?.id != null && api.getBitacoraEntrada) {
        try {
          hydrated.push(await api.getBitacoraEntrada(d.id))
          continue
        } catch { /* usar fila lista */ }
      }
      hydrated.push(d)
    }

    const merged = mergeDiariosParaEditor(hydrated)
    if (!merged) return false
    setBitacoraEditor({ modo: 'ver', entrada: merged, fechaInicial: null })
    return true
  }, [api])

  const openEditorConEntrada = useCallback(async (entradaIdOrRow, { modo = 'ver', fechaInicial = null } = {}) => {
    if (entradaIdOrRow && typeof entradaIdOrRow === 'object' && entradaIdOrRow.id != null) {
      const id = entradaIdOrRow.id
      const fecha = entradaIdOrRow.fecha ? String(entradaIdOrRow.fecha).slice(0, 10) : fechaInicial
      if (fecha) {
        try {
          const ok = await openDiariosDeFecha(fecha)
          if (ok) return
        } catch { /* caer a id */ }
      }
      try {
        if (api.getBitacoraEntrada) {
          const row = await api.getBitacoraEntrada(id)
          setBitacoraEditor({ modo, entrada: row, fechaInicial })
          return
        }
      } catch { /* usar meta */ }
      setBitacoraEditor({ modo, entrada: entradaIdOrRow, fechaInicial })
      return
    }
    const entradaId = entradaIdOrRow
    if (!entradaId || !api.getBitacoraEntrada) return
    try {
      const row = await api.getBitacoraEntrada(entradaId)
      const fecha = row?.fecha ? String(row.fecha).slice(0, 10) : null
      if (fecha) {
        try {
          const ok = await openDiariosDeFecha(fecha)
          if (ok) return
        } catch { /* usar row */ }
      }
      setBitacoraEditor({ modo, entrada: row, fechaInicial })
    } catch {
      setBitacoraEditor({ modo, entrada: { id: entradaId }, fechaInicial })
    }
  }, [api, openDiariosDeFecha])

  const openNuevaBitacora = useCallback(async (modo, fecha) => {
    void modo
    const fechaStr = fecha ? String(fecha).slice(0, 10) : null
    if (!fechaStr) return
    try {
      const ok = await openDiariosDeFecha(fechaStr)
      if (ok) return
    } catch { /* crear nuevo */ }
    setBitacoraEditor({
      modo: 'diario',
      entrada: null,
      fechaInicial: fechaStr,
    })
  }, [openDiariosDeFecha])

  const openBitacoraById = useCallback(async (entradaId, meta = null) => {
    const fechaMeta = meta?.fecha ? String(meta.fecha).slice(0, 10) : null
    if (fechaMeta) {
      try {
        const ok = await openDiariosDeFecha(fechaMeta)
        if (ok) return
      } catch { /* cargar por id */ }
    }
    if (!entradaId) return
    await openEditorConEntrada(entradaId, { modo: 'ver', fechaInicial: null })
  }, [openDiariosDeFecha, openEditorConEntrada])

  if (permisos.bloqueado) {
    return (
      <div style={{
        padding: 16, borderRadius: 10, border: `1px solid ${t.border}`,
        background: t.bgCard, color: t.textMuted, fontSize: 'var(--cc-sm)',
      }}>
        No fue posible abrir el calendario de Seguimiento con la sesión actual.
      </div>
    )
  }

  if (!permisos.ver) return null

  const calendar = (
    <SeguimientoCalendario
      t={t}
      api={api}
      usuario={usuario}
      usuarios={usuariosContrato}
      permisos={permisos}
      permisosBitacora={permisosBitacora}
      viewportCompact={viewportCompact}
      refreshKey={Number(refreshKey) + localKey}
      showFilters={showFilters && !widgetMode}
      widgetMode={widgetMode}
      onNuevaActa={(fecha) => {
        setFechaActaInicial(fecha ? String(fecha).slice(0, 10) : null)
        setCreating(true)
        setEditingActaId(null)
      }}
      onAbrirActa={(id) => {
        setFechaActaInicial(null)
        setEditingActaId(id)
        setCreating(false)
      }}
      onNuevaBitacora={(modo, fecha) => { void openNuevaBitacora(modo, fecha) }}
      onAbrirBitacora={(id, meta) => { void openBitacoraById(id, meta) }}
    />
  )

  return (
    <>
      {widgetMode ? (
        <div
          className="cc-seguim-cal-widget-card"
          style={{
            background: t.bgCard,
            border: `1px solid ${t.border}`,
            borderRadius: 12,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            minHeight: 280,
            boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
          }}
        >
          {calendar}
        </div>
      ) : calendar}

      {(creating || editingActaId != null) && (
        <ActaEditor
          t={t}
          api={api}
          usuario={usuario}
          usuariosContrato={usuariosContrato}
          actaId={editingActaId}
          permisos={permisos}
          compact={viewportCompact}
          asModal
          fechaReunionInicial={fechaActaInicial}
          onCancel={() => {
            setCreating(false)
            setEditingActaId(null)
            setFechaActaInicial(null)
            setLocalKey((n) => n + 1)
          }}
          onSaved={async (row, meta) => {
            if (meta?.deleted) {
              setCreating(false)
              setEditingActaId(null)
              setFechaActaInicial(null)
              setLocalKey((n) => n + 1)
              return
            }
            if (row?.id) {
              setCreating(false)
              setFechaActaInicial(null)
              setEditingActaId((prev) => (Number(prev) === Number(row.id) ? prev : row.id))
            }
            if (!meta?.stay) setLocalKey((n) => n + 1)
          }}
        />
      )}

      {bitacoraEditor && (
        <BitacoraEntradaEditor
          key={`bit-${bitacoraEditor.modo}-${bitacoraEditor.entrada?.id || 'new'}-${bitacoraEditor.fechaInicial || ''}`}
          t={t}
          api={api}
          usuario={usuario}
          token={token}
          contratoId={cid}
          permisos={permisosBitacora}
          modo={bitacoraEditor.modo}
          entrada={bitacoraEditor.entrada}
          fechaInicial={bitacoraEditor.fechaInicial}
          viewportCompact={viewportCompact}
          onClose={closeBitacoraEditor}
          onSaved={() => {
            setLocalKey((n) => n + 1)
          }}
        />
      )}
    </>
  )
}
