-- Cleans raw_transactions into clean_transactions and records what happened in
-- cleaning_log. Each step builds a TEMP staging table from the previous one.
--
-- Assumptions:
--   * Wrong-format dates are DD/MM/YYYY (Canadian convention). If that reading
--     is not a real date but MM/DD/YYYY is, MM/DD is used. Ambiguous cases
--     (both valid) are counted in the log.
--   * Amounts are plain decimals; zero is kept, negatives are dropped.
--   * SQLite has no DATE type: dates are stored as ISO-8601 TEXT (enforced by a
--     CHECK constraint) and amount as REAL.

DROP TABLE IF EXISTS cleaning_log;
CREATE TABLE cleaning_log (
    seq       INTEGER PRIMARY KEY AUTOINCREMENT,
    step      INTEGER NOT NULL,
    step_name TEXT NOT NULL,
    action    TEXT NOT NULL,   -- info | fixed | dropped
    detail    TEXT NOT NULL,
    row_count INTEGER NOT NULL
);

INSERT INTO cleaning_log (step, step_name, action, detail, row_count)
SELECT 0, 'load', 'info', 'raw rows', COUNT(*) FROM raw_transactions;

-- STEP 1: remove exact duplicate rows (all columns identical), keep first -----
DROP TABLE IF EXISTS temp.stg_dedup;
CREATE TEMP TABLE stg_dedup AS
SELECT * FROM raw_transactions
WHERE rowid IN (
    SELECT MIN(rowid) FROM raw_transactions
    GROUP BY transaction_id, date, merchant_id, merchant_name, merchant_category,
             province, payment_method, card_type, amount, status
);

INSERT INTO cleaning_log (step, step_name, action, detail, row_count)
SELECT 1, 'dedup', 'dropped', 'exact duplicate rows',
       (SELECT COUNT(*) FROM raw_transactions) - (SELECT COUNT(*) FROM stg_dedup);
INSERT INTO cleaning_log (step, step_name, action, detail, row_count)
SELECT 1, 'dedup', 'info', 'transaction_ids still repeated (should be 0)',
       COUNT(*) - COUNT(DISTINCT transaction_id) FROM stg_dedup;

