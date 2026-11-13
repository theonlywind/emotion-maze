// 引擎層：素材載入、音效、輸入、迷宮、玩家、情緒角色、單局狀態
// 全部用 classic script（唔用 ES module），令 file:// 直接開都跑得到。

const TILE = 24;                    // 每格邏輯像素
const PLAYER_SPEED = 5.625 * TILE;  // 5.625 格/秒（沿用 Godot 版 90px/s @ 16px tile）
const SPRITE_DRAW = TILE * 1.45;    // sprite 畫幾大
const ANIM_FPS = 8;

const PLAYER_COLORS = ['#ffd93d', '#4dd6ff', '#ff8fc7', '#9dff8f'];

// ---------------------------------------------------------------------------
// 素材
// ---------------------------------------------------------------------------

const Assets = {
  images: {},
  _pending: 0,

  load(onDone) {
    const list = [];
    const states = { scatter: 2, chase: 2, vulnerable: 2, caught_gentle: 4, resting: 2 };
    for (const c of GAME_DATA.characters) {
      for (const [state, count] of Object.entries(states)) {
        for (let i = 1; i <= count; i++) {
          list.push([`${c.id}_${state}_${String(i).padStart(2, '0')}`,
            `assets/sprites/emotion_characters/${c.id}_${state}_${String(i).padStart(2, '0')}.png`]);
        }
      }
    }
    for (const anim of ['idle', 'move_up', 'move_down', 'move_left', 'move_right']) {
      for (let i = 1; i <= 4; i++) {
        list.push([`player_${anim}_${String(i).padStart(2, '0')}`,
          `assets/sprites/player/player_${anim}_${String(i).padStart(2, '0')}.png`]);
      }
    }

    this._pending = list.length;
    if (this._pending === 0) { onDone(); return; }
    for (const [key, src] of list) {
      const img = new Image();
      img.onload = img.onerror = () => { if (--this._pending === 0) onDone(); };
      img.src = src;
      this.images[key] = img;
    }
  },

  // 逐格動畫：frames 係 1-based 檔案編號陣列
  frame(prefix, frames, timeSec) {
    const idx = frames[Math.floor(timeSec * ANIM_FPS) % frames.length];
    return this.images[`${prefix}_${String(idx).padStart(2, '0')}`];
  }
};

// ---------------------------------------------------------------------------
// 音效：用 WebAudio 即時合成柔和 chiptune，唔需要外部音檔
// child-mh-consultant 條件：唔用刺耳/驚嚇音效，全部限低音量、柔和波形
// ---------------------------------------------------------------------------

const Sfx = {
  ctx: null,
  enabled: true,

  _ensure() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return null; }
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },

  // notes: [[頻率, 開始秒, 長度秒], ...]
  _play(notes, { type = 'triangle', gain = 0.12 } = {}) {
    const ctx = this._ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const [freq, start, dur] of notes) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      env.gain.setValueAtTime(0, now + start);
      env.gain.linearRampToValueAtTime(gain, now + start + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(env).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.05);
    }
  },

  tokenPickup() { this._play([[880, 0, 0.08]], { gain: 0.05 }); },
  powerPickup() { this._play([[523, 0, 0.1], [659, 0.08, 0.1], [784, 0.16, 0.2]], { gain: 0.09 }); },
  pursuitMode() { this._play([[392, 0, 0.5], [494, 0, 0.5]], { type: 'sine', gain: 0.06 }); },
  calmSuccess() { this._play([[784, 0, 0.15], [659, 0.12, 0.15], [523, 0.24, 0.35]], { type: 'sine', gain: 0.1 }); },
  playerCaught() { this._play([[330, 0, 0.18], [262, 0.14, 0.25]], { type: 'sine', gain: 0.07 }); },
  timeWarning() { this._play([[587, 0, 0.2], [587, 0.28, 0.3]], { type: 'sine', gain: 0.07 }); },
  levelClear() { this._play([[523, 0, 0.14], [659, 0.13, 0.14], [784, 0.26, 0.14], [1047, 0.39, 0.4]], { gain: 0.1 }); },
  uiConfirm() { this._play([[660, 0, 0.07]], { gain: 0.05 }); }
};

