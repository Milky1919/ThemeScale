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

export interface Theme {
    id: string;
    category?: string;
    title: string;      // テーマ名
    scaleMin: string;   // スケール1の例
    scaleMax: string;   // スケール100の例
    editingUserId?: string | null;
    lockExpiresAt?: number | null;
}

export interface PlayerDTO {
    userId: string;
    name: string;
    color: string;
    role: PlayerRole;
    status: ConnectionStatus;
    isReady: boolean;
    isSubmitted?: boolean;
    vote?: 'CONTINUE' | 'REDUCE';
}

export interface CardDTO {
    id: string;
    ownerId: string;
    metaphor: string;
    order: number;
    isSubmitted: boolean;
    number?: number;
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
