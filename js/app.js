"use strict";

/* ================= 工具与存储 ================= */
const $ = (s) => document.querySelector(s);
const STORAGE_KEY = "***";
const MUTE_KEY = "***";
const PROFILE_EMOJIS = ["🐼", "🐰", "🦊", "🐯", "🐸", "🐱", "🐶", "🦄"];

let store = loadStore();
let progress = store.profiles[store.active];

function blankProfile(name, emoji) {
  return { name, emoji, chapters: {}, keys: {}, plays: 0, wrongChars: {} };
}
function loadStore() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) {}
  if (data && data.profiles && data.profiles[data.active]) return data;
  const first = (data && data.chapters && data.keys)
    ? Object.assign(blankProfile("小朋友", "🐼"), data)
    : blankProfile("小朋友", "🐼");
  return { active: "p1", profiles: { p1: first } };
}
function saveProgress() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch (e) {}
}
function updateProfileChip() {
  $("#btn-profile").textContent = progress.emoji + " " + progress.name;
}
function switchProfile(id) {
  if (!store.profiles[id] || id === store.active) return;
  store.active = id;
  progress = store.profiles[id];
  saveProgress();
  goHome();
  toast("已切换到 " + progress.emoji + " " + progress.name);
}
function addProfile(name) {
  const id = "p" + Date.now().toString(36);
  const emoji = PROFILE_EMOJIS[Object.keys(store.profiles).length % PROFILE_EMOJIS.length];
  store.profiles[id] = blankProfile(name, emoji);
  switchProfile(id);
}
function deleteProfile(id) {
  if (Object.keys(store.profiles).length <= 1) { toast("至少保留一个档案哦"); return; }
  if (!confirm("确定删除「" + store.profiles[id].name + "」的全部进度吗？")) return;
  delete store.profiles[id];
  if (store.active === id) store.active = Object.keys(store.profiles)[0];
  progress = store.profiles[store.active];
  saveProgress();
  renderProfiles();
  renderHome();
}
function renderProfiles() {
  const list = $("#profile-list");
  list.innerHTML = "";
  Object.entries(store.profiles).forEach(([id, p]) => {
    const stars = Object.values(p.chapters).reduce((s, c) => s + (c.stars || 0), 0);
    const row = document.createElement("div");
    row.className = "profile-row" + (id === store.active ? " current" : "");
    row.innerHTML = "<span class='pf-emoji'>" + p.emoji + "</span>" +
      "<span class='pf-name'></span>" +
      "<span class='pf-meta'>⭐ " + stars + " · " + (p.plays || 0) + " 轮</span>" +
      "<button class='pf-del' title='删除档案'>🗑️</button>";
    row.querySelector(".pf-name").textContent = p.name;
    row.addEventListener("click", (e) => {
      if (e.target.closest(".pf-del")) { deleteProfile(id); return; }
      switchProfile(id);
      $("#profile-overlay").classList.add("hidden");
    });
    list.appendChild(row);
  });
}
function chapterProgress(id) {
  if (!progress.chapters[id]) {
    progress.chapters[id] = { stars: 0, bestAcc: 0, bestKpm: 0, bestTime: 0, plays: 0 };
  }
  return progress.chapters[id];
}

/* ================= 音效 ================= */
let audioCtx = null;
let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch (e) {}
let freeJump = false;
try { freeJump = localStorage.getItem("jianpan-freejump") === "1"; } catch (e) {}
let encourageOn = true;
try { encourageOn = localStorage.getItem("jianpan-encourage") !== "0"; } catch (e) {}
let randomKeyboardHint = true;
try { randomKeyboardHint = localStorage.getItem("jianpan-random-key-hint") !== "0"; } catch (e) {}

function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}
function tone(freq, dur, type, vol, delay) {
  if (muted) return;
  const c = ensureAudio();
  if (!c) return;
  const t = c.currentTime + (delay || 0);
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type || "triangle";
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol || 0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}
const sndOk = () => tone(700, 0.06, "triangle", 0.1);
const sndBad = () => tone(160, 0.18, "square", 0.06);
const sndWord = () => {
  tone(523, 0.09, "triangle", 0.12);
  tone(659, 0.09, "triangle", 0.12, 0.08);
  tone(784, 0.12, "triangle", 0.12, 0.16);
};
const sndWin = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, "triangle", 0.13, i * 0.13));

/* ================= 虚拟键盘 ================= */
/* 键盘上小字提示用的罗马字母拼读，纯展示场景 */
const PY_SOUND = {
  a: "a", b: "bo", c: "ci", d: "de", e: "e", f: "fo", g: "ge", h: "he",
  i: "yi", j: "ji", k: "ke", l: "le", m: "mo", n: "ne", o: "o", p: "po",
  q: "qi", r: "ri", s: "si", t: "te", u: "wu", v: "yu", w: "wu", x: "xi",
  y: "yi", z: "zi"
};
/* 朗读专用场景：跟上面视觉提示分开。a/o/e 这三个单韵母如果原样把裸字母交给中文语音引擎朗读，
   有些引擎认不出这是中文音节，会退回按英文字母名读（"apple 的 a"那种），跟中文场景混到一起了。
   这里换成读音完全一样的汉字，讲清楚“这是中文”，不会再被误当成英文读 */
const PY_SPEECH_OVERRIDE = { a: "啊", o: "噢", e: "鹅" };
function pySpeechText(letter) {
  return PY_SPEECH_OVERRIDE[letter] || PY_SOUND[letter] || letter;
}
const EN_SOUND = {
  a: "ay", b: "bee", c: "see", d: "dee", e: "ee", f: "ef", g: "gee", h: "aitch",
  i: "eye", j: "jay", k: "kay", l: "el", m: "em", n: "en", o: "oh", p: "pee",
  q: "cue", r: "are", s: "ess", t: "tee", u: "you", v: "vee", w: "double you",
  x: "ex", y: "why", z: "zee"
};
const IPA = {
  cat: "/kæt/", dog: "/dɔːɡ/", pig: "/pɪɡ/", cow: "/kaʊ/", duck: "/dʌk/", bee: "/biː/", bird: "/bɜrd/", fish: "/fɪʃ/",
  one: "/wʌn/", two: "/tuː/", four: "/fɔːr/", five: "/faɪv/", six: "/sɪks/", nine: "/naɪn/", ten: "/ten/", eight: "/eɪt/",
  pear: "/per/", plum: "/plʌm/", apple: "/ˈæpl/", peach: "/piːtʃ/", grape: "/ɡreɪp/", melon: "/ˈmelən/", lemon: "/ˈlemən/", banana: "/bəˈnænə/",
  eye: "/aɪ/", ear: "/ɪr/", arm: "/ɑːrm/", leg: "/leɡ/", hand: "/hænd/", foot: "/fʊt/", nose: "/noʊz/", mouth: "/maʊθ/",
  sun: "/sʌn/", moon: "/muːn/", star: "/stɑːr/", rain: "/reɪn/", snow: "/snoʊ/", wind: "/wɪnd/", tree: "/triː/", cloud: "/klaʊd/"
};

const ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"]
];
const FINGER = {
  q: "p", w: "r", e: "m", r: "i", t: "i", y: "i2", u: "i2", i: "m", o: "r", p: "p",
  a: "p", s: "r", d: "m", f: "i", g: "i", h: "i2", j: "i2", k: "m", l: "r",
  z: "p", x: "r", c: "m", v: "i", b: "i", n: "i2", m: "i2"
};
const FINGER_CLASS = { p: "fp", r: "fr", m: "fm", i: "fi", i2: "fi2" };
const keyEls = {};

function buildKeyboard() {
  const kb = $("#keyboard");
  kb.innerHTML = "";
  ROWS.forEach((row, ri) => {
    const rowEl = document.createElement("div");
    rowEl.className = "kb-row kb-row-" + ri;
    row.forEach((k) => {
      const el = document.createElement("div");
      el.className = "key " + FINGER_CLASS[FINGER[k]];
      el.innerHTML = '<span class="k-letter">' + k.toUpperCase() + '</span><span class="k-sub">' + (PY_SOUND[k] || "") + "</span>";
      rowEl.appendChild(el);
      keyEls[k] = el;
    });
    kb.appendChild(rowEl);
  });
  const spaceRow = document.createElement("div");
  spaceRow.className = "kb-row";
  const sp = document.createElement("div");
  sp.className = "key space";
  sp.textContent = "空格";
  spaceRow.appendChild(sp);
  kb.appendChild(spaceRow);
}
function clearKeyStates() {
  for (const k in keyEls) keyEls[k].classList.remove("next", "hit", "bad");
}
function setKeyboardCase(mode) {
  const showBoth = mode === "both";
  $("#keyboard").classList.toggle("show-both-cases", showBoth);
  for (const k in keyEls) {
    keyEls[k].querySelector(".k-letter").textContent =
      showBoth ? k + " " + k.toUpperCase() : mode === "uppercase" ? k.toUpperCase() : k;
  }
  document.querySelectorAll(".case-btn").forEach((button) =>
    button.classList.toggle("case-active", button.dataset.case === mode)
  );
}
function setNextKey(ch) {
  for (const k in keyEls) keyEls[k].classList.remove("next");
  if (session.isRandomGradePractice && !randomKeyboardHint) return;
  if (ch && keyEls[ch]) keyEls[ch].classList.add("next");
}
function flashKey(ch, ok) {
  const el = keyEls[ch];
  if (!el) return;
  el.classList.remove("hit", "bad");
  void el.offsetWidth;
  el.classList.add(ok ? "hit" : "bad");
  setTimeout(() => el.classList.remove("hit", "bad"), ok ? 180 : 340);
}

/* ================= 会话状态 ================= */
let view = "home";
let activeTrackId = "letters";
let activeLand = null; /* null = 首页乐园入口；"pinyin" / "words" = 已进入对应乐园 */
try {
  const savedNav = JSON.parse(localStorage.getItem("jianpan-nav") || "null");
  if (savedNav && savedNav.land) { activeLand = savedNav.land; activeTrackId = savedNav.track || activeTrackId; }
} catch (e) {}
function saveNav() {
  try { localStorage.setItem("jianpan-nav", JSON.stringify({ land: activeLand, track: activeTrackId })); } catch (e) {}
}
/* 当前关卡/游戏的按键读音语言（"py" 或 "en"），随 startChapterWith / startGame 切换关卡时整体切换一次，
   speakLetter 只在 voiceMode==="auto" 时读它，不再逐次按 track 猜测。声明必须在文件顶部：
   直链启动（#p=xxx）会在脚本执行早期就调用 startChapterWith 写入这个变量。 */
let letterLang = "en";
const session = {};

function cancelAutoNext() {
  clearTimeout(session.autoNextTimer);
  clearInterval(session.autoNextCountdown);
  session.autoNextTimer = null;
  session.autoNextCountdown = null;
  const button = $("#btn-next");
  if (button) button.textContent = "下一关 ➡️";
}

function scheduleAutoNext() {
  let secondsLeft = 3;
  const button = $("#btn-next");
  button.textContent = "下一关（" + secondsLeft + "秒）➡️";
  session.autoNextCountdown = setInterval(() => {
    secondsLeft--;
    if (secondsLeft > 0) button.textContent = "下一关（" + secondsLeft + "秒）➡️";
  }, 1000);
  session.autoNextTimer = setTimeout(() => {
    const trackId = session.track.id;
    const nextIdx = session.idx + 1;
    cancelAutoNext();
    startChapter(trackId, nextIdx);
  }, 3000);
}

