import { ensureDatabase, getDatabase } from '@/db/runtime';

type PublicRoomRow = {
  code: string;
  name: string;
  max_participants: number;
  participant_count: number;
  video_id: string;
  title: string;
  artist: string;
  thumbnail: string | null;
  playing: number;
  updated_at: number;
};

export async function GET() {
  const database = await ensureDatabase(getDatabase());
  const activeAfter = Date.now() - 60_000;
  const rooms = await database.prepare(`
    SELECT
      r.code,
      r.name,
      r.max_participants,
      COUNT(p.guest_id) AS participant_count,
      playback.video_id,
      playback.title,
      playback.artist,
      playback.thumbnail,
      playback.playing,
      playback.updated_at
    FROM rooms r
    INNER JOIN playback ON playback.room_code = r.code
    LEFT JOIN participants p
      ON p.room_code = r.code AND p.last_seen >= ?
    WHERE r.visibility = 'public'
    GROUP BY
      r.code,
      r.name,
      r.max_participants,
      playback.video_id,
      playback.title,
      playback.artist,
      playback.thumbnail,
      playback.playing,
      playback.updated_at
    HAVING COUNT(p.guest_id) > 0
    ORDER BY COUNT(p.guest_id) DESC, playback.updated_at DESC
    LIMIT 30
  `).bind(activeAfter).all<PublicRoomRow>();

  return Response.json({
    rooms: rooms.results.map((room) => ({
      code: room.code,
      name: room.name,
      participantCount: Number(room.participant_count),
      maxParticipants: room.max_participants,
      currentTrack: {
        videoId: room.video_id,
        title: room.video_id ? room.title : '첫 신청곡을 기다리는 중',
        artist: room.video_id ? room.artist : '지금 들어가서 신청해 보세요',
        thumbnail: room.thumbnail,
      },
      isPlaying: Boolean(room.playing),
    })),
  }, {
    headers: { 'cache-control': 'no-store' },
  });
}
