/**
 * Hook: capa opcional «Puntos de nivelación» sobre una instancia Mapbox.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchNivelacionPuntosMapa,
  removeTopoNivelacionLayers,
  syncTopoNivelacionLayer,
} from './topoNivelacionMapaLayer'

/**
 * @param {() => import('mapbox-gl').Map | null} getMap
 * @param {string|number|null} contratoId
 * @param {string} token
 * @param {{ readyKey?: any }} [opts] — cambia cuando el mapa ya tiene estilo/capas base
 */
export function useTopoNivelacionMapaCapa(getMap, contratoId, token, opts = {}) {
  const [visible, setVisible] = useState(false)
  const [fc, setFc] = useState({ type: 'FeatureCollection', features: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const visibleRef = useRef(false)
  visibleRef.current = visible
  const fcRef = useRef(fc)
  fcRef.current = fc

  const cargar = useCallback(async () => {
    if (!contratoId) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchNivelacionPuntosMapa(contratoId, token)
      setFc(data)
      const map = typeof getMap === 'function' ? getMap() : null
      if (map && visibleRef.current) syncTopoNivelacionLayer(map, data, true)
    } catch (e) {
      setError(e?.message || 'Error al cargar puntos de nivelación')
      setFc({ type: 'FeatureCollection', features: [] })
    } finally {
      setLoading(false)
    }
  }, [contratoId, token, getMap])

  useEffect(() => {
    if (!visible) {
      const map = typeof getMap === 'function' ? getMap() : null
      removeTopoNivelacionLayers(map)
      return
    }
    void cargar()
  }, [visible, cargar, getMap])

  // Re-sincronizar cuando el mapa se recrea / estilo listo
  useEffect(() => {
    if (!visible) return
    const map = typeof getMap === 'function' ? getMap() : null
    if (map) syncTopoNivelacionLayer(map, fcRef.current, true)
  }, [opts.readyKey, visible, getMap])

  useEffect(() => () => {
    const map = typeof getMap === 'function' ? getMap() : null
    removeTopoNivelacionLayers(map)
  }, [getMap])

  const toggle = useCallback((next) => {
    setVisible((v) => (typeof next === 'boolean' ? next : !v))
  }, [])

  return {
    visible,
    setVisible: toggle,
    loading,
    error,
    count: fc?.features?.length || 0,
    checkboxProps: {
      type: 'checkbox',
      checked: visible,
      onChange: (e) => toggle(e.target.checked),
      disabled: loading || !contratoId,
    },
  }
}
