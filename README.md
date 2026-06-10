# Bilibili to Obsidian

一个 Obsidian 插件，从 B 站视频中提取字幕并生成结构化笔记。支持多语言 AI 字幕选择和双语对照生成。

## 功能

- 侧边栏图标一键输入 BV 号或视频链接
- 自动从 Chrome 浏览器读取 B 站登录态（SESSDATA），无需手动配置
- 支持 B 站 AI 生成的多语言字幕（中文、English、日本語 等）
- 多语言字幕弹出选择框，支持单语或双语模式
- 生成 YAML frontmatter + 完整字幕的 Markdown 笔记
- 时间戳可选（在设置中控制）

## 生成笔记格式

```markdown
---
title: "视频标题"
source: "https://www.bilibili.com/video/BVxxxxxx"
author:
  - "UP主名称"
published: 2026-06-03
created: 2026-06-11
description: "视频简介"
tags:
  - "bilibili"
  - "clippings"
bilibili_bvid: BVxxxxxx
bilibili_cid: 123456
bilibili_duration: 436
bilibili_view: 1189998
bilibili_danmaku: 6026
subtitle_lang: "中文"
---

[00:00] 第一条字幕
[00:03] 第二条字幕
...
```

frontmatter 格式参考 Obsidian 官方 YouTube 插件，扩展了 B 站特有字段。

## 安装

### 从 Release 安装（推荐）

1. 从 [Releases](../../releases) 下载 `main.js`、`manifest.json`、`styles.css`
2. 在你的 Obsidian vault 中创建目录：`.obsidian/plugins/bilibili2obsidian/`
3. 将三个文件放入该目录
4. 重启 Obsidian → 设置 → Community plugins → 启用 **Bilibili to Obsidian**

### 从源码构建

```bash
git clone https://github.com/YOUR_USERNAME/bilibili2obsidian.git
cd bilibili2obsidian
npm install
npm run build
```

构建产物 `main.js` 即为插件入口。

## 配置

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| 自动读取 Chrome Cookie | 启动时自动从 Chrome 读取 B 站 SESSDATA | 开启 |
| SESSDATA（手动覆盖） | 自动读取失败时可手动粘贴 | 空 |
| 默认字幕语言 | 单语言时自动使用的语言代码 | `ai-zh` |
| 字幕包含时间戳 | 字幕每行是否带 `[00:00]` 时间戳 | 开启 |

### Cookie 说明

B 站的 AI 字幕接口需要登录态。本插件会自动从 Chrome 浏览器的 Cookie 数据库中读取 B 站的 `SESSDATA`，解密后用于 API 请求。

**自动读取原理（macOS）：**

1. 定位 Chrome Cookie 数据库：`~/Library/Application Support/Google/Chrome/Default/Cookies`
2. 从 macOS Keychain 获取 Chrome 的加密密钥：`security find-generic-password -w -a "Chrome" -s "Chrome Safe Storage"`
3. 用 PBKDF2 派生 AES-128-CBC 解密密钥
4. 从 SQLite 数据库读取加密的 SESSDATA 并解密

如果自动读取失败（非 Chrome 浏览器、多 Profile 等情况），可以在设置中手动填写 SESSDATA。

**手动获取 SESSDATA：**

1. 浏览器登录 bilibili.com
2. F12 → Application → Cookies → `https://www.bilibili.com`
3. 找到 `SESSDATA`，复制其值

## 技术原理

### 字幕获取流程

```
输入 BV 号
    ↓
GET /x/web-interface/view?bvid=xxx → 获取 aid, cid, 视频元信息
    ↓
GET /x/player/wbi/v2?aid=xxx&cid=xxx → 获取字幕轨道列表（多语言）
    ↓
GET 字幕 URL（aisubtitle.hdslb.com/...）→ 获取字幕 JSON
    ↓
生成 Markdown 笔记
```

### 关键接口

| 接口 | 用途 |
|------|------|
| `api.bilibili.com/x/web-interface/view` | 获取视频基本信息（标题、UP主、播放量等） |
| `api.bilibili.com/x/player/wbi/v2` | 获取字幕轨道列表（含多语言 AI 字幕） |
| `aisubtitle.hdslb.com/bfs/ai_subtitle/...` | 获取具体字幕内容 |

`player/wbi/v2` 接口返回的字幕列表包含 `lan`（语言代码）、`lan_doc`（语言名称）和 `subtitle_url`（字幕 JSON 地址）。字幕 URL 带有时效性的 `auth_key` 参数，需要在获取后尽快请求。

### 与 Bilibili-Obsidian-Clipper 的关系

本插件的字幕获取方案参考了 [haixiong1997/Bilibili-Obsidian-Clipper](https://github.com/haixiong1997/Bilibili-Obsidian-Clipper) 的实现。该项目是一个浏览器扩展，通过 Content Script 注入页面获取字幕。本插件将其核心逻辑移植到了 Obsidian 插件环境中，通过 Node.js 的 `https` 模块直接调用 B 站 API。

### 项目结构

```
bilibili2obsidian/
├── src/
│   ├── main.ts           # 插件主入口、UI、笔记生成
│   └── cookie-reader.ts  # Chrome Cookie 自动读取与解密
├── main.js               # esbuild 打包产物（插件实际加载的文件）
├── manifest.json         # Obsidian 插件清单
├── styles.css            # 样式（当前为空）
├── tsconfig.json         # TypeScript 配置
├── package.json          # 构建依赖
└── README.md
```

## 已知限制

- 需要 B 站登录态才能获取 AI 字幕（未登录时字幕列表为空）
- Cookie 自动读取仅支持 macOS 上的 Chrome 浏览器（其他平台需手动填写 SESSDATA）
- 字幕 URL 带有时效性 `auth_key`，获取后需立即请求
- 当前依赖 B 站公开 API，可能随接口变化需要维护

## 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 开发模式（监听文件变化）
npm run dev
```

## License

MIT
