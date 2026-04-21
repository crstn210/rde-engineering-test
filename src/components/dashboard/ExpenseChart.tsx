import type { ExpensePoint } from "@/lib/dashboard";

const CATEGORY_COLORS: Record<string, string> = {
  Repairs: "#c2410c", // accent terracotta
  Utilities: "#9a3412",
  Taxes: "#78350f",
  Insurance: "#a8a29c",
  Management: "#6b6760",
};

const fmt = (n: number) =>
  n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

export default function ExpenseChart({ expenses }: { expenses: ExpensePoint[] }) {
  const categories = Object.keys(expenses[0]?.categories ?? {});
  const monthlyTotals = expenses.map((p) =>
    Object.values(p.categories).reduce((s, v) => s + v, 0)
  );
  const maxTotal = Math.max(...monthlyTotals, 1);
  const annualTotal = monthlyTotals.reduce((s, v) => s + v, 0);

  // SVG layout
  const W = 720;
  const H = 240;
  const padLeft = 44;
  const padRight = 16;
  const padTop = 16;
  const padBot = 32;
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBot;
  const barW = (plotW / Math.max(expenses.length, 1)) * 0.7;
  const step = plotW / Math.max(expenses.length, 1);

  return (
    <section className="rounded-2xl border border-line bg-bg-card">
      <header className="flex items-center justify-between px-5 py-4 border-b border-line">
        <div>
          <h2 className="font-display text-xl text-ink">
            Operating expenses
          </h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Last 12 months · {fmt(annualTotal)} total
          </p>
        </div>
        <p className="text-[11px] uppercase tracking-wider text-ink-faint italic">
          Repairs = real · others synthetic
        </p>
      </header>

      <div className="p-5">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label="Stacked monthly operating expenses by category"
        >
          {/* Y grid */}
          {[0.25, 0.5, 0.75, 1].map((t) => {
            const y = padTop + plotH * (1 - t);
            return (
              <g key={t}>
                <line
                  x1={padLeft}
                  x2={W - padRight}
                  y1={y}
                  y2={y}
                  stroke="#e2dacb"
                  strokeWidth={0.5}
                />
                <text
                  x={padLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="10"
                  fill="#6b6760"
                  className="tabular-nums"
                >
                  {Math.round((maxTotal * t) / 1000)}k
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {expenses.map((p, i) => {
            const x = padLeft + step * i + (step - barW) / 2;
            let yOffset = padTop + plotH;
            return (
              <g key={p.month}>
                {categories.map((cat) => {
                  const v = p.categories[cat] ?? 0;
                  const h = (v / maxTotal) * plotH;
                  yOffset -= h;
                  return (
                    <rect
                      key={cat}
                      x={x}
                      y={yOffset}
                      width={barW}
                      height={h}
                      fill={CATEGORY_COLORS[cat] ?? "#9ca3af"}
                      opacity={0.9}
                    />
                  );
                })}
                <text
                  x={x + barW / 2}
                  y={H - 14}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#6b6760"
                >
                  {p.month.slice(5)}
                </text>
              </g>
            );
          })}
        </svg>

        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {categories.map((c) => (
            <li key={c} className="flex items-center gap-1.5 text-ink-soft">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: CATEGORY_COLORS[c] }}
              />
              {c}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
