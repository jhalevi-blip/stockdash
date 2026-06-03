---
title: "How to Export Your Transaction History from DeGiro (And What Every Column Means)"
slug: degiro-export-guide
date: 2026-06-03
description: >-
  The exact 2026 steps to export your full DeGiro history from one file, what
  every column means, and the traps that quietly break most return calculations.
author: Jonathan Halevi
summary:
  tldr: >-
    The DeGiro Account Statement already holds your trades, dividends, fees and
    deposits, so it's the only file you need. Export it as Excel or CSV over your
    full history, watch four parsing traps, and you have everything required to
    calculate your real return.
  key_takeaways:
    - >-
      The Account Statement is the only file you need — it contains your trades
      plus dividends, fees and deposits.
    - >-
      Export as Excel (XLSX) to avoid the semicolon and Dutch-decimal issues
      that affect the CSV version.
    - >-
      DeGiro never gives you cost basis or profit — you compute it yourself from
      the file.
    - >-
      Four traps quietly break most calculations: ISIN-not-ticker, deposits
      hidden in the description column, currency split across rows, and same-day
      trade ordering.
  read_time_minutes: 6
faq:
  - question: Which DeGiro file do I need to track my portfolio?
    answer: >-
      Just the Account Statement. It already contains your buys and sells along
      with dividends, fees and deposits, so you can ignore the separate
      Transactions export.
  - question: Should I export from DeGiro as CSV or Excel?
    answer: >-
      Either works. Excel (XLSX) is the easier choice because it avoids the
      semicolon separators and Dutch decimal formatting that can mangle the CSV
      version.
  - question: Why doesn't DeGiro show my profit per position?
    answer: >-
      DeGiro records what you bought and sold and what cash moved, but it never
      stores your cost basis. Profit or loss has to be calculated from the
      Account Statement yourself.
  - question: What date range should I export?
    answer: >-
      From the day you opened your account through today, so you capture your
      complete history in one file.
---

Sooner or later every DeGiro user needs their full history out of the platform — to file taxes, to calculate what they've actually earned, or to move into a tracker that shows more than a single green number. And sooner or later they discover the same thing: the file they need is buried in the menus, its columns are in Dutch no matter what language the app is set to, and nowhere in it is the one number they probably wanted — their profit or loss per position.

This guide fixes that. Below is the exact path to export the one file you need, a plain-English breakdown of every column, and the handful of traps that quietly corrupt most people's return calculations. I've built software that parses these exports, so the traps section is the stuff I learned the hard way.

---

## The only file you need: the Account Statement

Most guides — and most other trackers — tell you to export two separate files: a "Transactions" file for your trades and an "Account Statement" for everything else. You don't need to. The Account Statement is the complete ledger. It already contains your buys and sells, plus your dividends, fees, deposits, withdrawals, currency conversions and corporate actions, all in one file. The separate Transactions export is just a tidier-looking subset of data the Account Statement already holds. One file, full history — that's all it takes.

Here's how to export it:

1. Log into the DeGiro web platform on a desktop (the mobile app is more limited).
2. Open the **Inbox** icon in the left sidebar and choose **Account statement** — depending on your version it may sit under an **Activity** or **Reports** area instead.
3. Set the date range. For a complete picture, start from the day you opened your account and end today.
4. Click **Export** (top right) and choose **Excel (XLSX)** or **CSV** — both work. If you plan to open the file yourself, pick Excel; it avoids the formatting headaches below.

That's the whole export. You'll likely see a separate Transactions export sitting in the same menus — you can ignore it for tracking, because everything in it is already in the Account Statement.

If you exported as Excel, you can open it and it'll look fine. The two quirks below only apply to the CSV version, and they're the reason I'd reach for Excel unless you have a specific need for CSV:

- DeGiro's CSV uses semicolons as separators, not commas — so if you double-click it and the columns look mangled in Excel, that's why. Import it as a semicolon-delimited file.
- Numbers and dates in the CSV use Dutch formatting regardless of your app language: dates as `dd-MM-yyyy`, and a comma as the decimal separator (so `1.234,56` means one thousand two hundred thirty-four and fifty-six cents). This trips up a lot of spreadsheet imports.

---

## What every column means

The Account Statement crams every type of event into one table and leans on a Dutch description column to tell them apart. That description is the key to the whole file — it's what tells you whether a row is a buy, a sale, a dividend, a fee, a deposit or a corporate action. The main columns you'll see:

