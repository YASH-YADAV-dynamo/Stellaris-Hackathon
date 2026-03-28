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
  Legend,
  ChartOptions,
  ChartData,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Line } from 'react-chartjs-2';
import { HistoryPoint } from '@/types/orderbook';
import styles from './Chart.module.css';

ChartJS.register(LineElement, PointElement, LinearScale, TimeScale, Filler, Tooltip, Legend);

interface VolumeChartProps {
  history: HistoryPoint[];
  darkMode: boolean;
}

export default function VolumeChart({ history, darkMode }: VolumeChartProps) {
  const c = darkMode
    ? { grid: '#1e1e2e', tick: '#4a5568', border: '#2d2d42', tooltipBg: '#111118', tooltipBorder: '#2d2d42', tooltipTitle: '#94a3b8', tooltipBody: '#e2e8f0', legendColor: '#64748b' }
    : { grid: '#e2e8f0', tick: '#64748b', border: '#cbd5e1', tooltipBg: '#ffffff', tooltipBorder: '#e2e8f0', tooltipTitle: '#64748b', tooltipBody: '#0f172a', legendColor: '#64748b' };

  const bidColor = darkMode ? '#00ff88' : '#059669';
  const askColor = darkMode ? '#ff3366' : '#dc2626';

  const data: ChartData<'line'> = useMemo(() => ({
    datasets: [
      {
        label: 'BID',
        data: history.map(p => ({ x: p.t, y: parseFloat(p.bidVol.toFixed(2)) })),
        borderColor: bidColor,
        borderWidth: 1.5,
        backgroundColor: darkMode ? 'rgba(0,255,136,0.07)' : 'rgba(5,150,105,0.08)',
        pointRadius: 0,
        tension: 0.3,
        fill: true,
      },
      {
        label: 'ASK',
        data: history.map(p => ({ x: p.t, y: parseFloat(p.askVol.toFixed(2)) })),
        borderColor: askColor,
        borderWidth: 1.5,
        backgroundColor: darkMode ? 'rgba(255,51,102,0.07)' : 'rgba(220,38,38,0.08)',
        pointRadius: 0,
        tension: 0.3,
        fill: true,
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
        min: 0,
        grid: { color: c.grid, lineWidth: 1 },
        ticks: {
          color: c.tick,
          font: { family: 'var(--font-mono)', size: 10 },
          callback: (v) => {
            const n = Number(v);
            if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
            return String(v);
          },
          maxTicksLimit: 5,
        },
        border: { color: c.border },
      },
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'end',
        labels: {
          color: c.legendColor,
          font: { family: 'var(--font-mono)', size: 10 },
          boxWidth: 10,
          boxHeight: 3,
          padding: 14,
        },
      },
      tooltip: {
        backgroundColor: c.tooltipBg,
        borderColor: c.tooltipBorder,
        borderWidth: 1,
        titleColor: c.tooltipTitle,
        bodyColor: c.tooltipBody,
        titleFont: { family: 'var(--font-mono)', size: 10 },
        bodyFont: { family: 'var(--font-mono)', size: 11 },
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [darkMode]);

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>BID / ASK VOLUME</span>
        <span className={styles.panelSub}>60s WINDOW · AGGREGATED</span>
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