function trackById(id) { return TRACKS.find((t) => t.id === id); }
function isChineseTrack(id) { return id === "grade-random" || id === "chinese" || id === "chinese2" || id === "chinese3" || id === "chinese4" || id === "chinese5" || id === "chinese6" || id === "chinese7" || id === "chinese8"; }
/* 语文识字：年级+学期 <-> 具体 track id 的对照表 */
const CHINESE_TRACK_BY_GRADE_SEMESTER = { "1-1": "chinese", "1-2": "chinese2", "2-1": "chinese3", "2-2": "chinese4", "3-1": "chinese5", "3-2": "chinese6", "4-1": "chinese7", "4-2": "chinese8" };
const CHINESE_GRADE_SEMESTER_BY_TRACK = {
  chinese: { grade: "1", semester: "1" }, chinese2: { grade: "1", semester: "2" },
  chinese3: { grade: "2", semester: "1" }, chinese4: { grade: "2", semester: "2" },
  chinese5: { grade: "3", semester: "1" }, chinese6: { grade: "3", semester: "2" },
  chinese7: { grade: "4", semester: "1" }, chinese8: { grade: "4", semester: "2" }
};
function updateCurriculumLabels(grade) {
  const upper = $("#semester-select").querySelector('option[value="1"]');
  const lower = $("#semester-select").querySelector('option[value="2"]');
  upper.textContent = grade + "-1 · 上册";
  const lowerAvailable = !!CHINESE_TRACK_BY_GRADE_SEMESTER[grade + "-2"];
  lower.textContent = grade + "-2 · 下册" + (lowerAvailable ? "" : "（即将开放）");
  lower.disabled = !lowerAvailable;
}
/* 当前关卡的按键读音语言：拼音关 / 语文识字关读拼音，其余读英文字母名 */
function trackLetterLang(trackId) { return trackId === "pinyin" || isChineseTrack(trackId) ? "py" : "en"; }
/* 首页乐园分组：拼音乐园＝拼音打字，语文乐园＝语文识字（各年级学期），单词乐园＝字母+单词 */
function landOfTrack(trackId) {
  if (trackId === "pinyin") return "pinyin";
  if (isChineseTrack(trackId)) return "chinese";
  return "words";
}
const LAND_FIRST_TRACK = { pinyin: "pinyin", chinese: "chinese", words: "letters" };
/* 写字乐园的默认轨道要按站点实际拥有的内容动态选（拼音站只有 chinese，英语站只有 words），
   不能写死，否则拆分成两个站点后其中一个站点点进写字乐园会拿到不存在的 track 而崩溃 */
function firstTrackForLand(landId) {
  if (landId === "writing") return trackById("chinese") ? "chinese" : "words";
  return LAND_FIRST_TRACK[landId];
}
/* 某个乐园在当前站点是否真的有内容（拆分成拼音/英语两个站点后，各自的 data.js 只含一半 track，
   localStorage 的 jianpan-nav 是跨站点共享的，可能残留另一个站点的乐园状态） */
function landIsAvailable(landId) {
  if (landId === "pinyin") return !!trackById("pinyin");
  if (landId === "chinese") return !!trackById("chinese");
  if (landId === "words") return !!trackById("letters") || !!trackById("words");
  if (landId === "writing") return !!trackById("chinese") || !!trackById("words");
  return false;
}
const SINGLE_TRACK_LANDS = ["pinyin", "chinese", "writing"];

function introducedKeys(track, idx) {
  const keys = [];
  for (let i = 0; i <= idx; i++) {
    for (const k of track.chapters[i].newKeys || []) {
      if (!keys.includes(k)) keys.push(k);
    }
  }
  return keys;
}

function keyWeight(k) {
  const s = progress.keys[k];
  if (!s) return 1;
  const total = s.ok + s.bad;
  if (total < 4) return 1;
  return Math.min(4, 1 + Math.round((s.bad / total) * 30) / 10);
}

function genSeq(keys, len) {
  const seq = [];
  for (const k of keys) seq.push(k);
  const pool = [];
  for (const k of keys) {
    const w = Math.max(1, Math.round(keyWeight(k)));
    for (let i = 0; i < w; i++) pool.push(k);
  }
  while (seq.length < len) seq.push(pool[Math.floor(Math.random() * pool.length)]);
  for (let i = seq.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [seq[i], seq[j]] = [seq[j], seq[i]];
  }
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] === seq[i - 1]) {
      let swapped = false;
      for (let j = i + 1; j < seq.length; j++) {
        if (seq[j] !== seq[i - 1]) {
          [seq[i], seq[j]] = [seq[j], seq[i]];
          swapped = true;
          break;
        }
      }
      if (!swapped && keys.length > 1) {
        seq[i] = keys.find((k) => k !== seq[i - 1]) || seq[i];
      }
    }
  }
  return seq.slice(0, Math.max(len, keys.length));
}

function plainPinyin(py) {
  return py
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ü/g, "v")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function curWord() { return session.chapter.words[session.wordIdx]; }
function curTarget() { return plainPinyin(curWord().py); }

