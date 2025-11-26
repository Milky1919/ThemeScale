export type PlayerRole = 'PLAYER' | 'SPECTATOR';
export type ConnectionStatus = 'ONLINE' | 'OFFLINE';
export type GamePhase =
    | 'LOBBY'               // 待機中
    | 'THEME_SELECTION'     // テーマ選択
    | 'PLAYING'             // プレイ中（表現・提出・並び替え）
    | 'RESULT_REVEAL'       // 結果発表（成功/失敗/ゲーム終了等の表示）
    | 'RESULT_VOTING'       // 失敗時の投票
    | 'ENDED';              // ゲーム終了（クリア/ゲームオーバー/人数不足）

export interface GameSettings {
    initialHandCount: number;
    maxLifes: number;
    winConditionCount: number;
    timeLimitGame: number;
    timeLimitVoting: number;
}

export interface Card {
    id: string;        // UUID v4
    number: number;    // 1-100
    ownerId: string;   // 所有者ID
    metaphor: string;  // 入力された「たとえ」
    order: number;     // 提出エリアでの順序 (0-indexed, 未提出=-1)
    isSubmitted: boolean; // 個人の提出完了フラグ
}

export interface Player {
    userId: string;    // UUID v4 (永続ID)
    socketId: string;  // Socket.IO ID (接続ごとに変化)
    name: string;
    color: string;     // HEX (#RRGGBB)
    role: PlayerRole;
    status: ConnectionStatus;
    isReady: boolean;
    joinedAt: number;  // 入室タイムスタンプ (ホスト委譲判定用)
    lastActiveAt: number; // 最終通信時刻
    isSubmitted?: boolean; // 提出完了フラグ
    vote?: 'CONTINUE' | 'REDUCE'; // 投票内容
}

export interface Theme {
    id: string;
    category?: string;
    title: string;      // テーマ名
    scaleMin: string;   // スケール1の例
    scaleMax: string;   // スケール100の例
    editingUserId?: string | null;
    lockExpiresAt?: number | null;
}

export interface RoomState {
    roomId: string;
    hostId: string;
    phase: GamePhase;
    phaseEndTime: number; // フェーズ終了予定時刻 (Unix Time, 0なら無制限)
    createdAt: number;    // ルーム作成時刻 (GC用)
    lastActivityAt: number; // 最終操作時刻 (GC用)

    settings: GameSettings;

    currentRound: number;
    currentHandCount: number; // 現在のラウンドでの1人あたりの配布枚数
    successCount: number;
    currentLifes: number;
    isEndlessMode: boolean; // エンドレスモード突入フラグ
    resultMessage?: string; // 結果画面に表示する特別メッセージ（EXTRA CLEAR等）
    resultInvalidCardIds?: string[]; // ドボンしたカードのIDリスト

    theme: Theme;
    themeCandidates?: Theme[]; // 選択候補
    players: Map<string, Player>; // userId -> Player
    deck: number[];               // 現在の山札
    cards: Card[];                // ゲーム内の全カード

    timerId: NodeJS.Timeout | null; // フェーズタイムアウト用タイマー
    pausedRemaining?: number | null; // 一時停止時の残り時間 (ms)
}

// DTOs for Client
export interface PlayerDTO {
    userId: string;
    name: string;
    color: string;
    role: PlayerRole;
    status: ConnectionStatus;
    isReady: boolean;
    isSubmitted?: boolean; // 提出フェーズ用
    vote?: 'CONTINUE' | 'REDUCE'; // 投票フェーズ用
}

export interface CardDTO {
    id: string;
    ownerId: string;
    metaphor: string;
    order: number;
    isSubmitted: boolean;
    number?: number; // 公開時のみ
}

export interface RoomStateDTO {
    roomId: string;
    hostId: string;
    phase: GamePhase;
    phaseEndTime: number;
    settings: GameSettings;
    currentRound: number;
    currentHandCount: number;
    successCount: number;
    currentLifes: number;
    isEndlessMode: boolean;
    resultMessage?: string;
    resultInvalidCardIds?: string[];
    theme: Theme;
    themeCandidates?: Theme[];
    players: PlayerDTO[];
    cards: CardDTO[];
}

export type GameRoom = RoomState;
