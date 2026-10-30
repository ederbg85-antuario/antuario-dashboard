import { test } from "node:test";
import assert from "node:assert/strict";
import {
  asUser,
  createDeliveryDb,
  did,
  documentEvidence,
  people,
  respondDelivery,
  submitDelivery,
  taskId,
} from "./helpers/delivery-db-fixture";

test("version, decision, comment, replay and completion lifecycle uses original task and immutable history", async () => {
  const db = await createDeliveryDb();
  try {
    await asUser(db, people.author);
    const key = crypto.randomUUID(),
      first = await submitDelivery(db, key);
    assert.equal(await submitDelivery(db, key), first);
    assert.equal(
      (await db.query("select * from task_deliveries")).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from tasks where id=$1",
          [taskId],
        )
      ).rows[0].status,
      "review",
    );
    await assert.rejects(respondDelivery(db, first), { code: "42501" });
    await assert.rejects(
      db.query("update tasks set status='done' where id=$1", [taskId]),
      { code: "23514" },
    );
    await assert.rejects(
      submitDelivery(db, key, [{ ...documentEvidence[0], text: "Replaced" }]),
      { code: "23505" },
    );
    await assert.rejects(
      db.exec("update task_deliveries set title='Altered'"),
      { code: "42501" },
    );
    await assert.rejects(db.exec("delete from task_delivery_events"), {
      code: "42501",
    });
    await asUser(db, people.validator);
    await assert.rejects(respondDelivery(db, first, "changes_requested"), {
      code: "22023",
    });
    const responseKey = crypto.randomUUID(),
      changed = await respondDelivery(
        db,
        first,
        "changes_requested",
        "Ampliar captura",
        responseKey,
      );
    assert.equal(
      await respondDelivery(
        db,
        first,
        "changes_requested",
        "Ampliar captura",
        responseKey,
      ),
      changed,
    );
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from tasks where id=$1",
          [taskId],
        )
      ).rows[0].status,
      "in_progress",
    );
    await asUser(db, people.author);
    const second = await submitDelivery(db);
    const noteKey = crypto.randomUUID(),
      note = await respondDelivery(
        db,
        first,
        "comment",
        "Resuelto en v2",
        noteKey,
      );
    assert.equal(
      await respondDelivery(db, first, "comment", "Resuelto en v2", noteKey),
      note,
    );
    await asUser(db, people.owner);
    await assert.rejects(respondDelivery(db, first), { code: "40001" });
    await respondDelivery(db, second);
    await assert.rejects(
      respondDelivery(db, second, "rejected", "Competing stale decision"),
      { code: "40001" },
    );
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from tasks where id=$1",
          [taskId],
        )
      ).rows[0].status,
      "review",
      "approval alone never completes task",
    );
    await db.query("update tasks set status='done' where id=$1", [taskId]);
    await assert.rejects(submitDelivery(db), { code: "55000" });
    await db.query("update tasks set status='done' where id=$1", [did(102)]);
    assert.deepEqual(
      (
        await db.query<{ status: string; version: number }>(
          "select status,version from task_delivery_latest",
        )
      ).rows,
      [{ status: "approved", version: 2 }],
    );
    assert.deepEqual(
      (
        await db.query<{ action: string }>(
          "select action from task_delivery_events order by created_at,id",
        )
      ).rows
        .map((x) => x.action)
        .sort(),
      ["approved", "changes_requested", "comment", "submitted", "submitted"],
    );
    const versions = (
      await db.query<{ artifacts: unknown[] }>(
        "select artifacts from task_deliveries order by version",
      )
    ).rows;
    assert.deepEqual(versions[0].artifacts, documentEvidence);
    assert.equal(
      JSON.stringify(
        (await db.query("select artifacts from task_delivery_latest")).rows,
      ).includes("Documento completo"),
      false,
      "list avoids document body payload",
    );
  } finally {
    await db.close();
  }
});

