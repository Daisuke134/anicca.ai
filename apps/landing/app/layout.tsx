export const metadata = {
  title: 'Anicca — End Suffering.',
  description:
    'A proactive agent for behavior change. What if Buddha were software? End suffering—one person at a time.',
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
};

import './globals.css';
import React from 'react';
import { inter, notoSansJP } from './fonts';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${notoSansJP.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}

