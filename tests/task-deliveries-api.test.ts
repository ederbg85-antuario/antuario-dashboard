import { test } from "node:test";
import assert from "node:assert/strict";
import {
  asUser,
  createDeliveryDb,
  people,
  submitDelivery,
  taskId,
} from "./helpers/delivery-db-fixture";
import {
  deliveryRouteContext,
  loadDeliveryRoute,
} from "./helpers/delivery-route-fixture";
type InboxRoute = {
  GET: (r: Request) => Promise<Response>;
  POST: (r: Request) => Promise<Response>;
  PATCH: (r: Request) => Promise<Response>;
};
type DetailRoute = {
  GET: (
    r: Request,
    p: { params: Promise<{ id: string }> },
  ) => Promise<Response>;
};
type AssetRoute = {
  GET: (
    r: Request,
    p: { params: Promise<{ id: string; index: string }> },
  ) => Promise<Response>;
};
const url = "http://localhost:4324/api/operations/deliveries";

test("binary delivery upload verifies content, private download and integrity; invalid file never records a version", async () => {
  const db = await createDeliveryDb(),
    fixture = deliveryRouteContext(db);
  try {
    await asUser(db, people.owner);
    const api = await loadDeliveryRoute<InboxRoute>(
      "app/api/operations/deliveries/route.ts",
      () => fixture.context,
    );
    const asset = await loadDeliveryRoute<AssetRoute>(
      "app/api/operations/deliveries/[id]/assets/[index]/route.ts",
      () => fixture.context,
    );
    const form = new FormData();
    for (const [key, value] of Object.entries({
      task_id: taskId,
      request_key: crypto.randomUUID(),
      title: "Captura",
      summary: "",
      document: "",
      link: "",
    }))
      form.set(key, value);
    form.set(
      "files",
      new File(["<script>bad</script>"], "pretends.png", { type: "image/png" }),
    );
    const post = () =>
      api.POST(new Request(url, { method: "POST", body: form }));
    assert.equal((await post()).status, 400);
    assert.equal(
      (await db.query("select * from task_deliveries")).rows.length,
      0,
    );
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=",
      "base64",
    );
    form.set("files", new File([bytes], "captura.png", { type: "image/png" }));
    const response = await post();
    assert.equal(response.status, 201, await response.clone().text());
    const { id } = await response.json();
    assert.equal(
      (await post()).status,
      201,
      "network retry reuses the verified private object",
    );
    const params = { params: Promise.resolve({ id, index: "0" }) },
      download = await asset.GET(
        new Request(url + "/" + id + "/assets/0"),
        params,
      );
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
    await asUser(db, people.otherClient);
    assert.equal((await asset.GET(new Request(url), params)).status, 404);
    await asUser(db, people.owner);
    const object = [...fixture.files.keys()][0];
    fixture.files.set(object, new Blob(["invalid"], { type: "image/png" }));
    assert.equal((await asset.GET(new Request(url), params)).status, 503);
  } finally {
    await db.close();
  }
});

