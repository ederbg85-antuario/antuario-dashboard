import "server-only";
import { workspace } from "./workspace";
import type { Task } from "./operations-types";

export async function deliveryTaskContext(taskId: string) {
  const c = await workspace();
  if (!c) return { error: "Inicia sesión.", status: 401 } as const;
  const result = await c.db
    .from("tasks")
    .select("*")
    .eq("organization_id", c.orgId)
    .eq("id", taskId)
    .maybeSingle();
  if (result.error)
    return { error: "No se pudo consultar la tarea.", status: 503 } as const;
  const task = result.data as Task | null;
  if (!task) return { error: "Tarea no disponible.", status: 404 } as const;
  const { data: project, error } = await c.db
    .from("projects")
    .select("client_id")
    .eq("organization_id", c.orgId)
    .eq("id", task.project_id)
    .maybeSingle();
  if (error)
    return { error: "No se pudo comprobar el acceso.", status: 503 } as const;
  if (!project || !c.can("production", false, project.client_id))
    return { error: "Tarea no disponible.", status: 404 } as const;
  return {
    c,
    task,
    canWrite: c.can("production", true, project.client_id),
  } as const;
}
export function deliveryError(code?: string) {
  if (["42P01", "42883", "PGRST202", "PGRST205"].includes(code ?? ""))
    return {
      error:
        "El centro de entregas está preparado; falta habilitar su almacenamiento.",
      status: 503,
      schemaReady: false,
    };
  if (code === "42501")
    return {
      error:
        "No tienes permiso para esta acción o estás revisando tu propia entrega.",
      status: 403,
    };
  if (["40001", "23505", "55000"].includes(code ?? ""))
    return {
      error:
        "La entrega o la tarea cambió. Recarga y revisa la versión vigente.",
      status: 409,
    };
  return {
    error:
      "No se pudo guardar. Revisa los datos y vuelve a intentar con la misma referencia.",
    status: 400,
  };
}
/** Bound multipart and JSON bodies even when Content-Length is absent. */
export async function boundedRequest(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("empty");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error("large");
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: bytes,
  });
}
