// 畫面流程狀態機 + 主迴圈
// ATTRACT -> PRE_INFO(≤6s) -> PLAYING -> END(3s) -> POST_INFO(≤12s) -> [HIGHSCORE] -> ATTRACT
// 流程同秒數依據 GDD 6.1.1（child-mh-consultant 拍板）

const Flow = {
  ATTRACT: 'ATTRACT', PRE_INFO: 'PRE_INFO', PLAYING: 'PLAYING',
  END: 'END', POST_INFO: 'POST_INFO', HIGHSCORE: 'HIGHSCORE'
};

const ATTRACT_ROTATE = 15;
const ATTRACT_IDLE_RESET = 30;   // 手動揀咗版面之後，冇人郁幾耐就返輪播
const PRE_INFO_SECONDS = 6;
const END_SECONDS = 3;
const POST_INFO_SECONDS = 12;
const POST_INFO_LOCKOUT = 2;   // 只適用於 POST_INFO，PRE_INFO 一定唔可以有 lock-out
const POST_INFO_LINE_SECONDS = 3;

// ---------------------------------------------------------------------------
// 一局遊戲
// ---------------------------------------------------------------------------

class Game {
  constructor() {
    Maze.reset();
    this.session = new Session();
    this.players = [];
    this.characters = [];
    this.time = 0;

    for (let slot = 0; slot < 4; slot++) {
      if (Input.isSlotConnected(slot)) this.addPlayer(slot);
    }
    if (this.players.length === 0) this.addPlayer(0);   // 零手掣時用鍵盤開一個玩家

    GAME_DATA.characters.forEach((data, i) => {
      const spawn = GAME_DATA.level.character_spawn_grid[i % GAME_DATA.level.character_spawn_grid.length];
      this.characters.push(new EmotionCharacter(data, spawn.x, spawn.y));
    });

    this.session.onTimeLowWarning = () => { UI.showTimeWarning(); Sfx.timeWarning(); };
  }

  addPlayer(slot) {
    if (this.players.some((p) => p.slot === slot)) return;
    const spawn = GAME_DATA.level.player_spawn_points_grid.find((s) => s.player_slot === slot)
      || GAME_DATA.level.player_spawn_points_grid[0];
    const p = new Player(slot, spawn.x, spawn.y);
    this.players.push(p);
    this.session.recalcRequired();
  }

  // 手掣斷線唔可以移除玩家（會重置佢個人分數同位置），淨係暫停輸入 + 半透明顯示
  setPlayerConnected(slot, connected) {
    const p = this.players.find((x) => x.slot === slot);
    if (p) p.connected = connected;
    this.session.recalcRequired();
  }

  update(dt) {
    this.time += dt;
    this.session.update(dt);
    for (const p of this.players) p.update(dt);
    for (const c of this.characters) c.update(dt, this.players.filter((p) => p.connected));

    this.collectTokens();
    this.resolveContacts();
    this.updateChompRule();
    this.announceRecoveries();
    Render.updateBubbles(dt);
  }

  // 安心值回滿嗰陣講一句肯定說話，令「平復返」呢件事有正面回饋，唔止係一格燈著返
  announceRecoveries() {
    for (const p of this.players) {
      if (p.justRecovered > 0 && !p._recoveryAnnounced) {
        p._recoveryAnnounced = true;
        UI.showGentleTip(GAME_DATA.uiText.in_game.calm_recovered_zh, 1800);
      } else if (p.justRecovered <= 0) {
        p._recoveryAnnounced = false;
      }
    }
  }

  collectTokens() {
    for (const p of this.players) {
      if (!p.connected) continue;
      const g = p.grid;
      const key = `${g.gx},${g.gy}`;
      if (Maze.tokens.delete(key)) {
        this.session.onToken(p.slot);
        Sfx.tokenPickup();
      }
      if (Maze.pellets.delete(key)) {
        Sfx.powerPickup();
        Sfx.pursuitMode();
        for (const c of this.characters) c.enterVulnerable();
      }
    }
  }

  // 人數越多，安撫判定半徑越大，等每個玩家都有機會參與，唔會被手快嘅玩家霸晒（GDD 4.3）
  catchRadius() {
    return TILE * (0.7 + 0.06 * Math.max(0, this.players.length - 1));
  }

