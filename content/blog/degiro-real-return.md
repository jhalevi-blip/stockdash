---
title: "DeGiro Doesn't Show Your Real Return — Here's How to Calculate It"
slug: degiro-real-return
date: '2026-06-04'
description: >-
  DeGiro shows you a green number, not your real return. Here's what it leaves
  out — currency, cash-flow timing, realized vs unrealized — and how to find the
  truth, free.
author: Jonathan Halevi
summary:
  tldr: >-
    The profit figure DeGiro shows is a simple return that mixes your
    stock-picking with the timing of your own deposits, hides currency effects,
    and blends banked gains with paper ones. The time-weighted return is the
    number that judges your decisions — and it can differ from the balance figure
    by several points.
  key_takeaways:
    - >-
      DeGiro's number is a simple return — flattered or punished by the timing of
      your own deposits.
    - >-
      Time-weighted return strips deposit timing out; it judges your decisions,
      not your savings rate.
    - >-
      For EU investors in US stocks, part of every gain is just EUR/USD —
      separate currency from stock performance.
    - >-
      Realized vs unrealized, a benchmark, and beta turn a return into a verdict:
      beating the index on higher risk isn't the same as skill.
  read_time_minutes: 8
faq:
  - question: Does DeGiro show your real return?
    answer: >-
      Not fully. DeGiro shows your current value and a simple gain versus what
      you put in, but no time-weighted return, no currency split, no
      realized-versus-unrealized breakdown and no benchmark comparison.
  - question: What is a time-weighted return (TWR)?
    answer: >-
      A return measure that splits your history into sub-periods at every deposit
      or withdrawal and links them together, so the timing of your own
      contributions can't flatter or punish the result. It measures how your
      decisions performed.
  - question: Why is my DeGiro balance gain different from my real return?
    answer: >-
      The balance gain is a simple return, which mixes market performance with
      the timing of your deposits. Money added just before a rally inflates it;
      the time-weighted return removes that effect.
  - question: How can I calculate my real return on DeGiro?
    answer: >-
      Export your Account Statement, rebuild positions with FIFO, convert each
      trade at its historical exchange rate, split the history at every cash flow
      and link the sub-period returns — or upload the file to a free tracker like
      StockDashes that does all of it automatically.
---

Open your DeGiro account and you get a number. A current portfolio value, and somewhere near it, a profit figure — usually green, hopefully large. It feels like the answer to the only question that matters: am I actually any good at this?

It isn't. That number is the start of the question, not the answer. It quietly hides at least three things that change the story completely, and once you've seen them you can't unsee them. I run a portfolio across DeGiro and Saxo myself, and the single figure my account shows me is off from my real return by about eight percentage points. Not a rounding error — a different conclusion about whether my decisions were any good.

Here's what DeGiro leaves out, why it matters, and how to find the number that actually tells you the truth.


## What DeGiro actually shows you

To be fair to DeGiro: it's a broker, not a performance-analytics tool, and it never claimed to be one. What it gives you is your current value and a basic gain or loss against what you put in. That's a simple return — end value versus money invested.

What it does not give you:

- A time-weighted return, which strips out the timing of your own deposits so you're judging your stock-picking and not your savings habits.
- Any separation of currency from stock performance — a big deal if, like most European investors, you hold US stocks in a euro account.
- A clean split between realized gains (banked) and unrealized gains (on paper).
- A benchmark, so you can't tell whether your number is good or just the market dragging you along.

Each of these can flip your read of your own performance. Let's take them one at a time, with real figures.


## Blind spot 1: the timing of your own money

This is the big one, and it's the least intuitive.

Say you start the year with €10,000 invested, the market drifts sideways, and then in autumn you get a bonus and drop in another €40,000 — right before a strong rally. Your account balance shoots up. Your simple return looks fantastic. But most of that gain happened on money that was only invested for a few weeks. Your stock selection didn't suddenly get better; your timing of contributions did.

The metric that corrects for this is the time-weighted return (TWR). It chops your history into sub-periods every time money goes in or out, measures the return within each, and links them together. The result answers a precise question: if I'd invested the same amount on day one and never added a cent, how would my choices have performed? It's the number professional funds are required to report, precisely because it can't be flattered by well-timed deposits.

Here's where it gets personal. My DeGiro-and-Saxo balance implies a total return of roughly +32% since I started tracking in mid-2025. Sounds great. But my time-weighted return over the same period is +24.5%. That eight-point gap isn't stock performance — it's entirely the timing of when I added money. The balance is telling me a flattering story. The TWR is telling me the true one.

If you've added to your account at uneven intervals — and almost everyone has — your simple return and your real return are not the same number.


## Blind spot 2: how much of your "gain" is just the dollar

If you're a European investor holding US stocks, every position you own is really two bets: one on the company, and one on EUR/USD. DeGiro reports the combined result in euros and never tells you which part did the work.

This matters more than people expect. Over my tracking period, currency movements added roughly €440 to my return — money that has nothing to do with whether I picked good companies. In a year where the dollar moves the other way, that same effect becomes a drag, and you'd be sitting there blaming your stock picks for something the foreign-exchange market did to you.