// ---------------------------------------------------------------------------
// 輸入：鍵盤 + Gamepad API（最多 4 人，支援 hot-plug）
// ---------------------------------------------------------------------------

const Input = {
  keys: {},
  _confirmEdge: false,
  _pads: [null, null, null, null],   // slot -> gamepad index
  _prevConfirm: [false, false, false, false],
  _prevBack: [false, false, false, false],
  onPlayerJoined: null,
  onPlayerLeft: null,

  init(canvas) {
    addEventListener('keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    addEventListener('blur', () => { this.keys = {}; });

    addEventListener('gamepadconnected', (e) => this._assign(e.gamepad.index));
    addEventListener('gamepaddisconnected', (e) => this._remove(e.gamepad.index));

    this._initTouch(canvas);
    // 攤位有時淨係得 mouse／trackpad，撳一下畫面等於撳確認掣
    canvas.addEventListener('mousedown', () => { this._keyConfirmEdge = true; });
  },

  // 觸控螢幕攤位：喺畫面上掃一下控制 P1
  _initTouch(canvas) {
    let sx = 0, sy = 0;
    canvas.addEventListener('touchstart', (e) => {
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
      this._touchConfirm = true;
    }, { passive: true });
    canvas.addEventListener('touchend', (e) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.hypot(dx, dy) < 24) return;
      this._touchDir = Math.abs(dx) > Math.abs(dy)
        ? { x: Math.sign(dx), y: 0 }
        : { x: 0, y: Math.sign(dy) };
    }, { passive: true });
  },
  _touchDir: null,
  _touchConfirm: false,

  _assign(padIndex) {
    if (this._pads.includes(padIndex)) return;
    const slot = this._pads.indexOf(null);
    if (slot === -1 || slot >= GAME_DATA.config.max_players) return;
    this._pads[slot] = padIndex;
    if (this.onPlayerJoined) this.onPlayerJoined(slot);
  },

  _remove(padIndex) {
    const slot = this._pads.indexOf(padIndex);
    if (slot === -1) return;
    this._pads[slot] = null;
    if (this.onPlayerLeft) this.onPlayerLeft(slot);
  },

  _pad(slot) {
    const idx = this._pads[slot];
    if (idx === null) return null;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    return pads[idx] || null;
  },

  activePlayerCount() {
    const n = this._pads.filter((p) => p !== null).length;
    return n;
  },

  isSlotConnected(slot) { return this._pads[slot] !== null; },

  // 手掣型號名（Switch 式手掣畫面顯示用），太長就截短
  padName(slot) {
    const pad = this._pad(slot);
    if (!pad) return '';
    return String(pad.id).replace(/\s*\([^)]*\)\s*/g, ' ').trim().slice(0, 22) || 'Gamepad';
  },

  // 而家有冇郁緊呢隻手掣：俾志工撳一下就認到邊隻手掣係邊個玩家
  padActivity(slot) {
    const pad = this._pad(slot);
    if (!pad) return false;
    if (pad.buttons.some((b) => b.pressed)) return true;
    return pad.axes.some((a) => Math.abs(a) > 0.35);
  },

  // 每 frame 掃描一次，補捉未經 event 通知嘅手掣（部分瀏覽器要先撳掣先報 connected）
  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < pads.length; i++) {
      if (pads[i] && pads[i].connected) this._assign(i);
    }
    for (const slot of [0, 1, 2, 3]) {
      const idx = this._pads[slot];
      if (idx !== null && (!pads[idx] || !pads[idx].connected)) this._remove(idx);
    }
  },

  moveVector(slot) {
    const pad = this._pad(slot);
    let x = 0, y = 0;
    if (pad) {
      const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      if (Math.hypot(ax, ay) >= 0.35) { x = ax; y = ay; }
      if (pad.buttons[12] && pad.buttons[12].pressed) y = -1;
      else if (pad.buttons[13] && pad.buttons[13].pressed) y = 1;
      if (pad.buttons[14] && pad.buttons[14].pressed) x = -1;
      else if (pad.buttons[15] && pad.buttons[15].pressed) x = 1;
    }
    if (slot === 0 && x === 0 && y === 0) {
      const k = this.keys;
      if (k['arrowleft'] || k['a']) x = -1;
      else if (k['arrowright'] || k['d']) x = 1;
      if (k['arrowup'] || k['w']) y = -1;
      else if (k['arrowdown'] || k['s']) y = 1;
      if (x === 0 && y === 0 && this._touchDir) {
        const d = this._touchDir; this._touchDir = null;
        return d;
      }
    }
    return { x, y };
  },

  // 任何一個玩家（或鍵盤）撳落確認掣嗰一 frame
  confirmJustPressed() {
    let pressed = false;
    for (const slot of [0, 1, 2, 3]) {
      const pad = this._pad(slot);
      const down = !!(pad && pad.buttons[0] && pad.buttons[0].pressed);
      if (down && !this._prevConfirm[slot]) pressed = true;
      this._prevConfirm[slot] = down;
    }
    if (this._keyConfirmEdge) { pressed = true; this._keyConfirmEdge = false; }
    if (this._touchConfirm) { pressed = true; this._touchConfirm = false; }
    return pressed;
  },
  _keyConfirmEdge: false,

  // 兩隻或以上手掣同時撳住 Back/Select（志工設定入口）
  backHeldCount() {
    let n = 0;
    for (const slot of [0, 1, 2, 3]) {
      const pad = this._pad(slot);
      if (pad && pad.buttons[8] && pad.buttons[8].pressed) n++;
    }
    return n;
  }
};

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key === 'Enter' || e.key === ' ') Input._keyConfirmEdge = true;
});

