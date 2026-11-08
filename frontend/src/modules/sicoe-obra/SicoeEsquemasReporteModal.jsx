/**
 * Lista Excel de esquemas del reporte + crear / editar / cambiar asignación.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import EsquemaEditorModal from '../../components/esquema/EsquemaEditorModal'
import { presentEsquemaExportPopup } from '../../components/esquema/esquemaExportHost'
import { applyEsquemaSaveBundle } from '../../components/esquema/applyEsquemaSaveBundle'
import { dataUriEsquemaAFile } from './sicoeGraficosHelpers.js'
import { prepararEsquemaParaUpload } from '../../comprimirImagen.js'
import SicoeEsquemaAsignarPopup from './SicoeEsquemaAsignarPopup'
import {
  buildEsquemaHistorialEntrada,
  listarEsquemasDelReporte,
  nuevoEsquemaId,
  planificarActualizacionVersionEsquema,
  planificarAsignacionEsquema,
} from './sicoeEsquemasReporte.js'
import {
  listarEsquemasSinAsignar,
  mergeEsquemasLista,
  removeEsquemaSinAsignar,
  upsertEsquemaSinAsignar,
} from './sicoeEsquemasSinAsignar.js'

async function nextGraficoNumero(API_URL, contratoId, hdrs) {
  const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/next-grafico`, {
    method: 'POST', headers: hdrs,
  })
  if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`)
  const j = await res.json()
  if (typeof j === 'number') return j
  if (j?.numero != null) return Number(j.numero)
  if (Array.isArray(j) && j[0] != null) return Number(j[0]?.numero ?? j[0])
  throw new Error('No se obtuvo el consecutivo de gráfico')
}

async function uploadGraficoPng(API_URL, contratoId, hdrs, file, numero) {
  const prepared = await prepararEsquemaParaUpload(file)
  const fd = new FormData()
  fd.append('file', prepared)
  fd.append('numero', String(numero))
  fd.append('descripcion', '')
  const up = await fetch(`${API_URL}/sicoe-obra/${contratoId}/upload-grafico`, {
    method: 'POST',
    headers: { Authorization: hdrs.Authorization },
    body: fd,
  })
  if (!up.ok) throw new Error(await up.text() || `HTTP ${up.status}`)
  return up.json()
}

async function putRegistro(API_URL, contratoId, hdrs, registroId, body) {
  const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/registros/${registroId}`, {
    method: 'PUT',
    headers: { ...hdrs, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`)
  return res.json().catch(() => ({}))
}

/**
 * @param {{
 *   t: object,
 *   open: boolean,
 *   onClose: Function,
 *   API_URL: string,
 *   contratoId: number|string,
 *   hdrs: object,
 *   token?: string|null,
 *   reporte: object,
 *   registros: object[],
 *   isSellado: (reg: object) => boolean,
 *   onRegistrosPatched?: (patches: object[]) => void,
 * }} props
 */
