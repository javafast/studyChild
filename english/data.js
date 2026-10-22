"use strict";

/* ==========================================================
 * 章节与词库数据
 * 字母轨：newKeys 为本关引入的新键，练习时自动累计之前所有关的键
 * 拼音轨：py 为带声调拼音（仅作提示），输入判定用不带声调的字母
 * 想加新词/新关卡，直接往这里加即可
 * ========================================================== */
function chineseWords(entries) {
  return entries.map(([hz, py, group, em = "📖"]) => ({ hz, py, group, em }));
}

function textbookWords(chars, pinyin) {
  const hanzi = Array.from(chars);
  const sounds = pinyin.trim().split(/\s+/);
  if (hanzi.length !== sounds.length) throw new Error("课本生字与拼音数量不一致：" + chars);
  return hanzi.map((hz, i) => ({ hz, py: sounds[i], em: "📖" }));
}

function englishWords(entries, em = "📘") {
  return entries.map(([py, hz]) => ({ hz, py, em }));
}

const TRACKS = [
  {
    id: "letters",
    title: "字母触摸键",
    icon: "⌨️",
    chapters: [
      { id: "L01", name: "定位键 F J", newKeys: ["f", "j"], len: 20, tip: "两只食指轻轻放在 F 和 J 的小横杠上，眼睛看屏幕" },
      { id: "L02", name: "新朋友 D K", newKeys: ["d", "k"], len: 24, tip: "中指轻轻搭在 D 和 K 上" },
      { id: "L03", name: "新朋友 S L", newKeys: ["s", "l"], len: 24, tip: "无名指放在 S 和 L，慢慢来不着急" },
      { id: "L04", name: "新朋友 A · 复习", newKeys: ["a"], len: 28, tip: "小指去按最左边的 A" },
      { id: "L05", name: "中间的 G H", newKeys: ["g", "h"], len: 28, tip: "食指往里伸一伸就是 G 和 H" },
      { id: "L06", name: "基准行大闯关", newKeys: [], len: 40, tip: "A S D F G H J K L 全部集合！" },
      { id: "L07", name: "新朋友 E I", newKeys: ["e", "i"], len: 28, tip: "中指往上抬，按 E 和 I" },
      { id: "L08", name: "新朋友 R U", newKeys: ["r", "u"], len: 28, tip: "食指往上抬，按 R 和 U" },
      { id: "L09", name: "新朋友 T Y", newKeys: ["t", "y"], len: 28, tip: "食指再伸远一点点" },
      { id: "L10", name: "新朋友 W O", newKeys: ["w", "o"], len: 28, tip: "无名指往上抬，按 W 和 O" },
      { id: "L11", name: "新朋友 Q P", newKeys: ["q", "p"], len: 28, tip: "小指往上抬，按 Q 和 P" },
      { id: "L12", name: "上排大闯关", newKeys: [], len: 40, tip: "Q W E R T Y U I O P 全部集合！" },
      { id: "L13", name: "新朋友 B N", newKeys: ["b", "n"], len: 28, tip: "食指往下伸，按 B 和 N" },
      { id: "L14", name: "新朋友 V M", newKeys: ["v", "m"], len: 28, tip: "食指再往下，按 V 和 M" },
      { id: "L15", name: "新朋友 C X Z", newKeys: ["c", "x", "z"], len: 30, tip: "中指、无名指、小指分工按 C X Z" },
      { id: "L16", name: "字母总动员", newKeys: [], len: 44, tip: "26 个字母全部集合，你可以的！" }
    ]
  },
  {
    id: "words",
    title: "单词挑战",
    icon: "🍎",
    chapters: [
      { id: "W1", name: "小动物", tip: "看图片和中文，打出英文单词", words: [
        { hz: "猫", py: "cat", em: "🐱" }, { hz: "狗", py: "dog", em: "🐶" },
        { hz: "猪", py: "pig", em: "🐷" }, { hz: "牛", py: "cow", em: "🐮" },
        { hz: "鸭", py: "duck", em: "🦆" }, { hz: "蜜蜂", py: "bee", em: "🐝" },
        { hz: "鸟", py: "bird", em: "🐦" }, { hz: "鱼", py: "fish", em: "🐟" }
      ]},
      { id: "W2", name: "数字", tip: "数字的英文怎么说？", words: [
        { hz: "一", py: "one", em: "1️⃣" }, { hz: "二", py: "two", em: "2️⃣" },
        { hz: "四", py: "four", em: "4️⃣" }, { hz: "五", py: "five", em: "5️⃣" },
        { hz: "六", py: "six", em: "6️⃣" }, { hz: "九", py: "nine", em: "9️⃣" },
        { hz: "十", py: "ten", em: "🔟" }, { hz: "八", py: "eight", em: "8️⃣" }
      ]},
      { id: "W3", name: "水果", tip: "水果店开张啦", words: [
        { hz: "梨", py: "pear", em: "🍐" }, { hz: "李子", py: "plum", em: "🫐" },
        { hz: "苹果", py: "apple", em: "🍎" }, { hz: "桃", py: "peach", em: "🍑" },
        { hz: "葡萄", py: "grape", em: "🍇" }, { hz: "甜瓜", py: "melon", em: "🍈" },
        { hz: "柠檬", py: "lemon", em: "🍋" }, { hz: "香蕉", py: "banana", em: "🍌" }
      ]},
      { id: "W4", name: "身体", tip: "指一指，打一词", words: [
        { hz: "眼睛", py: "eye", em: "👁️" }, { hz: "耳朵", py: "ear", em: "👂" },
        { hz: "手臂", py: "arm", em: "💪" }, { hz: "腿", py: "leg", em: "🦵" },
        { hz: "手", py: "hand", em: "✋" }, { hz: "脚", py: "foot", em: "🦶" },
        { hz: "鼻子", py: "nose", em: "👃" }, { hz: "嘴巴", py: "mouth", em: "👄" }
      ]},
      { id: "W5", name: "自然天气", tip: "天空和天气", words: [
        { hz: "太阳", py: "sun", em: "☀️" }, { hz: "月亮", py: "moon", em: "🌙" },
        { hz: "星星", py: "star", em: "⭐" }, { hz: "雨", py: "rain", em: "🌧️" },
        { hz: "雪", py: "snow", em: "❄️" }, { hz: "风", py: "wind", em: "💨" },
        { hz: "树", py: "tree", em: "🌳" }, { hz: "云", py: "cloud", em: "☁️" }
      ]},
      { id: "W401", name: "四上 Unit 1 · 迎接客人", tip: "按四年级上册教材单词表顺序学习", words: englishWords([
        ["beautiful", "美丽的"], ["flower", "花"], ["glad", "高兴的"], ["seat", "座位"],
        ["fine", "很好的"], ["bathroom", "卫生间；浴室"], ["baby", "婴儿"], ["problem", "问题"],
        ["tea", "茶"], ["around", "周围"], ["great", "好极了"], ["guest", "客人"],
        ["host", "主人"], ["small", "小的"], ["gift", "礼物"]
      ], "🏠")},
      { id: "W402", name: "四上 Unit 2 · 晚餐时间", tip: "按四年级上册教材单词表顺序学习", words: englishWords([
        ["yourself", "你自己"], ["rice", "米饭"], ["soup", "汤"], ["could", "可以"],
        ["pass", "传递"], ["here", "这里"], ["house", "房子"], ["if", "如果"],
        ["feel", "感觉"], ["full", "饱的"], ["drop", "掉落"], ["spoon", "勺子"],
        ["floor", "地板"], ["pick", "捡起"], ["end", "结束"], ["really", "非常；真的"],
        ["any", "任何"], ["taste", "尝起来"]
      ], "🍚")},
      { id: "W403", name: "四上 Unit 3 · 烹饪面条", tip: "按四年级上册教材单词表顺序学习", words: englishWords([
        ["noodle", "面条"], ["enjoy", "享受"], ["then", "然后"], ["last", "最后"],
        ["minute", "分钟"], ["only", "唯一的；只有"], ["cook", "烹饪；厨师"], ["dumpling", "饺子"],
        ["into", "到……里面"], ["pot", "锅"], ["boil", "煮沸"], ["careful", "小心的"],
        ["hot", "热的"], ["cold", "冷的"], ["remember", "记得"], ["fire", "火"]
      ], "🍜")},
      { id: "W404", name: "四上 Unit 4 · 做家务", tip: "按四年级上册教材单词表顺序学习", words: englishWords([
        ["kitchen", "厨房"], ["sweep", "清扫"], ["dish", "盘子；菜肴"], ["rubbish", "垃圾"],
        ["clear", "清理；清楚的"], ["chore", "家务"], ["dirty", "脏的"], ["well", "啊；健康的；好"],
        ["bin", "箱子"], ["because", "因为"], ["do", "做"], ["agree", "同意"]
      ], "🧹")},
      { id: "W405", name: "四上 Unit 5 · 帮助朋友", tip: "按四年级上册教材单词表顺序学习", words: englishWords([
        ["smile", "微笑"], ["open", "开着的；打开"], ["cheer", "鼓励"], ["ready", "准备好的"],
        ["kind", "友善的"], ["lot", "许多"], ["happy", "开心的"], ["share", "分享"],
        ["hard", "努力地"], ["animal", "动物"], ["tell", "告诉"], ["else", "其他的"], ["him", "他"]
      ], "🤝")},
      { id: "W406", name: "四上 Unit 6 · 生日聚会", tip: "按四年级上册教材单词表顺序学习", words: englishWords([
        ["birthday", "生日"], ["cake", "蛋糕"], ["spend", "度过"], ["sweet", "体贴的；甜的"],
        ["laugh", "笑"], ["all", "全部的"], ["surprise", "使惊奇；惊喜"], ["funny", "有趣的"],
        ["story", "故事"], ["picture", "画；照片"], ["grandpa", "爷爷；外公"], ["uncle", "叔叔；舅舅"],
        ["aunt", "姑妈；姨妈"], ["sister", "姐姐；妹妹"], ["leave", "留下；离开"], ["note", "便条；笔记"],
        ["sing", "唱歌"], ["song", "歌曲"], ["warm", "温暖的"], ["who", "谁"], ["date", "日期"]
      ], "🎂")},
      { id: "W407", name: "四上 Unit 7 · 职业与作息", tip: "按四年级上册教材单词表顺序学习", words: englishWords([
        ["worker", "工人"], ["doctor", "医生"], ["driver", "司机"], ["evening", "晚上"],
        ["nurse", "护士"], ["farmer", "农民"], ["scientist", "科学家"], ["policeman", "男警察"],
        ["policewoman", "女警察"], ["afternoon", "下午"], ["night", "夜晚"], ["long", "长的"],
        ["game", "游戏"], ["sound", "听起来"], ["dear", "亲爱的"], ["once", "一次"], ["weekend", "周末"]
      ], "👩‍⚕️")},
      { id: "W408", name: "四上 Unit 8 · 节日活动", tip: "按四年级上册教材单词表顺序学习", words: englishWords([
        ["firework", "烟花"], ["mooncake", "月饼"], ["visit", "拜访"], ["meal", "一餐"],
        ["favourite", "最喜欢的"], ["festival", "节日"], ["far", "远的"], ["near", "近的；附近的"],
        ["sit", "坐"], ["wish", "愿望；祝愿"], ["back", "以前；后面的"], ["through", "穿过"],
        ["forward", "向前"], ["part", "部分"], ["hope", "希望"], ["during", "在……期间"],
        ["tree", "树"], ["never", "永不"], ["old", "老的"], ["dance", "跳舞"]
      ], "🎆")}
    ]
  }

];