// ---------------------------------------------------------------------------
// 迷宮
// ---------------------------------------------------------------------------

const Maze = {
  width: 0, height: 0,
  walls: null,            // Set of "x,y"
  tokens: null,           // Set of "x,y"，收集後移除
  pellets: null,
  totalTokens: 0,
  tunnelRow: -1,
  ghostHouse: null,
  homeGrid: null,

  reset() {
    const L = GAME_DATA.level;
    this.width = L.grid_width;
    this.height = L.grid_height;
    this.tunnelRow = L.tunnel_row;
    this.ghostHouse = L.ghost_house.rect;
    this.homeGrid = L.ghost_house.home_position_grid;
    this.walls = new Set();
    this.tokens = new Set();
    this.pellets = new Set();

    L.grid.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const key = `${x},${y}`;
        if (row[x] === '#') this.walls.add(key);
        else if (row[x] === '.') this.tokens.add(key);
        else if (row[x] === 'o') this.pellets.add(key);
      }
    });
    this.totalTokens = this.tokens.size;
  },

  isWall(gx, gy) {
    if (gy === this.tunnelRow && (gx < 0 || gx >= this.width)) return false; // 隧道出口
    if (gx < 0 || gy < 0 || gx >= this.width || gy >= this.height) return true;
    return this.walls.has(`${gx},${gy}`);
  },

  requiredTokens() {
    return Math.round(this.totalTokens * GAME_DATA.level.completion_token_percent);
  },

  centerOf(gx, gy) {
    return { x: (gx + 0.5) * TILE, y: (gy + 0.5) * TILE };
  },

  gridOf(px, py) {
    return { gx: Math.floor(px / TILE), gy: Math.floor(py / TILE) };
  }
};

// ---------------------------------------------------------------------------
// 格心移動基底：所有角色都喺格心先決定下一步，避免斜行/穿牆
// ---------------------------------------------------------------------------

class GridMover {
  constructor(gx, gy) {
    const c = Maze.centerOf(gx, gy);
    this.x = c.x; this.y = c.y;
    this.dir = { x: 0, y: 0 };
    this.tx = c.x; this.ty = c.y;
    this.moving = false;
    this.speed = PLAYER_SPEED;
  }

  get grid() { return Maze.gridOf(this.x, this.y); }

  canMove(dir) {
    const g = this.grid;
    return !Maze.isWall(g.gx + dir.x, g.gy + dir.y);
  }

  commit(dir) {
    this.dir = dir;
    const g = this.grid;
    const c = Maze.centerOf(g.gx + dir.x, g.gy + dir.y);
    this.tx = c.x; this.ty = c.y;
    this.moving = true;
  }

