// Canvas 繪圖層：迷宮、代幣、角色、頭頂文字氣泡
// UI（HUD/面板/高分榜/設定）唔喺 canvas 畫，用 DOM，見 ui.js

const Render = {
  canvas: null,
  ctx: null,
  bubbles: [],   // 被安撫嗰刻喺角色頭頂浮現嘅敘事文案

  init(canvas) {
    this.canvas = canvas;
    this.canvas.width = Maze.width * TILE;
    this.canvas.height = Maze.height * TILE;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
  },

  addBubble(x, y, text) {
    this.bubbles.push({ x, y, text, t: 0 });
  },

  updateBubbles(dt) {
    for (const b of this.bubbles) b.t += dt;
    this.bubbles = this.bubbles.filter((b) => b.t < 1.5);
  },

  frame(state) {
    const ctx = this.ctx;
    this.playerCount = state.players.length;
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawWalls();
    this.drawGhostHouse();
    this.drawTokens(state.time);
    for (const c of state.characters) this.drawCharacter(c);
    for (const p of state.players) this.drawPlayer(p);
    this.drawBubbles();
  },

  // 情緒屋（原 Ghost House）：情緒角色被安撫之後返嚟休息嘅地方，畫喺牆之後令標示睇得到
  drawGhostHouse() {
    const r = Maze.ghostHouse;
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(150, 120, 255, 0.13)';
    ctx.fillRect(r.x * TILE, r.y * TILE, r.width * TILE, r.height * TILE);
    ctx.strokeStyle = 'rgba(180, 160, 255, 0.35)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x * TILE + 1, r.y * TILE + 1, r.width * TILE - 2, r.height * TILE - 2);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(205, 195, 255, 0.7)';
    ctx.font = `${Math.round(TILE * 0.44)}px system-ui, "PingFang HK", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('情緒屋', (r.x + r.width / 2) * TILE, (r.y + r.height) * TILE - 5);
    ctx.restore();
  },

  // 經典街機雙線牆身：淨係喺「牆同走廊之間」嘅邊界畫線
  drawWalls() {
    const ctx = this.ctx;
    ctx.fillStyle = '#0b1030';
    ctx.strokeStyle = '#3f6dff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    for (const key of Maze.walls) {
      const [gx, gy] = key.split(',').map(Number);
      const x = gx * TILE, y = gy * TILE;
      ctx.fillRect(x, y, TILE, TILE);
    }

    ctx.beginPath();
    for (const key of Maze.walls) {
      const [gx, gy] = key.split(',').map(Number);
      const x = gx * TILE, y = gy * TILE;
      const inset = 2;
      if (!Maze.isWall(gx, gy - 1)) { ctx.moveTo(x, y + inset); ctx.lineTo(x + TILE, y + inset); }
      if (!Maze.isWall(gx, gy + 1)) { ctx.moveTo(x, y + TILE - inset); ctx.lineTo(x + TILE, y + TILE - inset); }
      if (!Maze.isWall(gx - 1, gy)) { ctx.moveTo(x + inset, y); ctx.lineTo(x + inset, y + TILE); }
      if (!Maze.isWall(gx + 1, gy)) { ctx.moveTo(x + TILE - inset, y); ctx.lineTo(x + TILE - inset, y + TILE); }
    }
    ctx.stroke();
  },

  drawTokens(time) {
    const ctx = this.ctx;
    ctx.fillStyle = '#ffe9a8';
    for (const key of Maze.tokens) {
      const [gx, gy] = key.split(',').map(Number);
      const c = Maze.centerOf(gx, gy);
      ctx.beginPath();
      ctx.arc(c.x, c.y, TILE * 0.11, 0, Math.PI * 2);
      ctx.fill();
    }

    // 正面元氣丸：一呼一吸咁脹縮，同「深呼吸」意象呼應。
    // 要夠搶眼，細路先會主動去食：比普通代幣大三倍，外面再加一圈向外擴散嘅光環。
    const pulse = 0.85 + Math.sin(time * 2.6) * 0.15;
    const ringPhase = (time * 0.9) % 1;
    for (const key of Maze.pellets) {
      const [gx, gy] = key.split(',').map(Number);
      const c = Maze.centerOf(gx, gy);
      ctx.beginPath();
      ctx.arc(c.x, c.y, TILE * 0.62 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(120, 230, 255, 0.22)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(c.x, c.y, TILE * (0.4 + 0.5 * ringPhase), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(160, 240, 255, ${0.9 * (1 - ringPhase)})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c.x, c.y, TILE * 0.32 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = '#d4f8ff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#6fdcff';
      ctx.stroke();
    }
  },

  // 每位玩家成個角色用自己顏色（P1 黃、P2 藍、P3 粉紅、P4 綠），一眼認到邊個係自己。
  // 原圖係黃色，用 hue-rotate 轉色；瀏覽器唔支援 canvas filter 就照用原圖（仍然有顏色描邊同標籤）。
  PLAYER_HUE: [0, 150, 280, 60],
  _tintCache: {},
  _tinted(img, slot) {
    const deg = this.PLAYER_HUE[slot] || 0;
    if (!deg) return img;
    const key = img.src + '|' + deg;
    if (this._tintCache[key]) return this._tintCache[key];
    const off = document.createElement('canvas');
    off.width = img.naturalWidth;
    off.height = img.naturalHeight;
    const c = off.getContext('2d');
    if (!('filter' in c)) return (this._tintCache[key] = img);
    c.imageSmoothingEnabled = false;
    c.filter = `hue-rotate(${deg}deg) saturate(1.3)`;
    c.drawImage(img, 0, 0);
    this._tintCache[key] = off;
    return off;
  },

  // 將 sprite 染成單色剪影，用嚟砌描邊；同一張圖同一個顏色只做一次
  _silhouetteCache: {},
  _silhouette(img, color) {
    const key = img.src + color;
    if (this._silhouetteCache[key]) return this._silhouetteCache[key];
    const off = document.createElement('canvas');
    off.width = img.naturalWidth;
    off.height = img.naturalHeight;
    const c = off.getContext('2d');
    c.drawImage(img, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color;
    c.fillRect(0, 0, off.width, off.height);
    this._silhouetteCache[key] = off;
    return off;
  },

  // 玩家頭上嘅剩餘生命：細路眼睛望住迷宮，唔使望返去 HUD 都知仲有幾多條命
  drawLivesAbove(p, x, y) {
    const ctx = this.ctx;
    const max = GAME_DATA.config.lives;
    const size = TILE * 0.5;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.font = `bold ${size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const gap = size * 0.95;
    // 放喺玩家下面：上面已經有 P1/P2 標籤
    const cy = Math.min(Maze.height * TILE - size * 0.6, y + SPRITE_DRAW + size * 0.05);
    for (let i = 0; i < max; i++) {
      const cx = p.x + (i - (max - 1) / 2) * gap;
      ctx.fillStyle = i < p.lives ? '#ff5a7a' : 'rgba(255,255,255,0.18)';
      ctx.fillText('♥', cx, cy);
    }
    ctx.restore();
  },

  drawPlayer(p) {
    const ctx = this.ctx;
    ctx.save();
    // 出局：變灰；被掂到後嘅無敵時間：閃爍
    ctx.globalAlpha = p.out ? 0.25 : !p.connected ? 0.4
      : (p.isProtected() ? (Math.floor(p.animTime * 10) % 2 ? 0.35 : 0.9) : 1);

    const img = p.sprite();
    if (img && img.complete && img.naturalWidth) {
      const x = p.x - SPRITE_DRAW / 2, y = p.y - SPRITE_DRAW / 2;
      // 多人時每個玩家有專屬顏色描邊，小朋友先認到邊個係自己（GDD 4.3）
      if (this.playerCount > 1) {
        const outline = this._silhouette(img, PLAYER_COLORS[p.slot]);
        for (const [ox, oy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) {
          ctx.drawImage(outline, x + ox, y + oy, SPRITE_DRAW, SPRITE_DRAW);
        }
      }
      ctx.drawImage(this._tinted(img, p.slot), x, y, SPRITE_DRAW, SPRITE_DRAW);
      if (!p.out) this.drawLivesAbove(p, x, y);
    }

    if (this.playerCount > 1 || !p.connected) {
      ctx.globalAlpha = 1;
      ctx.font = `bold ${Math.round(TILE * 0.4)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#05060f';
      ctx.strokeText(`P${p.slot + 1}`, p.x, p.y - TILE * 0.88);
      ctx.fillStyle = PLAYER_COLORS[p.slot];
      ctx.fillText(`P${p.slot + 1}`, p.x, p.y - TILE * 0.88);
    }
    ctx.restore();
  },

  drawCharacter(c) {
    const ctx = this.ctx;
    ctx.save();

    // 被安撫嗰一刻：溫暖光圈包住，唔用吞食/暴力視覺（child-mh-consultant 硬性要求）
    if (c.state === CharState.CAUGHT) {
      const p = 1 - c.stateTimer / 1.2;
      const grad = ctx.createRadialGradient(c.x, c.y, TILE * 0.15, c.x, c.y, TILE * (0.7 + p * 0.6));
      grad.addColorStop(0, 'rgba(255, 236, 180, 0.85)');
      grad.addColorStop(1, 'rgba(255, 210, 130, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(c.x, c.y, TILE * (0.7 + p * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }

    if (c.state === CharState.VULNERABLE) {
      // 尾段閃爍提示安撫模式就快完
      const flash = c.stateTimer < 2 && Math.floor(c.stateTimer * 6) % 2 === 0;
      ctx.globalAlpha = flash ? 0.55 : 1;
      const grad = ctx.createRadialGradient(c.x, c.y, TILE * 0.2, c.x, c.y, TILE * 0.8);
      grad.addColorStop(0, 'rgba(150, 235, 255, 0.55)');
      grad.addColorStop(1, 'rgba(150, 235, 255, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(c.x, c.y, TILE * 0.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (c.state === CharState.RESTING) {
      ctx.globalAlpha = 0.6;
    }

    const img = c.sprite();
    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, c.x - SPRITE_DRAW / 2, c.y - SPRITE_DRAW / 2, SPRITE_DRAW, SPRITE_DRAW);
    }
    ctx.restore();
  },

  // ui_text.json caught_reaction_display：淡入 0.2s / 停留 1.1s / 淡出 0.2s
  drawBubbles() {
    const ctx = this.ctx;
    for (const b of this.bubbles) {
      let alpha = 1;
      if (b.t < 0.2) alpha = b.t / 0.2;
      else if (b.t > 1.3) alpha = Math.max(0, (1.5 - b.t) / 0.2);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `${Math.round(TILE * 0.46)}px system-ui, "PingFang HK", sans-serif`;
      ctx.textAlign = 'center';
      const w = ctx.measureText(b.text).width + 14;
      const h = TILE * 0.8;
      let x = Math.min(Math.max(b.x, w / 2 + 4), this.canvas.width - w / 2 - 4);
      const y = Math.max(b.y - TILE * 1.1, h + 4);

      ctx.fillStyle = 'rgba(255, 248, 230, 0.94)';
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - h, w, h, 6);
      ctx.fill();
      ctx.fillStyle = '#3b2f1a';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.text, x, y - h / 2);
      ctx.restore();
    }
  }
};
