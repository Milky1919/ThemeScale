import React from 'react';
import { useSocket } from '../context/SocketContext';

export const Result: React.FC = () => {
    const { roomState, myUserId, vote, resetLobby } = useSocket();

    if (!roomState) return null;

    const isVotingPhase = roomState.phase === 'RESULT_VOTING';
    const isEnded = roomState.phase === 'ENDED';
    const isHost = roomState.hostId === myUserId;
    const myPlayer = roomState.players.find(p => p.userId === myUserId);

    // Calculate result
    const invalidCardIds = roomState.resultInvalidCardIds || [];
    const isSuccess = invalidCardIds.length === 0 && !isEnded;

    // If ENDED, check message
    const isGameOver = isEnded && roomState.currentLifes <= 0;

    return (
        <div className="min-h-screen bg-gray-100 p-6 flex flex-col items-center">
            <h1 className="text-4xl font-bold mb-8 text-gray-800">
                {isEnded ? (isGameOver ? "ゲームオーバー" : "ゲームクリア！") : (isSuccess ? "ラウンドクリア！" : "失敗...")}
            </h1>

            {roomState.resultMessage && (
                <div className="text-2xl font-bold text-purple-600 mb-4 animate-bounce">
                    {roomState.resultMessage}
                </div>
            )}

            <div className="flex flex-wrap justify-center gap-4 mb-8 max-w-6xl">
                {roomState.cards.sort((a, b) => a.order - b.order).map((card) => {
                    const isInvalid = invalidCardIds.includes(card.id);
                    const owner = roomState.players.find(p => p.userId === card.ownerId);

                    return (
                        <div key={card.id} className={`p-4 rounded-lg shadow-md w-40 text-center relative ${isInvalid ? 'bg-red-100 border-2 border-red-500' : 'bg-white'}`}>
                            <div className="text-3xl font-bold text-indigo-600 mb-2">{card.number}</div>
                            <div className="text-sm font-medium mb-1">{card.metaphor}</div>
                            <div className="text-xs text-gray-500" style={{ color: owner?.color }}>{owner?.name}</div>
                            {isInvalid && <div className="absolute -top-3 -right-3 bg-red-600 text-white text-xs px-2 py-1 rounded-full">OUT</div>}
                        </div>
                    );
                })}
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md w-full max-w-2xl text-center">
                <div className="flex justify-center gap-8 mb-6">
                    <div className="text-center">
                        <div className="text-sm text-gray-500">ライフ</div>
                        <div className="text-3xl font-bold text-red-500">{'♥'.repeat(roomState.currentLifes)}</div>
                    </div>
                    <div className="text-center">
                        <div className="text-sm text-gray-500">成功数</div>
                        <div className="text-3xl font-bold text-green-500">{roomState.successCount}</div>
                    </div>
                </div>

                {isVotingPhase && (
                    <div className="mt-6 border-t pt-6">
                        <h3 className="text-xl font-bold mb-4">投票: 同じ手札で続けますか？</h3>
                        <div className="text-sm text-gray-500 mb-4">
                            残り時間: {Math.max(0, Math.floor((roomState.phaseEndTime - Date.now()) / 1000))}秒
                        </div>

                        {myPlayer?.vote ? (
                            <div className="text-lg font-medium text-gray-600">
                                あなたの投票: <span className="font-bold">{myPlayer.vote}</span>
                            </div>
                        ) : (
                            <div className="flex justify-center gap-4">
                                <button
                                    onClick={() => vote('CONTINUE')}
                                    className="bg-blue-500 text-white px-6 py-3 rounded hover:bg-blue-600"
                                >
                                    続ける (手札維持)
                                </button>
                                {roomState.currentHandCount > 1 && (
                                    <button
                                        onClick={() => vote('REDUCE')}
                                        className="bg-orange-500 text-white px-6 py-3 rounded hover:bg-orange-600"
                                    >
                                        リトライ (手札-1)
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="mt-4 text-sm text-gray-400">
                            投票数: {roomState.players.filter(p => p.vote).length} / {roomState.players.filter(p => p.role === 'PLAYER').length}
                        </div>
                    </div>
                )}

                {isEnded && isHost && (
                    <div className="mt-6 border-t pt-6">
                        <button
                            onClick={resetLobby}
                            className="bg-gray-800 text-white px-8 py-3 rounded hover:bg-gray-900 font-bold"
                        >
                            ロビーに戻る
                        </button>
                    </div>
                )}

                {isSuccess && !isEnded && (
                    <div className="mt-6 text-xl font-bold text-green-600 animate-pulse">
                        まもなく次のラウンドが始まります...
                    </div>
                )}
            </div>
        </div>
    );
};