  // 行剩落嘅距離會帶去下一格，唔會因為 frame 邊界而扣速
  step(dt) {
    let remaining = this.speed * dt;
    let guard = 0;
    while (remaining > 0 && guard++ < 8) {
      if (!this.moving) {
        this.decide();
        if (!this.moving) break;
      }
      const dx = this.tx - this.x, dy = this.ty - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= remaining) {
        this.x = this.tx; this.y = this.ty;
        remaining -= dist;
        this.moving = false;
        this._wrapTunnel();
        this.onArrive();
      } else {
        this.x += (dx / dist) * remaining;
        this.y += (dy / dist) * remaining;
        remaining = 0;
      }
    }
  }

  _wrapTunnel() {
    const g = this.grid;
    if (g.gy !== Maze.tunnelRow) return;
    if (g.gx < 0) {
      const c = Maze.centerOf(Maze.width - 1, Maze.tunnelRow);
      this.x = c.x; this.y = c.y; this.tx = c.x; this.ty = c.y;
    } else if (g.gx >= Maze.width) {
      const c = Maze.centerOf(0, Maze.tunnelRow);
      this.x = c.x; this.y = c.y; this.tx = c.x; this.ty = c.y;
    }
  }

  // 喺格心可以行嘅方向；exclude_reverse = 唔准即時 180 度掉頭（除非死路）
  availableDirs(excludeReverse) {
    const dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
    const out = dirs.filter((d) => {
      if (excludeReverse && (this.dir.x || this.dir.y) && d.x === -this.dir.x && d.y === -this.dir.y) return false;
      return this.canMove(d);
    });
    if (out.length === 0 && (this.dir.x || this.dir.y)) {
      const rev = { x: -this.dir.x, y: -this.dir.y };
      if (this.canMove(rev)) out.push(rev);
    }
    return out;
  }

  chooseTowards(targetX, targetY, excludeReverse) {
    const options = this.availableDirs(excludeReverse);
    if (options.length === 0) return;
    let best = options[0], bestDist = Infinity;
    for (const d of options) {
      const nx = this.x + d.x * TILE, ny = this.y + d.y * TILE;
      const dist = Math.hypot(targetX - nx, targetY - ny);
      if (dist < bestDist) { bestDist = dist; best = d; }
    }
    this.commit(best);
  }

  decide() {}
  onArrive() {}
}

// ---------------------------------------------------------------------------
// 玩家
// ---------------------------------------------------------------------------

class Player extends GridMover {
  constructor(slot, gx, gy) {
    super(gx, gy);
    this.slot = slot;
    this.queued = { x: 0, y: 0 };
    this.connected = true;
    this.gentlyResetTimer = 0;   // > 0 代表喺溫和重置嘅保護窗口
    this.animTime = 0;
    this.nearEmotion = false;    // GDD 9.1.4a：貼近情緒角色時鎖住大張口幀

    // 安心值：被情緒角色掂到會跌一格，唔郁佢會自己回，跌到零都唔會死
    this.calm = GAME_DATA.config.calm_max;
    this.calmRecoverTimer = GAME_DATA.config.calm_recover_seconds;
    this.breathing = false;
    this.breathTimer = 0;
    this.justRecovered = 0;      // > 0 代表啱啱回滿，俾 UI 出一句肯定說話
  }

  update(dt) {
    if (!this.connected) return;
    this.animTime += dt;
    if (this.gentlyResetTimer > 0) this.gentlyResetTimer -= dt;
    if (this.justRecovered > 0) this.justRecovered -= dt;
    this.updateCalm(dt);

    const v = Input.moveVector(this.slot);
    if (v.x || v.y) {
      this.queued = Math.abs(v.x) > Math.abs(v.y)
        ? { x: Math.sign(v.x), y: 0 }
        : { x: 0, y: Math.sign(v.y) };
    }
    this.step(dt);
  }

  decide() {
    // 轉彎緩衝：提前撳嘅方向一到格心即刻生效
    if ((this.queued.x || this.queued.y) && this.canMove(this.queued)) {
      this.commit(this.queued);
    } else if ((this.dir.x || this.dir.y) && this.canMove(this.dir)) {
      this.commit(this.dir);
    }
  }

