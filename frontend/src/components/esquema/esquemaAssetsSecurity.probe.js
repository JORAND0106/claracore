/**
 * Probe JS del HMAC de enlaces temporales (espejo de esquema_assets_service).
 * Permite probar aislamiento sin Azure en node:test.
 */
import { createHmac } from 'node:crypto'

const SECRET = process.env.SECRET_KEY || process.env.ESQUEMA_ASSETS_HMAC || 'dev-esquema-assets'

function assertPath(blobPath, contratoId) {
  const path = String(blobPath || '').replace(/^\//, '')
  const prefix = `esquemas/${contratoId}/`
  if (!path.startsWith(prefix) && !path.startsWith(`esquemas/${String(contratoId)}/`)) {
    throw new Error('fuera')
  }
  return path
}

export function mint_temp_token_probe(blobPath, contratoId, ttlSeconds = 300) {
  const path = assertPath(blobPath, contratoId)
  const exp = Math.floor(Date.now() / 1000) + Math.max(60, Math.min(900, ttlSeconds))
  const msg = `${contratoId}|${path}|${exp}`
  const sig = createHmac('sha256', SECRET).update(msg).digest('hex')
  const token = `${exp}.${sig}`
  const verify = (cid) => {
    try {
      const p = assertPath(blobPath, cid)
      const m = `${cid}|${p}|${exp}`
      const expect = createHmac('sha256', SECRET).update(m).digest('hex')
      return expect === sig && exp >= Math.floor(Date.now() / 1000)
    } catch {
      return false
    }
  }
  return {
    ok: verify(contratoId),
    token,
    verify_other_contrato: verify(Number(contratoId) + 1),
  }
}
