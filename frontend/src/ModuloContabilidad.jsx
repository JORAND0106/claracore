import { useCallback, useEffect, useState } from 'react'
import { BookOpen, ChevronLeft, Menu } from 'lucide-react'
import { getClaraTypeScaleInline } from './typographyScale'
import { TAB_KEYS, TAB_LABELS, TAB_LABELS_SHORT } from './contabilidad/contabilidadUi'
import { contabGet } from './contabilidad/contabilidadApi'
import { useContabilidadViewport } from './contabilidad/useContabilidadViewport'
import ContabilidadTransacciones from './contabilidad/ContabilidadTransacciones'
import ContabilidadCuentas from './contabilidad/ContabilidadCuentas'
import ContabilidadCierre from './contabilidad/ContabilidadCierre'
import ContabilidadReportes from './contabilidad/ContabilidadReportes'
import ContabilidadDocumentos from './contabilidad/ContabilidadDocumentos'

export default function ModuloContabilidad({
  t,
  token,
  fontSize = 'normal',
  onClose,
  esDeveloper = false,
  esContador = false,
  logoFilter = 'none',
}) {
  const [tab, setTab] = useState('transacciones')
  const [alertasDocs, setAlertasDocs] = useState(0)
  const [navOpen, setNavOpen] = useState(false)
  const fs = getClaraTypeScaleInline(fontSize)
  const vp = useContabilidadViewport()

  const cargarAlertas = useCallback(async () => {
    try {
      const r = await contabGet('/documentos/alertas-vencimiento', token, { dias_alerta: 30 })
      setAlertasDocs(Number(r?.total_alertas) || 0)
    } catch {
      setAlertasDocs(0)
    }
  }, [token])

  useEffect(() => { cargarAlertas() }, [cargarAlertas])

  useEffect(() => {
    if (tab === 'documentos' || tab === 'reportes') cargarAlertas()
  }, [tab, cargarAlertas])

  useEffect(() => {
    if (!vp.isMobile) setNavOpen(false)
  }, [vp.isMobile])

  const selectTab = (key) => {
    setTab(key)
    setNavOpen(false)
  }

  const tabBtn = (key, { vertical = false } = {}) => {
    const active = tab === key
    return (
      <button
        key={key}
        type="button"
        onClick={() => selectTab(key)}
        style={{
          background: active ? t.primary + '22' : 'transparent',
          border: 'none',
          borderBottom: vertical ? 'none' : (active ? `3px solid ${t.primary}` : '3px solid transparent'),
          borderLeft: vertical ? (active ? `3px solid ${t.primary}` : '3px solid transparent') : undefined,
          padding: vertical ? '12px 14px' : (vp.isMobile ? '12px 14px' : '10px 16px'),
          cursor: 'pointer',
          fontWeight: active ? 700 : 500,
          color: active ? t.primary : t.textMuted,
          fontSize: fs.sm,
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: vertical ? '100%' : undefined,
          textAlign: 'left',
          minHeight: vp.isMobile ? 44 : undefined,
          borderRadius: vertical ? 8 : 0,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span>{vp.isMobile ? (TAB_LABELS_SHORT[key] || TAB_LABELS[key]) : TAB_LABELS[key]}</span>
        {key === 'documentos' && alertasDocs > 0 && (
          <span style={{
            background: '#EF4444', color: '#fff', borderRadius: 10,
            padding: '1px 7px', fontSize: '0.75em', fontWeight: 800, lineHeight: 1.4,
          }}>
            {alertasDocs > 99 ? '99+' : alertasDocs}
          </span>
        )}
      </button>
    )
  }

  const content = (
    <>
      {tab === 'transacciones' && (
        <ContabilidadTransacciones t={t} token={token} esDeveloper={esDeveloper} viewport={vp} />
      )}
      {tab === 'cuentas' && <ContabilidadCuentas t={t} token={token} viewport={vp} />}
      {tab === 'cierre' && (
        <ContabilidadCierre t={t} token={token} esContador={esContador} esDeveloper={esDeveloper} viewport={vp} />
      )}
      {tab === 'reportes' && (
        <ContabilidadReportes t={t} token={token} onIrDocumentos={() => selectTab('documentos')} viewport={vp} />
      )}
      {tab === 'documentos' && (
        <ContabilidadDocumentos t={t} token={token} onAlertasChange={cargarAlertas} viewport={vp} />
      )}
    </>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 12000,
      background: t.bg, display: 'flex', flexDirection: 'column',
      fontSize: 'var(--cc-body)',
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: vp.isMobile ? '10px 12px' : '12px 20px',
        borderBottom: `1px solid ${t.border}`,
        background: t.bgCard, flexShrink: 0, gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: vp.isMobile ? 8 : 14, minWidth: 0 }}>
          {vp.isMobile && (
            <button
              type="button"
              onClick={() => setNavOpen((v) => !v)}
              aria-label="Menú de secciones"
              aria-expanded={navOpen}
              style={{
                background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10,
                width: 40, height: 40, display: 'inline-flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', color: t.primary, flexShrink: 0,
              }}
            >
              <Menu size={20} strokeWidth={2.2} />
            </button>
          )}
          <img
            src="/CLARA.CORE.png"
            alt="ClaraCore"
            className="cc-brand-logo cc-brand-logo--header"
            style={{ height: vp.isMobile ? 32 : 40, width: 'auto', flexShrink: 0, filter: logoFilter }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: vp.isMobile ? fs.sm : fs.md,
              fontWeight: 800, color: t.primary, lineHeight: 1.25,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {!vp.isMobile && <BookOpen size={18} strokeWidth={2.2} aria-hidden />}
              {vp.isMobile ? 'Contabilidad' : 'Módulo de Contabilidad'}
            </div>
            {!vp.isMobile && (
              <div style={{ fontSize: fs.sm, color: t.textMuted }}>Gestión financiera · independiente de obra</div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'transparent', border: `1.5px solid ${t.border}`, borderRadius: 10,
            padding: vp.isMobile ? '8px 10px' : '10px 16px',
            color: t.text, fontWeight: 700, cursor: 'pointer', fontSize: fs.sm,
            display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
            minHeight: 40,
          }}
        >
          <ChevronLeft size={18} strokeWidth={2.2} aria-hidden />
          {vp.isMobile ? 'Salir' : 'Volver a ClaraCore'}
        </button>
      </header>

      {/* Tablet / laptop: nav horizontal o lateral */}
      {vp.isTablet && (
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <nav style={{
            width: 200, flexShrink: 0, borderRight: `1px solid ${t.border}`,
            background: t.bgCard, padding: '12px 8px', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            {TAB_KEYS.map((key) => tabBtn(key, { vertical: true }))}
          </nav>
          <main style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
            <div style={{ maxWidth: 1400, margin: '0 auto' }}>{content}</div>
          </main>
        </div>
      )}

      {vp.isDesktop && (
        <>
          <nav style={{
            display: 'flex', gap: 4, padding: '10px 20px', borderBottom: `1px solid ${t.border}`,
            background: t.bgCard, flexShrink: 0, overflowX: 'auto',
          }}>
            {TAB_KEYS.map((key) => tabBtn(key))}
          </nav>
          <main style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
            <div style={{ maxWidth: 1400, margin: '0 auto' }}>{content}</div>
          </main>
        </>
      )}

      {vp.isMobile && (
        <>
          {navOpen && (
            <div
              role="presentation"
              onClick={() => setNavOpen(false)}
              style={{ position: 'fixed', inset: 0, top: 53, zIndex: 12010, background: 'rgba(0,0,0,0.35)' }}
            />
          )}
          {navOpen && (
            <nav style={{
              position: 'fixed', top: 53, left: 0, bottom: 0, width: 'min(280px, 82vw)',
              zIndex: 12020, background: t.bgCard, borderRight: `1px solid ${t.border}`,
              padding: '12px 8px', overflowY: 'auto',
              display: 'flex', flexDirection: 'column', gap: 2,
              boxShadow: '4px 0 24px rgba(0,0,0,0.18)',
            }}>
              {TAB_KEYS.map((key) => tabBtn(key, { vertical: true }))}
            </nav>
          )}
          <nav style={{
            display: 'flex', gap: 2, padding: '6px 8px', borderBottom: `1px solid ${t.border}`,
            background: t.bgCard, flexShrink: 0, overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}>
            {TAB_KEYS.map((key) => tabBtn(key))}
          </nav>
          <main style={{ flex: 1, overflow: 'auto', padding: '12px 12px 28px', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ maxWidth: 1400, margin: '0 auto' }}>{content}</div>
          </main>
        </>
      )}
    </div>
  )
}
