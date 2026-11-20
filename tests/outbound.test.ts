import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actors, asUser, outboundFixture, rpc } from './helpers/outbound-fixture'
import type { Workspace, Metrics } from '../lib/outbound'

test('Carteras, flujos manuales, cohortes y traspaso con dos vendedores y dirección', async (t) => {
  const db = await outboundFixture()
  const act = (id: string) => asUser(db, id)
  const workspace = (id?: string) => rpc<Workspace>(db, 'workspace', id ? [id] : [])
  const metrics = (date: string | null = null, seller: string | null = null) =>
    rpc<Metrics>(db, 'metrics', [date, seller])
  const send = (op: string, data: Record<string, unknown> = {}) =>
    rpc<string>(db, 'command', [JSON.stringify({ op, request: crypto.randomUUID(), ...data })])
  let a = '',
    b = '',
    free = ''
  const edit = async (id: string, op: string, data: Record<string, unknown> = {}) =>
    send(op, { id, revision: (await workspace(id)).deals[0].revision, ...data })
  try {
    await t.test(
      'El histórico sin toques no genera abordajes; sólo dirección ve sin asignar',
      async () => {
        await act(actors.admin)
        assert.equal((await workspace()).deals.length, 1)
        assert.equal((await metrics()).funnel[0], 0)
        free = await send('create', { company: 'Disponible QA', source: 'Pruebas', owner: '' })
        await act(actors.a)
        a = await send('create', {
          company: 'Negocio QA A',
          source: 'Pruebas',
          name: 'Persona QA',
          email: 'a@example.invalid',
        })
        await act(actors.b)
        b = await send('create', { company: 'Negocio QA B', source: 'Pruebas' })
        assert.deepEqual(
          (await workspace()).deals.map((d) => d.id),
          [b],
        )
        assert.equal((await workspace(free)).deals.length, 0)
      },
    )
    await t.test('Aislamiento de fichas, historial, contactos, escritura y métricas', async () => {
      for (const [user, own, other] of [
        [actors.a, a, b],
        [actors.b, b, a],
      ]) {
        await act(user)
        assert.deepEqual(
          (await workspace()).deals.map((d) => d.id),
          [own],
        )
        assert.deepEqual((await workspace(other)).deals, [])
        assert.equal(
          (await db.query('select id from prospects where id=$1', [other])).rows.length,
          0,
        )
        assert.equal(
          (await db.query('select id from prospect_activities where prospect_id=$1', [other])).rows
            .length,
          0,
        )
        await assert.rejects(send('note', { id: other, revision: 0, note: 'Prueba de alcance' }), {
          code: '42501',
        })
        await assert.rejects(edit(own, 'assign', { owner: user }), { code: '42501' })
        await assert.rejects(metrics(null, user === actors.a ? actors.b : actors.a), {
          code: '42501',
        })
      }
    })
    await t.test('Duplicado genérico, conversión atómica e idempotencia', async () => {
      await act(actors.b)
      await assert.rejects(
        send('create', { company: 'NEGOCIO-QA A', source: 'QA' }),
        /Posible duplicado/,
      )
      await act(actors.a)
      const cmd = JSON.stringify({
        id: a,
        revision: 0,
        op: 'convert',
        request: crypto.randomUUID(),
      })
      await rpc(db, 'command', [cmd])
      await rpc(db, 'command', [cmd])
      assert.equal((await workspace(a)).deals[0].people.length, 1)
      await assert.rejects(edit(a, 'convert'), /ya está vinculado/)
      await edit(a, 'person', {
        name: 'Segunda persona',
        position: 'Compras',
        email: 'segunda@example.invalid',
      })
      const contact = (await workspace(a)).deals[0].people[0].id
      await act(actors.b)
      assert.equal(
        (await db.query('select id from contacts where id=$1', [contact])).rows.length,
        0,
      )
      await act(actors.a)
      await assert.rejects(
        edit(a, 'person', { name: 'Duplicada', email: 'segunda@example.invalid' }),
        /Posible duplicado/,
      )
      assert.equal((await workspace(a)).deals[0].people.length, 2)
    })
    await t.test('Seguimiento en hilo al día siguiente, permiso y omisión de canales', async () => {
      await act(actors.b)
      await edit(b, 'details', { source: 'QA', fit: 'Encaje documentado' })
      await edit(b, 'move', { stage: 'validado' })
      await edit(b, 'move', { stage: 'correo', note: 'Correo manual' })
      const d = (await workspace(b)).deals[0]
      assert.ok(d.due)
      assert.equal(d.nextAction, 'Responder en el mismo hilo')
      await assert.rejects(
        edit(b, 'move', { stage: 'seguimiento', thread: true, note: 'Prueba' }),
        /día siguiente/,
      )
      await db.exec('reset role')
      await db.query(
        "update prospect_activities set created_at=created_at-interval '1 day' where prospect_id=$1 and outcome='correo'",
        [b],
      )
      await act(actors.b)
      await edit(b, 'move', { stage: 'seguimiento', thread: true, note: 'Mismo hilo' })
      await assert.rejects(edit(b, 'move', { stage: 'whatsapp', note: 'Prueba' }), /permiso/)
      await edit(b, 'skip', { stage: 'whatsapp', note: 'Canal sin permiso' })
      await edit(b, 'skip', { stage: 'llamada', note: 'Canal sin permiso' })
      await edit(b, 'move', { stage: 'sin_respuesta' })
      assert.equal((await metrics()).funnel[0], 1)
      assert.equal((await metrics()).channels.find((c) => c.channel === 'email')?.attempts, 2)
    })
    await t.test(
      'Respuesta temprana y repetición de intentos, respuesta posterior y cohorte original',
      async () => {
        await act(actors.a)
        await edit(a, 'details', {
          source: 'Pruebas',
          fit: 'Encaje',
          decision: 'Directora',
          interest: 'Pidió diagnóstico',
          experiment: 'Asunto',
          arm: 'base',
        })
        await edit(a, 'move', { stage: 'validado' })
        await edit(a, 'move', { stage: 'correo', note: 'Primer correo' })
        await edit(a, 'attempt', { channel: 'email', note: 'Intento registrado' })
        await db.exec('reset role')
        await db.query(
          "update prospect_activities set created_at='2026-11-02T16:00:00Z'::timestamptz + case when outcome='attempt' then interval '1 hour' else interval '0' end where prospect_id=$1 and type='toque'",
          [a],
        )
        await act(actors.a)
        await edit(a, 'move', {
          stage: 'respondio',
          channel: 'email',
          note: 'Respondió antes de WhatsApp',
        })
        await edit(a, 'move', { stage: 'prospectado' })
        await edit(a, 'move', { stage: 'interes' })
        const m = await metrics('2026-11-02')
        assert.deepEqual(m.funnel, [1, 1, 1, 1, 0, 0])
        assert.equal(m.channels[0].attempts, 2)
        assert.equal(m.channels[0].responses, 1)
        assert.equal(m.experiments[0].base_yes, 1)
        assert.equal((await metrics()).funnel[0], 0)
      },
    )
    await t.test(
      'Reasignación conserva autor y cambia el acceso; reunión cancelada o ausente no es realizada',
      async () => {
        await act(actors.admin)
        await edit(a, 'assign', { owner: actors.b })
        await act(actors.a)
        assert.deepEqual((await workspace(a)).deals, [])
        assert.equal((await metrics('2026-11-02')).funnel[0], 1)
        await act(actors.b)
        assert.equal(
          (await workspace(a)).deals[0].history.find((h) => h.outcome === 'correo')?.author,
          'Vendedor A',
        )
        const handoff = {
          stage: 'agendada',
          meeting: '2026-11-25T16:00:00Z',
          attendees: 'Directora',
          objective: 'Revisar alcance',
        }
        await edit(a, 'move', handoff)
        assert.deepEqual((await workspace(a)).deals, [])
        await act(actors.admin)
        assert.equal((await workspace(a)).deals[0].owner, actors.admin)
        await edit(a, 'cancel', { note: 'Reprogramar' })
        await edit(a, 'move', handoff)
        await edit(a, 'no_show', { note: 'Sin asistencia' })
        assert.deepEqual((await metrics('2026-11-02', actors.a)).funnel, [1, 1, 1, 1, 1, 0])
        await edit(a, 'move', handoff)
        await edit(a, 'move', { stage: 'realizada', note: 'Reunión efectuada' })
        await edit(a, 'move', { stage: 'propuesta', note: 'Propuesta preparada' })
        assert.deepEqual((await metrics('2026-11-02', actors.a)).funnel, [1, 1, 1, 1, 1, 1])
        await send('goal', { goal: 80 })
        assert.equal((await metrics(null, actors.a)).goal, 80)
      },
    )
  } finally {
    await db.close()
  }
})

