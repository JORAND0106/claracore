/**
 * Vistas de basemap Mapbox para el mapa de localización (reporte de cantidades SicoeObra).
 *
 * - topografico: outdoors (curvas / plano topográfico plano)
 * - relieve: outdoors + DEM 3D (elevación del terreno)
 * - satelite: imagen satelital + calles
 *
 * Cambiar de vista no altera coordenadas ni el marcador; solo el estilo/terreno.
 */

export const SICOE_MAPA_VISTAS = Object.freeze(['topografico', 'relieve', 'satelite'])

export const SICOE_MAPA_VISTA_DEFAULT = 'topografico'

export const SICOE_MAPA_STYLE_OUTDOORS = 'mapbox://styles/mapbox/outdoors-v12'
export const SICOE_MAPA_STYLE_SATELLITE = 'mapbox://styles/mapbox/satellite-streets-v12'

const STORAGE_KEY = 'sicoe.mapaPortada.basemapVista'

/**
 * @param {unknown} raw
 * @returns {'topografico'|'relieve'|'satelite'}
 */
export function normalizarVistaBasemap(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (s === 'relieve' || s === 'terrain' || s === 'elevation') return 'relieve'
  if (s === 'satelite' || s === 'satellite' || s === 'sat') return 'satelite'
  if (s === 'topografico' || s === 'topo' || s === 'plano') return 'topografico'
  // alias español completo
  if (s.includes('topograf')) return 'topografico'
  if (s.includes('satel')) return 'satelite'
  if (s.includes('relieve')) return 'relieve'
  return SICOE_MAPA_VISTA_DEFAULT
}

/**
 * @param {'topografico'|'relieve'|'satelite'} mode
 * @returns {string} Mapbox style URL
 */
export function sicoeBasemapStyleUrl(mode) {
  const m = normalizarVistaBasemap(mode)
  if (m === 'satelite') return SICOE_MAPA_STYLE_SATELLITE
  // relieve y topográfico comparten outdoors; el relieve añade DEM.
  return SICOE_MAPA_STYLE_OUTDOORS
}

/**
 * @param {'topografico'|'relieve'|'satelite'} mode
 * @returns {string}
 */
export function sicoeBasemapLabel(mode) {
  const m = normalizarVistaBasemap(mode)
  if (m === 'relieve') return 'Relieve'
  if (m === 'satelite') return 'Satélite'
  return 'Topográfico'
}

/**
 * @returns {'topografico'|'relieve'|'satelite'}
 */
export function leerVistaBasemapGuardada() {
  try {
    if (typeof localStorage === 'undefined') return SICOE_MAPA_VISTA_DEFAULT
    return normalizarVistaBasemap(localStorage.getItem(STORAGE_KEY))
  } catch {
    return SICOE_MAPA_VISTA_DEFAULT
  }
}

/**
 * @param {unknown} mode
 */
export function guardarVistaBasemap(mode) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, normalizarVistaBasemap(mode))
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * @param {import('mapbox-gl').Map} map
 */
export function ensureSicoeMapTerrain(map) {
  if (!map) return
  try {
    if (!map.getSource('mapbox-dem')) {
      map.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14,
      })
    }
    map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.4 })
  } catch {
    /* WebGL / estilo no listo */
  }
}

/**
 * @param {import('mapbox-gl').Map} map
 */
export function clearSicoeMapTerrain(map) {
  if (!map) return
  try {
    map.setTerrain(null)
  } catch {
    /* ignore */
  }
  try {
    if (map.getSource('mapbox-dem')) map.removeSource('mapbox-dem')
  } catch {
    /* ignore */
  }
}

/**
 * Aplica terreno 3D solo en relieve (y opcionalmente satélite con relieve suave).
 * @param {import('mapbox-gl').Map} map
 * @param {unknown} mode
 */
export function applySicoeBasemapTerrain(map, mode) {
  const m = normalizarVistaBasemap(mode)
  if (m === 'relieve') {
    ensureSicoeMapTerrain(map)
    try {
      if (typeof map.getPitch === 'function' && map.getPitch() < 40) {
        map.easeTo({ pitch: 50, duration: 400 })
      }
    } catch {
      /* ignore */
    }
    return
  }
  clearSicoeMapTerrain(map)
  try {
    if (typeof map.getPitch === 'function' && map.getPitch() > 0) {
      map.easeTo({ pitch: 0, duration: 300 })
    }
  } catch {
    /* ignore */
  }
}

