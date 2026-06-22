import { useCallback, useEffect, useMemo, useState } from 'react'
import { API_BASE } from '../apiBase'
import { useModulo } from '../context/ModuloContext'
import {
  REPORTE_CRITICIDAD,
  REPORTE_OTRO_KEY,
  getOpcionesSector,
  getOpcionesUbicacion,
  resolverEtiqueta,
} from '../config/reporteErroresJerarquia'
import { comprimirImagenADataUrl } from '../comprimirImagen'
import {
  construirMensajeError,
  construirMensajeMejora,
  getModulosVisiblesReporte,
  moduloDesdeContexto,
  usuarioPuedeReportarErrores,
} from '../config/reporteErroresHelpers'

const OTRO = REPORTE_OTRO_KEY

const inputStyle = (t) => ({
  width: '100%',
  background: t.inputBg || t.bg,
  border: `1px solid ${t.inputBorder || t.border}`,
  borderRadius: '10px',
  padding: '9px 12px',
  color: t.text,
  fontSize: 'var(--cc-sm)',
  boxSizing: 'border-box',
  outline: 'none',
})

const labelStyle = {
  fontSize: 'var(--cc-caption)',
  fontWeight: '700',
  letterSpacing: '0.6px',
  textTransform: 'uppercase',
  display: 'block',
  marginBottom: '6px',
}

