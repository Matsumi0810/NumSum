// ============================================================
// NumberSums (純サムズ) — メインファイル
// React 単一ファイルで完結するナンバーパズルゲーム
//
// 【ゲームのルール】
//   ・各行・列の左端/上部の「残り数」が 0 になるよう
//     FIX（残すマス）と ERASE（消すマス）を選択する
//   ・グループ左上の小数字もFIXするたびに減っていく
//   ・行か列が全て正解で揃うとキラキラしながら消える
//   ・ミス3回でゲームオーバー
//
// 【操作方法】
//   ・シングルクリック → 選択中モード（FIX / ERASE）で操作
//   ・ダブルクリック   → 常に ERASE
//   ・Star(FIX)ボタン  → FIXモードに切替（薄い青）
//   ・Mist(ERASE)ボタン→ ERASEモードに切替（薄い赤）
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from "react";

// ============================================================
// GROUP_COLORS — グループカラーパレット（最大6色でローテーション）
//   bg        … 通常時の背景色（薄め）
//   correctBg … FIX確定時の背景色（暗め・白文字になる）
//   border    … 枠線の色（確定時に 2px で強調）
//   text      … グループ残り合計数字の色
// =================================
const GROUP_COLORS = [
  // 【赤グループ】
  {
    bg: "rgba(255, 180, 180, 0.35)",
    correctBg: "rgba(196, 108, 108, 0.75)",
    border: "rgba(203, 93, 93, 0.6)",
    text: "#b04040",
  },
  // 【青グループ】
  {
    bg: "rgba(86, 176, 255, 0.35)",
    correctBg: "rgba(84, 140, 213, 0.75)",
    border: "rgba( 80, 150, 220, 0.6)",
    text: "#3060a0",
  },
  // 【緑グループ】
  {
    bg: "rgba(180, 255, 200, 0.35)",
    correctBg: "rgba(114, 182, 136, 0.75)",
    border: "rgba(74, 164, 107, 0.6)",
    text: "#2a7a4a",
  },
  // 【黄グループ】
  {
    bg: "rgba(255, 240, 160, 0.35)",
    correctBg: "rgba(202, 175, 85, 0.75)",
    border: "rgba(176, 150, 46, 0.6)",
    text: "#806010",
  },
  // 【紫グループ】
  {
    bg: "rgba(220, 180, 255, 0.35)",
    correctBg: "rgba(144, 94, 200, 0.75)",
    border: "rgba(150,  80, 220, 0.6)",
    text: "#6030a0",
  },
  // 【オレンジグループ】
  {
    bg: "rgba(255, 210, 160, 0.35)",
    correctBg: "rgba(210, 110,  30, 0.75)",
    border: "rgba(210, 130,  60, 0.6)",
    text: "#8a4010",
  },
];

