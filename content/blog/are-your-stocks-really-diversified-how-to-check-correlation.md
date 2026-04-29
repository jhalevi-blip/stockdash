---
title: Are Your Stocks Really Diversified? How to Check Correlation
slug: are-your-stocks-really-diversified-how-to-check-correlation
date: '2026-04-29'
description: Most investors think holding more stocks means more diversification. The truth is most retail portfolios are far more correlated than they look. Here's how to spot it.
author: Jonathan Halevi
summary:
  tldr: Diversification isn't about how many stocks you own — it's about whether they move together. A portfolio with 10 different tech stocks isn't diversified, it's one bet on tech with extra steps. The real risks are sector correlation (multiple stocks in the same industry), theme correlation (different sectors riding the same narrative, like AI infrastructure), and macro correlation (different stocks all reacting to the same economic input, like interest rates). The post walks through all three traps with a worked example of a portfolio that looks diversified across five sectors but is really a single bet on AI capex, and then shows three ways to check correlation in your own portfolio.
  key_takeaways:
    - >-
      The number of stocks you own barely matters; what matters is how correlated
      they are. Five stocks across five sectors can still be one bet.
    - >-
      Three correlation traps catch most retail investors: sector (obvious), theme
      (same narrative across sectors), and macro (same economic input).
    - >-
      Real diversification means different sectors, different themes, and different
      macro sensitivities — not just different ticker symbols.
  read_time_minutes: 12
---

You can own ten stocks across five sectors and still be making one bet — you just don't realize what the bet is. Most retail investors don't see it until a market move exposes the pattern, and by then it's too late to react cheaply.

This post is about the most invisible risk in your portfolio: correlation. The reason your "diversified" holdings keep dropping together when the market turns. The reason adding more stocks often doesn't reduce risk as much as you think. And how to actually check it before you find out the hard way.

## What Is Stock Correlation?

Correlation measures how two stocks move relative to each other. It's a number between -1 and +1.

- **+1**: the two stocks move perfectly in sync. When one goes up 5%, the other goes up 5%.
- **0**: no relationship. They move independently.
- **-1**: they move in perfect opposition. When one goes up, the other goes down.

In real markets, almost no two stocks have correlation of 0 or -1. Most stocks in the same broad market have positive correlation with each other to some degree, because they all respond to the same overall economic environment. The question isn't whether your stocks are correlated — they are. The question is *how* correlated, and whether you realize it.

A correlation of 0.3 between two stocks is mild. A correlation of 0.85 means they're effectively one position with two names. Most retail investors hold stocks with much higher correlation than they think.

## Why "More Stocks" Isn't the Same as "More Diversified"

Here's where most retail diversification advice goes wrong.

The classic rule says "own at least 20 stocks to be diversified." It sounds reasonable. It's also misleading. If you own 20 stocks but they're all large-cap US tech, you don't have 20 bets — you have one bet on large-cap US tech, expressed 20 different ways. When that trade reverses, every position drops together.

This is the central trap of correlation. You can do everything that *looks* like diversification — different companies, different industries, different countries — and still end up with a portfolio that behaves like a single position because all your holdings respond to the same underlying driver.

**Rule of thumb**: diversification is measured by how *differently* your holdings behave, not by how many you have.

## A Portfolio That Looks Diversified But Isn't

Consider this five-stock portfolio:

- **NVIDIA (NVDA)** — semiconductors
- **Microsoft (MSFT)** — software
- **Vertiv (VRT)** — industrials, makes data center cooling equipment
- **Constellation Energy (CEG)** — utilities, supplies nuclear power to data centers
- **Taiwan Semiconductor (TSM)** — international, semiconductor manufacturing

On paper this looks beautifully diversified. Five different stocks, five different sectors (semiconductors, software, industrials, utilities, international). A reasonable retail investor looking at this would conclude they're well-spread.

In reality, every single one of these companies rises and falls with the same thing: corporate spending on AI infrastructure. NVIDIA sells the chips. Microsoft buys the chips for Azure. Vertiv cools the data centers that house the chips. Constellation powers them. TSM manufactures them. They are five different ways of betting on the same theme.