test('La reversión conserva el histórico antes del primer uso y se detiene si ya hay actividad', async () => {
  const { readFileSync } = await import('node:fs')
  const rollback = readFileSync(
    new URL('../supabase/rollback/outbound_prospecting.sql', import.meta.url),
    'utf8',
  )
  const db = await outboundFixture()
  try {
    const before = await db.query('select * from prospects')
    await db.exec(rollback)
    assert.deepEqual((await db.query('select * from prospects')).rows, before.rows)
    await db.exec(
      readFileSync(
        new URL('../supabase/migrations/20261120012213_outbound_prospecting.sql', import.meta.url),
        'utf8',
      ),
    )
    await asUser(db, actors.a)
    await rpc(db, 'command', [
      JSON.stringify({
        op: 'create',
        company: 'QA rollback',
        source: 'Prueba',
        request: crypto.randomUUID(),
      }),
    ])
    await db.exec('reset role')
    await assert.rejects(db.exec(rollback), /Hay actividad posterior/)
    await db.exec('rollback')
    assert.equal(
      (await db.query('select count(*)::int n from private.outbound_cases')).rows[0].n,
      2,
    )
  } finally {
    await db.close()
  }
})
test('Semana CDMX, tendencia, grupos base/prueba y administración autorizada', async () => {
  const db = await outboundFixture()
  try {
    await db.query("update memberships set role='admin' where user_id=$1", [actors.admin])
    await asUser(db, actors.a)
    for (const [i, arm] of ['base', 'base', 'prueba', 'prueba'].entries()) {
      const call = (op: string, data: Record<string, unknown>) =>
        rpc<string>(db, 'command', [JSON.stringify({ op, request: crypto.randomUUID(), ...data })])
      const id = await call('create', { company: 'Cohorte QA ' + i, source: 'Prueba' })
      await call('details', {
        id,
        revision: 0,
        source: 'Prueba',
        fit: 'Encaje',
        experiment: 'Asunto',
        arm,
      })
      await call('move', { id, revision: 1, stage: 'validado' })
      await call('move', { id, revision: 2, stage: 'correo', note: 'Correo manual de prueba' })
      if (i !== 1)
        await call('move', {
          id,
          revision: 3,
          stage: 'respondio',
          channel: 'email',
          note: 'Respuesta',
        })
      await db.exec('reset role')
      await db.query(
        "update prospect_activities set created_at=$2::timestamptz where prospect_id=$1 and type='toque'",
        [id, i === 3 ? '2026-11-09T05:59:00Z' : '2026-11-09T06:00:00Z'],
      )
      await asUser(db, actors.a)
    }
    await asUser(db, actors.admin)
    assert.equal((await rpc<Workspace>(db, 'workspace')).admin, true)
    const current = await rpc<Metrics>(db, 'metrics', ['2026-11-09', actors.a])
    assert.deepEqual(
      current.trend.map((t) => t.n),
      [0, 0, 1, 3],
    )
    assert.deepEqual(current.experiments, [
      { experiment: 'Asunto', base: 2, base_yes: 1, test: 1, test_yes: 1 },
    ])
    assert.equal(
      (current.experiments[0].test_yes / current.experiments[0].test -
        current.experiments[0].base_yes / current.experiments[0].base) *
        100,
      50,
    )
    await asUser(db, actors.b)
    const empty = await rpc<Metrics>(db, 'metrics', ['2026-11-09', null])
    assert.deepEqual(empty.funnel, [0, 0, 0, 0, 0, 0])
    assert.deepEqual(empty.experiments, [])
  } finally {
    await db.close()
  }
})
