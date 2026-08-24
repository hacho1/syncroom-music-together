'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

type Track = {
  id: number;
  videoId: string;
  title: string;
  artist: string;
  requestedBy: string;
  duration: number;
  palette: string;
  thumbnail?: string | null;
};

type RoomMember = {
  id: string;
  name: string;
  role: string;
  color: string;
  initials: string;
  lastSeen: number;
};

type RoomState = {
  serverTime: number;
  room: {
    code: string;
    name: string;
    isHost: boolean;
    visibility: 'private' | 'public';
    maxParticipants: number;
  };
  currentTrack: Track;
  playback: { isPlaying: boolean; shuffle: boolean; position: number; positionUpdatedAt: number; revision: number };
  queue: Track[];
  members: RoomMember[];
};

type PublicRoom = {
  code: string;
  name: string;
  participantCount: number;
  maxParticipants: number;
  currentTrack: {
    videoId: string;
    title: string;
    artist: string;
    thumbnail: string | null;
  };
  isPlaying: boolean;
};

type SearchResult = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string | null;
  duration: number;
};

type YouTubePlayer = {
  cueVideoById(options: { videoId: string; startSeconds?: number }): void;
  loadVideoById(options: { videoId: string; startSeconds?: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  destroy(): void;
};

type YouTubePlayerEvent = { target: YouTubePlayer; data: number };

type YouTubeNamespace = {
  Player: new (element: HTMLElement, options: {
    width: string;
    height: string;
    playerVars: Record<string, string | number>;
    events: {
      onReady(event: YouTubePlayerEvent): void;
      onStateChange(event: YouTubePlayerEvent): void;
      onError(event: YouTubePlayerEvent): void;
    };
  }) => YouTubePlayer;
};

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

type AppView = 'home' | 'room' | 'help' | 'public';

let youtubeApiPromise: Promise<YouTubeNamespace> | null = null;

function isYouTubeVideoId(videoId: string) {
  return /^[A-Za-z0-9_-]{11}$/.test(videoId);
}

function isYouTubePlaylistInput(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return ['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(host)
      && Boolean(url.searchParams.get('list'));
  } catch {
    return false;
  }
}

function roomResponseError(response: Response, data: { error?: string; code?: string }, fallback: string) {
  const error = new Error(data.error || fallback);
  if (response.status === 410 || data.code === 'ROOM_EXPIRED') error.name = 'RoomExpiredError';
  return error;
}

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      if (window.YT?.Player) resolve(window.YT);
    };

    let script = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener('error', () => {
      youtubeApiPromise = null;
      reject(new Error('YouTube player API failed to load'));
    }, { once: true });

    window.setTimeout(() => {
      if (window.YT?.Player) resolve(window.YT);
      else {
        youtubeApiPromise = null;
        reject(new Error('YouTube player API timed out'));
      }
    }, 15_000);
  });

  return youtubeApiPromise;
}

function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values = new Uint8Array(6);
  window.crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
}

function getOrCreateGuestId() {
  const saved = window.localStorage.getItem('syncroom:guest-id');
  if (saved) return saved;
  const next = window.crypto.randomUUID();
  window.localStorage.setItem('syncroom:guest-id', next);
  return next;
}

function goTo(path: string) {
  window.location.assign(path);
}

const initialQueue: Track[] = [
  { id: 2, videoId: 'demo-ditto', title: 'Ditto', artist: 'NewJeans', requestedBy: '밤밤', duration: 185, palette: 'violet' },
  { id: 3, videoId: 'demo-night-letter', title: '밤편지', artist: '아이유', requestedBy: '혜수', duration: 253, palette: 'amber' },
  { id: 4, videoId: 'demo-drama', title: 'Drama', artist: 'aespa', requestedBy: '희원', duration: 214, palette: 'blue' },
];

const initialTrack: Track = {
  id: 1,
  videoId: 'demo-supernova',
  title: 'Supernova',
  artist: 'aespa',
  requestedBy: '희원',
  duration: 178,
  palette: 'pink',
};

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

function ScrollingTitle({ title }: { title: string }) {
  const viewportRef = useRef<HTMLHeadingElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const [duration, setDuration] = useState(14);

  useEffect(() => {
    const viewport = viewportRef.current;
    const text = textRef.current;
    if (!viewport || !text) return;
    const update = () => {
      const textWidth = text.scrollWidth;
      setShouldScroll(textWidth > viewport.clientWidth + 1);
      setDuration(Math.max(12, Math.min(28, textWidth / 22)));
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(viewport);
    observer?.observe(text);
    return () => observer?.disconnect();
  }, [title]);

  return (
    <h2
      ref={viewportRef}
      className={`marquee-title ${shouldScroll ? 'is-scrolling' : ''}`}
      aria-label={title}
      style={{ '--marquee-duration': `${duration}s` } as React.CSSProperties}
    >
      <span className="marquee-title-track">
        <span ref={textRef} className="marquee-title-text">{title}</span>
        {shouldScroll && <span className="marquee-title-text" aria-hidden="true">{title}</span>}
      </span>
    </h2>
  );
}

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>;
}

