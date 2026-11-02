import { Router } from "express";
import { db } from "../db.js";
import { BadRequest, FEE_COLUMN, parseParams, round2 } from "../common.js";

const CARD_METHODS = "('credit', 'debit')";

function parseNumber(query, name, { min, max, fallback }) {
  const raw = query[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new BadRequest(`${name} must be a number between ${min} and ${max}`);
  }
  return n;
}

// Current (status quo) fees per category, with the card-only subset the shift draws from.
function currentByCategory(fee, { category, ticketBucket }) {
  return db
    .prepare(
      `SELECT merchant_category,
              SUM(${fee})                                                          AS total_fees,
              SUM(CASE WHEN payment_method IN ${CARD_METHODS} THEN 1 ELSE 0 END)   AS card_txns,
              SUM(CASE WHEN payment_method IN ${CARD_METHODS} THEN ${fee} END)     AS card_fees
       FROM v_transaction_fees
       WHERE (@category IS NULL OR merchant_category = @category)
         AND (@ticketBucket IS NULL OR ticket_bucket = @ticketBucket)
       GROUP BY merchant_category`
    )
    .all({ category, ticketBucket });
}

// Per card type and channel: ticket size where an e-Transfer at `fee` costs the
// same as the card payment under the model.
//   card cost       = pct_card * A + flat_card
//   e-Transfer cost = pct_etransfer * A + fee
//   equal at A = (fee - flat_card) / (pct_card - pct_etransfer)
function breakEvens(model, fee, { category, ticketBucket }) {
  const rates = db
    .prepare(
      `SELECT DISTINCT t.pm_key AS payment_method, t.card_key AS card_type, t.channel,
                       r.pct_fee, r.flat_fee,
                       (SELECT e.pct_fee FROM v_fee_rates e
                         WHERE e.model = @model AND e.payment_method = 'e-transfer'
                           AND e.channel IN (t.channel, 'any')) AS etransfer_pct
       FROM v_txn_base t
       JOIN v_fee_rates r
         ON r.model = @model AND r.payment_method = t.pm_key
        AND r.card_type = t.card_key AND r.channel IN (t.channel, 'any')
       WHERE t.pm_key IN ${CARD_METHODS}
         AND (@category IS NULL OR t.merchant_category = @category)
         AND (@ticketBucket IS NULL OR t.ticket_bucket = @ticketBucket)
       ORDER BY t.pm_key DESC, t.card_key, t.channel`
    )
    .all({ model, category, ticketBucket });

  return rates.map((r) => {
    const slope = r.pct_fee - r.etransfer_pct;
    const point = slope > 0 ? (fee - r.flat_fee) / slope : null;
    let result;
    if (slope <= 0) {
      // card has no per-dollar cost advantage to give up: compare flat fees only
      result = fee < r.flat_fee ? "always_cheaper" : "never_cheaper";
    } else if (point <= 0) {
      result = "always_cheaper"; // e-Transfer is cheaper even on a $0 ticket
    } else {
      result = "above"; // e-Transfer is cheaper for tickets above the break-even
    }
    return {
      payment_method: r.payment_method,
      card_type: r.card_type || null,
      channel: r.channel,
      card_pct_fee: r.pct_fee,
      card_flat_fee: r.flat_fee,
      break_even_ticket: result === "above" ? round2(point) : null,
      e_transfer_cheaper: result,
    };
  });
}

const router = Router();

router.get("/scenario", (req, res, next) => {
  try {
    const { model, category, ticketBucket } = parseParams(req.query);
    const shiftPct = parseNumber(req.query, "shift_pct", { min: 0, max: 50, fallback: 20 });
    const etransferFee = parseNumber(req.query, "etransfer_fee", { min: 0, max: 1.5, fallback: 0 });
    const share = shiftPct / 100;
    const filters = { category, ticketBucket };

    const rows = currentByCategory(FEE_COLUMN[model], filters).map((r) => {
      const shiftedFees = share * (r.card_fees || 0);
      const etransferCost = share * r.card_txns * etransferFee;
      return {
        merchant_category: r.merchant_category,
        total_fees: r.total_fees || 0,
        card_txns: r.card_txns,
        card_fees: r.card_fees || 0,
        shifted_fees: shiftedFees,
        etransfer_cost: etransferCost,
        savings: shiftedFees - etransferCost,
      };
    });
    const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
    const currentFees = sum("total_fees");
    const shiftedFees = sum("shifted_fees");
    const etransferCost = sum("etransfer_cost");
    const savings = shiftedFees - etransferCost;

    res.json({
      model,
      category,
      ticket_bucket: ticketBucket,
      shift_pct: shiftPct,
      etransfer_fee: etransferFee,
      // fee already assumed for existing e-Transfer volume (fee_params); the
      // scenario fee applies only to the shifted transactions
      current_etransfer_fee: db.prepare("SELECT value FROM fee_params WHERE name = 'etransfer_fee'").get().value,
      totals: {
        current_fees: round2(currentFees),
        shifted_fees: round2(shiftedFees),
        etransfer_cost: round2(etransferCost),
        new_fees: round2(currentFees - shiftedFees + etransferCost),
        savings: round2(savings),
        savings_pct_of_current: currentFees ? savings / currentFees : null,
        card_txns: sum("card_txns"),
        shifted_txns: share * sum("card_txns"),
      },
      by_category: rows
        .map((r) => ({
          merchant_category: r.merchant_category,
          card_txns: r.card_txns,
          card_fees: round2(r.card_fees),
          shifted_fees: round2(r.shifted_fees),
          etransfer_cost: round2(r.etransfer_cost),
          savings: round2(r.savings),
        }))
        .sort((a, b) => b.savings - a.savings),
      break_even: breakEvens(model, etransferFee, filters),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
