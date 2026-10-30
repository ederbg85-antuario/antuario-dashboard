import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { workspace } from "@/lib/workspace";
import { isSameOrigin } from "@/lib/request-origin";
import {
  validFileHeader,
  storedFileMatches,
} from "@/lib/client-accounts-access";
import {
  boundedRequest,
  deliveryError,
  deliveryTaskContext,
} from "@/lib/task-delivery-access";
import {
  DELIVERY_BUCKET,
  MAX_DELIVERY_BYTES,
  deliveryArtifactSchema,
  deliveryResponseSchema,
  documentFormat,
  type DeliveryArtifact,
} from "@/lib/task-deliveries";

const fail = (error: string, status = 400, extra = {}) =>
  NextResponse.json({ error, ...extra }, { status });
const noStore = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const c = await workspace();
  if (!c) return fail("Inicia sesión.", 401);
  const url = new URL(request.url),
    page = Math.max(
      0,
      Math.min(10000, Math.floor(Number(url.searchParams.get("page")) || 0)),
    ),
    status = url.searchParams.get("status") ?? "review";
  if (
    !["all", "review", "approved", "changes_requested", "rejected"].includes(
      status,
    )
  )
    return fail("Filtro inválido.");
  let query = c.db
    .from("task_delivery_latest")
    .select("*", { count: "exact" })
    .eq("organization_id", c.orgId);
  if (status !== "all") query = query.eq("status", status);
  const [list, ...totals] = await Promise.all([
    query
      .order("submitted_at", { ascending: false })
      .order("id")
      .range(page * 12, page * 12 + 11),
    ...["review", "approved", "changes_requested", "rejected"].map((s) =>
      c.db
        .from("task_delivery_latest")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", c.orgId)
        .eq("status", s),
    ),
  ]);
  const error = [list, ...totals].find((r) => r.error)?.error;
  if (error) {
    const e = deliveryError(error.code);
    return fail(e.error, e.status, e);
  }
  return NextResponse.json(
    {
      deliveries: list.data ?? [],
      total: list.count ?? 0,
      page,
      counts: Object.fromEntries(
        ["review", "approved", "changes_requested", "rejected"].map((s, i) => [
          s,
          totals[i].count ?? 0,
        ]),
      ),
    },
    { headers: noStore },
  );
}
export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return fail("Origen no permitido.", 403);
  const c = await workspace();
  if (!c) return fail("Inicia sesión.", 401);
  let raw: unknown;
  try {
    raw = await (await boundedRequest(request, 20000)).json();
  } catch {
    return fail("Respuesta inválida o demasiado larga.");
  }
  const input = deliveryResponseSchema.safeParse(raw);
  if (!input.success)
    return fail(input.error.issues[0]?.message ?? "Revisa la respuesta.");
  const p = input.data;
  const { data, error } = await c.db.rpc("respond_task_delivery", {
    p_org: c.orgId,
    p_delivery: p.delivery_id,
    p_action: p.action,
    p_body: p.body,
    p_expected_status: p.expected_status,
    p_request_key: p.request_key,
  });
  if (error) {
    const e = deliveryError(error.code);
    return fail(e.error, e.status, e);
  }
  return NextResponse.json({ id: data }, { headers: noStore });
}
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail("Origen no permitido.", 403);
  if (!(await workspace())) return fail("Inicia sesión.", 401);
  let form: FormData;
  try {
    form = await (
      await boundedRequest(request, MAX_DELIVERY_BYTES + 131072)
    ).formData();
  } catch {
    return fail("La entrega supera 4 MB o el formulario no es válido.", 413);
  }
  const fields = z
    .object({
      task_id: z.uuid(),
      request_key: z.uuid(),
      title: z.string().trim().min(1).max(180),
      summary: z.string().trim().max(2000),
      document: z.string().max(64000),
      link: z.union([
        z.literal(""),
        z
          .url()
          .max(2000)
          .refine((v) => v.startsWith("https://")),
      ]),
    })
    .safeParse(
      Object.fromEntries(
        ["task_id", "request_key", "title", "summary", "document", "link"].map(
          (k) => [k, String(form.get(k) ?? "")],
        ),
      ),
    );
  if (!fields.success)
    return fail("Revisa la tarea, título, documento y enlace HTTPS.");
  const p = fields.data,
    context = await deliveryTaskContext(p.task_id);
  if ("error" in context)
    return fail(context.error ?? "Tarea no disponible.", context.status);
  const { c } = context;
  if (!context.canWrite)
    return fail("No tienes permiso para entregar esta tarea.", 403);
  const artifacts: DeliveryArtifact[] = [];
  if (p.document.trim())
    artifacts.push({
      kind: "document",
      name: p.title + ".md",
      format: "markdown",
      text: p.document,
    });
  if (p.link)
    artifacts.push({ kind: "link", name: "Enlace al resultado", url: p.link });
  const files = form
    .getAll("files")
    .filter((v): v is File => v instanceof File && v.size > 0);
  if (
    artifacts.length + files.length > 8 ||
    files.reduce((sum, f) => sum + f.size, 0) > MAX_DELIVERY_BYTES
  )
    return fail("Máximo 8 archivos o enlaces y 4 MB por entrega.", 413);
  // Validate every file before the first upload. No partial submission if a file is invalid.
  const uploads: {
    file: File;
    bytes: Uint8Array;
    artifact: Extract<DeliveryArtifact, { kind: "image" | "pdf" }>;
  }[] = [];
  for (const file of files) {
    if (file.name.length > 180)
      return fail("Acorta el nombre del archivo a 180 caracteres.");
    const bytes = new Uint8Array(await file.arrayBuffer()),
      format = documentFormat(file.name);
    if (format) {
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        return fail("Los documentos deben estar codificados en UTF-8.");
      }
      if (text.includes("\0") || !text.trim() || text.length > 64000)
        return fail("Cada documento admite hasta 64 000 caracteres de texto.");
      artifacts.push({ kind: "document", name: file.name, text, format });
      continue;
    }
    if (!validFileHeader(file.type, bytes))
      return fail(
        "Usa PNG, JPG, WebP, PDF, Markdown, TXT o CSV; el contenido debe corresponder al archivo.",
      );
    const sha256 = createHash("sha256").update(bytes).digest("hex"),
      mime = file.type as
        | "image/png"
        | "image/jpeg"
        | "image/webp"
        | "application/pdf";
    const ext = (
      {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
        "application/pdf": "pdf",
      } as const
    )[mime];
    const artifact: Extract<DeliveryArtifact, { kind: "image" | "pdf" }> = {
      kind: mime === "application/pdf" ? "pdf" : "image",
      name: file.name,
      mime,
      size: file.size,
      sha256,
      path: `${c.orgId}/${p.task_id}/${c.user.id}/${p.request_key}/${artifacts.length}-${sha256}.${ext}`,
    };
    artifacts.push(artifact);
    uploads.push({ file, bytes, artifact });
  }
  const validated = z
    .array(deliveryArtifactSchema)
    .min(1)
    .max(8)
    .safeParse(artifacts);
  if (!validated.success)
    return fail("Añade al menos una captura, documento o enlace válido.");
  for (const { bytes, artifact } of uploads) {
    const bucket = c.db.storage.from(DELIVERY_BUCKET);
    // A committed file rejects INSERT by design. Recover its verified contents on retry.
    let stored = await bucket.download(artifact.path);
    if (!stored.data) {
      await bucket.upload(artifact.path, bytes, {
        contentType: artifact.mime,
        upsert: false,
        cacheControl: "0",
      });
      // Another identical request may have won the upload. Verification still applies.
      stored = await bucket.download(artifact.path);
    }
    if (
      stored.error ||
      !stored.data ||
      !(await storedFileMatches(stored.data, {
        sha256: artifact.sha256,
        size: artifact.size,
        mime_type: artifact.mime,
      }))
    )
      return fail(
        "No se pudo verificar el archivo. La entrega no se registró.",
        503,
      );
  }
  const { data, error } = await c.db.rpc("submit_task_delivery", {
    p_org: c.orgId,
    p_task: p.task_id,
    p_title: p.title,
    p_summary: p.summary,
    p_artifacts: validated.data,
    p_request_key: p.request_key,
  });
  if (error) {
    const e = deliveryError(error.code);
    return fail(e.error, e.status, e);
  }
  return NextResponse.json({ id: data }, { status: 201, headers: noStore });
}