// ============================================================
// formatTime — 秒数を "MM:SS" 形式に変換（タイマー表示用）
// ============================================================
function formatTime(s) {
  const m = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

// ============================================================
// makeParticles — スパークルエフェクト用パーティクルデータ生成
// 行/列が完了したときに呼び出す。両端から20個の粒子データを生成し
// sparkles 配列に保存して SparkleEffect コンポーネントに渡す
// ============================================================
function makeParticles() {
  const COLORS = [
    "#ffaacc",
    "#cc88ff",
    "#ffffaa",
    "#aaddff",
    "#ffddaa",
    "#aaffcc",
  ]; // スパークル粒子の色候補
  const arr = [];
  for (let i = 0; i < 20; i++) {
    const side = i < 10 ? "left" : "right";
    arr.push({
      id: i,
      side,
      angle:
        side === "left"
          ? 170 + Math.random() * 40 // 左端から右方向へ
          : -10 + Math.random() * -40, // 右端から左方向へ（上下に広がる）
      speed: 55 + Math.random() * 75,
      size: 5 + Math.random() * 7,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      delay: Math.random() * 0.25,
      shape: Math.random() > 0.5 ? "★" : "✦",
    });
  }
  return arr;
}

// ============================================================
// generateGroups — グループ生成アルゴリズム
// 盤面の全マスを余さず連結グループに分割する
//
// 【仕様】
//   ・最低 MIN_SIZE(5) マス以上で1グループを構成
//   ・BFS + フロンティア方式で必ず連結を保証
//   ・残りマスが MIN_SIZE 未満になったら隣接グループに吸収
//   ・target = グループ内の solution=true マスの board 値合計
//     （= クリア時に FIX すべきマスの合計数）
// ============================================================
function generateGroups(gridSize, board, solution) {
  const MIN_SIZE = 5;
  const DIRS = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  const assigned = Array.from({ length: gridSize }, () =>
    Array(gridSize).fill(-1),
  );
  const groups = [];

  const remaining = new Set();
  for (let r = 0; r < gridSize; r++)
    for (let c = 0; c < gridSize; c++) remaining.add(`${r},${c}`);

  // 指定マスに隣接する割り当て済みグループの ID を返す（なければ -1）
  const getNeighborGid = (r, c) => {
    for (const [dr, dc] of DIRS) {
      const nr = r + dr,
        nc = c + dc;
      if (
        nr >= 0 &&
        nr < gridSize &&
        nc >= 0 &&
        nc < gridSize &&
        assigned[nr][nc] !== -1
      )
        return assigned[nr][nc];
    }
    return -1;
  };

  let gid = 0;

  while (remaining.size > 0) {
    // 【グループ分け】残り少ない → 隣接グループに吸収
    if (remaining.size < MIN_SIZE && groups.length > 0) {
      for (const key of [...remaining]) {
        const parts = key.split(",");
        const r = Number(parts[0]),
          c = Number(parts[1]);
        let targetGid = getNeighborGid(r, c);
        if (targetGid === -1) targetGid = groups[groups.length - 1].id;
        assigned[r][c] = targetGid;
        groups.find((g) => g.id === targetGid).cells.push([r, c]);
        remaining.delete(key);
      }
      break;
    }

    // スタート地点
    const startKey = [...remaining][0];
    const startParts = startKey.split(",");
    const sr = Number(startParts[0]),
      sc = Number(startParts[1]);

    // このグループのローカル変数（クロージャ問題を避けるため関数化しない）
    const groupCells = [];
    const frontier = [];
    const inFrontier = new Set();

    // pushCell — マスをグループに追加し、隣接未割り当てマスをフロンティアに登録
    // ループ内でアロー関数にすることでクロージャ問題を回避している
    const pushCell = (r, c) => {
      const key = `${r},${c}`;
      groupCells.push([r, c]);
      remaining.delete(key);
      assigned[r][c] = gid;
      for (const [dr, dc] of DIRS) {
        const nr = r + dr,
          nc = c + dc;
        const nk = `${nr},${nc}`;
        if (
          nr >= 0 &&
          nr < gridSize &&
          nc >= 0 &&
          nc < gridSize &&
          remaining.has(nk) &&
          !inFrontier.has(nk)
        ) {
          inFrontier.add(nk);
          frontier.push([nr, nc]);
        }
      }
    };

    pushCell(sr, sc);

    // MIN_SIZE になるまで拡張
    while (frontier.length > 0 && groupCells.length < MIN_SIZE) {
      const idx = Math.floor(Math.random() * frontier.length);
      const [nr, nc] = frontier.splice(idx, 1)[0];
      const nk = `${nr},${nc}`;
      inFrontier.delete(nk);
      if (!remaining.has(nk)) continue;
      pushCell(nr, nc);
    }

    // 残りが MIN_SIZE 未満になるなら今のグループに全部吸収
    if (remaining.size > 0 && remaining.size < MIN_SIZE) {
      while (frontier.length > 0 && remaining.size > 0) {
        const idx = Math.floor(Math.random() * frontier.length);
        const [nr, nc] = frontier.splice(idx, 1)[0];
        const nk = `${nr},${nc}`;
        inFrontier.delete(nk);
        if (!remaining.has(nk)) continue;
        pushCell(nr, nc);
      }
    }

    // topRow/topCol 計算
    const topRow = Math.min(...groupCells.map(([r]) => r));
    const topRowCells = groupCells.filter(([r]) => r === topRow);
    const topCol = Math.min(...topRowCells.map(([, c]) => c));
    const target = groupCells.reduce(
      (sum, [r, c]) => (solution && solution[r][c] ? sum + board[r][c] : sum),
      0,
    );

    groups.push({ id: gid, cells: groupCells, target, topRow, topCol });
    gid++;
  }

  // 吸収後にtarget/topRow/topColを再計算
  groups.forEach((grp) => {
    grp.target = grp.cells.reduce(
      (sum, [r, c]) => (solution && solution[r][c] ? sum + board[r][c] : sum),
      0,
    );
    const topRow = Math.min(...grp.cells.map(([r]) => r));
    const topRowCells = grp.cells.filter(([r]) => r === topRow);
    grp.topRow = topRow;
    grp.topCol = Math.min(...topRowCells.map(([, c]) => c));
  });

  return groups;
}

// ============================================================
// generateGame — ゲーム盤面の生成
//
// 【生成内容】
//   board      … gridSize×gridSize の数字配列（1〜9）
//   solution   … board と同形の真偽値配列（true = FIX すべきマス）
//   rowTargets … 各行の「FIX すべきマスの合計」
//   colTargets … 各列の「FIX すべきマスの合計」
//   groups     … generateGroups で生成したグループ配列
//
// 【難易度調整（Serene = 5×5）】
//   数字を小さめにして、行/列ターゲットの 30〜50% が
//   1桁（≤9）になるまで再生成する
//
// 【グループ品質保証】
//   target=0 のグループが出たら最大20回再生成する
// ============================================================
function generateGame(gridSize) {
  const isSerene = gridSize === 5;
  let isValid = false;
  let board, solution, rowTargets, colTargets;

  while (!isValid) {
    board = [];
    solution = [];
    for (let r = 0; r < gridSize; r++) {
      board[r] = [];
      solution[r] = [];
      for (let c = 0; c < gridSize; c++) {
        // Sereneは1〜5の数字を50%の確率で使い、小さめの数字を増やす
        // 通常は1〜9
        board[r][c] =
          isSerene && Math.random() < 0.5
            ? Math.floor(Math.random() * 5) + 1 // 1〜5
            : Math.floor(Math.random() * 9) + 1; // 1〜9
        solution[r][c] = Math.random() > 0.5;
      }
    }
    rowTargets = solution.map((row, r) =>
      row.reduce((sum, sel, c) => (sel ? sum + board[r][c] : sum), 0),
    );
    colTargets = Array(gridSize).fill(0);
    for (let c = 0; c < gridSize; c++)
      for (let r = 0; r < gridSize; r++)
        if (solution[r][c]) colTargets[c] += board[r][c];

    if (rowTargets.every((v) => v > 0) && colTargets.every((v) => v > 0)) {
      // Sereneの場合：rowTargets/colTargets の3〜4割が1桁(1〜9)かチェック
      if (isSerene) {
        const allTargets = [...rowTargets, ...colTargets];
        const singleDigitCount = allTargets.filter((v) => v <= 9).length;
        const ratio = singleDigitCount / allTargets.length;
        if (ratio >= 0.3 && ratio <= 0.5) isValid = true;
      } else {
        isValid = true;
      }
    }
  }

  // グループ生成 → target=0のグループが出たら再生成
  let groups;
  let groupAttempts = 0;
  do {
    groups = generateGroups(gridSize, board, solution);
    groupAttempts++;
  } while (groups.some((g) => g.target === 0) && groupAttempts < 20);

  return { board, solution, rowTargets, colTargets, groups };
}

// ============================================================
// セルの状態定数
//   CELL_NEUTRAL … 未操作（初期状態）
//   CELL_CORRECT … FIX 確定済み（暗い色・白文字）
//   CELL_ERASED  … ERASE 消去済み（ほぼ透明）
// ============================================================
const CELL_NEUTRAL = "neutral";
const CELL_CORRECT = "correct";
const CELL_ERASED = "erased";
const CELL_WRONG_ANI = "wrong";

// ============================================================
// App — ルートコンポーネント
// 画面遷移の管理と全ゲームロジックを担当する
//
// 【画面状態 (screen)】
//   "menu"   → レベル選択メニュー
//   "game"   → ゲームプレイ中
//   "pause"  → ポーズ中（グリッドをブラー＋非表示）
//   "result" → ゲームオーバー / クリア結果
//
// 【Ref を使う理由】
//   useCallback でメモ化したハンドラは古い state を参照してしまうため、
//   最新値を ref で保持し state 変化時に同期している
// ============================================================
export default function App() {
  // ── 画面・ゲーム基本状態 ──────────────────────────────
  const [screen, setScreen] = useState("menu"); // 現在の画面

  const [gridSize, setGridSize] = useState(5);
  const [game, setGame] = useState(null);
  const [cellStates, setCellStates] = useState([]);
  const [wrongCells, setWrongCells] = useState(new Set());
  const [life, setLife] = useState(3);
  const [mode, setMode] = useState("fix");
  const [seconds, setSeconds] = useState(0);
  const [bestScores, setBestScores] = useState({});
  const [isWin, setIsWin] = useState(false);
  const [newRecord, setNewRecord] = useState(false);
  const [completedLines, setCompletedLines] = useState({
    rows: new Set(),
    cols: new Set(),
  });
  const [sparkles, setSparkles] = useState([]); // [{id, type, index, ts}]
  // ── Ref（イベントハンドラ内から最新値を参照するため） ──
  const completedLinesRef = useRef({ rows: new Set(), cols: new Set() });
  const timerRef = useRef(null);
  const gameActiveRef = useRef(false);
  const pausedRef = useRef(false);
  // クリックハンドラから最新値を参照するためのref
  const gameRef = useRef(null);
  const modeRef = useRef("fix");
  const lifeRef = useRef(3);
  const secondsRef = useRef(0);
  const gridSizeRef = useRef(5);
  const cellStatesRef = useRef([]);

  // ベストスコア読み込み
  useEffect(() => {
    const scores = {};
    for (let i = 5; i <= 8; i++) {
      const v = localStorage.getItem(`nsum_best_${i}`);
      if (v) scores[i] = parseInt(v);
    }
    setBestScores(scores);
  }, []);

  // state → ref の同期（各 state 変化時に対応する ref を更新）
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    secondsRef.current = seconds;
  }, [seconds]);
  useEffect(() => {
    gridSizeRef.current = gridSize;
  }, [gridSize]);
  useEffect(() => {
    lifeRef.current = life;
  }, [life]);
  useEffect(() => {
    gameRef.current = game;
  }, [game]);
  useEffect(() => {
    cellStatesRef.current = cellStates;
  }, [cellStates]);

  const startTimer = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (gameActiveRef.current && !pausedRef.current)
        setSeconds((s) => {
          secondsRef.current = s + 1;
          return s + 1;
        });
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => clearInterval(timerRef.current), []);

  // ── ゲーム終了処理 ────────────────────────────────────
  // win=true → クリア、win=false → ゲームオーバー
  // クリア時はベストスコアを localStorage に保存
  const endGame = useCallback(
    (win) => {
      if (!gameActiveRef.current) return; // 二重呼び出し防止
      gameActiveRef.current = false;
      stopTimer();
      setIsWin(win);
      if (win) {
        const sz = gridSizeRef.current;
        const sec = secondsRef.current;
        const key = `nsum_best_${sz}`;
        const prev = localStorage.getItem(key);
        if (!prev || sec < parseInt(prev)) {
          localStorage.setItem(key, sec);
          setNewRecord(true);
          setBestScores((b) => ({ ...b, [sz]: sec }));
        }
      }
      setScreen("result");
    },
    [stopTimer],
  );

  // ── ゲーム開始 ────────────────────────────────────────
  // レベル選択時に呼ばれ、盤面生成・全 state/ref の初期化を行う
  const startGame = useCallback(
    (size) => {
      clearInterval(timerRef.current);
      const g = generateGame(size);
      const initStates = Array.from({ length: size }, () =>
        Array(size).fill(CELL_NEUTRAL),
      );
      gameRef.current = g;
      gridSizeRef.current = size;
      lifeRef.current = 3;
      secondsRef.current = 0;
      modeRef.current = "fix";
      cellStatesRef.current = initStates;
      setGridSize(size);
      setGame(g);
      setCellStates(initStates);
      setWrongCells(new Set());
      setLife(3);
      setMode("fix");
      setSeconds(0);
      setIsWin(false);
      setNewRecord(false);
      completedLinesRef.current = { rows: new Set(), cols: new Set() };
      setCompletedLines({ rows: new Set(), cols: new Set() });
      setSparkles([]);
      gameActiveRef.current = true;
      pausedRef.current = false;
      setScreen("game");
      startTimer();
    },
    [startTimer],
  );

  // ── メニューに戻る ────────────────────────────────────
  const backToMenu = useCallback(() => {
    stopTimer();
    gameActiveRef.current = false;
    setScreen("menu");
    const scores = {};
    for (let i = 5; i <= 8; i++) {
      const v = localStorage.getItem(`nsum_best_${i}`);
      if (v) scores[i] = parseInt(v);
    }
    setBestScores(scores);
  }, [stopTimer]);

  // ── ポーズ切替：screen を "game" ↔ "pause" で切り替える ──
  const togglePause = useCallback(() => {
    if (!gameActiveRef.current) return;
    pausedRef.current = !pausedRef.current;
    setScreen((s) => (s === "game" ? "pause" : "game"));
  }, []);

  // クリック遅延タイマー（シングル/ダブル判定用）
  const clickTimerRef = useRef(null);

  // ── セル操作の共通処理 ───────────────────────────────
  // handleCellClick / handleCellDoubleClick の両方から呼ばれる
  // forceMode が指定された場合はそのモードを使う（ダブルクリック時は "erase"）
  const executeCellAction = useCallback(
    (r, c, forceMode) => {
      if (!gameActiveRef.current || pausedRef.current) return;
      const g = gameRef.current;
      if (!g) return;
      const prev = cellStatesRef.current;
      const st = prev[r][c];
      if (st === CELL_CORRECT || st === CELL_ERASED) return;

      const currentMode = forceMode || modeRef.current;
      const isCorrectClick =
        (currentMode === "fix" && g.solution[r][c]) ||
        (currentMode === "erase" && !g.solution[r][c]);

      if (isCorrectClick) {
        const next = prev.map((row) => [...row]);
        next[r][c] = currentMode === "fix" ? CELL_CORRECT : CELL_ERASED;
        cellStatesRef.current = next;
        setCellStates(next);

        // 行/列完了チェック
        const sz = g.board.length;
        const newCompleted = {
          rows: new Set(completedLinesRef.current.rows),
          cols: new Set(completedLinesRef.current.cols),
        };
        const newSparkles = [];
        const ts = Date.now();

        // 行完了チェック：そのセル自体が操作済み、またはその列が既に完了している
        for (let ri = 0; ri < sz; ri++) {
          if (!newCompleted.rows.has(ri)) {
            const rowDone = Array.from({ length: sz }, (_, ci) => ci).every(
              (ci) => {
                const st = next[ri][ci];
                const cellOk =
                  (g.solution[ri][ci] && st === CELL_CORRECT) ||
                  (!g.solution[ri][ci] && st === CELL_ERASED);
                return cellOk || newCompleted.cols.has(ci);
              },
            );
            if (rowDone) {
              newCompleted.rows.add(ri);
              newSparkles.push({
                id: `r${ri}-${ts}`,
                type: "row",
                index: ri,
                ts,
                particles: makeParticles(),
              });
            }
          }
        }
        // 列完了チェック：そのセル自体が操作済み、またはその行が既に完了している
        for (let ci = 0; ci < sz; ci++) {
          if (!newCompleted.cols.has(ci)) {
            const colDone = Array.from({ length: sz }, (_, ri) => ri).every(
              (ri) => {
                const st = next[ri][ci];
                const cellOk =
                  (g.solution[ri][ci] && st === CELL_CORRECT) ||
                  (!g.solution[ri][ci] && st === CELL_ERASED);
                return cellOk || newCompleted.rows.has(ri);
              },
            );
            if (colDone) {
              newCompleted.cols.add(ci);
              newSparkles.push({
                id: `c${ci}-${ts}`,
                type: "col",
                index: ci,
                ts,
                particles: makeParticles(),
              });
            }
          }
        }

        // completedLines は常に最新に更新
        completedLinesRef.current = newCompleted;
        setCompletedLines({
          rows: new Set(newCompleted.rows),
          cols: new Set(newCompleted.cols),
        });
        if (newSparkles.length > 0) {
          setSparkles((prev) => [...prev, ...newSparkles]);
          setTimeout(() => {
            const ids = new Set(newSparkles.map((s) => s.id));
            setSparkles((prev) => prev.filter((sp) => !ids.has(sp.id)));
          }, 2500);
        }

        // 勝利判定：全マスが「操作済み」か「所属行/列が完了」かチェック
        const allDone = next.every((row, ri) =>
          row.every((cellSt, ci) => {
            const cellHandled =
              cellSt === CELL_CORRECT || cellSt === CELL_ERASED;
            const itsLineDone =
              newCompleted.rows.has(ri) || newCompleted.cols.has(ci);
            return cellHandled || itsLineDone;
          }),
        );
        if (allDone) {
          setTimeout(() => endGame(true), 0);
        }
      } else {
        const newLife = lifeRef.current - 1;
        lifeRef.current = newLife;
        setLife(newLife);
        setWrongCells((wc) => {
          const s = new Set(wc);
          s.add(`${r}-${c}`);
          return s;
        });
        setTimeout(() => {
          setWrongCells((wc) => {
            const s = new Set(wc);
            s.delete(`${r}-${c}`);
            return s;
          });
        }, 400);
        if (newLife <= 0) setTimeout(() => endGame(false), 0);
      }
    },
    [endGame],
  );

  // シングルクリック：220ms 待ってからモードで操作
  // 220ms 以内にダブルクリックが来たらタイマーをキャンセルし ERASE に委ねる
  // → 1発目クリックは必ずタイマーが発火するまで何も起きない
  const handleCellClick = useCallback(
    (r, c) => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        executeCellAction(r, c, null); // modeRef のモードで実行
      }, 220);
    },
    [executeCellAction],
  );

  // ダブルクリック：進行中のシングルタイマーをキャンセルして ERASE のみ実行
  // タイマーをキャンセルするので 1発目クリックの誤判定は起きず残機も減らない
  const handleCellDoubleClick = useCallback(
    (r, c) => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current); // シングルクリックのタイマーをキャンセル
        clickTimerRef.current = null;
      }
      executeCellAction(r, c, "erase"); // ERASE として1回だけ実行
    },
    [executeCellAction],
  );

  // ── レンダリング ──────────────────────────────────────
  if (screen === "menu") {
    return <MenuScreen bestScores={bestScores} onStart={startGame} />;
  }

  return (
    <GameScreen
      game={game}
      gridSize={gridSize}
      cellStates={cellStates}
      wrongCells={wrongCells}
      life={life}
      mode={mode}
      seconds={seconds}
      screen={screen}
      isWin={isWin}
      newRecord={newRecord}
      completedLines={completedLines}
      sparkles={sparkles}
      onCellClick={handleCellClick}
      onCellDoubleClick={handleCellDoubleClick}
      onSetMode={setMode}
      onTogglePause={togglePause}
      onRestart={() => startGame(gridSize)}
      onBackToMenu={backToMenu}
    />
  );
}

