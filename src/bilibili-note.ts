
import { SubtitleItem } from './bilibili-fetch';

export function normalizeBilibiliInput(input: string): { type: string; value: string } | null {
  const text = (input || '').trim();
  if (!text) return null;
  const bvMatch = text.match(/BV[a-zA-Z0-9]+/i);
  if (bvMatch) return { type: 'bv', value: bvMatch[0].toUpperCase() };
  try {
    const url = new URL(text);
    if (url.hostname.includes('bilibili.com')) {
      const m = url.pathname.match(/BV[a-zA-Z0-9]+/i);
      if (m) return { type: 'bv', value: m[0].toUpperCase() };
    }
  } catch {}
  return null;
}

function secondsToTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  }
  return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
}

export function buildNote(opts: {
  title: string;
  videoUrl: string;
  bvid: string;
  cid: number;
  owner: string;
  view: number | undefined;
  danmaku: number | undefined;
  subtitleItems: SubtitleItem[];
}): string {
  const { title, videoUrl, bvid, cid, owner, view, danmaku, subtitleItems } = opts;
  const lines: string[] = [];

  lines.push('# ' + title);
  lines.push('');
  lines.push('> 自动生成自 Bilibili 视频信息与字幕。');
  lines.push('');

  // 视频信息
  lines.push('## 视频信息');
  lines.push('');
  lines.push('- 标题: ' + title);
  lines.push('- 链接: ' + videoUrl);
  lines.push('- BV: ' + bvid);
  lines.push('- CID: ' + (cid || '未知'));
  lines.push('- UP主: ' + (owner || '未知'));
  lines.push('- 播放量: ' + (view == null ? '未知' : view));
  lines.push('- 弹幕数: ' + (danmaku == null ? '未知' : danmaku));
  lines.push('');

  // AI 总结
  lines.push('## AI总结');
  lines.push('');
  if (!subtitleItems || subtitleItems.length === 0) {
    lines.push('未获取到字幕内容，无法生成总结。请确认视频是否存在字幕或公开 AI 字幕接口。');
    lines.push('');
  } else {
    const allText = subtitleItems.map((item) => item.text).join('\n');
    const sentences = allText.replace(/\s+/g, ' ').split(/(?<=[。！？!?.])/);
    const summary: string[] = [];
    for (const sentence of sentences) {
      const s = sentence.trim();
      if (!s) continue;
      if (summary.length >= 5) break;
      if (s.length >= 6 && s.length <= 120) summary.push(s);
    }
    if (summary.length === 0) {
      const first = subtitleItems.slice(0, 8).map((item) => item.text).join(' ');
      lines.push('- 视频内容起点: ' + first);
    } else {
      for (const s of summary) lines.push('- ' + s);
    }
    lines.push('');
    lines.push('> 注: 当前总结基于字幕原文提取，未调用外部大模型，可作为后续 AI 重写输入。');
    lines.push('');
  }

  // 时间戳目录
  lines.push('## 时间戳目录');
  lines.push('');
  const grouped: { minute: number; items: SubtitleItem[] }[] = [];
  let currentMinute = -1;
  let buffer: SubtitleItem[] = [];
  for (const item of subtitleItems || []) {
    const minute = Math.floor((item.start || 0) / 60);
    if (minute !== currentMinute) {
      if (buffer.length) grouped.push({ minute: currentMinute, items: buffer });
      currentMinute = minute;
      buffer = [];
    }
    buffer.push(item);
  }
  if (buffer.length) grouped.push({ minute: currentMinute, items: buffer });
  for (const group of grouped) {
    const mm = String(group.minute).padStart(2, '0');
    lines.push('- ' + mm + ':00');
    for (const item of group.items) {
      lines.push('  - [' + secondsToTimestamp(item.start) + '] ' + item.text);
    }
  }
  lines.push('');

  // 完整字幕
  lines.push('## 完整字幕');
  lines.push('');
  if (!subtitleItems || subtitleItems.length === 0) {
    lines.push('未抓取到字幕。');
    lines.push('');
  } else {
    for (const item of subtitleItems) {
      lines.push('[' + secondsToTimestamp(item.start) + '] ' + item.text);
    }
    lines.push('');
  }

  return lines.join('\n');
}
