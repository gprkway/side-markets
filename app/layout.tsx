import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Side — Market intelligence for you and your agent',
  description:
    'A WebMCP-native prediction market browser powered by live Polymarket data.',
  openGraph: {
    title: 'Side — Market intelligence for you and your agent',
    description: 'A market interface for you and your agent.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Side' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Side — Market intelligence for you and your agent',
    description: 'A market interface for you and your agent.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