export default function SicoeEsquemasReporteModal({
  t,
  open,
  onClose,
  API_URL,
  contratoId,
  hdrs,
  token = null,
  reporte,
  registros = [],
  isSellado = () => false,
  onRegistrosPatched,
}) {
  const [localRegs, setLocalRegs] = useState(registros)
  const [sinAsignarRows, setSinAsignarRows] = useState([])
  const esquemas = useMemo(
    () => mergeEsquemasLista(
      listarEsquemasDelReporte(localRegs, isSellado),
      sinAsignarRows,
    ),
    [localRegs, isSellado, sinAsignarRows],
  )

  const [editorOpen, setEditorOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null) // esquema row or null=nuevo
  const [pendingSave, setPendingSave] = useState(null) // { dataUrl, extras, entrada, editTarget }
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignMode, setAssignMode] = useState('nuevo') // nuevo | editar | reasignar
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const reloadSinAsignar = useCallback(async () => {
    const rows = await listarEsquemasSinAsignar({
      contratoId,
      reporteId: reporte?.id,
    })
    setSinAsignarRows(rows)
  }, [contratoId, reporte?.id])

  useEffect(() => { setLocalRegs(registros) }, [registros])
  useEffect(() => { void reloadSinAsignar() }, [reloadSinAsignar, open])

  const abrirNuevo = () => {
    setEditTarget(null)
    setEditorOpen(true)
    setErr('')
  }

  const abrirEditar = (row) => {
    setEditTarget(row)
    setEditorOpen(true)
    setErr('')
  }

  const abrirReasignar = (row) => {
    setEditTarget(row)
    setAssignMode('reasignar')
    setAssignOpen(true)
    setErr('')
  }

  const aplicarPatches = useCallback(async (patches) => {
    const applied = []
    for (const p of patches) {
      const rid = p.registro?.id
      if (rid == null || String(rid).startsWith('local_')) continue
      await putRegistro(API_URL, contratoId, hdrs, rid, p.body)
      applied.push({ id: rid, ...p.body })
    }
    setLocalRegs((prev) => prev.map((r) => {
      const hit = applied.find((a) => String(a.id) === String(r.id))
      return hit ? { ...r, ...hit } : r
    }))
    onRegistrosPatched?.(applied)
    return applied
  }, [API_URL, contratoId, hdrs, onRegistrosPatched])

  const uploadYEntrada = async (dataUrl, extras, {
    esquemaId,
    numero: numeroIn,
    nombreIn,
    sceneIn,
  } = {}) => {
    const file = await dataUriEsquemaAFile(dataUrl, 'esquema-reporte')
    if (!file) throw new Error('No se pudo convertir el esquema')
    const nombre = String(nombreIn || extras?.title || 'Esquema').trim() || 'Esquema'
    const eid = esquemaId || nuevoEsquemaId()
    let numero = numeroIn
    if (numero == null) {
      numero = await nextGraficoNumero(API_URL, contratoId, hdrs)
    }
    const up = await uploadGraficoPng(API_URL, contratoId, hdrs, file, numero)
    const scene = sceneIn || extras?.scene || extras?.esquema_scene || null
    const entrada = buildEsquemaHistorialEntrada({
      url: up.url,
      numero: up.numero ?? numero,
      nombre,
      esquemaId: eid,
      scene,
      reporteId: reporte?.id,
    })
    try {
      const tok = token || (hdrs?.Authorization || '').replace(/^Bearer\s+/i, '')
      if (tok && contratoId != null) {
        await applyEsquemaSaveBundle(dataUrl, extras, {
          commitImage: async () => {},
          uploadToCloud: true,
          token: tok,
          folder: {
            contratoId,
            modulo: 'sicoe-obra',
            reporteId: reporte?.id ?? reporte?.numero_reporte,
            reporteNombre: `reporte-${reporte?.numero_reporte ?? reporte?.id ?? ''}`,
            registroId: `esquema-${entrada.numero}`,
            registroNombre: nombre,
          },
        })
      }
    } catch { /* nube best-effort */ }
    return { entrada, nombre }
  }

  const persistirNuevaVersion = async (dataUrl, extras, target) => {
    setBusy(true)
    setErr('')
    try {
      const { entrada, nombre } = await uploadYEntrada(dataUrl, extras, {
        esquemaId: target?.esquema_id,
        numero: target?.numero,
        nombreIn: target?.nombre,
        sceneIn: target?.scene,
      })
      if (target?.sinAsignar || !(target?.registros || []).length) {
        await upsertEsquemaSinAsignar({
          contratoId,
          reporteId: reporte?.id,
          entrada,
        })
        await reloadSinAsignar()
      } else {
        const { patches } = planificarActualizacionVersionEsquema({
          registros: localRegs,
          entradaNueva: entrada,
          isSellado,
        })
        if (patches.length) await aplicarPatches(patches)
      }
      await presentEsquemaExportPopup({
        t,
        title: nombre,
        pdf: extras?.exports?.pdf || null,
        dxf: extras?.exports?.dxf || null,
      })
      setEditTarget(null)
      setPendingSave(null)
    } catch (e) {
      setErr(e?.message || String(e))
      throw e
    } finally {
      setBusy(false)
    }
  }

  /**
   * Guardar siempre persiste PNG+escena (C-OUT-14 / C-OUT-18).
   * Nuevo: queda «Sin asignar» y luego se ofrece el popup de casillas.
   * Cancelar asignación no pierde el esquema.
   */
  const onSaveEditor = async (dataUrl, extras) => {
    if (!dataUrl) return { keepDraft: true }
    if (editTarget) {
      try {
        await persistirNuevaVersion(dataUrl, extras, editTarget)
        setEditorOpen(false)
        return { keepDraft: false }
      } catch (e) {
        setErr(e?.message || String(e))
        return { keepDraft: true }
      }
    }
    // Nuevo: persistir YA (Sin asignar), luego pedir asignación.
    setBusy(true)
    setErr('')
    try {
      const { entrada, nombre } = await uploadYEntrada(dataUrl, extras, {})
      await upsertEsquemaSinAsignar({
        contratoId,
        reporteId: reporte?.id,
        entrada,
      })
      await reloadSinAsignar()
      setPendingSave({
        dataUrl, extras, entrada, nombre, editTarget: null,
      })
      setAssignMode('nuevo')
      setEditorOpen(false)
      setAssignOpen(true)
      return { keepDraft: false }
    } catch (e) {
      setErr(e?.message || String(e))
      // Conservar borrador del editor: el Guardar falló.
      return { keepDraft: true }
    } finally {
      setBusy(false)
    }
  }

  const confirmarAsignacion = async (ids) => {
    if (!pendingSave && assignMode !== 'reasignar') return
    if (!ids?.length) {
      setErr('Seleccione al menos un registro')
      return
    }
    setBusy(true)
    setErr('')
    try {
      if (assignMode === 'reasignar' && editTarget) {
        const entrada = buildEsquemaHistorialEntrada({
          url: editTarget.url,
          numero: editTarget.numero,
          nombre: editTarget.nombre,
          esquemaId: editTarget.esquema_id,
          scene: editTarget.scene,
          reporteId: reporte?.id,
        })
        const { patches } = planificarAsignacionEsquema({
          registros: localRegs,
          entrada,
          idsDeseados: ids,
          isSellado,
        })
        if (!patches.length && !editTarget.sinAsignar) {
          throw new Error('No hay cambios de asignación.')
        }
        if (patches.length) await aplicarPatches(patches)
        if (ids.length) {
          await removeEsquemaSinAsignar({
            contratoId,
            reporteId: reporte?.id,
            esquemaId: editTarget.esquema_id,
          })
        } else {
          await upsertEsquemaSinAsignar({
            contratoId,
            reporteId: reporte?.id,
            entrada,
          })
        }
        await reloadSinAsignar()
        setAssignOpen(false)
        setEditTarget(null)
        setPendingSave(null)
        return
      }

      // Nuevo: PNG+escena ya persistidos como Sin asignar en onSaveEditor.
      const { dataUrl, extras, entrada: entradaSaved, nombre: nombreSaved } = pendingSave || {}
      let entrada = entradaSaved
      let nombre = nombreSaved || extras?.title || 'Esquema'
      if (!entrada?.url) {
        const uploaded = await uploadYEntrada(dataUrl, extras, {})
        entrada = uploaded.entrada
        nombre = uploaded.nombre
      }

      const { patches } = planificarAsignacionEsquema({
        registros: localRegs,
        entrada,
        idsDeseados: ids,
        isSellado,
      })

      if (!patches.length) throw new Error('Seleccione al menos un registro')
      await aplicarPatches(patches)
      await removeEsquemaSinAsignar({
        contratoId,
        reporteId: reporte?.id,
        esquemaId: entrada.esquema_id,
      })
      await reloadSinAsignar()

      await presentEsquemaExportPopup({
        t,
        title: nombre,
        pdf: extras?.exports?.pdf || null,
        dxf: extras?.exports?.dxf || null,
      })

      setAssignOpen(false)
      setPendingSave(null)
      setEditTarget(null)
    } catch (e) {
      setErr(e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const cancelarAsignacion = () => {
    if (busy) return
    // El esquema ya está guardado como Sin asignar (o reasignar sin cambios).
    const pending = pendingSave
    setAssignOpen(false)
    setPendingSave(null)
    if (assignMode === 'reasignar') setEditTarget(null)
    void reloadSinAsignar()
    // Guardar ya ocurrió: ofrecer Exportar aunque se cancele la asignación.
    if (assignMode === 'nuevo' && pending) {
      void presentEsquemaExportPopup({
        t,
        title: pending.nombre || pending.extras?.title || 'Esquema',
        pdf: pending.extras?.exports?.pdf || null,
        dxf: pending.extras?.exports?.dxf || null,
      }).catch(() => {})
    }
  }

  if (!open) return null

  const ui = {
    text: t?.text || '#0f172a',
    muted: t?.textMuted || '#64748b',
    border: t?.border || '#e2e8f0',
    primary: t?.primary || '#0f766e',
    bg: t?.bgCard || '#fff',
    bgSoft: t?.bg || '#f8fafc',
  }

  // Nuevo: ninguna casilla marcada. Reasignar: las actuales.
  const initialAssignIds = (assignMode === 'reasignar' && editTarget)
    ? editTarget.registros.map((r) => r.id)
    : []

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        data-testid="sicoe-esquemas-reporte-modal"
        style={{
          position: 'fixed', inset: 0, zIndex: 12000,
          background: 'rgba(15,23,42,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}
      >
        <div
          style={{
            width: 'min(920px, 98vw)',
            maxHeight: '90vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: ui.bg,
            borderRadius: 14,
            border: `1px solid ${ui.border}`,
            boxShadow: '0 20px 50px rgba(15,23,42,0.28)',
          }}
        >
          <div style={{
            padding: '14px 16px', borderBottom: `1px solid ${ui.border}`,
            display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between',
          }}
          >
            <div style={{ fontWeight: 800, color: ui.text, fontSize: 16 }}>
              Esquemas · Reporte #{reporte?.numero_reporte ?? '—'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                data-testid="sicoe-esquema-nuevo"
                onClick={abrirNuevo}
                style={{
                  background: ui.primary, color: '#fff', border: 'none', borderRadius: 8,
                  padding: '8px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 13,
                }}
              >
                + Nuevo esquema
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'transparent', border: `1px solid ${ui.border}`, borderRadius: 8,
                  padding: '8px 12px', fontWeight: 700, cursor: 'pointer', color: ui.text,
                }}
              >
                Cerrar
              </button>
            </div>
          </div>

          {err && (
            <div style={{ padding: '8px 16px', color: '#b91c1c', fontSize: 13 }}>{err}</div>
          )}

          <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: ui.bgSoft, textAlign: 'left' }}>
                  <th style={th}>Nº gráfico</th>
                  <th style={th}>Nombre</th>
                  <th style={th}>Registros asignados</th>
                  <th style={th}>Miniatura</th>
                  <th style={th}> </th>
                </tr>
              </thead>
              <tbody>
                {esquemas.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ ...td, color: ui.muted, textAlign: 'center', padding: 24 }}>
                      Aún no hay esquemas en este reporte. Use «Nuevo esquema».
                    </td>
                  </tr>
                )}
                {esquemas.map((row) => (
                  <tr key={row.esquema_id} style={{ borderTop: `1px solid ${ui.border}` }}>
                    <td style={td}>#{row.numero ?? '—'}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{row.nombre}</td>
                    <td style={td}>
                      {row.sinAsignar || !(row.registros || []).length
                        ? <span style={{ color: ui.muted, fontWeight: 700 }}>Sin asignar</span>
                        : row.registros.map((r) => `#${r.numero_registro}`).join(', ')}
                    </td>
                    <td style={td}>
                      {row.thumb ? (
                        <img
                          src={row.thumb}
                          alt=""
                          style={{ width: 56, height: 40, objectFit: 'cover', borderRadius: 4, border: `1px solid ${ui.border}` }}
                        />
                      ) : '—'}
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => abrirEditar(row)} style={btnLink(ui)}>
                          Editar
                        </button>
                        <button type="button" onClick={() => abrirReasignar(row)} style={btnLink(ui)}>
                          Cambiar asignación
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editorOpen && (
        <EsquemaEditorModal
          t={t}
          title={editTarget
            ? `Editar esquema · ${editTarget.nombre}`
            : `Nuevo esquema · Reporte #${reporte?.numero_reporte ?? ''}`}
          contratoId={contratoId}
          draftModule="sicoe_reporte_esquema"
          draftEntityId={`${reporte?.id || 'rep'}-${editTarget?.esquema_id || 'nuevo'}`}
          initialSceneSnapshot={editTarget?.scene || null}
          initialDataUri={null}
          deferExportPopup
          iaDoc={{
            ambito: 'sicoe_reporte_esquema',
            docKey: `sicoe-rep-${reporte?.id || 'x'}-${editTarget?.esquema_id || 'nuevo'}`,
          }}
          onClose={() => setEditorOpen(false)}
          onSave={onSaveEditor}
        />
      )}

      {assignOpen && (
        <SicoeEsquemaAsignarPopup
          key={`assign-${assignMode}-${editTarget?.esquema_id || 'nuevo'}-${pendingSave ? 'save' : 're'}`}
          t={t}
          registros={localRegs}
          isSellado={isSellado}
          initialIds={initialAssignIds}
          titulo={assignMode === 'reasignar'
            ? `Cambiar asignación · ${editTarget?.nombre || 'Esquema'}`
            : 'Asignar esquema a registros'}
          busy={busy}
          onCancel={cancelarAsignacion}
          onConfirm={(ids) => void confirmarAsignacion(ids)}
        />
      )}
    </>
  )
}

const th = { padding: '10px 8px', fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase' }
const td = { padding: '10px 8px', verticalAlign: 'middle', color: '#0f172a' }
function btnLink(ui) {
  return {
    background: 'transparent', border: `1px solid ${ui.border}`, borderRadius: 6,
    padding: '4px 8px', fontSize: 12, fontWeight: 700, color: ui.primary, cursor: 'pointer',
  }
}
