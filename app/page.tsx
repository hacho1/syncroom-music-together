'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Track = {
  id: number;
  title: string;
  artist: string;
  requestedBy: string;
  duration: number;
  palette: string;
  thumbnail?: string;
};

type SearchResult = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string | null;
};

type AppView = 'home' | 'room' | 'help';

function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values = new Uint8Array(6);
  window.crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
}

function goTo(path: string) {
  window.location.assign(path);
}

const initialQueue: Track[] = [
  { id: 2, title: 'Ditto', artist: 'NewJeans', requestedBy: '밤밤', duration: 185, palette: 'violet' },
  { id: 3, title: '밤편지', artist: '아이유', requestedBy: '혜수', duration: 253, palette: 'amber' },
  { id: 4, title: 'Drama', artist: 'aespa', requestedBy: '희원', duration: 214, palette: 'blue' },
];

const members = [
  { name: '희원', role: 'DJ', color: '#ff3d78', initials: '희' },
  { name: '밤밤', role: '듣는 중', color: '#8b7cff', initials: '밤' },
  { name: '혜수', role: '듣는 중', color: '#ffb84d', initials: '혜' },
  { name: '민지', role: '듣는 중', color: '#42d6aa', initials: '민' },
  { name: '준', role: '잠시 멈춤', color: '#5d90ff', initials: '준' },
];

const initialTrack: Track = {
  id: 1,
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

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>;
}

