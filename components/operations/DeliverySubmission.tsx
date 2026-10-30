"use client";
import { useEffect, useRef, useState } from "react";
import type { OpsData } from "@/lib/operations-types";
export default function DeliverySubmission({
  data,
  close,
  onCreated,
  taskId,
}: {
  data: Pick<OpsData,"tasks">;
  taskId?: string;
  close: () => void;
  onCreated: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    key = useRef(""),
    busyRef = useRef(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [files, setFiles] = useState<string[]>([]);
  useEffect(() => {
    key.current = crypto.randomUUID();
    dialog.current?.showModal();
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busyRef.current) return;
    const form = new FormData(e.currentTarget);
    form.set("request_key", key.current);
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/operations/deliveries", {
          method: "POST",
          body: form,
        }),
        result = await res.json();
      if (!res.ok)
        throw new Error(result.error ?? "No se pudo entregar el trabajo.");
      onCreated(result.id);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo entregar el trabajo.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="delivery-dialog delivery-submission"
      aria-label="Entregar trabajo"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <header className="delivery-dialog-heading">
        <div>
          <h2>Entregar trabajo</h2>
        </div>
        <button
          className="delivery-close"
          aria-label="Cerrar formulario de entrega"
          disabled={busy}
          onClick={close}
        >
          ×
        </button>
      </header>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <label>
            Tarea
            <select name="task_id" required defaultValue={taskId ?? ""}>
              <option value="" disabled>
                Selecciona una tarea
              </option>
              {data.tasks
                .filter((t) => t.status !== "done")
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Título
            <input
              name="title"
              required
              maxLength={180}
              placeholder="Qué dejas listo para revisar"
            />
          </label>
          <label>
            Resumen opcional
            <textarea
              name="summary"
              maxLength={2000}
              rows={2}
              placeholder="Un resumen breve para quien revisa"
            />
          </label>
          <label className="delivery-upload">
            <strong>Capturas y documentos</strong>
            <span>
              PNG, JPG, WebP, PDF, XML, Markdown, TXT o CSV · hasta 8 archivos · 4 MB
              en total
            </span>
            <input
              type="file"
              name="files"
              multiple
              accept=".png,.jpg,.jpeg,.webp,.pdf,.xml,.md,.txt,.csv"
              onChange={(e) =>
                setFiles(Array.from(e.target.files ?? []).map((f) => f.name))
              }
            />
            <small>XML en UTF-8 · hasta 64 000 caracteres · descarga original</small>
            {files.length > 0 && <small>{files.join(" · ")}</small>}
          </label>
          <details className="delivery-extra">
            <summary>Documento o enlace</summary>
            <label>
              Documento
              <textarea
                name="document"
                maxLength={64000}
                rows={8}
                placeholder="Puedes pegar el documento completo en Markdown."
              />
            </label>
            <label>
              Enlace HTTPS
              <input type="url" name="link" placeholder="https://…" />
            </label>
          </details>
        </fieldset>
        {error && (
          <p className="delivery-action-error" role="alert">
            {error}
          </p>
        )}
        <footer className="delivery-submit-footer">
          <p>Guarda una versión para revisión.</p>
          <button className="delivery-button" disabled={busy}>
            {busy ? "Verificando y guardando…" : "Entregar →"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
