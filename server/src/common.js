import { db } from "./db.js";

// Whitelist: interpolated into SQL, user input never is.
export const FEE_COLUMN = { flat_rate: "flat_rate_fee", interchange: "interchange_fee" };

export class BadRequest extends Error {}

const distinct = (sql) => db.prepare(sql).all().map((r) => r.v);
export const validCategories = () =>
  distinct("SELECT DISTINCT merchant_category AS v FROM v_transaction_fees ORDER BY 1");
export const validBuckets = () =>
  distinct("SELECT ticket_bucket AS v FROM v_transaction_fees GROUP BY 1, bucket_order ORDER BY bucket_order");

// Reads and validates ?model=&category=&ticket_bucket= (blank = no filter).
export function parseParams(query) {
  const model = query.model || "flat_rate";
  if (!(model in FEE_COLUMN)) {
    throw new BadRequest(`model must be one of: ${Object.keys(FEE_COLUMN).join(", ")}`);
  }
  const category = query.category || null;
  if (category && !validCategories().includes(category)) {
    throw new BadRequest(`unknown category "${category}"; valid: ${validCategories().join(", ")}`);
  }
  const ticketBucket = query.ticket_bucket || null;
  if (ticketBucket && !validBuckets().includes(ticketBucket)) {
    throw new BadRequest(`unknown ticket_bucket "${ticketBucket}"; valid: ${validBuckets().join(", ")}`);
  }
  return { model, category, ticketBucket };
}

export const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);
