import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';

export const Lobby: React.FC = () => {
    const { isConnected, roomState, myUserId, joinRoom, startGame } = useSocket();
    const [roomId, setRoomId] = useState('');
    const [name, setName] = useState('');

    if (!isConnected) {
        return <div className="flex justify-center items-center h-screen">Connecting to server...</div>;
    }

    if (!roomState) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
                <div className="bg-white p-8 rounded-lg shadow-md w-96">
                    <h1 className="text-2xl font-bold mb-6 text-center text-indigo-600">Theme Scale</h1>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Room ID</label>
                            <input
                                type="text"
                                value={roomId}
                                onChange={(e) => setRoomId(e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                                placeholder="Enter Room ID"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Your Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                                placeholder="Enter Name"
                            />
                        </div>
                        <button
                            onClick={() => joinRoom(roomId, name)}
                            disabled={!roomId || !name}
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400"
                        >
                            Join Room
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const isHost = roomState.hostId === myUserId;

    return (
        <div className="max-w-4xl mx-auto p-6">
            <h1 className="text-3xl font-bold mb-4 text-indigo-600">Room: {roomState.roomId}</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-lg shadow">
                    <h2 className="text-xl font-semibold mb-4">Players ({roomState.players.length})</h2>
                    <ul className="space-y-2">
                        {roomState.players.map((player) => (
                            <li key={player.userId} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                <div className="flex items-center">
                                    <span className="w-4 h-4 rounded-full mr-2" style={{ backgroundColor: player.color }}></span>
                                    <span className={player.userId === myUserId ? "font-bold" : ""}>{player.name}</span>
                                    {player.userId === roomState.hostId && <span className="ml-2 text-xs bg-yellow-200 px-2 py-0.5 rounded">HOST</span>}
                                </div>
                                <span className={`text-xs px-2 py-1 rounded ${player.status === 'ONLINE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                    {player.status}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="bg-white p-6 rounded-lg shadow">
                    <h2 className="text-xl font-semibold mb-4">Game Settings</h2>
                    <div className="space-y-2 text-sm text-gray-600">
                        <p>Hand Count: {roomState.settings.initialHandCount}</p>
                        <p>Lifes: {roomState.settings.maxLifes}</p>
                        <p>Win Condition: {roomState.settings.winConditionCount}</p>
                    </div>

                    {isHost && (
                        <div className="mt-6">
                            <button
                                onClick={startGame}
                                className="w-full py-3 px-4 bg-green-600 text-white rounded-md font-bold hover:bg-green-700 shadow-lg transform transition hover:scale-105"
                            >
                                START GAME
                            </button>
                        </div>
                    )}
                    {!isHost && (
                        <div className="mt-6 text-center text-gray-500 italic">
                            Waiting for host to start...
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
