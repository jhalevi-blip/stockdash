---
title: "Understanding Your Saxo Portfolio Report: What Each Number Actually Means"
slug: understanding-your-saxo-portfolio-report
date: '2026-05-03'
description: >-
  A plain-English guide to Saxo's Portfolio Report — P/L (MtM), time-weighted
  return, and the currency math behind your numbers. With worked examples.
author: Jonathan Halevi
faq:
  - question: What does P/L (MtM) mean in Saxo Bank?
    answer: >-
      P/L (MtM) stands for Profit and Loss on a Mark-to-Market basis. It shows
      the difference between the current market value of your position and its
      cost basis (what you paid), using today's live or end-of-day prices.
      Unrealised P/L uses the current price; Realised P/L is locked in when you
      close a position. Mark-to-Market means the portfolio is revalued at every
      price tick — the number moves as the market moves.
  - question: Why is my time-weighted return different from my money-weighted return?
    answer: >-
      Time-weighted return (TWR) strips out the effect of when you added or
      withdrew cash, so it measures how well the portfolio itself performed.
      Money-weighted return (MWRR / IRR) weights performance by the size and
      timing of your cash flows, so a large deposit just before a downturn will
      drag the number down even if your stock picks were fine. TWR is the
      standard for comparing a manager's skill across different clients;
      money-weighted return is more relevant for your personal outcome.
  - question: How does Saxo calculate currency gains and losses?
    answer: >-
      Saxo converts all positions to your account's base currency using the
      exchange rate at the time of each transaction. When you later close a
      position or run the report, the same amount is converted at the current
      rate. The difference is your FX gain or loss, reported separately from the
      underlying instrument's P/L. This means a USD stock can show a positive
      price gain but a negative total return if the USD weakened against your
      base currency.
  - question: What is the difference between unrealised and realised P/L in Saxo?
    answer: >-
      Unrealised P/L is the paper gain or loss on positions you still hold —
      it changes every time the price moves and has no tax consequence until you
      sell. Realised P/L is locked in the moment you close a position and is
      what typically feeds into taxable income calculations. The Saxo Portfolio
      Report shows both figures, and the total P/L is the sum of the two.
  - question: Why does my Saxo portfolio return look different from the index return?
    answer: >-
      Several factors create the gap: your portfolio holds different stocks in
      different weights; cash drag reduces returns when you hold uninvested cash;
      FX moves affect the translated return; fees and transaction costs reduce
      net performance; and timing of purchases means you bought at different
      prices than the index rebalance dates assume. TWR eliminates cash-flow
      timing as a variable, but the other factors remain.
  - question: What is cost basis and how does Saxo set it?
    answer: >-
      Cost basis is the total amount you paid for a position, including
      commissions. Saxo uses the average-cost method by default: if you buy 10
      shares at €10 and later 10 more at €12, your cost basis is €11 per share
      (€220 total). This average resets each time you add to the position.
      Knowing your cost basis is essential for calculating true P/L and for tax
      reporting.
---

If you've ever exported the Portfolio Report from Saxo Bank and stared at a column labelled "P/L (MtM)" wondering what the parentheses mean, you're not alone. Saxo's reports are comprehensive, but the terminology assumes a level of financial literacy that most retail investors are still building. This guide walks through every major number in plain English — with worked examples — so you can read the report confidently.

## What the Portfolio Report Shows

The Saxo Portfolio Report is a snapshot (or period-level summary) of every position in your account: what you hold, what you paid, what it's worth now, and how performance is attributed. The key columns you'll see:

- **Open Price / Cost Basis** — what you paid
- **Current Price / Market Value** — what it's worth now
- **P/L (MtM)** — the gain or loss, marked to market
- **Return %** — percentage return on cost
- **Time-Weighted Return (TWR)** — performance metric adjusted for cash flows
- **FX P/L** — gain or loss attributable to currency movements
- **Unrealised / Realised P/L** — paper vs locked-in

---

## P/L (MtM): Mark-to-Market Explained

**Mark-to-Market (MtM)** simply means: value the position at today's market price, not at some historical or book value.

So "P/L (MtM)" = `(Current Market Value) − (Cost Basis)`.

> **Worked example:** You bought 50 shares of ASML at €700 each. Cost basis = €35,000. Today ASML trades at €820. Market value = €41,000. P/L (MtM) = **+€6,000**.

The word *unrealised* means this €6,000 only exists on paper — it will change tomorrow when the price moves. Once you sell those shares, the profit becomes *realised* and is locked in.

### Unrealised vs Realised

| Term | What it means | Changes with price? |
|------|--------------|---------------------|
| Unrealised P/L | Position still open | Yes — moves every tick |
| Realised P/L | Position closed | No — permanently recorded |

Your total P/L shown at the portfolio level is `Unrealised + Realised`. A portfolio with a large realised loss and a large unrealised gain can look flat at the total level — which is why reading them separately matters.

---

## Time-Weighted Return (TWR)

This is the number that tells you how good your stock-picking was, independent of how much money you added or withdrew.

### Why TWR Exists

Imagine two investors both using the same fund manager:

- **Investor A** puts in €10,000 in January, adds €50,000 in November (right before a bad December).
- **Investor B** puts in €60,000 in January and leaves it.