function shuffledWords(words) {
  const shuffled = words.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function recordKey(k, ok, expected) {
  const key = ok ? k : (expected || k);
  if (!progress.keys[key]) progress.keys[key] = { ok: 0, bad: 0 };
  if (ok) progress.keys[key].ok++;
  else progress.keys[key].bad++;
}

/* ================= 开始章节 ================= */
function updatePracticeLocation() {
  const itemIdx = session.mode === "letters" ? session.pos : session.wordIdx;
  history.replaceState(null, "", "#p=" + session.track.id + ":" + session.idx + ":" + itemIdx);
}

function startChapter(trackId, idx, itemIdx) {
  startChapterWith(trackById(trackId), idx);
  const requestedItem = parseInt(itemIdx, 10) || 0;
  if (requestedItem > 0) {
    if (session.mode === "letters") {
      session.pos = Math.min(requestedItem, session.seq.length - 1);
      updateTape();
      setNextKey(session.seq[session.pos]);
    } else {
      session.wordIdx = Math.min(requestedItem, session.chapter.words.length - 1);
      renderWordCard();
      setNextKey(curTarget()[0]);
    }
    updateLive();
  }
  updatePracticeLocation();
}

function startChapterWith(track, idx) {
  cancelAutoNext();
  const sourceChapter = track.chapters[idx];
  const chapter = sourceChapter.isReview
    ? Object.assign({}, sourceChapter, { words: shuffledWords(sourceChapter.words) })
    : sourceChapter;
  session.track = track;
  session.chapter = chapter;
  session.idx = idx;
  session.isRandomGradePractice = track.id === "grade-random";
  session.correct = 0;
  session.wrong = 0;
  session.combo = 0;
  session.maxCombo = 0;
  session.keyMiss = {};
  session.startTime = performance.now();
  session.bestTime = chapterProgress(chapter.id).bestTime || 0;
  session.mode = track.id === "letters" ? "letters" : "pinyin";
  letterLang = trackLetterLang(track.id);
  if (session.mode === "letters") {
    session.seq = genSeq(introducedKeys(track, idx), chapter.len || 24);
    session.pos = 0;
    renderTape();
  } else {
    session.wordIdx = 0;
    session.buffer = "";
    renderWordCard();
    if (track.id === "words") speakWord(chapter.words[0]);
  }
  $("#chapter-title").textContent = track.icon + " 第 " + (idx + 1) + " 关 · " + chapter.name;
  $("#chapter-tip").textContent = chapter.tip || "";
  const hintButton = $("#btn-key-hint");
  if (hintButton) {
    hintButton.classList.toggle("hidden", !session.isRandomGradePractice);
    hintButton.classList.toggle("hint-off", !randomKeyboardHint);
    hintButton.textContent = randomKeyboardHint ? "💡 键盘提示：开" : "💡 键盘提示：关";
  }
  $("#overlay").classList.add("hidden");
  $("#keyboard").classList.toggle("pinyin-kb", track.id === "pinyin" || isChineseTrack(track.id));
  showView("practice");
  clearKeyStates();
  updateLive();
  setupGhostBar();
  setNextKey(session.mode === "letters" ? session.seq[0] : curTarget()[0]);
  ensureAudio();
}

/* ================= 渲染 ================= */
function renderTape() {
  const tape = $("#tape");
  tape.innerHTML = "";
  session.tapeEls = [];
  session.groupEls = [];
  for (let g = 0; g < session.seq.length; g += 3) {
    const group = document.createElement("span");
    group.className = "tgroup";
    for (let i = g; i < Math.min(g + 3, session.seq.length); i++) {
      const s = document.createElement("span");
      s.className = "tch";
      s.textContent = session.seq[i];
      group.appendChild(s);
      session.tapeEls.push(s);
    }
    tape.appendChild(group);
    session.groupEls.push(group);
  }
  tape.classList.remove("hidden");
  $("#word-card").classList.add("hidden");
  updateTape();
}

function updateTape() {
  session.tapeEls.forEach((el, i) => {
    el.className = "tch " + (i < session.pos ? "ok" : i === session.pos ? "cur" : "");
  });
  const gi = Math.floor(session.pos / 3);
  session.groupEls.forEach((g, i) => g.classList.toggle("cur", i === gi));
}

function renderWordCard() {
  $("#tape").classList.add("hidden");
  $("#word-card").classList.remove("hidden");
  const w = curWord();
  const isWords = session.track.id === "words";
  $("#wc-emoji").textContent = w.em || "";
  $("#wc-emoji").classList.toggle("big", isWords);
  $("#wc-hanzi").textContent = isWords ? w.py : w.hz;
  $("#wc-hanzi").classList.toggle("en", isWords);
  $("#wc-hanzi").classList.remove("small");
  $("#wc-pinyin-big").textContent = isWords ? (IPA[w.py] || "") : w.py;
  $("#wc-group").textContent = isWords ? w.hz : (w.group ? "组词：" + w.group : "");
  renderSlots();
}

function renderSlots() {
  const target = curTarget();
  const box = $("#wc-slots");
  box.innerHTML = "";
  for (let i = 0; i < target.length; i++) {
    const s = document.createElement("span");
    s.className = "slot" + (i < session.buffer.length ? " filled" : i === session.buffer.length ? " cur" : "");
    s.textContent = i < session.buffer.length ? session.buffer[i] : "";
    box.appendChild(s);
  }
}

function updateLive() {
  $("#stat-combo").textContent = "🔥 连击 x" + session.combo;
  const total = session.correct + session.wrong;
  const acc = total ? Math.round((session.correct / total) * 100) : 100;
  $("#stat-acc").textContent = "🎯 正确率 " + acc + "%";
  let frac = 0;
  if (session.mode === "letters") {
    frac = session.pos / session.seq.length;
  } else if (session.wordIdx >= session.chapter.words.length) {
    frac = 1;
  } else {
    const t = curTarget();
    frac = (session.wordIdx + (t ? session.buffer.length / t.length : 0)) / session.chapter.words.length;
  }
  $("#progress-fill").style.width = (frac * 100).toFixed(1) + "%";
}

function updateGhostFill() {
  if (!session.bestTime) return;
  const elapsed = (performance.now() - session.startTime) / 1000;
  $("#ghost-fill").style.width = (Math.min(1, elapsed / session.bestTime) * 100).toFixed(1) + "%";
}
function setupGhostBar() {
  clearInterval(session.ghostTimer);
  const row = $("#ghost-row");
  if (session.bestTime > 0) {
    $("#ghost-best").textContent = session.bestTime + "s";
    row.classList.remove("hidden");
    updateGhostFill();
    session.ghostTimer = setInterval(updateGhostFill, 400);
  } else {
    row.classList.add("hidden");
  }
}

/* ================= 输入处理 ================= */
function handleKey(k) {
  if (view !== "practice") return;
  if (session.mode === "letters") {
    const expected = session.seq[session.pos];
    if (k === expected) {
      session.pos++;
      updatePracticeLocation();
      session.correct++;
      session.combo++;
      session.maxCombo = Math.max(session.maxCombo, session.combo);
      recordKey(k, true);
      if (voiceMode === "beep") sndOk();
      flashKey(k, true);
      updateTape();
      if (session.pos >= session.seq.length) {
        updateLive();
        return finish();
      }
      setNextKey(session.seq[session.pos]);
    } else {
      session.wrong++;
      session.combo = 0;
      recordKey(k, false, expected);
      session.keyMiss[expected] = (session.keyMiss[expected] || 0) + 1;
      sndBad();
      flashKey(k, false);
      const el = session.tapeEls[session.pos];
      if (el) {
        el.classList.add("err");
        setTimeout(() => el.classList.remove("err"), 300);
      }
    }
    updateLive();
    return;
  }
  const target = curTarget();
  if (target.startsWith(session.buffer + k)) {
    session.buffer += k;
    session.correct++;
    session.combo++;
    session.maxCombo = Math.max(session.maxCombo, session.combo);
    recordKey(k, true);
    flashKey(k, true);
    if (session.buffer === target) {
      const doneWord = curWord();
      session.wordIdx++;
      updatePracticeLocation();
      session.buffer = "";
      sndWord();
      speakCompletedWord(doneWord);
      if (session.wordIdx >= session.chapter.words.length) {
        updateLive();
        return finish();
      }
      renderWordCard();
      if (session.track.id === "words") speakWord(curWord(), true);
      setNextKey(curTarget()[0]);
    } else {
      if (voiceMode === "beep") sndOk();
      renderSlots();
      setNextKey(target[session.buffer.length]);
    }
  } else {
    session.wrong++;
    session.combo = 0;
    const expected = target[session.buffer.length];
    recordKey(k, false, expected);
    session.keyMiss[expected] = (session.keyMiss[expected] || 0) + 1;
    sndBad();
    flashKey(k, false);
    const card = $("#word-card");
    card.classList.remove("shake");
    void card.offsetWidth;
    card.classList.add("shake");
  }
  updateLive();
}

function handleBackspace() {
  if (session.mode !== "pinyin" || session.buffer.length === 0) return;
  session.buffer = session.buffer.slice(0, -1);
  renderSlots();
  setNextKey(curTarget()[session.buffer.length]);
}

/* ================= 结算 ================= */
function finish() {
  view = "result";
  clearKeyStates();
  clearInterval(session.ghostTimer);
  const seconds = Math.max(1, Math.round((performance.now() - session.startTime) / 1000));
  const total = session.correct + session.wrong;
  const acc = total ? session.correct / total : 1;
  const kpm = Math.round(session.correct / (seconds / 60));
  const stars = acc >= 0.97 ? 3 : acc >= 0.9 ? 2 : acc >= 0.75 ? 1 : 0;
  const cp = chapterProgress(session.chapter.id);
  cp.stars = Math.max(cp.stars, stars);
  cp.bestAcc = Math.max(cp.bestAcc, Math.round(acc * 100));
  cp.bestKpm = Math.max(cp.bestKpm, kpm);
  const prevBest = cp.bestTime || 0;
  if (!prevBest || seconds < prevBest) cp.bestTime = seconds;
  cp.plays++;
  progress.plays++;
  touchStreak();
  checkBadges({ kind: "practice", stars, maxCombo: session.maxCombo, kpm });
  saveProgress();

  $("#res-stars").innerHTML = [0, 1, 2]
    .map((i) => '<span class="' + (i < stars ? "on" : "off") + '" style="animation-delay:' + i * 0.15 + 's">★</span>')
    .join("");
  const resTitle =
    stars === 3 ? "太棒了！完美通关！" :
    stars === 2 ? "很不错，继续加油！" :
    stars === 1 ? "过关啦！再练练会更棒！" : "差一点点，再试一次吧！";
  $("#res-title").textContent = resTitle;
  $("#res-stats").innerHTML =
    "<div><b>" + Math.round(acc * 100) + "%</b><span>正确率</span></div>" +
    "<div><b>" + kpm + "</b><span>键/分钟</span></div>" +
    "<div><b>" + seconds + "s</b><span>用时</span></div>" +
    "<div><b>x" + session.maxCombo + "</b><span>最高连击</span></div>";
  const miss = Object.entries(session.keyMiss).sort((a, b) => b[1] - a[1]).slice(0, 4);
  $("#res-miss").innerHTML = miss.length
    ? "需要留意的键：" + miss.map(([k, n]) => "<b>" + k.toUpperCase() + "</b>（错 " + n + " 次）").join("　")
    : "没有明显弱键，太厉害了！";
  const recEl = $("#res-record");
  recEl.textContent = prevBest && seconds < prevBest
    ? "⚡ 新纪录！比上次快了 " + (prevBest - seconds) + " 秒"
    : "";
  recEl.classList.toggle("hidden", !recEl.textContent);
  const next = session.track.chapters[session.idx + 1];
  $("#btn-next").style.display = next ? "" : "none";
  $("#overlay").classList.remove("hidden");
  if (stars === 3 && next) scheduleAutoNext();
  if (stars >= 1) {
    sndWin();
    speakEncouragement(resTitle);
  }
}

/* ================= 首页与其他视图 ================= */
function showView(name) {
  view = name;
  $("#view-home").classList.toggle("hidden", name !== "home");
  $("#view-practice").classList.toggle("hidden", name !== "practice");
  $("#view-guide").classList.toggle("hidden", name !== "guide");
  $("#view-game").classList.toggle("hidden", name !== "game");
  $("#view-writing-modes").classList.toggle("hidden", name !== "writing-modes");
  $("#view-assemble").classList.toggle("hidden", name !== "assemble");
  $("#view-match").classList.toggle("hidden", name !== "match");
  $("#view-write").classList.toggle("hidden", name !== "write");
  $("#view-pinyin-chart").classList.toggle("hidden", name !== "pinyin-chart");
  $("#kb-wrap").classList.toggle("hidden", !(name === "practice" || (name === "game" && !game.hideKb)));
  if (name === "guide") startGuideDemo();
  else stopGuideDemo();
}

function starText(n) {
  return "★".repeat(n) + "☆".repeat(3 - n);
}

function renderHome() {
  if (activeLand !== null && !landIsAvailable(activeLand)) { activeLand = null; saveNav(); }
  if (activeLand === "pinyin") { showPinyinChart(); return; }
  $("#btn-freejump").textContent = freeJump ? "🔓 自由选关：开" : "🔒 自由选关：关";
  updateProfileChip();
  const streakDays = currentStreak();
  const chip = $("#streak-chip");
  if (streakDays > 0) {
    chip.textContent = "🔥 连续 " + streakDays + " 天";
    chip.classList.remove("hidden");
  } else chip.classList.add("hidden");
  const inHub = activeLand === null;
  $("#hub-lands").classList.toggle("hidden", !inHub);
  $("#home-foot").classList.toggle("hidden", !inHub);
  $("#tabs-bar").classList.toggle("hidden", inHub);
  $(".tabs-bar .tabs").classList.toggle("hidden", inHub || SINGLE_TRACK_LANDS.includes(activeLand));
  $("#chapter-grid").classList.toggle("hidden", inHub);
  if (!inHub && !trackById(activeTrackId)) { activeTrackId = firstTrackForLand(activeLand); saveNav(); }
  $("#curriculum-picker").classList.toggle("hidden", inHub || !isChineseTrack(activeTrackId));
  const subjectSwitch = $("#writing-subject-switch");
  if (subjectSwitch) subjectSwitch.classList.toggle("hidden", inHub || activeLand !== "writing");
  document.querySelectorAll(".writing-subject").forEach((button) =>
    button.classList.toggle("active", button.dataset.writingTrack === (activeTrackId === "words" ? "words" : "chinese"))
  );
  if (!inHub && isChineseTrack(activeTrackId)) {
    const gs = CHINESE_GRADE_SEMESTER_BY_TRACK[activeTrackId];
    $("#grade-select").value = gs.grade;
    $("#semester-select").value = gs.semester;
    updateCurriculumLabels(gs.grade);
  }
  if (inHub) return;

  const track = trackById(activeTrackId);
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("hidden", landOfTrack(t.dataset.track) !== activeLand)
  );
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.track === activeTrackId)
  );
  const grid = $("#chapter-grid");
  grid.innerHTML = "";
  track.chapters.forEach((ch, i) => {
    const cp = progress.chapters[ch.id] || { stars: 0, bestAcc: 0, plays: 0 };
    const prev = i === 0 ? null : track.chapters[i - 1];
    const curriculumWord = track.id === "words" && /^W\d{3}$/.test(ch.id);
    const unlocked = freeJump || curriculumWord || i === 0 || ((progress.chapters[prev.id] || {}).stars >= 1);
    const card = document.createElement("button");
    card.className = "chapter" + (unlocked ? "" : " locked");
    let badges;
    if (track.id === "letters") {
      badges = ch.newKeys.length
        ? ch.newKeys.map((k) => "<i>" + k.toUpperCase() + "</i>").join("")
        : '<i class="rev">复习</i>';
    } else if (track.id === "words") {
      badges = ch.words.slice(0, 3).map((w) => "<i>" + w.hz + " " + w.py + "</i>").join("") +
        (ch.words.length > 3 ? "<i>…</i>" : "");
    } else {
      badges = ch.words.slice(0, 4).map((w) => "<i>" + w.hz + "</i>").join("") +
        (ch.words.length > 4 ? "<i>…</i>" : "");
    }
    card.innerHTML =
      '<span class="ch-no">' + (i + 1) + "</span>" +
      '<span class="ch-main">' +
        '<span class="ch-name">' + ch.name + "</span>" +
        '<span class="ch-keys">' + badges + "</span>" +
      "</span>" +
      '<span class="ch-foot">' +
        '<span class="ch-stars">' + starText(cp.stars) + "</span>" +
        (cp.plays ? '<span class="ch-best">最佳 ' + cp.bestAcc + "% · " + (cp.bestKpm || 0) + " 键/分</span>" : "") +
      "</span>" +
      (unlocked ? "" : '<span class="lock">🔒</span>');
    card.addEventListener("click", () => {
      if (!unlocked) { toast("先通过上一关，就能解锁这一关啦！"); return; }
      if (activeLand === "writing") openWritingModes(track, i);
      else startChapter(track.id, i);
    });
    grid.appendChild(card);
  });
}

