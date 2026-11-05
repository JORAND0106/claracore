import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarRange, LayoutGrid, List, Plus,
} from 'lucide-react'
import {
  avatarColorFromName,
  inicialesUsuario,
  usuariosFichaTheme,
} from '../../components/ccFichaModalTheme'
import { useSeguimientoCompact } from './seguimientoShared'
import {
  EQUIPO_INDICADORES,
  agruparPorDepartamento,
  construirTarjetasEquipo,
  filtrarTarjetas,
  resolverPeriodo,
  sumarIndicadores,
  tooltipCarga,
} from './planActividadesEquipo'

function useAnimatedInt(value, duration = 420) {
  const [n, setN] = useState(0)
  const fromRef = useRef(0)
  useEffect(() => {
    const from = fromRef.current
    const to = Number(value) || 0
    if (from === to) {
      setN(to)
      return undefined
    }
    let raf = 0
    const t0 = performance.now()
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / duration)
      const eased = 1 - (1 - p) ** 3
      const cur = Math.round(from + (to - from) * eased)
      setN(cur)
      if (p < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = to
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return n
}

function AnimatedStat({ value, color }) {
  const n = useAnimatedInt(value)
  return (
    <span style={{
      fontSize: 'clamp(1.6rem, 3.2vw, 2.1rem)',
      fontWeight: 800,
      letterSpacing: '-0.03em',
      color,
      fontVariantNumeric: 'tabular-nums',
      lineHeight: 1.05,
    }}
    >
      {n}
    </span>
  )
}

function Avatar({ u, nombre, ficha, size = 44 }) {
  const nombreParts = String(nombre || '').trim().split(/\s+/)
  const nom = u?.nombre || nombreParts[0] || ''
  const ape = u?.apellidos || nombreParts.slice(1).join(' ') || ''
  const initials = inicialesUsuario(nom, ape)
  const bg = avatarColorFromName(nom, ape, ficha.avatarColors)
  const foto = u?.foto_perfil_url || u?.foto_url || u?.avatar_url || ''
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: Math.round(size * 0.3),
        overflow: 'hidden',
        background: foto
          ? ficha.inputBg
          : `linear-gradient(145deg, ${bg}, ${ficha.primaryLight || ficha.primary})`,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        fontSize: Math.max(11, Math.round(size * 0.32)),
        border: `1.5px solid ${ficha.border}`,
        flexShrink: 0,
      }}
    >
      {foto ? (
        <img src={foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : initials}
    </span>
  )
}

function iconBtn(t, active = false) {
  return {
    width: 34,
    height: 34,
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    cursor: 'pointer',
    border: `1px solid ${active ? t.primary : t.border}`,
    background: active ? `${t.primary}22` : 'transparent',
    color: t.text,
    transition: 'background 160ms ease, border-color 160ms ease',
  }
}

/**
 * Tablero de monitoreo del equipo (vista amplia).
 * Conserva período / filtro / scroll vía props controladas desde el padre.
 */
function resolveThemeMode(t) {
  if (typeof document !== 'undefined') {
    const ds = document.documentElement?.dataset?.ccTheme
    if (ds === 'dark' || ds === 'rest' || ds === 'light') return ds
  }
  if (t?.mode === 'dark' || t?.mode === 'rest' || t?.mode === 'light') return t.mode
  if (t?.isDark === true) return 'dark'
  return 'light'
}

export default function PlanActividadesEquipoVista({
  t,
  items = [],
  usuarios = [],
  loading = false,
  periodoState,
  onPeriodoChange,
  filtroIndicador = null,
  onFiltroChange,
  agrupar = true,
  onAgruparChange,
  scrollRef,
  onOpenColaborador,
  onCrear,
  puedeCrear = false,
}) {
  const compact = useSeguimientoCompact()
  const themeKey = resolveThemeMode(t)
  const ficha = useMemo(() => usuariosFichaTheme(themeKey, t), [themeKey, t])
  const periodo = useMemo(
    () => resolverPeriodo(periodoState || { modo: 'semana' }),
    [periodoState],
  )

  const cards = useMemo(
    () => construirTarjetasEquipo({ actividades: items, usuarios, periodo }),
    [items, usuarios, periodo],
  )
  const visibles = useMemo(
    () => filtrarTarjetas(cards, filtroIndicador),
    [cards, filtroIndicador],
  )
  const totals = useMemo(() => sumarIndicadores(cards), [cards])
  const groups = useMemo(
    () => (agrupar ? agruparPorDepartamento(visibles) : [['', visibles]]),
    [agrupar, visibles],
  )

  const inputStyle = {
    padding: '7px 10px',
    borderRadius: 8,
    border: `1px solid ${t.border}`,
    background: t.inputBg || t.bg || '#fff',
    color: t.text,
    fontSize: 'var(--cc-sm)',
    fontFamily: 'inherit',
    fontWeight: 600,
  }

  return (
    <div
      ref={scrollRef}
      className="cc-plan-equipo"
      style={{
        display: 'grid',
        gap: compact ? 12 : 16,
        maxHeight: '78vh',
        overflow: 'auto',
        paddingBottom: 8,
      }}
    >
      {/* Período + controles */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
      >
        <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {[
            { id: 'semana', label: 'Semana' },
            { id: 'mes', label: 'Mes' },
            { id: 'rango', label: 'Rango' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              title={opt.label}
              data-cc-tooltip={opt.label}
              data-cc-tooltip-variant="short"
              aria-pressed={periodoState?.modo === opt.id}
              onClick={() => onPeriodoChange?.({
                ...(periodoState || {}),
                modo: opt.id,
              })}
              style={{
                ...iconBtn(t, periodoState?.modo === opt.id),
                width: 'auto',
                padding: '0 12px',
                height: 34,
                fontSize: 'var(--cc-sm)',
                fontWeight: 700,
                gap: 6,
              }}
            >
              {opt.id === 'rango' ? <CalendarRange size={14} strokeWidth={2.2} aria-hidden /> : null}
              {opt.label}
            </button>
          ))}
          {periodoState?.modo === 'rango' && (
            <>
              <input
                type="date"
                value={periodoState?.desde || periodo.desde}
                onChange={(e) => onPeriodoChange?.({
                  ...periodoState,
                  modo: 'rango',
                  desde: e.target.value,
                  hasta: periodoState?.hasta || periodo.hasta,
                })}
                title="Desde"
                data-cc-tooltip="Desde"
                data-cc-tooltip-variant="short"
                aria-label="Desde"
                style={inputStyle}
              />
              <input
                type="date"
                value={periodoState?.hasta || periodo.hasta}
                onChange={(e) => onPeriodoChange?.({
                  ...periodoState,
                  modo: 'rango',
                  desde: periodoState?.desde || periodo.desde,
                  hasta: e.target.value,
                })}
                title="Hasta"
                data-cc-tooltip="Hasta"
                data-cc-tooltip-variant="short"
                aria-label="Hasta"
                style={inputStyle}
              />
            </>
          )}
          <span
            title={`${periodo.desde} → ${periodo.hasta}`}
            data-cc-tooltip={`${periodo.desde} → ${periodo.hasta}`}
            data-cc-tooltip-variant="short"
            style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, fontWeight: 600 }}
          >
            {periodo.desde.slice(8)}/{periodo.desde.slice(5, 7)}
            {' – '}
            {periodo.hasta.slice(8)}/{periodo.hasta.slice(5, 7)}
          </span>
        </div>

        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <button
            type="button"
            title={agrupar ? 'Listado' : 'Por área'}
            data-cc-tooltip={agrupar ? 'Listado' : 'Por área'}
            data-cc-tooltip-variant="short"
            aria-label={agrupar ? 'Vista listado' : 'Vista por departamento'}
            onClick={() => onAgruparChange?.(!agrupar)}
            style={iconBtn(t, !agrupar)}
          >
            {agrupar
              ? <List size={16} strokeWidth={2.3} aria-hidden />
              : <LayoutGrid size={16} strokeWidth={2.3} aria-hidden />}
          </button>
          {puedeCrear && (
            <button
              type="button"
              title="Crear actividad"
              data-cc-tooltip="Crear actividad"
              data-cc-tooltip-variant="short"
              aria-label="Crear actividad"
              onClick={() => onCrear?.()}
              style={iconBtn(t)}
            >
              <Plus size={18} strokeWidth={2.4} aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* Indicadores */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: compact ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))',
        gap: compact ? 8 : 12,
      }}
      >
        {EQUIPO_INDICADORES.map((ind) => {
          const active = filtroIndicador === ind.key
          const count = totals[ind.key] || 0
          return (
            <button
              key={ind.key}
              type="button"
              title={ind.tip}
              data-cc-tooltip={ind.tip}
              data-cc-tooltip-variant="short"
              aria-pressed={active}
              onClick={() => onFiltroChange?.(active ? null : ind.key)}
              style={{
                textAlign: 'left',
                border: `1px solid ${active ? ind.color : t.border}`,
                background: active
                  ? `color-mix(in srgb, ${ind.color} 14%, ${t.bgCard || t.bg || '#fff'})`
                  : (t.bgCard || t.bg || '#fff'),
                borderRadius: 14,
                padding: compact ? '12px 12px 10px' : '16px 16px 12px',
                cursor: 'pointer',
                boxShadow: active ? `0 8px 24px ${ind.color}22` : 'none',
                transition: 'transform 180ms ease, box-shadow 180ms ease, background 180ms ease, border-color 180ms ease',
                transform: active ? 'translateY(-1px)' : 'none',
                fontFamily: 'inherit',
              }}
            >
              <div style={{
                fontSize: 'var(--cc-xs)',
                fontWeight: 700,
                color: t.textMuted,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
              >
                {ind.label}
              </div>
              <AnimatedStat value={loading ? 0 : count} color={ind.color} />
              <div style={{
                marginTop: 10,
                height: 3,
                borderRadius: 99,
                background: `color-mix(in srgb, ${ind.color} 22%, transparent)`,
                overflow: 'hidden',
              }}
              >
                <div style={{
                  width: active ? '100%' : '42%',
                  height: '100%',
                  background: ind.color,
                  transition: 'width 280ms ease',
                  borderRadius: 99,
                }}
                />
              </div>
            </button>
          )
        })}
      </div>

      {/* Tarjetas */}
      {loading && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 10,
        }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                height: 118,
                borderRadius: 14,
                border: `1px solid ${t.border}`,
                background: `linear-gradient(90deg, ${t.bg || '#f8fafc'} 25%, ${t.bgCard || '#fff'} 50%, ${t.bg || '#f8fafc'} 75%)`,
                backgroundSize: '200% 100%',
                animation: 'cc-plan-equipo-shimmer 1.2s ease infinite',
                opacity: 0.7,
              }}
            />
          ))}
        </div>
      )}

      {!loading && !visibles.length && (
        <div style={{
          color: t.textMuted,
          fontSize: 'var(--cc-sm)',
          fontWeight: 600,
          padding: '18px 4px',
        }}
        >
          Sin colaboradores en este período.
        </div>
      )}

      {!loading && groups.map(([dep, list]) => (
        <div key={dep || 'flat'} style={{ display: 'grid', gap: 10 }}>
          {agrupar && dep ? (
            <div style={{
              fontSize: 'var(--cc-xs)',
              fontWeight: 800,
              color: t.textMuted,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              padding: '4px 2px 0',
            }}
            >
              {dep}
            </div>
          ) : null}
          <div style={{
            display: 'grid',
            gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 10,
          }}
          >
            {list.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => onOpenColaborador?.(card.id)}
                title="Abrir plan"
                data-cc-tooltip="Abrir plan"
                data-cc-tooltip-variant="short"
                style={{
                  textAlign: 'left',
                  border: `1px solid ${t.border}`,
                  background: t.bgCard || t.bg || '#fff',
                  borderRadius: 14,
                  padding: 14,
                  cursor: 'pointer',
                  display: 'grid',
                  gap: 10,
                  fontFamily: 'inherit',
                  color: t.text,
                  transition: 'transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease',
                  boxShadow: '0 1px 0 color-mix(in srgb, transparent 100%, #000)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.borderColor = t.primary
                  e.currentTarget.style.boxShadow = `0 12px 28px ${t.primary}18`
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none'
                  e.currentTarget.style.borderColor = t.border
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                  <Avatar u={card.usuario} nombre={card.nombre} ficha={ficha} size={44} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontWeight: 800,
                      fontSize: 'var(--cc-body)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={card.nombre}
                    data-cc-tooltip={card.nombre}
                    data-cc-tooltip-variant="short"
                    >
                      {card.nombre}
                    </div>
                    <div style={{
                      fontSize: 'var(--cc-xs)',
                      color: t.textMuted,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={[card.cargo, card.departamento].filter(Boolean).join(' · ')}
                    data-cc-tooltip={[card.cargo, card.departamento].filter(Boolean).join(' · ') || 'Sin cargo'}
                    data-cc-tooltip-variant="short"
                    >
                      {[card.cargo, !agrupar ? card.departamento : null].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {EQUIPO_INDICADORES.map((ind) => {
                    const n = card.counts[ind.key] || 0
                    return (
                      <span
                        key={ind.key}
                        title={`${ind.label}: ${n}`}
                        data-cc-tooltip={`${ind.label}: ${n}`}
                        data-cc-tooltip-variant="short"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '3px 8px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 800,
                          color: n ? ind.color : t.textMuted,
                          background: n
                            ? `color-mix(in srgb, ${ind.color} 14%, transparent)`
                            : `color-mix(in srgb, ${t.border} 40%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${n ? ind.color : t.border} 35%, transparent)`,
                          opacity: n ? 1 : 0.55,
                        }}
                      >
                        <span style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: n ? ind.color : t.textMuted,
                        }}
                        />
                        {n}
                      </span>
                    )
                  })}
                </div>

                <div
                  title={tooltipCarga(card.carga)}
                  data-cc-tooltip={tooltipCarga(card.carga)}
                  data-cc-tooltip-variant="short"
                  style={{ display: 'grid', gap: 4 }}
                >
                  <div style={{
                    height: 7,
                    borderRadius: 99,
                    background: `color-mix(in srgb, ${t.border} 70%, transparent)`,
                    overflow: 'hidden',
                  }}
                  >
                    <div style={{
                      width: `${card.carga?.loadPct || 0}%`,
                      height: '100%',
                      borderRadius: 99,
                      background: card.carga?.tieneSolape
                        ? 'linear-gradient(90deg, #F97316, #DC2626)'
                        : `linear-gradient(90deg, ${t.primary}, ${ficha.primaryLight || t.primary})`,
                      transition: 'width 320ms ease',
                    }}
                    />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}

      <style>{`
        @keyframes cc-plan-equipo-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  )
}
