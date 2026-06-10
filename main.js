var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => BilibiliToObsidianPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// src/cookie-reader.ts
var import_child_process = require("child_process");
var import_fs = require("fs");
var import_os = require("os");
var import_path = require("path");
var import_crypto = require("crypto");
function getChromeCookieDbPath() {
  const home = (0, import_os.homedir)();
  const candidates = [
    (0, import_path.join)(home, "Library/Application Support/Google/Chrome/Default/Cookies"),
    (0, import_path.join)(home, "Library/Application Support/Google/Chrome/Profile 1/Cookies"),
    (0, import_path.join)(home, ".config/google-chrome/Default/Cookies"),
    (0, import_path.join)(home, ".config/chromium/Default/Cookies")
  ];
  for (const p of candidates) {
    if ((0, import_fs.existsSync)(p)) return p;
  }
  return null;
}
function getChromeKey() {
  try {
    const password = (0, import_child_process.execFileSync)("/usr/bin/security", [
      "-q",
      "find-generic-password",
      "-w",
      "-a",
      "Chrome",
      "-s",
      "Chrome Safe Storage"
    ], { encoding: "utf-8", timeout: 5e3 }).trim();
    return (0, import_crypto.pbkdf2Sync)(password, "saltysalt", 1003, 16, "sha1");
  } catch (e) {
  }
  return (0, import_crypto.pbkdf2Sync)("peanuts", "saltysalt", 1003, 16, "sha1");
}
function decryptV10(encrypted, key) {
  if (!encrypted || encrypted.length < 19) return "";
  const prefix = encrypted.slice(0, 3).toString("ascii");
  if (prefix !== "v10" && prefix !== "v11") {
    return encrypted.toString("utf-8");
  }
  const iv = encrypted.slice(3, 19);
  const ciphertext = encrypted.slice(19);
  try {
    const decipher = (0, import_crypto.createDecipheriv)("aes-128-cbc", key, iv);
    decipher.setAutoPadding(true);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const str = decrypted.toString("utf-8");
    const match = str.match(/[0-9a-f]{8}%2C\d+%2C[0-9a-f]+%2A[A-Za-z0-9_\-]+/);
    if (match) return match[0] + str.slice(match.index + match[0].length);
    return str;
  } catch (e) {
    return "";
  }
}
function readBilibiliSessdata() {
  const dbPath = getChromeCookieDbPath();
  if (!dbPath) return null;
  const key = getChromeKey();
  try {
    const hex = (0, import_child_process.execFileSync)("sqlite3", [
      dbPath,
      "SELECT hex(encrypted_value) FROM cookies WHERE (host_key LIKE '%.bilibili.com' OR host_key LIKE '%.bilibili.cn') AND name='SESSDATA' LIMIT 1"
    ], { encoding: "utf-8", timeout: 5e3 }).trim();
    if (!hex) return null;
    const encrypted = Buffer.from(hex, "hex");
    return decryptV10(encrypted, key) || null;
  } catch (e) {
    return null;
  }
}

