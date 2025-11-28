import React, { useState, useEffect, useCallback } from 'react';
import { useSocket } from '../context/SocketContext';
import { debounce } from 'lodash';
import {
    DndContext,
    pointerWithin,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    DragOverlay,
    DragStartEvent,
    DragEndEvent,
    useDroppable,
    MeasuringStrategy
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableCard } from './SortableCard';
import { DraggableCard } from './DraggableCard';
import { CardDTO, RoomStateDTO } from '../types';

// Separated component to ensure useDroppable is within DndContext
const GameContent: React.FC<{
    roomState: RoomStateDTO;
    myHand: CardDTO[];
    myUserId: string | null;
    metaphorInputs: { [key: string]: string };
    handleMetaphorChange: (id: string, text: string) => void;
    submitDone: () => void;
    activeId: string | null;
    isHost: boolean;
    timeLeft: number;
    themeTitle: string;
    setThemeTitle: (v: string) => void;
    themeMin: string;
    setThemeMin: (v: string) => void;
    themeMax: string;
    setThemeMax: (v: string) => void;
    handleThemeFocus: () => void;
    handleThemeBlur: () => void;
}> = ({
    roomState, myHand, myUserId, metaphorInputs, handleMetaphorChange, submitDone, activeId,
    isHost, timeLeft, themeTitle, setThemeTitle, themeMin, setThemeMin, themeMax, setThemeMax, handleThemeFocus, handleThemeBlur
}) => {
    const isPlayingPhase = roomState.phase === 'PLAYING';
    const submittedCards = roomState.cards
        .filter(c => c.order >= 0)
        .sort((a, b) => a.order - b.order);
    const myCardsInHand = myHand.filter(c => c.order === -1);
    const myPlayer = roomState.players.find(p => p.userId === myUserId);

    const { setNodeRef: setHandRef } = useDroppable({ id: 'hand-container' });
    const { setNodeRef: setTableRef } = useDroppable({ id: 'table-container' });

    const renderCard = (card: CardDTO, isOverlay = false) => {
        const isMine = card.ownerId === myUserId;
        const owner = roomState.players.find(p => p.userId === card.ownerId);
        const borderColor = owner?.color || '#ccc';

        return (
            <div
                className={`bg-white p-3 rounded shadow w-40 relative group border-l-4 select-none ${isOverlay ? 'opacity-80 scale-105 cursor-grabbing pointer-events-none' : ''}`}
                style={{ borderLeftColor: borderColor }}
            >
                <div className="text-xs text-gray-500 mb-1 flex justify-between">
                    <span style={{ color: owner?.color, fontWeight: 'bold' }}>{owner?.name}</span>
                    {isMine && <span className="font-bold text-indigo-600 text-lg">{myHand.find(c => c.id === card.id)?.number}</span>}
                </div>

                {isMine ? (
                    <div className="mb-2">
                        <input
                            type="text"
                            value={metaphorInputs[card.id] || ''}
                            onChange={(e) => handleMetaphorChange(card.id, e.target.value)}
                            onPointerDown={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                            className="w-full border rounded px-1 py-0.5 text-sm"
                            placeholder="たとえを入力..."
                            maxLength={50}
                        />
                    </div>
                ) : (
                    <div className="font-bold text-md mb-2 break-words leading-tight min-h-[1.5em]">
                        {card.metaphor || <span className="text-gray-300 text-xs">入力中...</span>}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gray-100 p-4">
             {/* Header / Theme */}
             <div className="bg-white p-6 rounded-lg shadow-md mb-6 text-center relative">
                <h2 className="text-gray-500 uppercase tracking-wide text-sm font-semibold">現在のテーマ</h2>

                {isHost ? (
                    <input
                        type="text"
                        value={themeTitle}
                        onChange={(e) => setThemeTitle(e.target.value)}
                        onFocus={handleThemeFocus}
                        onBlur={handleThemeBlur}
                        className="text-3xl font-bold text-indigo-600 my-2 text-center w-full border-b-2 border-transparent focus:border-indigo-500 outline-none"
                    />
                ) : (
                    <h1 className="text-3xl font-bold text-indigo-600 my-2">{roomState.theme.title}</h1>
                )}

                <div className="flex justify-between items-center max-w-lg mx-auto text-gray-700 font-medium">
                    <div className="text-left w-1/3">
                        <span className="block text-xs text-gray-400">最小 (1)</span>
                        {isHost ? (
                            <input
                                type="text"
                                value={themeMin}
                                onChange={(e) => setThemeMin(e.target.value)}
                                onFocus={handleThemeFocus}
                                onBlur={handleThemeBlur}
                                className="w-full border-b border-gray-300 focus:border-indigo-500 outline-none"
                            />
                        ) : (
                            roomState.theme.scaleMin
                        )}
                    </div>
                    <div className="h-1 bg-gray-300 flex-grow mx-4 rounded"></div>
                    <div className="text-right w-1/3">
                        <span className="block text-xs text-gray-400">最大 (100)</span>
                        {isHost ? (
                            <input
                                type="text"
                                value={themeMax}
                                onChange={(e) => setThemeMax(e.target.value)}
                                onFocus={handleThemeFocus}
                                onBlur={handleThemeBlur}
                                className="w-full border-b border-gray-300 focus:border-indigo-500 outline-none text-right"
                            />
                        ) : (
                            roomState.theme.scaleMax
                        )}
                    </div>
                </div>
                <div className="mt-4 text-sm text-gray-500">
                    残り時間: {timeLeft}秒
                </div>
                {roomState.phaseEndTime === 0 && (
                    <div className="absolute top-2 right-2 text-red-500 font-bold animate-pulse">
                        一時停止中
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: My Hand */}
                <div
                    ref={setHandRef}
                    id="hand-container"
                    className="lg:col-span-1 bg-gray-200 p-4 rounded-lg min-h-[200px]"
                >
                    <h3 className="text-xl font-bold mb-4">自分の手札</h3>
                    <div className="space-y-4">
                        {myCardsInHand.map(card => (
                            <DraggableCard key={card.id} id={card.id} disabled={!isPlayingPhase}>
                                {renderCard(card)}
                            </DraggableCard>
                        ))}
                        {myCardsInHand.length === 0 && (
                            <div className="text-gray-500 text-center py-8">
                                手札はありません
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Table / Submission Area */}
                <div className="lg:col-span-2">
                    <h3 className="text-xl font-bold mb-4">場 (低い順 → 高い順)</h3>
                    <div
                        ref={setTableRef}
                        id="table-container"
                        className="bg-slate-300 p-6 rounded-xl min-h-[300px] flex flex-wrap gap-4 items-start content-start transition-colors z-0 relative"
                    >
                        <SortableContext
                            items={submittedCards.map(c => c.id)}
                            strategy={rectSortingStrategy}
                        >
                            {submittedCards.length === 0 && (
                                <div className="w-full text-center text-gray-500 mt-10 pointer-events-none">
                                    ここにカードをドラッグ＆ドロップ
                                </div>
                            )}
                            {submittedCards.map((card) => {
                                const isMine = card.ownerId === myUserId;
                                return (
                                    <SortableCard key={card.id} id={card.id} disabled={!isPlayingPhase || !isMine}>
                                        {renderCard(card)}
                                    </SortableCard>
                                );
                            })}
                        </SortableContext>
                    </div>

                    {isPlayingPhase && (
                        <div className="mt-6 flex justify-end">
                            <button
                                onClick={submitDone}
                                disabled={myPlayer?.isSubmitted}
                                className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-bold text-lg shadow hover:bg-indigo-700 disabled:bg-gray-400 transition-colors"
                            >
                                {myPlayer?.isSubmitted ? "他プレイヤーの提出待ち..." : "提出完了"}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <DragOverlay
                dropAnimation={null}
                style={{ pointerEvents: 'none', zIndex: 1000 }}
            >
                {activeId ? (
                    renderCard(roomState.cards.find(c => c.id === activeId)!, true)
                ) : null}
            </DragOverlay>
        </div>
    );
};

export const GameBoard: React.FC = () => {
    const { roomState, myHand, myUserId, submitMetaphor, moveCard, submitDone, socket } = useSocket();
    const [metaphorInputs, setMetaphorInputs] = useState<{ [key: string]: string }>({});
    const [timeLeft, setTimeLeft] = useState(0);
    const [activeId, setActiveId] = useState<string | null>(null);

    // Theme Editing State
    const [themeTitle, setThemeTitle] = useState('');
    const [themeMin, setThemeMin] = useState('');
    const [themeMax, setThemeMax] = useState('');

    useEffect(() => {
        if (roomState?.theme) {
            setThemeTitle(roomState.theme.title);
            setThemeMin(roomState.theme.scaleMin);
            setThemeMax(roomState.theme.scaleMax);
        }
    }, [roomState?.theme]);

    // Timer Logic
    useEffect(() => {
        if (!roomState?.phaseEndTime) {
            if (roomState?.phaseEndTime === 0) {
                // Paused or no limit
            }
            return;
        }

        const interval = setInterval(() => {
            const remaining = Math.max(0, Math.floor((roomState.phaseEndTime - Date.now()) / 1000));
            setTimeLeft(remaining);
        }, 1000);

        setTimeLeft(Math.max(0, Math.floor((roomState.phaseEndTime - Date.now()) / 1000)));

        return () => clearInterval(interval);
    }, [roomState?.phaseEndTime]);

    // Metaphor Inputs Sync
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

    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: {
                distance: 5,
            },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 250,
                tolerance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    if (!roomState) return null;

    const isHost = roomState.hostId === myUserId;

    // Theme Editing Handlers
    const handleThemeFocus = () => {
        if (!isHost) return;
        socket?.emit('game:pause_timer');
    };

    const handleThemeBlur = () => {
        if (!isHost) return;
        socket?.emit('game:update_theme_text', {
            title: themeTitle,
            scaleMin: themeMin,
            scaleMax: themeMax
        });
        socket?.emit('game:resume_timer');
    };

    const debouncedSubmit = useCallback(
        debounce((cardId: string, metaphor: string) => {
            submitMetaphor(cardId, metaphor);
        }, 300),
        [submitMetaphor]
    );

    const handleMetaphorChange = (cardId: string, text: string) => {
        setMetaphorInputs(prev => ({ ...prev, [cardId]: text }));
        debouncedSubmit(cardId, text);
    };

    // DnD Logic
    const submittedCards = roomState.cards
        .filter(c => c.order >= 0)
        .sort((a, b) => a.order - b.order);

    const myCardsInHand = myHand.filter(c => c.order === -1);

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over) return;

        const activeCardId = active.id as string;
        const overId = over.id as string;

        const isFromHand = myCardsInHand.some(c => c.id === activeCardId);
        const isFromTable = submittedCards.some(c => c.id === activeCardId);

        if (isFromHand) {
            const isOverTable = overId === 'table-container';
            const isOverTableCard = submittedCards.some(c => c.id === overId);

            if (isOverTable || isOverTableCard) {
                let newIndex = submittedCards.length;

                if (isOverTableCard) {
                    const overIndex = submittedCards.findIndex(c => c.id === overId);
                    if (overIndex !== -1 && over.rect && 'clientX' in event.activatorEvent) {
                        const pointerX = (event.activatorEvent as MouseEvent).clientX;
                        const overMidX = over.rect.left + over.rect.width / 2;

                        if (pointerX < overMidX) {
                            newIndex = overIndex;
                        } else {
                            newIndex = overIndex + 1;
                        }
                    } else if (overIndex !== -1) {
                        newIndex = overIndex;
                    }
                }

                moveCard(activeCardId, newIndex);
            }
        } else if (isFromTable) {
            if (overId === 'hand-container' || myCardsInHand.some(c => c.id === overId)) {
                moveCard(activeCardId, -1);
            } else if (overId !== 'table-container' && overId !== activeCardId) {
                const oldIndex = submittedCards.findIndex(c => c.id === activeCardId);
                let newIndex = submittedCards.findIndex(c => c.id === overId);

                if (oldIndex !== -1 && newIndex !== -1) {
                    if (over.rect && 'clientX' in event.activatorEvent) {
                        const pointerX = (event.activatorEvent as MouseEvent).clientX;
                        const overMidX = over.rect.left + over.rect.width / 2;
                        if (pointerX > overMidX) {
                            newIndex++;
                        }
                    }

                    if (oldIndex < newIndex) {
                        newIndex--;
                    }

                    moveCard(activeCardId, newIndex);
                }
            }
        }
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            measuring={{
                droppable: {
                    strategy: MeasuringStrategy.Always,
                },
            }}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <GameContent
                roomState={roomState}
                myHand={myHand}
                myUserId={myUserId}
                metaphorInputs={metaphorInputs}
                handleMetaphorChange={handleMetaphorChange}
                submitDone={submitDone}
                activeId={activeId}
                isHost={isHost}
                timeLeft={timeLeft}
                themeTitle={themeTitle}
                setThemeTitle={setThemeTitle}
                themeMin={themeMin}
                setThemeMin={setThemeMin}
                themeMax={themeMax}
                setThemeMax={setThemeMax}
                handleThemeFocus={handleThemeFocus}
                handleThemeBlur={handleThemeBlur}
            />
        </DndContext>
    );
};
