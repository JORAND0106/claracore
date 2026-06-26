import {
  APPINSIGHTS_API_KEY,
  APPINSIGHTS_APP_ID,
  APPINSIGHTS_QUERY_BASE,
  DEV_PANEL_KEY,
} from './devPanelConfig'

function rows(table) {
  const cols = table?.columns?.map(c => c.name) || []
  return (table?.rows || []).map(r => {
    const o = {}
    cols.forEach((name, idx) => {
      o[name] = r[idx]
    })
    return o
  })
}

export async function runKql(query) {
  if (import.meta.env.DEV && (!APPINSIGHTS_APP_ID || !APPINSIGHTS_API_KEY)) {
    throw new Error('Faltan VITE_APPINSIGHTS_APP_ID / VITE_APPINSIGHTS_API_KEY en el build del frontend.')
  }
  if (!import.meta.env.DEV && !DEV_PANEL_KEY) {
    throw new Error('Falta VITE_DEVELOPER_PANEL_KEY en el build del frontend.')
  }
  const url = import.meta.env.DEV
    ? `${APPINSIGHTS_QUERY_BASE}/v1/apps/${encodeURIComponent(APPINSIGHTS_APP_ID)}/query`
    : `${APPINSIGHTS_QUERY_BASE}/query`
  const headers = {
    'Content-Type': 'application/json',
  }
  if (import.meta.env.DEV) {
    headers['x-api-key'] = APPINSIGHTS_API_KEY
  } else {
    headers['x-dev-panel-key'] = DEV_PANEL_KEY
  }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`Respuesta no JSON (${res.status}): ${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || text.slice(0, 300)
    throw new Error(`Application Insights ${res.status}: ${msg}`)
  }
  return data
}

function firstTable(data) {
  return data?.tables?.[0] || null
}

export function parseExceptionStack(detailsRaw) {
  if (!detailsRaw) return { message: '', stack: '' }
  try {
    const arr = typeof detailsRaw === 'string' ? JSON.parse(detailsRaw) : detailsRaw
    const item = Array.isArray(arr) ? arr[0] : arr
    if (!item) return { message: '', stack: '' }
    const message = item.message || item.outerMessage || item.type || ''
    const lines = (item.parsedStack || []).map(
      s => `  at ${s.method || '?'} (${s.fileName || '?'}:${s.line || 0})`,
    )
    const stack = lines.length ? `${message}\n${lines.join('\n')}` : message
    return { message, stack }
  } catch {
    return { message: String(detailsRaw).slice(0, 500), stack: String(detailsRaw) }
  }
}

export const APPINSIGHTS_FREE_TIER_GB = 5

const MONTHLY_INGESTION_KQL = `
let monthStart = startofmonth(now());
union isfuzzy=true
    requests, exceptions, dependencies, traces, customEvents, customMetrics, pageViews, availabilityResults
| where timestamp >= monthStart
| summarize ingestedBytes = sum(_BilledSize)
| extend ingestedGB = round(todouble(ingestedBytes) / pow(1024.0, 3), 3)
`

const MONTHLY_INGESTION_USAGE_KQL = `
let monthStart = startofmonth(now());
usage
| where timestamp >= monthStart and isBillable == true
| summarize ingestedMB = sum(quantity)
| extend ingestedGB = round(todouble(ingestedMB) / 1024.0, 3)
`

async function fetchMonthlyIngestionGb() {
  const readGb = data => {
    const row = rows(firstTable(data))[0] || {}
    const gb = Number(row.ingestedGB)
    return Number.isFinite(gb) ? gb : 0
  }
  try {
    const billed = readGb(await runKql(MONTHLY_INGESTION_KQL))
    if (billed > 0) return billed
  } catch {
    /* fallback Usage table */
  }
  try {
    return readGb(await runKql(MONTHLY_INGESTION_USAGE_KQL))
  } catch {
    return null
  }
}

export async function fetchDiagnosticSnapshot() {
  const summaryQ = `
requests
| where timestamp > ago(30m)
| summarize
    total = count(),
    failed = countif(success == false),
    avgMs = avg(duration)
`
  const endpointsQ = `
requests
| where timestamp > ago(30m)
| summarize total = count(), failed = countif(success == false) by name
| where failed > 0
| extend errorPct = round(100.0 * failed / total, 1)
| order by failed desc
| take 25
`
  const slowQ = `
requests
| where timestamp > ago(30m)
| summarize avgMs = round(avg(duration), 1) by name
| order by avgMs desc
| take 5
`
  const recentErrorsQ = `
union
  (exceptions
   | where timestamp > ago(24h)
   | project ts = timestamp, endpoint = operation_Name, msg = outerMessage, errorKind = "exception"),
  (requests
   | where timestamp > ago(24h) and success == false
   | project ts = timestamp, endpoint = name, msg = strcat("HTTP ", tostring(resultCode)), errorKind = "request"),
  (traces
   | where timestamp > ago(24h) and severityLevel >= 3
   | project ts = timestamp, endpoint = operation_Name, msg = message, errorKind = "trace")
| order by ts desc
| take 20
`
  const supabaseFilter = `
| where timestamp > ago(30m)
| extend targetLower = tolower(tostring(target))
| where targetLower contains "supabase"
   or tolower(tostring(name)) contains "supabase"
   or tolower(tostring(data)) contains "supabase"`
  const supabaseQ = `
dependencies
${supabaseFilter}
| summarize total = count(), failed = countif(success == false), avgMs = round(avg(duration), 1)
`
  const supabaseFailedQ = `
dependencies
${supabaseFilter}
| where success == false
| summarize failures = count(), avgMs = round(avg(duration), 1) by name
| order by failures desc
| take 15
`
  const activeUsersQ = `
requests
| where timestamp > ago(10m)
| where name != "appinsights-query"
| extend actor = case(
    isnotempty(user_Id), tostring(user_Id),
    isnotempty(client_IP) and client_IP != "0.0.0.0", tostring(client_IP),
    "")
| where isnotempty(actor)
| extend userEmail = tostring(customDimensions.["user.email"])
| summarize
    requestCount = count(),
    lastEndpoint = arg_max(name, timestamp),
    lastSeen = max(timestamp),
    email = max(userEmail)
  by actor
| extend displayName = case(
    isnotempty(email), email,
    actor contains ".", strcat("IP ", actor),
    actor)
| order by requestCount desc
| take 25
`

  const [summaryRes, endpointsRes, slowRes, recentRes, supabaseRes, supabaseFailedRes, ingestedGB, activeUsersRes] =
    await Promise.all([
      runKql(summaryQ),
      runKql(endpointsQ),
      runKql(slowQ),
      runKql(recentErrorsQ),
      runKql(supabaseQ),
      runKql(supabaseFailedQ),
      fetchMonthlyIngestionGb(),
      runKql(activeUsersQ),
    ])

  const summaryRow = rows(firstTable(summaryRes))[0] || {}
  const total = Number(summaryRow.total) || 0
  const failed = Number(summaryRow.failed) || 0
  const errorRate = total > 0 ? (100 * failed) / total : 0

  let status = 'green'
  if (errorRate >= 5) status = 'red'
  else if (errorRate >= 1 || failed >= 5) status = 'yellow'

  const supabaseRow = rows(firstTable(supabaseRes))[0] || {}
  const supabaseTotal = Number(supabaseRow.total) || 0
  const supabaseFailed = Number(supabaseRow.failed) || 0
  const limitGb = APPINSIGHTS_FREE_TIER_GB
  const usedGb = ingestedGB == null ? null : Math.max(0, ingestedGB)
  const usagePct = usedGb == null ? null : Math.min(100, (usedGb / limitGb) * 100)
  const remainingGb = usedGb == null ? null : Math.max(0, limitGb - usedGb)

  return {
    fetchedAt: new Date().toISOString(),
    status,
    ingestion: {
      usedGb,
      limitGb,
      usagePct: usagePct == null ? null : Math.round(usagePct * 10) / 10,
      remainingGb: remainingGb == null ? null : Math.round(remainingGb * 1000) / 1000,
    },
    requests: {
      total,
      failed,
      errorRate: Math.round(errorRate * 10) / 10,
      avgMs: Math.round(Number(summaryRow.avgMs) || 0),
    },
    endpoints: rows(firstTable(endpointsRes)).map(r => ({
      name: r.name || '(sin nombre)',
      failed: Number(r.failed) || 0,
      total: Number(r.total) || 0,
      errorPct: Number(r.errorPct) || 0,
    })),
    slowest: rows(firstTable(slowRes)).map(r => ({
      name: r.name || '(sin nombre)',
      avgMs: Number(r.avgMs) || 0,
    })),
    recentErrors: rows(firstTable(recentRes)).map(r => ({
      timestamp: r.ts,
      endpoint: r.endpoint || '—',
      message: r.msg || '—',
      kind: r.errorKind,
    })),
    supabase: {
      total: supabaseTotal,
      failed: supabaseFailed,
      avgMs: Number(supabaseRow.avgMs) || 0,
      ok: supabaseTotal === 0 ? null : supabaseFailed === 0,
      host: 'supabase',
      failures: rows(firstTable(supabaseFailedRes)).map(r => ({
        name: r.name || '(sin nombre)',
        failures: Number(r.failures) || 0,
        avgMs: Number(r.avgMs) || 0,
      })),
    },
    activeUsers: rows(firstTable(activeUsersRes)).map(r => ({
      userId: r.actor || '',
      displayName: r.displayName || r.email || r.actor || '—',
      requestCount: Number(r.requestCount) || 0,
      lastEndpoint: r.lastEndpoint || '—',
      lastSeen: r.lastSeen,
    })),
  }
}

export async function fetchEndpointErrorDetail(endpointName) {
  const safe = String(endpointName || '').replace(/"/g, '\\"')
  const q = `
let lastFail = requests
| where timestamp > ago(7d) and name == "${safe}" and success == false
| top 1 by timestamp desc
| project operation_Id, timestamp, resultCode, url, customDimensions;
let ex = exceptions
| where timestamp > ago(7d)
| where operation_Id in (lastFail | project operation_Id)
| top 1 by timestamp desc
| project timestamp, outerMessage, innermostMessage, type, details, operation_Id;
lastFail
| join kind=leftouter ex on operation_Id
| top 1 by timestamp desc
`
  const data = await runKql(q)
  const row = rows(firstTable(data))[0]
  if (!row) {
    return {
      endpoint: endpointName,
      message: 'Sin excepción registrada para este endpoint en los últimos 7 días.',
      stack: '',
      httpCode: null,
      timestamp: null,
    }
  }
  const parsed = parseExceptionStack(row.details)
  const msg = row.outerMessage || row.innermostMessage || parsed.message
    || (row.resultCode ? `HTTP ${row.resultCode}` : 'Error sin mensaje')
  return {
    endpoint: endpointName,
    message: msg,
    stack: parsed.stack || row.details || '',
    httpCode: row.resultCode ?? null,
    timestamp: row.timestamp,
    url: row.url || null,
  }
}
