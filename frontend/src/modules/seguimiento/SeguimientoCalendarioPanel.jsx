import { useCallback, useEffect, useMemo, useState } from 'react'
import { API_BASE, apiFetchSignal } from '../../apiBase'
import ActaEditor from './ActaEditor'
import BitacoraEntradaEditor from './BitacoraEntradaEditor'
import BitacoraTramoDiaModal from './BitacoraTramoDiaModal'
import SeguimientoCalendario from './SeguimientoCalendario'
import { accesoBitacora } from './bitacoraPermisos'
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
  /** @type {[null|{fecha:string, diarios?:object[]}, Function]} */
  const [bitacoraDiaPicker, setBitacoraDiaPicker] = useState(null)
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

  const openBitacoraDia = useCallback((fecha, diarios = null) => {
    const fechaStr = fecha ? String(fecha).slice(0, 10) : null
    if (!fechaStr) return
    setBitacoraDiaPicker({ fecha: fechaStr, diarios: Array.isArray(diarios) ? diarios : null })
  }, [])

  const openNuevaBitacora = useCallback(async (modo, fecha) => {
    void modo
    openBitacoraDia(fecha, null)
  }, [openBitacoraDia])

  const openBitacoraById = useCallback(async (entradaId, meta = null) => {
    const fechaMeta = meta?.fecha ? String(meta.fecha).slice(0, 10) : null
    const diariosMeta = Array.isArray(meta?.diarios) ? meta.diarios : null
    if (fechaMeta && (meta?.grouped || (diariosMeta && diariosMeta.length >= 1))) {
      openBitacoraDia(fechaMeta, diariosMeta)
      return
    }
    if (!entradaId || !api.getBitacoraEntrada) return
    try {
      const row = await api.getBitacoraEntrada(entradaId)
      setBitacoraEditor({ modo: 'ver', entrada: row, fechaInicial: null, tramoInicial: row?.tramo || null })
    } catch {
      setBitacoraEditor({
        modo: 'ver',
        entrada: { id: entradaId },
        fechaInicial: null,
        tramoInicial: null,
      })
    }
  }, [api, openBitacoraDia])

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

      {bitacoraDiaPicker && (
        <BitacoraTramoDiaModal
          t={t}
          api={api}
          token={token}
          contratoId={cid}
          fecha={bitacoraDiaPicker.fecha}
          diariosIniciales={bitacoraDiaPicker.diarios}
          permisosBitacora={permisosBitacora}
          viewportCompact={viewportCompact}
          onClose={() => setBitacoraDiaPicker(null)}
          onAbrirDiario={(row) => {
            setBitacoraDiaPicker(null)
            setBitacoraEditor({
              modo: 'ver',
              entrada: row,
              fechaInicial: null,
              tramoInicial: row?.tramo || null,
            })
          }}
          onNuevoDiario={({ fecha, tramo }) => {
            setBitacoraDiaPicker(null)
            setBitacoraEditor({
              modo: 'diario',
              entrada: null,
              fechaInicial: fecha,
              tramoInicial: tramo,
            })
          }}
        />
      )}

      {bitacoraEditor && (
        <BitacoraEntradaEditor
          key={`bit-${bitacoraEditor.modo}-${bitacoraEditor.entrada?.id || 'new'}-${bitacoraEditor.fechaInicial || ''}-${bitacoraEditor.tramoInicial || ''}`}
          t={t}
          api={api}
          usuario={usuario}
          token={token}
          contratoId={cid}
          permisos={permisosBitacora}
          modo={bitacoraEditor.modo}
          entrada={bitacoraEditor.entrada}
          fechaInicial={bitacoraEditor.fechaInicial}
          tramoInicial={bitacoraEditor.tramoInicial}
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