-- STEP 2: trim, collapse inner spaces, title-case merchant names --------------
-- Title case: capitalise the first letter after start / space / hyphen / slash /
-- ampersand / parenthesis, lowercase the rest. 'Hvac' is restored to 'HVAC'.
DROP TABLE IF EXISTS temp.name_map;
CREATE TEMP TABLE name_map AS
WITH RECURSIVE
src(raw, norm) AS (
    SELECT DISTINCT merchant_name,
           REPLACE(REPLACE(REPLACE(REPLACE(
               TRIM(merchant_name, ' ' || char(9) || char(10) || char(13)),
               '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' ')
    FROM stg_dedup
    WHERE merchant_name IS NOT NULL
),
tc(raw, norm, i, out) AS (
    SELECT raw, norm, 1, '' FROM src
    UNION ALL
    SELECT raw, norm, i + 1,
           out || CASE
                    WHEN i = 1 OR SUBSTR(norm, i - 1, 1) IN (' ', '-', '/', '&', '(')
                    THEN UPPER(SUBSTR(norm, i, 1))
                    ELSE LOWER(SUBSTR(norm, i, 1))
                  END
    FROM tc
    WHERE i <= LENGTH(norm)
)
SELECT raw, norm, REPLACE(out, 'Hvac', 'HVAC') AS clean
FROM tc
WHERE i = LENGTH(norm) + 1;

DROP TABLE IF EXISTS temp.stg_names;
CREATE TEMP TABLE stg_names AS
SELECT d.transaction_id, d.date, d.merchant_id,
       COALESCE(m.clean, d.merchant_name) AS merchant_name,
       d.merchant_category, d.province, d.payment_method, d.card_type,
       d.amount, d.status
FROM stg_dedup d
LEFT JOIN name_map m ON m.raw = d.merchant_name;

INSERT INTO cleaning_log (step, step_name, action, detail, row_count)
SELECT 2, 'merchant_names', 'fixed', 'rows with name changed',
       COUNT(*) FROM stg_dedup d JOIN name_map m ON m.raw = d.merchant_name
       WHERE m.clean <> d.merchant_name;
INSERT INTO cleaning_log (step, step_name, action, detail, row_count)
SELECT 2, 'merchant_names', 'fixed', '  of which whitespace trimmed/collapsed',
       COUNT(*) FROM stg_dedup d JOIN name_map m ON m.raw = d.merchant_name
       WHERE m.norm <> d.merchant_name;
INSERT INTO cleaning_log (step, step_name, action, detail, row_count)
SELECT 2, 'merchant_names', 'fixed', '  of which casing standardised',
       COUNT(*) FROM stg_dedup d JOIN name_map m ON m.raw = d.merchant_name
       WHERE m.clean <> m.norm;
INSERT INTO cleaning_log (step, step_name, action, detail, row_count)
SELECT 2, 'merchant_names', 'info', 'distinct names before',
       COUNT(DISTINCT merchant_name) FROM stg_dedup;
INSERT INTO cleaning_log (step, step_name, action, detail, row_count)
SELECT 2, 'merchant_names', 'info', 'distinct names after',
       COUNT(DISTINCT merchant_name) FROM stg_names;
INSERT INTO cleaning_log (step, step_name, action, detail, row_count)
SELECT 2, 'merchant_names', 'info', 'merchant_ids with >1 name after (should be 0)',
       COUNT(*) FROM (SELECT merchant_id FROM stg_names
                      GROUP BY merchant_id HAVING COUNT(DISTINCT merchant_name) > 1);

-- STEP 3: drop blank, non-numeric and negative amounts -----------------------
DROP TABLE IF EXISTS temp.stg_amount;
CREATE TEMP TABLE stg_amount AS
WITH t AS (
    SELECT s.*, TRIM(amount) AS v FROM stg_names s
),
u AS (
    SELECT t.*, CASE WHEN v GLOB '-*' THEN SUBSTR(v, 2) ELSE v END AS uns FROM t
)
SELECT u.*,
       CASE
         WHEN v IS NULL OR v = '' THEN 'blank'
         WHEN uns = '' OR uns GLOB '*[^0-9.]*' OR uns NOT GLOB '*[0-9]*'
              OR uns GLOB '*.*.*' THEN 'non-numeric'
         WHEN v GLOB '-*' THEN 'negative'
         ELSE 'valid'
       END AS amount_status
FROM u;

INSERT INTO cleaning_log (step, step_name, action, detail, row_count)
SELECT 3, 'amounts', 'dropped', c.k || ' amount',
       (SELECT COUNT(*) FROM stg_amount WHERE amount_status = c.k)
FROM (SELECT 'blank' AS k UNION ALL SELECT 'non-numeric' UNION ALL SELECT 'negative') c;

-- STEP 4: normalise dates to YYYY-MM-DD, drop blank / text / impossible -------
DROP TABLE IF EXISTS temp.stg_date;
CREATE TEMP TABLE stg_date AS
WITH t AS (
    SELECT s.*, TRIM(date) AS d FROM stg_amount s WHERE amount_status = 'valid'
),
p AS (
    SELECT t.*,
           CASE WHEN d GLOB '[0-9][0-9]/[0-9][0-9]/[0-9][0-9][0-9][0-9]'
                THEN SUBSTR(d, 7, 4) || '-' || SUBSTR(d, 4, 2) || '-' || SUBSTR(d, 1, 2)
           END AS dmy,
           CASE WHEN d GLOB '[0-9][0-9]/[0-9][0-9]/[0-9][0-9][0-9][0-9]'
                THEN SUBSTR(d, 7, 4) || '-' || SUBSTR(d, 1, 2) || '-' || SUBSTR(d, 4, 2)
           END AS mdy
    FROM t
),
c AS (
    SELECT p.*,
           CASE
             WHEN d IS NULL OR d = '' THEN 'blank'
             WHEN d GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
                  THEN CASE WHEN date(d) = d THEN 'ok' ELSE 'impossible' END
             WHEN dmy IS NOT NULL
                  THEN CASE WHEN date(dmy) = dmy OR date(mdy) = mdy
                            THEN 'reformatted' ELSE 'impossible' END
             ELSE 'text'
           END AS date_status
    FROM p
)
SELECT c.*,
       CASE date_status
         WHEN 'ok' THEN d
         WHEN 'reformatted' THEN CASE WHEN date(dmy) = dmy THEN dmy ELSE mdy END
       END AS clean_date
FROM c;

INSERT INTO cleaning_log (step, step_name, action, detail, row_count)
SELECT 4, 'dates', 'fixed', 'reformatted to YYYY-MM-DD',
       COUNT(*) FROM stg_date WHERE date_status = 'reformatted';
INSERT INTO cleaning_log (step, step_name, action, detail, row_count)
SELECT 4, 'dates', 'info', '  of which ambiguous DD/MM vs MM/DD (read as DD/MM)',
       COUNT(*) FROM stg_date
       WHERE date_status = 'reformatted' AND date(dmy) = dmy AND date(mdy) = mdy AND dmy <> mdy;
INSERT INTO cleaning_log (step, step_name, action, detail, row_count)
SELECT 4, 'dates', 'dropped', c.k || ' date',
       (SELECT COUNT(*) FROM stg_date WHERE date_status = c.k)
FROM (SELECT 'blank' AS k UNION ALL SELECT 'text' UNION ALL SELECT 'impossible') c;

-- STEP 5: build clean_transactions with proper types -------------------------
DROP TABLE IF EXISTS clean_transactions;
CREATE TABLE clean_transactions (
    transaction_id    TEXT PRIMARY KEY,
    date              TEXT NOT NULL CHECK (date = date(date)),  -- ISO-8601
    merchant_id       TEXT NOT NULL,
    merchant_name     TEXT NOT NULL,
    merchant_category TEXT NOT NULL,
    province          TEXT NOT NULL,
    payment_method    TEXT NOT NULL,
    card_type         TEXT,
    amount            REAL NOT NULL CHECK (amount >= 0),
    status            TEXT NOT NULL
);

INSERT INTO clean_transactions
SELECT transaction_id, clean_date, merchant_id, merchant_name, merchant_category,
       province, payment_method, NULLIF(card_type, ''), CAST(v AS REAL), status
FROM stg_date
WHERE date_status IN ('ok', 'reformatted')
ORDER BY transaction_id;

INSERT INTO cleaning_log (step, step_name, action, detail, row_count)
SELECT 5, 'finalize', 'fixed', 'blank card_type set to NULL',
       COUNT(*) FROM stg_date
       WHERE date_status IN ('ok', 'reformatted') AND card_type = '';
INSERT INTO cleaning_log (step, step_name, action, detail, row_count)
SELECT 5, 'finalize', 'info', 'final clean_transactions rows', COUNT(*) FROM clean_transactions;
