async function getJson(url, signal) {
  const res = await fetch(url, { signal });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export const fetchFilters = (signal) => getJson("/api/filters", signal);

// kind: "method" | "category" | "ticket"
export function fetchSummary(kind, { model, category, ticketBucket }, signal) {
  const params = new URLSearchParams({ model });
  if (category) params.set("category", category);
  if (ticketBucket) params.set("ticket_bucket", ticketBucket);
  return getJson(`/api/summary/${kind}?${params}`, signal);
}

export function fetchScenario({ model, category, ticketBucket }, { shiftPct, etransferFee }, signal) {
  const params = new URLSearchParams({ model, shift_pct: shiftPct, etransfer_fee: etransferFee });
  if (category) params.set("category", category);
  if (ticketBucket) params.set("ticket_bucket", ticketBucket);
  return getJson(`/api/scenario?${params}`, signal);
}
