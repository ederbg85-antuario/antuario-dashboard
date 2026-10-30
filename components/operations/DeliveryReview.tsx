"use client";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
const DeliveryPdf = lazy(() => import("./DeliveryPdf"));
import type { OpsData } from "@/lib/operations-types";
import {
  artifactUrl,
  deliveryDate,
  deliveryLabels,
  type DeliveryDetail,
  type DeliveryArtifact,
  type DeliveryStatus,
} from "@/lib/task-deliveries";

function DocumentPreview({
  artifact,
}: {
  artifact: Extract<DeliveryArtifact, { kind: "document" }>;
}) {
  return artifact.format === "markdown" ? (
    <article className="delivery-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) => (url.startsWith("https://") ? url : "")}
        components={{
          a: ({ children, href }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children} ↗
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ alt }) => (
            <span>[Imagen referenciada: {alt ?? "sin descripción"}]</span>
          ),
        }}
      >
        {artifact.text}
      </ReactMarkdown>
    </article>
  ) : (
    <pre className="delivery-plain-document">{artifact.text}</pre>
  );
}
export default function DeliveryReview({
  id,
  data,
  close,
  onVersion,
  onTask,
  onChange,
}: {
  id: string;
  data: OpsData;
  close: () => void;
  onVersion: (id: string) => void;
  onTask: (id: string) => void;
  onChange: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    textarea = useRef<HTMLTextAreaElement>(null),
    busyRef = useRef(false);
  const [detail, setDetail] = useState<DeliveryDetail | null>(null),
    [error, setError] = useState(""),
    [actionError, setActionError] = useState(""),
    [active, setActive] = useState(0),
    [body, setBody] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [historyBusy, setHistoryBusy] = useState(false);
  const attempt = useRef<{ key: string; signature: string } | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/operations/deliveries/${id}`, {
          cache: "no-store",
        }),
        result = await res.json();
      if (!res.ok)
        throw new Error(result.error ?? "No se pudo abrir la entrega.");
      setDetail(result);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir la entrega.");
    }
  }, [id]);
  useEffect(() => {
    dialog.current?.showModal();
    // This starts asynchronous I/O; state changes follow the awaited response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  async function respond(
    action: "comment" | Exclude<DeliveryStatus, "review">,
  ) {
    if (busyRef.current || !detail) return;
    if (action !== "approved" && !body.trim()) {
      setActionError("Escribe un comentario o explica qué debe cambiar.");
      textarea.current?.focus();
      return;
    }
    const signature = JSON.stringify({ id, action, body });
    if (attempt.current?.signature !== signature)
      attempt.current = { signature, key: crypto.randomUUID() };
    busyRef.current = true;
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      const res = await fetch("/api/operations/deliveries", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            delivery_id: id,
            action,
            body,
            expected_status: detail.delivery.status,
            request_key: attempt.current.key,
          }),
        }),
        result = await res.json();
      if (!res.ok)
        throw new Error(result.error ?? "No se pudo registrar tu respuesta.");
      setBody("");
      attempt.current = null;
      setNotice(
        action === "comment" ? "Comentario guardado." : "Decisión registrada.",
      );
      await load();
      onChange();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "No se pudo registrar tu respuesta.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function earlier() {
    if (!detail?.historyCursor || historyBusy) return;
    setHistoryBusy(true);
    setActionError("");
    try {
      const cursor = detail.historyCursor,
        res = await fetch(
          `/api/operations/deliveries/${id}?before=${encodeURIComponent(cursor.created_at)}&event_id=${cursor.id}`,
          { cache: "no-store" },
        ),
        result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setDetail((current) =>
        current
          ? {
              ...current,
              events: [
                ...current.events,
                ...result.events.filter(
                  (event: DeliveryDetail["events"][number]) =>
                    !current.events.some(
                      (existing) => existing.id === event.id,
                    ),
                ),
              ],
              historyCursor: result.historyCursor,
            }
          : current,
      );
    } catch {
      setActionError("No se pudo cargar el historial anterior. Reintenta.");
    } finally {
      setHistoryBusy(false);
    }
  }
  const d = detail?.delivery,
    task = data.tasks.find((t) => t.id === d?.task_id),
    a = d?.artifacts[active];
  const author = (actor: string) =>
    data.profiles.find((p) => p.id === actor)?.full_name ??
    data.team.find((m) => m.user_id === actor)?.name ??
    "Integrante";
  return (
    <dialog
      ref={dialog}
      className="delivery-dialog"
      aria-label="Revisar entrega"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <header className="delivery-dialog-heading">
        <div>
          <h2>{d?.title ?? "Abriendo entrega…"}</h2>
        </div>
        <button
          aria-label="Cerrar entrega"
          className="delivery-close"
          disabled={busy}
          onClick={close}
        >
          ×
        </button>
      </header>
      {error ? (
        <div className="delivery-empty" role="alert">
          <p>{error}</p>
          <button className="delivery-button" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      ) : !detail || !d ? (
        <div className="delivery-loading" role="status">
          Cargando…
        </div>
      ) : (
        <>
          <div className="delivery-version-bar">
            <span className={`delivery-status is-${d.status}`}>
              {deliveryLabels[d.status]}
            </span>
            <label>
              Versión{" "}
              <select
                aria-label="Versión de la entrega"
                value={id}
                disabled={busy}
                onChange={(e) => onVersion(e.target.value)}
              >
                {detail.versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.version}
                    {v.id === detail.versions[0].id ? " · vigente" : ""} ·{" "}
                    {deliveryLabels[v.status]}
                  </option>
                ))}
              </select>
            </label>
            <span>
              {author(d.submitted_by)} · {deliveryDate(d.submitted_at)} CDMX
            </span>
            <button
              className="delivery-text-button"
              onClick={() => onTask(d.task_id)}
            >
              Tarea ↗
            </button>
          </div>
          {!detail.isLatest && (
            <p className="delivery-version-notice">
              Versión anterior · sólo comentarios.
            </p>
          )}
          <div className="delivery-review-grid">
            <section
              className="delivery-evidence"
              aria-label="Archivos de la entrega"
            >
              {d.artifacts.length > 1 && (
                <nav className="delivery-file-tabs" aria-label="Elegir archivo">
                  {d.artifacts.map((file, i) => (
                    <button
                      key={i}
                      aria-pressed={i === active}
                      onClick={() => setActive(i)}
                      title={file.name}
                    >
                      <span aria-hidden="true">
                        {file.kind === "image"
                          ? "▧"
                          : file.kind === "link"
                            ? "↗"
                            : "▤"}
                      </span>
                      {file.name}
                    </button>
                  ))}
                </nav>
              )}
              {a && (
                <>
                  <div className="delivery-file-heading">
                    <strong>{a.name}</strong>
                    {a.kind === "link" ? (
                      <a href={a.url} target="_blank" rel="noopener noreferrer">
                        Abrir enlace ↗
                      </a>
                    ) : (
                      <a href={artifactUrl(id, active, true)} download>
                        Descargar ↓
                      </a>
                    )}
                  </div>
                  <div className={`delivery-preview is-${a.kind}`}>
                    {a.kind === "image" ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={artifactUrl(id, active)} alt={a.name} />
                        <a
                          href={artifactUrl(id, active)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Ampliar ↗
                        </a>
                      </>
                    ) : a.kind === "document" ? (
                      <DocumentPreview artifact={a} />
                    ) : a.kind === "pdf" ? (
                      <>
                        <Suspense
                          fallback={
                            <div className="delivery-loading">
                              Abriendo PDF…
                            </div>
                          }
                        >
                          <DeliveryPdf
                            key={artifactUrl(id, active)}
                            url={artifactUrl(id, active)}
                            name={a.name}
                          />
                        </Suspense>
                        <a
                          href={artifactUrl(id, active)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Abrir PDF ↗
                        </a>
                      </>
                    ) : a.kind === "link" ? (
                      <div className="delivery-link-preview">
                        <span aria-hidden="true">↗</span>
                        <h3>{a.name}</h3>
                        <p>{a.url}</p>
                        <a
                          className="delivery-button"
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Abrir ↗
                        </a>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </section>
            <aside className="delivery-decision">
              <details className="delivery-context">
                <summary>Detalles de la tarea</summary>
                <h3>{task?.title ?? "Tarea vinculada"}</h3>
                {d.summary && <p>{d.summary}</p>}
                <dl>
                  <div>
                    <dt>Responsable</dt>
                    <dd>
                      {data.team.find((m) => m.id === d.responsible_member_id)
                        ?.name ?? author(d.submitted_by)}
                    </dd>
                  </div>
                  <div>
                    <dt>Validador de tarea</dt>
                    <dd>
                      {data.team.find((m) => m.id === task?.validator_member_id)
                        ?.name ?? "Dirección"}
                    </dd>
                  </div>
                  <div>
                    <dt>Tarea</dt>
                    <dd>
                      {task?.status === "done"
                        ? "Terminada"
                        : task?.status === "review"
                          ? "En revisión"
                          : "En curso"}
                    </dd>
                  </div>
                </dl>
              </details>
              <section className="delivery-response">
                <h3>
                  {detail.canReview && detail.isLatest && d.status === "review"
                    ? "Tu revisión"
                    : "Comentarios"}
                </h3>
                <label htmlFor={`comment-${id}`}>Comentario</label>
                <textarea
                  ref={textarea}
                  id={`comment-${id}`}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Escribe tu comentario…"
                  maxLength={5000}
                  rows={3}
                  disabled={busy || !detail.canComment}
                />
                {detail.canReview &&
                  detail.isLatest &&
                  d.status === "review" && (
                    <div className="delivery-decision-buttons">
                      <button
                        className="delivery-button approve"
                        disabled={busy}
                        onClick={() => void respond("approved")}
                      >
                        ✓ Aprobar
                      </button>
                      <button
                        className="delivery-button secondary"
                        disabled={busy}
                        onClick={() => void respond("changes_requested")}
                      >
                        Pedir cambios
                      </button>
                      <button
                        className="delivery-text-button reject"
                        disabled={busy}
                        onClick={() => void respond("rejected")}
                      >
                        Rechazar
                      </button>
                    </div>
                  )}
                <button
                  className="delivery-button secondary delivery-comment-button"
                  disabled={busy || !detail.canComment || !body.trim()}
                  onClick={() => void respond("comment")}
                >
                  {busy ? "Guardando…" : "Comentar"}
                </button>
                {!detail.canReview && d.status === "review" && (
                  <p className="delivery-permission-note">
                    {detail.canComment
                      ? "Revisión pendiente del validador."
                      : "Acceso de lectura."}
                  </p>
                )}
                <p className="delivery-permission-note">
                  Aprobar no publica ni termina la tarea.
                </p>
                {actionError && (
                  <p role="alert" className="delivery-action-error">
                    {actionError}
                  </p>
                )}
                {notice && (
                  <p role="status" className="delivery-action-success">
                    {notice}
                  </p>
                )}
              </section>
            </aside>
          </div>
          <details className="delivery-history">
            <summary>
              Historial <span>{detail.events.length}</span>
            </summary>
            {detail.events.map((e) => (
              <article key={e.id}>
                <span
                  className={`delivery-history-dot is-${e.action}`}
                  aria-hidden="true"
                />
                <div>
                  <header>
                    <strong>{author(e.actor_id)}</strong>
                    <span>
                      {e.action === "submitted"
                        ? "Entregó una versión"
                        : e.action === "comment"
                          ? "Comentó"
                          : deliveryLabels[e.action]}
                    </span>
                    <small>
                      v
                      {detail.versions.find((v) => v.id === e.delivery_id)
                        ?.version ?? "—"}{" "}
                      · {deliveryDate(e.created_at)}
                    </small>
                  </header>
                  {e.body && <p>{e.body}</p>}
                </div>
              </article>
            ))}
            {detail.historyCursor && (
              <button
                className="delivery-text-button"
                onClick={() => void earlier()}
                disabled={historyBusy}
              >
                {historyBusy ? "Cargando…" : "Ver anteriores"}
              </button>
            )}
          </details>
        </>
      )}
    </dialog>
  );
}