function ModalHeader({ t, icon, title, subtitle, onClose, disabled }) {
  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${t.primary} 0%, ${t.primaryLight || '#00B4C6'} 100%)`,
        padding: '20px 22px 18px',
        color: '#fff',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        onClick={onClose}
        disabled={disabled}
        aria-label="Cerrar"
        style={{
          position: 'absolute',
          top: 14,
          right: 14,
          background: 'rgba(255,255,255,0.15)',
          border: 'none',
          borderRadius: '8px',
          width: 32,
          height: 32,
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: '#fff',
          fontSize: 'var(--cc-md)',
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ✕
      </button>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, paddingRight: 36 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: '12px',
            background: 'rgba(255,255,255,0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.45rem',
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 'var(--cc-md)', fontWeight: '800', letterSpacing: '-0.02em', lineHeight: 1.25 }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 'var(--cc-sm)', opacity: 0.92, marginTop: 4, lineHeight: 1.4 }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SelectConOtro({ t, label, value, onChange, options, otroText, onOtroText, otroPlaceholder }) {
  return (
    <div>
      <label style={{ ...labelStyle, color: t.textMuted }}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle(t)}>
        <option value="">— Selecciona —</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
        <option value={REPORTE_OTRO_KEY}>Otro</option>
      </select>
      {value === REPORTE_OTRO_KEY && (
        <input
          value={otroText}
          onChange={(e) => onOtroText(e.target.value)}
          placeholder={otroPlaceholder}
          style={{ ...inputStyle(t), marginTop: '8px' }}
        />
      )}
    </div>
  )
}

function TipoCard({ t, icon, title, desc, accent, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: t.bgCard,
        border: `1px solid ${t.border}`,
        borderRadius: '14px',
        padding: '18px 16px',
        textAlign: 'left',
        cursor: 'pointer',
        color: t.text,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 10,
        transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.1s',
        boxShadow: t.shadow,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = accent
        e.currentTarget.style.boxShadow = `0 4px 20px ${accent}33`
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = t.border
        e.currentTarget.style.boxShadow = t.shadow
        e.currentTarget.style.transform = 'none'
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: '10px',
          background: `${accent}18`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.25rem',
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontWeight: '700', fontSize: 'var(--cc-sm)', marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 'var(--cc-label)', color: t.textMuted, lineHeight: 1.35 }}>{desc}</div>
      </div>
    </button>
  )
}

function CriticidadEmoji({ c, selected, onSelect, index, total }) {
  const [hover, setHover] = useState(false)
  const align = index <= 1 ? 'start' : index >= total - 2 ? 'end' : 'center'
  const tooltipPos =
    align === 'start'
      ? { left: 0, right: 'auto', transform: 'none' }
      : align === 'end'
        ? { left: 'auto', right: 0, transform: 'none' }
        : { left: '50%', right: 'auto', transform: 'translateX(-50%)' }

  return (
    <div style={{ position: 'relative', flex: '1 1 0', minWidth: 0 }}>
      <button
        type="button"
        title=""
        aria-label={c.label}
        onClick={() => onSelect(c.key)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        style={{
          width: '100%',
          aspectRatio: '1',
          maxHeight: 52,
          borderRadius: '12px',
          cursor: 'pointer',
          fontSize: '1.65rem',
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: selected ? `${c.color}22` : 'transparent',
          border: `2px solid ${selected ? c.color : 'transparent'}`,
          boxShadow: selected ? `0 0 0 1px ${c.color}44` : 'none',
          transition: 'background 0.12s, border-color 0.12s, transform 0.1s',
          transform: hover && !selected ? 'scale(1.08)' : selected ? 'scale(1.05)' : 'none',
        }}
      >
        {c.emoji}
      </button>
      {hover && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            ...tooltipPos,
            background: '#0F172A',
            color: '#F8FAFC',
            fontSize: 'var(--cc-caption)',
            fontWeight: 600,
            padding: '6px 10px',
            borderRadius: '8px',
            whiteSpace: 'nowrap',
            textAlign: 'center',
            lineHeight: 1.3,
            zIndex: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            pointerEvents: 'none',
          }}
        >
          {c.label}
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              border: '6px solid transparent',
              borderTopColor: '#0F172A',
            }}
          />
        </div>
      )}
    </div>
  )
}

function BtnPrimario({ t, onClick, disabled, busy, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? t.border : `linear-gradient(135deg, ${t.primary} 0%, ${t.primaryLight || t.primary} 100%)`,
        color: '#fff',
        border: 'none',
        borderRadius: '10px',
        padding: '11px 22px',
        fontSize: 'var(--cc-sm)',
        fontWeight: '800',
        cursor: disabled ? 'not-allowed' : busy ? 'wait' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        boxShadow: disabled ? 'none' : '0 4px 16px rgba(0,119,182,0.35)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {children}
    </button>
  )
}

function BtnSecundario({ t, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'transparent',
        border: `1px solid ${t.border}`,
        borderRadius: '10px',
        padding: '10px 18px',
        fontSize: 'var(--cc-sm)',
        fontWeight: '600',
        color: t.textMuted,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function resetFormState() {
  return {
    paso: 'tipo',
    tipo: null,
    modulo: '',
    ubicacion: '',
    sector: '',
    otroModulo: '',
    otroUbicacion: '',
    otroSector: '',
    descripcion: '',
    mejoraTexto: '',
    criticidad: null,
    imagenNombre: '',
    imagenPreview: null,
    enviando: false,
    confirmacion: null,
  }
}

export function ReporteErroresBtn({ t, usuario, token }) {
  const { moduloActivo: moduloCtx } = useModulo()
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState(resetFormState)
  const [destDevId, setDestDevId] = useState(null)

  const puedeVer = usuarioPuedeReportarErrores(usuario)
  const modulosVisibles = useMemo(() => getModulosVisiblesReporte(usuario), [usuario])

  const prefModulo = useMemo(() => {
    const key = moduloDesdeContexto(moduloCtx)
    if (!key) return ''
    return modulosVisibles.some((m) => m.key === key) ? key : ''
  }, [moduloCtx, modulosVisibles])

  const cargarDestinatarioDev = useCallback(async () => {
    if (!token) return
    const p = new URLSearchParams()
    const cid = usuario?.contrato_id
    if (cid != null && cid !== '') p.set('contrato_id', String(cid))
    const qs = p.toString()
    const r = await fetch(
      `${API_BASE}/notificaciones/usuarios-destinatarios${qs ? `?${qs}` : ''}`,
      { headers: { Authorization: `Bearer ${token}` } },
    ).catch(() => null)
    if (!r?.ok) return
    const data = await r.json()
    const norm = (txt) => String(txt || '').trim().toLowerCase()
    const esDesarrollador = (d) =>
      norm(d.cargo) === 'desarrollador' || norm(d.rol) === 'desarrollador'
    const devs = (Array.isArray(data) ? data : []).filter(esDesarrollador)
    const uid = usuario?.id
    const otro = devs.find((d) => d.id !== uid)
    setDestDevId((otro || devs[0])?.id ?? null)
  }, [token, usuario?.contrato_id, usuario?.id])

  useEffect(() => {
    if (!abierto) return
    void cargarDestinatarioDev()
  }, [abierto, cargarDestinatarioDev])

  const handleDescripcionPaste = (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) return
        void comprimirImagenADataUrl(file)
          .then((dataUrl) => {
            setForm((f) => ({
              ...f,
              imagenNombre: (file.name || 'captura').replace(/\.[^.]+$/, '') + '.jpg',
              imagenPreview: dataUrl,
            }))
          })
          .catch(() => {})
        break
      }
    }
  }

  const abrir = () => {
    setForm({ ...resetFormState(), modulo: prefModulo })
    setAbierto(true)
  }

  const cerrar = () => {
    setAbierto(false)
    setForm(resetFormState())
  }

  const patch = (partial) => setForm((f) => ({ ...f, ...partial }))

  const ubicaciones = useMemo(
    () => (form.modulo && form.modulo !== OTRO ? getOpcionesUbicacion(form.modulo) : []),
    [form.modulo],
  )

  const sectores = useMemo(
    () =>
      form.modulo && form.ubicacion && form.ubicacion !== OTRO
        ? getOpcionesSector(form.modulo, form.ubicacion)
        : [],
    [form.modulo, form.ubicacion],
  )

  const enviarNotificacion = async ({ asunto, mensaje, modulo }) => {
    if (!destDevId) {
      patch({ enviando: false, confirmacion: null })
      alert('No se encontró un destinatario Desarrollador para recibir el reporte.')
      return false
    }
    const contratoCtx = usuario?.contrato_id
    const body = {
      destinatario_id: destDevId,
      asunto,
      mensaje,
      tipo: 'SOPORTE',
      modulo: modulo || null,
      contrato_id:
        contratoCtx != null && contratoCtx !== '' ? parseInt(contratoCtx, 10) : null,
    }
    const r = await fetch(`${API_BASE}/notificaciones`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    return r.ok
  }

  const enviarMejora = async () => {
    if (!form.mejoraTexto.trim()) return
    patch({ enviando: true })
    const ok = await enviarNotificacion({
      asunto: '[Mejora] Sugerencia de usuario',
      mensaje: construirMensajeMejora(form.mejoraTexto),
      modulo: prefModulo || null,
    })
    patch({ enviando: false, confirmacion: ok ? 'gracias-mejora' : 'error' })
    if (ok) setTimeout(cerrar, 2800)
  }

  const enviarError = async () => {
    if (
      !form.modulo ||
      !form.ubicacion ||
      !form.sector ||
      !form.descripcion.trim() ||
      !form.criticidad
    ) {
      return
    }
    if (form.modulo === OTRO && !form.otroModulo.trim()) return
    if (form.ubicacion === OTRO && !form.otroUbicacion.trim()) return
    if (form.sector === OTRO && !form.otroSector.trim()) return

    const crit = REPORTE_CRITICIDAD.find((c) => c.key === form.criticidad)
    const { modLabel, uLabel, sLabel } = resolverEtiqueta(
      form.modulo,
      form.ubicacion,
      form.sector,
      form.otroModulo,
      form.otroUbicacion,
      form.otroSector,
    )
    const criticidadLabel = crit ? `${crit.emoji} ${crit.label}` : String(form.criticidad)

    patch({ enviando: true })
    const ok = await enviarNotificacion({
      asunto: `[Error] ${modLabel} — ${crit?.label?.split('—')[0]?.trim() || 'Reporte'}`,
      mensaje: construirMensajeError({
        modLabel,
        uLabel,
        sLabel,
        descripcion: form.descripcion,
        criticidadLabel,
        imagenAdjunta: !!form.imagenNombre,
      }),
      modulo: form.modulo === OTRO ? 'OTRO' : form.modulo.toUpperCase(),
    })
    patch({ enviando: false, confirmacion: ok ? 'gracias-error' : 'error' })
    if (ok) setTimeout(cerrar, 2200)
  }

  const headerMeta = useMemo(() => {
    if (form.confirmacion === 'gracias-mejora') {
      return { title: '¡Gracias!', subtitle: 'Tu idea nos ayuda a mejorar ClaraCore.' }
    }
    if (form.confirmacion === 'gracias-error') {
      return { title: 'Reporte enviado', subtitle: 'El equipo lo revisará pronto.' }
    }
    if (form.paso === 'error') {
      return { title: 'Reportar un error', subtitle: 'Cuéntanos qué ocurrió y dónde.' }
    }
    if (form.paso === 'mejora') {
      return { title: 'Sugerir una mejora', subtitle: 'Tu opinión construye la plataforma.' }
    }
    return { title: 'Reporte y mejoras', subtitle: '¿Encontraste algo? Lo resolvemos.' }
  }, [form.paso, form.confirmacion])

  const errorFormValid =
    form.modulo &&
    form.ubicacion &&
    form.sector &&
    form.descripcion.trim() &&
    form.criticidad &&
    !(form.modulo === OTRO && !form.otroModulo.trim()) &&
    !(form.ubicacion === OTRO && !form.otroUbicacion.trim()) &&
    !(form.sector === OTRO && !form.otroSector.trim())

  if (!puedeVer) return null

  const overlay = abierto && (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.52)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={() => !form.enviando && cerrar()}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: '16px',
          width: '580px',
          maxWidth: '95vw',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <ModalHeader
          t={t}
          icon="🛟"
          title={headerMeta.title}
          subtitle={headerMeta.subtitle}
          onClose={cerrar}
          disabled={form.enviando}
        />

        <div style={{ padding: '20px 22px 22px', overflowY: 'auto', flex: 1 }}>
          {form.confirmacion === 'gracias-mejora' && (
            <div style={{ textAlign: 'center', padding: '24px 8px 8px' }}>
              <div style={{ fontSize: '3rem', marginBottom: 12 }}>💡</div>
              <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, lineHeight: 1.55 }}>
                La revisaremos con cariño. Gracias por construir ClaraCore con nosotros.
              </div>
            </div>
          )}

          {form.confirmacion === 'gracias-error' && (
            <div style={{ textAlign: 'center', padding: '24px 8px 8px' }}>
              <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, lineHeight: 1.55 }}>
                Recibimos tu reporte. Hay alguien del otro lado listo para actuar.
              </div>
            </div>
          )}

          {form.confirmacion === 'error' && (
            <div
              style={{
                background: '#FEE2E2',
                color: '#DC2626',
                borderRadius: '10px',
                padding: '12px 14px',
                marginBottom: 14,
                fontSize: 'var(--cc-sm)',
                border: '1px solid #FECACA',
              }}
            >
              No se pudo enviar. Verifica tu conexión e inténtalo de nuevo.
            </div>
          )}

          {!form.confirmacion?.startsWith('gracias') && form.paso === 'tipo' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <TipoCard
                t={t}
                icon="🐛"
                title="Reportar un error"
                desc="Algo no funciona como debería"
                accent="#DC2626"
                onClick={() => patch({ paso: 'error', tipo: 'error' })}
              />
              <TipoCard
                t={t}
                icon="💡"
                title="Sugerir una mejora"
                desc="Una idea para mejorar la plataforma"
                accent={t.primary}
                onClick={() => patch({ paso: 'mejora', tipo: 'mejora' })}
              />
            </div>
          )}

          {!form.confirmacion?.startsWith('gracias') && form.paso === 'mejora' && (
            <>
              <div style={{ marginBottom: 16 }}>
                <label style={{ ...labelStyle, color: t.textMuted }}>Tu sugerencia</label>
                <textarea
                  value={form.mejoraTexto}
                  onChange={(e) => patch({ mejoraTexto: e.target.value })}
                  placeholder="Cuéntanos qué te gustaría mejorar o agregar..."
                  rows={6}
                  style={{ ...inputStyle(t), minHeight: '140px', resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <BtnSecundario t={t} onClick={() => patch({ paso: 'tipo', tipo: null, mejoraTexto: '' })}>
                  Volver
                </BtnSecundario>
                <BtnPrimario
                  t={t}
                  onClick={enviarMejora}
                  disabled={form.enviando || !form.mejoraTexto.trim()}
                  busy={form.enviando}
                >
                  {form.enviando ? 'Enviando…' : <>📨 Enviar sugerencia</>}
                </BtnPrimario>
              </div>
            </>
          )}

          {!form.confirmacion?.startsWith('gracias') && form.paso === 'error' && (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '14px 16px',
                  marginBottom: 14,
                }}
              >
                <SelectConOtro
                  t={t}
                  label="Módulo"
                  value={form.modulo}
                  onChange={(v) =>
                    patch({ modulo: v, ubicacion: '', sector: '', otroUbicacion: '', otroSector: '' })
                  }
                  options={modulosVisibles.map((m) => ({ key: m.key, label: m.label }))}
                  otroText={form.otroModulo}
                  onOtroText={(v) => patch({ otroModulo: v })}
                  otroPlaceholder="Describe el módulo..."
                />
                {form.modulo ? (
                  <SelectConOtro
                    t={t}
                    label="Ubicación"
                    value={form.ubicacion}
                    onChange={(v) => patch({ ubicacion: v, sector: '', otroSector: '' })}
                    options={form.modulo === OTRO ? [] : ubicaciones}
                    otroText={form.otroUbicacion}
                    onOtroText={(v) => patch({ otroUbicacion: v })}
                    otroPlaceholder="Describe la ubicación..."
                  />
                ) : (
                  <div aria-hidden />
                )}
              </div>

              {form.ubicacion && (
                <div style={{ marginBottom: 14 }}>
                  <SelectConOtro
                    t={t}
                    label="Sector específico"
                    value={form.sector}
                    onChange={(v) => patch({ sector: v })}
                    options={
                      form.modulo === OTRO || form.ubicacion === OTRO ? [] : sectores
                    }
                    otroText={form.otroSector}
                    onOtroText={(v) => patch({ otroSector: v })}
                    otroPlaceholder="Describe el sector..."
                  />
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <label style={{ ...labelStyle, color: t.textMuted }}>Descripción *</label>
                <div
                  style={{
                    ...inputStyle(t),
                    padding: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <textarea
                    value={form.descripcion}
                    onChange={(e) => patch({ descripcion: e.target.value })}
                    onPaste={handleDescripcionPaste}
                    placeholder="¿Qué pasó? ¿Qué esperabas? Si tienes una captura, pégala aquí con Ctrl+V."
                    rows={4}
                    style={{
                      width: '100%',
                      minHeight: '96px',
                      resize: 'vertical',
                      border: 'none',
                      background: 'transparent',
                      padding: '9px 12px',
                      color: t.text,
                      fontSize: 'var(--cc-sm)',
                      fontFamily: 'inherit',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  {form.imagenPreview && (
                    <div
                      style={{
                        padding: '0 12px 12px',
                        borderTop: `1px solid ${t.border}`,
                      }}
                    >
                      <div style={{ position: 'relative', display: 'inline-block', marginTop: 10 }}>
                        <img
                          src={form.imagenPreview}
                          alt="Captura adjunta"
                          style={{
                            maxWidth: '100%',
                            maxHeight: 140,
                            borderRadius: '8px',
                            display: 'block',
                            boxShadow: t.shadow,
                          }}
                        />
                        <button
                          type="button"
                          aria-label="Eliminar imagen"
                          onClick={() => patch({ imagenNombre: '', imagenPreview: null })}
                          style={{
                            position: 'absolute',
                            top: 6,
                            right: 6,
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: 'rgba(15,23,42,0.75)',
                            color: '#fff',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 'var(--cc-sm)',
                            lineHeight: 1,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ ...labelStyle, color: t.textMuted }}>Urgencia</label>
                <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginBottom: 8 }}>
                  ¿Qué tan pronto lo necesitas?
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {REPORTE_CRITICIDAD.map((c, i) => (
                    <CriticidadEmoji
                      key={c.key}
                      c={c}
                      index={i}
                      total={REPORTE_CRITICIDAD.length}
                      selected={form.criticidad === c.key}
                      onSelect={(key) => patch({ criticidad: key })}
                    />
                  ))}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  justifyContent: 'flex-end',
                  flexWrap: 'wrap',
                  paddingTop: 4,
                  borderTop: `1px solid ${t.border}`,
                }}
              >
                <BtnSecundario t={t} onClick={() => patch({ paso: 'tipo', tipo: null })}>
                  Volver
                </BtnSecundario>
                <BtnPrimario
                  t={t}
                  onClick={enviarError}
                  disabled={form.enviando || !errorFormValid}
                  busy={form.enviando}
                >
                  {form.enviando ? 'Enviando…' : <>📨 Enviar reporte</>}
                </BtnPrimario>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <>
      <button
        type="button"
        title="Reportar error o mejora"
        onClick={abrir}
        style={{
          background: abierto ? `${t.primary}22` : 'transparent',
          border: `1px solid ${abierto ? t.primary : t.border}`,
          borderRadius: '8px',
          padding: '6px 12px',
          cursor: 'pointer',
          color: abierto ? t.primary : t.textMuted,
          fontSize: 'var(--cc-lg)',
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        🛟
      </button>
      {overlay}
    </>
  )
}

export default ReporteErroresBtn
