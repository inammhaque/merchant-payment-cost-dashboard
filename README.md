# Merchant Payment Cost Dashboard

A dashboard for analysing the cost of merchant payments.

## Structure

| Directory | Purpose |
|-----------|---------|
| `data/`   | Python scripts and the SQLite database |
| `server/` | Node/Express API serving data from SQLite |
| `client/` | React + Vite + Recharts frontend |

## Prerequisites

- Python 3.10+
- Node.js 18+

## Getting started

### Data
```bash
cd data
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python init_db.py
python generate_data.py   # -> raw_transactions.csv (synthetic, includes messy rows)
python run_pipeline.py    # load into payments.db, run clean.sql, print cleaning log
python run_fee_model.py   # fee_assumptions.csv -> fee views, prints summaries
python run_fee_model.py --etransfer-fee 0.50   # test a per-transaction e-Transfer fee
```

The pipeline loads `raw_transactions`, then `clean.sql` produces `clean_transactions`
(typed `amount` REAL, ISO `date`) and a `cleaning_log` table.

### Fee model notes

The `interchange` model prices interchange only. It excludes card-network
assessments and processor markup, so treat it as a floor, not an all-in
merchant cost. Compare it with `flat_rate`, which is an all-in provider price.
Some interchange rows reuse flat-rate figures (see `notes` in
`fee_assumptions.csv`), e.g. Interac debit, which is not interchange-priced.

### Server
```bash
cd server
npm install
npm run dev   # http://localhost:3001
```

### Client
```bash
cd client
npm install
npm run dev   # http://localhost:5173
```

## Roadmap

_TBD_
