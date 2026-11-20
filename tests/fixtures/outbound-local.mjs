import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { createServerClient } from '@supabase/ssr'
import { actors, outboundFixture, rpc, asUser } from '../helpers/outbound-fixture.ts'
const db = await outboundFixture(),
  sessions = new Map(),
  ids = {}
for (const [label, user] of Object.entries(actors)) {
  await asUser(db, user)
  if (label === 'admin') continue
  const id = await rpc(db, 'command', [
    JSON.stringify({
      op: 'create',
      company: 'Cartera de prueba ' + label.toUpperCase(),
      name: 'Contacto de prueba ' + label.toUpperCase(),
      source: 'Simulación QA',
      zone: 'CDMX',
      request: randomUUID(),
    }),
  ])
  ids[label] = id
}
let queue = Promise.resolve()
const base = 'http://127.0.0.1:4188'
const app = 'http://127.0.0.1:4189'
function userFor(id) {
  return {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: id + '@example.invalid',
    app_metadata: {},
    user_metadata: {},
    identities: [],
    created_at: new Date().toISOString(),
  }
}
createServer(async (req, res) => {
  const url = new URL(req.url, base),
    path = url.pathname
  function json(v, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(v))
  }
  if (path === '/') {
    res.setHeader('Content-Type', 'text/html;charset=utf-8')
    res.end(
      '<h1>Entorno local de pruebas · Antuario</h1>' +
        Object.keys(actors)
          .map(
            (k) =>
              '<p><a href="/session/' +
              k +
              '">Abrir ' +
              { admin: 'Administrador', a: 'Vendedor A', b: 'Vendedor B' }[k] +
              '</a></p>',
          )
          .join(''),
    )
    return
  }
  if (path.startsWith('/session/')) {
    const k = path.split('/').pop()
    if (!Object.hasOwn(actors, k)) return json({}, 404)
    const cookies = []
    const sb = createServerClient(base, 'local-fixture-only', {
      cookies: {
        getAll() {
          return []
        },
        setAll(v) {
          cookies.push(...v)
        },
      },
    })
    const { error } = await sb.auth.signInWithPassword({
      email: k + '@example.invalid',
      password: 'local-test-only',
    })
    if (error) return json({ error: error.message }, 500)
    res.writeHead(302, {
      'Set-Cookie': cookies.map((c) => c.name + '=' + c.value + '; Path=/; SameSite=Lax'),
      Location: app + '/ventas/prospeccion',
    })
    res.end()
    return
  }
  if (path === '/auth/v1/token' && req.method === 'POST') {
    let raw = ''
    for await (const buf of req) raw += buf
    const b = JSON.parse(raw)
    const k = b.email?.split('@')[0]
    if (!Object.hasOwn(actors, k) || b.password !== 'local-test-only') return json({}, 403)
    const token = randomUUID(),
      user = userFor(actors[k])
    sessions.set(token, user.id)
    return json({
      access_token: token,
      token_type: 'bearer',
      refresh_token: randomUUID(),
      expires_in: 86400,
      user,
    })
  }
  const id = sessions.get(req.headers.authorization?.replace(/^Bearer /i, ''))
  if (!id) return json({ message: 'Sin sesión local' }, 401)
  if (path === '/auth/v1/user') return json(userFor(id))
  const name = path.split('/').pop(),
    admin = id === actors.admin,
    label = admin ? 'Eder' : id === actors.a ? 'Vendedor A' : 'Vendedor B'
  let rows = []
  if (path.startsWith('/rest/v1/rpc/')) {
    const funcs = {
      outbound_workspace: 'workspace',
      outbound_command: 'command',
      outbound_metrics: 'metrics',
    }
    let raw = ''
    for await (const buf of req) raw += buf
    const b = raw ? JSON.parse(raw) : {}
    queue = queue.then(async () => {
      try {
        await asUser(db, id)
        if (!funcs[name]) return json({}, 404)
        const v = await rpc(
          db,
          funcs[name],
          name === 'outbound_command'
            ? [JSON.stringify(b.cmd)]
            : name === 'outbound_metrics'
              ? [b.week_of || null, b.seller || null]
              : [b.b || null],
        )
        json(v)
      } catch (e) {
        json({ code: e.code, message: e.message }, e.code === '42501' ? 403 : 400)
      }
    })
    return
  }
  if (name === 'memberships')
    rows = [{ user_id: id, organization_id: 1, role: admin ? 'owner' : 'viewer', status: 'active' }]
  if (name === 'team_members')
    rows = [
      {
        user_id: id,
        organization_id: 1,
        name: label,
        status: 'active',
        areas: ['sales'],
        write_areas: ['sales'],
        access: 'operator',
        client_ids: [],
      },
    ]
  if (name === 'profiles') rows = [{ id, full_name: label, avatar_url: null }]
  if (name === 'organizations') rows = [{ id: 1, name: 'Antuario · QA local' }]
  return json(req.headers.accept?.includes('object') ? rows[0] || null : rows)
}).listen(4188, '127.0.0.1', () => console.log('QA local lista', JSON.stringify(ids)))