  onArrive() {
    if (this.onCellReached) this.onCellReached(this);
  }

  isProtected() { return this.gentlyResetTimer > 0; }

  // 安心值自動回復；跌到零嗰陣係一段深呼吸時間，完咗直接回滿，冇任何懲罰
  updateCalm(dt) {
    const cfg = GAME_DATA.config;
    if (this.breathing) {
      this.breathTimer -= dt;
      if (this.breathTimer <= 0) {
        this.breathing = false;
        this.calm = cfg.calm_max;
        this.calmRecoverTimer = cfg.calm_recover_seconds;
        this.justRecovered = 2.0;
      }
      return;
    }
    if (this.calm >= cfg.calm_max) return;
    this.calmRecoverTimer -= dt;
    if (this.calmRecoverTimer <= 0) {
      this.calm++;
      this.calmRecoverTimer = cfg.calm_recover_seconds;
      if (this.calm >= cfg.calm_max) this.justRecovered = 2.0;
    }
  }

  // 被未進入安撫模式嘅情緒角色掂到：唔死亡、唔扣命、唔踢返起點，
  // 只係安心值跌一格 + 一段短嘅保護時間。跌到零就轉做較長嘅深呼吸，完咗回滿。
  gentlyReset() {
    if (this.isProtected()) return false;
    const cfg = GAME_DATA.config;
    this.calm = Math.max(0, this.calm - 1);
    this.calmRecoverTimer = cfg.calm_recover_seconds;
    if (this.calm === 0) {
      this.breathing = true;
      this.breathTimer = cfg.breath_recover_seconds;
      this.gentlyResetTimer = cfg.breath_recover_seconds;   // 保護窗口跟住拉長，唔會連環被追到
    } else {
      this.gentlyResetTimer = 1.5;
    }
    return true;
  }

  sprite() {
    let anim = 'player_idle';
    if (this.moving) {
      if (this.dir.x > 0) anim = 'player_move_right';
      else if (this.dir.x < 0) anim = 'player_move_left';
      else if (this.dir.y > 0) anim = 'player_move_down';
      else if (this.dir.y < 0) anim = 'player_move_up';
    }
    // 貼近／面向／重疊情緒角色時，只准用閉口(01)同細張口(02/04)幀，
    // 唔可以播最大張口嘅 03 幀 —— GDD 9.1.4a CRITICAL 構圖規則
    const frames = this.nearEmotion ? [1, 2, 4] : [1, 2, 3, 4];
    return Assets.frame(anim, frames, this.animTime);
  }
}

// ---------------------------------------------------------------------------
// 情緒角色
// 狀態機：SCATTER -> CHASE -> VULNERABLE -> CAUGHT -> RESTING -> CHASE
// ---------------------------------------------------------------------------

const CharState = { SCATTER: 'scatter', CHASE: 'chase', VULNERABLE: 'vulnerable', CAUGHT: 'caught_gentle', RESTING: 'resting' };

class EmotionCharacter extends GridMover {
  constructor(data, gx, gy) {
    super(gx, gy);
    this.id = data.id;
    this.nameZh = data.name_zh;
    this.behavior = data.chase_behavior;
    this.caughtLine = data.caught_line_zh;
    this.baseSpeed = PLAYER_SPEED * data.base_speed_mult;
    this.scatterTarget = this._cornerWorld(data.scatter_corner);
    this.home = Maze.centerOf(Maze.homeGrid.x, Maze.homeGrid.y);
    this.state = CharState.SCATTER;
    this.stateTimer = 5;
    this.animTime = 0;
    this.decisionTick = 0;
    this.orbitAngle = 0;
    this.targetPlayer = null;
  }

  _cornerWorld(name) {
    const w = Maze.width, h = Maze.height;
    const map = {
      top_left: [1, 1], top_right: [w - 2, 1],
      bottom_left: [1, h - 2], bottom_right: [w - 2, h - 2]
    };
    const [gx, gy] = map[name] || [1, 1];
    return Maze.centerOf(gx, gy);
  }

  get isVulnerable() { return this.state === CharState.VULNERABLE; }
  get isActiveChaser() { return this.state === CharState.SCATTER || this.state === CharState.CHASE; }