function HomeScreen() {
  const [roomName, setRoomName] = useState('우리들의 음악방');
  const [hostName, setHostName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [guestName, setGuestName] = useState('');
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [error, setError] = useState('');

  function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nickname = hostName.trim();
    if (!nickname) {
      setError('방에서 사용할 닉네임을 입력해 주세요.');
      return;
    }
    const code = makeRoomCode();
    getOrCreateGuestId();
    window.localStorage.setItem('syncroom:nickname', nickname);
    window.localStorage.setItem(`syncroom:room:${code}`, roomName.trim() || '우리들의 음악방');
    goTo(`/room/${code}?create=1&room=${encodeURIComponent(roomName.trim() || '우리들의 음악방')}&name=${encodeURIComponent(nickname)}&visibility=${visibility}`);
  }

  function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = joinCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    const nickname = guestName.trim();
    if (code.length !== 6) {
      setError('6자리 초대 코드를 확인해 주세요.');
      return;
    }
    if (!nickname) {
      setError('방에서 사용할 닉네임을 입력해 주세요.');
      return;
    }
    window.localStorage.setItem('syncroom:nickname', nickname);
    getOrCreateGuestId();
    goTo(`/room/${code}?name=${encodeURIComponent(nickname)}`);
  }

  return (
    <main className="page-stage home-stage">
      <section className="app-shell home-shell" aria-label="SYNCROOM 홈">
        <header className="home-nav">
          <Link href="/" className="brand-lockup"><BrandMark /><b>SYNCROOM</b></Link>
          <Link href="/help" className="help-link">도움말 <span>?</span></Link>
        </header>

        <div className="home-scroll">
          <section className="home-hero">
            <div className="guest-badge"><span /> 로그인 없이 바로 시작</div>
            <p className="home-kicker">LISTEN TOGETHER, LIVE</p>
            <h1>같은 음악을<br /><em>같은 순간에.</em></h1>
            <p className="home-description">친구를 초대하고, 듣고 싶은 곡을 신청하세요.<br />설치도 회원가입도 필요 없어요.</p>
            <div className="hero-visual" aria-hidden="true">
              <div className="hero-disc"><i /><span>SYNC</span></div>
              <div className="hero-wave wave-left" />
              <div className="hero-wave wave-right" />
              <span className="listener-dot dot-one">희</span>
              <span className="listener-dot dot-two">밤</span>
              <span className="listener-dot dot-three">혜</span>
            </div>
          </section>

          <Link href="/public" className="public-room-cta">
            <span className="public-room-cta-icon" aria-hidden="true"><i /><i /><i /></span>
            <span><strong>다른 사람과 함께 들으러 가기</strong><small>지금 열려 있는 공개 음악방 둘러보기</small></span>
            <b aria-hidden="true">→</b>
          </Link>

          <section className="start-card">
            <div className="start-tabs" role="tablist" aria-label="방 시작 방법">
              <button type="button" role="tab" aria-selected={mode === 'create'} className={mode === 'create' ? 'active' : ''} onClick={() => { setMode('create'); setError(''); }}>새 방 만들기</button>
              <button type="button" role="tab" aria-selected={mode === 'join'} className={mode === 'join' ? 'active' : ''} onClick={() => { setMode('join'); setError(''); }}>코드로 참가</button>
            </div>

            {mode === 'create' ? (
              <form className="start-form" onSubmit={createRoom}>
                <label>방 이름<input value={roomName} maxLength={24} onChange={(event) => setRoomName(event.target.value)} placeholder="우리들의 음악방" /></label>
                <label>내 닉네임<input value={hostName} maxLength={12} onChange={(event) => setHostName(event.target.value)} placeholder="어떻게 불러드릴까요?" /></label>
                <fieldset className="visibility-picker">
                  <legend>공개 범위</legend>
                  <button type="button" className={visibility === 'private' ? 'active' : ''} onClick={() => setVisibility('private')} aria-pressed={visibility === 'private'}>
                    <span>⌁</span><b>비밀방</b><small>초대받은 사람만</small>
                  </button>
                  <button type="button" className={visibility === 'public' ? 'active' : ''} onClick={() => setVisibility('public')} aria-pressed={visibility === 'public'}>
                    <span>◉</span><b>공개방</b><small>누구나 · 최대 12명</small>
                  </button>
                </fieldset>
                {error && <p className="form-error" role="alert">{error}</p>}
                <button className="primary-start" type="submit"><span>＋</span> 음악방 만들기</button>
              </form>
            ) : (
              <form className="start-form" onSubmit={joinRoom}>
                <label>초대 코드<input className="code-input" value={joinCode} maxLength={6} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="ABC123" autoCapitalize="characters" /></label>
                <label>내 닉네임<input value={guestName} maxLength={12} onChange={(event) => setGuestName(event.target.value)} placeholder="어떻게 불러드릴까요?" /></label>
                {error && <p className="form-error" role="alert">{error}</p>}
                <button className="primary-start" type="submit"><span>→</span> 음악방 입장하기</button>
              </form>
            )}
            <p className="privacy-note"><span>⌁</span> 방과 대기열은 서버에 저장되어 새로고침해도 유지돼요.</p>
          </section>

          <section className="feature-strip" aria-label="주요 기능">
            <article><span>01</span><i>⌕</i><div><h2>YouTube 검색</h2><p>찾고 바로 예약</p></div></article>
            <article><span>02</span><i>⌁</i><div><h2>실시간 동기화</h2><p>같은 재생 위치</p></div></article>
            <article><span>03</span><i>↗</i><div><h2>코드로 초대</h2><p>6자리로 간단히</p></div></article>
          </section>
        </div>
      </section>
    </main>
  );
}

