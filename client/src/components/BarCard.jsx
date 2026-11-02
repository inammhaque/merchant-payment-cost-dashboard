import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Rectangle, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { int, moneyFull, pct } from "../format.js";

// Round value ticks (1, 2, 5 x 10^n) spanning the data and zero.
function niceSpanTicks(min, max) {
  const raw = Math.max(max - min, 1) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const ticks = [];
  // one extra step below zero leaves room for the labels on negative bars
  const lo = Math.floor(min / step) * step - (min < 0 ? step : 0);
  for (let t = lo; t <= Math.ceil(max / step) * step + 1e-9; t += step) ticks.push(t);
  return ticks;
}

const AXIS = { fill: "var(--text-muted)", fontSize: 12 };

// Round tick values (0, 0.5%, 1.0% ...) instead of Recharts' even splits.
function niceTicks(max) {
  const step = [0.001, 0.005, 0.01].find((s) => max / s <= 5) ?? 0.01;
  const ticks = [];
  for (let t = 0; t < max + step; t += step) ticks.push(Number(t.toFixed(6)));
  return ticks;
}

function BarTooltip({ active, payload, valueName, formatValue, meta }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="tooltip">
      <div className="tooltip-value">
        <span className="tooltip-key" />
        {formatValue(payload[0].value)}
      </div>
      <div className="tooltip-name">{valueName} · {row.name}</div>
      <div className="tooltip-meta">{meta(row)}</div>
    </div>
  );
}

export const SUMMARY_COLUMNS = [
  { header: "Transactions", render: (r) => int(r.txns) },
  { header: "Volume", render: (r) => moneyFull(r.volume) },
  { header: "Fees", render: (r) => moneyFull(r.fees) },
  { header: "Effective rate", render: (r) => pct(r.effective_rate) },
];
const summaryMeta = (r) => `${int(r.txns)} txns · ${moneyFull(r.volume)} volume`;

// Value label at the tip of a horizontal bar, on the outside for either sign.
function tipLabel({ x, y, width, height, value }, formatValue) {
  const negative = value < 0;
  const tip = negative ? Math.min(x, x + width) : Math.max(x, x + width);
  return (
    <text
      x={negative ? tip - 6 : tip + 6}
      y={y + height / 2}
      dy="0.35em"
      textAnchor={negative ? "end" : "start"}
      style={{ fill: "var(--text-secondary)", fontSize: 12 }}
    >
      {formatValue(value)}
    </text>
  );
}

function DataTable({ rows, nameHeader, columns }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{nameHeader}</th>
            {columns.map((c) => (
              <th key={c.header} className="num">{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              {columns.map((c) => (
                <td key={c.header} className="num">{c.render(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One single-series bar chart with a chart/table switch.
 * rows: [{ name, txns, volume, fees, effective_rate, ... }]
 * layout: "column" (vertical bars) or "row" (horizontal bars, for long names)
 */
export default function BarCard({
  title, subtitle, rows, valueKey, valueName, formatValue, formatAxis,
  nameHeader, layout = "column", loading, className = "",
  columns = SUMMARY_COLUMNS, tooltipMeta = summaryMeta,
}) {
  const [view, setView] = useState("chart");
  const horizontal = layout === "row";
  const height = horizontal ? Math.max(180, rows.length * 38 + 30) : 260;
  const maxValue = Math.max(0, ...rows.map((r) => r[valueKey] || 0));
  // Rates get clean percentage ticks; money axes keep Recharts' default.
  const rateTicks = valueKey === "effective_rate" ? niceTicks(maxValue) : undefined;
  const minValue = Math.min(0, ...rows.map((r) => r[valueKey] || 0));
  const moneyTicks = horizontal ? niceSpanTicks(minValue, maxValue) : undefined;

  return (
    <section className={`card ${className}`} aria-busy={loading}>
      <header className="card-head">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <div className="segmented small" role="group" aria-label={`${title} view`}>
          {["chart", "table"].map((v) => (
            <button key={v} type="button" className={view === v ? "on" : ""} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === "chart" ? "Chart" : "Table"}
            </button>
          ))}
        </div>
      </header>

      <div className={`card-body ${loading ? "loading" : ""}`}>
        {rows.length === 0 ? (
          <div className="empty">No approved transactions match these filters.</div>
        ) : view === "table" ? (
          <DataTable rows={rows} nameHeader={nameHeader} columns={columns} />
        ) : (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart
              data={rows}
              layout={horizontal ? "vertical" : "horizontal"}
              margin={{ top: 22, right: horizontal ? 56 : 8, bottom: 4, left: horizontal ? 8 : 0 }}
              barCategoryGap="35%"
            >
              <CartesianGrid stroke="var(--gridline)" strokeDasharray="" horizontal={!horizontal} vertical={horizontal} />
              {horizontal ? (
                <>
                  <XAxis
                    type="number"
                    tick={AXIS}
                    tickFormatter={formatAxis}
                    axisLine={false}
                    tickLine={false}
                    ticks={moneyTicks}
                    domain={moneyTicks ? [moneyTicks[0], moneyTicks[moneyTicks.length - 1]] : undefined}
                  />
                  <YAxis type="category" dataKey="name" tick={{ ...AXIS, fill: "var(--text-secondary)" }} axisLine={{ stroke: "var(--baseline)" }} tickLine={false} width={150} />
                </>
              ) : (
                <>
                  <XAxis type="category" dataKey="name" tick={{ ...AXIS, fill: "var(--text-secondary)" }} axisLine={{ stroke: "var(--baseline)" }} tickLine={false} />
                  <YAxis
                    type="number"
                    tick={AXIS}
                    tickFormatter={formatAxis}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                    ticks={rateTicks}
                    domain={rateTicks ? [0, rateTicks[rateTicks.length - 1]] : undefined}
                  />
                </>
              )}
              <Tooltip
                cursor={{ fill: "var(--wash)" }}
                content={<BarTooltip valueName={valueName} formatValue={formatValue} meta={tooltipMeta} />}
              />
              <Bar
                dataKey={valueKey}
                fill="var(--series-1)"
                maxBarSize={24}
                radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                activeBar={(p) => (
                  <Rectangle {...p} fill={p.payload[valueKey] < 0 ? "var(--negative-hover)" : "var(--series-1-hover)"} />
                )}
                isAnimationActive={false}
              >
                {rows.map((r) => (
                  <Cell key={r.name} fill={r[valueKey] < 0 ? "var(--negative)" : "var(--series-1)"} />
                ))}
                {horizontal ? (
                  <LabelList dataKey={valueKey} content={(p) => tipLabel(p, formatValue)} />
                ) : (
                  <LabelList
                    dataKey={valueKey}
                    position="top"
                    formatter={formatValue}
                    style={{ fill: "var(--text-secondary)", fontSize: 12 }}
                  />
                )}
              </Bar>
              {horizontal && <ReferenceLine x={0} stroke="var(--baseline)" />}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
