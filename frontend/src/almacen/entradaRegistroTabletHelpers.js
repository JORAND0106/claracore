/** Helpers del registro tablet de Entradas (sin bloqueos / por revisar). */

export const PASO = {
  INICIO: 'inicio',
  OC: 'oc',
  SIN_OC: 'sin_oc',
  CANTIDAD: 'cantidad',
  PLACA: 'placa',
  FOTO: 'foto',
  CONFIRMAR: 'confirmar',
  // Disposición
  SECTOR: 'sector',
  ESCOMBRERA: 'escombrera',
}

export function motivosPorRevisarPreview(draft) {
  const m = []
  if (!draft?.orden_compra_id) m.push('Sin orden de compra')
  if (draft?.supera_saldo) m.push('Supera saldo OC')
  if (draft?.proveedor_manual) m.push('Proveedor a mano')
  if (!draft?.foto) m.push('Sin foto')
  if (draft?.vehiculo_nuevo) m.push('Vehículo nuevo')
  return m
}

export function formatPlacaInput(raw) {
  const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const letters = s.replace(/[^A-Z]/g, '').slice(0, 3)
  const nums = s.slice(letters.length).replace(/[^0-9]/g, '').slice(0, 3)
  if (!letters && !nums) return ''
  if (nums) return `${letters}-${nums}`
  return letters
}

export function placaValida(placa) {
  return /^[A-Z]{3}-\d{3}$/.test(String(placa || ''))
}
