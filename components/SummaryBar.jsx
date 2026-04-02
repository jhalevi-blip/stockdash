import { usd, f, pctClass } from '@/lib/utils';

export default function SummaryBar({ rows, status, lastUpdated }) {
  const totVal  = rows.reduce((s, r) => s + (r.mktVal ?? r.basis), 0);
  const totCost = rows.reduce((s, r) => s + r.basis, 0);
  const totPnl  = totVal - totCost;
  const totPct  = totCost ? totPnl / totCost * 100 : 0;

  const dotCls = { live:'dot-live', loading:'dot-loading', error:'dot-error', idle:'dot-idle' }[status] ?? 'dot-idle';

  return (
    <div className="summary-bar">
      <div className="stat">
        <div className="stat-label">Portfolio Value</div>
        <div className="stat-value">{usd(totVal)}</div>
      </div>
      <div className="stat">
        <div className="stat-label">Cost Basis</div>
        <div className="stat-value">{usd(totCost)}</div>
      </div>
      <div className="stat">
        <div className="stat-label">Total P&L</div>
        <div className={`stat-value ${pctClass(totPnl)}`}>{usd(totPnl)}</div>
        <div className={`stat-sub ${pctClass(totPct)}`}>{totPct >= 0 ? '+' : ''}{f(totPct)}%</div>
      </div>
      <div className="stat">
        <div className="stat-label">Positions</div>
        <div className="stat-value">{rows.length}</div>
      </div>
      <div className="stat">
        <div className="stat-label">Status</div>
        <div className="stat-value" style={{ fontSize: 13 }}>
          <span className={`dot ${dotCls}`} />
          {status === 'live' ? `Live · ${lastUpdated}` : status === 'loading' ? 'Loading…' : status === 'error' ? 'Error' : 'Idle'}
        </div>
      </div>
    </div>
  );
}