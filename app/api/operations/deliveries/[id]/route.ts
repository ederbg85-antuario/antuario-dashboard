import { NextResponse } from "next/server";
import { z } from "zod";
import { workspace } from "@/lib/workspace";
import { deliveryError, deliveryTaskContext } from "@/lib/task-delivery-access";
import {
  canReviewDelivery,
  type Delivery,
  type DeliveryDetail,
  type DeliveryEvent,
} from "@/lib/task-deliveries";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return NextResponse.json(
      { error: "Entrega no disponible." },
      { status: 404 },
    );
  const c = await workspace();
  if (!c)
    return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  const { data: delivery, error } = await c.db
    .from("task_deliveries")
    .select("*")
    .eq("organization_id", c.orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    const e = deliveryError(error.code);
    return NextResponse.json(e, { status: e.status });
  }
  if (!delivery)
    return NextResponse.json(
      { error: "Entrega no disponible." },
      { status: 404 },
    );
  const context = await deliveryTaskContext(delivery.task_id);
  if ("error" in context)
    return NextResponse.json(context, { status: context.status });
  const url = new URL(request.url),
    before = url.searchParams.get("before"),
    eventId = url.searchParams.get("event_id");
  if (
    (before || eventId) &&
    (!before ||
      !z.iso.datetime({ offset: true }).safeParse(before).success ||
      !z.uuid().safeParse(eventId).success)
  )
    return NextResponse.json({ error: "Cursor inválido." }, { status: 400 });
  let history = c.db
    .from("task_delivery_events")
    .select("*")
    .eq("organization_id", c.orgId)
    .eq("task_id", delivery.task_id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(101);
  if (before && eventId)
    history = history.or(
      `created_at.lt.${before},and(created_at.eq.${before},id.lt.${eventId})`,
    );
  async function readVersions() {
    const rows: DeliveryDetail["versions"] = [];
    let cursor: number | null = null;
    while (true) {
      let query = c!.db
        .from("task_deliveries")
        .select("id,version,status,submitted_at,title")
        .eq("organization_id", c!.orgId)
        .eq("task_id", delivery.task_id)
        .order("version", { ascending: false })
        .limit(500);
      if (cursor !== null) query = query.lt("version", cursor);
      const result = await query;
      if (result.error) throw result.error;
      const page = result.data as DeliveryDetail["versions"];
      rows.push(...page);
      if (page.length < 500) return rows;
      cursor = page[page.length - 1].version;
    }
  }
  let versions: DeliveryDetail["versions"] = [],
    events: DeliveryEvent[] = [];
  try {
    const [v, e] = await Promise.all([
      before ? Promise.resolve([]) : readVersions(),
      history,
    ]);
    if (e.error) throw e.error;
    versions = v;
    events = e.data as DeliveryEvent[];
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer el historial." },
      { status: 503 },
    );
  }
  const more = events.length > 100;
  events = events.slice(0, 100);
  const last = events.at(-1),
    historyCursor =
      more && last
        ? { created_at: new Date(last.created_at).toISOString(), id: last.id }
        : null;
  if (before)
    return NextResponse.json(
      { events, historyCursor },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  return NextResponse.json(
    {
      delivery: delivery as Delivery,
      versions,
      events,
      historyCursor,
      isLatest: versions[0]?.id === id,
      canComment: context.canWrite,
      canReview: canReviewDelivery(
        { role: c.role, userId: c.user.id, team: c.seat ? [c.seat] : [] },
        context.task,
        delivery,
        context.canWrite,
      ),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
