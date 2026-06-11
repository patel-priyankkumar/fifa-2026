import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SVP SPORTS FIFA 2026',
  description: 'SVP Sports FIFA 2026 pool leaderboard and live score tracker'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