test("organization/client isolation, read-only/inactive users and non-validator write scopes", async () => {
  const db = await createDeliveryDb();
  try {
    await asUser(db, people.author);
    const id = await submitDelivery(db);
    for (const person of [
      people.otherOrg,
      people.otherClient,
      people.inactive,
    ]) {
      await asUser(db, person);
      assert.equal(
        (await db.query("select * from task_deliveries")).rows.length,
        0,
      );
      assert.equal(
        (await db.query("select * from task_delivery_latest")).rows.length,
        0,
      );
      assert.equal(
        (await db.query("select * from task_delivery_events")).rows.length,
        0,
      );
      await assert.rejects(submitDelivery(db), { code: "42501" });
      await assert.rejects(
        respondDelivery(db, id, "comment", "No permission"),
        { code: "42501" },
      );
    }
    await asUser(db, people.reader);
    assert.equal(
      (await db.query("select * from task_deliveries")).rows.length,
      1,
    );
    await assert.rejects(respondDelivery(db, id, "comment", "Read only"), {
      code: "42501",
    });
    await assert.rejects(submitDelivery(db), { code: "42501" });
    await asUser(db, people.operator);
    await respondDelivery(db, id, "comment", "Comment permitted");
    await assert.rejects(respondDelivery(db, id), { code: "42501" });
    await asUser(db, people.owner);
    await assert.rejects(
      db.query("select submit_task_delivery(2,$1,$2,$3,$4::jsonb,$5)", [
        did(101),
        "Other org",
        "",
        JSON.stringify(documentEvidence),
        crypto.randomUUID(),
      ]),
      { code: "42501" },
    );
    await db.exec("reset role");
    await db.query(
      "update tasks set assignee_member_id=null,assigned_to=null,validator_member_id=$1 where id=$2",
      [did(21), taskId],
    );
    await asUser(db, people.author);
    await assert.rejects(
      respondDelivery(db, id),
      { code: "42501" },
      "reassignment does not allow original author self-review",
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(db.exec("select * from task_delivery_latest"), {
      code: "42501",
    });
  } finally {
    await db.close();
  }
});

test("private uploads: staged files scoped to uploader; attached assets readable by task scope and immutable", async () => {
  const db = await createDeliveryDb();
  try {
    await asUser(db, people.author);
    const key = crypto.randomUUID(),
      hash = "a".repeat(64),
      path = `1/${taskId}/${people.author}/${key}/0-${hash}.png`;
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3::jsonb)",
      [
        "task-deliveries",
        path,
        JSON.stringify({ mimetype: "image/png", size: 20 }),
      ],
    );
    await asUser(db, people.owner);
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
    await asUser(db, people.author);
    const evidence = [
      {
        kind: "image",
        name: "captura.png",
        path,
        mime: "image/png",
        size: 20,
        sha256: hash,
      },
    ];
    await assert.rejects(
      submitDelivery(db, key, [{ ...evidence[0], size: 21 }]),
      { code: "22023" },
    );
    assert.equal(
      (await db.query("select * from task_deliveries")).rows.length,
      0,
    );
    await submitDelivery(db, key, evidence);
    assert.equal(
      (await db.query("delete from storage.objects returning id")).rows.length,
      0,
      "cannot delete submitted evidence",
    );
    await assert.rejects(
      db.query(
        "insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3::jsonb)",
        ["task-deliveries", path, "{}"],
      ),
      { code: "42501" },
    );
    await asUser(db, people.owner);
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      1,
    );
    await asUser(db, people.otherClient);
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
    await asUser(db, people.author);
    for (const artifact of [
      { kind: "document", name: "bad.md", format: "html", text: "test" },
      { kind: "link", name: "Unsafe", url: "javascript:alert(1)" },
      { ...evidence[0], path: path.replace(people.author, people.owner) },
    ]) {
      await assert.rejects(
        submitDelivery(db, crypto.randomUUID(), [artifact]),
        { code: "22023" },
      );
    }
  } finally {
    await db.close();
  }
});
