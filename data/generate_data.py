"""Generate synthetic Canadian merchant transactions with injected messy data.

Writes data/raw_transactions.csv. Output is deterministic for a given seed and
end date (the 12-month window ends on --end-date, default today).
"""
import argparse
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

SEED = 42
N_ROWS = 50_000
N_MERCHANTS = 320
MESSY_RATE = 0.03
OUT_PATH = Path(__file__).parent / "raw_transactions.csv"

COLUMNS = [
    "transaction_id", "date", "merchant_id", "merchant_name", "merchant_category",
    "province", "payment_method", "card_type", "amount", "status",
]

PROVINCES = {  # approximate share of population
    "ON": 38.0, "QC": 22.0, "BC": 14.0, "AB": 12.0, "MB": 3.6,
    "SK": 3.0, "NS": 2.6, "NB": 2.1, "NL": 1.4, "PE": 0.4,
}

# category -> (median ticket CAD, lognormal sigma, max ticket)
TICKET = {
    "grocery": (55, 0.70, 800),
    "restaurants": (38, 0.60, 600),
    "retail": (70, 0.90, 3000),
    "gas": (62, 0.40, 250),
    "professional services": (450, 1.00, 15000),
    "home services": (380, 1.00, 12000),
    "e-commerce": (85, 0.90, 4000),
    "health": (120, 0.80, 3000),
}

# category -> payment method weights (debit, credit, e-Transfer)
PAYMENT_MIX = {
    "grocery": (0.50, 0.45, 0.05),
    "restaurants": (0.40, 0.58, 0.02),
    "retail": (0.35, 0.60, 0.05),
    "gas": (0.40, 0.59, 0.01),
    "professional services": (0.15, 0.45, 0.40),
    "home services": (0.15, 0.40, 0.45),
    "e-commerce": (0.05, 0.85, 0.10),
    "health": (0.35, 0.50, 0.15),
}
PAYMENT_METHODS = ["debit", "credit", "e-Transfer"]
DECLINE_RATE = {"debit": 0.035, "credit": 0.055, "e-Transfer": 0.015}
PREMIUM_SHARE = 0.30

NAME_PARTS = {
    "grocery": (["Maple", "Fresh", "Prairie", "Harvest", "Northern", "Green Valley", "Sunrise", "Local"],
                ["Market", "Grocers", "Foods", "Supermarket", "Pantry"]),
    "restaurants": (["Golden", "Blue Heron", "Cedar", "Copper Kettle", "Lakeside", "Urban", "Old Town", "Red Oak"],
                    ["Bistro", "Grill", "Kitchen", "Diner", "Cafe", "Eatery"]),
    "retail": (["Northern", "Timber", "Everyday", "Maple Leaf", "Summit", "Harbour", "Modern", "Cornerstone"],
               ["Outfitters", "Goods", "Boutique", "Supply Co", "Emporium", "Mercantile"]),
    "gas": (["Trans-Canada", "Northstar", "Highway", "Polar", "Crossroads", "Prairie", "Lakeshore", "Ridge"],
            ["Fuels", "Gas Bar", "Petroleum", "Fuel Stop", "Auto Centre"]),
    "professional services": (["Bay Street", "Granville", "Crescent", "Sterling", "Pinnacle", "Fraser", "Laurier", "Meridian"],
                              ["Accounting", "Legal", "Consulting", "Advisors", "Engineering", "Partners"]),
    "home services": (["Reliable", "Frontier", "Ironwood", "Brightside", "Hearthstone", "Evergreen", "Cobalt", "Keystone"],
                      ["Plumbing", "Electric", "Roofing", "Landscaping", "HVAC", "Renovations"]),
    "e-commerce": (["Click", "Nimbus", "Parcel", "Loonie", "Boreal", "Swift", "Vista", "Arctic"],
                   ["Shop", "Direct", "Online", "Mart", "Depot", "Hub"]),
    "health": (["Wellspring", "Careway", "Vitality", "Lionsgate", "Rideau", "Willow", "Cascade", "Harmony"],
               ["Clinic", "Pharmacy", "Dental", "Physio", "Optometry", "Wellness"]),
}