// src/main.ts
var import_https = __toESM(require("https"));
var DEFAULT_SETTINGS = {
  sessdata: "",
  defaultLang: "ai-zh",
  autoReadCookie: true,
  includeTimestamp: true
};
function normalizeBilibiliInput(input) {
  const text = (input || "").trim();
  if (!text) return null;
  const bvMatch = text.match(/BV[a-zA-Z0-9]+/i);
  if (bvMatch) return { type: "bv", value: bvMatch[0] };
  try {
    const url = new URL(text);
    if (url.hostname.includes("bilibili.com")) {
      const m = url.pathname.match(/BV[a-zA-Z0-9]+/i);
      if (m) return { type: "bv", value: m[0] };
    }
  } catch (e) {
  }
  return null;
}
function normalizeSubtitleUrl(url) {
  if (!url) return "";
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return "https://" + url.replace(/^\/\/+/, "");
}
function subtitlePriority(item) {
  const lan = (item.lan || "").toLowerCase();
  const label = (item.lanDoc || "").toLowerCase();
  if (lan === "ai-zh" || lan === "zh-cn" || lan === "zh-hans") return 0;
  if (lan === "zh") return 1;
  if (lan.includes("zh")) return 2;
  if (label.includes("\u4E2D\u6587")) return 3;
  if (lan === "en" || lan === "ai-en") return 10;
  if (lan.includes("en")) return 11;
  if (label.includes("\u82F1\u6587") || label.includes("english")) return 12;
  return 50;
}
function secondsToTimestamp(totalSeconds, withHours) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor(s % 3600 / 60);
  const sec = s % 60;
  if (withHours || h > 0) {
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
  }
  return String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
}
function formatPubdate(ts) {
  if (!ts) return "";
  const d = new Date(ts * 1e3);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function today() {
  const d = /* @__PURE__ */ new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function escapeYaml(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function httpGet(url, sessdata) {
  return new Promise((resolve, reject) => {
    import_https.default.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.bilibili.com",
        ...sessdata ? { "Cookie": "SESSDATA=" + sessdata } : {}
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(httpGet(res.headers.location, sessdata));
      }
      let data = "";
      res.setEncoding("utf-8");
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}
async function fetchVideoMeta(bvid, sessdata) {
  var _a, _b, _c;
  const raw = await httpGet("https://api.bilibili.com/x/web-interface/view?bvid=" + encodeURIComponent(bvid), sessdata);
  const data = JSON.parse(raw);
  if (data.code !== 0) throw new Error(data.message || "\u83B7\u53D6\u89C6\u9891\u4FE1\u606F\u5931\u8D25");
  const d = data.data;
  return {
    bvid: d.bvid,
    aid: d.aid,
    cid: d.cid,
    title: d.title,
    owner: ((_a = d.owner) == null ? void 0 : _a.name) || "",
    view: (_b = d.stat) == null ? void 0 : _b.view,
    danmaku: (_c = d.stat) == null ? void 0 : _c.danmaku,
    duration: d.duration || 0,
    description: d.desc || "",
    pic: d.pic || "",
    pubdate: d.pubdate || 0
  };
}
async function fetchSubtitleTracks(meta, sessdata) {
  var _a, _b;
  const requests = [
    "https://api.bilibili.com/x/player/wbi/v2?aid=" + meta.aid + "&cid=" + meta.cid + "&bvid=" + meta.bvid,
    "https://api.bilibili.com/x/player/v2?bvid=" + meta.bvid + "&cid=" + meta.cid
  ];
  for (const url of requests) {
    try {
      const raw = await httpGet(url, sessdata);
      const data = JSON.parse(raw);
      if (data.code !== 0) continue;
      const raw_subs = ((_b = (_a = data.data) == null ? void 0 : _a.subtitle) == null ? void 0 : _b.subtitles) || [];
      const tracks = raw_subs.map((item) => {
        var _a2;
        return {
          id: String((_a2 = item.id) != null ? _a2 : ""),
          lan: item.lan || "",
          lanDoc: item.lan_doc || "",
          subtitleUrl: normalizeSubtitleUrl(item.subtitle_url || "")
        };
      });
      if (tracks.length > 0) return tracks.sort((a, b) => subtitlePriority(a) - subtitlePriority(b));
    } catch (e) {
    }
  }
  return [];
}
async function fetchSubtitleBody(url, sessdata) {
  const raw = await httpGet(url, sessdata);
  const json = JSON.parse(raw);
  return (json.body || []).map((item) => ({
    from: item.from,
    to: item.to,
    content: (item.content || "").trim()
  }));
}
function buildFrontmatter(meta, subtitleLabel) {
  var _a, _b;
  const lines = [];
  lines.push("---");
  lines.push('title: "' + escapeYaml(meta.title) + '"');
  lines.push('source: "https://www.bilibili.com/video/' + meta.bvid + '"');
  lines.push("author:");
  lines.push('  - "' + escapeYaml(meta.owner) + '"');
  if (meta.pubdate) lines.push("published: " + formatPubdate(meta.pubdate));
  lines.push("created: " + today());
  if (meta.description) {
    const desc = meta.description.replace(/\n/g, " ").substring(0, 200);
    lines.push('description: "' + escapeYaml(desc) + '"');
  }
  lines.push("tags:");
  lines.push('  - "bilibili"');
  lines.push('  - "clippings"');
  lines.push("bilibili_bvid: " + meta.bvid);
  lines.push("bilibili_cid: " + meta.cid);
  lines.push("bilibili_duration: " + meta.duration);
  lines.push("bilibili_view: " + ((_a = meta.view) != null ? _a : 0));
  lines.push("bilibili_danmaku: " + ((_b = meta.danmaku) != null ? _b : 0));
  lines.push('subtitle_lang: "' + escapeYaml(subtitleLabel) + '"');
  lines.push("---");
  return lines.join("\n");
}
function buildSubtitleBlock(items, withHours, includeTimestamp, secondaryMap) {
  const lines = [];
  for (const item of items) {
    let line = "";
    if (includeTimestamp) {
      line += "[" + secondsToTimestamp(item.from, withHours) + "] ";
    }
    line += item.content;
    if (secondaryMap) {
      const key = Math.round(item.from * 10);
      const sec = secondaryMap.get(key);
      if (sec) line += " / " + sec;
    }
    lines.push(line);
  }
  return lines.join("\n");
}
function buildSecondaryMap(items) {
  const map = /* @__PURE__ */ new Map();
  for (const item of items) {
    map.set(Math.round(item.from * 10), item.content);
  }
  return map;
}
function buildNote(opts) {
  const { meta, subtitleItems, subtitleLabel, includeTimestamp } = opts;
  const withHours = meta.duration >= 3600;
  const parts = [];
  parts.push(buildFrontmatter(meta, subtitleLabel));
  parts.push("");
  parts.push(subtitleItems.length > 0 ? buildSubtitleBlock(subtitleItems, withHours, includeTimestamp) : "\u672A\u6293\u53D6\u5230\u5B57\u5E55\u3002");
  parts.push("");
  return parts.join("\n");
}
function buildDualNote(opts) {
  const { meta, primaryItems, secondaryItems, primaryLabel, secondaryLabel, includeTimestamp } = opts;
  const withHours = meta.duration >= 3600;
  const secMap = buildSecondaryMap(secondaryItems);
  const parts = [];
  parts.push(buildFrontmatter(meta, primaryLabel + " / " + secondaryLabel));
  parts.push("");
  parts.push(buildSubtitleBlock(primaryItems, withHours, includeTimestamp, secMap));
  parts.push("");
  return parts.join("\n");
}
var BilibiliInputModal = class extends import_obsidian.Modal {
  constructor(app, onSubmit) {
    super(app);
    this.value = "";
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "\u8F93\u5165 B \u7AD9\u89C6\u9891\u4FE1\u606F" });
    new import_obsidian.Setting(contentEl).setName("BV\u53F7\u6216\u94FE\u63A5").addText((text) => {
      text.setPlaceholder("BV1efV26xEhf \u6216\u5B8C\u6574\u94FE\u63A5");
      text.inputEl.style.width = "100%";
      text.onChange((v) => {
        this.value = v;
      });
    });
    new import_obsidian.Setting(contentEl).addButton((btn) => {
      btn.setButtonText("\u6293\u53D6\u5B57\u5E55").setCta().onClick(() => {
        this.close();
        this.onSubmit(this.value);
      });
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var SubtitleSelectModal = class extends import_obsidian.Modal {
  constructor(app, tracks, onSubmit) {
    super(app);
    this.selectedPrimary = 0;
    this.selectedSecondary = 1;
    this.tracks = tracks;
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "\u9009\u62E9\u5B57\u5E55\u8BED\u8A00" });
    contentEl.createEl("p", { text: "\u68C0\u6D4B\u5230 " + this.tracks.length + " \u79CD\u8BED\u8A00\u5B57\u5E55\uFF0C\u8BF7\u9009\u62E9\uFF1A" });
    new import_obsidian.Setting(contentEl).setName("\u5B57\u5E55\u8BED\u8A00").addDropdown((dd) => {
      this.tracks.forEach((t, i) => {
        dd.addOption(String(i), t.lanDoc + " (" + t.lan + ")");
      });
      dd.setValue("0");
      dd.onChange((v) => {
        this.selectedPrimary = parseInt(v);
      });
    });
    let secondarySetting = null;
    new import_obsidian.Setting(contentEl).setName("\u751F\u6210\u53CC\u8BED\u5B57\u5E55").setDesc("\u540C\u65F6\u9009\u62E9\u7B2C\u4E8C\u8BED\u8A00\uFF0C\u751F\u6210\u53CC\u8BED\u5BF9\u7167\u7B14\u8BB0").addToggle((toggle) => {
      toggle.setValue(false).onChange((v) => {
        if (secondarySetting) secondarySetting.settingEl.style.display = v ? "" : "none";
      });
    });
    secondarySetting = new import_obsidian.Setting(contentEl).setName("\u7B2C\u4E8C\u8BED\u8A00").addDropdown((dd) => {
      this.tracks.forEach((t, i) => {
        dd.addOption(String(i), t.lanDoc + " (" + t.lan + ")");
      });
      dd.setValue(this.tracks.length > 1 ? "1" : "0");
      dd.onChange((v) => {
        this.selectedSecondary = parseInt(v);
      });
    });
    secondarySetting.settingEl.style.display = "none";
    new import_obsidian.Setting(contentEl).addButton((btn) => {
      btn.setButtonText("\u751F\u6210\u7B14\u8BB0").setCta().onClick(() => {
        this.close();
        const primary = this.tracks[this.selectedPrimary];
        const toggles = contentEl.querySelectorAll('input[type="checkbox"]');
        let dualEnabled = false;
        toggles.forEach((t) => {
          if (t.checked) dualEnabled = true;
        });
        if (dualEnabled && this.tracks.length > 1) {
          this.onSubmit("dual", primary, this.tracks[this.selectedSecondary]);
        } else {
          this.onSubmit("single", primary);
        }
      });
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var BilibiliSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Bilibili to Obsidian \u8BBE\u7F6E" });
    new import_obsidian.Setting(containerEl).setName("\u81EA\u52A8\u8BFB\u53D6 Chrome Cookie").setDesc("\u542F\u52A8\u65F6\u81EA\u52A8\u4ECE Chrome \u6D4F\u89C8\u5668\u8BFB\u53D6 B \u7AD9\u767B\u5F55\u6001").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.autoReadCookie).onChange(async (v) => {
        this.plugin.settings.autoReadCookie = v;
        await this.plugin.saveSettings();
        if (v) {
          await this.plugin.autoReadSessdata();
          this.display();
        }
      });
    });
    new import_obsidian.Setting(containerEl).setName("SESSDATA\uFF08\u624B\u52A8\u8986\u76D6\uFF09").setDesc("\u5982\u81EA\u52A8\u8BFB\u53D6\u5931\u8D25\uFF0C\u53EF\u624B\u52A8\u7C98\u8D34 B \u7AD9 Cookie \u4E2D\u7684 SESSDATA \u503C").addText((text) => {
      text.setPlaceholder("\u7559\u7A7A\u5219\u4F7F\u7528\u81EA\u52A8\u8BFB\u53D6");
      text.inputEl.style.width = "100%";
      text.setValue(this.plugin.settings.sessdata);
      text.onChange(async (v) => {
        this.plugin.settings.sessdata = v.trim();
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("\u9ED8\u8BA4\u5B57\u5E55\u8BED\u8A00").setDesc("\u5355\u8BED\u8A00\u65F6\u81EA\u52A8\u4F7F\u7528\u7684\u8BED\u8A00\u4EE3\u7801\u3002\u591A\u8BED\u8A00\u65F6\u4F1A\u5F39\u51FA\u9009\u62E9\u6846\u3002").addText((text) => {
      text.setPlaceholder("ai-zh");
      text.setValue(this.plugin.settings.defaultLang);
      text.onChange(async (v) => {
        this.plugin.settings.defaultLang = v.trim() || "ai-zh";
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("\u5B57\u5E55\u5305\u542B\u65F6\u95F4\u6233").setDesc("\u751F\u6210\u7684\u5B57\u5E55\u6587\u672C\u662F\u5426\u5728\u6BCF\u884C\u524D\u9762\u52A0\u4E0A\u65F6\u95F4\u6233").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.includeTimestamp).onChange(async (v) => {
        this.plugin.settings.includeTimestamp = v;
        await this.plugin.saveSettings();
      });
    });
  }
};
var BilibiliToObsidianPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
  async onload() {
    await this.loadSettings();
    await this.autoReadSessdata();
    this.addRibbonIcon("youtube", "Bilibili \u8F6C\u7B14\u8BB0", () => {
      new BilibiliInputModal(this.app, (value) => {
        this.startFetch(value);
      }).open();
    });
    this.addCommand({
      id: "open-bilibili-note-input",
      name: "\u4ECEB\u7AD9\u89C6\u9891\u751F\u6210\u7B14\u8BB0",
      callback: () => {
        new BilibiliInputModal(this.app, (value) => {
          this.startFetch(value);
        }).open();
      }
    });
    this.addSettingTab(new BilibiliSettingTab(this.app, this));
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  getSessdata() {
    return this.settings.sessdata || "";
  }
  async autoReadSessdata() {
    if (!this.settings.autoReadCookie) return;
    if (this.settings.sessdata) return;
    try {
      const sessdata = readBilibiliSessdata();
      if (sessdata) {
        this.settings.sessdata = sessdata;
        await this.saveSettings();
        console.log("[Bilibili] Auto-read SESSDATA from Chrome (" + sessdata.length + " chars)");
      }
    } catch (e) {
      console.warn("[Bilibili] Failed to auto-read cookie:", e);
    }
  }
  async startFetch(input) {
    try {
      const parsed = normalizeBilibiliInput(input);
      if (!parsed) {
        new import_obsidian.Notice("\u8BF7\u8F93\u5165\u6709\u6548 BV \u53F7\u6216 B \u7AD9\u89C6\u9891\u94FE\u63A5");
        return;
      }
      if (!this.getSessdata()) {
        new import_obsidian.Notice("\u672A\u83B7\u53D6\u5230 B \u7AD9\u767B\u5F55\u6001\uFF0C\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u5F00\u542F\u81EA\u52A8\u8BFB\u53D6\u6216\u624B\u52A8\u586B\u5199 SESSDATA");
        return;
      }
      new import_obsidian.Notice("\u6B63\u5728\u83B7\u53D6\u89C6\u9891\u4FE1\u606F...");
      const meta = await fetchVideoMeta(parsed.value, this.getSessdata());
      new import_obsidian.Notice("\u6B63\u5728\u83B7\u53D6\u5B57\u5E55\u5217\u8868...");
      const tracks = await fetchSubtitleTracks(meta, this.getSessdata());
      if (tracks.length === 0) {
        new import_obsidian.Notice("\u8BE5\u89C6\u9891\u65E0\u53EF\u7528\u5B57\u5E55");
        return;
      }
      if (tracks.length === 1) {
        new import_obsidian.Notice("\u6B63\u5728\u83B7\u53D6\u5B57\u5E55\u5185\u5BB9 (" + tracks[0].lanDoc + ")...");
        const items = await fetchSubtitleBody(tracks[0].subtitleUrl, this.getSessdata());
        const note = buildNote({
          meta,
          subtitleItems: items,
          subtitleLabel: tracks[0].lanDoc,
          includeTimestamp: this.settings.includeTimestamp
        });
        await this.writeNote(meta.title, note);
      } else {
        new import_obsidian.Notice("\u68C0\u6D4B\u5230 " + tracks.length + " \u79CD\u8BED\u8A00\u5B57\u5E55");
        new SubtitleSelectModal(this.app, tracks, async (mode, primary, secondary) => {
          try {
            if (mode === "dual" && secondary) {
              new import_obsidian.Notice("\u6B63\u5728\u83B7\u53D6\u53CC\u8BED\u5B57\u5E55...");
              const [primaryItems, secondaryItems] = await Promise.all([
                fetchSubtitleBody(primary.subtitleUrl, this.getSessdata()),
                fetchSubtitleBody(secondary.subtitleUrl, this.getSessdata())
              ]);
              const note = buildDualNote({
                meta,
                primaryItems,
                secondaryItems,
                primaryLabel: primary.lanDoc,
                secondaryLabel: secondary.lanDoc,
                includeTimestamp: this.settings.includeTimestamp
              });
              await this.writeNote(meta.title, note);
            } else {
              new import_obsidian.Notice("\u6B63\u5728\u83B7\u53D6\u5B57\u5E55\u5185\u5BB9 (" + primary.lanDoc + ")...");
              const items = await fetchSubtitleBody(primary.subtitleUrl, this.getSessdata());
              const note = buildNote({
                meta,
                subtitleItems: items,
                subtitleLabel: primary.lanDoc,
                includeTimestamp: this.settings.includeTimestamp
              });
              await this.writeNote(meta.title, note);
            }
          } catch (e) {
            console.error(e);
            new import_obsidian.Notice("\u751F\u6210\u5931\u8D25: " + e.message);
          }
        }).open();
      }
    } catch (e) {
      console.error(e);
      new import_obsidian.Notice("\u6293\u53D6\u5931\u8D25: " + e.message);
    }
  }
  async writeNote(title, content) {
    const safeTitle = (title || "\u672A\u547D\u540D\u89C6\u9891").replace(/[\\/:*?"<>|]/g, " ").trim() || "\u672A\u547D\u540D\u89C6\u9891";
    const filePath = (0, import_obsidian.normalizePath)(safeTitle + ".md");
    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (!existing) {
      await this.app.vault.create(filePath, content);
    } else {
      await this.app.vault.modify(existing, content);
    }
    new import_obsidian.Notice("\u7B14\u8BB0\u5DF2\u751F\u6210: " + filePath);
  }
};
