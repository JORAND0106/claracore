/**
 * Inyecta en dist/sw.js la lista de assets del build para precache en install.
 * Garantiza arranque offline tras un deploy (hashes de Vite incluidos).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function claracoreSwPrecache() {
  return {
    name: 'claracore-sw-precache',
    apply: 'build',
    closeBundle() {
      const dist = path.resolve(__dirname, 'dist')
      const swPath = path.join(dist, 'sw.js')
      if (!fs.existsSync(swPath)) return

      const urls = new Set([
        '/',
        '/index.html',
        '/favicon.png',
        '/manifest.webmanifest',
      ])

      const assetsDir = path.join(dist, 'assets')
      if (fs.existsSync(assetsDir)) {
        for (const name of fs.readdirSync(assetsDir)) {
          if (name.startsWith('.')) continue
          urls.add(`/assets/${name}`)
        }
      }

      // Otros estáticos en la raíz de dist (p. ej. vite.svg)
      for (const name of fs.readdirSync(dist)) {
        const full = path.join(dist, name)
        if (!fs.statSync(full).isFile()) continue
        if (name === 'sw.js' || name === 'index.html') continue
        if (/\.(png|svg|webmanifest|ico|json)$/i.test(name)) {
          urls.add(`/${name}`)
        }
      }

      const listLiteral = JSON.stringify([...urls].sort())
      let sw = fs.readFileSync(swPath, 'utf8')
      if (!sw.includes('self.__CLARACORE_PRECACHE__')) {
        console.warn('[claracore-sw-precache] marcador __CLARACORE_PRECACHE__ no encontrado')
        return
      }
      sw = sw.replace(/self\.__CLARACORE_PRECACHE__/g, listLiteral)
      fs.writeFileSync(swPath, sw)
      console.log(`[claracore-sw-precache] ${urls.size} URLs en SHELL_PRECACHE`)
    },
  }
}
