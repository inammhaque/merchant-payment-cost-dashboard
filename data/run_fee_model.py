"""Load fee_assumptions.csv, build the fee-model views, print summaries.

Requires clean_transactions (run run_pipeline.py first).

    python run_fee_model.py [--etransfer-fee 0.50]
"""
import argparse
import csv
import sqlite3

from load_raw import DATA_DIR, DB_PATH

ASSUMPTIONS_CSV = DATA_DIR / "fee_assumptions.csv"
FEE_SQL = DATA_DIR / "fee_model.sql"
NUMERIC = {"pct_fee", "flat_fee"}


def load_assumptions(conn: sqlite3.Connection) -> int:
    with open(ASSUMPTIONS_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    cols = list(rows[0])
    defs = ", ".join(f"{c} {'REAL' if c in NUMERIC else 'TEXT'}" for c in cols)
    conn.execute("DROP TABLE IF EXISTS fee_assumptions")
    conn.execute(f"CREATE TABLE fee_assumptions ({defs})")
    conn.executemany(
        f"INSERT INTO fee_assumptions VALUES ({', '.join('?' for _ in cols)})",
        [[float(r[c]) if c in NUMERIC else r[c] for c in cols] for r in rows],
    )
    return len(rows)


def fmt(col: str, v) -> str:
    if v is None:
        return "-"
    if col.endswith("rate"):
        return f"{v:.2%}"
    if col in ("volume", "flat_fees", "ic_fees"):
        return f"${v:,.0f}"
    if isinstance(v, int):
        return f"{v:,}"
    return str(v)


def show(conn: sqlite3.Connection, title: str, query: str) -> None:
    cur = conn.execute(query)
    cols = [d[0] for d in cur.description]
    rows = [[fmt(c, v) for c, v in zip(cols, r)] for r in cur.fetchall()]
    widths = [max([len(c)] + [len(r[i]) for r in rows]) for i, c in enumerate(cols)]
    print(f"\n{title}")
    if not rows:
        print("none")
        return
    print("  ".join(c.ljust(w) if i == 0 else c.rjust(w) for i, (c, w) in enumerate(zip(cols, widths))))
    for r in rows:
        print("  ".join(v.ljust(w) if i == 0 else v.rjust(w) for i, (v, w) in enumerate(zip(r, widths))))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--etransfer-fee", type=float, default=0.0,
                        help="per-transaction e-Transfer fee in CAD (default 0)")
    args = parser.parse_args()

    with sqlite3.connect(DB_PATH) as conn:
        n = load_assumptions(conn)
        conn.executescript(FEE_SQL.read_text())
        conn.execute("UPDATE fee_params SET value = ? WHERE name = 'etransfer_fee'", (args.etransfer_fee,))

        approved = conn.execute("SELECT COUNT(*) FROM clean_transactions WHERE status = 'approved'").fetchone()[0]
        priced_rows = conn.execute("SELECT COUNT(*) FROM v_transaction_fees").fetchone()[0]
        assert approved == priced_rows, f"join fan-out: {approved} approved vs {priced_rows} fee rows"

        print(f"Loaded {n} assumption rows; e-Transfer fee = ${args.etransfer_fee:.2f}; "
              f"{approved:,} approved transactions")
        show(conn, "Summary by payment method",
             "SELECT * FROM v_fee_summary_by_payment_method ORDER BY txns DESC")
        show(conn, "Summary by merchant category",
             "SELECT * FROM v_fee_summary_by_category ORDER BY volume DESC")
        show(conn, "Unpriced transactions (no matching assumption)",
             "SELECT * FROM v_fee_coverage ORDER BY model, volume DESC")


if __name__ == "__main__":
    main()
