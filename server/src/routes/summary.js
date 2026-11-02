import { Router } from "express";
import { db } from "../db.js";

// Whitelists: these are interpolated into SQL, user input never is.
const FEE_COLUMN = { flat_rate: "flat_rate_fee", interchange: "interchange_fee" };
const DIMENSIONS = {
  method: { column: "payment_method", orderBy: "volume DESC" },
  category: { column: "merchant_category", orderBy: "fees DESC" },
  ticket: { column: "ticket_bucket", orderBy: "bucket_order", groupExtra: ", bucket_order" },
};

const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);

function distinct(sql) {
  return db.prepare(sql).all().map((r) => r.v);
}
const validCategories = () =>
  distinct("SELECT DISTINCT merchant_category AS v FROM v_transaction_fees ORDER BY 1");
const validBuckets = () =>
  distinct("SELECT ticket_bucket AS v FROM v_transaction_fees GROUP BY 1, bucket_order ORDER BY bucket_order");

class BadRequest extends Error {}

// Reads and validates ?model=&category=&ticket_bucket= (blank = no filter).
function parseParams(query) {
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

// Same aggregation as the v_fee_summary_by_* views (effective rate = fees /
// priced volume), but taken from v_transaction_fees so the category and
// ticket-size filters can be applied before grouping.
function summarize(dimension, { model, category, ticketBucket }) {
  const { column, orderBy, groupExtra = "" } = DIMENSIONS[dimension];
  const fee = FEE_COLUMN[model];
  const rows = db
    .prepare(
      `SELECT ${column}                                         AS ${column},
              COUNT(*)                                          AS txns,
              COUNT(${fee})                                     AS priced_txns,
              SUM(amount)                                       AS volume,
              SUM(${fee})                                       AS fees,
              SUM(CASE WHEN ${fee} IS NOT NULL THEN amount END) AS priced_volume
       FROM v_transaction_fees
       WHERE (@category IS NULL OR merchant_category = @category)
         AND (@ticketBucket IS NULL OR ticket_bucket = @ticketBucket)
       GROUP BY ${column}${groupExtra}
       ORDER BY ${orderBy}`
    )
    .all({ category, ticketBucket });

  return {
    model,
    category,
    ticket_bucket: ticketBucket,
    rows: rows.map((r) => ({
      [column]: r[column],
      txns: r.txns,
      priced_txns: r.priced_txns,
      volume: round2(r.volume),
      fees: round2(r.fees),
      priced_volume: round2(r.priced_volume),
      effective_rate: r.priced_volume ? r.fees / r.priced_volume : null,
    })),
  };
}

const router = Router();

router.get("/filters", (_req, res) => {
  res.json({
    models: Object.keys(FEE_COLUMN),
    categories: validCategories(),
    ticket_buckets: validBuckets(),
  });
});

for (const dimension of Object.keys(DIMENSIONS)) {
  router.get(`/summary/${dimension}`, (req, res, next) => {
    try {
      res.json(summarize(dimension, parseParams(req.query)));
    } catch (err) {
      next(err);
    }
  });
}

// eslint-disable-next-line no-unused-vars
router.use((err, _req, res, _next) => {
  if (err instanceof BadRequest) return res.status(400).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "internal error" });
});

export default router;
