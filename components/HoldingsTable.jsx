import { usd, f, pctClass } from '@/lib/utils';

export default function HoldingsTable({ rows, totVal, onSelect, selected }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th className="left">Ticker</th>
            <th className="left">Name</th>
            <th>Shares</th><th>Avg Cost</th><th>Price</th>
            <th>Chg %</th><th>Cost Basis</th><th>Mkt Value</th>
            <th>P&L $</th><th>P&L %</th>
            <th>52W High</th><th>52W Low</th>
            <th>Alloc</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const fromHigh = r.week52High && r.price ? ((r.price - r.week52High) / r.week52High * 100) : null;
            const fromLow  = r.week52Low  && r.price ? ((r.price - r.week52Low)  / r.week52Low  * 100) : null;
            return (
              <tr key={r.t} onClick={() => onSelect(r.t)}
                style={{ outline: r.t === selected ? '1px solid #58a6ff' : 'none' }}>
                <td className="tkr left">{r.t}</td>
                <td className="left">{r.n}</td>
                <td>{f(r.s, 0)}</td>
                <td>${f(r.c)}</td>
                <td className="price-val">{r.price ? '$' + f(r.price) : '—'}</td>
                <td className={pctClass(r.chgPct)}>
                  {r.chgPct != null ? (r.chgPct >= 0 ? '+' : '') + f(r.chgPct) + '%' : '—'}
                </td>
                <td>{usd(r.basis)}</td>
                <td>{r.mktVal != null ? usd(r.mktVal) : '—'}</td>
                <td className={pctClass(r.pnl)}>{usd(r.pnl)}</td>
                <td className={pctClass(r.pnlPct)}>
                  {r.pnlPct != null ? (r.pnlPct >= 0 ? '+' : '') + f(r.pnlPct) + '%' : '—'}
                </td>
                <td>
                  {r.week52High ? (
                    <span>
                      ${f(r.week52High)}
                      {fromHigh != null && <span className={pctClass(fromHigh)} style={{fontSize:10,marginLeft:4}}>
                        {fromHigh >= 0 ? '+' : ''}{f(fromHigh)}%
                      </span>}
                    </span>
                  ) : '—'}
                </td>
                <td>
                  {r.week52Low ? (
                    <span>
                      ${f(r.week52Low)}
                      {fromLow != null && <span className="pos" style={{fontSize:10,marginLeft:4}}>
                        +{f(fromLow)}%
                      </span>}
                    </span>
                  ) : '—'}
                </td>
                <td>{f((r.mktVal ?? r.basis) / totVal * 100, 1)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="note">Click any row to view 1-year chart. 52W columns show % distance from annual high/low.</p>
    </div>
  );
}