// ============================================================
// MenuScreen — レベル選択メニュー画面
// bestScores: { 5: 秒数, 6: 秒数, ... } をベストタイムとして表示
// ============================================================
function MenuScreen({ bestScores, onStart }) {
  const levels = [
    { size: 5, name: "Serene", sub: "5×5" },
    { size: 6, name: "Dream", sub: "6×6" },
    { size: 7, name: "Spirit", sub: "7×7" },
    { size: 8, name: "Cosmos", sub: "8×8" },
  ];

  return (
    <div style={styles.menuRoot}>
      <h1 style={styles.title}>pure sums</h1>
      <p style={styles.subtitle}>number × group × harmony</p>
      {levels.map(({ size, name, sub }) => (
        <button
          key={size}
          style={styles.levelCard}
          onClick={() => onStart(size)}
        >
          <span style={styles.levelName}>{name}</span>
          <span style={styles.levelSub}>{sub}</span>
          {bestScores[size] && (
            <span style={styles.bestScore}>
              best {formatTime(bestScores[size])}
            </span>
          )}
        </button>
      ))}
      <p style={styles.hint}>タップで選択 / ミストで消去</p>
    </div>
  );
}

// ============================================================
// GameScreen — ゲームプレイ画面
// グリッド描画・モードボタン・ポーズ/リザルトオーバーレイを含む
// ============================================================
function GameScreen({
  game,
  gridSize,
  cellStates,
  wrongCells,
  life,
  mode,
  seconds,
  screen,
  isWin,
  newRecord,
  completedLines,
  sparkles,
  onCellClick,
  onCellDoubleClick,
  onSetMode,
  onTogglePause,
  onRestart,
  onBackToMenu,
}) {
  if (!game) return null;

  const vw = typeof window !== "undefined" ? window.innerWidth : 400;
  const cellSize = Math.min(Math.floor((vw - 60) / (gridSize + 1)), 58);
  const fontSize = Math.max(cellSize * 0.38, 12);
  const gap = 4;

  // グループマップ
  const groupMap = {};
  game.groups.forEach((grp) => {
    grp.cells.forEach(([r, c]) => {
      groupMap[`${r}-${c}`] = grp;
    });
  });

  // 各グループの「残り合計」= target - FIX済み合計
  const groupRemains = {};
  game.groups.forEach((grp) => {
    const fixedSum = grp.cells.reduce(
      (sum, [r, c]) =>
        cellStates[r]?.[c] === CELL_CORRECT ? sum + game.board[r][c] : sum,
      0,
    );
    groupRemains[grp.id] = grp.target - fixedSum;
  });

  // 行・列の現在FIX合計
  const rowSums = game.board.map((row, r) =>
    row.reduce(
      (sum, val, c) => (cellStates[r]?.[c] === CELL_CORRECT ? sum + val : sum),
      0,
    ),
  );
  const colSums = game.board[0].map((_, c) =>
    game.board.reduce(
      (sum, row, r) =>
        cellStates[r]?.[c] === CELL_CORRECT ? sum + row[c] : sum,
      0,
    ),
  );

  const isPaused = screen === "pause";
  const isResult = screen === "result";

  return (
    <div style={styles.gameRoot}>
      {/* ヘッダー */}
      <div style={styles.header}>
        <div style={styles.lifeRow}>
          {[...Array(3)].map((_, i) => (
            <span key={i} style={{ opacity: i < life ? 1 : 0.2, fontSize: 18 }}>
              ♥
            </span>
          ))}
        </div>
        <div style={styles.timerBox}>
          <span style={styles.timerText}>{formatTime(seconds)}</span>
          <button style={styles.pauseBtn} onClick={onTogglePause}>
            {isPaused ? "▶" : "⏸"}
          </button>
        </div>
      </div>

      {/* グリッドラッパー */}
      <div
        style={{
          ...styles.gridWrapper,
          filter: isPaused ? "blur(18px)" : "none",
          opacity: isPaused ? 0 : 1,
          transition: "all 0.3s",
          position: "relative",
          background: "rgba(255,255,255,0.22)", // 盤面パネルの背景
          borderRadius: 20,
          padding: "12px 24px 24px 4px",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          boxShadow: "0 4px 24px rgba(120,100,180,0.10)", // 盤面パネルの影
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `${cellSize}px repeat(${gridSize}, ${cellSize}px)`,
            gap,
          }}
        >
          {/* 左上空白 */}
          <div />
          {/* 列ヒント */}
          {game.colTargets.map((t, c) => (
            <HintCell
              key={`ch-${c}`}
              target={t}
              current={colSums[c]}
              size={cellSize}
              fontSize={fontSize}
              done={completedLines.cols.has(c)}
            />
          ))}
          {/* 行ごと */}
          {game.board.map((row, r) => {
            const rowDone = completedLines.rows.has(r);
            return (
              <React.Fragment key={r}>
                <HintCell
                  target={game.rowTargets[r]}
                  current={rowSums[r]}
                  size={cellSize}
                  fontSize={fontSize}
                  done={rowDone}
                />
                {row.map((val, c) => {
                  const key = `${r}-${c}`;
                  const grp = groupMap[key];
                  const remain = grp ? groupRemains[grp.id] : null;
                  const groupDone =
                    remain !== null && remain === 0 && grp.target > 0;
                  const colDone = completedLines.cols.has(c);
                  const thisCellLineDone = rowDone || colDone;

                  // グループ合計数の表示先を決定：
                  // 本来の左上マスが lineDone の場合、グループ内で
                  // lineDone でない最左上マス（行→列の順でソート）に表示する
                  let isTopLeft = false;
                  if (grp) {
                    const originalTopLeft =
                      grp.topRow === r && grp.topCol === c;
                    const originalLineDone =
                      completedLines.rows.has(grp.topRow) ||
                      completedLines.cols.has(grp.topCol);
                    if (originalTopLeft && !originalLineDone) {
                      // 通常ケース：本来の左上マスが見えている
                      isTopLeft = true;
                    } else if (!originalTopLeft && originalLineDone) {
                      // 本来の左上が消えた：代替の左上マスを探す
                      const visible = grp.cells
                        .filter(
                          ([cr, cc]) =>
                            !completedLines.rows.has(cr) &&
                            !completedLines.cols.has(cc),
                        )
                        .sort(([ar, ac], [br, bc]) =>
                          ar !== br ? ar - br : ac - bc,
                        );
                      if (
                        visible.length > 0 &&
                        visible[0][0] === r &&
                        visible[0][1] === c
                      ) {
                        isTopLeft = true;
                      }
                    }
                  }
                  return (
                    <NumberCell
                      key={key}
                      value={val}
                      state={cellStates[r]?.[c] || CELL_NEUTRAL}
                      isWrong={wrongCells.has(key)}
                      group={grp}
                      isGroupTopLeft={isTopLeft}
                      groupRemain={remain}
                      groupDone={groupDone}
                      size={cellSize}
                      fontSize={fontSize}
                      lineDone={rowDone || colDone}
                      onClick={() => onCellClick(r, c)}
                      onDoubleClick={() => onCellDoubleClick(r, c)}
                    />
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>

        {/* スパークルエフェクト */}
        {sparkles.map((sp) => (
          <SparkleEffect
            key={sp.id}
            type={sp.type}
            index={sp.index}
            cellSize={cellSize}
            gap={gap}
            gridSize={gridSize}
            particles={sp.particles || []}
          />
        ))}
      </div>

      {/* モードボタン */}
      <div style={styles.modeRow}>
        <ModeBtn
          label="ERASE"
          sub="🙅"
          active={mode === "erase"}
          color="erase"
          onClick={() => onSetMode("erase")}
        />
        <ModeBtn
          label="FIX"
          sub="🙆"
          active={mode === "fix"}
          color="fix"
          onClick={() => onSetMode("fix")}
        />
      </div>

      {/* ポーズオーバーレイ */}
      {isPaused && (
        <div style={styles.overlay}>
          <p style={styles.overlayTitle}>PAUZE...</p>
          <button style={styles.overlayBtn} onClick={onTogglePause}>
            KEEP ON
          </button>
          <button
            style={{ ...styles.overlayBtn, ...styles.overlayBtnSub }}
            onClick={onBackToMenu}
          >
            Title
          </button>
        </div>
      )}

      {/* リザルトオーバーレイ */}
      {isResult && (
        <div
          style={{ ...styles.overlay, background: "rgba(224,195,252,0.88)" }}
        >
          {" "}
          {/* リザルトオーバーレイの背景 */}
          <p style={styles.overlayTitle}>
            {isWin ? "✦ light clear ✦" : "lost spirit"}
          </p>
          {/* クリアタイム表示 */}
          {isWin && (
            <p
              style={{
                color: "#7a60c0" /* クリアタイムのテキスト */,
                fontSize: 14,
              }}
            >
              aura time: {formatTime(seconds)}
            </p>
          )}
          {/* ベスト更新時のメッセージ */}
          {newRecord && (
            <p
              style={{
                color: "#c060e0" /* ベスト更新メッセージのテキスト */,
                fontWeight: 600,
              }}
            >
              ✧ New Record ✧
            </p>
          )}
          <button style={styles.overlayBtn} onClick={onRestart}>
            Retry
          </button>
          <button
            style={{ ...styles.overlayBtn, ...styles.overlayBtnSub }}
            onClick={onBackToMenu}
          >
            Title
          </button>
        </div>
      )}
    </div>
  );
}

// ── スパークルエフェクト（stateなし・純粋描画）──────────────
// ============================================================
// SparkleEffect — 行/列完了時のキラキラエフェクト
// state を持たない純粋な描画コンポーネント
// particles は App 側で makeParticles() により生成済みのデータを受け取る
//   行完了 → 左右両端から粒子を噴出
//   列完了 → 上下両端から粒子を噴出
// CSS カスタムプロパティ --dx/--dy で終点座標をアニメーションに渡す
// ============================================================
function SparkleEffect({ type, index, cellSize, gap, gridSize, particles }) {
  const hintSize = cellSize;
  const totalWidth = hintSize + gridSize * (cellSize + gap);
  const totalHeight = hintSize + gridSize * (cellSize + gap);

  const originY =
    type === "row"
      ? hintSize + gap + index * (cellSize + gap) + cellSize / 2
      : 0;
  const originX =
    type === "col"
      ? hintSize + gap + index * (cellSize + gap) + cellSize / 2
      : 0;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: totalWidth,
        height: totalHeight,
        pointerEvents: "none",
        overflow: "visible",
        zIndex: 20,
      }}
    >
      {particles.map((p) => {
        const x0 =
          type === "row" ? (p.side === "left" ? 0 : totalWidth) : originX;
        const y0 =
          type === "row" ? originY : p.side === "left" ? 0 : totalHeight;

        const rad = (p.angle * Math.PI) / 180;
        const dx = Math.cos(rad) * p.speed;
        const dy = Math.sin(rad) * p.speed;

        return (
          <div
            key={p.id}
            style={{
              position: "absolute",
              left: x0,
              top: y0,
              fontSize: p.size,
              color: p.color,
              fontWeight: "bold",
              animation: `sparkle-fly 2s ease-out ${p.delay}s both`,
              "--dx": `${dx}px`,
              "--dy": `${dy}px`,
              transformOrigin: "center",
              lineHeight: 1,
            }}
          >
            {p.shape}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// HintCell — 行/列のヒント数字セル（左端・上部）
// target  … その行/列の正解 FIX 合計
// current … 現在の FIX 合計
// → 残り（target - current）を中央に表示
// → 残り 0 になったら ✓ 表示
// → lineDone（行/列完了）なら空白セルを返す
// ============================================================
function HintCell({ target, current, size, fontSize, done: lineDone }) {
  const remain = target - current;
  const done = remain === 0;
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* 残り数を中央に表示。行/列完了時は非表示（opacity:0）、0になったら ✓ */}
      <span
        style={{
          fontSize: fontSize * 0.85,
          color: done
            ? "#4a9a6a" // ヒント数字（残り0・クリア済み）
            : "#8888bb", // ヒント数字（残りあり）
          fontWeight: done ? 700 : 300,
          transition: "color 0.2s",
          opacity: lineDone ? 0 : 1, // 行/列完了後はヒント数字を非表示
        }}
      >
        {done ? "✓" : remain}
      </span>
    </div>
  );
}

// ============================================================
// NumberCell — 数字マス（盤面の各セル）
//
// 状態別スタイル：
//   CELL_CORRECT → correctBg（暗い色）＋グループ枠、文字白
//   CELL_ERASED  → ほぼ透明、文字 opacity 0.15
//   isWrong      → 薄い赤（shake アニメーション付き）
//   通常         → グループ色（少し明るめ）、枠なし
//
// lineDone（行/列完了）のマスは：
//   背景色・グループ左上数字はそのまま残す
//   セル内の数字のみ非表示にする（opacity: 0）
// isGroupTopLeft のマスの左上にグループ残り数を小さく表示
// ============================================================
function NumberCell({
  value,
  state,
  isWrong,
  group,
  isGroupTopLeft,
  groupRemain,
  groupDone,
  size,
  fontSize,
  lineDone,
  onClick,
  onDoubleClick,
}) {
  const color = group ? GROUP_COLORS[group.id % GROUP_COLORS.length] : null;

  let bg, border, textOpacity;

  if (lineDone) {
    // 行/列完了後：ERASE済みと同じ色・opacityにする
    bg = color
      ? color.bg.replace("0.35", "0.1") // ERASE済みマス背景と同じ（グループ色を極薄に）
      : "rgba(255,255,255,0.1)"; // ERASE済みマス背景と同じ（グループなし時）
    border = "none";
  } else if (state === CELL_CORRECT) {
    // FIX確定：専用の暗い色・数字を白に
    bg = color
      ? color.correctBg // FIX確定マス背景（GROUP_COLORS.correctBg を使用）
      : "rgba(100,160,100,0.85)"; // FIX確定マス背景（グループなし時）
    border = color
      ? `2px solid ${color.border}` // FIX確定マスの枠線（GROUP_COLORS.border を使用）
      : "2px solid rgba(100,160,100,0.7)"; // FIX確定マスの枠線（グループなし時）
    textOpacity = 1;
  } else if (state === CELL_ERASED) {
    // 消去：非常に薄い・枠なし
    bg = color
      ? color.bg.replace("0.35", "0.2") // ERASE済みマス背景（グループ色を極薄に）
      : "rgba(255,255,255,0.2)"; // ERASE済みマス背景（グループなし時）
    border = "none";
    textOpacity = 0.15;
  } else if (isWrong) {
    bg = "rgba(255,182,193,0.75)"; // ミス時のマス背景
    border = "none";
    textOpacity = 1;
  } else {
    // 通常：明るいグループ色・枠なし
    bg = color
      ? color.bg.replace("0.35", "0.55") // 通常マス背景（グループ色を少し明るく）
      : "rgba(255,255,255,0.55)"; // 通常マス背景（グループなし時）
    border = "none";
    textOpacity = 1;
  }

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{
        width: size,
        height: size,
        position: "relative",
        background: bg,
        border,
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 500,
        fontSize,
        color:
          state === CELL_CORRECT
            ? "#ffffff" // FIX確定マスの数字
            : "#4a4a7a", // 通常・ERASE済みマスの数字
        cursor: lineDone ? "default" : "pointer", // 列/行完了後はクリック不可
        transition: "background 0.3s",
        animation: isWrong ? "shake 0.4s ease" : "none",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* グループ残り合計（左上）：行/列完了後も表示を維持 */}
      {isGroupTopLeft && group && color && (
        <span
          style={{
            position: "absolute",
            top: 2,
            left: 3,
            fontSize: fontSize * 0.42,
            color: groupDone
              ? "#2a8050" // グループ完了時の ✓ マーク
              : color
                ? color.text
                : "#666", // グループ左上の残り合計数字
            fontWeight: 700,
            lineHeight: 1,
            pointerEvents: "none",
            opacity: state === CELL_ERASED ? 0.35 : 1,
          }}
        >
          {groupDone ? "✓" : groupRemain !== null ? groupRemain : group.target}
        </span>
      )}
      {/* 数字：行/列完了時は非表示（opacity:0）、それ以外は状態に応じた透明度 */}
      <span style={{ opacity: lineDone ? 0 : textOpacity }}>{value}</span>
    </div>
  );
}

// ============================================================
// ModeBtn — FIX / ERASE 切替ボタン
// active 時：FIX → 薄い青、ERASE → 薄い赤
// 非 active 時：共通のグレー透過スタイル
// ============================================================
function ModeBtn({ label, sub, active, color, onClick }) {
  // 選択中の背景色：erase=薄赤、fix=薄青
  const activeBg =
    color === "erase"
      ? "rgba(255, 180, 180, 0.55)" // ERASEボタン選択中の背景
      : "rgba(180, 210, 255, 0.55)"; // FIXボタン選択中の背景
  const activeBorder =
    color === "erase"
      ? "1.5px solid rgba(220, 100, 100, 0.5)" // ERASEボタン選択中の枠線
      : "1.5px solid rgba(80, 150, 220, 0.5)"; // FIXボタン選択中の枠線
  const activeColor =
    color === "erase"
      ? "#9b3e3e" // ERASEボタン選択中のテキスト
      : "#3b60a0"; // FIXボタン選択中のテキスト

  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "inherit",
        padding: "12px 28px",
        background: active
          ? activeBg // 選択中のボタン背景
          : "rgba(255,255,255,0.18)", // 非選択のボタン背景
        color: active
          ? activeColor // 選択中のボタンテキスト
          : "#8888aa", // 非選択のボタンテキスト
        border: active
          ? activeBorder // 選択中のボタン枠線
          : "1px dashed rgba(200,200,210,0.45)", // 非選択のボタン枠線
        borderRadius: 20,
        cursor: "pointer",
        opacity: active ? 1 : 0.55,
        transform: active ? "scale(1.03)" : "scale(0.97)",
        transition: "all 0.25s",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
      }}
    >
      <span style={{ fontSize: 15, fontWeight: active ? 700 : 400 }}>
        {label}
      </span>
      <span style={{ fontSize: 9, opacity: 0.7, letterSpacing: 1 }}>{sub}</span>
    </button>
  );
}

// ============================================================
// スタイル定数
// 共通フォント/カラーを base にまとめ各コンポーネントから参照する
// ============================================================
const base = {
  fontFamily: "'Quicksand', 'Hiragino Kaku Gothic ProN', sans-serif",
  color: "#5a5a8a", // 全コンポーネント共通のテキスト色
};

const styles = {
  menuRoot: {
    ...base,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    minHeight: "100vh",
    background: "linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)", // メニュー画面の背景
    padding: "30px 20px",
  },
  title: {
    fontFamily: "'Montserrat', serif",
    fontWeight: 200,
    fontStyle: "italic",
    letterSpacing: 8,
    textTransform: "lowercase",
    fontSize: 28,
    margin: "0 0 4px",
    textShadow: "0 0 20px rgba(255,255,255,0.9)", // タイトルのグロー効果
    color: "#5a5a8a", // タイトルのテキスト
  },
  subtitle: {
    fontSize: 10,
    letterSpacing: 3,
    opacity: 0.6,
    margin: "0 0 30px",
  },
  levelCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    width: 220,
    padding: "18px 0",
    background: "rgba(255,255,255,0.3)", // レベル選択カードの背景
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    border: "1px solid rgba(255,255,255,0.5)", // レベル選択カードの枠線
    borderRadius: 24,
    cursor: "pointer",
    marginBottom: 14,
    boxShadow: "0 8px 32px rgba(100,80,180,0.08)", // レベル選択カードの影
    fontFamily: "inherit",
    color: "#5a5a8a", // レベル選択カードのテキスト
    transition: "transform 0.2s, background 0.2s",
  },
  levelName: { fontSize: 16, fontWeight: 500 },
  levelSub: { fontSize: 11, opacity: 0.6 },
  bestScore: { fontSize: 10, opacity: 0.5, marginTop: 2 },
  hint: { fontSize: 10, opacity: 0.4, marginTop: 16, letterSpacing: 2 },

  gameRoot: {
    ...base,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    minHeight: "100vh",
    background: "linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)", // ゲーム画面の背景
    padding: "16px 10px 30px",
    position: "relative",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    maxWidth: 480,
    marginBottom: 16,
  },
  lifeRow: { display: "flex", gap: 4, color: "#e07090", fontSize: 18 }, // ♥ ライフ表示
  timerBox: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "rgba(255,255,255,0.3)", // タイマーボックスの背景
    border: "1px solid rgba(255,255,255,0.5)", // タイマーボックスの枠線
    borderRadius: 50,
    padding: "6px 18px",
  },
  timerText: { fontSize: 14, letterSpacing: 2 },
  pauseBtn: {
    background: "none",
    border: "none",
    color: "#5a5a8a", // ポーズボタンのテキスト
    cursor: "pointer",
    fontSize: 12,
    padding: 0,
  },
  gridWrapper: { marginBottom: 24 },
  modeRow: { display: "flex", gap: 20 },
  overlay: {
    position: "fixed",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    background: "linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)", // ポーズオーバーレイの背景
    zIndex: 100,
  },
  overlayTitle: {
    fontFamily: "'Montserrat', serif",
    fontWeight: 200,
    fontStyle: "italic",
    fontSize: 26,
    letterSpacing: 4,
    color: "#5a5a8a", // ポーズ・リザルト画面のタイトルテキスト
    margin: 0,
  },
  overlayBtn: {
    fontFamily: "inherit",
    padding: "12px 36px",
    background: "rgba(255,255,255,0.6)", // ポーズ・リザルトボタンの背景
    color: "#5a5a8a", // ポーズ・リザルトボタンのテキスト
    border: "1px solid rgba(255,255,255,0.5)", // ポーズ・リザルトボタンの枠線
    borderRadius: 20,
    cursor: "pointer",
    fontSize: 14,
    letterSpacing: 1,
  },
  overlayBtnSub: {
    background: "rgba(255,255,255,0.2)", // タイトルに戻るボタンの背景
  },
};

// ============================================================
// グローバル CSS の注入（ランタイムで <head> に追加）
// ・Google Fonts（Quicksand / Montserrat）
// ・shake        … ミス時のセルが左右に揺れる
// ・sparkle-fly  … CSS カスタムプロパティ --dx/--dy で終点を動的に
//                  指定し、粒子が飛び散る演出を実現
// ============================================================
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@300;500&family=Montserrat:ital,wght@1,200&display=swap');
    @keyframes shake {
      0%,100% { transform: translateX(0); }
      25% { transform: translateX(-5px); }
      75% { transform: translateX(5px); }
    }
    @keyframes sparkle-fly {
      0%   { transform: translate(0, 0) scale(1); opacity: 1; }
      60%  { opacity: 0.9; }
      100% { transform: translate(var(--dx), var(--dy)) scale(0.2); opacity: 0; }
    }
    * { box-sizing: border-box; }
    body { margin: 0; }
  `;
  document.head.appendChild(style);
}
