import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Trading Bots · DXD',
  description: 'Run maker and taker market-making bots on HotStuff via DXD',
};

export default function BotsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
