# 協力型パーティーWebゲーム『テーマ・スケール』詳細設計書

## 1. システム構成と技術スタック

本システムは、低遅延な双方向通信と堅牢な状態管理を実現するため、以下の技術スタックを採用する。

### 1.1. 技術スタック (確定)

*   **Runtime:** Node.js (v20 LTS以上)
*   **Language:** TypeScript (Strict Mode)
*   **Backend Framework:** Fastify または Express
*   **Realtime Engine:** Socket.IO (v4)
    
    *   WebSocket接続を基本とし、切断時の自動再接続、ルーム機能を利用。
*   **Frontend Framework:** React (Vite) + TypeScript
*   **State Management:** React Hooks + Context API (またはZustand)
*   **Styling:** Tailwind CSS
*   **Infrastructure:** Docker Compose (App Container + Nginx Reverse Proxy)

### 1.2. セキュリティ・信頼性要件

*   **Rate Limiting:** WebSocketメッセージに対し、1ユーザー(Socket)あたり **10 messages/sec** のレートリミットを設ける。超過時は警告または一時切断を行う。
*   **Sanitization:** すべてのテキスト入力（名前、チャット、テーマ等）に対し、XSS対策および文字数制限（最大50文字、チャットは100文字）を適用する。
*   **Validation:** すべての受信データに対し、型チェックと範囲チェック（数値のMin/Max）を行う。

### 1.3. アーキテクチャ概要

```
graph TD
    Client[Browser (React App)] <-->|WebSocket (Socket.IO)| Nginx[Nginx Proxy]
    Nginx <-->|WebSocket| Server[Node.js Server]
    
    subgraph "Server Memory (State Store)"
        RoomMgr[Room Manager]
        SessionMgr[User Session Manager]
    end
    
    Server --> RoomMgr
    Server --> SessionMgr

```

## 2. データモデル設計 (Server-Side In-Memory)

すべてのゲーム状態はサーバーのオンメモリで管理する。データの整合性を保つため、状態の更新は必ずサーバーサイドの単一スレッド（イベントループ）内で同期的に実行される。

### 2.1. 型定義 (Type Definitions)

```
// 基本型
type PlayerRole = 'PLAYER' | 'SPECTATOR';
type ConnectionStatus = 'ONLINE' | 'OFFLINE';
type GamePhase = 
  | 'LOBBY'               // 待機中
  | 'PLAYING_EXPRESSION'  // 表現フェーズ
  | 'PLAYING_SUBMISSION'  // 提出フェーズ
  | 'RESULT_REVEAL'       // 結果発表（成功/失敗/ゲーム終了等の表示）
  | 'RESULT_VOTING'       // 失敗時の投票
  | 'ENDED';              // ゲーム終了（クリア/ゲームオーバー/人数不足）

// カード情報（サーバー内部用）
interface Card {
  id: string;        // UUID v4
  number: number;    // 1-100
  ownerId: string;   // 所有者ID
  metaphor: string;  // 入力された「たとえ」
  order: number;     // 提出エリアでの順序 (0-indexed, 未提出=-1)
  isSubmitted: boolean; // 個人の提出完了フラグ
}

// プレイヤー情報
interface Player {
  userId: string;    // UUID v4 (永続ID)
  socketId: string;  // Socket.IO ID (接続ごとに変化)
  name: string;
  color: string;     // HEX (#RRGGBB)
  role: PlayerRole;
  status: ConnectionStatus;
  isReady: boolean;
  joinedAt: number;  // 入室タイムスタンプ (ホスト委譲判定用)
  lastActiveAt: number; // 最終通信時刻
  lastRequestAt?: number; // レートリミット用
  requestCount?: number;  // レートリミット用
  vote?: 'CONTINUE' | 'REDUCE'; // 投票内容
}

// テーマ情報
interface Theme {
  category: string;
  title: string;      // テーマ名
  scaleMin: string;   // スケール1の例
  scaleMax: string;   // スケール100の例
  editingUserId: string | null; // 現在編集中のユーザーID (排他制御)
  lockExpiresAt: number | null; // ロック自動解除時刻
}

// ゲーム設定（バリデーション範囲付き）
interface GameSettings {
  initialHandCount: number; // 1-10
  maxLifes: number;         // 1-10
  winConditionCount: number;// 1-10
  timeLimitExpression: number; // 10-300 (秒)
  timeLimitSubmission: number; // 10-300 (秒)
  timeLimitVoting: number;     // 10-60 (秒)
  maxSpectators: number;       // 0-20
}

// ゲームルーム (Root State)
interface GameRoom {
  roomId: string;
  hostId: string;
  phase: GamePhase;
  phaseEndTime: number; // フェーズ終了予定時刻 (Unix Time, 0なら無制限)
  createdAt: number;    // ルーム作成時刻 (GC用)
  lastActivityAt: number; // 最終操作時刻 (GC用)
  
  // 設定
  settings: GameSettings;

  // 進行状態
  currentRound: number;
  currentHandCount: number; // 現在のラウンドでの1人あたりの配布枚数
  successCount: number;
  currentLifes: number;
  isEndlessMode: boolean; // エンドレスモード突入フラグ
  resultMessage?: string; // 結果画面に表示する特別メッセージ（EXTRA CLEAR等）
  resultInvalidCardIds?: string[]; // ドボンしたカードのIDリスト
  
  // データストア
  theme: Theme;
  players: Map<string, Player>; // userId -> Player
  deck: number[];               // 現在の山札
  cards: Card[];                // ゲーム内の全カード

  // 内部制御用
  timerId: NodeJS.Timeout | null; // フェーズタイムアウト用タイマー
}

```

