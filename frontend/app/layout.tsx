import type { Metadata, Viewport } from 'next';
import './globals.css';
import ThemeRegistry from '../components/ThemeRegistry';
import QueryProvider from '../components/QueryProvider';
import { AuthProvider } from '../lib/contexts/AuthContext';
import ServiceWorkerRegistrar from '../components/ServiceWorkerRegistrar';

export const metadata: Metadata = {
  title: 'Financial Transparency System | Bethel Rays of Hope',
  description: 'Bethel Rays of Hope NGO - Financial Transparency and Accountability',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'FTS',
  },
};

export const viewport: Viewport = {
  themeColor: '#1976d2',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
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