  currentSpeed() {
    // 全程唔會突然加速（child-mh-consultant 條件：唔用 jump-scare 式追近）
    return this.state === CharState.VULNERABLE ? this.baseSpeed * 0.6 : this.baseSpeed;
  }

  update(dt, players) {
    this.animTime += dt;
    this.players = players;
    this.speed = this.currentSpeed();

    switch (this.state) {
      case CharState.SCATTER:
        this.step(dt);
        if ((this.stateTimer -= dt) <= 0) this.enter(CharState.CHASE);
        break;
      case CharState.CHASE:
        this.step(dt);
        break;
      case CharState.VULNERABLE:
        this.step(dt);
        if ((this.stateTimer -= dt) <= 0) this.enter(CharState.CHASE);
        break;
      case CharState.CAUGHT:
        // 溫暖光圈動畫期間唔郁，時間到就返情緒屋休息
        if ((this.stateTimer -= dt) <= 0) this.enter(CharState.RESTING);
        break;
      case CharState.RESTING:
        this.step(dt);
        if ((this.stateTimer -= dt) <= 0) this.enter(CharState.CHASE);
        break;
    }
  }

  enter(state) {
    this.state = state;
    if (state === CharState.SCATTER) this.stateTimer = 5;
    else if (state === CharState.VULNERABLE) this.stateTimer = GAME_DATA.sharedRules.vulnerable_duration_seconds;
    else if (state === CharState.CAUGHT) {
      this.stateTimer = 1.2;
      this.moving = false;
      this.dir = { x: 0, y: 0 };
    } else if (state === CharState.RESTING) this.stateTimer = GAME_DATA.sharedRules.resting_duration_seconds;
  }

  enterVulnerable() {
    if (this.state === CharState.CAUGHT || this.state === CharState.RESTING) return;
    this.enter(CharState.VULNERABLE);
  }

  nearestPlayer() {
    let best = null, bestDist = Infinity;
    for (const p of this.players || []) {
      const d = Math.hypot(p.x - this.x, p.y - this.y);
      if (d < bestDist) { bestDist = d; best = p; }
    }
    return best;
  }

  decide() {
    if (this.state === CharState.SCATTER) {
      this.chooseTowards(this.scatterTarget.x, this.scatterTarget.y, true);
      return;
    }
    if (this.state === CharState.RESTING) {
      this.chooseTowards(this.home.x, this.home.y, true);
      return;
    }
    const player = this.nearestPlayer();
    if (!player) return;

    if (this.state === CharState.VULNERABLE) {
      // 安撫模式：慢落嚟同時遠離玩家，行為可預期，等小朋友追得到
      const away = { x: this.x - player.x, y: this.y - player.y };
      const len = Math.hypot(away.x, away.y) || 1;
      this.chooseTowards(this.x + (away.x / len) * TILE * 4, this.y + (away.y / len) * TILE * 4, true);
      return;
    }

    switch (this.behavior) {
      case 'slow_follow': {
        // 藍藍：兩格先重新決策一次，令佢慢慢跟唔會咬到實
        this.decisionTick++;
        const options = this.availableDirs(true);
        const keep = options.find((d) => d.x === this.dir.x && d.y === this.dir.y);
        if (this.decisionTick % 2 !== 0 && keep) this.commit(keep);
        else this.chooseTowards(player.x, player.y, true);
        break;
      }
      case 'erratic_but_gentle': {
        // 驚驚：七成追、三成隨機，忽遠忽近但唔會突然衝刺
        if (Math.random() < 0.7) this.chooseTowards(player.x, player.y, true);
        else {
          const options = this.availableDirs(true);
          if (options.length) this.commit(options[Math.floor(Math.random() * options.length)]);
        }
        break;
      }
      case 'orbit_player': {
        // 擔心蟲：喺玩家周圍團團轉，唔直衝
        this.orbitAngle = (this.orbitAngle + 0.6) % (Math.PI * 2);
        const r = TILE * 3;
        this.chooseTowards(player.x + Math.cos(this.orbitAngle) * r, player.y + Math.sin(this.orbitAngle) * r, true);
        break;
      }
      default:
        this.chooseTowards(player.x, player.y, true);
    }
  }

