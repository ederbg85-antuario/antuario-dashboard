// Run the local fixture and the real Next application on the loopback ports below.
import assert from 'node:assert/strict'
const base = 'http://127.0.0.1:4189/api/prospeccion'
async function session(role) {
  const r = await fetch('http://127.0.0.1:4188/session/' + role, { redirect: 'manual' })
  assert.equal(r.status, 302)
  const cookie = r.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
  return async (query = '', body) => {
    const response = await fetch(base + query, {
      method: body ? 'POST' : 'GET',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify({ ...body, request: crypto.randomUUID() }) : undefined,
    })
    return { status: response.status, result: await response.json() }
  }
}
const results = []
function check(label, actual, expected) {
  assert.deepEqual(actual, expected, label)
  results.push({ prueba: label, resultado: 'PASS', observado: actual })
}
const a = await session('a'),
  b = await session('b'),
  admin = await session('admin')
const run = crypto.randomUUID().slice(0, 8)
async function create(client, label) {
  const r = await client('', {
    op: 'create',
    company: 'QA HTTP ' + label + ' ' + run,
    source: 'Prueba aislada',
  })
  assert.equal(r.status, 200)
  return r.result.id
}
const aId = await create(a, 'A'),
  bId = await create(b, 'B')
for (const [label, client, own, other] of [
  ['A', a, aId, bId],
  ['B', b, bId, aId],
]) {
  const list = await client()
  check(
    label + ' lista sólo su cartera',
    list.result.deals.every((d) => d.owner === list.result.userId),
    true,
  )
  check(label + ' abre ficha propia', (await client('?id=' + own)).status, 200)
  check(
    label + ' escribe nota propia',
    (await client('', { op: 'note', note: 'Seguimiento de prueba', id: own, revision: 0 })).status,
    200,
  )
  check(label + ' lectura de ficha ajena', (await client('?id=' + other)).status, 404)
  check(
    label + ' escritura fuera de cartera',
    (await client('', { op: 'note', note: 'QA', id: other, revision: 0 })).status,
    403,
  )
}
const userB = (await b()).result.userId
check(
  'A no puede consultar indicadores de B',
  (await a('?view=metrics&seller=' + userB)).status,
  403,
)
check(
  'Administrador abre ambas fichas',
  (await admin('?id=' + aId)).status === 200 && (await admin('?id=' + bId)).status === 200,
  true,
)
check(
  'Administrador reasigna',
  (await admin('', { op: 'assign', id: aId, owner: userB, revision: 1 })).status,
  200,
)
check('A pierde acceso al enlace', (await a('?id=' + aId)).status, 404)
const acquired = await b('?id=' + aId)
check('B recibe el acceso', acquired.status, 200)
check(
  'Se conserva autor de la nota',
  acquired.result.deals[0].history.find((h) => h.body === 'Seguimiento de prueba').author,
  'Vendedor A',
)
check('Indicadores del vendedor accesibles', (await b('?view=metrics')).status, 200)
console.log(
  JSON.stringify(
    {
      entorno: 'Next.js local · identidades ficticias · PostgreSQL PGlite con la migración real',
      pruebas: results,
    },
    null,
    2,
  ),
)
