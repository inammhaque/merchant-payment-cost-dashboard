import { useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { int, moneyFull, pct } from "../format.js";

const AXIS = { fill: "var(--text-muted)", fontSize: 12 };

// Round tick values (0, 0.5%, 1.0% ...) instead of Recharts' even splits.
function niceTicks(max) {
  const step = [0.001, 0.005, 0.01].find((s) => max / s <= 5) ?? 0.01;
  const ticks = [];
  for (let t = 0; t < max + step; t += step) ticks.push(Number(t.toFixed(6)));
  return ticks;
}

function BarTooltip({ active, payload, valueName, formatValue }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="tooltip">
      <div className="tooltip-value">
        <span className="tooltip-key" />
        {formatValue(payload[0].value)}
      </div>
      <div className="tooltip-name">{valueName} · {row.name}</div>
      <div className="tooltip-meta">
        {int(row.txns)} txns · {moneyFull(row.volume)} volume
      </div>
    </div>
  );
}

function DataTable({ rows, nameHeader }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{nameHeader}</th>
            <th className="num">Transactions</th>
            <th className="num">Volume</th>
            <th className="num">Fees</th>
            <th className="num">Effective rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td className="num">{int(r.txns)}</td>
              <td className="num">{moneyFull(r.volume)}</td>
              <td className="num">{moneyFull(r.fees)}</td>
              <td className="num">{pct(r.effective_rate)}</td>
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
}) {
  const [view, setView] = useState("chart");
  const horizontal = layout === "row";
  const height = horizontal ? Math.max(180, rows.length * 38 + 30) : 260;
  const maxValue = Math.max(0, ...rows.map((r) => r[valueKey] || 0));
  // Rates get clean percentage ticks; money axes keep Recharts' default.
  const rateTicks = valueKey === "effective_rate" ? niceTicks(maxValue) : undefined;

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
          <DataTable rows={rows} nameHeader={nameHeader} />
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
                  <XAxis type="number" tick={AXIS} tickFormatter={formatAxis} axisLine={false} tickLine={false} />
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
                content={<BarTooltip valueName={valueName} formatValue={formatValue} />}
              />
              <Bar
                dataKey={valueKey}
                fill="var(--series-1)"
                maxBarSize={24}
                radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                activeBar={{ fill: "var(--series-1-hover)" }}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey={valueKey}
                  position={horizontal ? "right" : "top"}
                  formatter={formatValue}
                  style={{ fill: "var(--text-secondary)", fontSize: 12 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
