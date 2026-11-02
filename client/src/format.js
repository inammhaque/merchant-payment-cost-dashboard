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

export const money = (v) => (v == null ? "–" : compact.format(v));
export const moneyFull = (v) => (v == null ? "–" : full.format(v));
export const int = (v) => (v == null ? "–" : count.format(v));
export const pct = (v, digits = 2) => (v == null ? "–" : `${(v * 100).toFixed(digits)}%`);
