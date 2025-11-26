import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { Theme } from '../types';

export const ThemeSelection: React.FC = () => {
    const { roomState, myUserId, socket } = useSocket();
    const [customTitle, setCustomTitle] = useState('');
    const [customMin, setCustomMin] = useState('1');
    const [customMax, setCustomMax] = useState('100');

    if (!roomState) return null;

    const isHost = roomState.hostId === myUserId;

    const handleSelect = (themeId: string) => {
        if (!isHost) return;
        socket?.emit('game:select_theme', { themeId });
    };

    const handleCustomSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!isHost) return;
        socket?.emit('game:select_theme', {
            customTheme: {
                title: customTitle,
                scaleMin: customMin,
                scaleMax: customMax
            }
        });
    };

    return (
        <div className="min-h-screen bg-gray-100 p-8">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-3xl font-bold text-center mb-8 text-indigo-700">テーマ選択</h1>

                {!isHost && (
                    <div className="text-center text-xl text-gray-600 animate-pulse">
                        ホストがテーマを選択中です...
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Presets */}
                    <div className="space-y-4">
                        <h2 className="text-xl font-semibold mb-4">候補から選択</h2>
                        {roomState.themeCandidates?.map((theme: Theme) => (
                            <button
                                key={theme.id}
                                onClick={() => handleSelect(theme.id)}
                                disabled={!isHost}
                                className="w-full p-4 bg-white rounded-lg shadow hover:shadow-md transition-all text-left border-l-4 border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <h3 className="text-lg font-bold text-gray-800">{theme.title}</h3>
                                <div className="flex justify-between text-sm text-gray-500 mt-2">
                                    <span>Min: {theme.scaleMin}</span>
                                    <span>Max: {theme.scaleMax}</span>
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Custom */}
                    <div className="bg-white p-6 rounded-lg shadow">
                        <h2 className="text-xl font-semibold mb-4">カスタムテーマ</h2>
                        <form onSubmit={handleCustomSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">テーマ名</label>
                                <input
                                    type="text"
                                    value={customTitle}
                                    onChange={(e) => setCustomTitle(e.target.value)}
                                    disabled={!isHost}
                                    className="mt-1 block w-full border rounded-md p-2"
                                    placeholder="例: 人気の食べ物"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">最小 (1)</label>
                                    <input
                                        type="text"
                                        value={customMin}
                                        onChange={(e) => setCustomMin(e.target.value)}
                                        disabled={!isHost}
                                        className="mt-1 block w-full border rounded-md p-2"
                                        placeholder="例: 嫌い"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">最大 (100)</label>
                                    <input
                                        type="text"
                                        value={customMax}
                                        onChange={(e) => setCustomMax(e.target.value)}
                                        disabled={!isHost}
                                        className="mt-1 block w-full border rounded-md p-2"
                                        placeholder="例: 大好き"
                                        required
                                    />
                                </div>
                            </div>
                            <button
                                type="submit"
                                disabled={!isHost || !customTitle}
                                className="w-full py-2 px-4 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-400"
                            >
                                このテーマで開始
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};
