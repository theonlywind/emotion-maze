// 遊戲內容資料（關卡、情緒角色、UI 文案）
// 來源：game/data/*.json（narrative-designer + child-mh-consultant 共同簽署）
// 用 JS 物件而唔用 JSON fetch，係為咗可以直接 double-click index.html 開，唔使起 server。
// 改文案／改關卡淨係需要改呢一個檔案。

window.GAME_DATA = {

  // 迷宮 v2：由原本 16x18（直度，喺手提電腦畫面兩邊嘥好多位）改成 28x17 橫向，
  // 比例 1.65 貼近一般手提電腦／外接顯示器，玩區大成一倍以上。
  // 已用 flood fill 驗證：232 格可行走全部連通、冇孤立區域。
  // 特意做到「冇死路」——每個路口都有第二條路走，小朋友唔會被逼到掘頭巷，
  // 呼應 GDD 追捕唔可以造成驚嚇嘅條件。
  level: {
    // [試驗] 迷宮 v3：28x17 改成 32x17，比例 1.88 更貼近 16:9 螢幕，兩邊唔再留大黑邊。
    // 牆改成較短嘅段落，路口多咗，但保持：全部連通、冇掘頭路、左右對稱、隧道喺第 8 行。
    // 代幣多咗（274 粒），所以完成比例由 0.3 降到 0.25，單人目標仍然係 68 粒左右。
    // 還原：將成段 level 換返 main 上面嘅版本。
    completion_token_percent: 0.25,
    grid_width: 32,
    grid_height: 17,
    grid: [
      "################################",
      "#o...##........##........##...o#",
      "#.##.##.##.###.##.###.##.##.##.#",
      "#.##.......###....###.......##.#",
      "#....##.##.....##.....##.##....#",
      "##.#.##.##.###.##.###.##.##.#.##",
      "#..#...........##...........#..#",
      "#.##.##.####........####.##.##.#",
      "=..............................=",
      "#.##.##.####........####.##.##.#",
      "#..#...........##...........#..#",
      "##.#.##.##.###.##.###.##.##.#.##",
      "#....##.##.....##.....##.##....#",
      "#.##.......###....###.......##.#",
      "#.##.##.##.###.##.###.##.##.##.#",
      "#o...##........##........##...o#",
      "################################"
    ],
    tunnel_row: 8,
    ghost_house: {
      home_position_grid: { x: 15, y: 8 },
      rect: { x: 13, y: 7, width: 6, height: 3 }
    },
    player_spawn_points_grid: [
      { player_slot: 0, x: 14, y: 12 },
      { player_slot: 1, x: 17, y: 12 },
      { player_slot: 2, x: 12, y: 12 },
      { player_slot: 3, x: 19, y: 12 }
    ],
    character_spawn_grid: [
      { x: 14, y: 8 }, { x: 15, y: 8 }, { x: 16, y: 8 }, { x: 17, y: 8 }
    ]
  },

  characters: [
    {
      id: "sad_blue",
      name_zh: "藍藍",
      emotion: "唔開心/傷心",
      chase_behavior: "slow_follow",
      base_speed_mult: 0.85,
      scatter_corner: "top_left",
      caught_line_zh: "藍藍冷靜返，去情緒屋休息一陣"
    },
    {
      id: "angry_red",
      name_zh: "阿嬲",
      emotion: "嬲嬲",
      chase_behavior: "direct_target_player",
      base_speed_mult: 1.1,
      scatter_corner: "top_right",
      caught_line_zh: "阿嬲深呼吸返，去情緒屋休息一陣"
    },
    {
      id: "scared_purple",
      name_zh: "驚驚",
      emotion: "驚驚",
      chase_behavior: "erratic_but_gentle",
      base_speed_mult: 0.95,
      scatter_corner: "bottom_left",
      caught_line_zh: "驚驚安心返，去情緒屋休息一陣"
    },
    {
      id: "worried_green",
      name_zh: "擔心蟲",
      emotion: "擔心",
      chase_behavior: "orbit_player",
      base_speed_mult: 0.9,
      scatter_corner: "bottom_right",
      caught_line_zh: "擔心蟲放鬆返，去情緒屋休息一陣"
    }
  ],

  sharedRules: {
    vulnerable_duration_seconds: 8,
    resting_duration_seconds: 6,
    respawn_message_zh: "情緒會休息一陣，再返嚟同你相處"
  },

  uiText: {
    slogan_zh: "食走壓力，食出好心情",
    title_screen: {
      start_prompt_zh: "撳掣開始",
      info_button_zh: "了解多啲"
    },

    // 開始畫面選單（上下揀，確認掣入去）
    attract_menu: {
      start_zh: "開始遊戲",
      characters_zh: "認識情緒角色",
      board_zh: "今日高分榜",
      controllers_zh: "手掣連接"
    },

    // 角色介紹版面。逐個角色由「喺迷宮行緊」-> 「可以安撫」-> 「安撫成功」三個狀態並排，
    // 等小朋友喺玩之前就知道呢個轉變係點發生，唔會覺得情緒角色係敵人。
    // 新增文案，未經 child-mh-consultant 簽署，暫定。
    character_intro: {
      title_zh: "你會喺迷宮入面遇到佢哋",
      state_labels_zh: {
        chase: "平時喺迷宮行嚟行去",
        vulnerable: "你食咗安撫代幣之後",
        caught_gentle: "安撫成功"
      },
      footer_zh: "情緒唔會消失，佢會休息一陣，再同你見面",
      back_hint_zh: "撳確認掣返去",
      // 開局前嗰個精簡版：每個角色只顯示「行緊 → 安撫成功」兩格，
      // 保持 GDD 6.1.1「靠圖唔靠字、6 秒內睇完、隨時可以跳過」嘅要求
      pre_game_start_hint_zh: "撳掣即刻開始",
      pre_game_arrow_label_zh: "安撫之後"
    },

    // 手掣連接版面（參考 Switch 嘅手掣畫面）
    controllers_panel: {
      title_zh: "手掣連接",
      empty_slot_zh: "撳一下手掣任何掣就加入",
      connected_zh: "已連接",
      keyboard_zh: "鍵盤（方向鍵 / WASD）",
      hint_zh: "郁下手掣，對應嗰格會著燈，就知道邊隻手掣係邊個玩家",
      back_hint_zh: "撳確認掣返去"
    },

    info_panel_zh: [
      "每種情緒都值得被認識",
      "喺呢個迷宮入面，你會遇到唔同嘅情緒角色",
      "追住佢哋，安撫佢哋，等佢哋冷靜返",
      "情緒唔會消失，佢會休息一陣，再同你見面"
    ],
    // GDD 6.1.1：PRE-INFO 只用一句，指定用 info_panel_zh[1]
    pre_info_line_index: 1,
    in_game: {
      time_low_warning_zh: "就快好喇，加油！",
      // 元氣：被情緒角色掂到扣一條，唔會回復；扣到零就出局，
      // 全部玩家出局就 Game Over（2026-11 由「唔死亡、唔懲罰」改成有輸有贏，
      // 因為試玩後覺得完全冇挑戰）。{n} 會換成剩低幾多點元氣。
      // 開局目標提示：細路一開波就要知道做乜（食發光圈 → 追住情緒安撫）
      goal_hint_zh: "食角落發光圈，追住情緒去安撫佢！",
      pellet_eaten_zh: "追住佢哋，安撫佢！",
      lives_label_zh: "元氣",
      life_lost_zh: "小心！仲有 {n} 點元氣",
      life_last_zh: "最後一點元氣喇，加油！",
      player_out_zh: "{p} 元氣用晒喇",
      controller_disconnected_zh: "手掣訊號中斷一陣",
      controller_disconnected_reassure_zh: "唔關你事，等一等佢",
      controller_reconnected_zh: "手掣返咗嚟，繼續啦！"
    },
    session_end: {
      team_success_zh: "你哋一齊令呢個地方變得更加溫暖！",
      team_time_up_zh: "呢一round去到呢度，你哋已經好努力！",
      individual_score_prefix_zh: "你嘅情緒探索分數：",
      game_over_zh: "Game Over",
      game_over_sub_zh: "元氣用晒喇，下次再嚟挑戰！"
    },
    high_score_board: {
      title_zh: "今日十大情緒探索家",
      empty_state_zh: "第一個上榜嘅會係邊個呢？",
      entry_prompt_zh: "你打入咗今日十大情緒探索家！輸入你嘅名字："
    },
    attract_mode: {
      loop_prompt_zh: "撳掣加入探索！"
    },
    staff_menu: {
      title_zh: "志工設定",
      duration_label_zh: "遊玩時長",
      player_mode_label_zh: "人數模式",
      enter_hint_zh: "長按 Esc 3 秒，或同時長按兩隻手掣嘅 Select/Back 掣 3 秒"
    }
  },

  // 攤位志工可調設定（唔對外開放俾小朋友改）
  config: {
    DURATION_OPTIONS: [60, 90, 120, 180],
    session_duration_seconds: 120,
    max_players: 4,

    // 元氣參數（見 uiText.in_game.lives_label_zh 嘅說明）
    lives: 3,                       // 每位玩家幾多點元氣，唔會回復
    hit_protect_seconds: 2          // 被掂到（仲有元氣）之後嘅無敵時間，避免連環被掂
  }
};