The fund manager made the same buy and sell decisions for both. But Investor A's personal return (money-weighted) looks terrible because of the badly-timed large deposit. TWR strips that out and shows both investors the same underlying portfolio performance.

### How TWR Is Calculated

TWR chains together sub-period returns, where each sub-period ends when cash flows in or out:

```
TWR = [(1 + R1) × (1 + R2) × ... × (1 + Rn)] − 1
```

Each R is the return for that sub-period before the next cash flow. This means TWR only measures price performance, not your personal deposit timing.

> **Worked example (simplified):**
> - Period 1 (no cash flow): portfolio grows from €10,000 to €11,000 → R1 = +10%
> - You deposit €5,000, now portfolio = €16,000
> - Period 2: portfolio drops from €16,000 to €14,400 → R2 = −10%
> - TWR = (1.10 × 0.90) − 1 = **−1%**
>
> Your money-weighted return is worse than −1% because the deposit came in at a high point. TWR correctly shows the portfolio itself lost 1% of value over the full period.

---

## Currency Math: FX P/L

If your account base currency is EUR and you hold US stocks, Saxo must convert USD-denominated gains and losses back to EUR. The FX P/L column isolates the currency effect.

### How the Translation Works

1. When you buy, Saxo records the cost in your base currency using that day's exchange rate.
2. When you sell (or on the report date for unrealised positions), the position is re-translated at the current exchange rate.
3. `FX P/L = (translated value at current rate) − (translated value at purchase rate)`

> **Worked example:**
> You buy $10,000 of Microsoft when EUR/USD = 1.10. Cost in EUR = €9,091.
> The stock rises 10% to $11,000. EUR/USD moves to 1.20 (EUR strengthened).
> Translated value at current rate: $11,000 / 1.20 = **€9,167**.
>
> - Stock P/L in USD: +$1,000 (+10%)
> - FX drag: EUR strengthened, so fewer euros per dollar
> - Stock P/L in EUR: €9,167 − €9,091 = **+€76** (barely positive)
>
> A 10% stock gain became less than 1% in EUR terms purely because of currency movement.

This is why Saxo separates FX P/L from underlying P/L — the two can easily move in opposite directions.

---

## Cost Basis and the Average-Cost Method

Saxo uses **average cost** by default. Every time you add to a position, the cost per share is recalculated:

```
New average cost = (existing shares × old avg cost + new shares × new price)
                   ÷ (existing shares + new shares)
```

> **Example:** You own 100 shares at €50 average cost (€5,000 total). You buy 50 more at €62 (€3,100). New average cost = (€5,000 + €3,100) / 150 = **€54.67**.

Partial sales reduce your quantity but do not change the average cost per share. The sold portion's P/L is booked as realised at the time of the sale.

---

## Other Numbers You'll See

### Return %

Simple percentage: `(P/L ÷ Cost Basis) × 100`. Does not account for time or cash flows. Useful for comparing position efficiency but not comparable to index benchmarks.

### Exposure / Market Value

The current total value of the position at market price. This is what the position would raise if sold now (before fees).

### Daily Change

The difference between yesterday's closing price and today's price (or current price for live data), applied to your held quantity. This feeds the "Today's P/L" number in dashboards like StockDashes.

---

## Reading the Report Holistically

A few things to check together rather than in isolation:

1. **TWR vs benchmark.** Compare your TWR to an index ETF (e.g., MSCI World) for the same period. If the index returned 12% TWR and your portfolio returned 8% TWR, your stock selection cost you 4 percentage points — regardless of how much cash you added.

2. **FX P/L as a share of total P/L.** If FX P/L is a large negative number and underlying P/L is positive, your returns are being silently eroded by currency. Consider whether your holding currency exposure is intentional.

3. **Unrealised P/L concentration.** If one position accounts for most of the unrealised gain, a single bad earnings print can move the whole portfolio significantly.

4. **Realised P/L year-to-date.** This is typically what matters for tax. Monitor it throughout the year, not just in December.

---

## Frequently Asked Questions

**What does P/L (MtM) mean in Saxo Bank?**
P/L (MtM) is your profit or loss calculated at the current market price (Mark-to-Market). It shows how much you'd gain or lose if you closed the position right now.

**Why is my TWR different from what I "feel" my return is?**
TWR strips out cash-flow timing. Your personal (money-weighted) return reflects when you actually invested. If you deposited cash before a downturn, your personal return is lower than TWR — that's the deposit timing, not poor market performance.

**Does Saxo include dividends in the P/L?**
Cash dividends received are not included in the standard P/L (MtM) figure for the position — they appear as separate cash transactions. TWR, if calculated on the full account, will include them only if the cash is reinvested. Always check the "Income" section of the report separately.

**Can I export the Saxo Portfolio Report to analyse in StockDashes?**
Yes — you can re-enter tickers and quantities in StockDashes to get an AI-powered analysis on top of the data. The platform runs Claude Opus 4.7 analysis on your holdings and generates a Portfolio Intelligence summary with correlation analysis, risk flags, and sector breakdown.

---

*StockDashes is for informational purposes only and does not constitute financial or tax advice. Portfolio report mechanics may vary by account type and jurisdiction. Consult Saxo's official documentation and your tax adviser for definitive guidance.*
