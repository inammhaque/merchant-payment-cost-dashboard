const compact = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const full = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});
const count = new Intl.NumberFormat("en-CA");

const cents = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

export const money2 = (v) => (v == null ? "–" : cents.format(v));
// Compact ($12.8M, $165K); under $1,000 whole dollars so $665.8 does not appear.
export const money = (v) =>
  v == null ? "–" : Math.abs(v) < 1000 ? full.format(v) : compact.format(v);
export const moneyFull = (v) => (v == null ? "–" : full.format(v));
export const int = (v) => (v == null ? "–" : count.format(v));
export const pct = (v, digits = 2) => (v == null ? "–" : `${(v * 100).toFixed(digits)}%`);
