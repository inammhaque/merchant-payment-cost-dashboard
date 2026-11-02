# Findings: shifting card payments to e-Transfer

Scope: a 20% shift of card (credit and debit) transactions to e-Transfer, approved transactions only. Figures use the flat-rate model unless stated, and come from [`scenario_results.md`](scenario_results.md). The data is synthetic (see Caveats).

## 1. Two categories hold two-thirds of the savings

Home services and professional services account for $22.2K of the $33.0K total savings at a $0 e-Transfer fee, or 67%. They make up only 21% of card transactions (8,080 of 38,666).

Their savings also hold up when e-Transfer carries a fee. At $1.50 per transaction they fall about 11%, from $22.2K to $19.7K. (Under the interchange model the same pair falls about 20%, from $12.1K to $9.7K.)

The reason is ticket size. These two categories have the highest average tickets, $637 and $737. Card fees are mostly a percentage of the amount, so a large ticket carries a large fee to avoid, while a flat e-Transfer fee costs the same on any ticket.

## 2. Low-ticket categories lose money once e-Transfer has a fee

| Category | Average ticket | First fee at which savings turn negative |
|---|---|---|
| Restaurants | $45.58 | $1.00 flat-rate (-$195); interchange is already near zero at $0.50 (+$1.34) |
| Gas | $67.11 | $1.50 flat-rate (-$377); $1.00 interchange (-$376) |
| Grocery | $71.33 | $1.50 flat-rate (-$376); $1.00 interchange (-$301) |

Retail also turns negative under interchange at $1.50 (-$286).

The cause is that these average tickets sit close to the break-even point. At $1.50, e-Transfer is only cheaper than in-person credit for tickets above $60, and cheaper than in-person debit above $191. Restaurants' average is below the credit threshold, and gas and grocery are barely above it. All three are far below the $191 debit threshold, so their debit volume pulls savings negative even where credit alone would break even.

## 3. A per-transaction fee hurts most where card rates are already low

Moving the e-Transfer fee from $0 to $1.50 cuts total savings by 35% under the flat-rate model ($33.0K to $21.4K), but by 63% under the interchange model ($18.5K to $6.9K). Interchange rates are lower, so there is less card fee to avoid and the same flat fee takes a bigger share.

Merchants who negotiate lower card rates have the weakest case if e-Transfer carries a flat fee. How e-Transfer is priced matters as much as whether merchants adopt it.

## Recommendation

**Target segment: home and professional services.** They produce the most savings, hold up best against a fee, and already invoice their customers, so they don't need a tap-to-pay experience.

**Product idea:** an e-Transfer request-money or invoicing flow built for service businesses. Keep the cost to the merchant at $0, or charge a percentage rather than a flat fee, so lower-ticket payments aren't penalised.

**Adoption reality (qualitative, not from the data):** e-Transfer has no point-of-sale tap experience. Restaurants, gas and grocery are poor fits whatever the cost.

## Caveats

- The high service tickets and the payment mix come from the data generator's assumptions. The results show how the model behaves under those assumptions, not real market data.
- Averages hide the spread. Some restaurant tickets are above the break-even point, and some service tickets are below it.
- The interchange model is a floor: it excludes network assessments and processor markup. Visa rates in it are from before Oct 24, 2026, and its debit rates reuse the Square flat-rate figures.
- Existing e-Transfer volume is held at its current fee ($0) in every scenario. Only the shifted transactions pay the scenario fee.