A real performance view separates the two: this much of your return came from your holdings, this much came from currency. Without that split, you can't tell skill from a tailwind, and you'll draw the wrong lessons in both directions.


## Blind spot 3: banked vs. paper

DeGiro lumps everything into one profit figure. But there's a world of difference between a gain you've realized — sold, locked in, possibly with a tax consequence — and one that's unrealized, still riding the market and able to evaporate next week.

My own split makes the point. My realized gains since I started tracking come to about €3,700 — that's banked. My unrealized gains are around €8,100 — real on screen, but still fully exposed to the next drawdown. Same portfolio, but those are two very different kinds of "profit." One is in the bank; the other is a number that the market can take back. A single blended figure hides which is which, and with it, hides how much of your "success" is still at risk.


## So what's your real return? It depends what you ask

Notice what just happened. One portfolio produced several legitimate, very different "returns" depending on the question:

- +32% — what my balance implies (simple return, flattered by deposit timing)
- +24.5% — my time-weighted return (my actual decisions)
- €3.7k realized vs €8.1k unrealized — banked vs. still at risk
- ~€440 of the total — currency, not stocks

The broker's single green number collapses all of that into one figure and picks the most flattering interpretation by default. That's not a conspiracy; it's just what a simple return does. But if you're using that number to decide whether you're good at investing — or whether to keep going, change strategy, or trust yourself with more money — you're deciding on the wrong data.


## The benchmark test (and an honest gut-check)

There's one more number that turns "a return" into "a good return": a benchmark. A +24.5% TWR feels great in isolation. Next to the S&P 500's roughly +21.5% over the same window, it's about three points ahead — a much more sober picture than the +32% balance suggested.

And here's the part most performance dashboards won't tell you, but you should want to know: my portfolio's beta is around 1.66, meaning it swings about two-thirds harder than the market. A lot of that three-point edge isn't clever stock-picking — it's simply taking more risk than the index. Risk-adjusted, I'm closer to "in line with the market with the volume turned up" than "beating the market." That's an uncomfortable thing to measure. It's also the single most useful thing I learned by calculating my return properly, and I'd never have seen it from the number DeGiro shows.

That's the whole argument for measuring this stuff: not to feel good, but to know what's actually happening so you can make better calls.


## How to calculate it yourself

You can do all of this by hand. Genuinely. Here's the honest version of what it takes:

1. Export your full transaction history from DeGiro (and Saxo, if you use both).
2. Rebuild every position from those transactions — buys, sells, fees, splits — using consistent FIFO accounting to separate realized from unrealized.
3. Convert every single trade to euros at that day's exchange rate, then separately track the FX effect so you can isolate currency from stock performance.
4. Break the whole history into sub-periods at every deposit and withdrawal, compute the return in each, and link them for your TWR.
5. Pull a benchmark series for the same dates and compare.

It's completely doable in a spreadsheet. It's also genuinely tedious, the broker exports are messier than you'd hope, and a single mis-sorted same-day trade can throw the whole thing off. I know, because I built software to do it after getting tired of doing it by hand.


## The shortcut

That software is StockDashes — a free, ad-free dashboard built specifically for DeGiro and Saxo users. You upload your transaction export, and it does all five steps above for you: time-weighted return, realized vs. unrealized in euros, currency impact broken out as its own line, and your performance against a benchmark — plus an AI summary of what it all means. No ads, nothing sold, no broker password handed over.

If you want the deeper walkthrough of the export step itself, see [the guide to exporting your DeGiro transaction history](/blog/degiro-export-guide), or go straight to [the DeGiro portfolio tracker](/).


## Frequently asked questions

**Does DeGiro show your real return?** Not fully. DeGiro shows your current value and a simple gain versus what you put in, but no time-weighted return, no currency split, no realized-versus-unrealized breakdown and no benchmark comparison.

**What is a time-weighted return (TWR)?** A return measure that splits your history into sub-periods at every deposit or withdrawal and links them together, so the timing of your own contributions can't flatter or punish the result. It measures how your decisions performed.

**Why is my DeGiro balance gain different from my real return?** The balance gain is a simple return, which mixes market performance with the timing of your deposits. Money added just before a rally inflates it; the time-weighted return removes that effect.

**How can I calculate my real return on DeGiro?** Export your Account Statement, rebuild positions with FIFO, convert each trade at its historical exchange rate, split the history at every cash flow and link the sub-period returns — or upload the file to a free tracker like StockDashes that does all of it automatically.


## The takeaway

The number your broker shows you isn't wrong, exactly — it's just answering an easier question than the one you're really asking. How much money is in my account is not the same as how good were my decisions. The gap between those two questions is where all the useful information lives: the deposit timing, the currency, the banked-versus-paper split, the comparison to just buying the index.

Look at your real return at least once. You might be doing better than you thought. You might be taking far more risk for the result than you realized. Either way, you'll finally be looking at the truth instead of the green number.
