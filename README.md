# Merchant Payment Cost Dashboard

**The question:** if some of a merchant's card payments moved to Interac e-Transfer, how much would they save on processing fees, and for which kinds of merchants and ticket sizes does it work?

The project builds 50,000 synthetic Canadian merchant transactions, cleans them in SQL, prices every approved transaction under two models (a flat-rate provider and card-network interchange), and puts the result in a dashboard with a scenario slider that shifts a share of card volume to e-Transfer at a per-transaction fee of $0 to $1.50.

## Tech stack

| Layer | Tools |
|---|---|
| Data | Python 3.10+, pandas, numpy, SQLite (cleaning and fee model are plain SQL) |
| API | Node.js 18+, Express, better-sqlite3 (read-only) |
| Dashboard | React 18, Vite, Recharts |

## Project structure

| Path | Contents |
|---|---|
| `data/` | `generate_data.py`, `load_raw.py`, `clean.sql`, `run_pipeline.py`, `fee_assumptions.csv`, `fee_model.sql`, `run_fee_model.py`, `scenario_report.py`; the SQLite database `payments.db` is generated here |
| `server/` | Express API (`src/routes/summary.js`, `src/routes/scenario.js`) |
| `client/` | React dashboard (summary charts and the scenario panel) |
| `docs/` | `findings.md` (write-up), `scenario_results.md` (generated tables) |

## Setup and run

Prerequisites: Python 3.10+ and Node.js 18+. Run the steps in this order, because the server reads the database the data steps build.

### 1. Data pipeline

```bash
cd data
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python generate_data.py   # writes raw_transactions.csv (fixed seed, 3% messy rows)
python run_pipeline.py    # loads payments.db, runs clean.sql, prints the cleaning log
python run_fee_model.py   # loads fee_assumptions.csv, builds the fee views, prints summaries
```

`python run_fee_model.py --etransfer-fee 0.50` sets the e-Transfer fee assumed for existing e-Transfer volume (default $0). `payments.db` and `raw_transactions.csv` are generated and git-ignored.

### 2. Server

```bash
cd server
npm install
npm run dev   # http://localhost:3001
```

### 3. Client

```bash
cd client
npm install
npm run dev   # http://localhost:5173 (proxies /api to the server)
```

### API

All endpoints accept `model` (`flat_rate`, the default, or `interchange`), `category` and `ticket_bucket`.

- `GET /api/summary/method`, `/api/summary/category`, `/api/summary/ticket`: fees, volume and effective rate.
- `GET /api/filters`: valid categories and ticket buckets.
- `GET /api/scenario?shift_pct=0-50&etransfer_fee=0-1.50`: shifts that share of card (credit and debit) transactions to e-Transfer, proportionally and deterministically. `savings = shift x card fees - shift x card transactions x e-Transfer fee`. Also returns savings by category and break-even ticket sizes, `(e-Transfer fee - card flat fee) / card percentage fee`.

### Regenerate the scenario tables

With the server running, `python scenario_report.py` from `data/` rewrites `docs/scenario_results.md` (20% shift at $0, $0.50, $1.00 and $1.50, both models).

## Data cleaning results

`clean.sql` takes 50,000 raw rows to 49,019 clean rows. Counts come from the `cleaning_log` table.

| Step | Action | Rows affected | Rows remaining |
|---|---|---:|---:|
| Raw load | | | 50,000 |
| 1. Duplicates | Dropped exact duplicate rows | 450 | 49,550 |
| 2. Merchant names | Trimmed, collapsed spaces and title-cased (142 whitespace, 308 casing); 608 distinct names became 320 | 450 fixed | 49,550 |
| 3. Amounts | Dropped blank (101), non-numeric (95) and negative (104) amounts | 300 dropped | 49,250 |
| 4. Dates | Reformatted wrong-format dates to YYYY-MM-DD (19 were ambiguous DD/MM vs MM/DD and read as DD/MM) | 69 fixed | 49,250 |
| 4. Dates | Dropped blank (79), text (64) and impossible (88) dates | 231 dropped | 49,019 |
| **Final** | `clean_transactions` | | **49,019** |

Blank `card_type` values (23,217 non-credit rows) were also set to NULL. Of the 49,019 clean rows, 47,005 are approved and are the ones priced.

## Fee assumptions

Fee = amount x percentage + flat fee. Channel is online for e-commerce and in person for every other category. Declined transactions are excluded. Rates live in `data/fee_assumptions.csv`.