## 3. 状態遷移設計 (State Machine)

ゲームの進行は以下のステートマシンに従う。サーバーはイベントやタイマーをトリガーに状態を遷移させ、`room:update` をブロードキャストする。

**重要:** フェーズ遷移時は必ず **`clearTimeout(timerId)`** を実行し、前フェーズのタイマーを破棄すること。

```
stateDiagram-v2
    [*] --> LOBBY
    LOBBY --> PLAYING_EXPRESSION: Host Starts Game
    
    state Round {
        PLAYING_EXPRESSION --> PLAYING_SUBMISSION: Time Limit
        PLAYING_SUBMISSION --> RESULT_REVEAL: All Submitted / Time Limit
    }

    state Result {
        RESULT_REVEAL --> PLAYING_EXPRESSION: Success (Next Round)
        RESULT_REVEAL --> RESULT_VOTING: Failure (Life > 0)
        RESULT_REVEAL --> ENDED: Game Over / Game Clear / Extra Clear
        
        RESULT_VOTING --> PLAYING_EXPRESSION: Voting Complete (Retry)
    }

    ENDED --> LOBBY: Host Resets (Manual)

```

## 4. WebSocket API 仕様

### 4.1. 共通仕様

*   **Ack:** 全ての `emit` に対し、サーバーは `{ success: boolean, error?: string }` を返す。
*   **Timestamp:** サーバーからの時刻情報はすべて Unix Timestamp (ms) とする。
*   **フェーズガード:** 現在のフェーズで許可されていない操作は無視またはエラーを返す。

### 4.2. クライアント送信 (Client -> Server)

