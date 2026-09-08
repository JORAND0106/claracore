import { useState } from 'react'
import EsquemaEditorModal from '../../components/esquema/EsquemaEditorModal'
import AdjuntosMediaSlider from '../../components/adjuntos/AdjuntosMediaSlider'
import { slidesFromImagenes } from '../../components/adjuntos/adjuntosMedia'
import { prepararImagenParaUpload } from '../../comprimirImagen'
import {
  agregarEntradaGraficoHistorial,
  fmtFechaGrafico,
  etiquetaOrigenGrafico,
  dataUriEsquemaAFile,
  urlADataUriParaEsquema,
} from './sicoeGraficosHelpers'

function sicoeNumeroDesdeNextApi(j) {
  if (j == null) return null
  if (typeof j === 'number' && !Number.isNaN(j)) return j
  if (Array.isArray(j) && j.length) return sicoeNumeroDesdeNextApi(j[0])
  if (typeof j === 'object') {
    for (const k of ['numero', 'siguiente_numero_grafico', 'siguiente', 'id']) {
      if (j[k] != null) return Number(j[k])
    }
  }
  const n = Number(j)
  return Number.isNaN(n) ? null : n
}

async function sicoeFetchJsonOThrow(res) {
  if (!res.ok) {
    const t = await res.text()
    try {
      const j = JSON.parse(t)
      if (j?.detail) throw new Error(typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail))
    } catch (e) {
      if (e instanceof Error && e.message !== t) throw e
    }
    throw new Error(t || `HTTP ${res.status}`)
  }
  return res.json()
}

/**
 * Panel de gráficos en el wizard de nuevo reporte (tab Registros).
 * Varios gráficos por lote; al guardar se copian a cada registro del lote.
 */
