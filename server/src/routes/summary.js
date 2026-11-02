import { Router } from "express";
import { db } from "../db.js";
import { FEE_COLUMN, parseParams, round2, validBuckets, validCategories } from "../common.js";

// Whitelist: interpolated into SQL, user input never is.
const DIMENSIONS = {
  method: { column: "payment_method", orderBy: "volume DESC" },
  category: { column: "merchant_category", orderBy: "fees DESC" },
  ticket: { column: "ticket_bucket", orderBy: "bucket_order", groupExtra: ", bucket_order" },
};

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

export default router;