| Column | What it means |
|--------|---------------|
| Datum | The date of the event (dd-MM-yyyy) |
| Valutadatum | Value date — when the cash actually settled |
| Product | The stock or ETF the row relates to (blank for pure cash events) |
| ISIN | The instrument's international identifier — not a ticker (more on this below) |
| Omschrijving | The Dutch description — the field that classifies the row |
| FX | The exchange rate applied, when a currency conversion is involved |
| Mutatie | The amount of the event, in its own currency — your cash in or out |
| Saldo | Your running cash balance after the event |

A few things that live in that description column:

- **Deposits and withdrawals** — your own money in and out (often referencing iDEAL or a bank transfer).
- **Dividends** — and, separately, the dividend tax withheld on them.
- **Fees** — transaction costs, connection/exchange fees, currency-conversion charges.
- **Corporate actions** — mergers (you'll literally see `FUSIE`) and ISIN changes (`WIJZIGING ISIN`) when an instrument's identifier is reassigned.

The one thing the Account Statement does not give you is your cost basis or your profit. It tells you what you bought and sold and what cash moved — never what you actually made on a position. That you have to compute yourself, which brings us to where it goes wrong.

---

## The four traps that quietly break most return calculations

This is the part the other export guides skip. If you're rebuilding your performance from this file — by hand or in a spreadsheet — these are the things that will silently give you a wrong answer.

1. **ISIN is not a ticker.** DeGiro identifies every instrument by its ISIN (e.g. `US0378331005`), not its ticker (`AAPL`). If you want live prices or to match positions against a benchmark, you have to translate every ISIN to a ticker first. There's no ticker column to lean on.

2. **Your deposits are hiding in a text field — and not every match is real.** To separate your own contributions from market gains (essential for any honest return figure), you have to fish deposits out of that Dutch description column. The trap: if you just search the text for a keyword like "iDEAL", you'll also catch reservation and pending rows that look like deposits but aren't actual cash in. Those phantom deposits inflate your contributions and deflate your return. You need to match the exact row type, not just a substring.

3. **Currency is split across rows, not tidied into columns.** A foreign trade and its currency conversion show up as separate lines, each in its own currency, with the FX rate applied separately. If you treat a dollar amount as if it were euros — or apply today's exchange rate to a trade from two years ago — you corrupt both your total return and your ability to see how much of your gain was the stock versus the currency.

4. **Same-day round trips and row order.** DeGiro's files aren't guaranteed to be in chronological order, and if you process a same-day sell before its matching buy, your accounting briefly goes negative and you end up with a phantom open position that was never really open. Anything using FIFO to separate realized from unrealized gains has to sort correctly first.

None of these is exotic. They're just the difference between a number you can trust and one you can't.

---

## By hand, or the shortcut

You can absolutely do all of this in a spreadsheet. Export the Account Statement, translate the ISINs, strip out the phantom deposits, convert every trade at the right historical FX rate, sort everything chronologically, and run FIFO to get realized versus unrealized. It's a weekend the first time and an hour every month after.

Or you can skip it. StockDashes is a free, ad-free tracker built specifically for DeGiro (and Saxo) users. You drop in your Account Statement export and it does every step above for you — ISIN resolution, deposits-versus-trades, historical FX, fees, same-day ordering, and a proper time-weighted return against a benchmark, with an AI summary on top. Nothing sold, no broker password handed over.

If you want to understand why the numbers matter once you have them, read why DeGiro doesn't show your real return. And if you're a Saxo user too, the same field-by-field treatment for Saxo's report is here.

---

## Frequently asked questions

**Which DeGiro file do I need to track my portfolio?**
Just the Account Statement. It already contains your buys and sells along with dividends, fees and deposits, so you can ignore the separate Transactions export.

**Should I export from DeGiro as CSV or Excel?**
Either works. Excel (XLSX) is the easier choice because it avoids the semicolon separators and Dutch decimal formatting that can mangle the CSV version.

**Why doesn't DeGiro show my profit per position?**
DeGiro records what you bought and sold and what cash moved, but it never stores your cost basis. Profit or loss has to be calculated from the Account Statement yourself.

**What date range should I export?**
From the day you opened your account through today, so you capture your complete history in one file.

---

## The short version

DeGiro buries the one file you actually need — the Account Statement — under the Inbox menu. Export it as Excel or CSV across your full history and you've got every trade, dividend, fee and deposit in a single file; ignore the separate Transactions export, because everything in it is already here. The columns are in Dutch, the cost basis is missing on purpose, the CSV version comes semicolon-separated, and four small traps decide whether your numbers come out right. Get that one file, watch the traps, and you'll have the raw material for an honest view of your portfolio — instead of the single number the platform decided to show you.
