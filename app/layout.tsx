import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SYNCROOM — 같이 듣는 공동 음악방',
  description: '로그인 없이 방을 만들고 친구들과 같은 음악을 같은 순간에 듣는 모바일 음악방',
  metadataBase: new URL('https://syncroom-music-together.naiski.chatgpt.site'),
  openGraph: {
    title: 'SYNCROOM — 공동 음악방',
    description: '같은 음악, 같은 순간. 친구들과 함께 듣는 모바일 음악방',
    type: 'website',
    url: 'https://syncroom-music-together.naiski.chatgpt.site',
    images: [
      {
        url: 'https://syncroom-music-together.naiski.chatgpt.site/og.png',
        width: 1200,
        height: 630,
        alt: 'SYNCROOM — 같은 음악, 같은 순간',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SYNCROOM — 공동 음악방',
    description: '같은 음악, 같은 순간. 친구들과 함께 듣는 모바일 음악방',
    images: ['https://syncroom-music-together.naiski.chatgpt.site/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
