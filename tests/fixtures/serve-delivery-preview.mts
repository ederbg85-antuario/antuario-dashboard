import { createServer } from "node:http";
import {jsPDF} from "jspdf";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { businessFixture } from "../helpers/business-fixture";
import {
  asUser,
  createDeliveryDb,
  did,
  people,
  taskId,
  projectId,
  clientId,
} from "../helpers/delivery-db-fixture";
import {
  deliveryRouteContext,
  loadDeliveryRoute,
} from "../helpers/delivery-route-fixture";
const db = await createDeliveryDb(),
  fixture = deliveryRouteContext(db),
  data = businessFixture();
data.userId = people.owner;
data.clients[0].id = clientId;
data.projects[0].id = projectId;
data.projects[0].client_id = clientId;
data.team[0].id = did(20);
data.team[0].user_id = people.owner;
data.team[0].name = "Eder";
data.team[1].id = did(21);
data.team[1].user_id = people.author;
data.team[1].name = "Equipo de diseño";
data.profiles = [
  { id: people.owner, full_name: "Eder" },
  { id: people.author, full_name: "Equipo de diseño" },
  { id: people.validator, full_name: "Revisión" },
];
for (let i = 0; i < data.tasks.length; i++) {
  const task = data.tasks[i];
  task.id = i === 0 ? taskId : did(1000 + i);
  task.project_id = projectId;
  task.assignee_member_id = did(21);
  task.validator_member_id = did(22);
  if (i < 3) task.status = "in_progress";
  if (i === 0)
    await db.query("update tasks set status=$1,title=$2 where id=$3", [
      task.status,
      task.title,
      task.id,
    ]);
  else
    await db.query(
      "insert into tasks(id,organization_id,project_id,title,status,assignee_member_id,validator_member_id) values($1,1,$2,$3,$4,$5,$6)",
      [task.id, projectId, task.title, task.status, did(21), did(22)],
    );
}
await asUser(db, people.author);
const image = new Uint8Array(await readFile("public/wos/wos-peace.webp")),
  sha = createHash("sha256").update(image).digest("hex"),
  key = crypto.randomUUID(),
  name = `1/${taskId}/${people.author}/${key}/0-${sha}.webp`;
await fixture.context.db.storage
  .from("task-deliveries")
  .upload(name, image, { contentType: "image/webp" });
const samples = [
  {
    title: "Woss · presencia visual",
    artifacts: [
      {
        kind: "image",
        name: "Woss.webp",
        path: name,
        mime: "image/webp",
        size: image.length,
        sha256: sha,
      },
      {
        kind: "document",
        name: "revision.md",
        format: "markdown",
        text: "# Presencia de Woss\n\nEjemplo local para revisar imágenes, comentarios y versiones.\n\n- Mascota visible\n- Paleta de Antuario\n- Animación con control de pausa\n",
      },
    ],
    key,
  },
  {
    title: "Calendario editorial",
    artifacts: [
      {
        kind: "document",
        name: "calendario.md",
        format: "markdown",
        text: "# Calendario editorial\n\n**Documento de ejemplo · sin publicaciones programadas.**\n\n| Día | Formato | Tema | Estado |\n|---|---|---|---|\n| Lunes | Reel | Conoce al equipo | Por revisar |\n| Miércoles | Carrusel | Proceso creativo | En diseño |\n| Viernes | Imagen | Proyecto reciente | Por revisar |\n\n## Revisión\n\nValida los temas y deja tus cambios en el panel lateral.\n",
      },
    ],
    key: crypto.randomUUID(),
  },
  {
    title: "Vista operativa · revisión",
    artifacts: [
      {
        kind: "document",
        name: "validacion.md",
        format: "markdown",
        text: "# Validación funcional\n\n| Comprobación | Resultado |\n|---|---|\n| Entregas por versión | Verificado en local |\n| Comentarios | Persisten al recargar |\n| Aprobación | Separada del cierre |\n| Archivos | Acceso privado |\n\nEstos son datos de ejemplo de la vista local.\n",
      },
    ],
    key: crypto.randomUUID(),
  },
];
const examplePdf=new jsPDF();examplePdf.setFontSize(20);examplePdf.text('Antuario - PDF de prueba',20,30);examplePdf.setFontSize(12);examplePdf.text('Documento privado para revisar en el dashboard.',20,48);examplePdf.addPage();examplePdf.text('Segunda pagina - prueba de navegacion.',20,30);
const pdfBytes=new Uint8Array(examplePdf.output('arraybuffer')),pdfHash=createHash('sha256').update(pdfBytes).digest('hex'),pdfPath=`1/${data.tasks[2].id}/${people.author}/${samples[2].key}/1-${pdfHash}.pdf`;
await fixture.context.db.storage.from('task-deliveries').upload(pdfPath,pdfBytes,{contentType:'application/pdf'});
samples[2].artifacts.push({kind:'pdf',name:'prueba.pdf',path:pdfPath,mime:'application/pdf',size:pdfBytes.length,sha256:pdfHash});
for (let i = 0; i < samples.length; i++) {
  const s = samples[i];
  const result = await fixture.context.db.rpc("submit_task_delivery", {
    p_org: 1,
    p_task: data.tasks[i].id,
    p_title: s.title,
    p_summary: "Datos de prueba para validar la interfaz.",
    p_artifacts: s.artifacts,
    p_request_key: s.key,
  });
  if (result.error) throw result.error;
}
await asUser(db, people.owner);
type Handler = (
  r: Request,
  p?: { params: Promise<Record<string, string>> },
) => Promise<Response>;
const inbox = await loadDeliveryRoute<Record<string, Handler>>(
  "app/api/operations/deliveries/route.ts",
  () => fixture.context,
);
const detail = await loadDeliveryRoute<Record<string, Handler>>(
  "app/api/operations/deliveries/[id]/route.ts",
  () => fixture.context,
);
const asset = await loadDeliveryRoute<Record<string, Handler>>(
  "app/api/operations/deliveries/[id]/assets/[index]/route.ts",
  () => fixture.context,
);
const built = await build({
  entryPoints: ["tests/fixtures/delivery-preview.tsx"],
  bundle: true,
  write: false,
  outdir: "/tmp/antuario-delivery-preview",
  platform: "browser",
  format: "esm",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [
    {
      name: "preview-navigation",
      setup(b) {
        b.onResolve({ filter: /^next\/navigation$/ }, () => ({
          path: path.resolve("tests/fixtures/navigation-preview.ts"),
        }));
        b.onResolve({ filter: /^next\/(link|image)$/ }, (args) => ({
          path: args.path,
          namespace: "preview",
        }));
        b.onLoad({ filter: /.*/, namespace: "preview" }, (args) => ({
          contents:
            args.path === "next/link"
              ? 'import React from "react";export default function Link({href,children,...props}){return React.createElement("a",{href,...props},children)}'
              : 'import React from "react";export default function Image({priority,fill,...props}){return React.createElement("img",props)}',
          loader: "js",
          resolveDir: process.cwd(),
        }));
      },
    },
  ],
});
const js = built.outputFiles.find((f) => f.path.endsWith(".js"))!.text,
  css = built.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "";
