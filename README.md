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
```

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
