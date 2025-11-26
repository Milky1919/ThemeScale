export type PlayerRole = 'PLAYER' | 'SPECTATOR';
export type ConnectionStatus = 'ONLINE' | 'OFFLINE';
export type GamePhase =
    | 'LOBBY'               // 待機中
    | 'PLAYING_EXPRESSION'  // 表現フェーズ
    | 'PLAYING_SUBMISSION'  // 提出フェーズ
    | 'RESULT_REVEAL'       // 結果発表（成功/失敗/ゲーム終了等の表示）
    | 'RESULT_VOTING'       // 失敗時の投票
    | 'ENDED';              // ゲーム終了（クリア/ゲームオーバー/人数不足）

export interface GameSettings {
    initialHandCount: number;
    maxLifes: number;
    winConditionCount: number;
    timeLimitExpression: number;
    timeLimitSubmission: number;
    timeLimitVoting: number;
    maxSpectators: number;
}

export interface Theme {
    category: string;
    title: string;
    scaleMin: string;
    scaleMax: string;
    editingUserId: string | null;
    lockExpiresAt: number | null;
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
    players: PlayerDTO[];
    cards: CardDTO[];
}
