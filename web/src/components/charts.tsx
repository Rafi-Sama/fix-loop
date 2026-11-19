/** Chart primitives in the pad's palette. Single-series charts need no legend; multi-series always get one. */
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/** Hex, not CSS vars: Recharts writes these into SVG attributes. Validated order; never cycle. */
export const SERIES = ['#2f5fc4', '#d08a00', '#c8457a', '#1aa3b8', '#7a5cc8', '#2f9a5a'];

const axis = { stroke: '#676c75', fontSize: 11.5, tickLine: false, axisLine: false } as const;

function Tip({ active, payload, label, format }: { active?: boolean; payload?: { value: number; name?: string; payload?: { name?: string } }[]; label?: string; format: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]!;
  return (
    <div className="chart-tip">
      <b>{label ?? p.payload?.name ?? p.name}</b>
      {format(p.value)}
    </div>
  );
}

export interface Slice {
  name: string;
  value: number;
  color: string;
}

/** Donut with the total in the hole; the legend doubles as the direct labels. */
export function Donut({ data, total, caption, format = String, size = 168 }: { data: Slice[]; total: string; caption: string; format?: (n: number) => string; size?: number }) {
  const shown = data.filter((d) => d.value > 0);
  return (
    <div className="hstack" style={{ gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ width: size, height: size, position: 'relative' }} role="img" aria-label={`${caption}: ${data.map((d) => `${d.name} ${format(d.value)}`).join(', ')}`}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={shown.length ? shown : [{ name: 'None', value: 1, color: '#ebe8df' }]} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" stroke="#ffffff" strokeWidth={2} paddingAngle={shown.length > 1 ? 1 : 0} isAnimationActive animationDuration={700}>
              {(shown.length ? shown : [{ color: '#ebe8df' }]).map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            {shown.length > 0 && <Tooltip content={<Tip format={format} />} />}
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 720, fontStretch: '90%', lineHeight: 1 }}>{total}</div>
            <div className="small muted">{caption}</div>
          </div>
        </div>
      </div>
      <ul className="chart-legend" style={{ flexDirection: 'column', listStyle: 'none', padding: 0, gap: 8 }}>
        {data.map((d) => (
          <li key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i style={{ background: d.color, border: '1px solid rgb(0 0 0 / .2)' }} />
            <span style={{ minWidth: 90 }}>{d.name}</span>
            <b style={{ color: 'var(--ink)' }}>{format(d.value)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Vertical bars for one series; the latest bar is highlighted. */
export function Bars({ data, format, height = 200, highlightLast = true, color = '#1c3f94' }: { data: { label: string; value: number }[]; format: (n: number) => string; height?: number; highlightLast?: boolean; color?: string }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="#ebe8df" />
          <XAxis dataKey="label" {...axis} interval="preserveStartEnd" />
          <YAxis {...axis} width={56} tickFormatter={format} allowDecimals={false} />
          <Tooltip cursor={{ fill: 'rgb(28 63 148 / .06)' }} content={<Tip format={format} />} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={44} animationDuration={600}>
            {data.map((_, i) => (
              <Cell key={i} fill={highlightLast && i === data.length - 1 ? '#1c3f94' : color} fillOpacity={highlightLast && i !== data.length - 1 ? 0.55 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal ranked bars (top N), label left, value right. Pure HTML: crisp, accessible, cheap. */
export function Ranked({ data, format, color = '#1c3f94' }: { data: { label: string; value: number }[]; format: (n: number) => string; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="muted small">No data for this period.</p>;
  return (
    <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 9 }}>
      {data.map((d) => (
        <li key={d.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 32%) 1fr auto', gap: 10, alignItems: 'center' }}>
          <span className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.label}>
            {d.label}
          </span>
          <div className="meter" style={{ height: 10 }}>
            <i style={{ width: `${(Math.max(0, d.value) / max) * 100}%`, background: color }} />
          </div>
          <b className="small" style={{ minWidth: 64, textAlign: 'right' }}>
            {format(d.value)}
          </b>
        </li>
      ))}
    </ul>
  );
}

export function Trend({ data, format, height = 220 }: { data: { label: string; value: number }[]; format: (n: number) => string; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1c3f94" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#1c3f94" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#ebe8df" />
          <XAxis dataKey="label" {...axis} />
          <YAxis {...axis} width={56} tickFormatter={format} />
          <Tooltip cursor={{ stroke: '#676c75', strokeDasharray: '3 3' }} content={<Tip format={format} />} />
          <Area type="monotone" dataKey="value" stroke="#1c3f94" strokeWidth={2} fill="url(#trend-fill)" dot={{ r: 4, fill: '#ffffff', strokeWidth: 2 }} activeDot={{ r: 5 }} animationDuration={700} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
