import type { Metadata } from 'next';
import './globals.css';
import ThemeRegistry from '../components/ThemeRegistry';
import QueryProvider from '../components/QueryProvider';
import { AuthProvider } from '../lib/contexts/AuthContext';
import ServiceWorkerRegistrar from '../components/ServiceWorkerRegistrar';

export const metadata: Metadata = {
  title: 'Financial Transparency System',
  description: 'Bethel Rays of Hope NGO - Financial Transparency and Accountability',
  manifest: '/manifest.json',
  themeColor: '#1976d2',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'FTS',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1976d2" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1" />
      </head>
      <body>
        <a href="#main-content" className="skip-to-content">Skip to main content</a>
        <ThemeRegistry>
          <QueryProvider>
            <AuthProvider>
              <ServiceWorkerRegistrar />
              {children}
            </AuthProvider>
          </QueryProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}
