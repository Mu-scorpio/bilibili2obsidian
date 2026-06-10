import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, normalizePath } from 'obsidian';
import { readBilibiliSessdata } from './cookie-reader';
import https from 'https';

// ── Settings ──

interface BilibiliPluginSettings {
  sessdata: string;
  defaultLang: string;
  autoReadCookie: boolean;
  includeTimestamp: boolean;
}

const DEFAULT_SETTINGS: BilibiliPluginSettings = {
  sessdata: '',
  defaultLang: 'ai-zh',
  autoReadCookie: true,
  includeTimestamp: true,
};

// ── Types ──

interface VideoMeta {
  bvid: string;
  aid: number;
  cid: number;
  title: string;
  owner: string;
  view: number | undefined;
  danmaku: number | undefined;
  duration: number;
  description: string;
  pic: string;
  pubdate: number;
}

interface SubtitleTrack {
  id: string;
  lan: string;
  lanDoc: string;
  subtitleUrl: string;
}

interface SubtitleItem {
  from: number;
  to: number;
  content: string;
}

// ── Helpers ──

function normalizeBilibiliInput(input: string): { type: string; value: string } | null {
  const text = (input || '').trim();
  if (!text) return null;
  const bvMatch = text.match(/BV[a-zA-Z0-9]+/i);
  if (bvMatch) return { type: 'bv', value: bvMatch[0] };
  try {
    const url = new URL(text);
    if (url.hostname.includes('bilibili.com')) {
      const m = url.pathname.match(/BV[a-zA-Z0-9]+/i);
      if (m) return { type: 'bv', value: m[0] };
    }
  } catch {}
  return null;
}

function normalizeSubtitleUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return 'https://' + url.replace(/^\/\/+/, '');
}

function subtitlePriority(item: SubtitleTrack): number {
  const lan = (item.lan || '').toLowerCase();
  const label = (item.lanDoc || '').toLowerCase();
  if (lan === 'ai-zh' || lan === 'zh-cn' || lan === 'zh-hans') return 0;
  if (lan === 'zh') return 1;
  if (lan.includes('zh')) return 2;
  if (label.includes('中文')) return 3;
  if (lan === 'en' || lan === 'ai-en') return 10;
  if (lan.includes('en')) return 11;
  if (label.includes('英文') || label.includes('english')) return 12;
  return 50;
}

function secondsToTimestamp(totalSeconds: number, withHours?: boolean): string {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (withHours || h > 0) {
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  }
  return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
}

function formatPubdate(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function today(): string {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function escapeYaml(value: string): string {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ── HTTP ──

function httpGet(url: string, sessdata: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com',
        ...(sessdata ? { 'Cookie': 'SESSDATA=' + sessdata } : {}),
      },
    }, (res: any) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(httpGet(res.headers.location, sessdata));
      }
      let data = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk: string) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// ── API ──

async function fetchVideoMeta(bvid: string, sessdata: string): Promise<VideoMeta> {
  const raw = await httpGet('https://api.bilibili.com/x/web-interface/view?bvid=' + encodeURIComponent(bvid), sessdata);
  const data = JSON.parse(raw);
  if (data.code !== 0) throw new Error(data.message || '获取视频信息失败');
  const d = data.data;
  return {
    bvid: d.bvid,
    aid: d.aid,
    cid: d.cid,
    title: d.title,
    owner: d.owner?.name || '',
    view: d.stat?.view,
    danmaku: d.stat?.danmaku,
    duration: d.duration || 0,
    description: d.desc || '',
    pic: d.pic || '',
    pubdate: d.pubdate || 0,
  };
}

async function fetchSubtitleTracks(meta: VideoMeta, sessdata: string): Promise<SubtitleTrack[]> {
  const requests = [
    'https://api.bilibili.com/x/player/wbi/v2?aid=' + meta.aid + '&cid=' + meta.cid + '&bvid=' + meta.bvid,
    'https://api.bilibili.com/x/player/v2?bvid=' + meta.bvid + '&cid=' + meta.cid,
  ];
  for (const url of requests) {
    try {
      const raw = await httpGet(url, sessdata);
      const data = JSON.parse(raw);
      if (data.code !== 0) continue;
      const raw_subs = data.data?.subtitle?.subtitles || [];
      const tracks: SubtitleTrack[] = raw_subs.map((item: any) => ({
        id: String(item.id ?? ''),
        lan: item.lan || '',
        lanDoc: item.lan_doc || '',
        subtitleUrl: normalizeSubtitleUrl(item.subtitle_url || ''),
      }));
      if (tracks.length > 0) return tracks.sort((a, b) => subtitlePriority(a) - subtitlePriority(b));
    } catch {}
  }
  return [];
}