| Model | Method | Card type | Channel | Rate | Source and basis |
|---|---|---|---|---:|---|
| Flat rate | debit | – | In person | 0.75% + $0.07 | [Square fees](https://squareup.com/ca/en/payments/our-fees); Square Interac debit |
| Flat rate | debit | – | Online | 2.90% + $0.30 | [Square fees](https://www.square.com/ca/en/payments/our-fees); Square Online incl. Interac debit via Apple/Google Pay |
| Flat rate | credit | standard | In person | 2.50% + $0.00 | [Square fees](https://squareup.com/ca/en/payments/our-fees); Square flat rate all cards |
| Flat rate | credit | premium | In person | 2.50% + $0.00 | [Square fees](https://squareup.com/ca/en/payments/our-fees); Square flat rate all cards |
| Flat rate | credit | standard | Online | 2.80% + $0.30 | [Square fees](https://squareup.com/ca/en/payments/our-fees); Square online |
| Flat rate | credit | premium | Online | 2.80% + $0.30 | [Square fees](https://squareup.com/ca/en/payments/our-fees); Square online |
| Interchange | debit | – | In person | 0.75% + $0.07 | [Square fees](https://squareup.com/ca/en/payments/our-fees); Interac debit not interchange-priced; reuses Square flat rate |
| Interchange | debit | – | Online | 2.90% + $0.30 | [Square fees](https://www.square.com/ca/en/payments/our-fees); reuses Square online debit rate |
| Interchange | credit | standard | In person | 1.09% + $0.00 | Visa 1.25% (Helcim) / MC Core 0.92% (Mastercard, May 2026); avg of networks; Visa rates pre-Oct 24 2026 |
| Interchange | credit | premium | In person | 1.57% + $0.00 | Visa Infinite 1.57% (Helcim) / MC World Elite 1.56% (Mastercard, May 2026); avg of networks; Visa rates pre-Oct 24 2026 |
| Interchange | credit | standard | Online | 1.51% + $0.00 | [Fiserv Canada interchange rates](https://merchants.fiserv.com/content/dam/firstdata/ca/en/pdf/FD_Canada_InterchangeRates_CurrentRates.pdf); avg MC Digital Commerce Core 1.67% / Visa CNP token Classic 1.35% |
| Interchange | credit | premium | Online | 1.87% + $0.00 | [Fiserv Canada interchange rates](https://merchants.fiserv.com/content/dam/firstdata/ca/en/pdf/FD_Canada_InterchangeRates_CurrentRates.pdf); avg MC Digital Commerce World Elite 2.13% / Visa CNP token Infinite 1.60% |
| Both | e-transfer | – | Any | 0.00% + $0.00 | [BMO business terms](https://www.bmo.com/main/business/accounts/terms-and-conditions-en.html); $0 to receive at major banks; sensitivity $0-1.50 |

The e-Transfer receive fee is a parameter (default $0), tested from $0 to $1.50.

## Findings

Full write-up: [`docs/findings.md`](docs/findings.md). Underlying tables: [`docs/scenario_results.md`](docs/scenario_results.md). Numbers are for a 20% shift under the flat-rate model unless stated.

1. **Two categories hold two-thirds of the savings.** Home services and professional services produce $22.2K of the $33.0K total (67%) from 21% of card transactions, and hold up when e-Transfer has a fee ($22.2K to $19.7K at $1.50). Their average tickets are the highest ($637 and $737).
2. **Low-ticket categories lose money once e-Transfer has a fee.** Restaurants (average ticket $45.58) turn negative at $1.00, and gas and grocery at $1.50 (earlier under interchange). At $1.50, e-Transfer only beats in-person credit above $60 and debit above $191.
3. **A per-transaction fee hurts most where card rates are already low.** Going from $0 to $1.50 cuts total savings by 35% under flat-rate ($33.0K to $21.4K) and by 63% under interchange ($18.5K to $6.9K).

**Recommendation:** target home and professional services with an e-Transfer request-money or invoicing flow built for service businesses, keeping the merchant's receive cost at $0 or priced as a percentage rather than a flat fee. Restaurants, gas and grocery are poor fits regardless of cost, because e-Transfer has no tap-to-pay experience at the point of sale (a qualitative point, not from the data).

## Screenshots

_Placeholders; add images under `docs/screenshots/`._

- **Dashboard overview** (KPI cards, effective rate by payment method and ticket size, fees by category): `docs/screenshots/dashboard.png`
- **Interchange model with a category filter**: `docs/screenshots/dashboard-interchange.png`
- **Scenario panel** (sliders, savings by category, break-even ticket sizes): `docs/screenshots/scenario.png`
- **Dark mode**: `docs/screenshots/dashboard-dark.png`

## Limitations

- **Synthetic data.** The transactions come from a seeded generator (seed 42). Ticket sizes, payment mix, decline rates and the messy rows are its assumptions, so the results show how the model behaves, not real market data.
- **Rates are published or averaged figures, not negotiated ones.** Interchange rows average two networks, and Visa rates are from before Oct 24, 2026. The interchange model covers interchange only (no network assessments or processor markup), so it is a floor, not an all-in cost. Debit under interchange reuses the Square flat-rate figures.
- **The shift model is deliberately simple.** Shifted transactions mirror the card mix and ticket sizes, with no adoption limits, refunds, chargebacks, monthly fees or e-Transfer operating costs. Existing e-Transfer volume stays at its current fee.
- **Averages hide the spread.** Category averages are shown next to break-even points, but some tickets in every category sit on either side.
- **Date handling.** Wrong-format dates are read as DD/MM/YYYY. 19 of the 69 were ambiguous.
- **Scope.** Canadian dollars, approved transactions only, a 12-month window ending 2026-10-31. There are no automated tests; the numbers were checked with ad-hoc scripts that are not in the repo.
