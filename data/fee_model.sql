-- Fee model on top of clean_transactions + fee_assumptions (loaded from
-- fee_assumptions.csv by run_fee_model.py).
--
-- Parameter: fee_params.etransfer_fee is the per-transaction fee charged on
-- e-Transfer. It overrides the flat_fee in the assumptions row, so test a value
-- with:  UPDATE fee_params SET value = 0.50 WHERE name = 'etransfer_fee';
--
-- Rules:
--   * approved transactions only
--   * channel: 'online' for e-commerce, 'in_person' for every other category
--   * fee = amount * pct_fee + flat_fee ; effective_rate = fee / amount
--   * a transaction with no matching assumption row for a model gets a NULL fee
--     under that model (no rate is invented); summaries report priced volume.

CREATE TABLE IF NOT EXISTS fee_params (
    name  TEXT PRIMARY KEY,
    value REAL NOT NULL
);
INSERT OR IGNORE INTO fee_params (name, value) VALUES ('etransfer_fee', 0.0);

DROP VIEW IF EXISTS v_fee_summary_by_payment_method;
DROP VIEW IF EXISTS v_fee_summary_by_category;
DROP VIEW IF EXISTS v_fee_summary_by_ticket_size;
DROP VIEW IF EXISTS v_fee_coverage;
DROP VIEW IF EXISTS v_transaction_fees;
DROP VIEW IF EXISTS v_txn_base;
DROP VIEW IF EXISTS v_fee_rates;

-- Assumptions normalised for joining: model 'all' expanded to both models,
-- blank card_type -> '', e-Transfer flat fee taken from fee_params.
CREATE VIEW v_fee_rates AS
SELECT m.model                                   AS model,
       LOWER(a.payment_method)                   AS payment_method,
       COALESCE(NULLIF(a.card_type, ''), '')     AS card_type,
       a.channel                                 AS channel,
       a.pct_fee                                 AS pct_fee,
       CASE WHEN LOWER(a.payment_method) = 'e-transfer'
            THEN (SELECT value FROM fee_params WHERE name = 'etransfer_fee')
            ELSE a.flat_fee END                  AS flat_fee
FROM fee_assumptions a
JOIN (SELECT 'flat_rate' AS model UNION ALL SELECT 'interchange') m
  ON a.model IN ('all', m.model);

-- Approved transactions with channel and ticket-size bucket.
CREATE VIEW v_txn_base AS
SELECT transaction_id, date, merchant_id, merchant_name, merchant_category,
       province, payment_method, card_type, amount,
       LOWER(payment_method)                                    AS pm_key,
       COALESCE(card_type, '')                                  AS card_key,
       CASE WHEN merchant_category = 'e-commerce' THEN 'online'
            ELSE 'in_person' END                                AS channel,
       CASE WHEN amount < 25  THEN '<$25'
            WHEN amount < 100 THEN '$25-100'
            WHEN amount < 500 THEN '$100-500'
            ELSE '$500+' END                                    AS ticket_bucket,
       CASE WHEN amount < 25  THEN 1
            WHEN amount < 100 THEN 2
            WHEN amount < 500 THEN 3
            ELSE 4 END                                          AS bucket_order
FROM clean_transactions
WHERE status = 'approved';

-- One row per approved transaction, fee and effective rate under both models.
CREATE VIEW v_transaction_fees AS
SELECT b.transaction_id, b.date, b.merchant_id, b.merchant_category, b.province,
       b.payment_method, b.card_type, b.channel, b.ticket_bucket, b.bucket_order,
       b.amount,
       b.amount * f.pct_fee + f.flat_fee                        AS flat_rate_fee,
       (b.amount * f.pct_fee + f.flat_fee) / NULLIF(b.amount, 0) AS flat_rate_eff_rate,
       b.amount * i.pct_fee + i.flat_fee                        AS interchange_fee,
       (b.amount * i.pct_fee + i.flat_fee) / NULLIF(b.amount, 0) AS interchange_eff_rate
