import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'NexaOps',
  description: 'AI Enterprise Operations Copilot',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
