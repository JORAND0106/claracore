import { useCallback, useEffect, useRef, useState } from 'react'
import CcModalBrandHeader from '../components/CcModalBrandHeader'
import { API_BASE } from '../apiBase'
import { contabGet, contabSend } from './contabilidadApi'
import { prepareSoporteConPeso } from './contabilidadImageCompress'
import SoportePreviewModal from './SoportePreviewModal'
import { DOC_CATEGORIAS, docCategoriaLabel, fmtBytes, fmtFecha, labelPesoSoporte, vencePronto, vencido } from './contabilidadUi'

const EMPTY_FORM = {
  categoria: 'tributario',
  nombre: '',
  descripcion: '',
  fecha_documento: '',
  fecha_vencimiento: '',
}

/** Fuera del padre: si se definen dentro, cada setState remonta el árbol y se pierde foco/archivo. */
function DocField({ label, t, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 600, color: t.textMuted, marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  )
}

function DocModalForm({ title, onSubmit, onClose, t, busy, btnGhost, btnPrimary, children }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 12500, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 14,
          width: 'min(520px, 96vw)', maxHeight: '90vh', overflow: 'auto', padding: 20,
        }}
      >        <CcModalBrandHeader theme={t} />

        <div style={{ fontWeight: 800, color: t.primary, marginBottom: 16, fontSize: 'var(--cc-md)' }}>
          {title}
        </div>
        {children}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" onClick={onClose} style={btnGhost}>Cancelar</button>
          <button type="submit" disabled={busy} style={btnPrimary}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function ContabilidadDocumentos({ t, token, onAlertasChange }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filtroCat, setFiltroCat] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [busy, setBusy] = useState(false)

  const [showUpload, setShowUpload] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [archivo, setArchivo] = useState(null)
  const [archivoInfo, setArchivoInfo] = useState(null)
  const [archivoReemplazo, setArchivoReemplazo] = useState(null)
  const [archivoReemplazoInfo, setArchivoReemplazoInfo] = useState(null)
  const [preparandoArchivo, setPreparandoArchivo] = useState(false)
  const [docEditando, setDocEditando] = useState(null)
  const [alertas, setAlertas] = useState(null)
  const fileRef = useRef(null)
  const replaceFileRef = useRef(null)

  const [preview, setPreview] = useState({
    open: false, loading: false, error: '', nombre: '', mime: '', blobUrl: null,
  })
  const previewUrlRef = useRef(null)

  const cerrarPreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setPreview({ open: false, loading: false, error: '', nombre: '', mime: '', blobUrl: null })
  }, [])

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [data, alertData] = await Promise.all([
        contabGet('/documentos', token, {
          categoria: filtroCat || undefined,
          q: busqueda.trim() || undefined,
          limit: 300,
        }),
        contabGet('/documentos/alertas-vencimiento', token, { dias_alerta: 30 }),
      ])
      setItems(data.items || [])
      setAlertas(alertData)
      onAlertasChange?.()
    } catch (e) {
      setError(e.message || 'Error al cargar documentos')
    } finally {
      setLoading(false)
    }
  }, [token, filtroCat, busqueda, onAlertasChange])

  useEffect(() => { cargar() }, [cargar])

  const abrirPreview = async (doc) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setPreview({
      open: true,
      loading: true,
      error: '',
      nombre: doc.nombre_archivo || doc.nombre || 'Documento',
      mime: doc.mime_type || '',
      blobUrl: null,
    })
    try {
      const r = await fetch(`${API_BASE}/contabilidad/documentos/${doc.id}/archivo?inline=true`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!r.ok) throw new Error('No se pudo cargar el documento')
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      previewUrlRef.current = url
      setPreview((p) => ({
        ...p,
        loading: false,
        blobUrl: url,
        mime: doc.mime_type || blob.type || '',
      }))
    } catch (e) {
      setPreview((p) => ({ ...p, loading: false, error: e.message || 'Error al cargar' }))
    }
  }

  const descargarDoc = async (doc) => {
    try {
      const r = await fetch(`${API_BASE}/contabilidad/documentos/${doc.id}/archivo?inline=false`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!r.ok) throw new Error('No se pudo descargar')
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = doc.nombre_archivo || doc.nombre || 'documento'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e.message || 'Error al descargar')
    }
  }

  const descargarPreview = () => {
    if (!preview.blobUrl || !preview.nombre) return
    const a = document.createElement('a')
    a.href = preview.blobUrl
    a.download = preview.nombre
    a.click()
  }

  const abrirSubir = () => {
    setForm(EMPTY_FORM)
    setArchivo(null)
    setArchivoInfo(null)
    if (fileRef.current) fileRef.current.value = ''
    setShowUpload(true)
    setShowEdit(false)
    setEditId(null)
  }

  const abrirEditar = (doc) => {
    setEditId(doc.id)
    setDocEditando(doc)
    setArchivoReemplazo(null)
    setArchivoReemplazoInfo(null)
    if (replaceFileRef.current) replaceFileRef.current.value = ''
    setForm({
      categoria: doc.categoria || 'otros',
      nombre: doc.nombre || '',
      descripcion: doc.descripcion || '',
      fecha_documento: (doc.fecha_documento || '').slice(0, 10),
      fecha_vencimiento: (doc.fecha_vencimiento || '').slice(0, 10),
    })
    setShowEdit(true)
    setShowUpload(false)
  }

  const cerrarModales = () => {
    setShowUpload(false)
    setShowEdit(false)
    setEditId(null)
    setDocEditando(null)
    setArchivo(null)
    setArchivoInfo(null)
    setArchivoReemplazo(null)
    setArchivoReemplazoInfo(null)
    if (fileRef.current) fileRef.current.value = ''
    if (replaceFileRef.current) replaceFileRef.current.value = ''
  }

  const onArchivoChange = async (e) => {
    const f = e.target.files?.[0]
    if (!f) {
      setArchivo(null)
      setArchivoInfo(null)
      return
    }
    if (f && !form.nombre.trim()) {
      const base = (f.name || '').replace(/\.[^.]+$/, '')
      setForm((prev) => ({ ...prev, nombre: base }))
    }
    setPreparandoArchivo(true)
    try {
      const prepared = await prepareSoporteConPeso(f)
      setArchivo(prepared.file)
      setArchivoInfo(prepared)
    } catch {
      setArchivo(f)
      setArchivoInfo({
        file: f,
        originalBytes: f.size,
        compressedBytes: f.size,
        wasCompressed: false,
      })
    } finally {
      setPreparandoArchivo(false)
    }
  }

  const onArchivoReemplazoChange = async (e) => {
    const f = e.target.files?.[0]
    if (!f) {
      setArchivoReemplazo(null)
      setArchivoReemplazoInfo(null)
      return
    }
    setPreparandoArchivo(true)
    try {
      const prepared = await prepareSoporteConPeso(f)
      setArchivoReemplazo(prepared.file)
      setArchivoReemplazoInfo(prepared)
    } catch {
      setArchivoReemplazo(f)
      setArchivoReemplazoInfo({
        file: f,
        originalBytes: f.size,
        compressedBytes: f.size,
        wasCompressed: false,
      })
    } finally {
      setPreparandoArchivo(false)
    }
  }

  const subirDocumento = async (e) => {
    e.preventDefault()
    if (!archivo) {
      setError('Seleccione un archivo.')
      return
    }
    if (!form.nombre.trim()) {
      setError('El nombre es obligatorio.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('archivo', archivo)
      fd.append('categoria', form.categoria)
      fd.append('nombre', form.nombre.trim())
      if (form.descripcion.trim()) fd.append('descripcion', form.descripcion.trim())
      if (form.fecha_documento) fd.append('fecha_documento', form.fecha_documento)
      if (form.fecha_vencimiento) fd.append('fecha_vencimiento', form.fecha_vencimiento)
      await contabSend('/documentos', token, { method: 'POST', formData: fd })
      cerrarModales()
      await cargar()
    } catch (err) {
      setError(err.message || 'Error al subir')
    } finally {
      setBusy(false)
    }
  }

  const guardarEdicion = async (e) => {
    e.preventDefault()
    if (!editId || !form.nombre.trim()) return
    setBusy(true)
    setError('')
    try {
      await contabSend(`/documentos/${editId}`, token, {
        method: 'PATCH',
        body: {
          categoria: form.categoria,
          nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim() || null,
          fecha_documento: form.fecha_documento || null,
          fecha_vencimiento: form.fecha_vencimiento || null,
        },
      })
      if (archivoReemplazo) {
        const fd = new FormData()
        fd.append('archivo', archivoReemplazo)
        await contabSend(`/documentos/${editId}/archivo`, token, { method: 'PUT', formData: fd })
      }
      cerrarModales()
      await cargar()
    } catch (err) {
      setError(err.message || 'Error al guardar')
    } finally {
      setBusy(false)
    }
  }

  const eliminarDoc = async (doc) => {
    if (!window.confirm(`¿Eliminar el documento "${doc.nombre}"?`)) return
    setBusy(true)
    setError('')
    try {
      await contabSend(`/documentos/${doc.id}`, token, { method: 'DELETE' })
      await cargar()
    } catch (err) {
      setError(err.message || 'Error al eliminar')
    } finally {
      setBusy(false)
    }
  }

  const isNarrow = typeof window !== 'undefined' && window.innerWidth < 720
  const inputStyle = {
    width: '100%', padding: isNarrow ? '12px 12px' : '8px 10px', borderRadius: 8,
    border: `1px solid ${t.border}`, background: t.bg, color: t.text,
    fontSize: 'var(--cc-sm)', boxSizing: 'border-box', minHeight: isNarrow ? 44 : undefined,
  }

  const btnPrimary = {
    background: t.primary, color: '#fff', border: 'none', borderRadius: 8,
    padding: isNarrow ? '12px 16px' : '8px 14px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
    fontSize: 'var(--cc-sm)', opacity: busy ? 0.7 : 1, minHeight: isNarrow ? 44 : undefined,
  }

  const btnGhost = {
    background: 'transparent', color: t.text, border: `1px solid ${t.border}`,
    borderRadius: 8, padding: isNarrow ? '10px 12px' : '8px 14px', fontWeight: 600, cursor: 'pointer',
    fontSize: 'var(--cc-sm)', minHeight: isNarrow ? 40 : undefined,
  }

  return (
    <div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 16,
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <select
            value={filtroCat}
            onChange={(e) => setFiltroCat(e.target.value)}
            style={{ ...inputStyle, width: 'auto', minWidth: 140 }}
          >
            <option value="">Todas las categorías</option>
            {DOC_CATEGORIAS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <input
            type="search"
            placeholder="Buscar por nombre…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ ...inputStyle, width: 'min(260px, 100%)' }}
          />
        </div>
        <button type="button" onClick={abrirSubir} style={btnPrimary}>
          + Subir documento
        </button>
      </div>

      {error && (
        <div style={{ color: '#EF4444', marginBottom: 12, fontSize: 'var(--cc-sm)' }}>{error}</div>
      )}

      {alertas && alertas.total_alertas > 0 && (
        <div style={{
          background: t.bgCard,
          border: `1px solid ${alertas.total_vencidos > 0 ? '#EF444466' : '#F59E0B66'}`,
          borderRadius: 10,
          padding: '10px 14px',
          marginBottom: 14,
          fontSize: 'var(--cc-sm)',
          borderLeft: `4px solid ${alertas.total_vencidos > 0 ? '#EF4444' : '#F59E0B'}`,
        }}>
          <span style={{ fontWeight: 700, color: t.text }}>Atención: </span>
          {alertas.total_vencidos > 0 && (
            <span style={{ color: '#EF4444', fontWeight: 700, marginRight: 10 }}>
              {alertas.total_vencidos} documento{alertas.total_vencidos !== 1 ? 's' : ''} vencido{alertas.total_vencidos !== 1 ? 's' : ''}
            </span>
          )}
          {alertas.total_por_vencer > 0 && (
            <span style={{ color: '#F59E0B', fontWeight: 700 }}>
              {alertas.total_por_vencer} por vencer en los próximos 30 días
            </span>
          )}
          <span style={{ color: t.textMuted }}> — revise la columna «Vence».</span>
        </div>
      )}

      {loading ? (
        <div style={{ color: t.textMuted }}>Cargando documentos…</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)' }}>
            <thead>
              <tr style={{ background: t.primary + '18' }}>
                {['Categoría', 'Nombre', 'Fecha doc.', 'Vence', 'Tamaño', 'Acciones'].map((h) => (
                  <th key={h} style={{ padding: '10px 8px', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((doc) => {
                const exp = vencido(doc.fecha_vencimiento)
                const soon = vencePronto(doc.fecha_vencimiento)
                return (
                  <tr key={doc.id} style={{ borderBottom: `1px solid ${t.border}` }}>
                    <td style={{ padding: '10px 8px' }}>{docCategoriaLabel(doc.categoria)}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ fontWeight: 600, color: t.text }}>{doc.nombre}</div>
                      {doc.descripcion && (
                        <div style={{ color: t.textMuted, fontSize: 'var(--cc-xs)', marginTop: 2 }}>
                          {doc.descripcion}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 8px' }}>{fmtFecha(doc.fecha_documento)}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <span style={{
                        color: exp ? '#EF4444' : soon ? '#F59E0B' : t.text,
                        fontWeight: (exp || soon) ? 700 : 400,
                      }}>
                        {fmtFecha(doc.fecha_vencimiento)}
                      </span>
                    </td>
                    <td style={{ padding: '10px 8px', color: t.textMuted }}>{fmtBytes(doc.tamano_bytes)}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <button type="button" title="Vista previa" onClick={() => abrirPreview(doc)} style={btnGhost}>
                          👁
                          <span style={{ marginLeft: 4, fontWeight: 500, color: t.textMuted, fontSize: 'var(--cc-xs)' }}>
                            {fmtBytes(doc.tamano_bytes)}
                          </span>
                        </button>
                        <button type="button" title="Descargar" onClick={() => descargarDoc(doc)} style={btnGhost}>
                          ⬇
                        </button>
                        <button type="button" title="Editar" onClick={() => abrirEditar(doc)} style={btnGhost}>
                          ✎
                        </button>
                        <button
                          type="button"
                          title="Eliminar"
                          onClick={() => eliminarDoc(doc)}
                          style={{ ...btnGhost, color: '#EF4444', borderColor: '#EF444466' }}
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!items.length && (
                <tr>
                  <td colSpan={6} style={{ padding: 28, textAlign: 'center', color: t.textMuted }}>
                    No hay documentos registrados. Use «Subir documento» para agregar el primero.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showUpload && (
        <DocModalForm
          title="Subir documento corporativo"
          onSubmit={subirDocumento}
          onClose={cerrarModales}
          t={t}
          busy={busy}
          btnGhost={btnGhost}
          btnPrimary={btnPrimary}
        >
          <DocField label="Categoría" t={t}>
            <select
              value={form.categoria}
              onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
              style={inputStyle}
              required
            >
              {DOC_CATEGORIAS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </DocField>
          <DocField label="Nombre" t={t}>
            <input
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              style={inputStyle}
              required
              maxLength={200}
            />
          </DocField>
          <DocField label="Descripción (opcional)" t={t}>
            <textarea
              value={form.descripcion}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
              maxLength={4000}
            />
          </DocField>
          <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : '1fr 1fr', gap: 10 }}>
            <DocField label="Fecha del documento" t={t}>
              <input
                type="date"
                value={form.fecha_documento}
                onChange={(e) => setForm((f) => ({ ...f, fecha_documento: e.target.value }))}
                style={inputStyle}
              />
            </DocField>
            <DocField label="Fecha de vencimiento" t={t}>
              <input
                type="date"
                value={form.fecha_vencimiento}
                onChange={(e) => setForm((f) => ({ ...f, fecha_vencimiento: e.target.value }))}
                style={inputStyle}
              />
            </DocField>
          </div>
          <DocField label="Archivo (PDF o imagen)" t={t}>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,image/jpeg,image/png,image/webp,image/*"
              capture="environment"
              onChange={onArchivoChange}
              style={inputStyle}
            />
            {preparandoArchivo && !archivoInfo && (
              <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginTop: 4 }}>
                Preparando archivo…
              </div>
            )}
            {archivo && archivoInfo && (
              <div style={{ fontSize: 'var(--cc-xs)', color: t.primary, fontWeight: 600, marginTop: 4 }}>
                {archivo.name} · {labelPesoSoporte(archivoInfo)}
              </div>
            )}
          </DocField>
        </DocModalForm>
      )}

      {showEdit && (
        <DocModalForm
          title="Editar documento"
          onSubmit={guardarEdicion}
          onClose={cerrarModales}
          t={t}
          busy={busy}
          btnGhost={btnGhost}
          btnPrimary={btnPrimary}
        >
          <DocField label="Categoría" t={t}>
            <select
              value={form.categoria}
              onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
              style={inputStyle}
              required
            >
              {DOC_CATEGORIAS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </DocField>
          <DocField label="Nombre" t={t}>
            <input
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              style={inputStyle}
              required
              maxLength={200}
            />
          </DocField>
          <DocField label="Descripción" t={t}>
            <textarea
              value={form.descripcion}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
              maxLength={4000}
            />
          </DocField>
          <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : '1fr 1fr', gap: 10 }}>
            <DocField label="Fecha del documento" t={t}>
              <input
                type="date"
                value={form.fecha_documento}
                onChange={(e) => setForm((f) => ({ ...f, fecha_documento: e.target.value }))}
                style={inputStyle}
              />
            </DocField>
            <DocField label="Fecha de vencimiento" t={t}>
              <input
                type="date"
                value={form.fecha_vencimiento}
                onChange={(e) => setForm((f) => ({ ...f, fecha_vencimiento: e.target.value }))}
                style={inputStyle}
              />
            </DocField>
          </div>
          <DocField label="Reemplazar archivo (opcional)" t={t}>
            {docEditando && (
              <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginBottom: 6 }}>
                Archivo actual: {docEditando.nombre_archivo || '—'} · {fmtBytes(docEditando.tamano_bytes)}
              </div>
            )}
            <input
              ref={replaceFileRef}
              type="file"
              accept=".pdf,image/jpeg,image/png,image/webp,image/*"
              capture="environment"
              onChange={onArchivoReemplazoChange}
              style={inputStyle}
            />
            {preparandoArchivo && !archivoReemplazoInfo && (
              <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginTop: 4 }}>
                Preparando archivo…
              </div>
            )}
            {archivoReemplazo && archivoReemplazoInfo && (
              <div style={{ fontSize: 'var(--cc-xs)', color: t.primary, fontWeight: 600, marginTop: 4 }}>
                Nuevo: {archivoReemplazo.name} · {labelPesoSoporte(archivoReemplazoInfo)}
              </div>
            )}
          </DocField>
        </DocModalForm>
      )}

      <SoportePreviewModal
        t={t}
        open={preview.open}
        loading={preview.loading}
        error={preview.error}
        nombre={preview.nombre}
        mime={preview.mime}
        blobUrl={preview.blobUrl}
        onClose={cerrarPreview}
        onDownload={descargarPreview}
      />
    </div>
  )
}
