import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { prepararImagenParaUpload } from '../../comprimirImagen'
import EsquemaEditorModal from '../../components/esquema/EsquemaEditorModal'
import { dataUriEsquemaAFile } from '../sicoe-obra/sicoeGraficosHelpers'
import PptoImageSourceBar from './PptoImageSourceBar'
import PptoPieFotoField from './PptoPieFotoField'
import PptoSicoeGaleriaPicker from './PptoSicoeGaleriaPicker'
import { imagenDesdeClipboard, imagenDesdePasteEvent } from './pptoPasteImage'

const cc = {
  caption: 'var(--cc-caption)',
  sm: 'var(--cc-sm)',
  pad: 'var(--cc-space-3)',
  padSm: 'var(--cc-space-2)',
}

/**
 * Listado + edición de grupos de gráfico del contrato.
 */
export default function PptoGruposGraficosModal({
  open,
  onClose,
  t,
  contratoId,
  token,
  API,
}) {
  const [grupos, setGrupos] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [grupoId, setGrupoId] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const [busy, setBusy] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [galeriaOpen, setGaleriaOpen] = useState(false)
  const [esquemaOpen, setEsquemaOpen] = useState(false)
  const [reemplazarImagenId, setReemplazarImagenId] = useState(null)
  const [okMsg, setOkMsg] = useState('')
  const [pieFoto, setPieFoto] = useState('')
  const replaceDropRef = useRef(null)

  const authHdrs = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token],
  )

  const cargarListado = useCallback(async () => {
    if (!contratoId || !token) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/presupuesto/${contratoId}/graficos/grupos`, {
        headers: authHdrs,
      })
      if (!res.ok) throw new Error(await res.text().catch(() => `Error ${res.status}`))
      const data = await res.json()
      setGrupos(Array.isArray(data.grupos) ? data.grupos : [])
    } catch (err) {
      setError(err?.message || 'No se pudo cargar el listado')
      setGrupos([])
    } finally {
      setLoading(false)
    }
  }, [API, contratoId, token, authHdrs])

  const cargarDetalle = useCallback(async (id) => {
    if (!contratoId || !token || !id) return
    setLoadingDetalle(true)
    setError('')
    setOkMsg('')
    try {
      const res = await fetch(`${API}/presupuesto/${contratoId}/graficos/grupos/${id}`, {
        headers: authHdrs,
      })
      if (!res.ok) throw new Error(await res.text().catch(() => `Error ${res.status}`))
      const data = await res.json()
      setDetalle(data)
      setPieFoto(String(data?.pie_foto || data?.caption || '').replace(/^—$/, ''))
      setGrupoId(id)
    } catch (err) {
      setError(err?.message || 'No se pudo abrir el grupo')
      setDetalle(null)
    } finally {
      setLoadingDetalle(false)
    }
  }, [API, contratoId, token, authHdrs])

  useEffect(() => {
    if (!open) {
      setGrupoId(null)
      setDetalle(null)
      setBusqueda('')
      setResultados([])
      setGaleriaOpen(false)
      setReemplazarImagenId(null)
      setPieFoto('')
      setOkMsg('')
      setError('')
      return
    }
    void cargarListado()
  }, [open, cargarListado])

  const buscarRegs = useCallback(async (q) => {
    if (!contratoId || !token) return
    setBuscando(true)
    try {
      const params = new URLSearchParams({ q: q || '', limit: '40' })
      const res = await fetch(
        `${API}/presupuesto/${contratoId}/graficos/buscar-registros?${params}`,
        { headers: authHdrs },
      )
      if (!res.ok) throw new Error(await res.text().catch(() => `Error ${res.status}`))
      const data = await res.json()
      setResultados(Array.isArray(data.registros) ? data.registros : [])
    } catch {
      setResultados([])
    } finally {
      setBuscando(false)
    }
  }, [API, contratoId, token, authHdrs])

  useEffect(() => {
    if (!grupoId) return undefined
    const tmr = setTimeout(() => void buscarRegs(busqueda.trim()), 280)
    return () => clearTimeout(tmr)
  }, [busqueda, grupoId, buscarRegs])

  const idsEnGrupo = useMemo(
    () => new Set((detalle?.registros || []).map((r) => r.id)),
    [detalle],
  )

  const agregarReg = async (presupuestoId) => {
    if (!grupoId || busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(
        `${API}/presupuesto/${contratoId}/graficos/grupos/${grupoId}/registros`,
        {
          method: 'POST',
          headers: { ...authHdrs, 'Content-Type': 'application/json' },
          body: JSON.stringify({ presupuesto_ids: [presupuestoId] }),
        },
      )
      if (!res.ok) throw new Error(await res.text().catch(() => `Error ${res.status}`))
      await cargarDetalle(grupoId)
      setOkMsg('Registro agregado al grupo')
    } catch (err) {
      setError(err?.message || 'No se pudo agregar')
    } finally {
      setBusy(false)
    }
  }

  const quitarReg = async (presupuestoId) => {
    if (!grupoId || busy) return
    if (!window.confirm('¿Quitar este registro del grupo de gráfico?')) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(
        `${API}/presupuesto/${contratoId}/graficos/grupos/${grupoId}/registros/${presupuestoId}`,
        { method: 'DELETE', headers: authHdrs },
      )
      if (!res.ok) throw new Error(await res.text().catch(() => `Error ${res.status}`))
      await cargarDetalle(grupoId)
      setOkMsg('Registro quitado del grupo')
    } catch (err) {
      setError(err?.message || 'No se pudo quitar')
    } finally {
      setBusy(false)
    }
  }

  const guardarPieFoto = async () => {
    if (!grupoId || busy) return
    const pie = String(pieFoto || '').trim()
    if (!pie) {
      setError('El pie de foto es obligatorio')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch(
        `${API}/presupuesto/${contratoId}/graficos/grupos/${grupoId}`,
        {
          method: 'PATCH',
          headers: { ...authHdrs, 'Content-Type': 'application/json' },
          body: JSON.stringify({ pie_foto: pie }),
        },
      )
      if (!res.ok) throw new Error(await res.text().catch(() => `Error ${res.status}`))
      await cargarDetalle(grupoId)
      setOkMsg('Pie de foto actualizado')
    } catch (err) {
      setError(err?.message || 'No se pudo guardar el pie de foto')
    } finally {
      setBusy(false)
    }
  }

  const aplicarReemplazo = async ({ url, blob_path = null, origen = 'upload' }) => {
    if (!grupoId || !reemplazarImagenId) return
    const pie = String(pieFoto || '').trim()
    if (!pie) {
      setError('El pie de foto es obligatorio para reemplazar la imagen')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch(
        `${API}/presupuesto/${contratoId}/graficos/grupos/${grupoId}/imagenes/${reemplazarImagenId}`,
        {
          method: 'PUT',
          headers: { ...authHdrs, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, blob_path, origen, pie_foto: pie }),
        },
      )
      if (!res.ok) throw new Error(await res.text().catch(() => `Error ${res.status}`))
      await cargarDetalle(grupoId)
      setOkMsg(
        `✓ Imagen reemplazada y asociada al grupo (${detalle?.registros_count || (detalle?.registros || []).length || '—'} registros · pie: ${pie || '—'})`,
      )
      setReemplazarImagenId(null)
      setGaleriaOpen(false)
    } catch (err) {
      setError(err?.message || 'No se pudo reemplazar la imagen')
    } finally {
      setBusy(false)
    }
  }

  const onPickReplaceFiles = async (fileList, origen = 'upload') => {
    const file = [...(fileList || [])].find((f) => f?.type?.startsWith('image/'))
    if (!file || !reemplazarImagenId) return
    setBusy(true)
    setError('')
    try {
      const prepared = await prepararImagenParaUpload(file)
      const named = prepared instanceof File
        ? prepared
        : new File([prepared], file.name || 'grafico.jpg', {
          type: prepared.type || file.type || 'image/jpeg',
        })
      const fd = new FormData()
      fd.append('file', named, named.name || 'grafico.jpg')
      const up = await fetch(`${API}/presupuesto/${contratoId}/graficos/upload`, {
        method: 'POST',
        headers: authHdrs,
        body: fd,
      })
      if (!up.ok) throw new Error(await up.text().catch(() => `Error ${up.status}`))
      const data = await up.json()
      await aplicarReemplazo({
        url: data.url,
        blob_path: data.blob_path,
        origen,
      })
    } catch (err) {
      setError(err?.message || 'No se pudo subir la imagen')
      setBusy(false)
    }
  }

  const pegarReemplazoDesdeClipboard = async () => {
    try {
      const file = await imagenDesdeClipboard()
      if (!file) {
        setError('El portapapeles no tiene una imagen. Copie una captura e intente de nuevo.')
        replaceDropRef.current?.focus?.()
        return
      }
      await onPickReplaceFiles([file], 'paste')
    } catch {
      setError('No se pudo leer el portapapeles. Use Ctrl+V con el popup activo, o elija archivo.')
      replaceDropRef.current?.focus?.()
    }
  }

  const guardarEsquemaReemplazo = async (dataUrl) => {
    try {
      const file = await dataUriEsquemaAFile(dataUrl, 'esquema-grupo')
      if (!file) throw new Error('No se pudo convertir el esquema')
      setEsquemaOpen(false)
      await onPickReplaceFiles([file], 'esquema')
    } catch (err) {
      setError(err?.message || 'No se pudo guardar el esquema')
    }
  }

  useEffect(() => {
    if (!open || !reemplazarImagenId || galeriaOpen || esquemaOpen) return undefined
    const onPaste = (e) => {
      const named = imagenDesdePasteEvent(e)
      if (!named) return
      e.preventDefault()
      void onPickReplaceFiles([named], 'paste')
    }
    window.addEventListener('paste', onPaste)
    const tmr = setTimeout(() => replaceDropRef.current?.focus?.(), 60)
    return () => {
      window.removeEventListener('paste', onPaste)
      clearTimeout(tmr)
    }
  }, [open, reemplazarImagenId, galeriaOpen, esquemaOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  const enEdicion = !!grupoId

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          zIndex: 2100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
        onClick={() => !busy && onClose?.()}
      >
        <div
          role="dialog"
          aria-label="Gráficos del contrato"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: t.bgCard,
            border: `1px solid ${t.border}`,
            borderRadius: 16,
            width: enEdicion ? 860 : 720,
            maxWidth: '96vw',
            maxHeight: '92vh',
            overflow: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            padding: 22,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 'var(--cc-lg)', fontWeight: 800, color: t.text }}>
                {enEdicion ? 'Editar grupo de gráfico' : 'Gráficos del contrato'}
              </div>
              <div style={{ fontSize: cc.sm, color: t.textMuted, marginTop: 4 }}>
                {enEdicion
                  ? 'Agregue/quite registros o reemplace la imagen sin alterar la otra parte.'
                  : 'Grupos persistentes asociados a memorias de ítem.'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {enEdicion && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setGrupoId(null)
                    setDetalle(null)
                    setReemplazarImagenId(null)
                    void cargarListado()
                  }}
                  style={{
                    background: t.bg,
                    border: `1px solid ${t.border}`,
                    borderRadius: 8,
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: cc.sm,
                    color: t.text,
                  }}
                >
                  ← Listado
                </button>
              )}
              <button
                type="button"
                onClick={() => !busy && onClose?.()}
                style={{
                  background: 'transparent',
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  padding: '6px 10px',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  color: t.textMuted,
                  fontWeight: 700,
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {error && (
            <div style={{ color: '#B91C1C', fontSize: cc.sm, marginBottom: 10, fontWeight: 600 }}>{error}</div>
          )}
          {okMsg && (
            <div style={{ color: '#15803D', fontSize: cc.sm, marginBottom: 10, fontWeight: 600 }}>{okMsg}</div>
          )}

          {!enEdicion && (
            <>
              {loading && <div style={{ color: t.textMuted, padding: 20, textAlign: 'center' }}>Cargando grupos…</div>}
              {!loading && grupos.length === 0 && (
                <div style={{ color: t.textMuted, padding: 20, textAlign: 'center' }}>
                  Aún no hay grupos de gráfico. Seleccione registros en la grilla y use el icono de agregar gráficos.
                </div>
              )}
              {!loading && grupos.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {grupos.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => void cargarDetalle(g.id)}
                      style={{
                        display: 'flex',
                        gap: 12,
                        alignItems: 'stretch',
                        textAlign: 'left',
                        background: t.bg,
                        border: `1px solid ${t.border}`,
                        borderRadius: 12,
                        padding: 10,
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        style={{
                          width: 88,
                          height: 66,
                          borderRadius: 8,
                          overflow: 'hidden',
                          background: t.bgCard,
                          border: `1px solid ${t.border}`,
                          flexShrink: 0,
                        }}
                      >
                        {g.thumb_url ? (
                          <img src={g.thumb_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: t.textMuted }}>🖼</div>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, color: t.text, fontSize: cc.sm }}>
                          {g.registros_count} registro{g.registros_count !== 1 ? 's' : ''}
                          {' · '}
                          {g.imagenes_count} imagen{g.imagenes_count !== 1 ? 'es' : ''}
                        </div>
                        <div style={{ fontSize: cc.caption, color: t.textMuted, marginTop: 4 }}>
                          Ítems: {(g.items || []).join(', ') || '—'}
                        </div>
                        <div
                          style={{
                            fontSize: cc.caption,
                            color: t.textMuted,
                            fontStyle: 'italic',
                            marginTop: 4,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={g.pie_foto || g.caption}
                        >
                          {g.pie_foto || g.caption || '—'}
                        </div>
                      </div>
                      <div style={{ alignSelf: 'center', color: t.primary, fontWeight: 800 }}>›</div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {enEdicion && (
            <>
              {loadingDetalle && (
                <div style={{ color: t.textMuted, padding: 20, textAlign: 'center' }}>Cargando grupo…</div>
              )}
              {!loadingDetalle && detalle && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <PptoPieFotoField
                      t={t}
                      value={pieFoto}
                      onChange={setPieFoto}
                      disabled={busy}
                      contratoId={contratoId}
                      token={token}
                      API={API}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        disabled={busy || !String(pieFoto || '').trim()}
                        onClick={() => void guardarPieFoto()}
                        style={{
                          background: t.primary,
                          color: '#fff',
                          border: 'none',
                          borderRadius: 8,
                          padding: '6px 12px',
                          fontWeight: 700,
                          fontSize: cc.caption,
                          cursor: busy || !String(pieFoto || '').trim() ? 'not-allowed' : 'pointer',
                          opacity: busy || !String(pieFoto || '').trim() ? 0.6 : 1,
                        }}
                      >
                        Guardar pie de foto
                      </button>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontWeight: 800, fontSize: cc.sm, color: t.text, marginBottom: 8 }}>
                      Imágenes ({(detalle.imagenes || []).length})
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                      {(detalle.imagenes || []).map((im) => (
                        <div
                          key={im.id}
                          style={{
                            border: `1px solid ${reemplazarImagenId === im.id ? t.primary : t.border}`,
                            borderRadius: 10,
                            overflow: 'hidden',
                            background: t.bg,
                          }}
                        >
                          <img src={im.url} alt="" style={{ width: '100%', height: 110, objectFit: 'contain', background: '#fff' }} />
                          <div style={{ padding: 8 }}>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setReemplazarImagenId(im.id)}
                              title="Reemplazar imagen (sin cambiar registros)"
                              style={{
                                width: '100%',
                                background: reemplazarImagenId === im.id ? t.primary : t.bgCard,
                                color: reemplazarImagenId === im.id ? '#fff' : t.text,
                                border: `1px solid ${t.border}`,
                                borderRadius: 8,
                                padding: '6px 8px',
                                fontWeight: 700,
                                fontSize: cc.caption,
                                cursor: busy ? 'not-allowed' : 'pointer',
                              }}
                            >
                              {reemplazarImagenId === im.id ? 'Reemplazando…' : 'Reemplazar'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {reemplazarImagenId && (
                      <div
                        ref={replaceDropRef}
                        tabIndex={0}
                        onPaste={(e) => {
                          const named = imagenDesdePasteEvent(e)
                          if (!named) return
                          e.preventDefault()
                          void onPickReplaceFiles([named], 'paste')
                        }}
                        style={{
                          marginTop: 10,
                          border: `2px dashed ${t.border}`,
                          borderRadius: 10,
                          padding: 12,
                          background: t.bg,
                          outline: 'none',
                        }}
                      >
                        <div style={{ fontSize: cc.sm, fontWeight: 700, marginBottom: 8, color: t.primary }}>
                          Nueva imagen (membresía intacta)
                        </div>
                        <PptoImageSourceBar
                          t={t}
                          disabled={busy}
                          onPickFiles={(files) => void onPickReplaceFiles(files)}
                          onOpenGaleria={() => setGaleriaOpen(true)}
                          onPasteClipboard={pegarReemplazoDesdeClipboard}
                          onFocusPasteZone={() => replaceDropRef.current?.focus?.()}
                          onOpenEsquema={() => setEsquemaOpen(true)}
                          hint="Archivo, galería, Ctrl+V o esquema · no altera registros · pie obligatorio arriba"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setReemplazarImagenId(null)}
                          style={{
                            marginTop: 8,
                            background: 'transparent',
                            border: 'none',
                            color: t.textMuted,
                            fontSize: cc.caption,
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          Cancelar reemplazo
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontWeight: 800, fontSize: cc.sm, color: t.text, marginBottom: 8 }}>
                      Registros del grupo ({(detalle.registros || []).length})
                    </div>
                    <div
                      style={{
                        border: `1px solid ${t.border}`,
                        borderRadius: 10,
                        overflow: 'hidden',
                        maxHeight: 220,
                      }}
                    >
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: cc.sm }}>
                        <thead>
                          <tr style={{ background: t.bg, position: 'sticky', top: 0 }}>
                            {['Id_Pol', 'Tramo', 'Ítem', ''].map((h) => (
                              <th
                                key={h || 'x'}
                                style={{
                                  padding: '6px 8px',
                                  textAlign: 'left',
                                  color: t.textMuted,
                                  fontWeight: 700,
                                  fontSize: cc.caption,
                                  borderBottom: `1px solid ${t.border}`,
                                }}
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(detalle.registros || []).map((r) => (
                            <tr key={r.id}>
                              <td style={{ padding: '5px 8px', borderBottom: `1px solid ${t.border}` }}>{r.id_pol || '—'}</td>
                              <td style={{ padding: '5px 8px', borderBottom: `1px solid ${t.border}` }}>{r.tramo || '—'}</td>
                              <td style={{ padding: '5px 8px', borderBottom: `1px solid ${t.border}` }}>
                                {r.capitulo} · {r.item}
                              </td>
                              <td style={{ padding: '5px 8px', borderBottom: `1px solid ${t.border}`, width: 40 }}>
                                <button
                                  type="button"
                                  title="Quitar del grupo"
                                  disabled={busy}
                                  onClick={() => void quitarReg(r.id)}
                                  style={{
                                    background: '#EF444418',
                                    border: '1px solid #EF444444',
                                    color: '#EF4444',
                                    borderRadius: 6,
                                    width: 28,
                                    height: 28,
                                    cursor: busy ? 'not-allowed' : 'pointer',
                                    fontWeight: 700,
                                  }}
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontWeight: 800, fontSize: cc.sm, color: t.text, marginBottom: 8 }}>
                      Agregar registros
                    </div>
                    <input
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      placeholder="Buscar por Id_Pol, ítem, tramo…"
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: `1px solid ${t.border}`,
                        background: t.bg,
                        color: t.text,
                        fontSize: cc.sm,
                        marginBottom: 8,
                      }}
                    />
                    {buscando && (
                      <div style={{ fontSize: cc.caption, color: t.textMuted, marginBottom: 6 }}>Buscando…</div>
                    )}
                    <div
                      style={{
                        border: `1px solid ${t.border}`,
                        borderRadius: 10,
                        maxHeight: 180,
                        overflowY: 'auto',
                      }}
                    >
                      {(resultados || [])
                        .filter((r) => !idsEnGrupo.has(r.id))
                        .slice(0, 30)
                        .map((r) => (
                          <div
                            key={r.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '6px 10px',
                              borderBottom: `1px solid ${t.border}`,
                              fontSize: cc.sm,
                            }}
                          >
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <strong>{r.id_pol || r.pk_id || r.id}</strong>
                              {' · '}
                              {r.item}
                              {' · '}
                              {r.tramo || '—'}
                            </span>
                            <button
                              type="button"
                              disabled={busy}
                              title="Agregar al grupo"
                              onClick={() => void agregarReg(r.id)}
                              style={{
                                background: t.primary,
                                color: '#fff',
                                border: 'none',
                                borderRadius: 6,
                                padding: '4px 10px',
                                fontWeight: 700,
                                fontSize: cc.caption,
                                cursor: busy ? 'not-allowed' : 'pointer',
                              }}
                            >
                              +
                            </button>
                          </div>
                        ))}
                      {!buscando && resultados.filter((r) => !idsEnGrupo.has(r.id)).length === 0 && (
                        <div style={{ padding: 12, color: t.textMuted, fontSize: cc.sm }}>
                          Sin resultados nuevos para agregar.
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ fontSize: cc.caption, color: t.textMuted }}>
                    Ítems donde aparece: {(detalle.items || []).join(', ') || '—'}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <PptoSicoeGaleriaPicker
        open={galeriaOpen}
        onClose={() => setGaleriaOpen(false)}
        t={t}
        contratoId={contratoId}
        token={token}
        API={API}
        onSelect={(item) => {
          if (!item?.url) return
          void aplicarReemplazo({ url: item.url, origen: 'galeria' })
        }}
      />

      {esquemaOpen && (
        <EsquemaEditorModal
          t={t}
          title="Dibujar esquema · reemplazar imagen del grupo"
          onClose={() => setEsquemaOpen(false)}
          onSave={guardarEsquemaReemplazo}
        />
      )}
    </>
  )
}
