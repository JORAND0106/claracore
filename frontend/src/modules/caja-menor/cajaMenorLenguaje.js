import lexico from './lexico-es.txt?raw'
import { crearLenguaje } from './cajaMenorTexto'

const lenguaje = crearLenguaje(lexico)

export function formatearDescripcion(texto) {
  return lenguaje.formatear(texto)
}

export function revisarDescripcion(texto) {
  return lenguaje.revisar(texto)
}
