import { useEffect, useState } from "react";
import { fetchScenario } from "../api.js";
import { int, money, money2, pct } from "../format.js";
import BarCard from "./BarCard.jsx";
import { Kpi } from "./KpiCards.jsx";

const SAVINGS_COLUMNS = [
  { header: "Card transactions", render: (r) => int(r.card_txns) },
  { header: "Card fees", render: (r) => money2(r.card_fees) },
  { header: "Fees avoided", render: (r) => money2(r.shifted_fees) },
  { header: "e-Transfer cost", render: (r) => money2(r.etransfer_cost) },
  { header: "Savings", render: (r) => money2(r.savings) },
];
const savingsMeta = (r) =>
  `${money2(r.shifted_fees)} fees avoided − ${money2(r.etransfer_cost)} e-Transfer cost`;

const CHANNEL = { in_person: "in person", online: "online" };

// Standard and premium credit often share a rate: show them as one line.
function groupBreakEvens(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = [r.payment_method, r.channel, r.card_pct_fee, r.card_flat_fee, r.break_even_ticket, r.e_transfer_cheaper].join("|");
    const g = groups.get(key) || { ...r, cardTypes: [] };
    if (r.card_type) g.cardTypes.push(r.card_type);
    groups.set(key, g);
  }
  return [...groups.values()];
}

function cardLabel(g) {
  const name = g.payment_method === "debit" ? "Debit" : "Credit";
  const types = g.cardTypes.length === 2 ? "all cards" : g.cardTypes[0];
  return `${name}${types ? ` (${types})` : ""}, ${CHANNEL[g.channel] || g.channel}`;
}

function BreakEven({ data, loading }) {
  const rows = groupBreakEvens(data.break_even);
  const fee = money2(data.etransfer_fee);
  return (
    <section className="card" aria-busy={loading}>
      <header className="card-head">
        <div>
          <h2>Break-even ticket size</h2>
          <p>Where an e-Transfer at {fee} costs the same as the card payment ({data.model === "interchange" ? "interchange" : "flat-rate"} model)</p>
        </div>
      </header>
      <div className={`card-body ${loading ? "loading" : ""}`}>
        {rows.length === 0 ? (
          <div className="empty">No card transactions match these filters.</div>
        ) : (
          <ul className="breakeven">
            {rows.map((g) => (
              <li key={cardLabel(g) + g.break_even_ticket}>
                <div className="be-name">
                  {cardLabel(g)}
                  <span className="be-rate">{pct(g.card_pct_fee)} + {money2(g.card_flat_fee)}</span>
                </div>
                {g.e_transfer_cheaper === "above" && (
                  <div>e-Transfer is cheaper for tickets above <strong>{money2(g.break_even_ticket)}</strong></div>
                )}
                {g.e_transfer_cheaper === "always_cheaper" && <div>e-Transfer is cheaper at every ticket size</div>}
                {g.e_transfer_cheaper === "never_cheaper" && <div>The card payment is cheaper at every ticket size</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Slider({ id, label, value, min, max, step, format, onChange }) {
  return (
    <div className="slider">
      <label htmlFor={id}>{label}</label>
      <output htmlFor={id}>{format(value)}</output>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={format(value)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export default function ScenarioPanel({ filters }) {
  const [shiftPct, setShiftPct] = useState(20);
  const [etransferFee, setEtransferFee] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      fetchScenario(filters, { shiftPct, etransferFee }, ctrl.signal)
        .then((d) => {
          setData(d);
          setError(null);
          setLoading(false);
        })
        .catch((e) => {
          if (e.name === "AbortError") return;
          setError(e.message);
          setLoading(false);
        });
    }, 100); // debounce slider drags
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [filters, shiftPct, etransferFee]);

  const t = data?.totals;
  const rows = (data?.by_category || []).map((r) => ({ ...r, name: r.merchant_category }));

  return (
    <section className="scenario" aria-label="Scenario">
      <header className="scenario-head">
        <h2>Scenario: shift card payments to e-Transfer</h2>
        <p>
          Moves a share of card transactions (credit and debit) to e-Transfer, keeping their ticket-size and card mix.
          Uses the pricing model and filters above. Existing e-Transfer volume stays at its current
          fee{data ? ` (${money2(data.current_etransfer_fee)})` : ""}.
        </p>
      </header>

      <div className="sliders">
        <Slider id="shift" label="Card transactions shifted" value={shiftPct} min={0} max={50} step={1}
                format={(v) => `${v}%`} onChange={setShiftPct} />
        <Slider id="etfee" label="e-Transfer fee per transaction" value={etransferFee} min={0} max={1.5} step={0.05}
                format={money2} onChange={setEtransferFee} />
      </div>

      {error && <div className="error" role="alert">Couldn’t load scenario: {error}</div>}

      {t && (
        <div className={loading ? "loading-wrap" : ""}>
          <div className="kpis">
            <Kpi label="Current fees" value={money(t.current_fees)} note="Same as total fees above" />
            <Kpi label="New fees" value={money(t.new_fees)}
                 note={`${int(Math.round(t.shifted_txns))} of ${int(t.card_txns)} card transactions shifted`} />
            <Kpi label="Savings" value={money(t.savings)} negative={t.savings < 0}
                 note={t.savings_pct_of_current == null ? "No transactions match these filters"
                       : t.savings < 0 ? "Net cost: e-Transfer fees exceed fees avoided"
                       : `${pct(t.savings_pct_of_current, 1)} of current fees`} />
          </div>
          <div className="charts">
            <BarCard
              title="Savings by merchant category"
              subtitle="Fees avoided on shifted card transactions, minus e-Transfer fees"
              rows={rows}
              valueKey="savings"
              valueName="Savings"
              formatValue={(v) => money(v)}
              formatAxis={(v) => money(v)}
              nameHeader="Merchant category"
              layout="row"
              columns={SAVINGS_COLUMNS}
              tooltipMeta={savingsMeta}
              loading={loading}
            />
            <BreakEven data={data} loading={loading} />
          </div>
        </div>
      )}
    </section>
  );
}
