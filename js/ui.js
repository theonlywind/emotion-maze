// DOM UI：HUD、各個全螢幕面板、高分榜、志工設定
// 全部文案讀自 data.js，唔喺呢度寫死顯示字眼。

const $ = (id) => document.getElementById(id);

const UI = {
  init() {
    const T = GAME_DATA.uiText;
    $('slogan').textContent = T.slogan_zh;
    $('attractSlogan').textContent = T.slogan_zh;
    $('attractPrompt').textContent = T.attract_mode.loop_prompt_zh;
    $('boardTitle').textContent = T.high_score_board.title_zh;
    $('entryTitle').textContent = T.high_score_board.entry_prompt_zh;
    $('staffTitle').textContent = T.staff_menu.title_zh;
    $('staffDurationLabel').textContent = T.staff_menu.duration_label_zh;
    $('staffPlayersLabel').textContent = T.staff_menu.player_mode_label_zh;
    $('staffHint').textContent = T.staff_menu.enter_hint_zh;

    $('charactersTitle').textContent = T.character_intro.title_zh;
    $('charactersFooter').textContent = T.character_intro.footer_zh;
    $('charactersBack').textContent = T.character_intro.back_hint_zh;
    $('controllersTitle').textContent = T.controllers_panel.title_zh;
    $('controllersHint').textContent = T.controllers_panel.hint_zh;
    $('controllersBack').textContent = T.controllers_panel.back_hint_zh;
    $('preInfoHint').textContent = T.character_intro.pre_game_start_hint_zh;
    this.buildCharacterCards();
    this.buildPreGameChars();
  },

  // 開局前嘅精簡角色介紹：四個角色一行，每個只顯示「行緊 → 安撫成功」，
  // 以圖為主、字極少，6 秒睇得晒，任何掣即刻跳過（GDD 6.1.1 對 PRE-INFO 嘅限制）
  buildPreGameChars() {
    const box = $('preChars');
    const arrowLabel = GAME_DATA.uiText.character_intro.pre_game_arrow_label_zh;
    box.innerHTML = '';
    for (const c of GAME_DATA.characters) {
      const item = document.createElement('div');
      item.className = 'pre-char';
      const pair = document.createElement('div');
      pair.className = 'pre-pair';
      ['chase', 'caught_gentle'].forEach((state, i) => {
        if (i > 0) {
          const arrow = document.createElement('span');
          arrow.className = 'pre-arrow';
          arrow.textContent = '▶';
          pair.appendChild(arrow);
        }
        const img = document.createElement('img');
        const key = `${c.id}_${state}_01`;
        img.src = Assets.images[key] ? Assets.images[key].src : '';
        img.alt = c.name_zh;
        img.className = state === 'caught_gentle' ? 'soothed' : '';
        pair.appendChild(img);
      });
      item.appendChild(pair);
      const name = document.createElement('div');
      name.className = 'pre-name';
      name.textContent = c.name_zh;
      item.appendChild(name);
      box.appendChild(item);
    }
    const caption = document.createElement('div');
    caption.className = 'pre-caption';
    caption.textContent = `▶ ${arrowLabel}`;
    box.appendChild(caption);
  },

  // ---- 開始畫面選單 ----

  menuItems() {
    const M = GAME_DATA.uiText.attract_menu;
    return [
      { key: 'start', label: M.start_zh },
      { key: 'characters', label: M.characters_zh },
      { key: 'board', label: M.board_zh },
      { key: 'controllers', label: M.controllers_zh }
    ];
  },

  renderMenu(index) {
    const list = $('attractMenu');
    list.innerHTML = '';
    this.menuItems().forEach((item, i) => {
      const li = document.createElement('li');
      li.className = 'menu-item' + (i === index ? ' active' : '');
      li.textContent = item.label;
      list.appendChild(li);
    });
  },

  // ---- 角色介紹 ----
  // 逐個角色由「行緊」→「可以安撫」→「安撫成功」三個狀態並排，
  // 令小朋友玩之前就明白呢個轉變，唔會當佢哋係要打低嘅敵人。
  buildCharacterCards() {
    const L = GAME_DATA.uiText.character_intro.state_labels_zh;
    const box = $('charCards');
    box.innerHTML = '';
    for (const c of GAME_DATA.characters) {
      const card = document.createElement('div');
      card.className = 'char-card';

      const head = document.createElement('div');
      head.className = 'char-head';
      head.innerHTML = `<b>${c.name_zh}</b><span>${c.emotion}</span>`;
      card.appendChild(head);

      const strip = document.createElement('div');
      strip.className = 'char-strip';
      const states = [['chase', L.chase], ['vulnerable', L.vulnerable], ['caught_gentle', L.caught_gentle]];
      states.forEach(([state, label], i) => {
        if (i > 0) {
          const arrow = document.createElement('span');
          arrow.className = 'char-arrow';
          arrow.textContent = '▶';
          strip.appendChild(arrow);
        }
        const cell = document.createElement('div');
        cell.className = 'char-state' + (state === 'caught_gentle' ? ' soothed' : '');
        const img = document.createElement('img');
        // 用 Assets 已載入嘅 src，單一檔案版嗰陣呢度會係 data URI
        const key = `${c.id}_${state}_01`;
        img.src = Assets.images[key] ? Assets.images[key].src : '';
        img.alt = `${c.name_zh} ${label}`;
        cell.appendChild(img);
        const cap = document.createElement('span');
        cap.textContent = label;
        cell.appendChild(cap);
        strip.appendChild(cell);
      });
      card.appendChild(strip);

      const line = document.createElement('div');
      line.className = 'char-line';
      line.textContent = c.caught_line_zh;
      card.appendChild(line);

      box.appendChild(card);
    }
  },

  // ---- 手掣連接（參考 Switch 嘅手掣畫面）----

  renderControllers() {
    const C = GAME_DATA.uiText.controllers_panel;
    // 狀態冇變就唔重砌 DOM，避免每 frame 重建
    const sig = [0, 1, 2, 3].map((s) =>
      `${Input.isSlotConnected(s) ? Input.padName(s) : ''}|${Input.padActivity(s) ? 1 : 0}`).join(';')
      + (Input.activePlayerCount() === 0 ? '|kb' : '');
    if (sig === this._padSig) return;
    this._padSig = sig;

    const box = $('padSlots');
    box.innerHTML = '';
    for (let slot = 0; slot < 4; slot++) {
      const connected = Input.isSlotConnected(slot);
      const keyboardFallback = slot === 0 && Input.activePlayerCount() === 0;
      const el = document.createElement('div');
      el.className = 'pad-slot'
        + (connected || keyboardFallback ? ' on' : '')
        + (Input.padActivity(slot) ? ' active' : '')
        + (slot + 1 > GAME_DATA.config.max_players ? ' disabled' : '');
      el.style.setProperty('--slot-color', PLAYER_COLORS[slot]);
      const label = connected ? Input.padName(slot) : (keyboardFallback ? C.keyboard_zh : C.empty_slot_zh);
      const status = connected ? C.connected_zh : (keyboardFallback ? C.connected_zh : '—');
      el.innerHTML = `<div class="pad-num">P${slot + 1}</div>`
        + `<div class="pad-icon"></div>`
        + `<div class="pad-name">${label}</div>`
        + `<div class="pad-status">${status}</div>`;
      box.appendChild(el);
    }
  },
  _padSig: null,

  showPanel(name) {
    for (const el of document.querySelectorAll('.panel')) {
      el.classList.toggle('visible', el.id === name);
    }
  },

  setHudVisible(v) { $('hud').classList.toggle('visible', v); },

  updateHud(session) {
    $('time').textContent = String(Math.ceil(session.timeLeft)).padStart(2, '0');
    $('time').classList.toggle('low', session.timeLeft <= 10);
    const pct = session.requiredTokens > 0
      ? Math.min(100, (session.tokensCollected / session.requiredTokens) * 100) : 0;
    $('progressFill').style.width = pct + '%';
    $('soothed').textContent = `${session.charactersSoothed}/${session.requiredSoothed}`;
    $('tokens').textContent = `${session.tokensCollected}/${session.requiredTokens}`;
  },

  // 每位玩家嘅剩餘生命。特登唔喺呢度顯示個人分數——GDD 4.3 唔准喺局內
  // 喺同伴面前逐個比較分數，個人成績留返去全日高分榜。
  renderPlayerBars(players) {
    const box = $('playerBars');
    const max = GAME_DATA.config.lives;
    const sig = players.map((p) =>
      `${p.slot}:${p.lives}:${p.connected ? 1 : 0}:${p.out ? 1 : 0}`).join('|');
    if (sig === this._playerSig) return;
    this._playerSig = sig;

    box.innerHTML = '';
    for (const p of players) {
      const el = document.createElement('div');
      el.className = 'pbar' + (p.connected ? '' : ' offline') + (p.out ? ' out' : '');
      el.style.setProperty('--c', PLAYER_COLORS[p.slot]);
      const hearts = Array.from({ length: max }, (_, i) =>
        `<i class="${i < p.lives ? 'on' : ''}">♥</i>`).join('');
      el.innerHTML = `<span class="pbar-name">P${p.slot + 1}</span><span class="pbar-pips">${hearts}</span>`;
      box.appendChild(el);
    }
  },
  _playerSig: null,

  showTimeWarning() {
    const el = $('timeWarning');
    el.textContent = GAME_DATA.uiText.in_game.time_low_warning_zh;
    el.classList.add('visible');
  },

  hideTimeWarning() { $('timeWarning').classList.remove('visible'); },

  // 玩家被情緒角色掂到扣咗命：講明仲剩幾多條，最後一條同出局有各自嘅字
  showLifeLost(player, playerCount) {
    const T = GAME_DATA.uiText.in_game;
    const who = `P${player.slot + 1}`;
    let text;
    if (player.out) text = T.player_out_zh.replace('{p}', who);
    else if (player.lives === 1) text = T.life_last_zh;
    else text = T.life_lost_zh.replace('{n}', player.lives);
    if (!player.out && playerCount > 1) text = `${who}　${text}`;
    this.showGentleTip(text, 2000);
  },

  showGentleTip(text, seconds = 2000) {
    const el = $('gentleTip');
    el.textContent = text;
    el.classList.add('visible');
    clearTimeout(this._tipTimer);
    this._tipTimer = setTimeout(() => el.classList.remove('visible'), seconds);
  },

  showControllerNote(text) {
    const el = $('controllerNote');
    el.textContent = text;
    el.classList.add('visible');
    clearTimeout(this._ctrlTimer);
    this._ctrlTimer = setTimeout(() => el.classList.remove('visible'), 3000);
  },

  setInfoLine(text) { $('infoLine').textContent = text; },

  // GDD 4.3：單局結束畫面唔可以喺同伴面前逐個比較分數。
  // 所以多人局淨係顯示團隊合計，個人分數留返去全日高分榜（4.4）先出現；
  // 單人局冇同伴比較風險，照顯示佢自己個分數。
  setEndMessage(session, playerCount) {
    const T = GAME_DATA.uiText.session_end;
    $('endMessage').textContent = session.gameOver
      ? `${T.game_over_zh}\n${T.game_over_sub_zh}`
      : (session.teamWon ? T.team_success_zh : T.team_time_up_zh);
    $('endMessage').classList.toggle('game-over', !!session.gameOver);
    const list = $('endScores');
    list.innerHTML = '';
    const li = document.createElement('li');
    if (playerCount <= 1) {
      li.style.color = PLAYER_COLORS[0];
      li.textContent = `${T.individual_score_prefix_zh}${session.scores.reduce((a, b) => a + b, 0)}`;
    } else {
      li.style.color = 'var(--calm)';
      li.textContent = `你哋一齊收集咗 ${session.tokensCollected} 個情緒詞彙，安撫咗 ${session.charactersSoothed} 個情緒角色`;
    }
    list.appendChild(li);
  },

  renderBoard() {
    const list = $('boardList');
    list.innerHTML = '';
    if (HighScores.entries.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = GAME_DATA.uiText.high_score_board.empty_state_zh;
      list.appendChild(li);
      return;
    }
    HighScores.entries.forEach((e, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="rank">${String(i + 1).padStart(2, '0')}</span>`
        + `<span class="name">${e.name}</span><span class="score">${e.score}</span>`;
      list.appendChild(li);
    });
  },

  // 多人局要講明係邀請邊個玩家入名，唔係全部人一齊打
  setEntryPlayer(slot, playerCount) {
    const el = $('entryPlayer');
    if (playerCount <= 1 || slot < 0) {
      el.textContent = '';
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    el.style.color = PLAYER_COLORS[slot];
    el.textContent = `P${slot + 1}`;
  },

  renderEntry(letters, cursor) {
    const box = $('entryLetters');
    box.innerHTML = '';
    letters.forEach((ch, i) => {
      const span = document.createElement('span');
      span.className = 'letter' + (i === cursor ? ' active' : '');
      span.textContent = ch;
      box.appendChild(span);
    });
  },

  refreshStaff() {
    $('staffDurationValue').textContent = `${GAME_DATA.config.session_duration_seconds} 秒`;
    $('staffPlayersValue').textContent = `1-${GAME_DATA.config.max_players} 人`;
  }
};

// ---------------------------------------------------------------------------
// 志工設定：隱藏入口（長按 Esc 3 秒 / 兩隻手掣同時長按 Back 3 秒），暫停遊戲
// ---------------------------------------------------------------------------

const StaffMenu = {
  open: false,
  holdTimer: 0,
  resetPending: false,
  escLatched: false,   // 長按 Esc 開咗之後，要放開先可以用 Esc 閂返（避免 key repeat 即刻閂返）

  CONFIG_KEY: 'emotion_maze_staff_config',

  // 志工設定要跨重開瀏覽器保留，唔好逼佢每次開機重設一次
  loadConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(this.CONFIG_KEY) || '{}');
      if (GAME_DATA.config.DURATION_OPTIONS.includes(saved.duration)) {
        GAME_DATA.config.session_duration_seconds = saved.duration;
      }
      if (saved.maxPlayers >= 1 && saved.maxPlayers <= 4) {
        GAME_DATA.config.max_players = saved.maxPlayers;
      }
    } catch (e) { /* 讀唔到就用 data.js 嘅預設值 */ }
  },

  saveConfig() {
    try {
      localStorage.setItem(this.CONFIG_KEY, JSON.stringify({
        duration: GAME_DATA.config.session_duration_seconds,
        maxPlayers: GAME_DATA.config.max_players
      }));
    } catch (e) { /* 私隱模式下寫唔到，今次 session 照用 */ }
  },

  init() {
    this.loadConfig();
    $('staffDurationPrev').onclick = () => this.cycleDuration(-1);
    $('staffDurationNext').onclick = () => this.cycleDuration(1);
    $('staffPlayersPrev').onclick = () => this.cyclePlayers(-1);
    $('staffPlayersNext').onclick = () => this.cyclePlayers(1);
    $('staffFullscreen').onclick = () => this.toggleFullscreen();
    $('staffReset').onclick = () => this.resetBoard();
    $('staffClose').onclick = () => this.close();
    UI.refreshStaff();
  },

  update(dt) {
    if (this.open) {
      if (!Input.keys['escape']) this.escLatched = false;
      return;
    }
    const holding = Input.keys['escape'] || Input.backHeldCount() >= 2;
    this.holdTimer = holding ? this.holdTimer + dt : 0;
    if (this.holdTimer >= 3) this.openMenu();
  },

  openMenu() {
    this.open = true;
    this.holdTimer = 0;
    this.escLatched = !!Input.keys['escape'];
    UI.refreshStaff();
    $('staffMenu').classList.add('visible');
  },

  close() {
    this.open = false;
    this.resetPending = false;
    $('staffReset').textContent = '重置今日高分榜';
    $('staffMenu').classList.remove('visible');
  },

  cycleDuration(dir) {
    const opts = GAME_DATA.config.DURATION_OPTIONS;
    let i = opts.indexOf(GAME_DATA.config.session_duration_seconds);
    if (i === -1) i = 0;
    GAME_DATA.config.session_duration_seconds = opts[(i + dir + opts.length) % opts.length];
    this.saveConfig();
    UI.refreshStaff();
  },

  cyclePlayers(dir) {
    GAME_DATA.config.max_players = ((GAME_DATA.config.max_players - 1 + dir + 4) % 4) + 1;
    this.saveConfig();
    UI.refreshStaff();
  },

  // 二次確認，避免手滑清空全日榜單
  resetBoard() {
    if (!this.resetPending) {
      this.resetPending = true;
      $('staffReset').textContent = '確認清空？再撳一次';
      return;
    }
    HighScores.reset();
    UI.renderBoard();
    this.resetPending = false;
    $('staffReset').textContent = '已清空';
    setTimeout(() => { $('staffReset').textContent = '重置今日高分榜'; }, 1500);
  },

  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }
};
