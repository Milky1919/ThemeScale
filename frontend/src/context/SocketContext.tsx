import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { RoomStateDTO, CardDTO } from '../types';

interface SocketContextType {
    socket: Socket | null;
    isConnected: boolean;
    roomState: RoomStateDTO | null;
    myHand: CardDTO[];
    myUserId: string | null;
    joinRoom: (roomId: string, name: string) => void;
    startGame: () => void;
    submitMetaphor: (cardId: string, text: string) => void;
    moveCard: (cardId: string, index: number) => void;
    submitDone: () => void;
    vote: (choice: 'CONTINUE' | 'REDUCE') => void;
    resetLobby: () => void;
    updateSettings: (settings: any) => void;
    updateColor: (color: string) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [roomState, setRoomState] = useState<RoomStateDTO | null>(null);
    const [myHand, setMyHand] = useState<CardDTO[]>([]);
    const [myUserId, setMyUserId] = useState<string | null>(null);

    useEffect(() => {
        const newSocket = io(import.meta.env.VITE_API_URL || 'http://localhost:3000');
        setSocket(newSocket);

        newSocket.on('connect', () => setIsConnected(true));
        newSocket.on('disconnect', () => setIsConnected(false));

        newSocket.on('room:sync', (data: { publicState: RoomStateDTO, myHand: CardDTO[], userId: string }) => {
            setRoomState(data.publicState);
            setMyHand(data.myHand);
            setMyUserId(data.userId);
        });

        newSocket.on('room:update', (updates: Partial<RoomStateDTO>) => {
            setRoomState(prev => prev ? { ...prev, ...updates } : null);
        });

        newSocket.on('player:update', (players: any[]) => {
            setRoomState(prev => prev ? { ...prev, players } : null);
        });

        newSocket.on('cards:public_update', (cards: CardDTO[]) => {
            setRoomState(prev => prev ? { ...prev, cards } : null);
        });

        newSocket.on('cards:reveal', (cards: CardDTO[]) => {
            setRoomState(prev => prev ? { ...prev, cards } : null);
        });

        newSocket.on('hand:update', (hand: CardDTO[]) => {
            setMyHand(hand);
        });

        return () => {
            newSocket.close();
        };
    }, []);

    const joinRoom = (roomId: string, name: string) => {
        const userId = myUserId || undefined;
        socket?.emit('join', { roomId, name, userId });
    };

    const startGame = () => socket?.emit('game:start');
    const submitMetaphor = (cardId: string, text: string) => socket?.emit('game:submit_metaphor', { cardId, metaphor: text });
    const moveCard = (cardId: string, order: number) => socket?.emit('game:move_card', { cardId, order });
    const submitDone = () => socket?.emit('game:submit_done');
    const vote = (choice: 'CONTINUE' | 'REDUCE') => socket?.emit('vote', { choice });
    const resetLobby = () => socket?.emit('admin:reset_lobby');
    const updateSettings = (settings: any) => socket?.emit('room:update_settings', settings);
    const updateColor = (color: string) => socket?.emit('player:update_color', { color });

    return (
        <SocketContext.Provider value={{
            socket, isConnected, roomState, myHand, myUserId,
            joinRoom, startGame, submitMetaphor, moveCard, submitDone, vote, resetLobby, updateSettings, updateColor
        }}>
            {children}
        </SocketContext.Provider>
    );
};

export const useSocket = () => {
    const context = useContext(SocketContext);
    if (!context) throw new Error('useSocket must be used within a SocketProvider');
    return context;
};
