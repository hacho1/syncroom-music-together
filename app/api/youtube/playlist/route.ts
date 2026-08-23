import { ensureDatabase, getDatabase } from '@/db/runtime';

const playlistImportsPerHour = 5;
const maxPlaylistItems = 100;

type PlaylistItem = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string | null;
};

type PlaylistItemResponse = {
  nextPageToken?: string;
  pageInfo?: { totalResults?: number };
  items?: Array<{
    snippet?: {
      title?: string;
      videoOwnerChannelTitle?: string;
      channelTitle?: string;
      resourceId?: { videoId?: string };
      thumbnails?: {
        medium?: { url?: string };
        default?: { url?: string };
      };
    };
    contentDetails?: { videoId?: string };
  }>;
};

type VideoDetailsResponse = {
  items?: Array<{
    id?: string;
    contentDetails?: { duration?: string };
    status?: { embeddable?: boolean; privacyStatus?: string };
  }>;
};

function decodeEntities(value: string) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&#39;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function playlistIdFromInput(value: unknown) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(host)) return '';
    const playlistId = url.searchParams.get('list') || '';
    return /^[A-Za-z0-9_-]{10,100}$/.test(playlistId) ? playlistId : '';
  } catch {
    return '';
  }
}

function parseYouTubeDuration(value = '') {
  const match = value.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return 204;
  const [, days, hours, minutes, seconds] = match;
  return Math.max(1, Math.min(86_400,
    Number(days || 0) * 86_400
    + Number(hours || 0) * 3_600
    + Number(minutes || 0) * 60
    + Number(seconds || 0),
  ));
}

async function authorizeImport(request: Request) {
  const code = (request.headers.get('x-syncroom-code') || '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const guestId = (request.headers.get('x-syncroom-guest') || '').trim().slice(0, 80);
  if (code.length !== 6 || !guestId) {
    return { denied: Response.json({ error: '음악방에 입장한 뒤 재생목록을 추가해 주세요.' }, { status: 401 }) };
  }

  const database = await ensureDatabase(getDatabase());
  const participant = await database.prepare(
    'SELECT nickname FROM participants WHERE room_code = ? AND guest_id = ?',
  ).bind(code, guestId).first<{ nickname: string }>();
  if (!participant) {
    return { denied: Response.json({ error: '음악방에 다시 입장한 뒤 재생목록을 추가해 주세요.' }, { status: 401 }) };
  }

  const now = Date.now();
  const key = `youtube-playlist:${code}:${guestId}`;
  const limit = await database.prepare(
    'SELECT window_started_at, count FROM api_rate_limits WHERE key = ?',
  ).bind(key).first<{ window_started_at: number; count: number }>();
  if (limit && now - limit.window_started_at < 60 * 60_000 && limit.count >= playlistImportsPerHour) {
    return { denied: Response.json({ error: '재생목록을 잠시 많이 추가했어요. 조금 뒤 다시 시도해 주세요.' }, { status: 429 }) };
  }
  if (!limit || now - limit.window_started_at >= 60 * 60_000) {
    await database.prepare(`INSERT INTO api_rate_limits (key, window_started_at, count, updated_at)
      VALUES (?, ?, 1, ?) ON CONFLICT(key) DO UPDATE SET window_started_at = excluded.window_started_at,
      count = 1, updated_at = excluded.updated_at`).bind(key, now, now).run();
  } else {
    await database.prepare('UPDATE api_rate_limits SET count = count + 1, updated_at = ? WHERE key = ?')
      .bind(now, key).run();
  }

  return { code, guestId, nickname: participant.nickname, database, now };
}

async function fetchPlaylistItems(apiKey: string, playlistId: string) {
  const items: PlaylistItem[] = [];
  let nextPageToken = '';
  let totalResults = 0;

  do {
    const endpoint = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    endpoint.searchParams.set('part', 'snippet,contentDetails');
    endpoint.searchParams.set('playlistId', playlistId);
    endpoint.searchParams.set('maxResults', '50');
    if (nextPageToken) endpoint.searchParams.set('pageToken', nextPageToken);
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json', 'x-goog-api-key': apiKey },
    });
    if (!response.ok) {
      const message = response.status === 403 || response.status === 404
        ? '재생목록을 찾지 못했어요. 공개 상태인지 확인해 주세요.'
        : 'YouTube 재생목록을 잠시 불러올 수 없어요.';
      throw new Error(message);
    }
    const data = await response.json() as PlaylistItemResponse;
    totalResults = Math.max(totalResults, data.pageInfo?.totalResults || 0);
    for (const item of data.items || []) {
      if (items.length >= maxPlaylistItems) break;
      const snippet = item.snippet;
      const videoId = item.contentDetails?.videoId || snippet?.resourceId?.videoId;
      if (!videoId || !snippet?.title || ['Private video', 'Deleted video'].includes(snippet.title)) continue;
      items.push({
        videoId,
        title: decodeEntities(snippet.title),
        channelTitle: decodeEntities(snippet.videoOwnerChannelTitle || snippet.channelTitle || 'YouTube'),
        thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || null,
      });
    }
    nextPageToken = items.length < maxPlaylistItems ? data.nextPageToken || '' : '';
  } while (nextPageToken);

  return { items, totalResults };
}

