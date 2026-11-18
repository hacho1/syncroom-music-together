# SYNCROOM · 싱크룸

친구가 신청한 YouTube 곡을 **하나의 대기열에 모아 같은 재생 상태로 듣는** 웹 음악방입니다. 닉네임만 입력해 방을 만들거나 참가할 수 있습니다.

[브라우저에서 데모 열기](https://syncroom-music-together.naiski.chatgpt.site/)

## 주요 기능

- **공개방·비밀방** — 공개 목록에서 방을 고르거나 6자리 코드와 초대 링크로 들어갑니다.
- **공동 대기열** — 노래를 검색해 신청하거나 YouTube 공개 재생목록을 가져옵니다.
- **재생 상태 동기화** — 방장의 재생·일시정지·곡 넘기기와 셔플 상태가 참가자 화면에 반영됩니다. 모바일에서 재생이 차단되면 먼저 화면을 눌러 재생을 허용합니다.
- **방 상태 저장** — 방, 참가자, 대기열과 재생 정보를 Cloudflare D1에 저장하고, 소켓 연결이 끊기면 주기적으로 상태를 다시 조회합니다.

## 기술 스택

| 영역 | 사용 기술 |
| --- | --- |
| 웹 | React 19 · TypeScript · Next.js App Router · Vinext · Vite · Tailwind CSS |
| 서버·데이터 | Cloudflare Workers · D1 · Drizzle ORM |
| 실시간·재생 | Socket.IO · YouTube IFrame Player · YouTube Data API v3 |

## 실행 방법

Node.js **22.13 이상**과 **pnpm**을 설치한 뒤 저장소 루트에서 실행합니다.

```bash
pnpm install --frozen-lockfile
pnpm dev --port 3000
```

[localhost:3000](http://localhost:3000)에서 닉네임과 방 이름을 입력합니다. 두 참가자의 화면을 비교하려면 일반 창과 시크릿 창에서 같은 방에 각각 들어가면 됩니다. 방 상태 저장은 개발 서버가 제공하는 로컬 D1을 사용합니다.

### YouTube 검색과 실시간 연결

- YouTube 검색과 공개 재생목록 가져오기에 사용할 `YOUTUBE_API_KEY`는 서버 환경변수에 설정합니다. 키 없이도 방 생성·초대와 데모 곡 검색을 해볼 수 있습니다.
- 기본값으로는 주기 조회를 사용합니다. 소켓을 테스트하려면 별도 터미널에서 `pnpm realtime:dev`를 실행하고, 웹 서버 환경에 `SOCKET_SERVER_URL=http://localhost:4000`을 설정한 뒤 다시 실행합니다.
- 웹 주소를 바꿨다면 소켓 서버의 `ALLOWED_ORIGINS`에도 실제 브라우저 주소를 등록합니다. [환경변수 예시](.env.example)

웹 빌드는 `pnpm build`, 실시간 서버 상태 확인은 [localhost:4000/health](http://localhost:4000/health)에서 할 수 있습니다.
