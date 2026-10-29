"""Load data/raw_transactions.csv into SQLite as table raw_transactions.

Every column is loaded as TEXT, exactly as it appears in the CSV (blanks stay
empty strings), so all cleaning happens in SQL (see clean.sql).
"""
import csv
import sqlite3
from pathlib import Path

DATA_DIR = Path(__file__).parent
CSV_PATH = DATA_DIR / "raw_transactions.csv"
DB_PATH = DATA_DIR / "payments.db"


def load(csv_path: Path = CSV_PATH, db_path: Path = DB_PATH) -> int:
    """Replace raw_transactions with the CSV contents; return rows loaded."""
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = list(reader)

    cols = ", ".join(f'"{c}" TEXT' for c in header)
    placeholders = ", ".join("?" for _ in header)
    with sqlite3.connect(db_path) as conn:
        conn.execute("DROP TABLE IF EXISTS raw_transactions")
        conn.execute(f"CREATE TABLE raw_transactions ({cols})")
        conn.executemany(f"INSERT INTO raw_transactions VALUES ({placeholders})", rows)
    return len(rows)


if __name__ == "__main__":
    print(f"Loaded {load():,} rows into {DB_PATH.name}:raw_transactions")
