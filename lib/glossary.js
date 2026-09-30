// Plain-language explanations for the finance jargon shown around the app, surfaced
// via the InfoTip (ⓘ) component next to a term. Wording is aimed at a non-professional
// European retail investor (one short line each). This is the single source of truth —
// edit the copy here and every tooltip that references the key updates.
//
// Source: .scratch/ux-audit/proposals.md § (a).
//
// Usage:  import { GLOSSARY } from '@/lib/glossary';
//         <InfoTip id="twr" />            // looks up GLOSSARY.twr

export const GLOSSARY = {
  twr: {
    term: 'Time-weighted return (TWR)',
    text: "Your portfolio's return with the timing of your deposits and withdrawals removed — how your investments performed, regardless of when you added money. The right figure to compare with an index.",
  },
  mwr: {
    term: 'Money-weighted return (IRR / MWR)',
    text: "Your personal return as a yearly percentage, which does count when and how much you deposited or withdrew. Above the time-weighted return means your deposit timing helped; below means it hurt.",
  },
  sharpe: {
    term: 'Sharpe ratio',
    text: "Return above a risk-free rate (such as a savings account), per unit of volatility. Higher is better: more reward for each bit of bumpiness.",
  },
  maxDrawdown: {
    term: 'Max drawdown',
    text: "The largest peak-to-trough drop your portfolio has suffered — a feel for the worst pain along the way.",
  },
  dcf: {
    term: 'DCF (Discounted Cash Flow)',
    text: "An estimate of what a company is worth today based on the cash it's expected to earn in future, discounted back to today's money.",
  },
  wacc: {
    term: 'WACC',
    text: "The discount rate — the average return investors expect from the company, used to convert future cash into today's value. Higher WACC → lower valuation.",
  },
  terminalGrowth: {
    term: 'Terminal growth',
    text: "The modest growth rate assumed forever after the forecast years — usually close to long-run economic growth (about 2–3%). Small changes here move the valuation a lot.",
  },
  beta: {
    term: 'Beta',
    text: "How much a stock tends to move relative to the whole market. 1 = moves with the market; >1 = more jumpy; <1 = steadier.",
  },
  correlation: {
    term: 'Correlation',
    text: "How closely two holdings move together, from +1 (in lockstep) to −1 (opposite). Low/negative pairs are your real diversifiers.",
  },
  shortInterest: {
    term: 'Short interest',
    text: "The share of a company's freely tradable shares that traders have sold short — bet on a fall. High means many expect a drop, but it can also fuel sharp rises when short sellers are forced to buy back.",
  },
};
