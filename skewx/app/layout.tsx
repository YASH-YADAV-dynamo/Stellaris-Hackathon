import type { Metadata, Viewport } from 'next';
import GlobalFooter from '@/components/GlobalFooter';
import './globals.css';

export const metadata: Metadata = {
  title: 'skewX | Orderbook Imbalance & Funding Arbitrage',
  description:
    'skewX provides real-time orderbook imbalance and funding arbitrage intelligence across major crypto exchanges.',
  keywords: [
    'skewX',
    'orderbook imbalance',
    'funding arbitrage',
    'crypto trading signals',
    'market microstructure',
  ],
  openGraph: {
    title: 'skewX | Orderbook Imbalance & Funding Arbitrage',
    description:
      'Real-time orderbook imbalance and funding arbitrage monitoring across major crypto venues.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'skewX | Orderbook Imbalance & Funding Arbitrage',
    description:
      'Track live imbalance and funding opportunities with skewX across crypto exchanges.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <div className="appRoot">
          <main className="appMain">{children}</main>
          <GlobalFooter />
        </div>
      </body>
    </html>
  );
}