  sprite() {
    const counts = { scatter: 2, chase: 2, vulnerable: 2, caught_gentle: 4, resting: 2 };
    const n = counts[this.state] || 2;
    const frames = Array.from({ length: n }, (_, i) => i + 1);
    return Assets.frame(`${this.id}_${this.state}`, frames, this.animTime);
  }
}

// ---------------------------------------------------------------------------
// 單局狀態：倒數、團隊共用進度、個人分數
// ---------------------------------------------------------------------------

class Session {
  constructor() {
    this.timeLeft = GAME_DATA.config.session_duration_seconds;
    this.running = true;
    this.tokensCollected = 0;
    this.charactersSoothed = 0;
    this.scores = [0, 0, 0, 0];
    this.warningFired = false;
    this.baseRequired = Maze.requiredTokens();
    this.requiredTokens = this.baseRequired;
    this.requiredSoothed = GAME_DATA.characters.length;
    this.teamWon = false;
    this.recalcRequired();
  }

  // 人數越多門檻按比例提高（鼓勵協作），但唔會低過單人基礎門檻
  recalcRequired() {
    const active = Math.max(Input.activePlayerCount(), 1);
    this.requiredTokens = Math.max(this.baseRequired, Math.round(this.baseRequired * (0.6 + 0.2 * active)));
  }

  update(dt) {
    if (!this.running) return;
    this.timeLeft = Math.max(this.timeLeft - dt, 0);
    if (this.timeLeft <= 10 && !this.warningFired) {
      this.warningFired = true;
      if (this.onTimeLowWarning) this.onTimeLowWarning();
    }
    if (this.timeLeft <= 0) this.end(false);
  }

  onToken(slot) {
    this.tokensCollected++;
    this.scores[slot]++;
    this.checkWin();
  }

  onSoothed(slot) {
    this.charactersSoothed++;
    this.scores[slot] += 5;   // 安撫比收集代幣分數高，鼓勵主動安撫互動
    this.checkWin();
  }

  checkWin() {
    if (this.tokensCollected >= this.requiredTokens && this.charactersSoothed >= this.requiredSoothed) {
      this.end(true);
    }
  }

  end(teamWon) {
    if (!this.running) return;
    this.running = false;
    this.teamWon = teamWon;
    if (this.onCompleted) this.onCompleted(teamWon);
  }

  topSlot() {
    let best = -1, bestScore = -1;
    for (let s = 0; s < 4; s++) {
      if (this.scores[s] > bestScore) { bestScore = this.scores[s]; best = s; }
    }
    return best;
  }
}

// ---------------------------------------------------------------------------
// 全日高分榜（localStorage，跨日自動重置）
// ---------------------------------------------------------------------------

const NAME_LENGTH = 5;
const NAME_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';   // 只准英文字母同數字

// 用部機本地時區嘅日期（例如香港時間），唔好用 toISOString()：
// 嗰個係 UTC 日期，香港早上 8 點先轉日，攤位一早開機玩過嘅分數會喺 8 點後重開時被清走
function localDateKey(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const HighScores = {
  KEY: 'emotion_maze_high_scores',
  MAX: 10,
  entries: [],

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const today = localDateKey();
      this.entries = (parsed && parsed.date === today && Array.isArray(parsed.entries)) ? parsed.entries : [];
    } catch (e) {
      this.entries = [];
    }
  },

  save() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify({
        date: localDateKey(),
        entries: this.entries
      }));
    } catch (e) { /* 私隱模式下寫唔到就當今日唔記錄，唔影響遊玩 */ }
  },

  qualifies(score) {
    if (score <= 0) return false;
    if (this.entries.length < this.MAX) return true;
    return score > this.entries[this.entries.length - 1].score;
  },

  submit(name, score) {
    const clean = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, NAME_LENGTH);
    this.entries.push({ name: clean || 'PLAYER'.slice(0, NAME_LENGTH), score });
    this.entries.sort((a, b) => b.score - a.score);
    this.entries = this.entries.slice(0, this.MAX);
    this.save();
  },

  reset() { this.entries = []; this.save(); }
};
