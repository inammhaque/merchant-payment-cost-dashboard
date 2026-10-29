"""Run the full pipeline: CSV -> raw_transactions -> clean_transactions.

Prints the cleaning log (also stored in the cleaning_log table).
"""
import sqlite3

from load_raw import CSV_PATH, DATA_DIR, DB_PATH, load

CLEAN_SQL = DATA_DIR / "clean.sql"


def main() -> None:
    loaded = load()
    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript(CLEAN_SQL.read_text())
        log = conn.execute(
            "SELECT step, step_name, action, detail, row_count FROM cleaning_log ORDER BY seq"
        ).fetchall()
        final = conn.execute("SELECT COUNT(*) FROM clean_transactions").fetchone()[0]
        dropped = conn.execute(
            "SELECT COALESCE(SUM(row_count), 0) FROM cleaning_log WHERE action = 'dropped'"
        ).fetchone()[0]

    print(f"Source: {CSV_PATH.name} -> {DB_PATH.name}\n")
    print(f"{'step':<5}{'name':<16}{'action':<9}{'detail':<52}{'rows':>8}")
    print("-" * 90)
    for step, name, action, detail, n in log:
        print(f"{step:<5}{name:<16}{action:<9}{detail:<52}{n:>8,}")
    print("-" * 90)
    print(f"Raw rows {loaded:,} - dropped {dropped:,} = clean rows {final:,}")
    assert loaded - dropped == final, "row counts do not reconcile"


if __name__ == "__main__":
    main()