/* 拼音乐园：不用打字，列出声母/韵母表，点一下卡片就读出来 */
function showPinyinChart() {
  showView("pinyin-chart");
  const track = trackById("pinyin");
  $("#pinyin-chart").innerHTML = track.chapters.map((ch) => {
    const tiles = ch.words.map((w) => {
      const displayPy = w.py.replace(/v/g, "ü");
      return '<button class="pinyin-tile" data-py="' + w.py + '" data-hz="' + w.hz + '">' +
        '<span class="pt-py">' + displayPy + '</span>' +
        '<span class="pt-emoji">' + (w.em || "") + '</span>' +
        '<span class="pt-hz">' + w.hz + '</span>' +
      '</button>';
    }).join("");
    return '<div class="pinyin-chart-section">' +
      '<h3 class="pinyin-chart-title">' + ch.name + '</h3>' +
      '<div class="pinyin-chart-row">' + tiles + '</div>' +
    '</div>';
  }).join("");
}
$("#pinyin-chart").addEventListener("click", (e) => {
  const tile = e.target.closest(".pinyin-tile");
  if (!tile) return;
  tile.classList.remove("pop");
  void tile.offsetWidth;
  tile.classList.add("pop");
  if (voiceMode === "beep" || muted) { sndOk(); return; }
  /* py 可能是 "zh"/"ang" 这种多字母组合，pySpeechText 只认单个字母，
     所以要拆开逐个念（跟“读一读”按钮的拼读逻辑一致），念完再读一遍例词 */
  Array.from(tile.dataset.py).forEach((letter, i) =>
    say(pySpeechText(letter), "zh-CN", 1.7, 1.05, i > 0)
  );
  say(tile.dataset.hz, "zh-CN", 1.5, 0.95, true);
});
$("#btn-pinyinchart-back").addEventListener("click", goHub);

function enterLand(landId) {
  activeLand = landId;
  if (landOfTrack(activeTrackId) !== landId) activeTrackId = firstTrackForLand(landId);
  saveNav();
  goHome();
}
function goHub() {
  activeLand = null;
  saveNav();
  goHome();
}
function goHome() {
  cancelAutoNext();
  history.replaceState(null, "", location.pathname + location.search);
  $("#overlay").classList.add("hidden");
  $("#stats-overlay").classList.add("hidden");
  $("#badges-overlay").classList.add("hidden");
  $("#profile-overlay").classList.add("hidden");
  $("#game-overlay").classList.add("hidden");
  $("#game-result").classList.add("hidden");
  document.body.classList.remove("in-game");
  clearInterval(session.ghostTimer);
  clearKeyStates();
  showView("home");
  renderHome();
}

function renderStats() {
  const entries = Object.entries(progress.keys).map(([k, v]) => ({
    k,
    total: v.ok + v.bad,
    rate: v.ok / (v.ok + v.bad)
  }));
  const enough = entries.filter((e) => e.total >= 8).sort((a, b) => a.rate - b.rate);
  let html = "<p>累计练习 <b>" + (progress.plays || 0) + "</b> 轮 · 连续打卡 <b>" + currentStreak() + "</b> 天</p>";
  if (enough.length) {
    html += "<p>弱键榜（按键错误率排序）：</p><div class='keybad-list'>" +
      enough.slice(0, 8)
        .map((e) => "<span class='keybad'><b>" + e.k.toUpperCase() + "</b> 错 " +
          Math.round((1 - e.rate) * 100) + "%</span>")
        .join("") +
      "</div>";
  } else {
    html += "<p>数据还不够多，多练几轮就能看到弱键分析啦！</p>";
  }
  if (progress.games) {
    const names = { letters: "字母", pinyin: "拼音", chinese: "语文识字", words: "单词" };
    const rows = Object.keys(names)
      .filter((m) => progress.games[m] && progress.games[m].plays)
      .map((m) => {
        const g = progress.games[m];
        return "🐸 " + names[m] + "模式：" + g.wins + " 胜 / " + g.plays + " 局" +
          (g.bestTime ? " · 最快 " + g.bestTime + "s" : "");
      });
    if (rows.length) html += "<p>" + rows.join("<br>") + "</p>";
  }
  $("#stats-body").innerHTML = html;
}

let toastTimer = null;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 1800);
}

function updateMuteBtns() {
  document.querySelectorAll(".mute-btn").forEach((b) => (b.textContent = muted ? "🔇" : "🔊"));
}
function toggleMute() {
  muted = !muted;
  try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch (e) {}
  updateMuteBtns();
}

/* ================= 事件绑定 ================= */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (view === "writing-modes") { e.preventDefault(); showView("home"); }
  else if (view === "write" || view === "match" || view === "assemble") { e.preventDefault(); showView("writing-modes"); }
});
document.addEventListener("keydown", (e) => {
  if (view !== "practice" && view !== "game") return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "Escape") {
    e.preventDefault();
    goHome();
    return;
  }
  if (e.key === "Backspace") {
    e.preventDefault();
    if (view === "game") gameBackspace();
    else handleBackspace();
    return;
  }
  if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
    e.preventDefault();
    if (view === "game") gameKey(e.key.toLowerCase());
    else handleKey(e.key.toLowerCase());
  }
});

document.querySelectorAll(".land-card[data-land]").forEach((c) =>
  c.addEventListener("click", () => enterLand(c.dataset.land))
);
document.querySelectorAll(".writing-subject").forEach((button) =>
  button.addEventListener("click", () => {
    activeTrackId = button.dataset.writingTrack;
    saveNav();
    renderHome();
  })
);
$("#btn-land-back").addEventListener("click", goHub);

document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    activeTrackId = t.dataset.track;
    saveNav();
    renderHome();
  })
);

function applyChineseGradeSemester() {
  const grade = $("#grade-select").value;
  const semester = $("#semester-select").value;
  const target = CHINESE_TRACK_BY_GRADE_SEMESTER[grade + "-" + semester];
  if (!target || !trackById(target)) {
    const gs = CHINESE_GRADE_SEMESTER_BY_TRACK[activeTrackId];
    if (gs) { $("#grade-select").value = gs.grade; $("#semester-select").value = gs.semester; }
    toast("这部分内容还在准备中，即将开放～");
    return;
  }
  activeTrackId = target;
  saveNav();
  renderHome();
}

function startRandomGradePractice() {
  const grade = $("#grade-select").value;
  const seen = new Set();
  const words = [];
  ["1", "2"].forEach((semester) => {
    const trackId = CHINESE_TRACK_BY_GRADE_SEMESTER[grade + "-" + semester];
    const track = trackById(trackId);
    if (!track) return;
    track.chapters.forEach((chapter) => {
      if (chapter.isReview) return;
      chapter.words.forEach((word) => {
        const key = word.hz + "\u0000" + plainPinyin(word.py);
        if (seen.has(key)) return;
        seen.add(key);
        words.push(word);
      });
    });
  });
  const selected = shuffledWords(words).slice(0, 50);
  const chapter = {
    id: "grade-" + grade + "-random-50",
    name: grade + "年级 · 随机打字",
    tip: "从本年级全部生字中随机抽取 " + selected.length + " 个",
    words: selected
  };
  startChapterWith({ id: "grade-random", icon: "⌨️", title: chapter.name, chapters: [chapter] }, 0);
}
$("#grade-select").addEventListener("change", () => {
  updateCurriculumLabels($("#grade-select").value);
  if ($("#semester-select").querySelector('option[value="2"]').disabled) $("#semester-select").value = "1";
  applyChineseGradeSemester();
});
$("#semester-select").addEventListener("change", applyChineseGradeSemester);
const randomGradeButton = $("#btn-random-grade-practice");
if (randomGradeButton) randomGradeButton.addEventListener("click", startRandomGradePractice);

$("#btn-back").addEventListener("click", goHome);
$("#btn-home").addEventListener("click", goHome);
$("#btn-retry").addEventListener("click", () => {
  cancelAutoNext();
  if (session.isRandomGradePractice) startRandomGradePractice();
  else startChapter(session.track.id, session.idx);
});
$("#btn-next").addEventListener("click", () => {
  cancelAutoNext();
  startChapter(session.track.id, session.idx + 1);
});
const keyHintButton = $("#btn-key-hint");
if (keyHintButton) keyHintButton.addEventListener("click", () => {
  randomKeyboardHint = !randomKeyboardHint;
  try { localStorage.setItem("jianpan-random-key-hint", randomKeyboardHint ? "1" : "0"); } catch (e) {}
  keyHintButton.classList.toggle("hint-off", !randomKeyboardHint);
  keyHintButton.textContent = randomKeyboardHint ? "💡 键盘提示：开" : "💡 键盘提示：关";
  setNextKey(randomKeyboardHint ? curTarget()[session.buffer.length] : null);
});
document.querySelectorAll(".case-btn").forEach((button) =>
  button.addEventListener("click", () => setKeyboardCase(button.dataset.case))
);
$("#btn-skip").addEventListener("click", () => {
  if (view !== "practice" || session.mode !== "pinyin") return;
  session.wordIdx++;
  updatePracticeLocation();
  session.buffer = "";
  if (session.wordIdx >= session.chapter.words.length) return finish();
  renderWordCard();
  if (session.track.id === "words") speakWord(curWord());
  setNextKey(curTarget()[0]);
  updateLive();
});
$("#btn-stats").addEventListener("click", () => {
  renderStats();
  $("#stats-overlay").classList.remove("hidden");
});
$("#btn-stats-close").addEventListener("click", () => $("#stats-overlay").classList.add("hidden"));
$("#btn-reset").addEventListener("click", () => {
  if (confirm("确定要清空「" + progress.name + "」的所有练习进度吗？")) {
    store.profiles[store.active] = blankProfile(progress.name, progress.emoji);
    progress = store.profiles[store.active];
    saveProgress();
    renderHome();
    toast("进度已清空，重新开始冒险吧！");
  }
});
document.querySelectorAll(".mute-btn").forEach((b) => b.addEventListener("click", toggleMute));

$("#btn-settings").addEventListener("click", () => $("#settings-overlay").classList.remove("hidden"));
$("#btn-settings-close").addEventListener("click", () => $("#settings-overlay").classList.add("hidden"));

const GUIDE_FINGER = {
  q: "left-pinky", a: "left-pinky", z: "left-pinky",
  w: "left-ring", s: "left-ring", x: "left-ring",
  e: "left-middle", d: "left-middle", c: "left-middle",
  r: "left-index", t: "left-index", f: "left-index", g: "left-index", v: "left-index", b: "left-index",
  y: "right-index", u: "right-index", h: "right-index", j: "right-index", n: "right-index", m: "right-index",
  i: "right-middle", k: "right-middle",
  o: "right-ring", l: "right-ring",
  p: "right-pinky"
};
const GUIDE_FINGER_NAME = {
  "left-pinky": "左手小指", "left-ring": "左手无名指", "left-middle": "左手中指", "left-index": "左手食指",
  "right-index": "右手食指", "right-middle": "右手中指", "right-ring": "右手无名指", "right-pinky": "右手小指"
};
const GUIDE_DEMO_KEYS = ["f", "j", "d", "k", "s", "l", "a", "p", "g", "h", "r", "u"];
let guideDemoTimer = null;
let guideDemoIndex = 0;