function HomeScreen() {
  const [roomName, setRoomName] = useState('우리들의 음악방');
  const [hostName, setHostName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [guestName, setGuestName] = useState('');
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [error, setError] = useState('');

  useEffect(() => {
    const savedName = window.localStorage.getItem('syncroom:nickname');
    if (savedName) {
      setHostName(savedName);
      setGuestName(savedName);
    }
  }, []);

  function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nickname = hostName.trim();
    if (!nickname) {
      setError('방에서 사용할 닉네임을 입력해 주세요.');
      return;
    }
    const code = makeRoomCode();
    window.localStorage.setItem('syncroom:nickname', nickname);
    window.localStorage.setItem(`syncroom:room:${code}`, roomName.trim() || '우리들의 음악방');
    goTo(`/room/${code}?room=${encodeURIComponent(roomName.trim() || '우리들의 음악방')}&name=${encodeURIComponent(nickname)}`);
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
    goTo(`/room/${code}?name=${encodeURIComponent(nickname)}`);
  }

  return (
    <main className="page-stage home-stage">
      <section className="app-shell home-shell" aria-label="SYNCROOM 홈">
        <header className="home-nav">
          <a href="/" className="brand-lockup"><BrandMark /><b>SYNCROOM</b></a>
          <a href="/help" className="help-link">도움말 <span>?</span></a>
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

          <section className="start-card">
            <div className="start-tabs" role="tablist" aria-label="방 시작 방법">
              <button type="button" role="tab" aria-selected={mode === 'create'} className={mode === 'create' ? 'active' : ''} onClick={() => { setMode('create'); setError(''); }}>새 방 만들기</button>
              <button type="button" role="tab" aria-selected={mode === 'join'} className={mode === 'join' ? 'active' : ''} onClick={() => { setMode('join'); setError(''); }}>코드로 참가</button>
            </div>

            {mode === 'create' ? (
              <form className="start-form" onSubmit={createRoom}>
                <label>방 이름<input value={roomName} maxLength={24} onChange={(event) => setRoomName(event.target.value)} placeholder="우리들의 음악방" /></label>
                <label>내 닉네임<input value={hostName} maxLength={12} onChange={(event) => setHostName(event.target.value)} placeholder="어떻게 불러드릴까요?" /></label>
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
            <p className="privacy-note"><span>⌁</span> 지금은 프로토타입이라 입력 내용은 이 기기에만 저장돼요.</p>
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

function HelpScreen() {
  return (
    <main className="page-stage home-stage">
      <section className="app-shell help-shell" aria-label="SYNCROOM 도움말">
        <header className="home-nav">
          <a href="/" className="brand-lockup"><BrandMark /><b>SYNCROOM</b></a>
          <a href="/" className="close-help" aria-label="홈으로 돌아가기">×</a>
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
            <div><h2>현재는 화면 프로토타입이에요</h2><p>방 코드와 검색 흐름은 작동하지만, 여러 기기의 실제 동기화와 방 저장은 서버 연결 후 사용할 수 있어요.</p></div>
          </section>

          <section className="faq-list">
            <h2>자주 묻는 질문</h2>
            <details><summary>로그인이 꼭 필요한가요?<span>＋</span></summary><p>아니요. 닉네임만 정하면 바로 방을 만들거나 참가할 수 있도록 설계했어요.</p></details>
            <details><summary>음악은 어디서 재생되나요?<span>＋</span></summary><p>YouTube 공식 플레이어를 화면에 표시하고 각 참가자의 브라우저에서 재생하는 구조예요.</p></details>
            <details><summary>초대 코드는 얼마나 유지되나요?<span>＋</span></summary><p>현재 프로토타입에서는 저장되지 않습니다. 서버와 DB를 연결하면 만료 정책을 정할 수 있어요.</p></details>
          </section>

          <a href="/" className="primary-start help-home">홈으로 돌아가기</a>
        </div>
      </section>
    </main>
  );
}

export function SyncroomApp({ initialView = 'room', initialCode = 'HNW824' }: { initialView?: AppView; initialCode?: string }) {
  const roomCode = initialCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'HNW824';
  const [currentTrack, setCurrentTrack] = useState(initialTrack);
  const [queue, setQueue] = useState(initialQueue);
  const [isPlaying, setIsPlaying] = useState(true);
  const [elapsed, setElapsed] = useState(133);
  const [liked, setLiked] = useState(false);
  const [activeTab, setActiveTab] = useState<'queue' | 'members'>('queue');
  const [request, setRequest] = useState('');
  const [toast, setToast] = useState('');
  const [roomName, setRoomName] = useState('함께 듣는 음악방');
  const [nickname, setNickname] = useState('');
  const [guestName, setGuestName] = useState('');
  const [joined, setJoined] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [demoSearch, setDemoSearch] = useState(false);

  useEffect(() => {
    if (initialView !== 'room') return;
    const params = new URLSearchParams(window.location.search);
    const queryRoom = params.get('room');
    const queryName = params.get('name');
    const savedRoom = window.localStorage.getItem(`syncroom:room:${roomCode}`);
    const savedName = window.localStorage.getItem('syncroom:nickname');
    setRoomName(queryRoom?.trim() || savedRoom || '함께 듣는 음악방');
    const nextName = queryName?.trim() || savedName || '';
    setNickname(nextName);
    setGuestName(nextName);
    setJoined(Boolean(nextName));
  }, [initialView, roomCode]);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      setElapsed((time) => Math.min(time + 1, currentTrack.duration));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [currentTrack.duration, isPlaying]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const progress = useMemo(
    () => Math.min(100, (elapsed / currentTrack.duration) * 100),
    [currentTrack.duration, elapsed],
  );

  const roomMembers = useMemo(() => {
    if (!nickname || members.some((member) => member.name === nickname)) return members;
    return [
      { name: nickname, role: '듣는 중', color: '#42d6aa', initials: nickname.charAt(0) },
      ...members.slice(0, 4),
    ];
  }, [nickname]);

  function playNext() {
    const next = queue[0];
    if (!next) {
      setToast('대기열에 다음 곡이 없어요');
      return;
    }
    setCurrentTrack(next);
    setQueue((tracks) => tracks.slice(1));
    setElapsed(0);
    setLiked(false);
    setIsPlaying(true);
    setToast(`다음 곡 · ${next.title}`);
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = request.trim();
    if (!query || searching) return;
    setSearching(true);
    setSearchError('');
    try {
      const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`);
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

  function reserveSearchResult(result: SearchResult) {
    setQueue((tracks) => [
      ...tracks,
      {
        id: Date.now(),
        title: result.title,
        artist: result.channelTitle,
        requestedBy: nickname || '나',
        duration: 204,
        palette: 'mint',
        thumbnail: result.thumbnail || undefined,
      },
    ]);
    setRequest('');
    setSearchResults([]);
    setActiveTab('queue');
    setToast(`예약 완료 · ${result.title}`);
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
    setNickname(name);
    setJoined(true);
  }

  if (initialView === 'home') return <HomeScreen />;
  if (initialView === 'help') return <HelpScreen />;

  return (
    <main className="page-stage">
      <section className="app-shell" aria-label="공동 음악방 프로토타입">
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
            <span className="member-stack" aria-hidden="true"><i>희</i><i>밤</i><i>혜</i></span>
            <b>{roomMembers.length}</b>
          </button>
        </header>

        <div className="content-scroll">
          <section className="now-playing" aria-labelledby="now-playing-title">
            <div className={`cover-art ${currentTrack.palette}`} aria-label={`${currentTrack.title} 앨범 아트`}>
              <div className="cover-noise" />
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <div className="cover-word">{currentTrack.title.slice(0, 5).toUpperCase()}</div>
              <div className="youtube-chip"><span>▶</span> YOUTUBE</div>
              <div className="equalizer" aria-hidden="true"><i /><i /><i /><i /></div>
            </div>

            <div className="track-copy">
              <div>
                <p id="now-playing-title" className="section-kicker">지금 함께 듣는 중</p>
                <h2>{currentTrack.title}</h2>
                <p>{currentTrack.artist} <span>·</span> 신청 {currentTrack.requestedBy}</p>
              </div>
              <button
                type="button"
                className={`heart-button ${liked ? 'liked' : ''}`}
                onClick={() => setLiked((value) => !value)}
                aria-label={liked ? '좋아요 취소' : '좋아요'}
                aria-pressed={liked}
              >
                {liked ? '♥' : '♡'}
              </button>
            </div>

            <div className="progress-wrap">
              <input
                aria-label="재생 위치"
                type="range"
                min="0"
                max={currentTrack.duration}
                value={elapsed}
                onChange={(event) => setElapsed(Number(event.target.value))}
                style={{ '--progress': `${progress}%` } as React.CSSProperties}
              />
              <div className="time-row"><span>{formatTime(elapsed)}</span><span>{formatTime(currentTrack.duration)}</span></div>
            </div>

            <div className="player-controls">
              <button type="button" className="side-control" onClick={() => setElapsed((time) => Math.max(0, time - 10))} aria-label="10초 뒤로">
                <span>↶</span><small>10</small>
              </button>
              <button
                type="button"
                className="play-button"
                onClick={() => setIsPlaying((value) => !value)}
                aria-label={isPlaying ? '일시정지' : '재생'}
              >
                {isPlaying ? <span className="pause-icon"><i /><i /></span> : <span className="play-icon">▶</span>}
              </button>
              <button type="button" className="side-control next-control" onClick={playNext} aria-label="다음 곡">
                <span>▶</span><i />
              </button>
            </div>

            <div className="sync-line">
              <span className="sync-icon">⌁</span>
              <span>모두 같은 재생 위치에 있어요</span>
              <strong>SYNCED</strong>
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
                      onClick={() => setQueue((tracks) => tracks.filter((item) => item.id !== track.id))}
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
                  <article className="member-row" key={member.name}>
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
              <div><p>YOUTUBE SEARCH</p><h2>검색 결과</h2></div>
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
                    <button type="button" onClick={() => reserveSearchResult(result)}>예약</button>
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
            placeholder="노래 제목이나 YouTube 링크"
          />
          <button type="submit" disabled={!request.trim() || searching}>{searching ? '검색 중' : '검색'}</button>
        </form>

        {!joined && (
          <div className="guest-gate" role="dialog" aria-modal="true" aria-labelledby="guest-gate-title">
            <form className="guest-card" onSubmit={joinAsGuest}>
              <BrandMark />
              <p className="home-kicker">INVITED TO ROOM</p>
              <h2 id="guest-gate-title">{roomName}</h2>
              <div className="gate-code"><span>초대 코드</span><strong>{roomCode}</strong></div>
              <label>이 방에서 사용할 닉네임<input autoFocus value={guestName} maxLength={12} onChange={(event) => setGuestName(event.target.value)} placeholder="닉네임 입력" /></label>
              <button className="primary-start" type="submit" disabled={!guestName.trim()}>로그인 없이 입장하기 <span>→</span></button>
              <a href="/">다른 방 찾기</a>
            </form>
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
