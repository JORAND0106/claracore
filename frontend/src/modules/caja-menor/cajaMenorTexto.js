const SEPARADORES = new Set(['·', '•', '|', ';', '\n'])
const MEDIDA = /^(?:\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)?["″']?|\d+(?:[.,]\d+)?(?:mm|cm|mt|mts|m|kg|g|ml|l|und|un|pulg|pg))$/i
const BORDE = /^([,.:()[\]¿¡]*)(.*?)([,.:()[\]?!]*)$/s

const EXTRAS = {
  pavco: 'PAVCO',
  pvc: 'PVC',
  cemex: 'CEMEX',
  gerfor: 'Gerfor',
  pintuco: 'Pintuco',
  eternit: 'Eternit',
  sika: 'Sika',
  toxement: 'Toxement',
  homecenter: 'Homecenter',
  bogota: 'Bogotá',
  medellin: 'Medellín',
  cali: 'Cali',
  barranquilla: 'Barranquilla',
  cartagena: 'Cartagena',
  bucaramanga: 'Bucaramanga',
  pereira: 'Pereira',
  manizales: 'Manizales',
  cucuta: 'Cúcuta',
  ibague: 'Ibagué',
  villavicencio: 'Villavicencio',
  pasto: 'Pasto',
  monteria: 'Montería',
  neiva: 'Neiva',
  armenia: 'Armenia',
  popayan: 'Popayán',
  sincelejo: 'Sincelejo',
  valledupar: 'Valledupar',
  tunja: 'Tunja',
  soacha: 'Soacha',
  envigado: 'Envigado',
  itagui: 'Itagüí',
}

export function fold(texto) {
  return String(texto || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

function capitalizar(palabra) {
  if (!palabra) return palabra
  return palabra[0].toLocaleUpperCase('es') + palabra.slice(1)
}

function esSigla(token) {
  const letras = [...token].filter((c) => /\p{L}/u.test(c))
  return letras.length >= 2 && letras.every((c) => c === c.toLocaleUpperCase('es')) && ![...token].some((c) => c !== c.toLocaleUpperCase('es') && /\p{L}/u.test(c))
}

function esTitulo(token) {
  if (token.length < 2) return false
  const [primera, ...resto] = [...token]
  return primera === primera.toLocaleUpperCase('es') && resto.some((c) => /\p{L}/u.test(c))
    && resto.every((c) => !/\p{L}/u.test(c) || c === c.toLocaleLowerCase('es'))
}

function distancia(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2
  const filas = Array.from({ length: a.length + 1 }, (_, i) => i)
  for (let j = 1; j <= b.length; j += 1) {
    let previo = filas[0]
    filas[0] = j
    for (let i = 1; i <= a.length; i += 1) {
      const actual = filas[i]
      const costo = a[i - 1] === b[j - 1] ? 0 : 1
      filas[i] = Math.min(filas[i] + 1, filas[i - 1] + 1, previo + costo)
      previo = actual
    }
  }
  return filas[a.length]
}

export function crearLenguaje(lexico) {
  const preferido = new Map()
  String(lexico || '').split('\n').forEach((linea) => {
    const palabra = linea.trim()
    if (!palabra) return
    const clave = fold(palabra)
    if (!preferido.has(clave)) preferido.set(clave, palabra)
  })
  Object.entries(EXTRAS).forEach(([clave, forma]) => preferido.set(clave, forma))

  const cubetas = new Map()
  preferido.forEach((forma) => {
    const clave = fold(forma)
    const balde = `${clave[0] || ''}:${forma.length}`
    const lista = cubetas.get(balde)
    if (lista) lista.push(forma)
    else cubetas.set(balde, [forma])
  })

  function formaDe(token) {
    if (MEDIDA.test(token) || /\d/.test(token)) return [token, 'medida']
    if (/^[xX]$/.test(token)) return ['x', 'comun']
    const pref = preferido.get(fold(token))
    if (pref) {
      const propio = pref[0] === pref[0].toLocaleUpperCase('es') && pref.slice(1) === pref.slice(1).toLocaleLowerCase('es')
      return [pref, propio ? 'propio' : 'comun']
    }
    if (esSigla(token)) return [token, 'sigla']
    return [token.toLocaleLowerCase('es'), 'comun']
  }

  function sugerencias(token) {
    const clave = fold(token)
    const directa = preferido.get(clave)
    const lista = []
    if (directa && directa.toLocaleLowerCase('es') !== token.toLocaleLowerCase('es')) lista.push(directa)
    const vistos = new Set(lista.map((item) => item.toLocaleLowerCase('es')))
    for (const delta of [0, -1, 1]) {
      const balde = cubetas.get(`${clave[0] || ''}:${clave.length + delta}`) || []
      for (const candidato of balde) {
        const plano = fold(candidato)
        if (vistos.has(candidato.toLocaleLowerCase('es'))) continue
        if (distancia(clave, plano) <= 1) {
          lista.push(candidato)
          vistos.add(candidato.toLocaleLowerCase('es'))
          if (lista.length >= 4) return lista
        }
      }
    }
    return lista.slice(0, 4)
  }

  function formatear(texto) {
    const crudo = String(texto || '').trim()
    if (!crudo) return ''
    const partes = crudo.split(/([·•|;\n])/g)
    return partes.map((parte) => {
      if (SEPARADORES.has(parte) || parte === '') return parte
      let inicio = true
      return parte.split(/(\s+)/g).map((trozo) => {
        if (!trozo || /^\s+$/.test(trozo)) return trozo
        const borde = trozo.match(BORDE)
        const izq = borde ? borde[1] : ''
        const nucleo = borde ? borde[2] : trozo
        const der = borde ? borde[3] : ''
        if (!nucleo) return trozo
        let [forma, tipo] = formaDe(nucleo)
        if (inicio && tipo === 'comun') forma = capitalizar(forma)
        if ([...nucleo].some((c) => /\p{L}/u.test(c))) inicio = false
        return `${izq}${forma}${der}`
      }).join('')
    }).join('').slice(0, 500)
  }

  function revisar(texto) {
    const valor = String(texto || '')
    const marcas = []
    const re = /[^\s·•|;]+/g
    let encontrado
    while ((encontrado = re.exec(valor))) {
      const crudo = encontrado[0]
      const borde = crudo.match(BORDE)
      const nucleo = borde && borde[2] ? borde[2] : crudo
      const desfase = borde ? borde[1].length : 0
      if (!nucleo || MEDIDA.test(nucleo) || /\d/.test(nucleo)) continue
      const pref = preferido.get(fold(nucleo))
      if (pref && nucleo.toLocaleLowerCase('es') === pref.toLocaleLowerCase('es')) continue
      if (!pref && (esSigla(nucleo) || esTitulo(nucleo) || /^[xX]$/.test(nucleo))) {
        const cerca = esSigla(nucleo) ? sugerencias(nucleo) : []
        if (!cerca.length) continue
      }
      const opciones = sugerencias(nucleo).filter((item) => item.toLocaleLowerCase('es') !== nucleo.toLocaleLowerCase('es'))
      if (!pref && (esSigla(nucleo) || esTitulo(nucleo)) && !opciones.length) continue
      if (!pref && (esSigla(nucleo) || esTitulo(nucleo)) && opciones.length && distancia(fold(nucleo), fold(opciones[0])) > 1) continue
      marcas.push({
        inicio: encontrado.index + desfase,
        fin: encontrado.index + desfase + nucleo.length,
        palabra: nucleo,
        sugerencias: opciones,
      })
    }
    return marcas
  }

  return { formatear, revisar }
}
