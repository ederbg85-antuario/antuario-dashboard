"use client";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { OpsData } from "@/lib/operations-types";
import {
  artifactUrl,
  deliveryDate,
  deliveryLabels,
  type Delivery,
  type DeliveryStatus,
} from "@/lib/task-deliveries";
import "./deliveries.css";
const DeliveryReview = lazy(() => import("./DeliveryReview"));
const DeliverySubmission = lazy(() => import("./DeliverySubmission"));

type Inbox = {
  deliveries: Delivery[];
  total: number;
  page: number;
  counts: Record<DeliveryStatus, number>;
};
const filters = [
  ["review", "Por revisar"],
  ["approved", "Aprobadas"],
  ["changes_requested", "Cambios"],
  ["all", "Todas"],
  ["done", "Terminadas"],
  ["activity", "Actualizaciones"],
] as const;
function Preview({ delivery }: { delivery: Delivery }) {
  const [failed, setFailed] = useState(false),
    index = delivery.artifacts.findIndex((a) => a.kind === "image"),
    artifact = delivery.artifacts[index];
  return index >= 0 && !failed ? (
    <div className="delivery-thumb">
      {/* Private authenticated images must bypass the Next image proxy. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={artifactUrl(delivery.id, index)}
        alt={artifact.name}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </div>
  ) : (
    <div
      className={`delivery-thumb delivery-document-thumb ${delivery.artifacts.some((a) => a.kind === "link") ? "is-link" : ""}`}
      aria-hidden="true"
    >
      <span>
        {delivery.artifacts.some((a) => a.kind === "link") ? "↗" : "Aa"}
      </span>
      <i />
      <i />
      <i />
      <small>
        {delivery.artifacts.some((a) => a.kind === "link")
          ? "ENLACE"
          : "DOCUMENTO"}
      </small>
    </div>
  );
}
export default function DeliveryCenter({
  data,
  onTask,
}: {
  data: OpsData;
  onTask: (id: string) => void;
}) {
  const router = useRouter(),
    query = useSearchParams(),
    deliveryId = query.get("delivery");
  const [filter, setFilter] = useState<string>("review"),
    [expanded, setExpanded] = useState(false),
    [page, setPage] = useState(0);
  const [inbox, setInbox] = useState<Inbox | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [creating, setCreating] = useState(false);
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++request.current,
      status = ["done", "activity"].includes(filter) ? "all" : filter;
    try {
      const res = await fetch(
          `/api/operations/deliveries?status=${status}&page=${page}`,
          { cache: "no-store" },
        ),
        result = await res.json();
      if (seq !== request.current) return;
      if (!res.ok)
        throw new Error(result.error ?? "No se pudieron cargar las entregas.");
      setInbox(result);
      setError("");
    } catch (e) {
      if (seq === request.current)
        setError(
          e instanceof Error
            ? e.message
            : "No se pudieron cargar las entregas.",
        );
    } finally {
      if (seq === request.current) setLoading(false);
    }
  }, [filter, page]);
  useEffect(() => {
    // State updates happen after network I/O, never synchronously on effect entry.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const update = () => {
        if (!document.hidden) void refresh();
      },
      timer = setInterval(update, 30000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, [refresh]);
  function open(id: string | null) {
    const next = new URLSearchParams(query.toString());
    next.delete("task");
    if (id) next.set("delivery", id);
    else next.delete("delivery");
    if (id && !deliveryId) window.history.pushState({...window.history.state, antuarioDelivery: true}, "", "?" + next.toString());
    else if (!id && window.history.state?.antuarioDelivery) window.history.back();
    else window.history.replaceState(window.history.state, "", "?" + next.toString());
  }
  function select(value: string) {
    setFilter(value);
    setPage(0);
    setExpanded(true);
    setLoading(true);
  }
  function changed() {
    void refresh();
    router.refresh();
  }
  const taskMap = new Map(data.tasks.map((t) => [t.id, t])),
    person = (d: Delivery) =>
      data.team.find((m) => m.id === d.responsible_member_id)?.name ??
      data.profiles.find((p) => p.id === d.submitted_by)?.full_name ??
      "Integrante";
  const client = (taskId: string) =>
    data.clients.find(
      (c) =>
        c.id ===
        data.projects.find((p) => p.id === taskMap.get(taskId)?.project_id)
          ?.client_id,
    )?.name ?? "Antuario interno";
  const items = inbox?.deliveries ?? [],
    shown = expanded ? items : items.slice(0, 3),
    done = data.tasks
      .filter((t) => t.status === "done")
      .sort((a, b) =>
        (b.completed_at ?? b.updated_at ?? "").localeCompare(
          a.completed_at ?? a.updated_at ?? "",
        ),
      );
  const comments = [...data.comments]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 12);
  return (
    <section
      className={`delivery-center ${expanded ? "is-expanded" : ""}`}
      aria-label="Centro de entregas y revisión"
    >
      <header className="delivery-heading">
        <div>
          <h2>
            Entregas{" "}
            <span className="delivery-number">
              {inbox?.counts.review ?? "—"}
            </span>
          </h2>
        </div>
        <div className="delivery-heading-actions">
          {data.capabilities.productionWrite && (
            <button
              className="delivery-button secondary"
              onClick={() => setCreating(true)}
            >
              ＋ Entregar
            </button>
          )}
          <button
            className="delivery-button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? "Contraer" : "Ver todas"}{" "}
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </header>
      <nav className="delivery-filters" aria-label="Filtrar entregas">
        {filters.map(([key, label]) => (
          <button
            key={key}
            aria-pressed={filter === key}
            onClick={() => select(key)}
          >
            {label}
            {key === "review" && inbox && <b>{inbox.counts.review}</b>}
            {key === "approved" && inbox && <b>{inbox.counts.approved}</b>}
            {key === "changes_requested" &&
              inbox &&
              inbox.counts.changes_requested > 0 && (
                <b>{inbox.counts.changes_requested}</b>
              )}
          </button>
        ))}
      </nav>
      {error && !["done", "activity"].includes(filter) ? (
        <div className="delivery-empty" role="alert">
          <strong>Las entregas no están disponibles todavía</strong>
          <p>{error}</p>
          <button
            className="delivery-button secondary"
            onClick={() => void refresh()}
          >
            Volver a intentar
          </button>
        </div>
      ) : loading && !["done", "activity"].includes(filter) ? (
        <div className="delivery-loading" role="status">
          Cargando entregas y versiones…
        </div>
      ) : filter === "done" ? (
        <div className="delivery-task-feed">
          {(expanded ? done : done.slice(0, 3)).map((t) => (
            <button key={t.id} onClick={() => onTask(t.id)}>
              <span className="delivery-feed-symbol is-approved">✓</span>
              <span>
                <strong>{t.title}</strong>
                <small>
                  {client(t.id)}
                  {t.completed_at ? " · " + deliveryDate(t.completed_at) : ""}
                </small>
              </span>
              <span>Abrir ↗</span>
            </button>
          ))}
          {!done.length && (
            <p className="delivery-empty">Todavía no hay tareas terminadas.</p>
          )}
        </div>
      ) : filter === "activity" ? (
        <div className="delivery-task-feed">
          {comments.map((c) => (
            <button key={c.id} onClick={() => onTask(c.task_id)}>
              <span className="delivery-feed-symbol">↗</span>
              <span>
                <strong>
                  {taskMap.get(c.task_id)?.title ?? "Actualización de tarea"}
                </strong>
                <p>{c.body}</p>
                <small>
                  {data.profiles.find((p) => p.id === c.author_id)?.full_name ??
                    "Integrante"}{" "}
                  · {deliveryDate(c.created_at)}
                </small>
              </span>
            </button>
          ))}
          {!comments.length && (
            <p className="delivery-empty">
              Sin actualizaciones en este espacio.
            </p>
          )}
        </div>
      ) : shown.length ? (
        <>
          <div className="delivery-cards">
            {shown.map((d) => (
              <button
                key={d.id}
                className="delivery-card"
                onClick={() => open(d.id)}
                aria-label={`Revisar ${d.title}, versión ${d.version}, ${deliveryLabels[d.status]}`}
              >
                <Preview delivery={d} />
                <div className="delivery-card-copy">
                  <div className="delivery-card-meta">
                    <span className={`delivery-status is-${d.status}`}>
                      {deliveryLabels[d.status]}
                    </span>
                    <small>v{d.version}</small>
                  </div>
                  <strong>{d.title}</strong>
                  <p>
                    {client(d.task_id)} · {person(d)}
                  </p>
                  <footer>
                    <span>
                      <span
                        aria-label={`${d.artifacts.length} archivos o enlaces`}
                      >
                        {d.artifacts.length} archivos
                      </span>
                    </span>
                    <span aria-hidden="true">↗</span>
                  </footer>
                </div>
              </button>
            ))}
          </div>
          {expanded && inbox && inbox.total > 12 && (
            <div className="delivery-pagination">
              <button
                className="delivery-button secondary"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </button>
              <span>
                {page * 12 + 1}–{Math.min((page + 1) * 12, inbox.total)} de{" "}
                {inbox.total}
              </span>
              <button
                className="delivery-button secondary"
                disabled={(page + 1) * 12 >= inbox.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </button>
            </div>
          )}
          {!expanded && inbox && inbox.total > 3 && (
            <button className="delivery-more" onClick={() => setExpanded(true)}>
              Ver {inbox.total} entregas →
            </button>
          )}
        </>
      ) : (
        <div className="delivery-empty">
          <span className="delivery-empty-icon" aria-hidden="true">
            ✓
          </span>
          <div>
            <strong>
              {filter === "review"
                ? "Todo al día en esta bandeja"
                : "Sin entregas en este filtro"}
            </strong>
          </div>
        </div>
      )}

      <Suspense
        fallback={
          <div role="status" className="delivery-loading">
            Abriendo…
          </div>
        }
      >
        {deliveryId && (
          <DeliveryReview
            key={deliveryId}
            id={deliveryId}
            data={data}
            close={() => open(null)}
            onVersion={open}
            onTask={onTask}
            onChange={changed}
          />
        )}
        {creating && (
          <DeliverySubmission
            data={data}
            close={() => setCreating(false)}
            onCreated={(id) => {
              setCreating(false);
              changed();
              open(id);
            }}
          />
        )}
      </Suspense>
    </section>
  );
}
