import type { Metadata } from 'next';
import { SyncroomApp } from '../page';

export const metadata: Metadata = {
  title: '공개 음악방 — SYNCROOM',
  description: '지금 음악을 듣고 있는 공개방에 로그인 없이 참가하세요.',
  openGraph: {
    title: '공개 음악방 — SYNCROOM',
    description: '지금 음악을 듣고 있는 사람들과 같은 음악을 같은 순간에 들어보세요.',
    images: [],
  },
  twitter: {
    card: 'summary',
    title: '공개 음악방 — SYNCROOM',
    description: '지금 음악을 듣고 있는 사람들과 같은 음악을 같은 순간에 들어보세요.',
    images: [],
  },
};

export default function PublicRoomsPage() {
  return <SyncroomApp initialView="public" />;
}
