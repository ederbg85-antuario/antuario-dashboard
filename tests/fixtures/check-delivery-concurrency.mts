import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  deliveryFixtureSchema,
  deliveryMigration,
  people,
  taskId,
  documentEvidence,
} from "../helpers/delivery-db-fixture";
// Optional native PG harness. Only a local Unix socket is accepted; no production connection URL.
const moduleRoot = process.env.DELIVERY_QA_MODULE_ROOT,
  socket = process.env.DELIVERY_QA_SOCKET;
if (!moduleRoot || !socket?.startsWith("/private/tmp/"))
  throw new Error("Set local DELIVERY_QA_MODULE_ROOT and DELIVERY_QA_SOCKET");
const { Client } = createRequire(moduleRoot + "/package.json")("pg");
const connect = async (user?: string) => {
  const c = new Client({
    host: socket,
    port: 55478,
    database: "postgres",
    user: "postgres",
  });
  await c.connect();
  if (user) {
    await c.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await c.query("set role authenticated");
  }
  return c;
};
const admin = await connect(),
  author = await connect(),
  owner = await connect(),
  validator = await connect();
try {
  await admin.query(deliveryFixtureSchema());
  await admin.query(deliveryMigration());
  for (const [client, id] of [
    [author, people.author],
    [owner, people.owner],
    [validator, people.validator],
  ]) {
    await client.query("select set_config('request.jwt.claim.sub',$1,false)", [
      id,
    ]);
    await client.query("set role authenticated");
  }
  const submit = (client: typeof author, key = crypto.randomUUID()) =>
    client.query("select submit_task_delivery(1,$1,$2,$3,$4::jsonb,$5) id", [
      taskId,
      "Version concurrente",
      "",
      JSON.stringify(documentEvidence),
      key,
    ]);
  const respond = (
    client: typeof owner,
    id: string,
    key = crypto.randomUUID(),
  ) =>
    client.query("select respond_task_delivery(1,$1,$2,$3,$4,$5) id", [
      id,
      "approved",
      "",
      "review",
      key,
    ]);
  const first = (await submit(author)).rows[0].id;
  // New version holds the task row. A queued decision must recheck latest version after commit.
  await author.query("begin");
  const next = (await submit(author)).rows[0].id;
  const pending = respond(owner, first).then(
    () => ({ code: "unexpected success" }),
    (e: { code: string }) => e,
  );
  await author.query("commit");
  assert.equal((await pending).code, "40001");
  // Two different reviewers racing produce exactly one decision.
  await owner.query("begin");
  await respond(owner, next);
  const competing = respond(validator, next).then(
    () => ({ code: "unexpected success" }),
    (e: { code: string }) => e,
  );
  await owner.query("commit");
  assert.equal((await competing).code, "40001");
  assert.equal(
    Number(
      (
        await admin.query(
          "select count(*) n from task_delivery_events where action='approved'",
        )
      ).rows[0].n,
    ),
    1,
  );
  // Same submission retried by two sessions gets the same immutable version, not two increments.
  await owner.query("select set_config('request.jwt.claim.sub',$1,false)", [
    people.author,
  ]);
  const key = crypto.randomUUID();
  await author.query("begin");
  const saved = (await submit(author, key)).rows[0].id;
  const retry = submit(owner, key);
  await author.query("commit");
  assert.equal((await retry).rows[0].id, saved);
  assert.equal(
    Number(
      (await admin.query("select count(*) n from task_deliveries")).rows[0].n,
    ),
    3,
  );
  console.log(
    "PASS PostgreSQL 17.10: queued stale-version decision, competing approvers, simultaneous idempotent submission; 3 versions and 1 decision, no duplicate history.",
  );
} finally {
  await Promise.all([admin.end(), author.end(), owner.end(), validator.end()]);
}
