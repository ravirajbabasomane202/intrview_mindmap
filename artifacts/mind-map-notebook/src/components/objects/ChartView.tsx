import { Area, AreaChart, Bar, BarChart, Cell, Line, LineChart, Pie, PieChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Scatter, ScatterChart, XAxis, YAxis, ZAxis } from 'recharts';
import { Tooltip as RTooltip } from 'recharts';
import { CanvasObject } from '../../types/canvas';

export function ChartView({ object }: { object: CanvasObject }) {
  const data = (object.chartData ?? []).map((point) => ({ name: point.label, value: point.value }));
  const chartColor = object.color || 'hsl(var(--chart-1))';
  const pieColors = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))', 'hsl(var(--chart-6))'];
  if (!data.length) return <div className="flex h-full w-full items-center justify-center text-xs opacity-60">No chart data yet</div>;
  if (object.chartKind === 'progress') {
    const point = data[0];
    const max = Math.max(...data.map((d) => d.value), point.value, 1);
    const pct = Math.max(0, Math.min(100, Math.round((point.value / max) * 100)));
    return <div className="flex h-full w-full flex-col justify-center gap-2 px-3">
      <div className="flex items-center justify-between text-xs font-semibold"><span>{point.name}</span><span style={{ color: chartColor }}>{pct}%</span></div>
      <div className="h-3 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'hsl(var(--muted-foreground)/.22)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: chartColor }} />
      </div>
    </div>;
  }
  if (object.chartKind === 'gauge') {
    const point = data[0];
    const max = Math.max(...data.map((d) => d.value), point.value, 1);
    const pct = Math.max(0, Math.min(100, (point.value / max) * 100));
    const angle = (pct / 100) * 180;
    const rad = (Math.PI / 180) * angle;
    const cx = 100, cy = 90, r = 78;
    const needleX = cx - r * Math.cos(rad);
    const needleY = cy - r * Math.sin(rad);
    return <div className="flex h-full w-full flex-col items-center justify-center">
      <svg viewBox="0 0 200 110" className="w-full max-w-[220px]">
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="hsl(var(--muted-foreground)/.22)" strokeWidth={14} strokeLinecap="round" />
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${needleX} ${needleY}`} fill="none" stroke={chartColor} strokeWidth={14} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={5} fill={chartColor} />
        <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke={chartColor} strokeWidth={2} />
      </svg>
      <p className="text-sm font-bold" style={{ color: chartColor }}>{Math.round(pct)}%</p>
      <p className="text-[11.5px] opacity-60">{point.name}</p>
    </div>;
  }
  return <ResponsiveContainer width="100%" height="100%">
    {object.chartKind === 'histogram'
      ? <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} />
          <RTooltip /><Bar dataKey="value" fill={chartColor} radius={[2, 2, 0, 0]} />
        </BarChart>
      : object.chartKind === 'radar'
      ? <RadarChart data={data} outerRadius="70%">
          <PolarGrid /><PolarAngleAxis dataKey="name" tick={{ fontSize: 10 }} /><PolarRadiusAxis tick={{ fontSize: 9 }} />
          <RTooltip /><Radar dataKey="value" stroke={chartColor} fill={chartColor} fillOpacity={0.4} />
        </RadarChart>
      : object.chartKind === 'line'
      ? <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} />
          <RTooltip /><Line type="monotone" dataKey="value" stroke={chartColor} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      : object.chartKind === 'area'
      ? <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} />
          <RTooltip /><Area type="monotone" dataKey="value" stroke={chartColor} fill={chartColor} fillOpacity={0.35} strokeWidth={2} />
        </AreaChart>
      : object.chartKind === 'scatter'
      ? <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <XAxis dataKey="name" type="category" tick={{ fontSize: 10 }} name="label" />
          <YAxis dataKey="value" type="number" tick={{ fontSize: 10 }} name="value" />
          <ZAxis range={[60, 60]} />
          <RTooltip cursor={{ strokeDasharray: '3 3' }} /><Scatter data={data} fill={chartColor} />
        </ScatterChart>
      : object.chartKind === 'pie'
      ? <PieChart>
          <RTooltip /><Pie data={data} dataKey="value" nameKey="name" outerRadius="80%" label>
            {data.map((_, index) => <Cell key={index} fill={pieColors[index % pieColors.length]} />)}
          </Pie>
        </PieChart>
      : object.chartKind === 'donut'
      ? <PieChart>
          <RTooltip /><Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2} label>
            {data.map((_, index) => <Cell key={index} fill={pieColors[index % pieColors.length]} />)}
          </Pie>
        </PieChart>
      : <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} />
          <RTooltip /><Bar dataKey="value" fill={chartColor} radius={[4, 4, 0, 0]} />
        </BarChart>}
  </ResponsiveContainer>;
}
