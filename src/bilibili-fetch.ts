import https from 'https';
import http from 'http';

export interface VideoMeta {
  bvid: string;
  aid: number;
  cid: number;
  title: string;
  owner: string;
  view: number | undefined;
  danmaku: number | undefined;
}

export interface SubtitleItem {
  start: number;
  text: string;
}

function request(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('http://') ? http : https;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com',
      },
    }, (res: any) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(request(res.headers.location));
      }
      let data = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk: string) => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
  });
}

export async function fetchVideoMetaByBvid(bvid: string): Promise<VideoMeta> {
  const url = 'https://api.bilibili.com/x/web-interface/view?bvid=' + encodeURIComponent(bvid);
  const raw = await request(url);
  const json = JSON.parse(raw);
  if (json.code !== 0) throw new Error(json.message || '获取视频信息失败');
  const d = json.data;
  return {
    bvid: d.bvid,
    aid: d.aid,
    cid: d.cid,
    title: d.title,
    owner: d.owner?.name || '',
    view: d.stat?.view,
    danmaku: d.stat?.danmaku,
  };
}

function parseJsonSubtitleText(text: string): SubtitleItem[] | null {
  try {
    const json = JSON.parse(text);
    const body = json.body || [];
    return body
      .map((item: any) => ({
        start: item.from as number,
        text: (item.content || '').replace(/\s+/g, ' ').trim(),
      }))
      .filter((item: SubtitleItem) => item.text);
  } catch {
    return null;
  }
}

export async function fetchSubtitlesForMeta(meta: VideoMeta): Promise<SubtitleItem[]> {
  const cid = meta.cid;
  const aid = meta.aid;
  const tryUrls = [
    'https://api.bilibili.com/x/player/v2?bvid=' + encodeURIComponent(meta.bvid) + '&cid=' + encodeURIComponent(cid),
    'https://api.bilibili.com/x/player/wbi/v2?bvid=' + encodeURIComponent(meta.bvid) + '&cid=' + encodeURIComponent(cid),
    'https://api.bilibili.com/x/web-interface/view/detail?bvid=' + encodeURIComponent(meta.bvid),
    'https://api.bilibili.com/x/web-interface/view?aid=' + encodeURIComponent(aid),
  ];

  for (const url of tryUrls) {
    try {
      const raw = await request(url);
      const json = JSON.parse(raw);
      const candidateList: string[] = [];
      const subtitleInfo = json?.data?.subtitle || json?.data?.View?.subtitle;
      const subtitles = subtitleInfo?.subtitles || [];
      for (const sub of subtitles) {
        if (sub.subtitle_url) {
          candidateList.push(sub.subtitle_url.startsWith('//') ? 'https:' + sub.subtitle_url : sub.subtitle_url);
        }
      }
      if (json?.data?.subtitle?.submit_text_subtitle_list) {
        for (const sub of json.data.subtitle.submit_text_subtitle_list) {
          if (sub.subtitle_url) {
            candidateList.push(sub.subtitle_url.startsWith('//') ? 'https:' + sub.subtitle_url : sub.subtitle_url);
          }
        }
      }
      const unique = [...new Set(candidateList)].filter(Boolean);
      for (const subUrl of unique) {
        try {
          const subRaw = await request(subUrl);
          const items = parseJsonSubtitleText(subRaw);
          if (items && items.length) return items;
        } catch {}
      }
    } catch {}
  }
  return [];
}
