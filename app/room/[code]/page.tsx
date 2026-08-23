import type { Metadata } from 'next';
import { SyncroomApp } from '../../page';

type RoomPageProps = {
  params: Promise<{ code: string }>;
};

export async function generateMetadata({ params }: RoomPageProps): Promise<Metadata> {
  const { code } = await params;
  const safeCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return {
    title: `${safeCode || '음악방'} — SYNCROOM`,
    description: `초대 코드 ${safeCode || code} 공동 음악방에 로그인 없이 참가하세요.`,
    openGraph: {
      title: `${safeCode || '음악방'} — SYNCROOM`,
      description: '친구가 초대한 공동 음악방에 닉네임만 입력하고 참가하세요.',
      images: [],
    },
    twitter: {
      card: 'summary',
      title: `${safeCode || '음악방'} — SYNCROOM`,
      description: '친구가 초대한 공동 음악방에 닉네임만 입력하고 참가하세요.',
      images: [],
    },
  };
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { code } = await params;
  return <SyncroomApp initialView="room" initialCode={code} />;
}