  resolveContacts() {
    const r = this.catchRadius();
    for (const c of this.characters) {
      for (const p of this.players) {
        if (!p.connected) continue;
        if (Math.hypot(c.x - p.x, c.y - p.y) > r) continue;

        if (c.isVulnerable) {
          this.session.onSoothed(p.slot);
          Render.addBubble(c.x, c.y, c.caughtLine || GAME_DATA.sharedRules.respawn_message_zh);
          Sfx.calmSuccess();
          c.enter(CharState.CAUGHT);
        } else if (c.isActiveChaser && p.gentlyReset()) {
          // 安心值跌到零：唔係死亡，係一段深呼吸時間，玩家照樣郁得，完咗安心值回滿
          UI.showGentleTip(p.breathing ? GAME_DATA.uiText.in_game.breath_recover_zh : null,
            p.breathing ? GAME_DATA.config.breath_recover_seconds * 1000 : 2000);
          Sfx.playerCaught();
        }
      }
    }
  }

  // GDD 9.1.4a CRITICAL：貼近／面向／重疊情緒角色嗰陣，玩家唔可以播最大張口嗰幀
  updateChompRule() {
    for (const p of this.players) {
      p.nearEmotion = this.characters.some((c) => {
        const dx = c.x - p.x, dy = c.y - p.y;
        if (Math.hypot(dx, dy) < TILE * 2) return true;
        if (!p.dir.x && !p.dir.y) return false;
        const aligned = p.dir.x ? Math.abs(dy) < TILE * 0.6 : Math.abs(dx) < TILE * 0.6;
        const ahead = p.dir.x ? dx * p.dir.x : dy * p.dir.y;
        return aligned && ahead > 0 && ahead < TILE * 3;
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 流程控制
// ---------------------------------------------------------------------------

const App = {
  state: Flow.ATTRACT,
  timer: 0,
  game: null,
  attractView: 'menu',    // menu / characters / board / controllers
  attractManual: false,   // true = 玩家自己揀入去睇，false = 閒置輪播
  attractRotate: 0,
  attractIdle: 0,
  menuIndex: 0,
  postInfoLine: 0,
  postInfoLineTimer: 0,
  entryLetters: [],
  entryCursor: 0,      // 可以去到 NAME_LENGTH（即係打夠 5 個字，等緊確認）
  entrySlot: -1,
  entryScore: 0,

  start() {
    Maze.reset();
    Render.init($('game'));
    UI.init();
    StaffMenu.init();
    HighScores.load();
    UI.renderBoard();

    Input.onPlayerJoined = (slot) => {
      if (this.state === Flow.PLAYING && this.game) {
        this.game.addPlayer(slot);
        this.game.setPlayerConnected(slot, true);
        UI.showControllerNote(GAME_DATA.uiText.in_game.controller_reconnected_zh);
      }
    };
    Input.onPlayerLeft = (slot) => {
      if (this.state === Flow.PLAYING && this.game) {
        this.game.setPlayerConnected(slot, false);
        UI.showControllerNote(
          `${GAME_DATA.uiText.in_game.controller_disconnected_zh}　${GAME_DATA.uiText.in_game.controller_disconnected_reassure_zh}`
        );
      }
    };

    addEventListener('keydown', (e) => this.onKeyDown(e));
    this.enter(Flow.ATTRACT);

    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      this.update(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },

  enter(state) {
    this.state = state;
    this.timer = 0;
    UI.setHudVisible(state === Flow.PLAYING);

    switch (state) {
      case Flow.ATTRACT:
        this.game = null;
        Maze.reset();          // 還原代幣，等 attract 畫面見到完整迷宮
        UI.hideTimeWarning();
        UI.renderBoard();
        this.menuIndex = 0;
        this.showAttractView('menu', false);
        break;

      case Flow.PRE_INFO:
        // 開局前：一句已簽署文案 + 四個角色「行緊 → 安撫成功」精簡圖示。
        // 每一局開波之前都會見到，令小朋友玩之前已經知道呢個轉變。
        // 仍然守住 GDD 6.1.1：只有一句字、6 秒自動開波、任何掣即刻跳過、冇 lock-out。
        $('preInfoLine').textContent = GAME_DATA.uiText.info_panel_zh[GAME_DATA.uiText.pre_info_line_index];
        UI.showPanel('preInfoPanel');
        break;

      case Flow.PLAYING:
        UI._playerSig = null;   // 迫 HUD 重新砌返玩家安心值格
        this.game = new Game();
        this.game.session.onCompleted = (won) => {
          if (won) Sfx.levelClear();
          this.enter(Flow.END);
        };
        UI.showPanel(null);
        break;

      case Flow.END:
        UI.hideTimeWarning();
        UI.setEndMessage(this.game.session, this.game.players.length);
        UI.showPanel('endPanel');
        break;

      case Flow.POST_INFO:
        this.postInfoLine = 0;
        this.postInfoLineTimer = POST_INFO_LINE_SECONDS;
        UI.setInfoLine(GAME_DATA.uiText.info_panel_zh[0]);
        UI.showPanel('infoPanel');
        break;

      case Flow.HIGHSCORE:
        this.enterHighscore();
        break;
    }
  },

  // ---- 開始畫面：選單 + 三個可以自己揀入去睇嘅版面 ----

  ATTRACT_LOOP: ['menu', 'board', 'characters'],

  showAttractView(view, manual) {
    this.attractView = view;
    this.attractManual = manual;
    this.attractRotate = 0;
    this.attractIdle = 0;
    const panel = { menu: 'attractPanel', board: 'boardPanel', characters: 'charactersPanel', controllers: 'controllersPanel' }[view];
    if (view === 'menu') UI.renderMenu(this.menuIndex);
    if (view === 'board') UI.renderBoard();
    if (view === 'controllers') { UI._padSig = null; UI.renderControllers(); }
    UI.showPanel(panel);
  },

  updateAttract(dt, confirm) {
    const nav = this.navEdge();
    const navigated = nav.up || nav.down || nav.left || nav.right;

    if (this.attractView === 'controllers') UI.renderControllers();

    if (this.attractManual) {
      // 攤位保險：有人揀完版面就走咗，冇人郁 30 秒就自動返輪播，唔會成日停喺同一版
      this.attractIdle = (navigated || confirm) ? 0 : this.attractIdle + dt;
      if (this.attractIdle >= ATTRACT_IDLE_RESET) {
        this.attractIdle = 0;
        this.menuIndex = 0;
        this.showAttractView('menu', false);
        return;
      }
      // 自己揀入去嘅版面：確認掣／任何方向 = 返選單，唔會直接開波
      if (this.attractView === 'menu') {
        if (nav.up) { this.menuIndex = (this.menuIndex + 3) % 4; UI.renderMenu(this.menuIndex); Sfx.uiConfirm(); }
        if (nav.down) { this.menuIndex = (this.menuIndex + 1) % 4; UI.renderMenu(this.menuIndex); Sfx.uiConfirm(); }
        if (navigated) this.attractRotate = 0;
        if (confirm) this.activateMenu();
      } else if (confirm) {
        Sfx.uiConfirm();
        this.showAttractView('menu', true);
      }
      return;
    }

    // 閒置輪播：撳確認掣照樣即刻開波（細路撳掣就玩得到，唔使識揀選單）
    if (confirm) { Sfx.uiConfirm(); this.enter(Flow.PRE_INFO); return; }
    if (navigated) {
      this.showAttractView('menu', true);
      return;
    }
    this.attractRotate += dt;
    if (this.attractRotate >= ATTRACT_ROTATE) {
      const next = (this.ATTRACT_LOOP.indexOf(this.attractView) + 1) % this.ATTRACT_LOOP.length;
      this.showAttractView(this.ATTRACT_LOOP[next], false);
    }
  },

  activateMenu() {
    Sfx.uiConfirm();
    const key = UI.menuItems()[this.menuIndex].key;
    if (key === 'start') this.enter(Flow.PRE_INFO);
    else this.showAttractView(key, true);
  },

  // 多人局：只邀請全場最高分嗰一位入名，其他玩家唔使排隊打字，攤位節奏快啲
  enterHighscore() {
    const session = this.game ? this.game.session : null;
    const slot = session ? session.topSlot() : -1;
    const score = slot >= 0 ? session.scores[slot] : 0;
    // 冇打入 Top 10 唔提任何負面訊息，直接返 attract（child-mh-consultant 條件）
    if (!HighScores.qualifies(score)) {
      this.enter(Flow.ATTRACT);
      return;
    }
    this.entrySlot = slot;
    this.entryScore = score;
    this.entryLetters = Array(NAME_LENGTH).fill('A');
    this.entryCursor = 0;
    $('entryScore').textContent = String(score);
    UI.setEntryPlayer(slot, this.game ? this.game.players.length : 1);
    UI.renderEntry(this.entryLetters, this.entryCursor);
    UI.showPanel('entryPanel');
  },

  update(dt) {
    Input.poll();
    StaffMenu.update(dt);
    if (StaffMenu.open) { this.draw(dt); return; }   // 設定畫面開住 = 暫停，唔扣玩家時間

    this.timer += dt;
    const confirm = Input.confirmJustPressed();

    switch (this.state) {
      case Flow.ATTRACT:
        this.updateAttract(dt, confirm);
        break;

      case Flow.PRE_INFO:
        if (this.timer >= PRE_INFO_SECONDS || confirm) this.enter(Flow.PLAYING);
        break;

      case Flow.PLAYING:
        this.game.update(dt);
        UI.updateHud(this.game.session);
        UI.renderPlayerBars(this.game.players);
        break;

      case Flow.END:
        if (this.timer >= END_SECONDS || confirm) this.enter(Flow.POST_INFO);
        break;

      case Flow.POST_INFO: {
        this.postInfoLineTimer -= dt;
        if (this.postInfoLineTimer <= 0) {
          this.postInfoLineTimer = POST_INFO_LINE_SECONDS;
          this.postInfoLine = (this.postInfoLine + 1) % GAME_DATA.uiText.info_panel_zh.length;
          UI.setInfoLine(GAME_DATA.uiText.info_panel_zh[this.postInfoLine]);
        }
        if (this.timer >= POST_INFO_SECONDS || (this.timer >= POST_INFO_LOCKOUT && confirm)) {
          this.enter(Flow.HIGHSCORE);
        }
        break;
      }

      case Flow.HIGHSCORE:
        this.updateEntry(confirm);
        break;
    }

    this.draw(dt);
  },

  // 手掣操作：上下揀字元、左右換位、A 掣逐格推進，去到最後一格再撳就落實
  updateEntry(confirm) {
    const nav = this.navEdge();
    if (nav.up) this.shiftLetter(1);
    if (nav.down) this.shiftLetter(-1);
    if (nav.left) { this.entryCursor = Math.max(0, this.entryCursor - 1); UI.renderEntry(this.entryLetters, this.entryCursor); }
    if (nav.right) { this.entryCursor = Math.min(NAME_LENGTH - 1, this.entryCursor + 1); UI.renderEntry(this.entryLetters, this.entryCursor); }
    if (confirm) {
      if (this.entryCursor < NAME_LENGTH - 1) {
        this.entryCursor++;
        UI.renderEntry(this.entryLetters, this.entryCursor);
        Sfx.uiConfirm();
      } else {
        this.submitEntry();
      }
    }
  },

  submitEntry() {
    HighScores.submit(this.entryLetters.join(''), this.entryScore);
    Sfx.calmSuccess();
    UI.renderBoard();
    this.enter(Flow.ATTRACT);
  },

  shiftLetter(delta) {
    const i = Math.min(this.entryCursor, NAME_LENGTH - 1);
    const at = NAME_CHARS.indexOf(this.entryLetters[i]);
    this.entryLetters[i] = NAME_CHARS[(at + delta + NAME_CHARS.length) % NAME_CHARS.length];
    this.entryCursor = i;
    UI.renderEntry(this.entryLetters, this.entryCursor);
  },

  // 方向鍵／搖桿嘅「單次撳落」邊緣偵測，用喺選單導航
  _navPrev: { up: false, down: false, left: false, right: false },
  navEdge() {
    const k = Input.keys;
    const raw = {
      up: !!(k['arrowup'] || k['w']), down: !!(k['arrowdown'] || k['s']),
      left: !!(k['arrowleft'] || k['a']), right: !!(k['arrowright'] || k['d'])
    };
    for (let slot = 0; slot < 4; slot++) {
      if (!Input.isSlotConnected(slot)) continue;
      const v = Input.moveVector(slot);
      if (v.y < -0.5) raw.up = true;
      if (v.y > 0.5) raw.down = true;
      if (v.x < -0.5) raw.left = true;
      if (v.x > 0.5) raw.right = true;
    }
    const edge = {};
    for (const key of ['up', 'down', 'left', 'right']) {
      edge[key] = raw[key] && !this._navPrev[key];
      this._navPrev[key] = raw[key];
    }
    return edge;
  },

  // 鍵盤操作：直接打英文字母／數字，Backspace 刪返，Enter 即刻落實（唔使逐格撳到尾）
  onKeyDown(e) {
    if (this.state === Flow.HIGHSCORE) {
      if (/^[a-zA-Z0-9]$/.test(e.key)) {
        if (this.entryCursor < NAME_LENGTH) {
          this.entryLetters[this.entryCursor] = e.key.toUpperCase();
          this.entryCursor++;
          UI.renderEntry(this.entryLetters, this.entryCursor);
        }
      } else if (e.key === 'Backspace') {
        if (this.entryCursor > 0) {
          this.entryCursor--;
          this.entryLetters[this.entryCursor] = 'A';
          UI.renderEntry(this.entryLetters, this.entryCursor);
        }
      } else if (e.key === 'Enter') {
        // 唔好等 confirmJustPressed() 再行一次手掣嘅逐格推進邏輯
        Input._keyConfirmEdge = false;
        this.submitEntry();
      }
    }
    if (StaffMenu.open && e.key === 'Escape' && !StaffMenu.escLatched) StaffMenu.close();
  },

  draw(dt) {
    if (this.state === Flow.PLAYING && this.game) {
      Render.frame({ time: this.game.time, players: this.game.players, characters: this.game.characters });
    } else {
      Render.frame({ time: performance.now() / 1000, players: [], characters: [] });
    }
  }
};

addEventListener('DOMContentLoaded', () => {
  Input.init($('game'));
  Assets.load(() => {
    $('loading').style.display = 'none';
    App.start();
  });
});