test("real handlers and database: submit, reload, preview original, decide, replay and authorization errors", async () => {
  const db = await createDeliveryDb(),
    fixture = deliveryRouteContext(db);
  let context: unknown = fixture.context;
  try {
    const api = await loadDeliveryRoute<InboxRoute>(
      "app/api/operations/deliveries/route.ts",
      () => context,
    );
    const detail = await loadDeliveryRoute<DetailRoute>(
      "app/api/operations/deliveries/[id]/route.ts",
      () => context,
    );
    const asset = await loadDeliveryRoute<AssetRoute>(
      "app/api/operations/deliveries/[id]/assets/[index]/route.ts",
      () => context,
    );
    context = null;
    assert.equal((await api.GET(new Request(url))).status, 401);
    assert.equal(
      (
        await api.POST(
          new Request(url, { method: "POST", body: "not even multipart" }),
        )
      ).status,
      401,
    );
    context = fixture.context;
    await asUser(db, people.owner);
    assert.equal(
      (
        await api.PATCH(
          new Request(url, {
            method: "PATCH",
            headers: { origin: "https://outsider.invalid" },
            body: "{}",
          }),
        )
      ).status,
      403,
    );
    const form = new FormData(),
      key = crypto.randomUUID(),
      text =
        "\n# Captura de entrega\n\n| Vista | Estado |\n|---|---|\n| Móvil | Verificado |\n\n";
    for (const [k, v] of Object.entries({
      task_id: taskId,
      request_key: key,
      title: "Vista operativa",
      summary: "Validar diseño",
      document: "",
      link: "",
    }))
      form.set(k, v);
    form.append(
      "files",
      new File([text], "revision.md", { type: "text/markdown" }),
    );
    const submit = () =>
      api.POST(new Request(url, { method: "POST", body: form }));
    const saved = await submit();
    assert.equal(saved.status, 201, await saved.clone().text());
    const { id } = await saved.json();
    assert.equal(
      (await (await submit()).json()).id,
      id,
      "same request is idempotent",
    );
    const params = { params: Promise.resolve({ id }) },
      snapshot = await (
        await detail.GET(new Request(url + "/" + id), params)
      ).json();
    assert.equal(snapshot.canReview, false, "owner cannot self-approve");
    assert.equal(
      snapshot.delivery.artifacts[0].text,
      text,
      "original whitespace preserved",
    );
    const original = await asset.GET(
      new Request(url + "/" + id + "/assets/0?download=1"),
      { params: Promise.resolve({ id, index: "0" }) },
    );
    assert.equal(await original.text(), text);
    assert.match(original.headers.get("content-disposition")!, /^attachment;/);
    assert.match(original.headers.get("cache-control")!, /no-store/);
    await asUser(db, people.author);
    const other = await submitDelivery(db);
    await asUser(db, people.owner);
    const body = {
      delivery_id: other,
      action: "approved",
      body: "Diseño revisado",
      request_key: crypto.randomUUID(),
      expected_status: "review",
    };
    const decide = () =>
      api.PATCH(
        new Request(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    assert.equal((await decide()).status, 200);
    assert.equal((await decide()).status, 200);
    const listing = await (
      await api.GET(new Request(url + "?status=approved"))
    ).json();
    assert.equal(listing.counts.approved, 1);
    assert.equal(listing.deliveries[0].id, other);
    assert.equal(listing.deliveries[0].artifacts[0].text, undefined);
    body.action = "rejected";
    body.request_key = crypto.randomUUID();
    assert.equal((await decide()).status, 409);
    assert.equal(
      (
        await asset.GET(new Request(url), {
          params: Promise.resolve({ id: crypto.randomUUID(), index: "0" }),
        })
      ).status,
      404,
    );
    form.set("request_key", crypto.randomUUID());
    form.set("link", "javascript:alert(1)");
    assert.equal((await submit()).status, 400);
    assert.equal(
      (
        await api.PATCH(
          new Request(url, { method: "PATCH", body: "x".repeat(21000) }),
        )
      ).status,
      400,
    );
    // More than one API page, including identical timestamps, never drops or repeats history.
    await db.exec("reset role");
    await db.query(
      "insert into task_delivery_events(organization_id,delivery_id,task_id,actor_id,action,body,request_key,created_at) select 1,$1,$2,$3,'comment','Comentario '||n,gen_random_uuid(),'2026-10-01T12:00:00Z' from generate_series(1,205) n",
      [other, taskId, people.author],
    );
    await asUser(db, people.owner);
    const visited = new Set<string>();
    let cursor: { created_at: string; id: string } | null = null;
    let pages = 0;
    do {
      const suffix: string = cursor
        ? "?before=" +
          encodeURIComponent(cursor.created_at) +
          "&event_id=" +
          cursor.id
        : "";
      const page: {
        events: { id: string }[];
        historyCursor: { created_at: string; id: string } | null;
      } = await (
        await detail.GET(new Request(url + "/" + other + suffix), {
          params: Promise.resolve({ id: other }),
        })
      ).json();
      for (const event of page.events) {
        assert.equal(visited.has(event.id), false);
        visited.add(event.id);
      }
      cursor = page.historyCursor;
      pages++;
    } while (cursor);
    assert.equal(pages, 3);
    assert.equal(visited.size, 208);
  } finally {
    await db.close();
  }
});

test('task-scoped delivery inbox returns only the original task and scoped totals; unauthorized tasks stay private',async()=>{
 const db=await createDeliveryDb(),fixture=deliveryRouteContext(db)
 try{
  await asUser(db,people.author);await submitDelivery(db)
  const api=await loadDeliveryRoute<InboxRoute>('app/api/operations/deliveries/route.ts',()=>fixture.context)
  const response=await api.GET(new Request(url+'?task='+taskId+'&status=all')),body=await response.json()
  assert.equal(response.status,200);assert.equal(body.total,1);assert.equal(body.counts.review,1);assert.ok(body.deliveries.every((d:{task_id:string})=>d.task_id===taskId))
  assert.equal((await api.GET(new Request(url+'?task=invalid'))).status,400)
  await asUser(db,people.otherClient);assert.equal((await api.GET(new Request(url+'?task='+taskId))).status,404)
 }finally{await db.close()}
})
