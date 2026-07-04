// ============================================================
// GameConfig.js — 集中配置层（数据驱动）
// ============================================================
// 所有魔数、规则阈值、动画时长在此统一管理。
// 修改游戏平衡性 / 动画速度时只需改此文件。

export const GAME_CONFIG = {
  // ---------- 玩家 ----------
  playerCount: 2,

  // ---------- 胜利条件 ----------
  winScore: 200,

  // ---------- 牌组配置 ----------
  deck: {
    // 数字卡：value=0 只有 1 张，value=N 有 N 张
    numberMax: 12,

    // 特殊卡（固定各 1 张）
    specials: [
      { value: '+2', effect: 2 },
      { value: '+4', effect: 4 },
      { value: '+6', effect: 6 },
      { value: '+8', effect: 8 },
      { value: '+10', effect: 10 },
      { value: 'x2', effect: 'double' }
    ],

    // 行动牌
    actions: {
      freeze: { count: 3, value: 'freeze', effect: 'freeze' },
      flipthree: { count: 3, value: 'flipthree', effect: 'flipthree' }
    },

    // 功能牌
    revives: { count: 3, value: 'revive', effect: 'revive' }
  },

  // ---------- 规则阈值 ----------
  rules: {
    flipSevenThreshold: 7,        // 数字卡 ≥ 7 触发七连翻
    flipSevenBonus: 15,           // 七连翻额外奖励分
    flipThreeCount: 3,            // 翻三张每次发牌数
    maxPlayers: 4
  },

  // ---------- 动画时长（秒）— 当前 ×0.5 测试速度 ----------
  animation: {
    flipToFront: 0.25,           // 翻牌翻转
    cardPop: 0.1,                // 弹出效果
    flipCallback: 0.35,          // 翻牌总回调
    flyTransition: 0.175,        // 飞行到手牌
    flyImplode: 0.125,           // 缩放消失
    flyCallback: 0.35,           // 飞牌总回调
    bustFlash: 0.25,             // Bust 红闪
    bustText: 0.6,               // Bust 文字
    bustShake: 0.25,             // Bust 震动
    roundNotify: 1.0,            // 回合通知
    winScale: 0.3,               // 胜利缩放
    winGlow: 1.0,                // 胜利发光
    flip7Text: 0.3,              // Flip 7 文字
    flip7TextHide: 0.2,          // Flip 7 文字消失延迟
    flip7TextHideDelay: 0.75,    // Flip 7 文字消失延迟
    toast: 1.0,                  // Toast 显示
    roundNotifyRemove: 1.1,      // 回合通知 DOM 移除
    bustOverlayRemove: 0.25,     // Bust 遮罩移除
    bustTextRemove: 0.6,         // Bust 文字移除
    flip7OverlayRemove: 1.25,    // Flip 7 遮罩移除
    confettiRemove: 1.5,         // 彩纸移除
    flipToFlyDelay: 0.25,        // 翻牌 → 飞行延迟
    flip7ToSettleDelay: 0.5,     // Flip 7 → 结算延迟
    winResultDelay: 0.25,        // 胜利弹窗延迟
    endRoundNotifyDelay: 0.75    // 回合结束 → 新回合通知延迟
  }
};

// ---------- 卡牌图片映射 ----------
export const CARD_IMAGES = {
  // 数字卡
  'number-0':  'assets/images/card_0.png',
  'number-1':  'assets/images/card_1.png',
  'number-2':  'assets/images/card_2.png',
  'number-3':  'assets/images/card_3.png',
  'number-4':  'assets/images/card_4.png',
  'number-5':  'assets/images/card_5.png',
  'number-6':  'assets/images/card_6.png',
  'number-7':  'assets/images/card_7.png',
  'number-8':  'assets/images/card_8.png',
  'number-9':  'assets/images/card_9.png',
  'number-10': 'assets/images/card_10.png',
  'number-11': 'assets/images/card_11.png',
  'number-12': 'assets/images/card_12.png',
  // 特殊卡
  '+2':  'assets/images/card_plus_2.png',
  '+4':  'assets/images/card_plus_4.png',
  '+6':  'assets/images/card_plus_6.png',
  '+8':  'assets/images/card_plus_8.png',
  '+10': 'assets/images/card_plus_10.png',
  'x2':  'assets/images/card_times_2.png',
  // 行动卡
  'freeze':    'assets/images/card_freeze.png',
  'flipthree': 'assets/images/card_flip_three.png',
  // 功能卡
  'revive':    'assets/images/card_revive.png'
};

// ---------- 边界约束（防御性编程用） ----------
export const BOUNDS = {
  minPlayerIdx: 0,
  get maxPlayerIdx() { return GAME_CONFIG.playerCount - 1; },
  minCardValue: 0,
  maxCardValue: 12,
  minHandSize: 0,
  maxHandSize: 12 // 数字卡 0~12 共 13 种，但 0 只有 1 张
};