function activateGuideKey(key) {
  const k = key.toLowerCase();
  const finger = GUIDE_FINGER[k];
  if (!finger) return;
  document.querySelectorAll("#guide-keyboard .key").forEach((el) =>
    el.classList.toggle("guide-active", el.dataset.key === k)
  );
  document.querySelectorAll(".guide-finger").forEach((el) =>
    el.classList.toggle("active", el.dataset.finger === finger)
  );
  const badge = $("#guide-key-badge");
  badge.textContent = k.toUpperCase();
  badge.className = FINGER_CLASS[FINGER[k]];
  $("#guide-finger-name").textContent = GUIDE_FINGER_NAME[finger];
  $("#guide-finger-tip").textContent = "请用" + GUIDE_FINGER_NAME[finger] + "按 " + k.toUpperCase() + " 键";
}

function stopGuideDemo() {
  clearInterval(guideDemoTimer);
  guideDemoTimer = null;
}

function startGuideDemo() {
  stopGuideDemo();
  guideDemoIndex = 0;
  activateGuideKey(GUIDE_DEMO_KEYS[guideDemoIndex]);
  guideDemoTimer = setInterval(() => {
    guideDemoIndex = (guideDemoIndex + 1) % GUIDE_DEMO_KEYS.length;
    activateGuideKey(GUIDE_DEMO_KEYS[guideDemoIndex]);
  }, 1400);
}

function buildGuideKeyboard() {
  const kb = $("#guide-keyboard");
  kb.innerHTML = "";
  const HOME = ["a", "s", "d", "f", "g", "h", "j", "k", "l"];
  ROWS.forEach((row, ri) => {
    const rowEl = document.createElement("div");
    rowEl.className = "kb-row kb-row-" + ri;
    row.forEach((k) => {
      const el = document.createElement("div");
      el.className = "key " + FINGER_CLASS[FINGER[k]];
      el.dataset.key = k;
      if (HOME.indexOf(k) !== -1) el.classList.add("home");
      if (k === "f" || k === "j") el.classList.add("bump");
      el.innerHTML = '<span class="k-letter">' + k.toUpperCase() + '</span><span class="k-sub">' + (PY_SOUND[k] || "") + "</span>";
      el.addEventListener("click", () => {
        stopGuideDemo();
        activateGuideKey(k);
      });
      rowEl.appendChild(el);
    });
    kb.appendChild(rowEl);
  });
  const spaceRow = document.createElement("div");
  spaceRow.className = "kb-row";
  const sp = document.createElement("div");
  sp.className = "key space";
  sp.textContent = "空格（两个大拇指）";
  spaceRow.appendChild(sp);
  kb.appendChild(spaceRow);
}

document.addEventListener("keydown", (event) => {
  if (view !== "guide" || !/^[a-zA-Z]$/.test(event.key)) return;
  event.preventDefault();
  stopGuideDemo();
  activateGuideKey(event.key);
});

/* ================= 语音系统（可爱女声） ================= */
/* 这一整块必须排在"启动"（含直链路由）之前：直链启动时会在脚本执行早期就调用
   startChapterWith -> speakWord 等函数，这些函数用到的 voiceMode/voicesCache 等变量
   若声明在后面会触发 TDZ「Cannot access before initialization」，直接中断脚本剩余部分。 */
const VOICE_LABEL = { auto: "自动人声", beep: "滴滴声", en: "英文女声", py: "拼音女声" };
let voiceMode = "auto";
try { voiceMode = localStorage.getItem("jianpan-voice") || "auto"; } catch (e) {}

let voicesCache = [];
function refreshVoices() {
  voicesCache = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
}
if (window.speechSynthesis) {
  refreshVoices();
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}
/* 粤语/港澳台口音的语音名字或 lang 特征，普通话朗读要排除这些，避免读出不标准的口音 */
function isNonMandarinChineseVoice(v) {
  const name = v.name.toLowerCase();
  const lang = v.lang.toLowerCase().replace(/-/g, "");
  return ["yue", "cantonese", "canton", "粤语", "sin-ji", "sinji", "hong kong", "港", "澳", "臺灣", "台湾", "hk", "mo", "tw"]
    .some((k) => name.includes(k) || lang.includes(k));
}
/* 已知发音标准的普通话语音名字，优先挑这些（macOS 的婷婷、Windows 的慧慧/瑶瑶/康康等） */
const GOOD_MANDARIN_VOICE_NAMES = [
  "ting-ting", "tingting", "yu-shu", "yushu", "li-na", "lina",
  "microsoft huihui", "microsoft yaoyao", "microsoft kangkang", "google 普通话", "google 国语"
];
function pickVoice(lang) {
  let list = voicesCache.filter((v) => v.lang && v.lang.toLowerCase().indexOf(lang) === 0);
  if (lang === "en") {
    const us = list.filter((v) => /en-us|en_us/i.test(v.lang));
    if (us.length) list = us;
  }
  if (lang === "zh") {
    const mandarin = list.filter((v) => !isNonMandarinChineseVoice(v));
    if (mandarin.length) list = mandarin;
    const good = list.find((v) => GOOD_MANDARIN_VOICE_NAMES.some((n) => v.name.toLowerCase().includes(n)));
    if (good) return good;
    const cn = list.filter((v) => v.lang.toLowerCase().replace(/-/g, "").startsWith("zhcn"));
    if (cn.length) list = cn;
  }
  if (!list.length) return null;
  const cute = list.find((v) =>
    /tingting|yaoyao|meijia|lily|female|girl|samantha|allison|ava|zoe|google|中文/i.test(v.name)
  );
  const picked = cute || list[0];
  return lang === "zh" && isNonMandarinChineseVoice(picked) ? null : picked;
}
/* iOS Safari 有个著名的坑：SpeechSynthesisUtterance 如果只是函数里的局部变量，没有别的引用拿着它，
   系统会在还没读完（有时候是还没开始读）就把它垃圾回收掉，导致朗读整个静音、毫无反应。
   这里用一个模块级变量接住最新的 utterance，让它在朗读期间不会被提前回收。 */
let lastUtterance = null;
function say(text, lang, pitch, rate, keepQueue) {
  if (muted) return false;
  if (!window.speechSynthesis) return false;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  const v = pickVoice(lang.indexOf("zh") === 0 ? "zh" : "en");
  if (v) u.voice = v;
  u.pitch = pitch;
  u.rate = rate;
  lastUtterance = u;
  if (!keepQueue) window.speechSynthesis.cancel();
  /* iOS 还有一个坑：切过后台或者静音键切换之后，speechSynthesis 会卡在 paused 状态，
     之后调 speak() 会排进队列但永远不出声，得先手动 resume 一下 */
  if (window.speechSynthesis.paused) window.speechSynthesis.resume();
  window.speechSynthesis.speak(u);
  return true;
}
function speakPinyinLetter(k) {
  tone(900, 0.03, "sine", 0.03);
  say(pySpeechText(k), "zh-CN", 1.7, 1.05);
}
function speakEnglishLetter(k) {
  tone(900, 0.03, "sine", 0.03);
  say(EN_SOUND[k] || k, "en-US", 1.7, 1.05);
}
function speakLetter(k) {
  if (voiceMode === "beep" || !window.speechSynthesis) { sndOk(); return; }
  const lang = voiceMode === "auto" ? letterLang : voiceMode;
  if (lang === "py") speakPinyinLetter(k);
  else speakEnglishLetter(k);
}
function speakWord(w, queued) {
  if (voiceMode === "beep" || !window.speechSynthesis) return;
  const isWords = session.track.id === "words";
  say(isWords ? w.py : w.hz, isWords ? "en-US" : "zh-CN", 1.5, 0.95, queued);
}
/* 打字打完：只读一下字/单词本身，不用再把拼读步骤念一遍（刚打完就是这些步骤） */
function speakCompletedWord(w) {
  if (voiceMode === "beep" || !window.speechSynthesis) return;
  speakWord(w);
}
/* “读一读”按钮：逐个字母/拼音念一遍（英文单词也是每个字母都念，不再只念最后一个——
   只念最后一个字母是“刚打完这个词”那个 ding 提示专用的逻辑，用在“还没开始打字就先听一下”
   这个场景上完全没道理，会先冒出一个孤零零的字母音再接单词，很奇怪） */
function speakSpelledOut(w, spelling) {
  if (voiceMode === "beep" || !window.speechSynthesis) { sndOk(); return; }
  const isWords = session.track.id === "words";
  const lang = isWords ? "en-US" : "zh-CN";
  Array.from(spelling).forEach((letter, i) =>
    say(isWords ? (EN_SOUND[letter] || letter) : pySpeechText(letter), lang, 1.7, 1.05, i > 0)
  );
  speakWord(w, true);
}
function speakCurrent() {
  if (!session.chapter || !session.chapter.words) return;
  speakSpelledOut(curWord(), curTarget());
}
function speakEncouragement(text) {
  if (!encourageOn || voiceMode === "beep" || !window.speechSynthesis) return;
  say(text, "zh-CN", 1.3, 1);
}
function applyVoiceMode(m) {
  voiceMode = m;
  try { localStorage.setItem("jianpan-voice", m); } catch (e) {}
  ["voice-select", "voice-select-home"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = m;
  });
}

/* ================= 启动 ================= */
buildKeyboard();
buildGuideKeyboard();
updateMuteBtns();
showView("home");
renderHome();

/* 直链支持：末尾数字为章内题号，例如 #p=pinyin:2:1 */
(function () {
  const m = location.hash.match(/^#p=(letters|pinyin|chinese|chinese2|chinese3|chinese4|chinese5|chinese6|chinese7|chinese8|words):(\d+)(?::(\d+))?$/);
  if (!m) return;
  const track = trackById(m[1]);
  if (!track) return;
  const idx = Math.min(parseInt(m[2], 10) || 0, track.chapters.length - 1);
  activeTrackId = m[1];
  activeLand = landOfTrack(activeTrackId);
  saveNav();
  if (isChineseTrack(activeTrackId)) {
    const gs = CHINESE_GRADE_SEMESTER_BY_TRACK[activeTrackId];
    $("#grade-select").value = gs.grade;
    $("#semester-select").value = gs.semester;
    updateCurriculumLabels(gs.grade);
  }
  startChapter(m[1], idx, m[3]);
})();

/* 减少动画模式：?still=1（也用于截图） */
if (location.search.indexOf("still=1") !== -1) document.body.classList.add("still");

/* ================= 弱键专练（自动错题本） ================= */
function startWeakPractice() {
  const ranked = Object.entries(progress.keys)
    .map(([k, v]) => ({ k, bad: v.bad, total: v.ok + v.bad }))
    .filter((e) => e.bad >= 3)
    .sort((a, b) => b.bad / b.total - a.bad / a.total)
    .slice(0, 6);
  if (!ranked.length) { toast("还没有弱键，先去闯几关吧！"); return; }
  const keys = ranked.map((e) => e.k);
  const chapter = {
    id: "weak",
    name: "弱键专练",
    newKeys: keys,
    len: 24,
    tip: "今天重点练：" + keys.map((k) => k.toUpperCase()).join(" ")
  };
  startChapterWith({ id: "letters", icon: "📕", title: "弱键专练", chapters: [chapter] }, 0);
}

["voice-select", "voice-select-home"].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("change", () => {
    applyVoiceMode(el.value);
    toast("声音已切换：" + VOICE_LABEL[el.value]);
  });
});
$("#btn-speak").addEventListener("click", speakCurrent);
$("#btn-guide").addEventListener("click", () => showView("guide"));
$("#btn-guide-back").addEventListener("click", goHome);
$("#btn-guide-demo").addEventListener("click", startGuideDemo);
$("#btn-weak").addEventListener("click", startWeakPractice);
applyVoiceMode(voiceMode);