If AI capex slows — because earnings disappoint, regulation tightens, or sentiment turns — all five drop together. The "diversification" was an illusion.

## The Three Correlation Traps

Most retail investors fall into one of three traps. Once you see them, you can't unsee them.

**Sector correlation** is the obvious one. If 60% of your portfolio is tech, you're a tech investor regardless of how many tech names you own. Five different software companies don't diversify each other meaningfully — they all respond to the same sector dynamics: interest rates, AI sentiment, enterprise IT budgets.

**How to spot it**: group your holdings by sector. If any sector is more than 35-40% of your portfolio, you have sector concentration even if you own dozens of stocks within it.

**Theme correlation** is the trap most retail investors miss. Theme correlation happens when stocks across different sectors all ride the same narrative. The five-stock portfolio above is a textbook example: five sectors, one theme.

Other common theme clusters:

- **EV transition**: Tesla, Rivian, Albemarle (lithium), CATL, charging infrastructure stocks. Different sectors, one bet.
- **GLP-1 / weight loss drugs**: Novo Nordisk, Eli Lilly, contract manufacturers, the food companies that drop on every Lilly earnings beat. Different sectors, one bet.
- **Reshoring / industrial buildout**: industrial REITs, construction equipment, electrical infrastructure, US-focused industrials. Different sectors, one bet.

**How to spot it**: ask what news headline would move every position in your portfolio. If a single story (AI slowdown, GLP-1 setback, rate cut delay) would hit half your holdings, that's theme correlation.

**Macro correlation** is the least obvious. Macro correlation is when different stocks across different sectors all respond to the same economic input — usually interest rates, but also the dollar, oil prices, or recession fear.

Examples of stocks that look unrelated but move together on a macro variable:

- **Rate-sensitive cluster**: regional banks, REITs, unprofitable growth stocks, utilities. When the Fed surprises hawkish, all four often drop together despite operating in completely different industries.
- **Dollar-sensitive cluster**: gold, emerging market equities, US multinationals with overseas revenue. All move when the dollar strengthens or weakens.
- **Recession-sensitive cluster**: consumer discretionary, industrials, semis, freight stocks. All drop together when recession fear rises.

**How to spot it**: think about what would happen to each position if the Fed cut rates by 50bp tomorrow. If your "diversified" portfolio would all move in the same direction, you have macro correlation.

## How to Check Correlation in Your Portfolio

Three methods, in order of effort.

**Method 1: The Eyeball Test.** The fastest, most useful first pass. You don't need a tool — you need to be honest.

For each of your holdings, write down:

