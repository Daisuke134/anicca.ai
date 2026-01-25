import React from 'react';

export const metadata = {
  title: 'Anicca — End Suffering.',
  description:
    'A proactive agent for behavior change. What if Buddha were software? End suffering—one person at a time.',
};

export default function EnglishLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="en" className="font-inter">
      {children}
    </div>
  );
}
