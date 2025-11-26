import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { CardDTO } from '../types';

export const GameBoard: React.FC = () => {
    const { roomState, myHand, myUserId, submitMetaphor, moveCard, submitDone } = useSocket();
    const [metaphorInputs, setMetaphorInputs] = useState<{ [key: string]: string }>({});

    useEffect(() => {
        if (myHand) {
            const newInputs = { ...metaphorInputs };
            myHand.forEach(card => {
                if (newInputs[card.id] === undefined) {
                    newInputs[card.id] = card.metaphor || '';
                }
            });
            setMetaphorInputs(newInputs);
        }
    }, [myHand]);

    if (!roomState) return null;

    const isExpressionPhase = roomState.phase === 'PLAYING_EXPRESSION';
    const isSubmissionPhase = roomState.phase === 'PLAYING_SUBMISSION';

    const handleMetaphorChange = (cardId: string, text: string) => {
        setMetaphorInputs(prev => ({ ...prev, [cardId]: text }));
    };

    const handleMetaphorSubmit = (cardId: string) => {
        submitMetaphor(cardId, metaphorInputs[cardId]);
    };

    // Submission Logic
    // Filter cards on table (submitted) and in hand (not submitted)
    // Actually, `roomState.cards` contains ALL cards in the game (public info).
    // But for "My Hand", I should use `myHand`.
    // Wait, `roomState.cards` has `order`.
    // If `order >= 0`, it's on the table.
    // If `order === -1`, it's in someone's hand.

    const submittedCards = roomState.cards
        .filter(c => c.order >= 0)
        .sort((a, b) => a.order - b.order);

    const myCardsInHand = myHand.filter(c => c.order === -1);

    const handleMoveToTable = (cardId: string) => {
        // Move to end of table
        moveCard(cardId, submittedCards.length);
    };

    const handleMoveToHand = (cardId: string) => {
        // Move back to hand (remove from table)
        // The backend `move_card` might not support "remove".
        // Design doc says: "move_card { cardId, index }".
        // If I want to remove, maybe I need a special index?
        // Or maybe the design implies "Reorder within table".
        // Wait, "PLAYER は手札を提出エリアへドラッグ＆ドロップ".
        // "提出エリア内で何度でもカードを並べ替えることができる".
        // Can they take it back? "提出完了ボタンを押すまでは...".
        // Usually yes.
        // If I didn't implement "remove" in backend, I might be stuck.
        // Let's check backend `gameHandler.ts`.
        // It says: `cards` array, `order >= 0`.
        // `move_card` logic:
        // "提出済みのカード群 (`order >= 0`) の中で、指定 `index` に挿入。"
        // It doesn't seem to explicitly handle "remove".
        // But if I move a card that is `order = -1` to `index`, it becomes `order >= 0`.
        // If I want to move it back, I might need to implement that.
        // For now, let's assume once on table, you can only reorder.
        // Or I can update backend to support `index = -1` to remove?
        // I'll stick to "Add to Table" and "Reorder".
        // If I can't remove, that's a limitation for now.
        // Actually, I can just re-implement `moveCard` to support removal if needed, but let's stick to the plan.
        // I'll allow reordering.
    };

    const handleReorder = (cardId: string, newIndex: number) => {
        if (newIndex < 0 || newIndex > submittedCards.length - 1) return;
        moveCard(cardId, newIndex);
    };

    const myPlayer = roomState.players.find(p => p.userId === myUserId);
    const isMyTurnToSubmit = isSubmissionPhase && !myPlayer?.isSubmitted;

    return (
        <div className="min-h-screen bg-gray-100 p-4">
            {/* Header / Theme */}
            <div className="bg-white p-6 rounded-lg shadow-md mb-6 text-center">
                <h2 className="text-gray-500 uppercase tracking-wide text-sm font-semibold">Current Theme</h2>
                <h1 className="text-3xl font-bold text-indigo-600 my-2">{roomState.theme.title}</h1>
                <div className="flex justify-between items-center max-w-lg mx-auto text-gray-700 font-medium">
                    <div className="text-left">
                        <span className="block text-xs text-gray-400">Min (1)</span>
                        {roomState.theme.scaleMin}
                    </div>
                    <div className="h-1 bg-gray-300 flex-grow mx-4 rounded"></div>
                    <div className="text-right">
                        <span className="block text-xs text-gray-400">Max (100)</span>
                        {roomState.theme.scaleMax}
                    </div>
                </div>
                <div className="mt-4 text-sm text-gray-500">
                    Time Remaining: {Math.max(0, Math.floor((roomState.phaseEndTime - Date.now()) / 1000))}s
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: My Hand (Expression Phase) */}
                <div className="lg:col-span-1">
                    <h3 className="text-xl font-bold mb-4">My Hand</h3>
                    <div className="space-y-4">
                        {myHand.map(card => (
                            <div key={card.id} className={`bg-white p-4 rounded-lg shadow border-l-4 ${card.order >= 0 ? 'border-gray-400 opacity-50' : 'border-indigo-500'}`}>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="font-bold text-2xl text-indigo-600">{card.number}</span>
                                    {card.order >= 0 && <span className="text-xs bg-gray-200 px-2 py-1 rounded">Submitted</span>}
                                </div>

                                {isExpressionPhase && (
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={metaphorInputs[card.id] || ''}
                                            onChange={(e) => handleMetaphorChange(card.id, e.target.value)}
                                            onBlur={() => handleMetaphorSubmit(card.id)}
                                            className="flex-grow border rounded px-2 py-1 text-sm"
                                            placeholder="Enter metaphor..."
                                            maxLength={50}
                                        />
                                        <button
                                            onClick={() => handleMetaphorSubmit(card.id)}
                                            className="bg-indigo-600 text-white px-3 py-1 rounded text-sm hover:bg-indigo-700"
                                        >
                                            Save
                                        </button>
                                    </div>
                                )}
                                {!isExpressionPhase && (
                                    <div className="text-lg font-medium text-gray-800">
                                        {card.metaphor || <span className="text-gray-400 italic">No metaphor</span>}
                                    </div>
                                )}

                                {isSubmissionPhase && card.order === -1 && (
                                    <button
                                        onClick={() => handleMoveToTable(card.id)}
                                        className="mt-2 w-full bg-green-500 text-white py-1 rounded hover:bg-green-600"
                                    >
                                        Add to Table
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right: Table / Submission Area */}
                <div className="lg:col-span-2">
                    <h3 className="text-xl font-bold mb-4">Table (Low → High)</h3>
                    <div className="bg-slate-200 p-6 rounded-xl min-h-[300px] flex flex-wrap gap-4 items-start content-start">
                        {submittedCards.length === 0 && (
                            <div className="w-full text-center text-gray-500 mt-10">No cards submitted yet.</div>
                        )}
                        {submittedCards.map((card, index) => {
                            const isMine = card.ownerId === myUserId;
                            const owner = roomState.players.find(p => p.userId === card.ownerId);

                            return (
                                <div key={card.id} className="bg-white p-3 rounded shadow w-40 relative group">
                                    <div className="text-xs text-gray-500 mb-1 flex justify-between">
                                        <span style={{ color: owner?.color }}>{owner?.name}</span>
                                        {isMine && <span className="font-bold text-indigo-600">{myHand.find(c => c.id === card.id)?.number}</span>}
                                    </div>
                                    <div className="font-bold text-md mb-2 break-words leading-tight">
                                        {card.metaphor}
                                    </div>

                                    {isSubmissionPhase && isMine && (
                                        <div className="flex justify-between mt-2">
                                            <button
                                                onClick={() => handleReorder(card.id, index - 1)}
                                                disabled={index === 0}
                                                className="bg-gray-100 hover:bg-gray-200 px-2 rounded disabled:opacity-30"
                                            >
                                                ←
                                            </button>
                                            <button
                                                onClick={() => handleReorder(card.id, index + 1)}
                                                disabled={index === submittedCards.length - 1}
                                                className="bg-gray-100 hover:bg-gray-200 px-2 rounded disabled:opacity-30"
                                            >
                                                →
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {isSubmissionPhase && (
                        <div className="mt-6 flex justify-end">
                            <button
                                onClick={submitDone}
                                disabled={myPlayer?.isSubmitted}
                                className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-bold text-lg shadow hover:bg-indigo-700 disabled:bg-gray-400"
                            >
                                {myPlayer?.isSubmitted ? "Waiting for others..." : "Finish Submission"}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
