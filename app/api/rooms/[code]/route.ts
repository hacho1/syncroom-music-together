import { ensureDatabase, getDatabase } from '@/db/runtime';

type RouteContext = { params: Promise<{ code: string }> };

type RoomRow = {
  code: string;
  name: string;
  host_guest_id: string;
  created_at: number;
  updated_at: number;
};

type PlaybackRow = {
  room_code: string;
  video_id: string;
  title: string;
  artist: string;
  thumbnail: string | null;
  requested_by: string;
  duration: number;
  playing: number;
  position: number;
  position_updated_at: number;
  revision: number;
  updated_at: number;
};

type QueueRow = {
  id: number;
  room_code: string;
  video_id: string;
  title: string;
  artist: string;
  thumbnail: string | null;
  requested_by: string;
  requester_guest_id: string;
  duration: number;
  created_at: number;
};

type ParticipantRow = {
  guest_id: string;
  nickname: string;
  role: 'host' | 'guest';
  color: string;
  joined_at: number;
  last_seen: number;
};

const colors = ['#ff3d78', '#8b7cff', '#ffb84d', '#42d6aa', '#5d90ff', '#ef6fff'];

function roomCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function safeText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function guestColor(guestId: string) {
  let hash = 0;
  for (const character of guestId) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

function error(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

async function participantExists(database: D1Database, code: string, guestId: string) {
  const row = await database.prepare(
    'SELECT guest_id FROM participants WHERE room_code = ? AND guest_id = ?',
  ).bind(code, guestId).first<{ guest_id: string }>();
  return Boolean(row);
}

async function requireHost(database: D1Database, code: string, guestId: string) {
  const room = await database.prepare('SELECT host_guest_id FROM rooms WHERE code = ?')
    .bind(code).first<{ host_guest_id: string }>();
  return room?.host_guest_id === guestId;
}

async function refreshHost(database: D1Database, code: string, now: number) {
  const activeAfter = now - 60_000;
  const room = await database.prepare('SELECT host_guest_id FROM rooms WHERE code = ?')
    .bind(code).first<{ host_guest_id: string }>();
  if (!room) return;
  const host = await database.prepare(
    'SELECT guest_id FROM participants WHERE room_code = ? AND guest_id = ? AND last_seen >= ?',
  ).bind(code, room.host_guest_id, activeAfter).first<{ guest_id: string }>();
  if (host) return;
  const nextHost = await database.prepare(
    'SELECT guest_id FROM participants WHERE room_code = ? AND last_seen >= ? ORDER BY joined_at ASC LIMIT 1',
  ).bind(code, activeAfter).first<{ guest_id: string }>();
  if (!nextHost) return;
  await database.batch([
    database.prepare('UPDATE rooms SET host_guest_id = ?, updated_at = ? WHERE code = ?')
      .bind(nextHost.guest_id, now, code),
    database.prepare("UPDATE participants SET role = CASE WHEN guest_id = ? THEN 'host' ELSE 'guest' END WHERE room_code = ?")
      .bind(nextHost.guest_id, code),
  ]);
}

async function readRoomState(database: D1Database, code: string, viewerGuestId = '') {
  const activeAfter = Date.now() - 60_000;
  const [room, playback, queue, participants] = await Promise.all([
    database.prepare('SELECT * FROM rooms WHERE code = ?').bind(code).first<RoomRow>(),
    database.prepare('SELECT * FROM playback WHERE room_code = ?').bind(code).first<PlaybackRow>(),
    database.prepare('SELECT * FROM queue_items WHERE room_code = ? ORDER BY id ASC').bind(code).all<QueueRow>(),
    database.prepare(
      'SELECT guest_id, nickname, role, color, joined_at, last_seen FROM participants WHERE room_code = ? AND last_seen >= ? ORDER BY role DESC, joined_at ASC',
    ).bind(code, activeAfter).all<ParticipantRow>(),
  ]);
  if (!room || !playback) return null;
  const now = Date.now();
  const position = playback.playing
    ? Math.min(playback.duration, playback.position + Math.max(0, now - playback.position_updated_at) / 1000)
    : playback.position;
  return {
    serverTime: now,
    room: {
      code: room.code,
      name: room.name,
      isHost: room.host_guest_id === viewerGuestId,
    },
    currentTrack: {
      id: 0,
      videoId: playback.video_id,
      title: playback.title,
      artist: playback.artist,
      thumbnail: playback.thumbnail,
      requestedBy: playback.requested_by,
      duration: playback.duration,
      palette: 'pink',
    },
    playback: {
      isPlaying: Boolean(playback.playing),
      position,
      positionUpdatedAt: playback.position_updated_at,
      revision: playback.revision,
    },
    queue: queue.results.map((item) => ({
      id: item.id,
      videoId: item.video_id,
      title: item.title,
      artist: item.artist,
      thumbnail: item.thumbnail,
      requestedBy: item.requested_by,
      duration: item.duration,
      palette: 'mint',
    })),
    members: participants.results.map((member) => ({
      id: member.guest_id === viewerGuestId ? 'self' : `${member.joined_at}-${member.nickname}`,
      name: member.nickname,
      role: member.role === 'host' ? 'DJ' : '듣는 중',
      color: member.color,
      initials: member.nickname.charAt(0),
      lastSeen: member.last_seen,
    })),
  };
}

export async function GET(request: Request, { params }: RouteContext) {
  const code = roomCode((await params).code);
  if (code.length !== 6) return error('올바른 6자리 방 코드가 아니에요.', 400);
  const viewerGuestId = safeText(request.headers.get('x-syncroom-guest'), 80);
  const database = await ensureDatabase(getDatabase());
  const state = await readRoomState(database, code, viewerGuestId);
  return state ? Response.json(state) : error('존재하지 않거나 만료된 음악방이에요.', 404);
}

export async function POST(request: Request, { params }: RouteContext) {
  const code = roomCode((await params).code);
  if (code.length !== 6) return error('올바른 6자리 방 코드가 아니에요.', 400);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return error('요청 내용을 확인해 주세요.', 400);
  const action = safeText(body.action, 32);
  const guestId = safeText(body.guestId, 80);
  const nickname = safeText(body.nickname, 12);
  const now = Date.now();
  const database = await ensureDatabase(getDatabase());

  if (action === 'join') {
    if (!guestId || !nickname) return error('닉네임을 입력해 주세요.', 400);
    let room = await database.prepare('SELECT * FROM rooms WHERE code = ?').bind(code).first<RoomRow>();
    const create = body.create === true;
    if (!room && !create) return error('존재하지 않거나 만료된 음악방이에요.', 404);
    if (!room) {
      const name = safeText(body.roomName, 24) || '함께 듣는 음악방';
      await database.batch([
        database.prepare('INSERT INTO rooms (code, name, host_guest_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
          .bind(code, name, guestId, now, now),
        database.prepare(`INSERT INTO playback (
          room_code, video_id, title, artist, thumbnail, requested_by, duration,
          playing, position, position_updated_at, revision, updated_at
        ) VALUES (?, '', ?, 'SYNCROOM', NULL, ?, 1, 0, 0, ?, 1, ?)`)
          .bind(code, '음악을 신청해 주세요', nickname, now, now),
      ]);
      room = await database.prepare('SELECT * FROM rooms WHERE code = ?').bind(code).first<RoomRow>();
    } else if (create && room.host_guest_id !== guestId) {
      return error('방 코드가 겹쳤어요. 홈에서 새 방을 다시 만들어 주세요.', 409);
    }
    const existingParticipant = await database.prepare(
      'SELECT guest_id FROM participants WHERE room_code = ? AND guest_id = ?',
    ).bind(code, guestId).first<{ guest_id: string }>();
    if (!existingParticipant) {
      const participantCount = await database.prepare(
        'SELECT COUNT(*) AS count FROM participants WHERE room_code = ? AND last_seen >= ?',
      ).bind(code, now - 60_000).first<{ count: number }>();
      if ((participantCount?.count || 0) >= 50) return error('이 음악방은 참가자가 가득 찼어요.', 429);
    }
    const role = room?.host_guest_id === guestId ? 'host' : 'guest';
    await database.prepare(`INSERT INTO participants (
      room_code, guest_id, nickname, role, color, joined_at, last_seen
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(room_code, guest_id) DO UPDATE SET nickname = excluded.nickname, role = excluded.role, last_seen = excluded.last_seen`)
      .bind(code, guestId, nickname, role, guestColor(guestId), now, now).run();
  } else {
    if (!guestId || !(await participantExists(database, code, guestId))) {
      return error('음악방에 다시 입장해 주세요.', 401);
    }

    if (action === 'heartbeat') {
      await database.prepare('UPDATE participants SET last_seen = ?, nickname = ? WHERE room_code = ? AND guest_id = ?')
        .bind(now, nickname || '게스트', code, guestId).run();
      await database.prepare('DELETE FROM participants WHERE room_code = ? AND last_seen < ?')
        .bind(code, now - 5 * 60_000).run();
      await refreshHost(database, code, now);
    } else if (action === 'queue:add') {
      const videoId = safeText(body.videoId, 32);
      const title = safeText(body.title, 160);
      if (!videoId || !title) return error('예약할 영상을 확인해 주세요.', 400);
      const queueCount = await database.prepare('SELECT COUNT(*) AS count FROM queue_items WHERE room_code = ?')
        .bind(code).first<{ count: number }>();
      if ((queueCount?.count || 0) >= 100) return error('대기열이 가득 찼어요. 재생 후 다시 신청해 주세요.', 429);
      await database.prepare(`INSERT INTO queue_items (
        room_code, video_id, title, artist, thumbnail, requested_by,
        requester_guest_id, duration, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          code,
          videoId,
          title,
          safeText(body.artist, 100) || 'YouTube',
          safeText(body.thumbnail, 500) || null,
          nickname || '게스트',
          guestId,
          Math.max(1, Math.min(7200, Number(body.duration) || 204)),
          now,
        ).run();
    } else if (action === 'queue:remove') {
      const id = Number(body.id);
      const item = await database.prepare('SELECT requester_guest_id FROM queue_items WHERE room_code = ? AND id = ?')
        .bind(code, id).first<{ requester_guest_id: string }>();
      if (!item) return error('대기열 항목을 찾지 못했어요.', 404);
      const isHost = await requireHost(database, code, guestId);
      if (!isHost && item.requester_guest_id !== guestId) return error('본인이 신청한 곡만 삭제할 수 있어요.', 403);
      await database.prepare('DELETE FROM queue_items WHERE room_code = ? AND id = ?').bind(code, id).run();
    } else if (action === 'playback:set') {
      if (!(await requireHost(database, code, guestId))) return error('DJ만 재생을 제어할 수 있어요.', 403);
      const playing = body.playing === true;
      const position = Math.max(0, Number(body.position) || 0);
      await database.prepare(`UPDATE playback SET playing = ?, position = ?, position_updated_at = ?,
        revision = revision + 1, updated_at = ? WHERE room_code = ?`)
        .bind(playing ? 1 : 0, position, now, now, code).run();
    } else if (action === 'playback:next') {
      if (!(await requireHost(database, code, guestId))) return error('DJ만 다음 곡을 재생할 수 있어요.', 403);
      const next = await database.prepare('SELECT * FROM queue_items WHERE room_code = ? ORDER BY id ASC LIMIT 1')
        .bind(code).first<QueueRow>();
      if (!next) return error('대기열에 다음 곡이 없어요.', 409);
      await database.batch([
        database.prepare(`UPDATE playback SET video_id = ?, title = ?, artist = ?, thumbnail = ?, requested_by = ?,
          duration = ?, playing = 1, position = 0, position_updated_at = ?, revision = revision + 1, updated_at = ?
          WHERE room_code = ?`)
          .bind(next.video_id, next.title, next.artist, next.thumbnail, next.requested_by, next.duration, now, now, code),
        database.prepare('DELETE FROM queue_items WHERE room_code = ? AND id = ?').bind(code, next.id),
      ]);
    } else {
      return error('지원하지 않는 음악방 동작이에요.', 400);
    }
  }

  const state = await readRoomState(database, code, guestId);
  return state ? Response.json(state) : error('음악방 상태를 불러오지 못했어요.', 500);
}