const cssFiles = (await readdir(".next/static", { recursive: true })).filter(
    (f) => f.endsWith(".css"),
  ),
  base = (
    await Promise.all(
      cssFiles.map((f) => readFile(".next/static/" + f, "utf8")),
    )
  ).join("\n");
createServer(async (req, res) => {
  try {
    const url = new URL(req.url!, "http://127.0.0.1:4324");
    if (url.pathname === "/preview.js") {
      res.setHeader("content-type", "text/javascript");
      res.end(js);
    } else if (url.pathname === "/styles.css") {
      res.setHeader("content-type", "text/css");
      res.end(base + "\n" + css);
    } else if (url.pathname === "/fixture-data") {
      const statuses = (
        await db.query<{ id: string; status: string }>(
          "select id,status from tasks",
        )
      ).rows;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          ...data,
          tasks: data.tasks.map((t) => ({
            ...t,
            status: statuses.find((s) => s.id === t.id)?.status ?? t.status,
          })),
        }),
      );
    } else if (url.pathname.startsWith("/api/operations/deliveries")) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      const request = new Request(url, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        ...(body.length ? { body } : {}),
      });
      const parts = url.pathname.split("/"),
        id = parts[4],
        index = parts[6],
        handler = id
          ? index !== undefined
            ? asset.GET
            : detail.GET
          : inbox[req.method ?? "GET"];
      const response = handler
        ? await handler(request, { params: Promise.resolve({ id, index }) })
        : new Response(null, { status: 405 });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } else if (
      /^\/vendor\/pdfjs\/[a-zA-Z0-9_./-]+$/.test(url.pathname) &&
      !url.pathname.includes("..")
    ) {
      res.setHeader(
        "content-type",
        url.pathname.endsWith(".mjs")
          ? "text/javascript"
          : url.pathname.endsWith(".wasm")
            ? "application/wasm"
            : "application/octet-stream",
      );
      res.end(await readFile("public" + url.pathname));
    } else if (url.pathname.startsWith("/_next/static/media/"))
      res.end(
        await readFile(".next/static/media/" + path.basename(url.pathname)),
      );
    else if (/^\/wos\/[a-z0-9-]+\.webp$/.test(url.pathname)) {
      res.setHeader("content-type", "image/webp");
      res.end(
        await readFile(path.join("public", "wos", path.basename(url.pathname))),
      );
    } else if (url.pathname === "/brand/isotipo.svg") {
      res.setHeader("content-type", "image/svg+xml");
      res.end(await readFile("public/brand/isotipo.svg"));
    } else if (url.pathname.startsWith("/api/")) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ error: "Esta vista local sólo prueba entregas." }),
      );
    } else {
      res.setHeader("content-type", "text/html");
      res.end(
        '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Antuario · entregas · prueba local</title><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/preview.js"></script></body></html>',
      );
    }
  } catch (error) {
    console.error(error);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Local fixture failure" }));
  }
}).listen(4324, "127.0.0.1", () =>
  console.log(
    "Delivery preview: http://127.0.0.1:4324/dashboard · local database, real handlers, synthetic data",
  ),
);
