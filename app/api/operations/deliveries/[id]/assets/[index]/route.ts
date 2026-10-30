import { NextResponse } from "next/server";
import { z } from "zod";
import { workspace } from "@/lib/workspace";
import { deliveryTaskContext } from "@/lib/task-delivery-access";
import {
  DELIVERY_BUCKET,
  deliveryArtifactSchema,
  deliveryFilename,
} from "@/lib/task-deliveries";
import { storedFileMatches } from "@/lib/client-accounts-access";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; index: string }> },
) {
  const { id, index } = await params;
  if (!z.uuid().safeParse(id).success || !/^\d$/.test(index))
    return new NextResponse(null, { status: 404 });
  const c = await workspace();
  if (!c) return new NextResponse(null, { status: 401 });
  const { data, error } = await c.db
    .from("task_deliveries")
    .select("task_id,artifacts")
    .eq("organization_id", c.orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) return new NextResponse(null, { status: 503 });
  if (!data) return new NextResponse(null, { status: 404 });
  const context = await deliveryTaskContext(data.task_id);
  if ("error" in context)
    return new NextResponse(null, { status: context.status });
  const parsed = deliveryArtifactSchema.safeParse(
    data.artifacts[Number(index)],
  );
  if (!parsed.success) return new NextResponse(null, { status: 404 });
  const a = parsed.data;
  if (a.kind === "link") return new NextResponse(null, { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${deliveryFilename(a.name)}"; filename*=UTF-8''${encodeURIComponent(a.name)}`,
  };
  if (a.kind === "document")
    return new Response(a.text, {
      headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
    });
  const { data: file, error: fileError } = await c.db.storage
    .from(DELIVERY_BUCKET)
    .download(a.path);
  if (
    fileError ||
    !file ||
    !(await storedFileMatches(file, {
      sha256: a.sha256,
      size: a.size,
      mime_type: a.mime,
    }))
  )
    return NextResponse.json(
      { error: "No se pudo verificar este archivo." },
      { status: 503 },
    );
  return new Response(await file.arrayBuffer(), {
    headers: { ...headers, "Content-Type": a.mime },
  });
}