FROM v_txn_base b
LEFT JOIN v_fee_rates f
       ON f.model = 'flat_rate' AND f.payment_method = b.pm_key
      AND f.card_type = b.card_key AND f.channel IN (b.channel, 'any')
LEFT JOIN v_fee_rates i
       ON i.model = 'interchange' AND i.payment_method = b.pm_key
      AND i.card_type = b.card_key AND i.channel IN (b.channel, 'any');

-- Summaries. Effective rate = total fees / volume of the priced transactions
-- only, so unpriced transactions do not dilute it. *_priced_txns shows coverage.
CREATE VIEW v_fee_summary_by_payment_method AS
SELECT payment_method,
       COUNT(*)                                                   AS txns,
       SUM(amount)                                                AS volume,
       COUNT(flat_rate_fee)                                       AS flat_priced_txns,
       SUM(flat_rate_fee)                                         AS flat_fees,
       SUM(flat_rate_fee) / NULLIF(SUM(CASE WHEN flat_rate_fee IS NOT NULL THEN amount END), 0)
                                                                  AS flat_eff_rate,
       COUNT(interchange_fee)                                     AS ic_priced_txns,
       SUM(interchange_fee)                                       AS ic_fees,
       SUM(interchange_fee) / NULLIF(SUM(CASE WHEN interchange_fee IS NOT NULL THEN amount END), 0)
                                                                  AS ic_eff_rate
FROM v_transaction_fees
GROUP BY payment_method;

CREATE VIEW v_fee_summary_by_category AS
SELECT merchant_category,
       COUNT(*)                                                   AS txns,
       SUM(amount)                                                AS volume,
       COUNT(flat_rate_fee)                                       AS flat_priced_txns,
       SUM(flat_rate_fee)                                         AS flat_fees,
       SUM(flat_rate_fee) / NULLIF(SUM(CASE WHEN flat_rate_fee IS NOT NULL THEN amount END), 0)
                                                                  AS flat_eff_rate,
       COUNT(interchange_fee)                                     AS ic_priced_txns,
       SUM(interchange_fee)                                       AS ic_fees,
       SUM(interchange_fee) / NULLIF(SUM(CASE WHEN interchange_fee IS NOT NULL THEN amount END), 0)
                                                                  AS ic_eff_rate
FROM v_transaction_fees
GROUP BY merchant_category;

CREATE VIEW v_fee_summary_by_ticket_size AS
SELECT ticket_bucket, bucket_order,
       COUNT(*)                                                   AS txns,
       SUM(amount)                                                AS volume,
       COUNT(flat_rate_fee)                                       AS flat_priced_txns,
       SUM(flat_rate_fee)                                         AS flat_fees,
       SUM(flat_rate_fee) / NULLIF(SUM(CASE WHEN flat_rate_fee IS NOT NULL THEN amount END), 0)
                                                                  AS flat_eff_rate,
       COUNT(interchange_fee)                                     AS ic_priced_txns,
       SUM(interchange_fee)                                       AS ic_fees,
       SUM(interchange_fee) / NULLIF(SUM(CASE WHEN interchange_fee IS NOT NULL THEN amount END), 0)
                                                                  AS ic_eff_rate
FROM v_transaction_fees
GROUP BY ticket_bucket, bucket_order;

-- Which payment_method / card_type / channel combinations have no assumption.
CREATE VIEW v_fee_coverage AS
SELECT 'flat_rate' AS model, payment_method, card_type, channel,
       COUNT(*) AS txns, SUM(amount) AS volume
FROM v_transaction_fees WHERE flat_rate_fee IS NULL
GROUP BY payment_method, card_type, channel
UNION ALL
SELECT 'interchange', payment_method, card_type, channel, COUNT(*), SUM(amount)
FROM v_transaction_fees WHERE interchange_fee IS NULL
GROUP BY payment_method, card_type, channel;
