"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

/** Render pixels/text only. Embedded PDF scripts, forms and remote actions are never executed. */
export default function DeliveryPdf({
  url,
  name,
  preview = false,
}: {
  url: string;
  name: string;
  preview?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    container = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(1),
    [width, setWidth] = useState(650),
    [zoom, setZoom] = useState(1),
    [error, setError] = useState(""),
    [text, setText] = useState(""),
    [rendered, setRendered] = useState(0);
  useEffect(() => {
    let cancelled = false,
      task:
        | ReturnType<(typeof import("pdfjs-dist"))["getDocument"]>
        | undefined;
    void import("pdfjs-dist")
      .then(async (library) => {
        if (cancelled) return;
        const base = `/vendor/pdfjs/${library.version}/`;
        library.GlobalWorkerOptions.workerSrc = base + "pdf.worker.min.mjs";
        task = library.getDocument({
          url,
          withCredentials: true,
          cMapUrl: base + "cmaps/",
          cMapPacked: true,
          standardFontDataUrl: base + "standard_fonts/",
          wasmUrl: base + "wasm/",
          iccUrl: base + "iccs/",
          useWorkerFetch: false,
          disableAutoFetch: true,
        });
        const loaded = await task.promise;
        if (!cancelled) setPdf(loaded);
      })
      .catch(() => {
        if (!cancelled)
          setError("No se pudo abrir este PDF. Puedes descargarlo.");
      });
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [url]);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(200, entries[0].contentRect.width - 28)),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false,
      render: RenderTask | undefined;
    void pdf
      .getPage(page)
      .then(async (documentPage) => {
        if (cancelled || !canvas.current) return;
        const unit = documentPage.getViewport({ scale: 1 }),
          cssScale = (width * zoom) / unit.width,
          density = Math.min(window.devicePixelRatio || 1, 2),
          scale = Math.min(
            cssScale * density,
            Math.sqrt(8000000 / (unit.width * unit.height)),
          ),
          viewport = documentPage.getViewport({ scale });
        const target = canvas.current,
          context = target.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        target.width = Math.ceil(viewport.width);
        target.height = Math.ceil(viewport.height);
        target.style.width = `${unit.width * cssScale}px`;
        target.style.height = `${unit.height * cssScale}px`;
        render = documentPage.render({
          canvas: target,
          canvasContext: context,
          viewport,
        });
        await render.promise;
        if (cancelled) return;
        setRendered(page);
        if (preview) return;
        const content = await documentPage.getTextContent();
        if (!cancelled)
          setText(
            content.items
              .map((item) => ("str" in item ? item.str : ""))
              .join(" "),
          );
      })
      .catch((e) => {
        if (!cancelled && e?.name !== "RenderingCancelledException")
          setError("No se pudo mostrar esta página. Descarga el original.");
      });
    return () => {
      cancelled = true;
      render?.cancel();
    };
  }, [pdf, page, width, zoom, preview]);
  if(preview)return <div className="delivery-pdf is-preview" ref={container}>
    {error?<div className="delivery-file-cover"><strong>PDF</strong><span>{name}</span><small>Vista no disponible · original en la entrega</small></div>:<div className="delivery-pdf-page" aria-busy={rendered!==1}><canvas ref={canvas} role="img" aria-label={`${name}, primera página`} hidden={!pdf}/>{rendered!==1&&<span className="delivery-cover-loading">Cargando PDF…</span>}<small className="delivery-cover-caption">Primera página · PDF</small></div>}
  </div>
  return (
    <div className="delivery-pdf" ref={container}>
      {error ? (
        <p role="alert" className="delivery-action-error">
          {error}
        </p>
      ) : (
        <>
          <nav className="delivery-pdf-controls" aria-label="Controles del PDF">
            <div>
              <button
                aria-label="Página anterior del PDF"
                disabled={!pdf || page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ‹
              </button>
              <span aria-live="polite">
                {pdf ? `${page} / ${pdf.numPages}` : "Cargando…"}
              </span>
              <button
                aria-label="Página siguiente del PDF"
                disabled={!pdf || page === pdf.numPages}
                onClick={() => setPage((p) => p + 1)}
              >
                ›
              </button>
            </div>
            <div>
              <button
                aria-label="Reducir PDF"
                disabled={zoom <= 1}
                onClick={() => setZoom((z) => z - 0.25)}
              >
                −
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button
                aria-label="Ampliar PDF"
                disabled={zoom >= 2.5}
                onClick={() => setZoom((z) => z + 0.25)}
              >
                ＋
              </button>
            </div>
          </nav>
          <div className="delivery-pdf-page" aria-busy={rendered !== page}>
            <canvas
              ref={canvas}
              role="img"
              aria-label={`${name}, página ${page}`}
              hidden={!pdf}
            />
          </div>
          {text && (
            <details className="delivery-pdf-text">
              <summary>Texto de la página</summary>
              <p>{text}</p>
            </details>
          )}
        </>
      )}
    </div>
  );
}
