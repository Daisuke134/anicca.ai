export const metadata = {
  title: 'Anicca — Leading you to your best self.',
  description:
    'A proactive agent for behavior change. From wake to sleep—build good habits and break bad ones in days, not decades.',
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
};

import './globals.css';
import React from 'react';
import { inter } from './fonts';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}

