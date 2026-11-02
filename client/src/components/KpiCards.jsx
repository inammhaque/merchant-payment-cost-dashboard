import { int, money, pct } from "../format.js";

export function Kpi({ label, value, note, negative = false }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value${negative ? " negative" : ""}`}>{value}</div>
      <div className="kpi-note">{note}</div>
    </div>
  );
}

// Totals are derived from the by-payment-method rows, which partition the
// filtered transactions exactly once.
export default function KpiCards({ rows }) {
  const sum = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
  const volume = sum("volume");
  const fees = sum("fees");
  const pricedVolume = sum("priced_volume");
  const txns = sum("txns");
  return (
    <section className="kpis" aria-label="Key figures">
      <Kpi label="Total volume" value={money(volume)} note={`${int(txns)} approved transactions`} />
      <Kpi label="Total fees" value={money(fees)} note="Paid by merchants under this model" />
      <Kpi
        label="Blended effective rate"
        value={pct(pricedVolume ? fees / pricedVolume : null)}
        note="Total fees ÷ total volume"
      />
    </section>
  );
}