function PublicRoomsScreen() {
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadRooms = useCallback(async () => {
    try {
      const response = await fetch('/api/rooms/public', { cache: 'no-store' });
      const data = await response.json() as { rooms?: PublicRoom[]; error?: string };
      if (!response.ok) throw new Error(data.error || '공개방 목록을 불러오지 못했어요.');
      setRooms(data.rooms || []);
      setLoadError('');
    } catch (requestError) {
      setLoadError(requestError instanceof Error ? requestError.message : '공개방 목록을 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void loadRooms(), 0);
    const timer = window.setInterval(() => void loadRooms(), 10_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [loadRooms]);

  return (
    <main className="page-stage home-stage">
      <section className="app-shell public-shell" aria-label="공개 음악방 목록">
        <header className="home-nav public-nav">
          <Link href="/" className="brand-lockup"><BrandMark /><b>SYNCROOM</b></Link>
          <Link href="/" className="close-help" aria-label="홈으로 돌아가기">×</Link>
        </header>

        <div className="public-rooms-scroll">
          <section className="public-rooms-hero">
            <div className="public-live-badge"><span /> LIVE TOGETHER</div>
            <h1>지금 함께<br /><em>듣고 있는 방</em></h1>
            <p>마음에 드는 방에 들어가 닉네임만 정하면 돼요.<br />공개방은 최대 12명까지 함께 들을 수 있어요.</p>
          </section>

          <div className="public-list-heading">
            <h2>열려 있는 음악방 <span>{rooms.length}</span></h2>
            <button type="button" onClick={() => void loadRooms()} disabled={loading} aria-label="공개방 목록 새로고침">↻</button>
          </div>

          {loading && rooms.length === 0 ? (
            <div className="public-room-empty"><div className="invite-loader"><span /><span /><span /></div><p>함께 들을 방을 찾고 있어요</p></div>
          ) : loadError && rooms.length === 0 ? (
            <div className="public-room-empty"><span>!</span><p>{loadError}</p><button type="button" onClick={() => void loadRooms()}>다시 불러오기</button></div>
          ) : rooms.length === 0 ? (
            <div className="public-room-empty"><span>♫</span><h2>아직 열린 공개방이 없어요</h2><p>첫 공개방을 열고 같이 들을 사람을 기다려 보세요.</p><Link href="/">공개방 만들기</Link></div>
          ) : (
            <div className="public-room-list">
              {rooms.map((room) => {
                const isFull = room.participantCount >= room.maxParticipants;
                return (
                  <article className="public-room-card" key={room.code}>
                    <div className="public-room-cover">
                      {room.currentTrack.thumbnail ? <img src={room.currentTrack.thumbnail} alt="" /> : <span>♫</span>}
                      <i className={room.isPlaying ? 'playing' : ''}>{room.isPlaying ? '재생 중' : '대기 중'}</i>
                    </div>
                    <div className="public-room-copy">
                      <p>PUBLIC ROOM · {room.code}</p>
                      <h2>{room.name}</h2>
                      <h3>{room.currentTrack.title}</h3>
                      <small>{room.currentTrack.artist}</small>
                    </div>
                    <div className="public-room-actions">
                      <span className={isFull ? 'full' : ''}>● {room.participantCount}/{room.maxParticipants}</span>
                      {isFull ? <b>입장 마감</b> : <Link href={`/room/${room.code}`}>참가하기</Link>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <Link href="/" className="public-create-bar"><span>＋</span><b>내 음악방 만들기</b><small>비밀방 또는 공개방</small></Link>
      </section>
    </main>
  );
}

function HelpScreen() {
  return (
    <main className="page-stage home-stage">
      <section className="app-shell help-shell" aria-label="SYNCROOM 도움말">
        <header className="home-nav">
          <Link href="/" className="brand-lockup"><BrandMark /><b>SYNCROOM</b></Link>
          <Link href="/" className="close-help" aria-label="홈으로 돌아가기">×</Link>
        </header>
        <div className="help-scroll">
          <p className="home-kicker">QUICK GUIDE</p>
          <h1>어떻게 사용하나요?</h1>
          <p className="help-lead">회원가입 없이 방을 만들고 친구들과 함께 음악을 신청하는 가장 간단한 방법이에요.</p>

          <ol className="help-steps">
            <li><span>1</span><div><h2>방 만들기</h2><p>홈에서 방 이름과 닉네임을 입력하면 6자리 초대 코드가 바로 만들어져요.</p></div></li>
            <li><span>2</span><div><h2>친구 초대하기</h2><p>음악방의 초대 버튼을 눌러 링크나 방 코드를 친구에게 보내세요.</p></div></li>
            <li><span>3</span><div><h2>노래 신청하기</h2><p>제목이나 가수를 검색하고 원하는 YouTube 영상을 대기열에 추가하세요.</p></div></li>
            <li><span>4</span><div><h2>같이 듣기</h2><p>방장이 재생하거나 멈추면 참가자의 화면도 같은 위치로 맞춰집니다.</p></div></li>
          </ol>

          <section className="help-note">
            <span className="help-note-icon">i</span>
            <div><h2>음악방 DB와 동기화가 연결됐어요</h2><p>방, 참가자, 대기열과 재생 상태가 서버에 저장되고 접속한 사람들의 화면에 자동으로 반영돼요.</p></div>
          </section>

          <section className="faq-list">
            <h2>자주 묻는 질문</h2>
            <details><summary>로그인이 꼭 필요한가요?<span>＋</span></summary><p>아니요. 닉네임만 정하면 바로 방을 만들거나 참가할 수 있도록 설계했어요.</p></details>
            <details><summary>음악은 어디서 재생되나요?<span>＋</span></summary><p>YouTube 공식 플레이어를 화면에 표시하고 각 참가자의 브라우저에서 재생하는 구조예요.</p></details>
            <details><summary>초대 코드는 얼마나 유지되나요?<span>＋</span></summary><p>방이 유지되는 동안 사용할 수 있어요. 방이 삭제되거나 만료되면 해당 코드도 함께 만료되고 별도 안내가 표시됩니다.</p></details>
          </section>

          <Link href="/" className="primary-start help-home">홈으로 돌아가기</Link>
        </div>
      </section>
    </main>
  );
}

export function SyncroomApp({ initialView = 'room', initialCode = 'HNW824' }: { initialView?: AppView; initialCode?: string }) {
  const roomCode = initialCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'HNW824';
  const [currentTrack, setCurrentTrack] = useState(initialTrack);
  const [queue, setQueue] = useState<Track[]>(initialQueue);
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [volume, setVolume] = useState(75);
  const [isMuted, setIsMuted] = useState(false);
  const [activeTab, setActiveTab] = useState<'queue' | 'members'>('queue');
  const [request, setRequest] = useState('');
  const [toast, setToast] = useState('');
  const [roomName, setRoomName] = useState('함께 듣는 음악방');
  const [nickname, setNickname] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestId, setGuestId] = useState('');
  const [joined, setJoined] = useState(false);
  const [shouldCreate, setShouldCreate] = useState(false);
  const [createVisibility, setCreateVisibility] = useState<'private' | 'public'>('private');
  const [roomReady, setRoomReady] = useState(false);
  const [roomError, setRoomError] = useState('');
  const [checkingInvite, setCheckingInvite] = useState(initialView === 'room');
  const [inviteExpired, setInviteExpired] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [connectionMode, setConnectionMode] = useState<'connecting' | 'socket' | 'polling' | 'offline'>('connecting');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [demoSearch, setDemoSearch] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState('');
  const [playbackRevision, setPlaybackRevision] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const revisionRef = useRef(0);
  const youtubeMountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const loadedVideoIdRef = useRef('');
  const serverPositionRef = useRef(0);
  const isHostRef = useRef(false);
  const isPlayingRef = useRef(false);
  const volumeRef = useRef(75);
  const isMutedRef = useRef(false);
  const durationSyncRef = useRef('');
  const roomActionRef = useRef<(payload: Record<string, unknown>) => Promise<RoomState>>(async () => {
    throw new Error('음악방 연결을 준비하고 있어요.');
  });

  const applyRoomState = useCallback((state: RoomState) => {
    const revisionChanged = revisionRef.current !== state.playback.revision;
    revisionRef.current = state.playback.revision;
    setRoomName(state.room.name);
    setCurrentTrack(state.currentTrack);
    setQueue(state.queue);
    setRoomMembers(state.members);
    setIsHost(state.room.isHost);
    setIsPlaying(state.playback.isPlaying);
    setShuffleEnabled(state.playback.shuffle);
    setPlaybackRevision(state.playback.revision);
    isHostRef.current = state.room.isHost;
    isPlayingRef.current = state.playback.isPlaying;
    serverPositionRef.current = state.playback.position;
    setElapsed((current) => (
      revisionChanged || Math.abs(current - state.playback.position) > 1.5
        ? state.playback.position
        : current
    ));
  }, []);

  const fetchRoomState = useCallback(async () => {
    if (!guestId) return;
    const response = await fetch(`/api/rooms/${roomCode}`, {
      cache: 'no-store',
      headers: { 'x-syncroom-guest': guestId },
    });
    const data = await response.json() as RoomState & { error?: string; code?: string };
    if (!response.ok) {
      const responseError = roomResponseError(response, data, '음악방 상태를 불러오지 못했어요.');
      if (responseError.name === 'RoomExpiredError') {
        setInviteExpired(true);
        setCheckingInvite(false);
        setRoomReady(false);
        setJoined(false);
      }
      throw responseError;
    }
    applyRoomState(data);
  }, [applyRoomState, guestId, roomCode]);

  const roomAction = useCallback(async (payload: Record<string, unknown>) => {
    const response = await fetch(`/api/rooms/${roomCode}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, guestId, nickname }),
    });
    const data = await response.json() as RoomState & { error?: string; code?: string };
    if (!response.ok) {
      const responseError = roomResponseError(response, data, '음악방 요청을 처리하지 못했어요.');
      if (responseError.name === 'RoomExpiredError') {
        setInviteExpired(true);
        setCheckingInvite(false);
        setRoomReady(false);
        setJoined(false);
      }
      throw responseError;
    }
    applyRoomState(data);
    socketRef.current?.emit('room:refresh', { reason: String(payload.action || 'state-changed') });
    return data;
  }, [applyRoomState, guestId, nickname, roomCode]);

  useEffect(() => {
    roomActionRef.current = roomAction;
  }, [roomAction]);

  useEffect(() => {
    if (initialView !== 'room') return;
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const queryRoom = params.get('room');
    const queryName = params.get('name');
    const savedRoom = window.localStorage.getItem(`syncroom:room:${roomCode}`);
    const savedName = window.localStorage.getItem('syncroom:nickname');
    const nextGuestId = getOrCreateGuestId();
    const createRoom = params.get('create') === '1';
    const visibility = params.get('visibility') === 'public' ? 'public' : 'private';
    // Browser storage is the guest session source and is only available after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRoomName(queryRoom?.trim() || savedRoom || '함께 듣는 음악방');
    setGuestId(nextGuestId);
    setShouldCreate(createRoom);
    setCreateVisibility(visibility);
    const nextName = queryName?.trim() || savedName || '';
    setNickname(nextName);
    setGuestName(nextName);
    setJoined(Boolean(nextName));
    setInviteExpired(false);

    if (createRoom) {
      setCheckingInvite(false);
      return () => { cancelled = true; };
    }

    fetch(`/api/rooms/${roomCode}`, {
      cache: 'no-store',
      headers: { 'x-syncroom-guest': nextGuestId },
    }).then(async (response) => {
      const data = await response.json() as RoomState & { error?: string; code?: string };
      if (cancelled) return;
      if (!response.ok) {
        if (response.status === 410 || data.code === 'ROOM_EXPIRED') {
          setInviteExpired(true);
          setJoined(false);
        } else {
          setRoomError(data.error || '초대 코드를 확인하지 못했어요. 다시 시도해 주세요.');
        }
        return;
      }
      setRoomName(data.room.name);
    }).catch(() => {
      if (!cancelled) setRoomError('초대 코드를 확인하지 못했어요. 다시 시도해 주세요.');
    }).finally(() => {
      if (!cancelled) setCheckingInvite(false);
    });
    return () => { cancelled = true; };
  }, [initialView, roomCode]);

  useEffect(() => {
    if (initialView !== 'room' || !joined || !guestId || !nickname) return;
    let cancelled = false;
    fetch(`/api/rooms/${roomCode}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'join',
        guestId,
        nickname,
        roomName,
        create: shouldCreate,
        visibility: createVisibility,
      }),
    }).then(async (response) => {
      const data = await response.json() as RoomState & { error?: string; code?: string };
      if (!response.ok) throw roomResponseError(response, data, '음악방에 입장하지 못했어요.');
      if (cancelled) return;
      applyRoomState(data);
      setRoomReady(true);
      setConnectionMode('polling');
      window.history.replaceState(null, '', `/room/${roomCode}`);
    }).catch((joinError) => {
      if (cancelled) return;
      setRoomReady(false);
      setJoined(false);
      setConnectionMode('offline');
      if (joinError instanceof Error && joinError.name === 'RoomExpiredError') {
        setInviteExpired(true);
        setCheckingInvite(false);
      }
      setRoomError(joinError instanceof Error ? joinError.message : '음악방에 입장하지 못했어요.');
    });
    return () => { cancelled = true; };
  }, [applyRoomState, createVisibility, guestId, initialView, joined, nickname, roomCode, roomName, shouldCreate]);

  useEffect(() => {
    if (!roomReady || !guestId) return;
    let cancelled = false;
    let socket: Socket | null = null;
    fetch('/api/realtime/config', { cache: 'no-store' })
      .then((response) => response.json() as Promise<{ socketUrl?: string | null }>)
      .then(({ socketUrl }) => {
        if (cancelled || !socketUrl) {
          if (!cancelled) setConnectionMode('polling');
          return;
        }
        socket = io(socketUrl, {
          transports: ['websocket'],
          auth: { roomCode, guestId, nickname },
        });
        socketRef.current = socket;
        socket.on('connect', () => setConnectionMode('socket'));
        socket.on('connect_error', () => setConnectionMode('polling'));
        socket.on('disconnect', () => setConnectionMode('polling'));
        socket.on('room:refresh', () => { void fetchRoomState().catch(() => undefined); });
      })
      .catch(() => setConnectionMode('polling'));
    return () => {
      cancelled = true;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [fetchRoomState, guestId, nickname, roomCode, roomReady]);

  useEffect(() => {
    if (!roomReady) return;
    const interval = connectionMode === 'socket' ? 8_000 : 2_000;
    const timer = window.setInterval(() => {
      void fetchRoomState()
        .then(() => setConnectionMode(socketRef.current?.connected ? 'socket' : 'polling'))
        .catch(() => setConnectionMode('offline'));
    }, interval);
    return () => window.clearInterval(timer);
  }, [connectionMode, fetchRoomState, roomReady]);

  useEffect(() => {
    if (!roomReady || !guestId) return;
    const heartbeat = () => {
      void fetch(`/api/rooms/${roomCode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'heartbeat', guestId, nickname }),
      }).then(async (response) => {
        if (!response.ok) return;
        applyRoomState(await response.json() as RoomState);
      }).catch(() => undefined);
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, 15_000);
    return () => window.clearInterval(timer);
  }, [applyRoomState, guestId, nickname, roomCode, roomReady]);

  useEffect(() => {
    if (!roomReady || !youtubeMountRef.current) return;
    let cancelled = false;
    const mount = youtubeMountRef.current;

    void loadYouTubeApi().then((youtube) => {
      if (cancelled) return;
      const player = new youtube.Player(mount, {
        width: '100%',
        height: '100%',
        playerVars: {
          playsinline: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: ({ target }) => {
            if (cancelled) {
              target.destroy();
              return;
            }
            playerRef.current = target;
            target.setVolume(volumeRef.current);
            if (isMutedRef.current) target.mute();
            setPlayerReady(true);
            setPlayerError('');
          },
          onStateChange: ({ data, target }) => {
            const position = Math.max(0, target.getCurrentTime() || 0);
            if (data === 0 && isHostRef.current) {
              void roomActionRef.current({ action: 'playback:next' })
                .catch(() => setToast('재생이 끝났어요. 다음 곡을 신청해 주세요.'));
              return;
            }
            if (!isHostRef.current) return;
            if (data === 1 && !isPlayingRef.current) {
              isPlayingRef.current = true;
              void roomActionRef.current({ action: 'playback:set', playing: true, position })
                .catch(() => setToast('재생 상태를 동기화하지 못했어요.'));
            } else if (data === 2 && isPlayingRef.current) {
              isPlayingRef.current = false;
              void roomActionRef.current({ action: 'playback:set', playing: false, position })
                .catch(() => setToast('일시정지 상태를 동기화하지 못했어요.'));
            }
          },
          onError: () => setPlayerError('이 YouTube 영상은 여기서 재생할 수 없어요.'),
        },
      });
      playerRef.current = player;
    }).catch(() => {
      if (!cancelled) setPlayerError('YouTube 플레이어를 불러오지 못했어요.');
    });

    return () => {
      cancelled = true;
      setPlayerReady(false);
      playerRef.current?.destroy();
      playerRef.current = null;
      loadedVideoIdRef.current = '';
    };
  }, [roomReady]);

  useEffect(() => {
    const player = playerRef.current;
    const videoId = currentTrack.videoId;
    if (!playerReady || !player || !isYouTubeVideoId(videoId)) return;

    const position = Math.max(0, serverPositionRef.current);
    try {
      if (loadedVideoIdRef.current !== videoId) {
        loadedVideoIdRef.current = videoId;
        if (isPlaying) player.loadVideoById({ videoId, startSeconds: position });
        else player.cueVideoById({ videoId, startSeconds: position });
        return;
      }

      const playerPosition = player.getCurrentTime();
      if (Number.isFinite(playerPosition) && Math.abs(playerPosition - position) > 2) {
        player.seekTo(position, true);
      }
      if (isPlaying && player.getPlayerState() !== 1) player.playVideo();
      if (!isPlaying && player.getPlayerState() === 1) player.pauseVideo();
    } catch {
      // Player errors are surfaced through the IFrame API's onError event.
    }
  }, [currentTrack.videoId, isPlaying, playbackRevision, playerReady]);

  useEffect(() => {
    if (!playerReady || !isHost || !isYouTubeVideoId(currentTrack.videoId)) return;
    let cancelled = false;
    let attempts = 0;
    const syncDuration = () => {
      if (cancelled || attempts >= 12) return;
      attempts += 1;
      const actualDuration = Math.round(playerRef.current?.getDuration() || 0);
      if (actualDuration < 1) return;
      const syncKey = `${currentTrack.videoId}:${actualDuration}`;
      if (durationSyncRef.current === syncKey || Math.abs(actualDuration - currentTrack.duration) <= 1) {
        durationSyncRef.current = syncKey;
        return;
      }
      durationSyncRef.current = syncKey;
      void roomAction({ action: 'playback:duration', duration: actualDuration })
        .catch(() => { durationSyncRef.current = ''; });
    };
    syncDuration();
    const timer = window.setInterval(syncDuration, 750);
    const stopTimer = window.setTimeout(() => window.clearInterval(timer), 9_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearTimeout(stopTimer);
    };
  }, [currentTrack.duration, currentTrack.videoId, isHost, playerReady, roomAction]);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      setElapsed((time) => {
        const playerTime = playerRef.current?.getCurrentTime();
        if (loadedVideoIdRef.current && Number.isFinite(playerTime) && Number(playerTime) >= 0) {
          return Math.min(Number(playerTime), currentTrack.duration);
        }
        return Math.min(time + 1, currentTrack.duration);
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [currentTrack.duration, isPlaying]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const progress = useMemo(
    () => Math.min(100, (elapsed / Math.max(1, currentTrack.duration)) * 100),
    [currentTrack.duration, elapsed],
  );
  const hasPlayableVideo = isYouTubeVideoId(currentTrack.videoId);
  const canPressPlay = roomReady;
  const requestIsPlaylist = isYouTubePlaylistInput(request.trim());

  async function playNext() {
    if (!isHost) {
      setToast('DJ만 다음 곡을 재생할 수 있어요');
      return;
    }
    try {
      const state = await roomAction({ action: 'playback:next' });
      const nextVideoId = state.currentTrack.videoId;
      if (playerReady && playerRef.current && isYouTubeVideoId(nextVideoId)) {
        loadedVideoIdRef.current = nextVideoId;
        playerRef.current.loadVideoById({ videoId: nextVideoId, startSeconds: 0 });
      }
      setToast(state.currentTrack.requestedBy === 'SYNCROOM 추천'
        ? `랜덤 추천 · ${state.currentTrack.title}`
        : `다음 곡 · ${state.currentTrack.title}`);
    } catch (actionError) {
      setToast(actionError instanceof Error ? actionError.message : '다음 곡을 재생하지 못했어요.');
    }
  }

  async function togglePlayback() {
    const hasVideo = isYouTubeVideoId(currentTrack.videoId);
    if (!hasVideo) {
      await playNext();
      return;
    }

    if (!isHost) {
      if (isPlaying && playerReady && playerRef.current) {
        playerRef.current.seekTo(elapsed, true);
        playerRef.current.playVideo();
        setToast('이 기기에서 재생을 시작했어요');
      } else {
        setToast('DJ가 재생하면 여기서 함께 들을 수 있어요');
      }
      return;
    }

    const player = playerReady ? playerRef.current : null;
    if (isPlaying && player && player.getPlayerState() !== 1) {
      player.seekTo(elapsed, true);
      player.playVideo();
      setToast('이 기기에서 재생을 시작했어요');
      return;
    }

    try {
      const nextPlaying = !isPlaying;
      isPlayingRef.current = nextPlaying;
      if (nextPlaying) {
        player?.seekTo(elapsed, true);
        player?.playVideo();
      } else {
        player?.pauseVideo();
      }
      await roomAction({ action: 'playback:set', playing: nextPlaying, position: elapsed });
    } catch (actionError) {
      setToast(actionError instanceof Error ? actionError.message : '재생 상태를 바꾸지 못했어요.');
    }
  }

  async function commitPosition(position = elapsed) {
    if (!isHost) return;
    try {
      playerRef.current?.seekTo(position, true);
      await roomAction({ action: 'playback:set', playing: isPlaying, position });
    } catch (actionError) {
      setToast(actionError instanceof Error ? actionError.message : '재생 위치를 바꾸지 못했어요.');
    }
  }

  async function toggleShuffle() {
    if (!isHost) {
      setToast('DJ만 셔플을 바꿀 수 있어요');
      return;
    }
    const nextShuffle = !shuffleEnabled;
    try {
      await roomAction({ action: 'playback:shuffle', shuffle: nextShuffle });
      setToast(nextShuffle ? '셔플을 켰어요' : '셔플을 껐어요');
    } catch (actionError) {
      setToast(actionError instanceof Error ? actionError.message : '셔플을 바꾸지 못했어요.');
    }
  }

  function changeVolume(nextVolume: number) {
    const safeVolume = Math.max(0, Math.min(100, nextVolume));
    const muted = safeVolume === 0;
    volumeRef.current = safeVolume;
    isMutedRef.current = muted;
    setVolume(safeVolume);
    setIsMuted(muted);
    playerRef.current?.setVolume(safeVolume);
    if (muted) playerRef.current?.mute();
    else playerRef.current?.unMute();
  }

  function toggleMute() {
    const nextMuted = !isMutedRef.current;
    isMutedRef.current = nextMuted;
    setIsMuted(nextMuted);
    if (nextMuted) playerRef.current?.mute();
    else {
      playerRef.current?.setVolume(volumeRef.current);
      playerRef.current?.unMute();
    }
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = request.trim();
    if (!query || searching) return;
    setSearching(true);
    setSearchError('');
    try {
      if (isYouTubePlaylistInput(query)) {
        const response = await fetch('/api/youtube/playlist', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-syncroom-code': roomCode,
            'x-syncroom-guest': guestId,
          },
          body: JSON.stringify({ url: query }),
        });
        const data = await response.json() as { imported?: number; skipped?: number; total?: number; error?: string };
        if (!response.ok) throw new Error(data.error || '재생목록을 추가하지 못했어요.');
        await fetchRoomState();
        socketRef.current?.emit('room:refresh', { reason: 'playlist-imported' });
        setRequest('');
        setSearchResults([]);
        setActiveTab('queue');
        const skippedText = data.skipped ? ` · ${data.skipped}곡 제외` : '';
        setToast(`재생목록 ${data.imported || 0}곡 추가${skippedText}`);
        return;
      }

      const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`, {
        headers: {
          'x-syncroom-code': roomCode,
          'x-syncroom-guest': guestId,
        },
      });
      const data = await response.json() as { results?: SearchResult[]; demo?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || '검색 결과를 불러오지 못했어요.');
      setSearchResults(data.results || []);
      setDemoSearch(Boolean(data.demo));
    } catch (error) {
      setSearchResults([]);
      setSearchError(error instanceof Error ? error.message : '검색 결과를 불러오지 못했어요.');
    } finally {
      setSearching(false);
    }
  }

  async function reserveSearchResult(result: SearchResult) {
    try {
      await roomAction({
        action: 'queue:add',
        videoId: result.videoId,
        title: result.title,
        artist: result.channelTitle,
        thumbnail: result.thumbnail,
        duration: result.duration || 204,
      });
      setRequest('');
      setSearchResults([]);
      setActiveTab('queue');
      setToast(`예약 완료 · ${result.title}`);
    } catch (actionError) {
      setToast(actionError instanceof Error ? actionError.message : '신청곡을 예약하지 못했어요.');
    }
  }

  async function removeQueueItem(track: Track) {
    try {
      await roomAction({ action: 'queue:remove', id: track.id });
      setToast(`대기열에서 삭제 · ${track.title}`);
    } catch (actionError) {
      setToast(actionError instanceof Error ? actionError.message : '대기열에서 삭제하지 못했어요.');
    }
  }

  async function shareRoom() {
    const inviteUrl = `${window.location.origin}/room/${roomCode}?room=${encodeURIComponent(roomName)}`;
    const message = `${roomName}\n초대 코드 ${roomCode}\n${inviteUrl}`;
    try {
      await navigator.clipboard?.writeText(message);
      setToast(`초대 링크 복사 완료 · ${roomCode}`);
    } catch {
      setToast(`방 코드 · ${roomCode}`);
    }
  }

  function joinAsGuest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = guestName.trim();
    if (!name) return;
    window.localStorage.setItem('syncroom:nickname', name);
    setRoomError('');
    setConnectionMode('connecting');
    setGuestId(getOrCreateGuestId());
    setNickname(name);
    setJoined(true);
  }

  if (initialView === 'home') return <HomeScreen />;
  if (initialView === 'help') return <HelpScreen />;
  if (initialView === 'public') return <PublicRoomsScreen />;

  return (
    <main className="page-stage">
      <section className="app-shell" aria-label="실시간 공동 음악방">
        <header className="room-header">
          <button className="room-mark home-room-mark" type="button" onClick={() => goTo('/')} aria-label="홈으로 돌아가기"><span /><span /><span /></button>
          <div className="room-heading">
            <div className="eyebrow-row">
              <span className="live-dot" />
              <span>LIVE ROOM</span>
              <span className="room-code">{roomCode}</span>
            </div>
            <h1>{roomName}</h1>
          </div>
          <button className="member-pill" type="button" onClick={() => setActiveTab('members')}>
            <span className="member-stack" aria-hidden="true">
              {roomMembers.slice(0, 3).map((member) => <i key={member.id}>{member.initials}</i>)}
            </span>
            <b>{roomMembers.length}</b>
          </button>
        </header>

        <div className="content-scroll">
          <section className="now-playing" aria-labelledby="now-playing-title">
            <div className={`cover-art ${currentTrack.palette} ${hasPlayableVideo ? 'has-video' : ''}`} aria-label={`${currentTrack.title} YouTube 플레이어`}>
              <div className={`youtube-player-shell ${hasPlayableVideo ? 'visible' : ''}`}>
                <div ref={youtubeMountRef} />
              </div>
              {!hasPlayableVideo && (
                <>
                  <div className="cover-noise" />
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="cover-word">{currentTrack.title.slice(0, 5).toUpperCase()}</div>
                  <div className="youtube-chip"><span>▶</span> YOUTUBE</div>
                  <div className="equalizer" aria-hidden="true"><i /><i /><i /><i /></div>
                </>
              )}
              {hasPlayableVideo && !playerReady && <div className="player-message">플레이어 준비 중…</div>}
              {hasPlayableVideo && playerError && <div className="player-message error">{playerError}</div>}
            </div>

            <div className="track-copy">
              <div>
                <p id="now-playing-title" className="section-kicker">지금 함께 듣는 중</p>
                <ScrollingTitle title={currentTrack.title} />
                <p>{currentTrack.artist} <span>·</span> 신청 {currentTrack.requestedBy}</p>
              </div>
              <div className="volume-control" aria-label="이 기기 음량">
                <button type="button" className="volume-button" onClick={toggleMute} aria-label={isMuted ? '음소거 해제' : '음소거'} aria-pressed={isMuted}>
                  {isMuted || volume === 0 ? '🔇' : volume < 50 ? '🔉' : '🔊'}
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(event) => changeVolume(Number(event.target.value))}
                  aria-label="음량"
                />
              </div>
            </div>

            <div className="progress-wrap">
              <input
                aria-label="재생 위치"
                type="range"
                min="0"
                max={Math.max(1, currentTrack.duration)}
                value={elapsed}
                onChange={(event) => setElapsed(Number(event.target.value))}
                onPointerUp={(event) => void commitPosition(Number(event.currentTarget.value))}
                disabled={!isHost || !hasPlayableVideo}
                style={{ '--progress': `${progress}%` } as React.CSSProperties}
              />
              <div className="time-row"><span>{formatTime(elapsed)}</span><span>{formatTime(currentTrack.duration)}</span></div>
            </div>

            <div className="player-controls">
              <button
                type="button"
                className={`side-control shuffle-control ${shuffleEnabled ? 'active' : ''}`}
                onClick={() => void toggleShuffle()}
                disabled={!roomReady}
                aria-label={shuffleEnabled ? '셔플 끄기' : '셔플 켜기'}
                aria-pressed={shuffleEnabled}
              >
                <span>🔀</span>
              </button>
              <button
                type="button"
                className="play-button"
                onClick={() => void togglePlayback()}
                disabled={!canPressPlay}
                aria-label={!hasPlayableVideo ? '첫 예약곡 재생' : isPlaying ? '일시정지 또는 이 기기에서 재생' : '재생'}
              >
                {isPlaying ? <span className="pause-icon"><i /><i /></span> : <span className="play-icon">▶</span>}
              </button>
              <button type="button" className="side-control next-control" onClick={() => void playNext()} disabled={!roomReady} aria-label="다음 곡 또는 랜덤 추천곡">
                <span>▶</span><i />
              </button>
            </div>

            <div className={`sync-line ${connectionMode === 'offline' ? 'offline' : ''}`}>
              <span className="sync-icon">⌁</span>
              <span>{connectionMode === 'socket' ? '모두 같은 재생 위치에 있어요' : connectionMode === 'offline' ? '서버 연결을 다시 확인하고 있어요' : '방 상태를 자동으로 맞추고 있어요'}</span>
              <strong>{connectionMode === 'socket' ? 'LIVE' : connectionMode === 'offline' ? 'RETRY' : 'SYNCED'}</strong>
            </div>
          </section>

          <section className="room-panel">
            <div className="panel-tabs" role="tablist" aria-label="음악방 정보">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'queue'}
                className={activeTab === 'queue' ? 'active' : ''}
                onClick={() => setActiveTab('queue')}
              >
                대기열 <span>{queue.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'members'}
                className={activeTab === 'members' ? 'active' : ''}
                onClick={() => setActiveTab('members')}
              >
                참가자 <span>{roomMembers.length}</span>
              </button>
              <button className="invite-button" type="button" onClick={shareRoom}>초대</button>
            </div>

            {activeTab === 'queue' ? (
              <div className="queue-list" role="tabpanel">
                {queue.length ? queue.map((track, index) => (
                  <article className="queue-item" key={track.id}>
                    <span className="queue-number">{String(index + 1).padStart(2, '0')}</span>
                    <div className={`mini-cover ${track.palette}`}>
                      {track.thumbnail ? <img src={track.thumbnail} alt="" /> : <span>{track.title.charAt(0)}</span>}
                    </div>
                    <div className="queue-copy"><h3>{track.title}</h3><p>{track.artist}</p></div>
                    <div className="requester"><span>{track.requestedBy.charAt(0)}</span><small>{track.requestedBy}</small></div>
                    <button
                      type="button"
                      className="more-button"
                      aria-label={`${track.title} 대기열에서 삭제`}
                      onClick={() => void removeQueueItem(track)}
                    >
                      ×
                    </button>
                  </article>
                )) : (
                  <div className="empty-state"><span>♫</span><p>다음 곡을 신청해 주세요</p></div>
                )}
              </div>
            ) : (
              <div className="member-list" role="tabpanel">
                {roomMembers.map((member) => (
                  <article className="member-row" key={member.id}>
                    <span className="avatar" style={{ background: member.color }}>{member.initials}</span>
                    <div><h3>{member.name}</h3><p>{member.role}</p></div>
                    <span className={`member-status ${member.role === '잠시 멈춤' ? 'away' : ''}`} />
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        {(searchResults.length > 0 || searchError) && (
          <section className="search-sheet" aria-label="YouTube 검색 결과">
            <div className="search-sheet-head">
              <div><p>{requestIsPlaylist ? 'YOUTUBE PLAYLIST' : 'YOUTUBE SEARCH'}</p><h2>{requestIsPlaylist ? '재생목록 추가' : '검색 결과'}</h2></div>
              <button type="button" onClick={() => { setSearchResults([]); setSearchError(''); }} aria-label="검색 결과 닫기">×</button>
            </div>
            {demoSearch && <p className="demo-notice"><span>DEMO</span> API 키를 연결하면 실제 YouTube 결과로 바뀌어요.</p>}
            {searchError ? <p className="search-error" role="alert">{searchError}</p> : (
              <div className="search-result-list">
                {searchResults.map((result) => (
                  <article className="search-result" key={`${result.videoId}-${result.title}`}>
                    <div className="result-thumb">
                      {result.thumbnail ? <img src={result.thumbnail} alt="" /> : <span>▶</span>}
                    </div>
                    <div><h3>{result.title}</h3><p>{result.channelTitle}</p></div>
                    <button type="button" onClick={() => void reserveSearchResult(result)} disabled={!roomReady}>예약</button>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <form className="request-bar" onSubmit={submitRequest}>
          <span className="search-icon" aria-hidden="true" />
          <input
            value={request}
            onChange={(event) => setRequest(event.target.value)}
            aria-label="신청곡 검색"
            placeholder="노래 제목 또는 YouTube 재생목록 링크"
          />
          <button type="submit" disabled={!request.trim() || searching || !roomReady}>
            {searching ? (requestIsPlaylist ? '추가 중' : '검색 중') : requestIsPlaylist ? '목록 추가' : '검색'}
          </button>
        </form>

        {(checkingInvite || inviteExpired || !joined) && (
          <div className="guest-gate" role="dialog" aria-modal="true" aria-labelledby="guest-gate-title">
            {checkingInvite ? (
              <div className="guest-card invite-checking-card">
                <BrandMark />
                <p className="home-kicker">CHECKING INVITE</p>
                <h2 id="guest-gate-title">초대 코드를 확인하고 있어요</h2>
                <div className="invite-loader" aria-label="초대 코드 확인 중"><span /><span /><span /></div>
              </div>
            ) : inviteExpired ? (
              <div className="guest-card expired-invite-card">
                <BrandMark />
                <div className="expired-icon" aria-hidden="true">×</div>
                <p className="home-kicker">INVITE EXPIRED</p>
                <h2 id="guest-gate-title">초대 코드가 만료되었어요</h2>
                <p className="expired-copy">방이 종료되어 <strong>{roomCode}</strong> 코드는 더 이상 사용할 수 없어요.<br />방장에게 새 초대 코드를 요청해 주세요.</p>
                <Link className="primary-start" href="/">홈에서 새 방 찾기 <span>→</span></Link>
              </div>
            ) : (
              <form className="guest-card" onSubmit={joinAsGuest}>
                <BrandMark />
                <p className="home-kicker">INVITED TO ROOM</p>
                <h2 id="guest-gate-title">{roomName}</h2>
                <div className="gate-code"><span>초대 코드</span><strong>{roomCode}</strong></div>
                <label>이 방에서 사용할 닉네임<input autoFocus value={guestName} maxLength={12} onChange={(event) => setGuestName(event.target.value)} placeholder="닉네임 입력" /></label>
                {roomError && <p className="form-error" role="alert">{roomError}</p>}
                <button className="primary-start" type="submit" disabled={!guestName.trim()}>로그인 없이 입장하기 <span>→</span></button>
                <Link href="/">다른 방 찾기</Link>
              </form>
            )}
          </div>
        )}

        {toast && <div className="toast" role="status">{toast}</div>}
      </section>
    </main>
  );
}

export default function Home() {
  return <SyncroomApp initialView="home" />;
}
