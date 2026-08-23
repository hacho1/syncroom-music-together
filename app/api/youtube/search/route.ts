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
  endpoint.searchParams.set('key', apiKey);

  const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
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