def build_merchants(rng: np.random.Generator) -> pd.DataFrame:
    categories = list(NAME_PARTS)
    per_cat = N_MERCHANTS // len(categories)
    rows = []
    for cat in categories:
        prefixes, suffixes = NAME_PARTS[cat]
        combos = [f"{p} {s}" for p in prefixes for s in suffixes]
        names = rng.choice(combos, size=per_cat, replace=False)
        rows += [(name, cat) for name in names]
    merchants = pd.DataFrame(rows, columns=["merchant_name", "merchant_category"])
    merchants.insert(0, "merchant_id", [f"M{i:04d}" for i in range(1, len(merchants) + 1)])
    prov = list(PROVINCES)
    p = np.array(list(PROVINCES.values()))
    merchants["province"] = rng.choice(prov, size=len(merchants), p=p / p.sum())
    # skewed volume: a few big merchants, a long tail of small ones
    merchants["weight"] = rng.lognormal(0, 1.0, size=len(merchants))
    return merchants


def build_clean(rng: np.random.Generator, n: int, end: date) -> pd.DataFrame:
    merchants = build_merchants(rng)
    idx = rng.choice(len(merchants), size=n, p=merchants["weight"] / merchants["weight"].sum())
    df = merchants.iloc[idx].drop(columns="weight").reset_index(drop=True)

    # dates: last 365 days, mild weekend and December uplift
    days = pd.date_range(end=pd.Timestamp(end), periods=365, freq="D")
    w = 1 + 0.2 * (days.dayofweek >= 4) + 0.15 * (days.month == 12)
    df["date"] = days[rng.choice(len(days), size=n, p=w / w.sum())]
    df = df.sort_values("date", kind="stable").reset_index(drop=True)
    df["transaction_id"] = [f"TXN{i:09d}" for i in range(1, n + 1)]

    # payment method, card type, amount, status
    df["payment_method"] = ""
    df["amount"] = 0.0
    for cat, mix in PAYMENT_MIX.items():
        m = (df["merchant_category"] == cat).to_numpy()
        df.loc[m, "payment_method"] = rng.choice(PAYMENT_METHODS, size=m.sum(), p=mix)
        median, sigma, cap = TICKET[cat]
        amt = rng.lognormal(np.log(median), sigma, size=m.sum())
        df.loc[m, "amount"] = np.clip(amt, 1.0, cap).round(2)

    is_credit = (df["payment_method"] == "credit").to_numpy()
    card = rng.choice(["standard", "premium"], size=n, p=[1 - PREMIUM_SHARE, PREMIUM_SHARE])
    df["card_type"] = np.where(is_credit, card, None)

    decline_p = df["payment_method"].map(DECLINE_RATE).to_numpy()
    df["status"] = np.where(rng.random(n) < decline_p, "declined", "approved")

    df["date"] = df["date"].dt.strftime("%Y-%m-%d")
    df["amount"] = df["amount"].map("{:.2f}".format)  # strings so bad values can mix in
    return df[COLUMNS]


