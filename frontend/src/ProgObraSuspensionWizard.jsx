import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { previewSuspension, applySuspension } from './progObraApi'
import { fmtDateHistorial } from './progObraVersiones'

const CAUSAS = [
  { id: 'fuerza_mayor', label: 'Fuerza mayor' },
  { id: 'caso_fortuito', label: 'Caso fortuito' },
  { id: 'mutuo_acuerdo', label: 'Mutuo acuerdo' },
  { id: 'orden_administrativa', label: 'Orden administrativa' },
  { id: 'otra', label: 'Otra' },
]

const RESPONSABLES = [
  { id: 'contratista', label: 'Contratista' },
  { id: 'entidad', label: 'Entidad contratante (IDU)' },
  { id: 'causa_externa', label: 'Causa externa' },
]

export default function ProgObraSuspensionWizard({
  open,
  onClose,
  onSuccess,
  t,
  API,
  cid,
  token,
  versionId,
  btnStyle,
  inputStyle,
}) {
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)

  const [form, setForm] = useState({
    acta_numero: '',
    acta_fecha: '',
    fecha_inicio_suspension: '',
    fecha_fin_suspension: '',
    motivo: '',
    causa_legal: 'fuerza_mayor',
    causa_otra: '',
    responsable: 'contratista',
  })

  useEffect(() => {
    if (!open) {
      setStep(1)
      setError('')
      setPreview(null)
      setProgress(0)
      setResult(null)
      setForm({
        acta_numero: '',
        acta_fecha: '',
        fecha_inicio_suspension: '',
        fecha_fin_suspension: '',
        motivo: '',
        causa_legal: 'fuerza_mayor',
        causa_otra: '',
        responsable: 'contratista',
      })
    }
  }, [open])

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const validateStep1 = () => {
    if (!form.acta_numero.trim()) return 'Acta de suspensión Nº es obligatoria'
    if (!form.acta_fecha || !form.fecha_inicio_suspension || !form.fecha_fin_suspension) return 'Complete todas las fechas'
    if (form.fecha_fin_suspension < form.fecha_inicio_suspension) return 'La fecha fin debe ser posterior al inicio'
    if (form.motivo.trim().length < 50) return 'El motivo debe tener al menos 50 caracteres'
    if (form.causa_legal === 'otra' && !form.causa_otra.trim()) return 'Indique la causa en «Otra»'
    return null
  }

  const goPreview = async () => {
    const err = validateStep1()
    if (err) {
      setError(err)
      return
    }
    setError('')
    setBusy(true)
    try {
      const p = await previewSuspension(API, cid, token, {
        versionId,
        fechaInicio: form.fecha_inicio_suspension,
        fechaFin: form.fecha_fin_suspension,
      })
      setPreview(p)
      setStep(2)
    } catch (e) {
      setError(e?.message || 'Error al calcular impacto')
    } finally {
      setBusy(false)
    }
  }

  const runApply = useCallback(async () => {
    setStep(4)
    setProgress(10)
    setBusy(true)
    try {
      setProgress(30)
      const meta = {
        acta_numero: form.acta_numero.trim(),
        acta_fecha: form.acta_fecha,
        fecha_inicio_suspension: form.fecha_inicio_suspension,
        fecha_fin_suspension: form.fecha_fin_suspension,
        causa_legal: form.causa_legal,
        causa_otra: form.causa_otra.trim(),
        responsable: form.responsable,
        motivo: form.motivo.trim(),
      }
      const res = await applySuspension(API, cid, token, {
        motivo: form.motivo.trim(),
        metadata: meta,
      })
      setProgress(80)
      await new Promise((r) => setTimeout(r, 400))
      setProgress(100)
      setResult(res)
      onSuccess?.(res)
    } catch (e) {
      setError(e?.message || 'Error al aplicar suspensión')
      setStep(3)
    } finally {
      setBusy(false)
    }
  }, [API, cid, token, form, onSuccess])

  if (!open) return null

  const overlay = {
    position: 'fixed',
    inset: 0,
    zIndex: 10060,
    background: 'rgba(15,23,42,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  }

  const card = {
    width: '100%',
    maxWidth: 560,
    maxHeight: '90vh',
    overflow: 'auto',
    background: t.bgCard,
    borderRadius: 12,
    border: `1px solid ${t.border}`,
    padding: 20,
    color: t.text,
  }

  return (
    <div style={overlay} onClick={() => !busy && onClose()}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: t.primary, fontSize: 15 }}>
            {step === 1 && 'SUSPENSIÓN CONTRACTUAL'}
            {step === 2 && 'IMPACTO DE LA SUSPENSIÓN'}
            {step === 3 && 'Confirmación'}
            {step === 4 && 'Procesando suspensión…'}
          </div>
          {step < 4 && (
            <button type="button" onClick={onClose} disabled={busy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted }}>
              <X size={18} />
            </button>
          )}
        </div>

        {error && (
          <div style={{ padding: '8px 10px', marginBottom: 12, borderRadius: 6, background: '#fee2e2', color: '#991b1b', fontSize: 12 }}>
            {error}
          </div>
        )}

        {step === 1 && (
          <>
            <label style={{ fontSize: 11, color: t.textMuted }}>Acta de suspensión Nº *</label>
            <input style={{ ...inputStyle, marginBottom: 10 }} value={form.acta_numero} onChange={(e) => setF('acta_numero', e.target.value)} />
            <label style={{ fontSize: 11, color: t.textMuted }}>Fecha del acta *</label>
            <input type="date" style={{ ...inputStyle, marginBottom: 10 }} value={form.acta_fecha} onChange={(e) => setF('acta_fecha', e.target.value)} />
            <label style={{ fontSize: 11, color: t.textMuted }}>Fecha inicio suspensión *</label>
            <input type="date" style={{ ...inputStyle, marginBottom: 10 }} value={form.fecha_inicio_suspension} onChange={(e) => setF('fecha_inicio_suspension', e.target.value)} />
            <label style={{ fontSize: 11, color: t.textMuted }}>Fecha fin suspensión *</label>
            <input type="date" style={{ ...inputStyle, marginBottom: 10 }} value={form.fecha_fin_suspension} onChange={(e) => setF('fecha_fin_suspension', e.target.value)} />
            <label style={{ fontSize: 11, color: t.textMuted }}>Motivo de la suspensión * (mín. 50 caracteres)</label>
            <textarea rows={4} style={{ ...inputStyle, marginBottom: 10, resize: 'vertical' }} value={form.motivo} onChange={(e) => setF('motivo', e.target.value)} />
            <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 10 }}>{form.motivo.length}/50 caracteres</div>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Causa legal:</div>
            {CAUSAS.map((c) => (
              <label key={c.id} style={{ display: 'block', fontSize: 12, marginBottom: 4, cursor: 'pointer' }}>
                <input type="radio" name="causa" checked={form.causa_legal === c.id} onChange={() => setF('causa_legal', c.id)} /> {c.label}
              </label>
            ))}
            {form.causa_legal === 'otra' && (
              <input style={{ ...inputStyle, marginBottom: 10 }} placeholder="Especifique…" value={form.causa_otra} onChange={(e) => setF('causa_otra', e.target.value)} />
            )}
            <div style={{ fontSize: 11, fontWeight: 600, margin: '10px 0 6px' }}>Responsable:</div>
            {RESPONSABLES.map((r) => (
              <label key={r.id} style={{ display: 'block', fontSize: 12, marginBottom: 4, cursor: 'pointer' }}>
                <input type="radio" name="resp" checked={form.responsable === r.id} onChange={() => setF('responsable', r.id)} /> {r.label}
              </label>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button type="button" style={btnStyle(false, busy)} disabled={busy} onClick={onClose}>Cancelar</button>
              <button type="button" style={btnStyle(true, busy)} disabled={busy} onClick={() => void goPreview()}>Siguiente →</button>
            </div>
          </>
        )}

        {step === 2 && preview && (
          <>
            <div style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 12 }}>
              <div>Días calendario suspendidos: <strong>{preview.dias_calendario_suspendidos}</strong></div>
              <div>Días hábiles a recalcular: <strong>{preview.dias_habiles_suspendidos}</strong></div>
              <div>Actividades afectadas: <strong>{preview.actividades_afectadas}</strong> de {preview.actividades_total} programadas</div>
              <div>PKs afectados: <strong>{preview.pks_afectados}</strong> de {preview.pks_total}</div>
              <div style={{ marginTop: 8 }}>
                Nueva fecha fin estimada del contrato:<br />
                Antes: <strong>{fmtDateHistorial(preview.fecha_fin_antes)}</strong><br />
                Después: <strong>{fmtDateHistorial(preview.fecha_fin_despues)}</strong><br />
                Diferencia: <strong>+{preview.delta_fin_calendario ?? '—'} días calendario</strong>
              </div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Vista previa de PKs afectados:</div>
            <div style={{ maxHeight: 160, overflow: 'auto', fontSize: 11, border: `1px solid ${t.border}`, borderRadius: 6, padding: 8 }}>
              {(preview.preview || []).map((r, i) => (
                <div key={i} style={{ marginBottom: 4 }}>
                  PK {r.pk_id} {r.label}{' '}
                  {fmtDateHistorial(r.fecha_inicio_antes?.slice?.(0, 10) || r.fecha_inicio_antes)} →{' '}
                  {fmtDateHistorial(r.fecha_inicio_despues?.slice?.(0, 10) || r.fecha_inicio_despues)}{' '}
                  ({r.delta_dias_calendario != null ? `+${r.delta_dias_calendario} días` : ''})
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16 }}>
              <button type="button" style={btnStyle(false, busy)} disabled={busy} onClick={() => setStep(1)}>← Volver</button>
              <button type="button" style={btnStyle(true, busy)} disabled={busy} onClick={() => setStep(3)}>Siguiente →</button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div style={{ fontSize: 12, lineHeight: 1.7, marginBottom: 16 }}>
              <div style={{ color: '#b45309', fontWeight: 700, marginBottom: 8 }}>⚠ Esta acción:</div>
              <div>✓ Registrará {preview?.dias_habiles_suspendidos ?? '—'} días no hábiles en el calendario del contrato</div>
              <div>✓ Recalculará automáticamente TODAS las fechas posteriores</div>
              <div>✓ Re-ejecutará el CPM con las nuevas fechas</div>
              <div>✓ Creará una nueva versión tipo «suspensión» con los datos del acta</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" style={btnStyle(false, busy)} disabled={busy} onClick={() => setStep(2)}>Cancelar</button>
              <button type="button" style={btnStyle(true, busy)} disabled={busy} onClick={() => void runApply()}>Confirmar suspensión</button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div style={{ height: 8, background: t.border, borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ height: '100%', width: `${progress}%`, background: t.primary, transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 12 }}>
              {progress < 100 ? 'Insertando días en calendario, recalculando fechas y CPM…' : 'Completado.'}
            </div>
            {result && (
              <div style={{ fontSize: 13, fontWeight: 600, color: t.primary, marginBottom: 16 }}>
                Suspensión aplicada. {result.actividades_recalculadas} actividades recalculadas.
                Nueva fecha fin: {fmtDateHistorial(result.fecha_fin_nueva) || '—'}
              </div>
            )}
            {result && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" style={btnStyle(true, false)} onClick={onClose}>Cerrar</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