export default function SicoeGraficosWizardPanel({
  t,
  API_URL,
  contrato_id,
  hdrs,
  graficos = [],
  onGraficosChange,
  titulo = 'Gráficos del registro',
  subtitulo,
  onOpenGaleria,
  iaDocKey = null,
}) {
  const [idx, setIdx] = useState(0)
  const [subiendo, setSubiendo] = useState(false)
  const [esquemaOpen, setEsquemaOpen] = useState(false)
  const [esquemaInitialDataUri, setEsquemaInitialDataUri] = useState(null)
  const [esquemaCargando, setEsquemaCargando] = useState(false)
  const lista = Array.isArray(graficos) ? graficos : []
  const safeIdx = Math.min(idx, Math.max(0, lista.length - 1))
  const actual = lista[safeIdx] || null

  const aplicar = (nuevaLista) => {
    onGraficosChange(nuevaLista)
    setIdx(Math.max(0, Math.min(safeIdx, nuevaLista.length - 1)))
  }

  const agregarEntrada = (entrada) => {
    aplicar(agregarEntradaGraficoHistorial(lista, entrada))
    setIdx(lista.length)
  }

  const subirArchivo = async (file, opts = {}) => {
    if (!file || subiendo) return
    const origen = opts.origen || 'manual'
    setSubiendo(true)
    try {
      const prepared = await prepararImagenParaUpload(file)
      const fd = new FormData()
      fd.append('file', prepared)
      const resN = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/next-grafico`, { method: 'POST', headers: hdrs })
      const numR = await sicoeFetchJsonOThrow(resN)
      const numero = sicoeNumeroDesdeNextApi(numR)
      if (numero == null) throw new Error('No se obtuvo el consecutivo de gráfico')
      fd.append('numero', String(numero))
      fd.append('descripcion', `Grafico-Registro-${numero}`)
      const r = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/upload-grafico`, {
        method: 'POST',
        headers: { Authorization: hdrs.Authorization },
        body: fd,
      })
      const data = await sicoeFetchJsonOThrow(r)
      agregarEntrada({
        url: data.url,
        numero: data.numero ?? numero,
        creado_en: new Date().toISOString(),
        origen,
      })
    } catch (err) {
      alert('Error subiendo gráfico: ' + (err?.message || String(err)))
    } finally {
      setSubiendo(false)
    }
  }

  const abrirEsquemaEditor = async () => {
    if (subiendo || esquemaCargando) return
    setEsquemaCargando(true)
    try {
      const dataUri = actual?.url ? await urlADataUriParaEsquema(actual.url) : null
      setEsquemaInitialDataUri(dataUri)
      setEsquemaOpen(true)
    } catch {
      setEsquemaInitialDataUri(null)
      setEsquemaOpen(true)
    } finally {
      setEsquemaCargando(false)
    }
  }

  const guardarEsquemaComoGrafico = async (dataUrl) => {
    if (!dataUrl || subiendo) return
    try {
      const file = await dataUriEsquemaAFile(dataUrl, 'esquema')
      if (!file) throw new Error('No se pudo convertir el esquema')
      setEsquemaOpen(false)
      setEsquemaInitialDataUri(null)
      await subirArchivo(file, { origen: 'esquema' })
    } catch (err) {
      alert('Error guardando esquema: ' + (err?.message || String(err)))
    }
  }

  const quitarActual = () => {
    if (!lista.length) return
    const nueva = lista.filter((_, i) => i !== safeIdx)
    aplicar(nueva)
  }

  return (
    <div style={{ marginTop: '8px', padding: '16px', background: t.bg, borderRadius: '12px', border: `1px solid ${t.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', gap: '8px' }}>
        <div>
          <label style={{ fontSize: 'var(--cc-sm)', fontWeight: '700', color: t.textMuted, display: 'block' }}>
            📐 {titulo}
            {actual?.numero != null && (
              <span style={{ color: t.primary, marginLeft: '8px' }}>
                #{String(actual.numero).padStart(4, '0')}
              </span>
            )}
          </label>
          {subtitulo && (
            <div style={{ fontSize: 'var(--cc-label)', color: t.textMuted, marginTop: '4px', lineHeight: 1.45 }}>
              {subtitulo}
            </div>
          )}
        </div>
        <span style={{ fontSize: 'var(--cc-label)', color: '#F59E0B', whiteSpace: 'nowrap' }}>Opcional — obligatorio en validación</span>
      </div>

      <div style={{ marginBottom: '8px' }}>
        <AdjuntosMediaSlider
          t={t}
          items={slidesFromImagenes(lista, (g) => g.url)}
          index={safeIdx}
          height={200}
          emptyLabel="Sin gráficos adjuntos aún"
          onIndexChange={setIdx}
        />
      </div>

      {actual && (
        <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginBottom: '8px' }}>
          {fmtFechaGrafico(actual.creado_en)} · {etiquetaOrigenGrafico(actual.origen)}
          {lista.length > 1 ? ` · ${lista.length} gráficos en este lote` : ''}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        {onOpenGaleria && (
          <button
            type="button"
            onClick={onOpenGaleria}
            style={{
              background: 'transparent', border: `1px solid ${t.border}`, color: t.textMuted,
              borderRadius: '6px', padding: '5px 12px', fontSize: 'var(--cc-label)', cursor: 'pointer',
            }}
          >
            🖼️ Galería
          </button>
        )}
        <label style={{
          background: 'transparent', border: `1px solid ${t.primary}`, color: t.primary,
          borderRadius: '6px', padding: '5px 12px', fontSize: 'var(--cc-label)', cursor: subiendo ? 'wait' : 'pointer',
          fontWeight: 600,
        }}>
          {subiendo ? '⏳ Subiendo…' : '+ Adjuntar gráfico'}
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            disabled={subiendo}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void subirArchivo(f, { origen: 'manual' })
              e.target.value = ''
            }}
          />
        </label>
        <button
          type="button"
          disabled={subiendo || esquemaCargando}
          onClick={() => void abrirEsquemaEditor()}
          style={{
            background: 'transparent', border: `1px solid ${t.border}`, color: t.textMuted,
            borderRadius: '6px', padding: '5px 12px', fontSize: 'var(--cc-label)',
            cursor: (subiendo || esquemaCargando) ? 'wait' : 'pointer', fontWeight: 600,
          }}
          title="Crear o continuar esquema a mano (mismo editor que Seguimiento)"
        >
          {esquemaCargando ? '⏳…' : (actual ? '✎ Editar esquema' : '✎ Crear esquema')}
        </button>
        {actual && (
          <button
            type="button"
            onClick={quitarActual}
            style={{
              background: 'transparent', border: 'none', color: '#EF4444',
              fontSize: 'var(--cc-label)', fontWeight: 600, cursor: 'pointer',
            }}
          >
            🗑️ Quitar
          </button>
        )}
      </div>
      {lista.length > 0 && (
        <div style={{ color: '#10B981', fontSize: 'var(--cc-sm)', marginTop: '6px' }}>
          ✅ {lista.length} gráfico{lista.length !== 1 ? 's' : ''} — se asignarán a los registros de este lote
        </div>
      )}

      {esquemaOpen && (
        <EsquemaEditorModal
          t={t}
          title={actual ? 'Editar esquema · gráfico del registro' : 'Crear esquema · gráfico del registro'}
          initialDataUri={esquemaInitialDataUri}
          contratoId={contrato_id}
          iaDoc={{ ambito: 'sicoe_lote', docKey: iaDocKey || `sicoe-lote-${contrato_id || 'local'}` }}
          onClose={() => { setEsquemaOpen(false); setEsquemaInitialDataUri(null) }}
          onSave={guardarEsquemaComoGrafico}
        />
      )}
    </div>
  )
}