async function fetchVideoDetails(apiKey: string, videoIds: string[]) {
  const details = new Map<string, { duration: number; embeddable: boolean }>();
  for (let index = 0; index < videoIds.length; index += 50) {
    const endpoint = new URL('https://www.googleapis.com/youtube/v3/videos');
    endpoint.searchParams.set('part', 'contentDetails,status');
    endpoint.searchParams.set('id', videoIds.slice(index, index + 50).join(','));
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json', 'x-goog-api-key': apiKey },
    });
    if (!response.ok) throw new Error('재생 가능한 영상을 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    const data = await response.json() as VideoDetailsResponse;
    for (const item of data.items || []) {
      if (!item.id) continue;
      details.set(item.id, {
        duration: parseYouTubeDuration(item.contentDetails?.duration),
        embeddable: item.status?.embeddable === true && item.status?.privacyStatus !== 'private',
      });
    }
  }
  return details;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { url?: unknown } | null;
  const playlistId = playlistIdFromInput(body?.url);
  if (!playlistId) {
    return Response.json({ error: '올바른 YouTube 재생목록 링크를 넣어 주세요.' }, { status: 400 });
  }

  const authorized = await authorizeImport(request);
  if ('denied' in authorized) return authorized.denied;

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'YouTube API가 연결되어야 재생목록을 가져올 수 있어요.' }, { status: 503 });
  }

  try {
    const queueCount = await authorized.database.prepare(
      'SELECT COUNT(*) AS count FROM queue_items WHERE room_code = ?',
    ).bind(authorized.code).first<{ count: number }>();
    const remainingSlots = Math.max(0, 100 - (queueCount?.count || 0));
    if (!remainingSlots) {
      return Response.json({ error: '대기열이 가득 찼어요. 재생 후 다시 추가해 주세요.' }, { status: 429 });
    }

    const playlist = await fetchPlaylistItems(apiKey, playlistId);
    if (!playlist.items.length) {
      return Response.json({ error: '추가할 수 있는 공개 영상이 없는 재생목록이에요.' }, { status: 404 });
    }
    const details = await fetchVideoDetails(apiKey, playlist.items.map((item) => item.videoId));
    const playable = playlist.items.filter((item) => details.get(item.videoId)?.embeddable);
    const selected = playable.slice(0, remainingSlots);
    if (!selected.length) {
      return Response.json({ error: '웹에서 재생할 수 있는 영상이 없는 재생목록이에요.' }, { status: 422 });
    }

    await authorized.database.batch(selected.map((item, index) => authorized.database.prepare(`INSERT INTO queue_items (
      room_code, video_id, title, artist, thumbnail, requested_by,
      requester_guest_id, duration, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      authorized.code,
      item.videoId,
      item.title,
      item.channelTitle,
      item.thumbnail,
      authorized.nickname,
      authorized.guestId,
      details.get(item.videoId)?.duration || 204,
      authorized.now + index,
    )));

    const unavailable = playlist.items.length - playable.length;
    const queueOverflow = playable.length - selected.length;
    const overImportLimit = Math.max(0, playlist.totalResults - playlist.items.length);
    return Response.json({
      imported: selected.length,
      skipped: unavailable + queueOverflow + overImportLimit,
      total: playlist.totalResults || playlist.items.length,
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : '재생목록을 추가하지 못했어요.',
    }, { status: 502 });
  }
}
