"""Create an empty SQLite database. Schema to be added."""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "payments.db"


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.close()
    print(f"Initialised {DB_PATH}")


if __name__ == "__main__":
    main()
