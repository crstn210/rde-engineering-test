"use client";

import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";

const EXAMPLE_CHIPS = [
  "Tech startup in Hudson Yards",
  "25 people in Midtown",
  "10,000 SF in FiDi",
  "Sublease near Penn Station",
  "Move-in-ready with phone booths",
  "Pre-built with outdoor space",
];

export default function SearchBox({
  initialQuery = "",
  autoFocus = false,
  variant = "hero",
}: {
  initialQuery?: string;
  autoFocus?: boolean;
  variant?: "hero" | "refine";
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function submit(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  const isHero = variant === "hero";

  return (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(q);
        }}
        className={
          isHero
            ? "relative w-full max-w-2xl mx-auto"
            : "relative w-full max-w-3xl"
        }
      >
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={
            isHero
              ? "Describe your space…"
              : "Refine your search…"
          }
          className={
            isHero
              ? "chat-input w-full rounded-2xl border border-line bg-bg-card px-6 py-5 pr-32 text-lg text-ink shadow-[0_1px_2px_rgba(26,26,24,0.04)] outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-colors"
              : "chat-input w-full rounded-xl border border-line bg-bg-card px-5 py-3.5 pr-28 text-base text-ink shadow-[0_1px_2px_rgba(26,26,24,0.04)] outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-colors"
          }
        />
        <button
          type="submit"
          className={
            isHero
              ? "absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-ink px-5 py-3 text-bg text-sm font-medium tracking-wide hover:bg-accent transition-colors"
              : "absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-ink px-4 py-2 text-bg text-sm font-medium hover:bg-accent transition-colors"
          }
        >
          Search
        </button>
      </form>
      {isHero && (
        <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-2xl mx-auto">
          {EXAMPLE_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => {
                setQ(chip);
                submit(chip);
              }}
              className="rounded-full border border-line bg-bg-card px-4 py-1.5 text-sm text-ink-soft hover:border-accent hover:text-accent transition-colors"
            >
              {chip}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
