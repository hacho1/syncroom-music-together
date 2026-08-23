import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SYNCROOM — 희원이의 음악방',
  description: '친구들과 같은 음악을 같은 순간에 듣는 모바일 공동 음악방',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
