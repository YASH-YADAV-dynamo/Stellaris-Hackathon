'use client';

import { useMemo } from 'react';
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Filler,
  Tooltip,
  ChartOptions,
  ChartData,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Line } from 'react-chartjs-2';
import { HistoryPoint } from '@/types/orderbook';
import styles from './Chart.module.css';

ChartJS.register(LineElement, PointElement, LinearScale, TimeScale, Filler, Tooltip);

interface ImbalanceChartProps {
  history: HistoryPoint[];
  darkMode: boolean;
}

export default function ImbalanceChart({ history, darkMode }: ImbalanceChartProps) {
  const c = darkMode
    ? { grid: '#1e1e2e', tick: '#4a5568', border: '#2d2d42', tooltipBg: '#111118', tooltipBorder: '#2d2d42', tooltipTitle: '#94a3b8', tooltipBody: '#e2e8f0' }
    : { grid: '#e2e8f0', tick: '#64748b', border: '#cbd5e1', tooltipBg: '#ffffff', tooltipBorder: '#e2e8f0', tooltipTitle: '#64748b', tooltipBody: '#0f172a' };

  const bidColor = darkMode ? '#00ff88' : '#059669';
  const askColor = darkMode ? '#ff3366' : '#dc2626';

  const data: ChartData<'line'> = useMemo(() => ({
    datasets: [
      {
        data: history.map(p => ({ x: p.t, y: parseFloat((p.imbalance * 100).toFixed(2)) })),
        borderColor: (ctx) => {
          const chart = ctx.chart;
          const { ctx: canvasCtx, chartArea } = chart;
          if (!chartArea) return bidColor;
          const gradient = canvasCtx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, bidColor);
          gradient.addColorStop(0.5, darkMode ? '#888888' : '#94a3b8');
          gradient.addColorStop(1, askColor);
          return gradient;
        },
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
        fill: false,
      },
    ],
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [history, darkMode]);

  const options: ChartOptions<'line'> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: {
      x: {
        type: 'time',
        time: { unit: 'second', displayFormats: { second: 'HH:mm:ss' } },
        grid: { color: c.grid, lineWidth: 1 },
        ticks: {
          color: c.tick,
          font: { family: 'var(--font-mono)', size: 10 },
          maxTicksLimit: 8,
        },
        border: { color: c.border },
      },
      y: {
        min: -100,
        max: 100,
        grid: {
          color: (ctx) => ctx.tick.value === 0 ? (darkMode ? '#333344' : '#cbd5e1') : c.grid,
          lineWidth: 1,
        },
        ticks: {
          color: c.tick,
          font: { family: 'var(--font-mono)', size: 10 },
          callback: (v) => `${Number(v) > 0 ? '+' : ''}${v}%`,
          maxTicksLimit: 7,
        },
        border: { color: c.border },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: c.tooltipBg,
        borderColor: c.tooltipBorder,
        borderWidth: 1,
        titleColor: c.tooltipTitle,
        bodyColor: c.tooltipBody,
        titleFont: { family: 'var(--font-mono)', size: 10 },
        bodyFont: { family: 'var(--font-mono)', size: 11 },
        callbacks: {
          label: (ctx) => {
            const y = ctx.parsed.y ?? 0;
            return ` ${y > 0 ? '+' : ''}${y.toFixed(1)}%`;
          },
        },
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [darkMode]);

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>IMBALANCE</span>
        <span className={styles.panelSub}>60s WINDOW · 100ms RESOLUTION</span>
      </div>
      <div className={styles.chartArea}>
        {history.length > 1 ? (
          <Line data={data} options={options} />
        ) : (
          <div className={styles.empty}>WAITING FOR DATA...</div>
        )}
      </div>
    </div>
  );
}
