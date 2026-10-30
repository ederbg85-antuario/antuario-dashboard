import { z } from "zod";
import type { OpsData, Task } from "./operations-types";

export const DELIVERY_BUCKET = "task-deliveries";
export const MAX_DELIVERY_BYTES = 4 * 1024 * 1024;
const name = z.string().trim().min(1).max(180);
export const deliveryArtifactSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("document"),
      name,
      text: z
        .string()
        .min(1)
        .max(64000)
        .refine((v) => v.trim().length > 0),
      format: z.enum(["markdown", "text", "csv"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("link"),
      name,
      url: z
        .url()
        .max(2000)
        .refine((v) => v.startsWith("https://"), "Usa HTTPS"),
    })
    .strict(),
  z
    .object({
      kind: z.enum(["image", "pdf"]),
      name,
      path: z.string().max(400),
      mime: z.enum([
        "image/png",
        "image/jpeg",
        "image/webp",
        "application/pdf",
      ]),
      size: z.number().int().min(1).max(MAX_DELIVERY_BYTES),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
]);
export type DeliveryArtifact = z.infer<typeof deliveryArtifactSchema>;
export type DeliveryStatus =
  | "review"
  | "approved"
  | "changes_requested"
  | "rejected";
export type Delivery = {
  id: string;
  task_id: string;
  version: number;
  title: string;
  summary: string;
  artifacts: DeliveryArtifact[];
  submitted_by: string;
  responsible_member_id: string | null;
  responsible_user_id: string | null;
  submitted_at: string;
  status: DeliveryStatus;
  decided_at: string | null;
};
export type DeliveryEvent = {
  id: string;
  delivery_id: string;
  task_id: string;
  actor_id: string;
  action: "submitted" | "comment" | Exclude<DeliveryStatus, "review">;
  body: string;
  created_at: string;
};
export type DeliveryDetail = {
  delivery: Delivery;
  versions: Pick<
    Delivery,
    "id" | "version" | "status" | "submitted_at" | "title"
  >[];
  events: DeliveryEvent[];
  historyCursor: { created_at: string; id: string } | null;
  canComment: boolean;
  canReview: boolean;
  isLatest: boolean;
};
export const deliveryLabels: Record<DeliveryStatus, string> = {
  review: "Por revisar",
  approved: "Aprobado",
  changes_requested: "Cambios pedidos",
  rejected: "Rechazado",
};
export const deliveryResponseSchema = z
  .object({
    delivery_id: z.uuid(),
    action: z.enum(["comment", "approved", "changes_requested", "rejected"]),
    body: z.string().trim().max(5000),
    expected_status: z.enum([
      "review",
      "approved",
      "changes_requested",
      "rejected",
    ]),
    request_key: z.uuid(),
  })
  .strict()
  .refine((v) => v.action === "approved" || v.body.length > 0, {
    message: "Escribe un comentario o motivo",
    path: ["body"],
  });
export function canReviewDelivery(
  data: Pick<OpsData, "role" | "userId" | "team">,
  task: Task,
  delivery: Pick<Delivery, "submitted_by" | "responsible_user_id">,
  canWrite: boolean,
) {
  if (
    !canWrite ||
    delivery.submitted_by === data.userId ||
    delivery.responsible_user_id === data.userId
  )
    return false;
  return (
    data.role === "owner" ||
    data.team.some(
      (m) =>
        m.id === task.validator_member_id &&
        m.user_id === data.userId &&
        m.status === "active",
    )
  );
}
export function artifactUrl(
  deliveryId: string,
  index: number,
  download = false,
) {
  return `/api/operations/deliveries/${encodeURIComponent(deliveryId)}/assets/${index}${download ? "?download=1" : ""}`;
}
export function deliveryDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  }).format(new Date(value));
}
export function documentFormat(
  filename: string,
): "markdown" | "text" | "csv" | null {
  return /\.md$/i.test(filename)
    ? "markdown"
    : /\.csv$/i.test(filename)
      ? "csv"
      : /\.(txt|xml)$/i.test(filename)
        ? "text"
        : null;
}
export function deliveryFilename(value: string) {
  return (
    value
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(-120)
      .replace(/^[.]+/, "archivo_") || "archivo"
  );
}
