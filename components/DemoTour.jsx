"use client";
import { useEffect } from "react";
import "driver.js/dist/driver.css";

const TOUR_CSS = `
  .sd-tour-popover.driver-popover {
    background: #1a1f2e;
    border: 1px solid #30363d;
    border-radius: 10px;
    box-shadow: 0 16px 48px rgba(0,0,0,0.65);
    padding: 20px 22px 16px;
    max-width: 300px;
    font-family: inherit;
  }
  .sd-tour-popover .driver-popover-title {
    font-size: 15px;
    font-weight: 700;
    color: #f0f6fc;
    margin-bottom: 8px;
    line-height: 1.3;
  }
  .sd-tour-popover .driver-popover-description {
    font-size: 13px;
    color: #8b949e;
    line-height: 1.6;
  }
  .sd-tour-popover .driver-popover-footer {
    margin-top: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .sd-tour-popover .driver-popover-progress-text {
    font-size: 11px;
    color: #484f58;
  }
  .sd-tour-popover .driver-popover-navigation-btns {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .sd-tour-popover .driver-popover-next-btn {
    display: inline-block;
    background: #3b82f6;
    border: none;
    border-radius: 6px;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    padding: 7px 16px;
    cursor: pointer;
    box-shadow: none;
    text-shadow: none;
  }
  .sd-tour-popover .driver-popover-next-btn:hover {
    background: #2563eb;
  }
  .sd-tour-popover .driver-popover-prev-btn {
    display: inline-block;
    background: none;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #8b949e;
    font-size: 13px;
    padding: 7px 14px;
    cursor: pointer;
    box-shadow: none;
    text-shadow: none;
  }
  .sd-tour-popover .driver-popover-prev-btn:hover {
    border-color: #8b949e;
    color: #e6edf3;
  }
  .sd-tour-popover .driver-popover-close-btn {
    color: #484f58;
    font-size: 18px;
    top: 10px;
    right: 12px;
  }
  .sd-tour-popover .driver-popover-close-btn:hover {
    color: #8b949e;
  }
  .sd-tour-popover .driver-popover-arrow-side-top::before    { border-top-color:    #1a1f2e !important; }
  .sd-tour-popover .driver-popover-arrow-side-bottom::before { border-bottom-color: #1a1f2e !important; }
  .sd-tour-popover .driver-popover-arrow-side-left::before   { border-left-color:   #1a1f2e !important; }
  .sd-tour-popover .driver-popover-arrow-side-right::before  { border-right-color:  #1a1f2e !important; }
`;

const STEPS = [
  {
    element: '[data-tour="portfolio-ai-summary-cta"]',
    popover: {
      title: "Claude analyzes your portfolio",
      description: "Rating, concentration risk, winners, and laggards. All in plain English, powered by Claude Opus 4.7.",
      side: "top",
    },
  },
  {
    element: '[data-tour="stock-intel-tab"]',
    popover: {
      title: "AI analysis for any stock",
      description: "Click any position for a full Claude analysis: bull case, bear case, valuation, and insider activity.",
      side: "top",
      align: "start",
    },
  },
  {
    element: '[data-tour="nav-tabs"]',
    popover: {
      title: "Deep data on every holding",
      description: "13F filings, SEC reports, insider trades, peer comparisons. All free, no paywalls.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="edit-portfolio"]',
    popover: {
      title: "Make it yours",
      description: "Add your own tickers and let Claude analyze them. Sign up to save permanently.",
      side: "bottom",
      align: "end",
    },
  },
];

export default function DemoTour() {
  useEffect(() => {
    const isDemo   = localStorage.getItem("stockdash_demo") === "true";
    const tourDone = localStorage.getItem("stockdash_tour_done");
    if (!isDemo || tourDone) return;

    const timer = setTimeout(async () => {
      // Only run on the dashboard where these elements exist
      if (!document.querySelector('[data-tour="portfolio-ai-summary"]')) return;

      const { driver } = await import("driver.js");

      const driverObj = driver({
        popoverClass: "sd-tour-popover",
        showProgress: true,
        allowClose: true,
        steps: STEPS,
        onDestroyed: () => {
          localStorage.setItem("stockdash_tour_done", "true");
        },
      });

      driverObj.drive();
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  return <style>{TOUR_CSS}</style>;
}
