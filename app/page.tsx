'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Track = {
  id: number;
  title: string;
  artist: string;
  requestedBy: string;
  duration: number;
  palette: string;
};

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

export default function Home() {
  const [currentTrack, setCurrentTrack] = useState(initialTrack);
  const [queue, setQueue] = useState(initialQueue);
  const [isPlaying, setIsPlaying] = useState(true);
  const [elapsed, setElapsed] = useState(133);
  const [liked, setLiked] = useState(false);
  const [activeTab, setActiveTab] = useState<'queue' | 'members'>('queue');
  const [request, setRequest] = useState('');
  const [toast, setToast] = useState('');

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

  function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = request.trim();
    if (!title) return;
    setQueue((tracks) => [
      ...tracks,
      {
        id: Date.now(),
        title,
        artist: '검색 결과에서 선택',
        requestedBy: '나',
        duration: 204,
        palette: 'mint',
      },
    ]);
    setRequest('');
    setActiveTab('queue');
    setToast(`예약 완료 · ${title}`);
  }

  async function shareRoom() {
    const message = '희원이의 음악방 · HNW-824';
    try {
      await navigator.clipboard?.writeText(message);
      setToast('초대 코드가 복사됐어요');
    } catch {
      setToast('방 코드 · HNW-824');
    }
  }

  return (
    <main className="page-stage">
      <section className="app-shell" aria-label="공동 음악방 프로토타입">
        <header className="room-header">
          <div className="room-mark" aria-hidden="true"><span /><span /><span /></div>
          <div className="room-heading">
            <div className="eyebrow-row">
              <span className="live-dot" />
              <span>LIVE ROOM</span>
              <span className="room-code">HNW-824</span>
            </div>
            <h1>희원이의 음악방</h1>
          </div>
          <button className="member-pill" type="button" onClick={() => setActiveTab('members')}>
            <span className="member-stack" aria-hidden="true"><i>희</i><i>밤</i><i>혜</i></span>
            <b>5</b>
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
                참가자 <span>{members.length}</span>
              </button>
              <button className="invite-button" type="button" onClick={shareRoom}>초대</button>
            </div>

            {activeTab === 'queue' ? (
              <div className="queue-list" role="tabpanel">
                {queue.length ? queue.map((track, index) => (
                  <article className="queue-item" key={track.id}>
                    <span className="queue-number">{String(index + 1).padStart(2, '0')}</span>
                    <div className={`mini-cover ${track.palette}`}><span>{track.title.charAt(0)}</span></div>
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
                {members.map((member) => (
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

        <form className="request-bar" onSubmit={submitRequest}>
          <span className="search-icon" aria-hidden="true" />
          <input
            value={request}
            onChange={(event) => setRequest(event.target.value)}
            aria-label="신청곡 검색"
            placeholder="노래 제목이나 YouTube 링크"
          />
          <button type="submit" disabled={!request.trim()}>예약</button>
        </form>

        {toast && <div className="toast" role="status">{toast}</div>}
      </section>
    </main>
  );
}