| イベント名                | ペイロード                               | バリデーション・処理内容                                                                       |
| -------------------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| join                 | { roomId, name, userId? }           | 入室/再接続処理 (4.4参照)。                                                                  |
| chat:send            | { text }                            | チャット送信。文字数制限(100)。全参加者に chat:broadcast。                                            |
| game:update_settings | { settings: Partial<GameSettings> } | ホストのみ。ロビーフェーズのみ。数値範囲チェック必須。                                                        |
| game:start           | {}                                  | ホストのみ。バリデーション: initialHandCount * PLAYER数 <= 100。成功時、変数を初期化し PLAYING_EXPRESSION へ。 |
| game:submit_metaphor | { cardId, text }                    | 所有者・表現フェーズのみ。たとえ入力。文字数制限(50)。                                                      |
| game:move_card       | { cardId, index }                   | 所有者・提出フェーズのみ。提出エリア移動。範囲チェック: 0 <= index <= 提出済み枚数。                                 |
| game:submit_done     | {}                                  | 所有者・提出フェーズのみ。提出完了宣言。全員完了で遷移。                                                       |
| theme:edit_start     | { field }                           | 編集ロック要求。field は `'title'                                                           |
| theme:edit_end       | { field, value }                    | 編集確定。ロック解除。文字数制限(50)。                                                              |
| vote                 | { choice }                          | CONTINUE or REDUCE。投票フェーズのみ。                                                       |
| admin:kick           | { targetUserId }                    | ホストのみ。対象を強制退出・カード削除・ロック解除。                                                         |
| admin:reset_lobby    | {}                                  | ホストのみ。ENDED フェーズのみ。ロビーに戻る処理。                                                       |

### 4.3. サーバー送信 (Server -> Client)

情報の漏洩を防ぐため、イベントを明確に分離する。

| イベント名               | ペイロード                                         | 宛先・内容                                                                                        |
| ------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| room:sync           | { publicState: RoomStateDTO, myHand: Card[] } | Unicast (送信者のみ)。入室時の全量同期。publicState: 全員のカード情報を含むが、number は全て null。myHand: 自分だけのカード情報（数字あり）。 |
| room:update         | Partial<RoomStateDTO>                         | Broadcast。フェーズ変更、設定変更、タイマー更新、投票状況などの差分通知。                                                    |
| chat:broadcast      | { userId, text, timestamp, isSystem }         | Broadcast。チャット配信。                                                                            |
| cards:public_update | CardDTO[]                                     | Broadcast。パブリックなカード位置情報。number は常に null または -1。                                              |
| cards:reveal        | CardDTO[]                                     | Broadcast。RESULT_REVEAL / ENDED フェーズ専用。全ての number を含んで送信する。                                  |
| hand:update         | Card[]                                        | Unicast (対象者のみ)。自分の手札の更新（配布時など）。                                                             |
| player:update       | PlayerDTO[]                                   | Broadcast。参加者リスト更新。                                                                          |
| error               | { code, message }                             | Unicast。エラー通知。                                                                               |

## 5. コアロジック詳細設計

### 5.0. フェーズ遷移共通処理 (Transition Guard)

フェーズを変更する際は、以下の処理を必ず実行する。

1.  **タイマー解除:** `if (room.timerId) clearTimeout(room.timerId);`
2.  **状態更新:** `room.phase = nextPhase;`
3.  **アクティビティ更新:** `room.lastActivityAt = Date.now();`
4.  **新タイマー設定:** 次フェーズに制限時間がある場合、5.7に従いタイマーを設定。

### 5.1. ゲーム開始とカード配布 (Start & Deal)

`game:start` 受信時に実行。

1.  **強制初期化:**
    
    *   `currentRound = 1`, `successCount = 0`。
    *   `currentLifes = settings.maxLifes`。
    *   `currentHandCount = settings.initialHandCount`。
    *   `isEndlessMode = false`, `resultMessage = undefined`, `resultInvalidCardIds = []`。
    *   `cards = []`, `deck = []`。
2.  **リセット:** `deck` を `[1..100]` で初期化しシャッフル。
3.  **配布:** `players` から `PLAYER` ロールのユーザーを抽出。
4.  **安全性チェック:** 必要枚数が `deck.length` (100) を超える場合、エラーを返し開始させない。
5.  **生成:** 各プレイヤーに `room.currentHandCount` 分のカードを配布。
    
    *   `Card` 生成: `id`\=UUID, `order=-1`, `isSubmitted=false`。
    *   `cards` 配列に追加。
6.  **送信:** `cards:public_update` (全員) と `hand:update` (各個人) を送信。

### 5.2. リアルタイム DnD 同期 (Server Authority)

1.  **受信:** `game:move_card({ cardId, index })`。
2.  **検証:** フェーズ、所有権、インデックス範囲。不整合なら無視。
3.  **処理:**
    
    *   `cards` 配列から対象カードを一時的に抜き出す。
    *   提出済みのカード群 (`order >= 0`) の中で、指定 `index` に挿入。
    *   全ての提出済みカードに対し、配列のインデックス順に `order` を 0 から連番で再割り当て（正規化）。
    *   `room.lastActivityAt` 更新。
4.  **配信:** `cards:public_update` をブロードキャスト（数字なし）。

### 5.3. 判定ロジックとライフ管理 (Judge & Life)

`PLAYING_SUBMISSION` 終了時に実行。

1.  **正誤判定:**
    
    *   提出カード (`order >= 0`) を `order` 順に並べる。
    *   `number` が昇順かチェック。逆転箇所のカードIDを `resultInvalidCardIds` に記録。
2.  **フェーズ遷移:** `phase` -> `RESULT_REVEAL`。
3.  **結果送信:** `room:update` (結果データ) と **`cards:reveal` (全数字公開)** を送信。
4.  **5秒後の分岐処理:** `setTimeout` で以下を予約。
    
    *   **成功:**
        
        *   `successCount++`。
        *   **エンドレス判定:** `successCount === settings.winConditionCount` なら `isEndlessMode = true`, `currentLifes = settings.maxLifes`。
        *   **次ラウンド予見 (Extra Clear Check):**
            
            *   次ラウンド配布予定数 `(currentHandCount + 1) * PLAYER数` が 100 を超えるかチェック。
            *   **超える場合:** `phase` -> `ENDED`, `resultMessage` = "EXTRA CLEAR!"。
            *   **超えない場合:** `currentHandCount++`, `phase` -> `PLAYING_EXPRESSION` (次ラウンド)。
    *   **失敗:**
        
        *   `currentLifes--`。
        *   `currentLifes <= 0` なら `phase` -> `ENDED` (Game Over)。
        *   残りライフあれば `phase` -> `RESULT_VOTING`。
    *   **人数不足:** `phase` -> `ENDED` (Insufficient Players)。

### 5.4. 再接続と復帰処理 (Reconnection)

`join` イベント受信時の処理詳細。

1.  **既存セッション確認:** `userId` をキーに `players` マップを検索。
2.  **復帰の場合 (Found):**
    
    *   `player.socketId` を新しい SocketID に更新。
    *   `player.status` = `ONLINE` に更新。
    *   `room:sync` を送信（現在のカード位置、数字を含む）。
    *   `player:update` を全員にブロードキャスト。
3.  **新規の場合 (Not Found):**
    
    *   定員または観戦者上限チェック。
    *   ゲーム進行中なら `SPECTATOR` として登録。
    *   `room:sync` を送信（手札は空）。

### 5.5. クリーンアップ処理 (Kick / Disconnect)

プレイヤー退出時の処理。

1.  **データ削除:** 対象プレイヤーのカード削除、編集ロック解除。
2.  **人数チェック:** `PLAYER` が1名以下になった場合、即座に `ENDED` (理由: 人数不足) へ遷移。
3.  **進行チェック:**
    
    *   `PLAYING_SUBMISSION`: 残存プレイヤーが全員提出済みなら判定へ。
    *   `RESULT_VOTING`: 分母減少のため、即座に集計 (5.6) を実行。

### 5.6. 投票集計 (Vote Tallying)

`RESULT_VOTING` 終了時、または投票更新時に実行。

1.  **確定判定:** 全員投票済み または タイマー終了。未確定なら待機。
2.  **未投票処理:** タイマー終了時、未投票は `CONTINUE`。
3.  **集計:** `REDUCE` 票数をカウント。
4.  **適用:** 過半数なら `currentHandCount` を減らす（最小1）。
5.  **次ラウンド:** `deck` リセット、カード配布、`PLAYING_EXPRESSION` へ。

### 5.7. タイマー同期 (Phase Timer)

1.  **サーバー:** `phaseEndTime` を計算し通知。`setTimeout` でフェーズ遷移を予約。
2.  **クライアント:** `phaseEndTime` を基に残り時間を表示。
3.  **タイムアウト:** サーバーの `setTimeout` 発火で強制遷移。

### 5.8. ロビー復帰と状態リセット (Reset Lobby)

`admin:reset_lobby` 受信時に実行（**自動遷移しない**）。

1.  **変数リセット:**
    
    *   全ゲーム進行変数（`currentRound`, `cards`, `deck` 等）を初期化。
    *   `resultMessage = undefined`, `isEndlessMode = false`, `resultInvalidCardIds = []`。
    *   `theme.editingUserId = null`。
2.  **プレイヤー状態リセット:**
    
    *   全員の `isReady`, `vote`, `isSubmitted` をリセット。
    *   **役割 (`role`) は維持**。
3.  **遷移:** `phase` -> `LOBBY`。`room:sync` をブロードキャスト。

### 5.9. ルームのガベージコレクション (Room GC)

1.  **条件:** プレイヤー0人かつ10分経過、または作成から24時間経過。
2.  **処理:** タイマー破棄、ソケット強制切断、データ削除。

## 6. インフラ構成

```
version: '3.8'
services:
  app:
    build: .
    ports: ["3000:3000"]
    environment:
      - NODE_ENV=production
    restart: always
    deploy:
      resources:
        limits:
          memory: 512M
  nginx:
    image: nginx:alpine
    ports: ["80:80"]
    volumes: ["./nginx.conf:/etc/nginx/nginx.conf:ro"]
    depends_on: ["app"]

```