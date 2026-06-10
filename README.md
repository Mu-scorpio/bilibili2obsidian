# Bilibili to Obsidian

[English](#english) | [中文](#中文)

Extract subtitles from [Bilibili](https://www.bilibili.com) (B站) videos and generate structured notes in [Obsidian](https://obsidian.md). Supports multi-language AI subtitles, bilingual mode, and YAML frontmatter.

从 B 站视频中提取字幕，在 Obsidian 中生成结构化笔记。支持多语言 AI 字幕、双语对照模式和 YAML frontmatter。

---

<a id="english"></a>

## English

### Features

- **One-click subtitle extraction** — Enter a BV number or Bilibili video URL from the sidebar icon or command palette
- **Automatic Chrome login detection** — Reads `SESSDATA` from your Chrome browser automatically, no manual cookie copying needed
- **Multi-language AI subtitle support** — Detects all available AI-generated subtitle tracks (Chinese, English, Japanese, Spanish, Arabic, Portuguese, etc.)
- **Language selection modal** — When multiple subtitle languages are available, a picker lets you choose one
- **Bilingual subtitle mode** — Generate dual-language notes with side-by-side translation (e.g. Chinese / English)
- **YAML frontmatter** — Notes include structured metadata following the Obsidian Web Clipper convention: `title`, `source`, `author`, `published`, `created`, `description`, `tags`
- **Bilibili-specific metadata** — Additional fields: `bilibili_bvid`, `bilibili_cid`, `bilibili_duration`, `bilibili_view`, `bilibili_danmaku`, `subtitle_lang`
- **Configurable timestamps** — Toggle `[00:00]` timestamps on each subtitle line in plugin settings
- **Secure cookie handling** — Decrypts Chrome cookies using macOS Keychain + AES-128-CBC; credentials never leave your machine
- **Auto-rename notes** — Output filename is the video title, with illegal characters sanitized

### Generated Note Example

```markdown
---
title: "Learn Apple Style Motion Graphics in 20 minutes"
source: "https://www.bilibili.com/video/BVxxxxxx"
author:
  - "CreatorName"
published: 2026-06-03
created: 2026-06-11
description: "Video description..."
tags:
  - "bilibili"
  - "clippings"
bilibili_bvid: BVxxxxxx
bilibili_cid: 123456
bilibili_duration: 1200
bilibili_view: 50000
bilibili_danmaku: 300
subtitle_lang: "中文"
---

[00:00] First subtitle line
[00:03] Second subtitle line
[00:07] Third subtitle line
...
```

### Installation

#### From Release (Recommended)

1. Download `main.js`, `manifest.json`, `styles.css` from [Releases](../../releases) (or download the `.zip` bundle)
2. Create the directory `<vault>/.obsidian/plugins/bilibili2obsidian/`
3. Place the three files into that directory
4. Restart Obsidian → Settings → Community plugins → Enable **Bilibili to Obsidian**

#### Build from Source

```bash
git clone https://github.com/Mu-scorpio/bilibili2obsidian.git
cd bilibili2obsidian
npm install
npm run build
```

The output `main.js` is the plugin entry point.

### Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| Auto-read Chrome Cookie | Read Bilibili SESSDATA from Chrome on startup | Enabled |
| SESSDATA (manual override) | Paste SESSDATA manually if auto-read fails | Empty |
| Default subtitle language | Language code used when only one track exists | `ai-zh` |
| Include timestamps | Prefix each subtitle line with `[mm:ss]` | Enabled |

### How It Works

```
Input: BV number or URL
        │
        ▼
┌─────────────────────────────────────────────┐
│  GET /x/web-interface/view?bvid=xxx         │
│  → Fetch video metadata (title, aid, cid)   │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  GET /x/player/wbi/v2?aid=xxx&cid=xxx      │
│  → Fetch subtitle track list (multi-lang)   │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  GET aisubtitle.hdslb.com/bfs/ai_subtitle/…│
│  → Fetch subtitle JSON (timed text)         │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  Generate Markdown note with YAML metadata  │
│  + full subtitle transcript                  │
└─────────────────────────────────────────────┘
```

### Chrome Cookie Decryption (macOS)

Bilibili's AI subtitle API requires a logged-in session. This plugin reads the encrypted `SESSDATA` cookie from Chrome's SQLite database and decrypts it:

1. Locate Chrome's cookie DB: `~/Library/Application Support/Google/Chrome/Default/Cookies`
2. Retrieve the encryption key from macOS Keychain: `security find-generic-password -w -a "Chrome" -s "Chrome Safe Storage"`
3. Derive AES-128-CBC key via PBKDF2 (1003 iterations, salt `saltysalt`)
4. Decrypt the `v10`-prefixed cookie value (16-byte IV + ciphertext)

All operations are local. No data leaves your machine.

### Related Projects

- [Bilibili-Obsidian-Clipper](https://github.com/haixiong1997/Bilibili-Obsidian-Clipper) — A Chrome extension with similar functionality; this plugin's subtitle fetching logic is adapted from it.

### Known Limitations

- Bilibili login (SESSDATA) is required for AI subtitles; unsubscribed videos return an empty subtitle list
- Cookie auto-read only works on macOS with Google Chrome; other platforms/browsers require manual SESSDATA input
- Subtitle URLs contain time-limited `auth_key` tokens and must be fetched immediately
- Relies on Bilibili's public API, which may change without notice

### Development

```bash
npm install        # Install dependencies
npm run build      # One-time build
npm run dev        # Watch mode
```

### License

MIT

---

<a id="中文"></a>

## 中文

### 功能特性

- **一键提取字幕** — 在侧边栏图标或命令面板中输入 BV 号或 B 站视频链接即可
- **自动读取 Chrome 登录态** — 启动时自动从 Chrome 浏览器读取 B 站 `SESSDATA`，无需手动复制 Cookie
- **多语言 AI 字幕支持** — 自动检测所有可用的 AI 字幕轨道（中文、English、日本語、Español、العربية、Português 等）
- **语言选择弹窗** — 多语言字幕时弹出选择框，可选择任意一种语言
- **双语字幕模式** — 生成双语对照笔记（如 中文 / English 并排显示）
- **YAML frontmatter** — 笔记顶部包含结构化元数据，格式参考 Obsidian Web Clipper：`title`、`source`、`author`、`published`、`created`、`description`、`tags`
- **B 站专属元数据** — 额外字段：`bilibili_bvid`、`bilibili_cid`、`bilibili_duration`、`bilibili_view`、`bilibili_danmaku`、`subtitle_lang`
- **时间戳可选** — 在插件设置中控制字幕是否带 `[00:00]` 时间戳
- **安全的 Cookie 处理** — 通过 macOS Keychain + AES-128-CBC 解密 Chrome Cookie，凭证不会离开本机
- **自动命名笔记** — 输出文件名为视频标题，自动清理非法字符

### 生成笔记示例

```markdown
---
title: "20分钟学会苹果风格动态设计"
source: "https://www.bilibili.com/video/BVxxxxxx"
author:
  - "创作者名称"
published: 2026-06-03
created: 2026-06-11
description: "视频简介..."
tags:
  - "bilibili"
  - "clippings"
bilibili_bvid: BVxxxxxx
bilibili_cid: 123456
bilibili_duration: 1200
bilibili_view: 50000
bilibili_danmaku: 300
subtitle_lang: "中文"
---

[00:00] 第一条字幕
[00:03] 第二条字幕
[00:07] 第三条字幕
...
```

### 安装方式

#### 从 Release 安装（推荐）

1. 从 [Releases](../../releases) 下载 `main.js`、`manifest.json`、`styles.css`（或下载 `.zip` 压缩包）
2. 在 Obsidian 仓库中创建目录：`.obsidian/plugins/bilibili2obsidian/`
3. 将三个文件放入该目录
4. 重启 Obsidian → 设置 → Community plugins → 启用 **Bilibili to Obsidian**

#### 从源码构建

```bash
git clone https://github.com/Mu-scorpio/bilibili2obsidian.git
cd bilibili2obsidian
npm install
npm run build
```

构建产物 `main.js` 即为插件入口文件。

### 配置项

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| 自动读取 Chrome Cookie | 启动时自动从 Chrome 读取 B 站 SESSDATA | 开启 |
| SESSDATA（手动覆盖） | 自动读取失败时可手动粘贴 | 空 |
| 默认字幕语言 | 单语言时自动使用的语言代码 | `ai-zh` |
| 字幕包含时间戳 | 字幕每行是否带 `[00:00]` 时间戳 | 开启 |

### 技术原理

```
输入: BV 号或视频链接
        │
        ▼
┌─────────────────────────────────────────────┐
│  GET /x/web-interface/view?bvid=xxx         │
│  → 获取视频元信息（标题、aid、cid）          │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  GET /x/player/wbi/v2?aid=xxx&cid=xxx      │
│  → 获取字幕轨道列表（多语言 AI 字幕）       │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  GET aisubtitle.hdslb.com/bfs/ai_subtitle/…│
│  → 获取字幕 JSON（带时间戳的文本）          │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  生成 Markdown 笔记（YAML frontmatter       │
│  + 完整字幕转录）                            │
└─────────────────────────────────────────────┘
```

### Chrome Cookie 解密原理（macOS）

B 站 AI 字幕接口需要登录态。本插件从 Chrome 的 SQLite 数据库中读取加密的 `SESSDATA` Cookie 并解密：

1. 定位 Chrome Cookie 数据库：`~/Library/Application Support/Google/Chrome/Default/Cookies`
2. 从 macOS Keychain 获取加密密钥：`security find-generic-password -w -a "Chrome" -s "Chrome Safe Storage"`
3. 通过 PBKDF2 派生 AES-128-CBC 密钥（1003 次迭代，盐值 `saltysalt`）
4. 解密 `v10` 前缀的 Cookie 值（16 字节 IV + 密文）

所有操作均在本地完成，凭证不会离开你的电脑。

### 相关项目

- [Bilibili-Obsidian-Clipper](https://github.com/haixiong1997/Bilibili-Obsidian-Clipper) — 功能类似的 Chrome 浏览器扩展；本插件的字幕获取逻辑参考了该项目

### 已知限制

- 需要 B 站登录态才能获取 AI 字幕（未登录时字幕列表为空）
- Cookie 自动读取仅支持 macOS 上的 Google Chrome；其他平台/浏览器需手动填写 SESSDATA
- 字幕 URL 带有时效性 `auth_key` 参数，获取后需立即请求
- 依赖 B 站公开 API，可能随接口变化需要维护

### 开发

```bash
npm install        # 安装依赖
npm run build      # 一次性构建
npm run dev        # 监听模式
```

### License

MIT
