import { ensureDatabase, getDatabase } from '@/db/runtime';

const searchLimitPerHour = 20;

async function authorizeSearch(request: Request) {
  const code = (request.headers.get('x-syncroom-code') || '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const guestId = (request.headers.get('x-syncroom-guest') || '').trim().slice(0, 80);
  if (code.length !== 6 || !guestId) {
    return Response.json({ error: '음악방에 입장한 뒤 검색해 주세요.' }, { status: 401 });
  }
  const database = await ensureDatabase(getDatabase());
  const participant = await database.prepare(
    'SELECT guest_id FROM participants WHERE room_code = ? AND guest_id = ?',
  ).bind(code, guestId).first<{ guest_id: string }>();
  if (!participant) {
    return Response.json({ error: '음악방에 다시 입장한 뒤 검색해 주세요.' }, { status: 401 });
  }

  const now = Date.now();
  const key = `youtube:${code}:${guestId}`;
  const limit = await database.prepare(
    'SELECT window_started_at, count FROM api_rate_limits WHERE key = ?',
  ).bind(key).first<{ window_started_at: number; count: number }>();
  if (!limit || now - limit.window_started_at >= 60 * 60_000) {
    await database.prepare(`INSERT INTO api_rate_limits (key, window_started_at, count, updated_at)
      VALUES (?, ?, 1, ?) ON CONFLICT(key) DO UPDATE SET window_started_at = excluded.window_started_at,
      count = 1, updated_at = excluded.updated_at`).bind(key, now, now).run();
    return null;
  }
  if (limit.count >= searchLimitPerHour) {
    return Response.json({ error: '검색을 잠시 많이 사용했어요. 조금 뒤 다시 시도해 주세요.' }, { status: 429 });
  }
  await database.prepare('UPDATE api_rate_limits SET count = count + 1, updated_at = ? WHERE key = ?')
    .bind(now, key).run();
  return null;
}

function demoResults(query: string) {
  return [
    {
      videoId: `demo-${encodeURIComponent(query)}-1`,
      title: query,
      channelTitle: 'YouTube 검색 결과 미리보기',
      thumbnail: null,
    },
    {
      videoId: 'demo-supernova',
      title: 'Supernova',
      channelTitle: 'aespa',
      thumbnail: null,
    },
    {
      videoId: 'demo-ditto',
      title: 'Ditto',
      channelTitle: 'NewJeans',
      thumbnail: null,
    },
  ];
}

function decodeEntities(value: string) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&#39;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim();
  if (!query) return Response.json({ error: '검색어를 입력해 주세요.' }, { status: 400 });
  const denied = await authorizeSearch(request);
  if (denied) return denied;

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return Response.json({ demo: true, results: demoResults(query) });
  }

  const endpoint = new URL('https://www.googleapis.com/youtube/v3/search');
  endpoint.searchParams.set('part', 'snippet');
  endpoint.searchParams.set('type', 'video');
  endpoint.searchParams.set('videoEmbeddable', 'true');
  endpoint.searchParams.set('maxResults', '5');
  endpoint.searchParams.set('q', query);

  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/json',
      'x-goog-api-key': apiKey,
    },
  });
  if (!response.ok) {
    return Response.json({ error: 'YouTube 검색을 잠시 사용할 수 없어요.' }, { status: 502 });
  }

  const data = await response.json() as {
    items?: Array<{
      id?: { videoId?: string };
      snippet?: {
        title?: string;
        channelTitle?: string;
        thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
      };
    }>;
  };

  const results = (data.items || []).flatMap((item) => {
    const videoId = item.id?.videoId;
    const snippet = item.snippet;
    if (!videoId || !snippet?.title) return [];
    return [{
      videoId,
      title: decodeEntities(snippet.title),
      channelTitle: decodeEntities(snippet.channelTitle || 'YouTube'),
      thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || null,
    }];
  });

  return Response.json({ demo: false, results });
}
