import { useEffect, useState } from "react";
import { fetchFilters, fetchSummary } from "./api.js";
import { money, pct } from "./format.js";
import BarCard from "./components/BarCard.jsx";
import Controls from "./components/Controls.jsx";
import KpiCards from "./components/KpiCards.jsx";

const DEFAULT_FILTERS = { model: "flat_rate", category: "", ticketBucket: "" };

// API rows use the dimension's own column name; charts want a common `name`.
const withName = (rows, key) => (rows || []).map((r) => ({ ...r, name: r[key] }));

export default function App() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [options, setOptions] = useState({ categories: [], ticketBuckets: [] });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchFilters(ctrl.signal)
      .then((f) => setOptions({ categories: f.categories, ticketBuckets: f.ticket_buckets }))
      .catch((e) => e.name !== "AbortError" && setError(e.message));
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    Promise.all([
      fetchSummary("method", filters, ctrl.signal),
      fetchSummary("category", filters, ctrl.signal),
      fetchSummary("ticket", filters, ctrl.signal),
    ])
      .then(([method, category, ticket]) => {
        setData({
          method: withName(method.rows, "payment_method"),
          category: withName(category.rows, "merchant_category"),
          ticket: withName(ticket.rows, "ticket_bucket"),
        });
        setError(null);
        setLoading(false);
      })
      .catch((e) => {
        if (e.name === "AbortError") return;
        setError(e.message);
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [filters]);

  const update = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const modelName = filters.model === "interchange" ? "interchange" : "flat-rate";

  return (
    <div className="page">
      <header className="page-head">
        <h1>Merchant payment costs</h1>
        <p>What merchants pay to accept payments, under two pricing models. Approved transactions only, last 12 months.</p>
      </header>

      <Controls filters={filters} options={options} onChange={update} onReset={() => update({ category: "", ticketBucket: "" })} />
      {filters.model === "interchange" && (
        <p className="note">
          Interchange only: excludes network assessments and processor markup, so this is a floor, not an all-in cost.
        </p>
      )}

      {error && <div className="error" role="alert">Couldn’t load data: {error}</div>}

      {data && (
        <>
          <KpiCards rows={data.method} />
          <div className="charts">
            <BarCard
              title="Effective rate by payment method"
              subtitle={`Fees as a share of volume, ${modelName} model`}
              rows={data.method}
              valueKey="effective_rate"
              valueName="Effective rate"
              formatValue={(v) => pct(v)}
              formatAxis={(v) => pct(v, 1)}
              nameHeader="Payment method"
              loading={loading}
            />
            <BarCard
              title="Effective rate by ticket size"
              subtitle={`Fees as a share of volume, ${modelName} model`}
              rows={data.ticket}
              valueKey="effective_rate"
              valueName="Effective rate"
              formatValue={(v) => pct(v)}
              formatAxis={(v) => pct(v, 1)}
              nameHeader="Ticket size"
              loading={loading}
            />
            <BarCard
              className="wide"
              title="Total fees by merchant category"
              subtitle={`Total fees paid, ${modelName} model`}
              rows={data.category}
              valueKey="fees"
              valueName="Total fees"
              formatValue={(v) => money(v)}
              formatAxis={(v) => money(v)}
              nameHeader="Merchant category"
              layout="row"
              loading={loading}
            />
          </div>
        </>
      )}
    </div>
  );
}
