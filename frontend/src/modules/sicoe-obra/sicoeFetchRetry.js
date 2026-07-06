/** fetch con reintentos breves (red móvil / servidor ocupado tras varios guardados seguidos). */
export async function sicoeFetchWithRetry(url, options = {}, retries = 2) {
  let lastErr = null
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetch(url, options)
    } catch (err) {
      lastErr = err
      if (i < retries) {
        await new Promise((r) => setTimeout(r, 600 * (i + 1)))
      }
    }
  }
  throw lastErr || new Error('Failed to fetch')
}
