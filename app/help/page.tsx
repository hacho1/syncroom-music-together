import { SyncroomApp } from '../page';

export const metadata = {
  title: '도움말 — SYNCROOM',
  description: '로그인 없이 공동 음악방을 만들고 친구를 초대하는 방법',
};

export default function HelpPage() {
  return <SyncroomApp initialView="help" />;
}