async function fetchSubtitleBody(url: string, sessdata: string): Promise<SubtitleItem[]> {
  const raw = await httpGet(url, sessdata);
  const json = JSON.parse(raw);
  return (json.body || []).map((item: any) => ({
    from: item.from as number,
    to: item.to as number,
    content: (item.content || '').trim(),
  }));
}

// ── Note builder ──

function buildFrontmatter(meta: VideoMeta, subtitleLabel: string): string {
  const lines: string[] = [];
  lines.push('---');
  lines.push('title: "' + escapeYaml(meta.title) + '"');
  lines.push('source: "https://www.bilibili.com/video/' + meta.bvid + '"');
  lines.push('author:');
  lines.push('  - "' + escapeYaml(meta.owner) + '"');
  if (meta.pubdate) lines.push('published: ' + formatPubdate(meta.pubdate));
  lines.push('created: ' + today());
  if (meta.description) {
    const desc = meta.description.replace(/\n/g, ' ').substring(0, 200);
    lines.push('description: "' + escapeYaml(desc) + '"');
  }
  lines.push('tags:');
  lines.push('  - "bilibili"');
  lines.push('  - "clippings"');
  lines.push('bilibili_bvid: ' + meta.bvid);
  lines.push('bilibili_cid: ' + meta.cid);
  lines.push('bilibili_duration: ' + meta.duration);
  lines.push('bilibili_view: ' + (meta.view ?? 0));
  lines.push('bilibili_danmaku: ' + (meta.danmaku ?? 0));
  lines.push('subtitle_lang: "' + escapeYaml(subtitleLabel) + '"');
  lines.push('---');
  return lines.join('\n');
}

