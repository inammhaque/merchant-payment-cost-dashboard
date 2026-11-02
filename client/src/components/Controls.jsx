const MODELS = [
  { value: "flat_rate", label: "Flat rate" },
  { value: "interchange", label: "Interchange" },
];

export default function Controls({ filters, options, onChange, onReset }) {
  const active = filters.category || filters.ticketBucket;
  return (
    <div className="controls" role="group" aria-label="Filters">
      <div className="control">
        <span className="control-label" id="model-label">Pricing model</span>
        <div className="segmented" role="radiogroup" aria-labelledby="model-label">
          {MODELS.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={filters.model === m.value}
              className={filters.model === m.value ? "on" : ""}
              onClick={() => onChange({ model: m.value })}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <label className="control">
        <span className="control-label">Merchant category</span>
        <select value={filters.category} onChange={(e) => onChange({ category: e.target.value })}>
          <option value="">All categories</option>
          {options.categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>

      <label className="control">
        <span className="control-label">Ticket size</span>
        <select value={filters.ticketBucket} onChange={(e) => onChange({ ticketBucket: e.target.value })}>
          <option value="">All ticket sizes</option>
          {options.ticketBuckets.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </label>

      {active && (
        <button type="button" className="link-btn" onClick={onReset}>
          Clear filters
        </button>
      )}
    </div>
  );
}
