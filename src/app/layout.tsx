import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/layout/Providers';

export const metadata: Metadata = {
  title: 'SecureDevOps | Dependency vulnerability intelligence',
  description: 'Scan GitHub repositories against OSV, react to webhook pushes in real time and investigate findings.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-canvas font-sans text-on-surface antialiased selection:bg-indigo selection:text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
