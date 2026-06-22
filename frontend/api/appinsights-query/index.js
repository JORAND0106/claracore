function parseConnectionString(cs) {
  const out = {}
  if (!cs) return out
  for (const part of String(cs).split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim()
  }
  return out
}

module.exports = async function (context, req) {
  const panelKey = req.headers['x-dev-panel-key'] || req.headers['X-Dev-Panel-Key']
  const expected = process.env.DEVELOPER_PANEL_KEY || ''
  if (!expected || panelKey !== expected) {
    context.res = { status: 403, body: { error: 'Forbidden' } }
    return
  }

  const parsed = parseConnectionString(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING || '')
  const appId = process.env.APPINSIGHTS_APP_ID || parsed.ApplicationId || ''
  const apiKey = process.env.APPINSIGHTS_API_KEY || ''
  const query = req.body && req.body.query

  if (!appId || !apiKey || !query) {
    context.res = { status: 400, body: { error: 'Missing APPINSIGHTS config or query body' } }
    return
  }

  try {
    const url = `https://api.applicationinsights.io/v1/apps/${encodeURIComponent(appId)}/query`
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ query }),
    })
    const text = await upstream.text()
    context.res = {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
      body: text,
    }
  } catch (err) {
    context.res = {
      status: 502,
      body: { error: String(err && err.message ? err.message : err) },
    }
  }
}