/* ================= 自由选关设置 ================= */
function toggleFreeJump() {
  freeJump = !freeJump;
  try { localStorage.setItem("jianpan-freejump", freeJump ? "1" : "0"); } catch (e) {}
  renderHome();
  toast(freeJump ? "已开启自由选关，所有关卡随便玩！" : "已关闭自由选关，继续按顺序闯关");
}
$("#btn-freejump").addEventListener("click", toggleFreeJump);

/* ================= 通关鼓励语音设置 ================= */
$("#encourage-check").checked = encourageOn;
$("#encourage-check").addEventListener("change", (e) => {
  encourageOn = e.target.checked;
  try { localStorage.setItem("jianpan-encourage", encourageOn ? "1" : "0"); } catch (err) {}
  toast(encourageOn ? "已开启通关鼓励语音" : "已关闭通关鼓励语音");
});

/* ================= 打卡与徽章 ================= */
function dateStr(d) { return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
function touchStreak() {
  const today = dateStr(new Date());
  const s = progress.streak || { last: "", days: 0 };
  if (s.last !== today) {
    const yest = dateStr(new Date(Date.now() - 86400000));
    s.days = s.last === yest ? s.days + 1 : 1;
    s.last = today;
    progress.streak = s;
  }
}
function currentStreak() {
  const s = progress.streak;
  if (!s || !s.last) return 0;
  const today = dateStr(new Date());
  const yest = dateStr(new Date(Date.now() - 86400000));
  return s.last === today || s.last === yest ? s.days : 0;
}
function trackCleared(trackId) {
  const track = trackById(trackId);
  return !!track && track.chapters.every((ch) => ((progress.chapters[ch.id] || {}).stars || 0) >= 1);
}
const BADGES = [
  { id: "first-clear", icon: "🌱", name: "初出茅庐", desc: "通过任意一关", check: (c) => c.stars >= 1 },
  { id: "first-3star", icon: "🌟", name: "三星小将", desc: "拿到第一个三星", check: (c) => c.stars === 3 },
  { id: "combo-50", icon: "🔥", name: "连击 50", desc: "单关连击达到 50", check: (c) => c.maxCombo >= 50 },
  { id: "combo-100", icon: "☄️", name: "连击大师", desc: "单关连击达到 100", check: (c) => c.maxCombo >= 100 },
  { id: "speed-80", icon: "⚡", name: "快手侠", desc: "单关速度达到 80 键/分", check: (c) => c.kpm >= 80 },
  { id: "plays-10", icon: "📚", name: "勤学苦练", desc: "累计练习 10 轮", check: () => (progress.plays || 0) >= 10 },
  { id: "streak-3", icon: "📅", name: "三日之约", desc: "连续打卡 3 天", check: () => currentStreak() >= 3 },
  { id: "streak-7", icon: "🗓️", name: "七天达人", desc: "连续打卡 7 天", check: () => currentStreak() >= 7 },
  { id: "letters-all", icon: "🎓", name: "字母毕业", desc: "字母轨全部通关", check: () => trackCleared("letters") },
  { id: "pinyin-all", icon: "🐼", name: "拼音毕业", desc: "拼音轨全部通关", check: () => trackCleared("pinyin") },
  { id: "words-all", icon: "🍎", name: "单词毕业", desc: "单词轨全部通关", check: () => trackCleared("words") },
  { id: "frog-win", icon: "🐸", name: "首次过河", desc: "青蛙过河成功一次", check: (c) => c.kind === "game" && c.win },
  { id: "frog-perfect", icon: "👑", name: "完美过河", desc: "不掉一条命过河", check: (c) => c.kind === "game" && c.win && c.hearts >= 3 }
];
function checkBadges(ctx) {
  if (!progress.badges) progress.badges = {};
  const unlocked = [];
  const today = dateStr(new Date());
  for (const b of BADGES) {
    if (progress.badges[b.id]) continue;
    if (b.check(ctx)) {
      progress.badges[b.id] = today;
      unlocked.push(b);
    }
  }
  if (unlocked.length) {
    saveProgress();
    setTimeout(() => toast("🏅 解锁徽章：" + unlocked.map((b) => b.name).join("、")), 600);
  }
}
function renderBadges() {
  const earned = progress.badges || {};
  const today = dateStr(new Date());
  const doneToday = progress.streak && progress.streak.last === today;
  let html = "<p style='text-align:center'>🔥 连续打卡 <b>" + currentStreak() + "</b> 天 " +
    (doneToday ? "（今天已打卡 ✓）" : "（今天练一轮就打卡啦）") + "</p>";
  html += "<div class='badge-grid'>" + BADGES.map((b) =>
    "<div class='badge" + (earned[b.id] ? "" : " locked") + "'>" +
      "<div class='b-icon'>" + b.icon + "</div>" +
      "<div class='b-name'>" + b.name + "</div>" +
      "<div class='b-desc'>" + b.desc + "</div>" +
    "</div>").join("") + "</div>";
  $("#badges-body").innerHTML = html;
}
$("#btn-badges").addEventListener("click", () => {
  renderBadges();
  $("#badges-overlay").classList.remove("hidden");
});
$("#btn-badges-close").addEventListener("click", () => $("#badges-overlay").classList.add("hidden"));
$("#btn-profile").addEventListener("click", () => {
  renderProfiles();
  $("#profile-overlay").classList.remove("hidden");
});
$("#btn-profile-close").addEventListener("click", () => $("#profile-overlay").classList.add("hidden"));
$("#btn-profile-add").addEventListener("click", () => {
  const input = $("#profile-name");
  const name = input.value.trim().slice(0, 8);
  if (!name) { toast("先输入名字哦"); return; }
  input.value = "";
  addProfile(name);
  renderProfiles();
});

/* 直链：#guide 打开指法讲解页 */
if (location.hash === "#guide") showView("guide");


/* ================= 青蛙过河游戏 ================= */
const game = {};

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildTargets(mode) {
  let pool;
  if (mode === "letters") {
    pool = "abcdefghijklmnopqrstuvwxyz".split("")
      .map((k) => ({ leaf: k, target: k, hint: "打字母 " + k.toUpperCase() }));
  } else {
    const words = [];
    trackById(mode).chapters.forEach((c) => c.words.forEach((w) => words.push(w)));
    pool = words.map((w) =>
      mode === "pinyin"
        ? { leaf: w.hz, target: plainPinyin(w.py), hint: w.hz + " " + w.py, hanziLeaf: true }
        : { leaf: w.em, target: w.py, hint: w.py + " " + (IPA[w.py] || "") + " · " + w.hz }
    );
  }
  return { pool, targets: shuffle(pool).slice(0, mode === "letters" ? 10 : 6) };
}

function startGame(mode) {
  game.mode = mode;
  letterLang = trackLetterLang(mode);
  game.branch = $("#branch-check").checked;
  game.hideKb = $("#hidekb-check").checked;
  document.body.classList.add("in-game");
  game.idx = 0;
  game.buffer = "";
  game.hearts = 3;
  game.correct = 0;
  game.wrong = 0;
  game.startTime = performance.now();
  const built = buildTargets(mode);
  game.pool = built.pool;
  game.targets = built.targets;
  buildRiver();
  $("#game-overlay").classList.add("hidden");
  $("#game-result").classList.add("hidden");
  $("#keyboard").classList.toggle("pinyin-kb", mode === "pinyin");
  showView("game");
  clearKeyStates();
  updateGameHud();
  renderGameCard();
  requestAnimationFrame(() => positionFrog(false));
  setNextKey(game.targets[0].target[0]);
  ensureAudio();
}

function buildRiver() {
  const river = $("#river");
  river.classList.toggle("branch", !!game.branch);
  river.innerHTML = "";
  const water = document.createElement("div");
  water.className = "water";
  river.appendChild(water);
  const start = document.createElement("div");
  start.className = "bank start";
  start.textContent = "🌱";
  river.appendChild(start);
  game.leafEls = [];
  game.colEls = [];
  game.targets.forEach((t) => {
    if (game.branch) {
      const col = document.createElement("div");
      col.className = "col";
      const decoys = shuffle(game.pool.filter((x) => x.leaf !== t.leaf)).slice(0, 2);
      const colLeaves = [];
      shuffle([t].concat(decoys)).forEach((it) => {
        const l = document.createElement("div");
        l.className = "leaf" + (it.hanziLeaf ? " hanzi" : "");
        l.textContent = it.leaf;
        col.appendChild(l);
        colLeaves.push(l);
        if (it === t) game.leafEls.push(l);
      });
      river.appendChild(col);
      game.colEls.push(colLeaves);
    } else {
      const l = document.createElement("div");
      l.className = "leaf" + (t.hanziLeaf ? " hanzi" : "");
      l.textContent = t.leaf;
      river.appendChild(l);
      game.leafEls.push(l);
    }
  });
  if (game.branch && game.colEls[0]) game.colEls[0].forEach((l) => l.classList.add("active"));
  else if (game.leafEls[0]) game.leafEls[0].classList.add("cur");
  const end = document.createElement("div");
  end.className = "bank end";
  end.textContent = "🏆";
  river.appendChild(end);
  const frog = document.createElement("div");
  frog.id = "frog";
  frog.textContent = "🐸";
  river.appendChild(frog);
}

function positionFrog(hop) {
  const frog = $("#frog");
  if (!frog) return;
  let ref;
  if (game.idx >= game.targets.length) ref = document.querySelector("#river .bank.end");
  else if (game.idx === 0) ref = document.querySelector("#river .bank.start");
  else ref = game.leafEls[game.idx - 1];
  frog.style.left = ref.offsetLeft + ref.offsetWidth / 2 - frog.offsetWidth / 2 + "px";
  frog.style.top = ref.offsetTop + ref.offsetHeight / 2 - frog.offsetHeight + 8 + "px";
  if (hop) {
    frog.classList.remove("hop");
    void frog.offsetWidth;
    frog.classList.add("hop");
  }
}

function updateGameHud() {
  $("#game-hearts").textContent = "❤️".repeat(game.hearts) + "🤍".repeat(3 - game.hearts);
  $("#game-progress").textContent = "🍃 " + game.idx + "/" + game.targets.length;
}

function renderGameCard() {
  $("#gc-hint").textContent = game.targets[game.idx] ? game.targets[game.idx].hint : "";
  $("#gc-buffer").textContent = game.buffer;
}

function gameBackspace() {
  if (!game.buffer.length) return;
  game.buffer = game.buffer.slice(0, -1);
  renderGameCard();
  setNextKey(game.targets[game.idx].target[game.buffer.length]);
}

function gameKey(k) {
  const t = game.targets[game.idx];
  if (!t) return;
  if (t.target.startsWith(game.buffer + k)) {
    game.buffer += k;
    game.correct++;
    recordKey(k, true);
    speakLetter(k);
    flashKey(k, true);
    if (game.buffer === t.target) {
      game.buffer = "";
      game.idx++;
      if (game.branch) {
        (game.colEls[game.idx - 1] || []).forEach((l) => l.classList.remove("active"));
        game.leafEls[game.idx - 1].classList.add("done");
        if (game.colEls[game.idx]) game.colEls[game.idx].forEach((l) => l.classList.add("active"));
      } else {
        game.leafEls[game.idx - 1].classList.add("done");
        game.leafEls[game.idx - 1].classList.remove("cur");
        if (game.leafEls[game.idx]) game.leafEls[game.idx].classList.add("cur");
      }
      sndWord();
      if (game.idx >= game.targets.length) {
        positionFrog(true);
        updateGameHud();
        return gameEnd(true);
      }
      positionFrog(true);
      renderGameCard();
      setNextKey(game.targets[game.idx].target[0]);
    } else {
      setNextKey(t.target[game.buffer.length]);
      renderGameCard();
    }
  } else {
    game.wrong++;
    recordKey(k, false, t.target[game.buffer.length]);
    game.hearts--;
    sndBad();
    flashKey(k, false);
    const frog = $("#frog");
    frog.classList.remove("ouch");
    void frog.offsetWidth;
    frog.classList.add("ouch");
    splashAt(frog);
    updateGameHud();
    if (game.hearts <= 0) return gameEnd(false);
  }
  updateGameHud();
}

function gameEnd(win) {
  view = "result";
  clearKeyStates();
  const seconds = Math.max(1, Math.round((performance.now() - game.startTime) / 1000));
  const total = game.correct + game.wrong;
  const acc = total ? Math.round((game.correct / total) * 100) : 100;
  const stars = win ? game.hearts : 0;
  const gs = (progress.games || (progress.games = {}))[game.mode] ||
    (progress.games[game.mode] = { plays: 0, wins: 0, bestTime: 0 });
  gs.plays++;
  if (win) {
    gs.wins++;
    if (!gs.bestTime || seconds < gs.bestTime) gs.bestTime = seconds;
  }
  touchStreak();
  checkBadges({ kind: "game", win, hearts: game.hearts });
  saveProgress();
  $("#gr-stars").innerHTML = [0, 1, 2]
    .map((i) => '<span class="' + (i < stars ? "on" : "off") + '" style="animation-delay:' + i * 0.15 + 's">★</span>')
    .join("");
  $("#gr-title").textContent = win ? "小青蛙过河啦！呱呱！" : "哎呀，小青蛙落水了，再试一次！";
  $("#gr-stats").innerHTML =
    "<div><b>" + acc + "%</b><span>正确率</span></div>" +
    "<div><b>" + seconds + "s</b><span>用时</span></div>" +
    "<div><b>" + game.hearts + "</b><span>剩余命</span></div>";
  if (win) {
    $("#game-result").classList.remove("hidden");
    sndWin();
  } else {
    const frog = $("#frog");
    frog.classList.add("fall");
    splashAt(frog);
    setTimeout(() => $("#game-result").classList.remove("hidden"), 900);
  }
}

function splashAt(frog) {
  const s = document.createElement("div");
  s.className = "splash";
  s.textContent = "💦";
  s.style.left = frog.style.left;
  $("#river").appendChild(s);
  setTimeout(() => s.remove(), 700);
}

$("#btn-game").addEventListener("click", () => $("#game-overlay").classList.remove("hidden"));
$("#btn-game-close").addEventListener("click", () => $("#game-overlay").classList.add("hidden"));
document.querySelectorAll(".game-modes button").forEach((b) =>
  b.addEventListener("click", () => startGame(b.dataset.mode))
);
$("#btn-game-back").addEventListener("click", goHome);
$("#btn-game-retry").addEventListener("click", () => startGame(game.mode));
$("#btn-game-home").addEventListener("click", goHome);
window.addEventListener("resize", () => {
  if (view === "game") positionFrog(false);
});

/* 直链：#game=letters|pinyin|words 直接开始游戏 */
const gm = location.hash.match(/^#game=(letters|pinyin|words)/);
if (gm) {
  $("#branch-check").checked = location.hash.indexOf("&branch") !== -1;
  $("#hidekb-check").checked = location.hash.indexOf("&hidekb") !== -1;
  startGame(gm[1]);
}

/* ================= 写字乐园：拼字游戏 / 配对游戏 / 写字练习 ================= */
const writingSession = { track: null, chapter: null, chapterIdx: 0, words: [] };

function getWrongBook() {
  if (!progress.wrongChars) progress.wrongChars = {};
  return progress.wrongChars;
}
function addToWrongBook(ch) {
  const wb = getWrongBook();
  wb[ch] = (wb[ch] || 0) + 1;
  saveProgress();
  updateWrongbookCount();
}
function removeFromWrongBook(ch) {
  const wb = getWrongBook();
  if (wb[ch]) {
    delete wb[ch];
    saveProgress();
    updateWrongbookCount();
  }
}
function updateWrongbookCount() {
  const el = $("#wrongbook-count");
  if (el) el.textContent = Object.keys(getWrongBook()).length;
}
function findWordByHanzi(ch) {
  for (const t of TRACKS) {
    if (!isChineseTrack(t.id)) continue;
    for (const c of t.chapters) {
      const w = c.words.find((w) => w.hz === ch);
      if (w) return w;
    }
  }
  return null;
}

function openWritingModes(track, chapterIdx) {
  writingSession.track = track;
  writingSession.chapter = track.chapters[chapterIdx];
  writingSession.chapterIdx = chapterIdx;
  writingSession.words = writingSession.chapter.words;
  $("#writing-chapter-title").textContent = track.icon + " " + writingSession.chapter.name;
  const english = track.id === "words";
  document.querySelectorAll(".writing-mode-card [data-zh]").forEach((element) => {
    element.textContent = english ? element.dataset.en : element.dataset.zh;
  });
  document.querySelector('.writing-mode-card[data-mode="write"]').classList.toggle("hidden", english);
  $("#btn-wrongbook").classList.toggle("hidden", english);
  updateWrongbookCount();
  showView("writing-modes");
}
function startWrongBookReview() {
  const chars = Object.keys(getWrongBook());
  if (!chars.length) { toast("还没有错字～写字练习时写错的字会自动收进错字库"); return; }
  const words = chars.map(findWordByHanzi).filter(Boolean);
  writingSession.track = null;
  writingSession.chapter = { id: "wrongbook", name: "错字复习" };
  writingSession.words = words;
  startWrite();
}
$("#btn-writing-back").addEventListener("click", () => showView("home"));
$("#btn-wrongbook").addEventListener("click", startWrongBookReview);
document.querySelectorAll(".writing-mode-card").forEach((c) =>
  c.addEventListener("click", () => {
    const mode = c.dataset.mode;
    if (mode === "assemble" && writingSession.track.id === "words") startChapter(writingSession.track.id, writingSession.chapterIdx);
    else if (mode === "assemble") startAssemble();
    else if (mode === "match") startMatch();
    else if (mode === "write") startWrite();
  })
);

/* ---- 拼字游戏：拖拽笔画部件拼成汉字 ---- */
const assembleState = { words: [], idx: 0, placed: 0, total: 0 };

function splitStrokes(hz) {
  const d = HANZI_STROKES[hz];
  const n = d.strokes.length;
  let groupA;
  if (d.radStrokes && d.radStrokes.length && d.radStrokes.length < n) {
    groupA = d.radStrokes;
  } else {
    groupA = Array.from({ length: Math.ceil(n / 2) }, (_, i) => i);
  }
  const setA = new Set(groupA);
  const groupB = Array.from({ length: n }, (_, i) => i).filter((i) => !setA.has(i));
  return [groupA, groupB];
}
/* 笔画数据的 y 轴和屏幕方向是反的（HanziWriter 渲染时用 scale(1,-1) 翻转），
   这里直接画原始路径也要套同样的翻转，不然拼出来的字是上下颠倒的 */
const HANZI_FLIP_TRANSFORM = "matrix(1,0,0,-1,0,1024)";
function strokeGroupSvg(hz, indices, color) {
  const d = HANZI_STROKES[hz];
  const paths = indices.map((i) => '<path d="' + d.strokes[i] + '" fill="' + color + '"></path>').join("");
  /* preserveAspectRatio=none：部件方块是正方形，但笔画本身可能是细长条（比如“亻”），
     保持原比例的话瘦长部件只能占方块中间一小条，看起来比宽扁部件小很多。
     直接拉伸填满整个方块，让每个部件视觉大小统一，更像"对等的拼图块"。 */
  return '<svg viewBox="0 0 1024 1024" preserveAspectRatio="none"><g><g transform="' + HANZI_FLIP_TRANSFORM + '">' + paths + "</g></g></svg>";
}
/* 把部件的 SVG 视口收紧到这几笔实际占用的范围，避免缩略图里的部件显得又小又偏
   （外层 g 没有自己的 transform，getBBox 在这一层量出来的是翻转之后、真正会画在屏幕上的范围） */
function fitPieceViewBox(pieceEl) {
  const svg = pieceEl.querySelector("svg");
  const g = svg.querySelector("g");
  let box;
  try { box = g.getBBox(); } catch (e) { return; }
  if (!box || !box.width || !box.height) return;
  const pad = Math.max(box.width, box.height) * 0.12;
  svg.setAttribute(
    "viewBox",
    (box.x - pad) + " " + (box.y - pad) + " " + (box.width + pad * 2) + " " + (box.height + pad * 2)
  );
}
function startAssemble() {
  const pool = writingSession.words.filter((w) => {
    const d = HANZI_STROKES[w.hz];
    return d && d.strokes.length >= 2;
  });
  if (!pool.length) { toast("这一关的字暂时不支持拼字游戏"); return; }
  assembleState.words = shuffle(pool).slice(0, 8);
  assembleState.idx = 0;
  showView("assemble");
  renderAssembleCurrent();
}
function renderAssembleCurrent() {
  const w = assembleState.words[assembleState.idx];
  $("#assemble-hint").textContent = "拖动部件，拼出这个字：" + w.py + (w.group ? " · 组词：" + w.group : "");
  $("#assemble-progress").textContent = (assembleState.idx + 1) + "/" + assembleState.words.length;
  const [groupA, groupB] = splitStrokes(w.hz);
  const d = HANZI_STROKES[w.hz];
  $("#assemble-target").innerHTML = '<g transform="' + HANZI_FLIP_TRANSFORM + '">' + d.strokes
    .map((s) => '<path d="' + s + '" fill="none" stroke="#cbd5e1" stroke-width="4"></path>')
    .join("") + "</g>";
  const piecesEl = $("#assemble-pieces");
  piecesEl.innerHTML = "";
  assembleState.placed = 0;
  assembleState.total = 2;
  [groupA, groupB].forEach((group, gi) => {
    const piece = document.createElement("div");
    piece.className = "assemble-piece";
    piece.innerHTML = strokeGroupSvg(w.hz, group, gi === 0 ? "#3b82f6" : "#f97316");
    piece.style.left = gi === 0 ? "8%" : "62%";
    piece.style.top = "68%";
    makeDraggable(piece, onPieceDropped);
    piecesEl.appendChild(piece);
    fitPieceViewBox(piece);
  });
}
function onPieceDropped(piece, droppedOnTarget) {
  if (piece.classList.contains("placed")) return;
  if (!droppedOnTarget) return;
  const stage = $("#assemble-stage");
  const stageRect = stage.getBoundingClientRect();
  const targetRect = $("#assemble-target").getBoundingClientRect();
  piece.style.pointerEvents = "none";
  /* .placed 长大之后跟目标框一样大，所以摆放位置直接对齐目标框左上角即可（不用再按旧尺寸算居中）。
     加 requestAnimationFrame 是因为松手那一刻 .dragging 才刚被去掉（过渡才刚打开），
     如果在同一个同步任务里立刻把 .placed 的新位置/新尺寸也设上，浏览器会把两次样式改动合并成一次，
     直接跳到终点、没有过渡动画，看起来就是位置"瞬移"了一下，很突兀。等一帧再改，动画才会真的播放。 */
  requestAnimationFrame(() => {
    piece.classList.add("placed");
    piece.style.left = targetRect.left - stageRect.left + "px";
    piece.style.top = targetRect.top - stageRect.top + "px";
    /* 放到框里之后要跟目标轮廓严丝合缝对齐，所以换回完整字的真实坐标系（0 0 1024 1024，
       不再拉伸），拖拽时为了让部件看起来一样大用的是裁剪+拉伸填满小方块的视口，两者不一样 */
    const svg = piece.querySelector("svg");
    svg.setAttribute("viewBox", "0 0 1024 1024");
    svg.removeAttribute("preserveAspectRatio");
  });
  assembleState.placed++;
  sndOk();
  if (assembleState.placed >= assembleState.total) {
    sndWin();
    const w = assembleState.words[assembleState.idx];
    if (voiceMode !== "beep") say(w.hz, "zh-CN", 1.5, 0.95);
    setTimeout(nextAssemble, 900);
  }
}
function nextAssemble() {
  assembleState.idx++;
  if (assembleState.idx >= assembleState.words.length) {
    toast("🎉 这一组字都拼完啦！");
    showView("writing-modes");
    return;
  }
  renderAssembleCurrent();
}
/* 拖拽用「按下绑在部件上、移动/松开绑在 document 上」这种更稳的写法：
   不依赖 setPointerCapture，手指/鼠标快速移动飞出部件范围也不会丢事件，
   在真机触屏上尤其明显（之前只在部件上监听 pointermove，快速拖动时会跟丢，位置就会显得很乱）。 */
function makeDraggable(el, onDrop) {
  let dragging = false, offX = 0, offY = 0;
  const stage = $("#assemble-stage");
  function onMove(e) {
    if (!dragging) return;
    e.preventDefault();
    const stageRect = stage.getBoundingClientRect();
    el.style.left = e.clientX - stageRect.left - offX + "px";
    el.style.top = e.clientY - stageRect.top - offY + "px";
  }
  function onUp(e) {
    if (!dragging) return;
    dragging = false;
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onUp);
    el.classList.remove("dragging");
    const targetRect = $("#assemble-target").getBoundingClientRect();
    const pieceRect = el.getBoundingClientRect();
    const overlap = !(pieceRect.right < targetRect.left || pieceRect.left > targetRect.right ||
      pieceRect.bottom < targetRect.top || pieceRect.top > targetRect.bottom);
    onDrop(el, overlap);
  }
  el.addEventListener("pointerdown", (e) => {
    if (el.classList.contains("placed")) return;
    e.preventDefault();
    dragging = true;
    const r = el.getBoundingClientRect();
    offX = e.clientX - r.left;
    offY = e.clientY - r.top;
    el.classList.add("dragging");
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  });
}
$("#btn-assemble-back").addEventListener("click", () => showView("writing-modes"));

/* ---- 配对游戏：汉字和拼音翻牌配对 ---- */
const matchState = { pairs: [], flipped: [], matchedCount: 0, total: 0, moves: 0, locked: false };
function startMatch() {
  const words = shuffle(writingSession.words).slice(0, 8);
  const pairs = [];
  words.forEach((w, i) => {
    pairs.push({ id: i, type: "hz", text: w.hz });
    pairs.push({ id: i, type: "py", text: w.py });
  });
  matchState.pairs = shuffle(pairs);
  matchState.flipped = [];
  matchState.matchedCount = 0;
  matchState.total = words.length;
  matchState.moves = 0;
  matchState.locked = false;
  showView("match");
  renderMatchGrid();
}
function renderMatchGrid() {
  const grid = $("#match-grid");
  grid.innerHTML = "";
  matchState.pairs.forEach((p, idx) => {
    const tile = document.createElement("button");
    const open = p.matched || matchState.flipped.includes(idx);
    tile.className = "match-tile" + (p.matched ? " matched" : "") + (open ? " flipped" : "");
    tile.innerHTML = open ? '<span class="mt-face">' + p.text + "</span>" : '<span class="mt-back">?</span>';
    tile.addEventListener("click", () => flipMatchTile(idx));
    grid.appendChild(tile);
  });
  $("#match-moves").textContent = "步数 " + matchState.moves;
}
function flipMatchTile(idx) {
  if (matchState.locked) return;
  const p = matchState.pairs[idx];
  if (p.matched || matchState.flipped.includes(idx)) return;
  matchState.flipped.push(idx);
  renderMatchGrid();
  if (matchState.flipped.length < 2) return;
  matchState.moves++;
  matchState.locked = true;
  const [a, b] = matchState.flipped;
  const pa = matchState.pairs[a], pb = matchState.pairs[b];
  if (pa.id === pb.id && pa.type !== pb.type) {
    pa.matched = true;
    pb.matched = true;
    matchState.matchedCount++;
    sndWord();
    matchState.flipped = [];
    matchState.locked = false;
    renderMatchGrid();
    if (matchState.matchedCount >= matchState.total) {
      sndWin();
      setTimeout(() => toast("🎉 配对完成！用了 " + matchState.moves + " 步"), 200);
    }
  } else {
    sndBad();
    setTimeout(() => {
      matchState.flipped = [];
      matchState.locked = false;
      renderMatchGrid();
    }, 700);
  }
}
$("#btn-match-back").addEventListener("click", () => showView("writing-modes"));

/* ---- 写字练习：描红 / 默写，用 HanziWriter 识别笔顺 ---- */
const writeState = { words: [], idx: 0, mode: "trace", writer: null, wrongCount: 0 };
function startWrite() {
  writeState.words = writingSession.words.filter((w) => HANZI_STROKES[w.hz]);
  if (!writeState.words.length) { toast("这一关的字暂时还没有笔顺数据"); return; }
  writeState.idx = 0;
  showView("write");
  renderWriteCurrent();
}
function updateWrongToggleBtn(hz) {
  const inBook = !!getWrongBook()[hz];
  $("#btn-write-wrongtoggle").textContent = inBook ? "✅ 移出错字库" : "📕 加入错字库";
}
function speakWriteChar(w) {
  if (voiceMode === "beep") { sndOk(); return; }
  say(w.hz, "zh-CN", 1.3, 0.9);
}
/* 写字格大小跟着屏幕适配：桌面给到 420px，手机上不能超出屏幕宽度 */
function writeTargetSize() {
  return Math.round(Math.max(240, Math.min(420, window.innerWidth - 64)));
}
function renderWriteCurrent() {
  const w = writeState.words[writeState.idx];
  $("#write-title").textContent = "✍️ 写字练习 " + (writeState.idx + 1) + "/" + writeState.words.length;
  $("#write-pinyin-big").textContent = w.py;
  $("#write-prompt-text").textContent = (writeState.mode === "trace" ? "跟着描红" : "听读音默写") +
    (w.group ? " · 组词：" + w.group : "");
  updateWrongToggleBtn(w.hz);
  if (writeState.mode === "dictate") speakWriteChar(w);
  writeState.wrongCount = 0;
  const size = writeTargetSize();
  const target = $("#write-target");
  target.style.width = size + "px";
  target.style.height = size + "px";
  target.innerHTML = "";
  writeState.writer = HanziWriter.create("write-target", w.hz, {
    width: size,
    height: size,
    padding: Math.round(size * 0.03),
    showOutline: writeState.mode === "trace",
    strokeAnimationSpeed: 1,
    delayBetweenStrokes: 300,
    strokeColor: "#3b82f6",
    outlineColor: "#dbeafe",
    drawingColor: "#1e3a8a",
    drawingWidth: Math.round(size * 0.12),
    charDataLoader: (char) => HANZI_STROKES[char]
  });
  startWriteQuiz();
}
function startWriteQuiz() {
  const w = writeState.words[writeState.idx];
  writeState.writer.quiz({
    showHintAfterMisses: writeState.mode === "trace" ? 1 : 3,
    highlightOnComplete: true,
    onMistake: () => { writeState.wrongCount++; sndBad(); },
    onCorrectStroke: () => sndOk(),
    onComplete: () => {
      sndWin();
      if (writeState.wrongCount >= 3) {
        addToWrongBook(w.hz);
        toast("这个字有点难，已自动收进错字库～");
      } else if (writingSession.chapter && writingSession.chapter.id === "wrongbook") {
        removeFromWrongBook(w.hz);
      }
      if (voiceMode !== "beep") say(w.hz, "zh-CN", 1.5, 0.95);
      updateWrongToggleBtn(w.hz);
      setTimeout(nextWriteChar, 900);
    }
  });
}
function nextWriteChar() {
  writeState.idx++;
  if (writeState.idx >= writeState.words.length) {
    toast("🎉 这一组字都写完啦！");
    showView("writing-modes");
    return;
  }
  renderWriteCurrent();
}
document.querySelectorAll(".write-mode-btn").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll(".write-mode-btn").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    writeState.mode = b.dataset.wmode;
    renderWriteCurrent();
  })
);
$("#btn-write-speak").addEventListener("click", () => {
  const w = writeState.words[writeState.idx];
  if (w) speakWriteChar(w);
});
$("#btn-write-next").addEventListener("click", nextWriteChar);
$("#btn-write-redo").addEventListener("click", () => renderWriteCurrent());
$("#btn-write-demo").addEventListener("click", () => {
  if (!writeState.writer) return;
  writeState.writer.cancelQuiz();
  writeState.writer.animateCharacter({ onComplete: () => startWriteQuiz() });
});
$("#btn-write-hint").addEventListener("click", () => {
  if (!writeState.writer) return;
  writeState.writer.showOutline();
  if (writeState.mode !== "trace") setTimeout(() => writeState.writer.hideOutline(), 1500);
});
$("#btn-write-wrongtoggle").addEventListener("click", () => {
  const w = writeState.words[writeState.idx];
  if (!w) return;
  if (getWrongBook()[w.hz]) removeFromWrongBook(w.hz);
  else addToWrongBook(w.hz);
  updateWrongToggleBtn(w.hz);
});
$("#btn-write-back").addEventListener("click", () => showView("writing-modes"));
