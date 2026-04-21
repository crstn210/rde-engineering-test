"use client";

import { useEffect, useState, useCallback } from "react";

// Client-side gallery — keyboard arrows + click thumbs + swipe on mobile.
// Preloads adjacent images so navigation never stalls. Documented tradeoff
// in SUBMISSION.md: full scrubbable-hero (horizontal-drag-across-photos)
// is bonus in the spec — this delivers the core "smooth step-through
// without stalls" experience without burning the gesture budget.
export default function ListingGallery({
  images,
  floorplan,
  alt,
}: {
  images: string[];
  floorplan?: string;
  alt: string;
}) {
  const all = floorplan ? [...images, floorplan] : images;
  const [idx, setIdx] = useState(0);

  const go = useCallback(
    (delta: number) => {
      setIdx((i) => {
        const next = i + delta;
        if (next < 0) return all.length - 1;
        if (next >= all.length) return 0;
        return next;
      });
    },
    [all.length]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  // Touch swipe
  const [touchStart, setTouchStart] = useState<number | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    setTouchStart(e.touches[0].clientX);
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStart == null) return;
    const dx = e.changedTouches[0].clientX - touchStart;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    setTouchStart(null);
  }

  const isFloorplan = floorplan && idx === all.length - 1;

  return (
    <div className="w-full">
      <div
        className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-line bg-bg-sunken select-none"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Render all images stacked; toggle visibility so they're preloaded.
            Avoids network stall when stepping. */}
        {all.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src + i}
            src={src}
            alt={`${alt} — view ${i + 1}`}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
              i === idx ? "opacity-100" : "opacity-0"
            }`}
          />
        ))}

        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous photo"
          className="absolute left-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-bg/90 text-ink shadow-sm hover:bg-bg backdrop-blur transition-colors"
        >
          ←
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next photo"
          className="absolute right-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-bg/90 text-ink shadow-sm hover:bg-bg backdrop-blur transition-colors"
        >
          →
        </button>

        <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-bg/90 px-3 py-1 text-xs text-ink-soft backdrop-blur">
          <span className="tabular-nums">
            {idx + 1} / {all.length}
          </span>
          {isFloorplan && (
            <>
              <span className="text-ink-faint">·</span>
              <span className="uppercase tracking-wider text-[11px]">Floor plan</span>
            </>
          )}
        </div>

        <div className="absolute bottom-3 right-3 text-[11px] uppercase tracking-wider text-ink-soft bg-bg/90 px-2.5 py-1 rounded-full backdrop-blur hidden sm:block">
          ← → to navigate
        </div>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {all.map((src, i) => (
          <button
            key={src + i}
            type="button"
            onClick={() => setIdx(i)}
            aria-label={`View ${i + 1}`}
            className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-md border transition-all ${
              i === idx
                ? "border-accent ring-2 ring-accent/30"
                : "border-line hover:border-ink-muted"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              className="h-full w-full object-cover"
            />
            {floorplan && i === all.length - 1 && (
              <span className="absolute inset-x-0 bottom-0 bg-bg/90 text-[9px] uppercase tracking-wider text-ink-soft text-center py-0.5">
                Plan
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
