import React, { useEffect, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, CartesianGrid } from 'recharts';
import { PieChart as PieIcon, BarChart3 } from 'lucide-react';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { CountUp, EmptyState, PageHeader, PageLoader } from '../components/ui';

const COLORS = ['#8b7cf6', '#34d399', '#e8c47c', '#2dd4bf', '#f87171', '#60a5fa', '#a4a9ba', '#f472b6'];

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="card px-3.5 py-2.5" style={{ background: 'var(--tooltip-bg)', boxShadow: 'var(--shadow-pop)' }}>
      <div className="text-[12px] faint">{label ?? item.name}</div>
      <div className="num font-bold text-[15px]" style={{ color: 'var(--text)' }}>{item.value}</div>
    </div>
  );
}

export default function Analytics() {
  const [chartsData, setChartsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { theme } = useTheme();

  useEffect(() => {
    async function loadCharts() {
      try {
        const res = await api.get('/analytics/charts');
        if (res.success) {
          setChartsData(res.data);
        }
      } catch (err) {
        console.error('Failed to load charts:', err);
      } finally {
        setLoading(false);
      }
    }
    loadCharts();
  }, []);

  if (loading) return <PageLoader label="Loading analytics" />;

  const statusData = chartsData?.statusChartData || [];
  const scoreData = chartsData?.scoreChartData || [];
  const totalLeads = statusData.reduce((sum, s) => sum + (s.value || 0), 0);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Insights"
        title="Analytics"
        subtitle="Where your leads stand and how well they qualify."
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 stagger">
        {/* Status breakdown */}
        <section className="card overflow-hidden" style={{ '--i': 0 }}>
          <div className="card-header">
            <div>
              <div className="card-title">
                <span className="icon-tile" style={{ width: 30, height: 30, borderRadius: 9 }}><PieIcon className="w-4 h-4" /></span>
                Lead pipeline
              </div>
              <div className="card-subtitle">Current status of every lead</div>
            </div>
          </div>

          {statusData.length === 0 ? (
            <EmptyState icon={PieIcon} title="No data yet" text="The breakdown appears once leads come in." />
          ) : (
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              <div className="relative h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      innerRadius={72}
                      paddingAngle={3}
                      stroke="none"
                      cornerRadius={6}
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="text-[30px] font-bold" style={{ color: 'var(--text)' }}><CountUp value={totalLeads} /></div>
                  <div className="eyebrow">Leads</div>
                </div>
              </div>

              <ul className="space-y-2.5 m-0 p-0 list-none">
                {statusData.map((s, index) => {
                  const pct = totalLeads ? Math.round((s.value / totalLeads) * 100) : 0;
                  return (
                    <li key={s.name} className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[index % COLORS.length] }} />
                        <span className="truncate muted capitalize">{String(s.name).toLowerCase().replace(/_/g, ' ')}</span>
                      </span>
                      <span className="num shrink-0" style={{ color: 'var(--text)' }}>
                        {s.value} <span className="faint text-[12px]">· {pct}%</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        {/* Score distribution */}
        <section className="card overflow-hidden" style={{ '--i': 1 }}>
          <div className="card-header">
            <div>
              <div className="card-title">
                <span className="icon-tile" style={{ width: 30, height: 30, borderRadius: 9 }}><BarChart3 className="w-4 h-4" /></span>
                Qualification scores
              </div>
              <div className="card-subtitle">How leads score after the AI evaluation</div>
            </div>
          </div>
          <div className="p-6 h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scoreData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="barIris" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a99dff" />
                    <stop offset="100%" stopColor="#5b46e6" stopOpacity={0.7} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={theme === 'light' ? 'rgba(24,20,60,0.08)' : 'rgba(255,255,255,0.06)'} />
                <XAxis dataKey="range" stroke="#6c7186" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis stroke="#6c7186" tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(139,124,246,0.08)' }} />
                <Bar dataKey="count" fill="url(#barIris)" radius={[10, 10, 4, 4]} maxBarSize={56} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}