- **Sector**
- **Primary theme** (what's the bull thesis in one phrase)
- **Macro driver** (what economic variable does this stock care about most)

Now look at the table. If most of your stocks share a sector, theme, or macro driver, you have correlation. The eyeball test catches 80% of the problem with 5 minutes of work.

**Method 2: A Correlation Matrix.** For a quantitative check, you can run an actual correlation matrix on your holdings using historical price data. Free tools include Portfolio Visualizer (portfoliovisualizer.com) and the correlation matrix feature in most stock screeners.

You input your tickers, choose a time period (1-3 years works well), and get a grid showing the correlation between every pair of stocks. Anything above 0.7 is meaningfully correlated. Anything above 0.85 is essentially one position.

If you run this and most of your pairwise values land in the 0.75-0.9 range, you don't have a diversified portfolio — you have multiple expressions of the same trade.

The downside of this method: historical correlation isn't predictive. Two stocks can have low historical correlation and then start moving together when a new macro regime kicks in (e.g., the rate-hike cycle starting in 2022 made many previously uncorrelated stocks suddenly correlated).

**Method 3: Use AI.** AI tools can analyze a portfolio holistically — looking at sector overlap, theme overlap, and macro sensitivity at the same time, and surfacing insights a correlation matrix alone can miss. Tools like StockDashes do this by analyzing your full portfolio at once and translating the hidden correlation into plain English: where it lives, why it's there, and what to consider doing about it.

## What "Real Diversification" Looks Like

A genuinely diversified portfolio has variation across three axes:

- **Different sectors**, with weights that don't drift far from broad market norms (the S&P 500 sits at roughly 30% tech, 13% healthcare, 12% financials, 10% consumer discretionary). The further you stray from those baselines without a deliberate reason, the more concentrated your sector correlation gets.
- **Different themes**, so your portfolio doesn't depend on a single narrative being right.
- **Different macro sensitivities**, so your holdings don't all respond to the same economic input. Ideally a small allocation to assets that often move opposite to equities — bonds, gold, cash — to break correlation when stress hits.

The number of stocks barely matters. A 10-stock portfolio that spans different sectors, themes, and macro drivers is more diversified than a 30-stock portfolio that's all tech.

## What to Do If You're Too Correlated

Don't panic-sell. Concentration that's already there is a tax problem as much as a portfolio problem — selling triggers gains, and the cure shouldn't be worse than the disease.

The practical playbook:

- **Stop adding to the correlated theme.** Direct new contributions toward different sectors, themes, or macro buckets.
- **Trim gradually.** If a single theme is more than 50% of your portfolio, scale it down over time, especially during strong periods when capital gains hit but emotional pain is lower.
- **Add positions that break the dominant driver in your portfolio.** If you're heavy in AI infrastructure, add rate-sensitive defensives or cash-flow-rich value stocks. If you're heavy in growth, add positions whose earnings don't depend on falling rates. The point isn't generic diversification — it's specifically diluting the variable that currently drives most of your portfolio.
- **Set a rule and follow it.** "No theme more than 40% of equities" is a simple rule that prevents drift. Without rules, concentration accumulates automatically because winners grow.

## FAQs

**Is correlation the same as diversification?**
No. Diversification is the goal; correlation is the metric you use to measure how well you've achieved it. A portfolio is diversified to the extent that its holdings have low correlation with each other. You can own many stocks and still be undiversified if they're all highly correlated.

**What's a "good" correlation level for a portfolio?**
There's no universal number, but as a rule of thumb: pairwise correlations above 0.85 mean two stocks are essentially one position, 0.7-0.85 means they're meaningfully linked, and below 0.5 means they're genuinely behaving differently. A well-diversified portfolio has most pairs below 0.7 and includes at least a few that move independently.

**Do bonds always reduce correlation?**
Usually, but not always. Bonds and stocks have historically been negatively correlated, especially during recessions, which makes bonds a useful diversifier. But during inflationary shocks (like 2022), bonds and stocks fell together. Treat the stock-bond correlation as "usually negative, occasionally positive" rather than guaranteed.

**Can two stocks in the same sector have low correlation?**
Yes, but it's rare. Two stocks in the same sector typically have correlations of 0.6-0.8 because they share so many drivers. Lower correlation tends to require very different business models within the sector — for example, a payments company and a regional bank are both "financials" but respond to different macro inputs.

**How often should I check correlation?**
A thorough check once or twice a year is enough for most long-term investors. Always re-check after a major macro regime change (new rate cycle, new dominant market theme, recession), because correlations shift over time. Stocks that were uncorrelated five years ago may move in lockstep today.

**Does correlation change over time?**
Yes, significantly. Correlations rise during stress (the "diversification fails when you need it most" problem) and fall during calm periods. They also shift with macro regimes — the rate-hike cycle starting in 2022 increased correlation across most equities because rates became the dominant variable for everything. Don't treat any correlation calculation as permanent.

## Final Thoughts

The number of stocks in your portfolio is one of the least useful diversification metrics. The relationships between your stocks — across sectors, themes, and macro drivers — are what actually determine how diversified you are.

Most retail investors look at their account, see twelve different tickers, and conclude they're spread out. Then a single piece of news drops half the portfolio together and the illusion breaks. Avoid that surprise by understanding your correlation now, not during the drawdown.

The investors who stay calm in corrections aren't the ones with twenty stocks. They're the ones who actually know how their stocks relate to each other.

## Try It Yourself

Skip the manual work. Get an instant AI breakdown of your portfolio at [StockDashes](https://stockdashes.com).
