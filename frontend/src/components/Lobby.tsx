import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';

const COLORS = [
    '#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#33FFF5',
    '#FF8C33', '#8C33FF', '#FF3333', '#33FF8C', '#338CFF'
];

export const Lobby: React.FC = () => {
    const { isConnected, roomState, myUserId, joinRoom, startGame, updateSettings, updateColor } = useSocket();
    const [roomId, setRoomId] = useState('');
    const [name, setName] = useState('');

    if (!isConnected) {
        return <div className="flex justify-center items-center h-screen">サーバーに接続中...</div>;
    }

    if (!roomState) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
                <div className="bg-white p-8 rounded-lg shadow-md w-96">
                    <h1 className="text-2xl font-bold mb-6 text-center text-indigo-600">テーマスケール</h1>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">ルームID</label>
                            <input
                                type="text"
                                value={roomId}
                                onChange={(e) => setRoomId(e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                                placeholder="ルームIDを入力"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">名前</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                                placeholder="名前を入力"
                            />
                        </div>
                        <button
                            onClick={() => joinRoom(roomId, name)}
                            disabled={!roomId || !name}
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400"
                        >
                            ルームに参加
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const isHost = roomState.hostId === myUserId;
    const myPlayer = roomState.players.find(p => p.userId === myUserId);

    return (
        <div className="max-w-4xl mx-auto p-6">
            <h1 className="text-3xl font-bold mb-4 text-indigo-600">ルーム: {roomState.roomId}</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-lg shadow">
                    <h2 className="text-xl font-semibold mb-4">プレイヤー ({roomState.players.length})</h2>
                    <ul className="space-y-2 mb-6">
                        {roomState.players.map((player) => (
                            <li key={player.userId} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                <div className="flex items-center">
                                    <span className="w-4 h-4 rounded-full mr-2" style={{ backgroundColor: player.color }}></span>
                                    <span className={player.userId === myUserId ? "font-bold" : ""}>{player.name}</span>
                                    {player.userId === roomState.hostId && <span className="ml-2 text-xs bg-yellow-200 px-2 py-0.5 rounded">ホスト</span>}
                                </div>
                                <span className={`text-xs px-2 py-1 rounded ${player.status === 'ONLINE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                    {player.status}
                                </span>
                            </li>
                        ))}
                    </ul>

                    <h3 className="text-lg font-semibold mb-2">カラー選択</h3>
                    <div className="grid grid-cols-5 gap-2">
                        {COLORS.map((color, index) => {
                            const takenBy = roomState.players.find(p => p.color === color);
                            const isMyColor = myPlayer?.color === color;
                            const isTaken = takenBy && !isMyColor;

                            return (
                                <button
                                    key={index}
                                    onClick={() => !isTaken && updateColor(color)}
                                    disabled={!!isTaken}
                                    className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-transform hover:scale-110 ${isMyColor ? 'border-black ring-2 ring-offset-2 ring-indigo-500' : 'border-transparent'} ${isTaken ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                    style={{ backgroundColor: color }}
                                    title={takenBy ? takenBy.name : '選択可能'}
                                >
                                    {isMyColor && <span className="text-white text-xs font-bold">✓</span>}
                                    {isTaken && <span className="text-white text-xs font-bold">×</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow">
                    <h2 className="text-xl font-semibold mb-4">ゲーム設定</h2>
                    <div className="space-y-4 text-sm text-gray-600">
                        {isHost ? (
                            <>
                                <div>
                                    <label className="block font-medium">手札枚数 (1-10)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="10"
                                        value={roomState.settings.initialHandCount}
                                        onChange={(e) => updateSettings({ initialHandCount: Number(e.target.value) })}
                                        className="w-full border rounded p-1"
                                    />
                                </div>
                                <div>
                                    <label className="block font-medium">ライフ (1-10)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="10"
                                        value={roomState.settings.maxLifes}
                                        onChange={(e) => updateSettings({ maxLifes: Number(e.target.value) })}
                                        className="w-full border rounded p-1"
                                    />
                                </div>
                                <div>
                                    <label className="block font-medium">勝利条件 (1-10)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="10"
                                        value={roomState.settings.winConditionCount}
                                        onChange={(e) => updateSettings({ winConditionCount: Number(e.target.value) })}
                                        className="w-full border rounded p-1"
                                    />
                                </div>
                                <div className="border-t pt-2 mt-2">
                                    <h3 className="font-semibold mb-2">時間設定 (秒)</h3>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-xs">ゲーム時間</label>
                                            <input
                                                type="number"
                                                value={roomState.settings.timeLimitGame}
                                                onChange={(e) => updateSettings({ timeLimitGame: Number(e.target.value) })}
                                                className="w-full border rounded p-1"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs">投票</label>
                                            <input
                                                type="number"
                                                value={roomState.settings.timeLimitVoting}
                                                onChange={(e) => updateSettings({ timeLimitVoting: Number(e.target.value) })}
                                                className="w-full border rounded p-1"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <p>手札枚数: {roomState.settings.initialHandCount}</p>
                                <p>ライフ: {roomState.settings.maxLifes}</p>
                                <p>勝利条件: {roomState.settings.winConditionCount}</p>
                                <div className="border-t pt-2 mt-2">
                                    <p>ゲーム時間: {roomState.settings.timeLimitGame}秒</p>
                                    <p>投票時間: {roomState.settings.timeLimitVoting}秒</p>
                                </div>
                            </>
                        )}
                    </div>

                    {isHost && (
                        <div className="mt-6">
                            <button
                                onClick={startGame}
                                className="w-full py-3 px-4 bg-green-600 text-white rounded-md font-bold hover:bg-green-700 shadow-lg transform transition hover:scale-105"
                            >
                                ゲーム開始
                            </button>
                        </div>
                    )}
                    {!isHost && (
                        <div className="mt-6 text-center text-gray-500 italic">
                            ホストがゲームを開始するのを待っています...
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
