"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { CaseEvidence } from "./case-detail-types";

export function EvidenceViewer({
  evidence,
  compact = false,
  title = "What the citizen submitted",
  subtitle = "Accepted evidence",
}: {
  evidence: readonly CaseEvidence[];
  compact?: boolean;
  title?: string;
  subtitle?: string;
}) {
  const [selectedEvidence, setSelectedEvidence] = useState<CaseEvidence | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!selectedEvidence) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedEvidence(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedEvidence]);

  return (
    <>
      <section className="min-w-0 overflow-hidden rounded-[10px] border border-line bg-surface" aria-labelledby="evidence-title">
        <div className={`flex items-end justify-between border-b border-line ${compact ? "min-h-14 gap-3 px-4 py-3" : "min-h-[72px] gap-5 p-4 sm:px-5 sm:py-4"}`}>
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-graphite">{subtitle}</p>
            <h2 className={`${compact ? "text-base" : "text-xl"} font-semibold tracking-[-0.015em] text-ink`} id="evidence-title">{title}</h2>
          </div>
          <span className="font-display text-xs text-graphite">{evidence.length} {evidence.length === 1 ? "item" : "items"}</span>
        </div>
        <div className={`${compact && evidence.length > 1 ? "grid-cols-2" : "grid-cols-1"} grid max-h-[320px] gap-px overflow-y-auto bg-line`}>
          {evidence.map((item) => (
            <figure id={`evidence-${item.attachmentId}`} className="m-0 bg-surface" key={item.attachmentId}>
              {item.url && item.mediaType.startsWith("image/") ? (
                <button
                  type="button"
                  className="group relative block w-full bg-transparent text-left focus-visible:outline-3 focus-visible:outline-offset-[-3px]"
                  onClick={() => setSelectedEvidence(item)}
                  aria-label="Open accepted photo"
                >
                  <span className={`relative block bg-fog ${compact ? "aspect-[16/9]" : "aspect-[4/3]"}`}>
                    <Image className="object-cover" src={item.url} alt="Accepted photo of the reported civic issue" fill sizes={compact ? "(max-width: 1439px) 100vw, 400px" : "(max-width: 680px) 100vw, 760px"} unoptimized />
                  </span>
                  <span className="absolute bottom-3 right-3 translate-y-1 rounded-md bg-ink px-2.5 py-1.5 text-[11px] font-semibold text-white opacity-0 shadow-panel transition-[opacity,transform] group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 motion-reduce:transition-none">View full image</span>
                </button>
              ) : item.url && item.mediaType.startsWith("video/") ? (
                <div className="aspect-video bg-black">
                  <video
                    className="h-full w-full object-contain"
                    src={item.url}
                    controls
                    preload="metadata"
                    playsInline
                    aria-label="Accepted video of the reported civic issue"
                  />
                </div>
              ) : (
                <div className="grid min-h-[220px] content-center justify-items-center bg-fog p-6 text-center sm:min-h-[280px]">
                  <p className="font-semibold">{item.mediaType.startsWith("video/") ? "Video unavailable" : "Image unavailable"}</p>
                  <span className="mt-2 max-w-[38ch] text-[13px] text-muted">{item.storageId ? "The Convex Storage object could not be resolved." : "This older report only has a local storage key."}</span>
                </div>
              )}
              <figcaption className={`flex justify-between gap-4 px-4 text-[11px] text-muted ${compact ? "py-2" : "py-3"}`}>
                <span>{item.mediaType.startsWith("video/") ? "Accepted video" : "Accepted photo"}</span>
                <span>{item.mediaType}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {selectedEvidence?.url ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/90 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Accepted evidence preview"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedEvidence(null);
            }
          }}
        >
          <div className="grid h-full max-h-[92dvh] w-full max-w-6xl grid-rows-[auto_minmax(0,1fr)] gap-3">
            <button ref={closeButtonRef} type="button" className="justify-self-end rounded-md bg-surface px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-fog active:scale-[0.98]" onClick={() => setSelectedEvidence(null)}>
              Close preview
            </button>
            <div className="relative min-h-0 overflow-hidden rounded-lg bg-black/20">
              <Image className="object-contain" src={selectedEvidence.url} alt="Accepted photo of the reported civic issue" fill sizes="100vw" priority unoptimized />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
