import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Funding arbitrage · Pacifica',
  description: 'Cross-DEX perpetual funding rates and spread',
};

export default function ArbitrageLayout({ children }: { children: React.ReactNode }) {
  return children;
}