def inject_mess(df: pd.DataFrame, rng: np.random.Generator) -> tuple[pd.DataFrame, dict]:
    """Corrupt ~MESSY_RATE of the rows. Affected row sets are disjoint."""
    n = len(df)
    n_messy = round(MESSY_RATE * N_ROWS)
    # split of messy rows: 30% duplicates, 30% names, 20% amounts, 20% dates
    counts = {
        "duplicate_rows": round(n_messy * 0.30),
        "inconsistent_merchant_name": round(n_messy * 0.30),
        "malformed_amount": round(n_messy * 0.20),
        "malformed_date": round(n_messy * 0.20),
    }
    cuts = np.cumsum(list(counts.values()))
    pick = iter(np.split(rng.permutation(n)[: cuts[-1]], cuts[:-1]))
    dup_idx, name_idx, amt_idx, date_idx = (next(pick) for _ in counts)

    df = df.copy()
    detail = {}

    # merchant names: upper / lower / padded with extra spaces
    styles = rng.choice(["upper", "lower", "extra_spaces"], size=len(name_idx))
    for i, style in zip(name_idx, styles):
        name = df.at[i, "merchant_name"]
        if style == "upper":
            name = name.upper()
        elif style == "lower":
            name = name.lower()
        else:
            name = "  " + name.replace(" ", "  ") + " "
        df.at[i, "merchant_name"] = name
    detail["inconsistent_merchant_name"] = pd.Series(styles).value_counts().to_dict()

    # amounts: negative / text / blank
    kinds = rng.choice(["negative", "text", "blank"], size=len(amt_idx))
    text_vals = ["N/A", "abc", "TBD", "$--", "null"]
    for i, kind in zip(amt_idx, kinds):
        if kind == "negative":
            df.at[i, "amount"] = "-" + df.at[i, "amount"]
        elif kind == "text":
            df.at[i, "amount"] = rng.choice(text_vals)
        else:
            df.at[i, "amount"] = ""
    detail["malformed_amount"] = pd.Series(kinds).value_counts().to_dict()

    # dates: impossible calendar date / wrong format / text / blank
    kinds = rng.choice(["impossible_date", "wrong_format", "text", "blank"], size=len(date_idx))
    for i, kind in zip(date_idx, kinds):
        d = pd.Timestamp(df.at[i, "date"])
        if kind == "impossible_date":
            df.at[i, "date"] = f"{d.year}-02-30"
        elif kind == "wrong_format":
            df.at[i, "date"] = d.strftime("%d/%m/%Y")
        elif kind == "text":
            df.at[i, "date"] = rng.choice(["yesterday", "N/A", "unknown"])
        else:
            df.at[i, "date"] = ""
    detail["malformed_date"] = pd.Series(kinds).value_counts().to_dict()

    # duplicates: exact copies of untouched rows, dropped into random positions
    dups = df.iloc[dup_idx]
    df["_pos"] = np.arange(n, dtype=float)
    dups = dups.assign(_pos=rng.uniform(0, n, size=len(dups)))
    df = pd.concat([df, dups]).sort_values("_pos", kind="stable").drop(columns="_pos")
    return df.reset_index(drop=True), {"counts": counts, "detail": detail}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--end-date", type=date.fromisoformat, default=date.today(),
                        help="last day of the 12-month window (YYYY-MM-DD, default: today)")
    parser.add_argument("--seed", type=int, default=SEED)
    args = parser.parse_args()

    rng = np.random.default_rng(args.seed)
    n_dups = round(round(MESSY_RATE * N_ROWS) * 0.30)
    clean = build_clean(rng, N_ROWS - n_dups, args.end_date)  # duplicates bring total to N_ROWS
    out, report = inject_mess(clean, rng)
    out.to_csv(OUT_PATH, index=False)

    counts = report["counts"]
    total_messy = sum(counts.values())
    print(f"Wrote {len(out):,} rows to {OUT_PATH}")
    print(f"Window: {args.end_date - timedelta(days=364)} to {args.end_date}, seed={args.seed}")
    print(f"\nMessy rows injected: {total_messy:,} ({total_messy / len(out):.1%} of file)")
    for kind, c in counts.items():
        sub = report["detail"].get(kind)
        extra = "  " + ", ".join(f"{k}={v}" for k, v in sorted(sub.items())) if sub else ""
        print(f"  {kind:<28}{c:>6,}{extra}")

    # summary of the clean portion of the data
    print("\nCheck (clean rows only):")
    print(f"  decline rate: {(clean['status'] == 'declined').mean():.2%}")
    print("  payment method mix:", clean["payment_method"].value_counts(normalize=True).round(3).to_dict())
    print("  card_type non-null only for credit:",
          bool((clean["card_type"].notna() == (clean["payment_method"] == "credit")).all()))
    amt = clean["amount"].astype(float).groupby(clean["merchant_category"])
    print("\nTicket size by category (CAD):")
    print(amt.describe(percentiles=[0.5, 0.95])[["count", "mean", "50%", "95%", "max"]].round(2).to_string())


if __name__ == "__main__":
    main()