/**
 * Control Mapbox: selector Relieve / Satélite / Topográfico.
 * @param {{ getMode: () => string, t?: Record<string, string>, onSelect: (mode: string) => void }} opts
 */
export function createSicoeBasemapStyleControl({ getMode, t = {}, onSelect }) {
  let container
  let menu
  let mainBtn

  const closeMenu = () => {
    if (menu) menu.style.display = 'none'
  }

  const mkOpt = (value, label) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    const styleBase = [
      'display:block',
      'width:100%',
      'text-align:left',
      'padding:8px 12px',
      'font-size:12px',
      'font-weight:600',
      'border:none',
      'background:transparent',
      'color:' + (t.text || '#111'),
      'cursor:pointer',
    ].join(';')
    b.style.cssText = styleBase
    const applySel = () => {
      const cur = normalizarVistaBasemap(getMode())
      if (value === cur) {
        b.style.background = (t.primary || '#2563eb') + '22'
        b.style.color = t.primary || '#2563eb'
      } else {
        b.style.background = 'transparent'
        b.style.color = t.text || '#111'
      }
    }
    applySel()
    b.onmouseenter = () => {
      if (value !== normalizarVistaBasemap(getMode())) b.style.background = t.bg || '#f3f4f6'
    }
    b.onmouseleave = () => applySel()
    b.onclick = (ev) => {
      ev.stopPropagation()
      onSelect(value)
      closeMenu()
      if (mainBtn) mainBtn.textContent = sicoeBasemapLabel(value)
    }
    return b
  }

  const rebuildMenu = () => {
    if (!menu) return
    menu.innerHTML = ''
    menu.appendChild(mkOpt('relieve', 'Relieve'))
    menu.appendChild(mkOpt('satelite', 'Satélite'))
    menu.appendChild(mkOpt('topografico', 'Plano topográfico'))
  }

  return {
    onAdd() {
      container = document.createElement('div')
      container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group'
      container.style.position = 'relative'

      mainBtn = document.createElement('button')
      mainBtn.type = 'button'
      mainBtn.setAttribute('data-sicoe-basemap-btn', '1')
      mainBtn.textContent = sicoeBasemapLabel(getMode())
      mainBtn.title = 'Vista del mapa (relieve / satélite / topográfico)'
      mainBtn.setAttribute('aria-label', 'Cambiar vista del mapa')
      mainBtn.style.cssText = [
        'font-size:11px',
        'font-weight:700',
        'padding:6px 10px',
        'min-width:88px',
        'cursor:pointer',
        'color:#fff',
        'background:' + (t.primary || '#0077B6'),
        'border:none',
        'border-radius:4px',
      ].join(';')
      mainBtn.onmousedown = (e) => e.preventDefault()
      mainBtn.onclick = (e) => {
        e.stopPropagation()
        if (!menu) return
        const open = menu.style.display === 'block'
        menu.style.display = open ? 'none' : 'block'
        if (!open) rebuildMenu()
      }

      menu = document.createElement('div')
      menu.style.cssText = [
        'display:none',
        'position:absolute',
        'top:100%',
        'right:0',
        'margin-top:4px',
        'min-width:160px',
        'background:' + (t.bgCard || '#fff'),
        'border:1px solid ' + (t.border || '#e5e7eb'),
        'border-radius:8px',
        'box-shadow:0 8px 20px rgba(0,0,0,0.18)',
        'overflow:hidden',
        'z-index:5',
      ].join(';')
      rebuildMenu()

      container.appendChild(mainBtn)
      container.appendChild(menu)

      const onDoc = (ev) => {
        if (!container.contains(ev.target)) closeMenu()
      }
      setTimeout(() => document.addEventListener('click', onDoc), 0)
      container._sicoeBasemapDocClose = onDoc
      return container
    },
    onRemove() {
      try {
        if (container?._sicoeBasemapDocClose) {
          document.removeEventListener('click', container._sicoeBasemapDocClose)
        }
      } catch {
        /* ignore */
      }
      try {
        container?.parentNode?.removeChild(container)
      } catch {
        /* ignore */
      }
      container = null
      menu = null
      mainBtn = null
    },
  }
}