function buildSubtitleBlock(items: SubtitleItem[], withHours: boolean, includeTimestamp: boolean, secondaryMap?: Map<number, string>): string {
  const lines: string[] = [];
  for (const item of items) {
    let line = '';
    if (includeTimestamp) {
      line += '[' + secondsToTimestamp(item.from, withHours) + '] ';
    }
    line += item.content;
    if (secondaryMap) {
      const key = Math.round(item.from * 10);
      const sec = secondaryMap.get(key);
      if (sec) line += ' / ' + sec;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

function buildSecondaryMap(items: SubtitleItem[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const item of items) {
    map.set(Math.round(item.from * 10), item.content);
  }
  return map;
}

function buildNote(opts: {
  meta: VideoMeta;
  subtitleItems: SubtitleItem[];
  subtitleLabel: string;
  includeTimestamp: boolean;
}): string {
  const { meta, subtitleItems, subtitleLabel, includeTimestamp } = opts;
  const withHours = meta.duration >= 3600;
  const parts: string[] = [];

  parts.push(buildFrontmatter(meta, subtitleLabel));
  parts.push('');
  parts.push(subtitleItems.length > 0
    ? buildSubtitleBlock(subtitleItems, withHours, includeTimestamp)
    : '未抓取到字幕。');
  parts.push('');

  return parts.join('\n');
}

function buildDualNote(opts: {
  meta: VideoMeta;
  primaryItems: SubtitleItem[];
  secondaryItems: SubtitleItem[];
  primaryLabel: string;
  secondaryLabel: string;
  includeTimestamp: boolean;
}): string {
  const { meta, primaryItems, secondaryItems, primaryLabel, secondaryLabel, includeTimestamp } = opts;
  const withHours = meta.duration >= 3600;
  const secMap = buildSecondaryMap(secondaryItems);
  const parts: string[] = [];

  parts.push(buildFrontmatter(meta, primaryLabel + ' / ' + secondaryLabel));
  parts.push('');
  parts.push(buildSubtitleBlock(primaryItems, withHours, includeTimestamp, secMap));
  parts.push('');

  return parts.join('\n');
}

// ── Modals ──

class BilibiliInputModal extends Modal {
  private value = '';
  private onSubmit: (value: string) => void;

  constructor(app: App, onSubmit: (value: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: '输入 B 站视频信息' });
    new Setting(contentEl).setName('BV号或链接').addText((text) => {
      text.setPlaceholder('BV1efV26xEhf 或完整链接');
      text.inputEl.style.width = '100%';
      text.onChange((v) => { this.value = v; });
    });
    new Setting(contentEl).addButton((btn) => {
      btn.setButtonText('抓取字幕').setCta().onClick(() => {
        this.close();
        this.onSubmit(this.value);
      });
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class SubtitleSelectModal extends Modal {
  private tracks: SubtitleTrack[];
  private onSubmit: (mode: 'single' | 'dual', primary: SubtitleTrack, secondary?: SubtitleTrack) => void;
  private selectedPrimary = 0;
  private selectedSecondary = 1;

  constructor(app: App, tracks: SubtitleTrack[], onSubmit: (mode: 'single' | 'dual', primary: SubtitleTrack, secondary?: SubtitleTrack) => void) {
    super(app);
    this.tracks = tracks;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: '选择字幕语言' });
    contentEl.createEl('p', { text: '检测到 ' + this.tracks.length + ' 种语言字幕，请选择：' });

    new Setting(contentEl).setName('字幕语言').addDropdown((dd) => {
      this.tracks.forEach((t, i) => {
        dd.addOption(String(i), t.lanDoc + ' (' + t.lan + ')');
      });
      dd.setValue('0');
      dd.onChange((v) => { this.selectedPrimary = parseInt(v); });
    });

    let secondarySetting: Setting | null = null;

    new Setting(contentEl)
      .setName('生成双语字幕')
      .setDesc('同时选择第二语言，生成双语对照笔记')
      .addToggle((toggle) => {
        toggle.setValue(false).onChange((v) => {
          if (secondarySetting) secondarySetting.settingEl.style.display = v ? '' : 'none';
        });
      });

    secondarySetting = new Setting(contentEl).setName('第二语言').addDropdown((dd) => {
      this.tracks.forEach((t, i) => {
        dd.addOption(String(i), t.lanDoc + ' (' + t.lan + ')');
      });
      dd.setValue(this.tracks.length > 1 ? '1' : '0');
      dd.onChange((v) => { this.selectedSecondary = parseInt(v); });
    });
    secondarySetting.settingEl.style.display = 'none';

    new Setting(contentEl).addButton((btn) => {
      btn.setButtonText('生成笔记').setCta().onClick(() => {
        this.close();
        const primary = this.tracks[this.selectedPrimary];
        const toggles = contentEl.querySelectorAll('input[type="checkbox"]');
        let dualEnabled = false;
        toggles.forEach((t: HTMLInputElement) => { if (t.checked) dualEnabled = true; });
        if (dualEnabled && this.tracks.length > 1) {
          this.onSubmit('dual', primary, this.tracks[this.selectedSecondary]);
        } else {
          this.onSubmit('single', primary);
        }
      });
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// ── Settings Tab ──

class BilibiliSettingTab extends PluginSettingTab {
  plugin: BilibiliToObsidianPlugin;

  constructor(app: App, plugin: BilibiliToObsidianPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Bilibili to Obsidian 设置' });

    new Setting(containerEl)
      .setName('自动读取 Chrome Cookie')
      .setDesc('启动时自动从 Chrome 浏览器读取 B 站登录态')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.autoReadCookie).onChange(async (v) => {
          this.plugin.settings.autoReadCookie = v;
          await this.plugin.saveSettings();
          if (v) {
            await this.plugin.autoReadSessdata();
            this.display();
          }
        });
      });

    new Setting(containerEl)
      .setName('SESSDATA（手动覆盖）')
      .setDesc('如自动读取失败，可手动粘贴 B 站 Cookie 中的 SESSDATA 值')
      .addText((text) => {
        text.setPlaceholder('留空则使用自动读取');
        text.inputEl.style.width = '100%';
        text.setValue(this.plugin.settings.sessdata);
        text.onChange(async (v) => {
          this.plugin.settings.sessdata = v.trim();
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('默认字幕语言')
      .setDesc('单语言时自动使用的语言代码。多语言时会弹出选择框。')
      .addText((text) => {
        text.setPlaceholder('ai-zh');
        text.setValue(this.plugin.settings.defaultLang);
        text.onChange(async (v) => {
          this.plugin.settings.defaultLang = v.trim() || 'ai-zh';
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('字幕包含时间戳')
      .setDesc('生成的字幕文本是否在每行前面加上时间戳')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.includeTimestamp).onChange(async (v) => {
          this.plugin.settings.includeTimestamp = v;
          await this.plugin.saveSettings();
        });
      });
  }
}

// ── Plugin ──

export default class BilibiliToObsidianPlugin extends Plugin {
  settings: BilibiliPluginSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();
    await this.autoReadSessdata();

    this.addRibbonIcon('youtube', 'Bilibili 转笔记', () => {
      new BilibiliInputModal(this.app, (value) => {
        this.startFetch(value);
      }).open();
    });

    this.addCommand({
      id: 'open-bilibili-note-input',
      name: '从B站视频生成笔记',
      callback: () => {
        new BilibiliInputModal(this.app, (value) => {
          this.startFetch(value);
        }).open();
      },
    });

    this.addSettingTab(new BilibiliSettingTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  getSessdata(): string {
    return this.settings.sessdata || '';
  }

  async autoReadSessdata(): Promise<void> {
    if (!this.settings.autoReadCookie) return;
    if (this.settings.sessdata) return;
    try {
      const sessdata = readBilibiliSessdata();
      if (sessdata) {
        this.settings.sessdata = sessdata;
        await this.saveSettings();
        console.log('[Bilibili] Auto-read SESSDATA from Chrome (' + sessdata.length + ' chars)');
      }
    } catch (e) {
      console.warn('[Bilibili] Failed to auto-read cookie:', e);
    }
  }

  async startFetch(input: string): Promise<void> {
    try {
      const parsed = normalizeBilibiliInput(input);
      if (!parsed) {
        new Notice('请输入有效 BV 号或 B 站视频链接');
        return;
      }

      if (!this.getSessdata()) {
        new Notice('未获取到 B 站登录态，请在设置中开启自动读取或手动填写 SESSDATA');
        return;
      }

      new Notice('正在获取视频信息...');
      const meta = await fetchVideoMeta(parsed.value, this.getSessdata());

      new Notice('正在获取字幕列表...');
      const tracks = await fetchSubtitleTracks(meta, this.getSessdata());

      if (tracks.length === 0) {
        new Notice('该视频无可用字幕');
        return;
      }

      if (tracks.length === 1) {
        new Notice('正在获取字幕内容 (' + tracks[0].lanDoc + ')...');
        const items = await fetchSubtitleBody(tracks[0].subtitleUrl, this.getSessdata());
        const note = buildNote({
          meta,
          subtitleItems: items,
          subtitleLabel: tracks[0].lanDoc,
          includeTimestamp: this.settings.includeTimestamp,
        });
        await this.writeNote(meta.title, note);
      } else {
        new Notice('检测到 ' + tracks.length + ' 种语言字幕');
        new SubtitleSelectModal(this.app, tracks, async (mode, primary, secondary) => {
          try {
            if (mode === 'dual' && secondary) {
              new Notice('正在获取双语字幕...');
              const [primaryItems, secondaryItems] = await Promise.all([
                fetchSubtitleBody(primary.subtitleUrl, this.getSessdata()),
                fetchSubtitleBody(secondary.subtitleUrl, this.getSessdata()),
              ]);
              const note = buildDualNote({
                meta,
                primaryItems,
                secondaryItems,
                primaryLabel: primary.lanDoc,
                secondaryLabel: secondary.lanDoc,
                includeTimestamp: this.settings.includeTimestamp,
              });
              await this.writeNote(meta.title, note);
            } else {
              new Notice('正在获取字幕内容 (' + primary.lanDoc + ')...');
              const items = await fetchSubtitleBody(primary.subtitleUrl, this.getSessdata());
              const note = buildNote({
                meta,
                subtitleItems: items,
                subtitleLabel: primary.lanDoc,
                includeTimestamp: this.settings.includeTimestamp,
              });
              await this.writeNote(meta.title, note);
            }
          } catch (e: any) {
            console.error(e);
            new Notice('生成失败: ' + e.message);
          }
        }).open();
      }
    } catch (e: any) {
      console.error(e);
      new Notice('抓取失败: ' + e.message);
    }
  }

  async writeNote(title: string, content: string): Promise<void> {
    const safeTitle = (title || '未命名视频').replace(/[\\/:*?"<>|]/g, ' ').trim() || '未命名视频';
    const filePath = normalizePath(safeTitle + '.md');
    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (!existing) {
      await this.app.vault.create(filePath, content);
    } else {
      await this.app.vault.modify(existing as any, content);
    }
    new Notice('笔记已生成: ' + filePath);
  }
}
