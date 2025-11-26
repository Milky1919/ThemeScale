import { GameRoom, Player, GameSettings } from '../types';

class Store {
    private rooms: Map<string, GameRoom> = new Map();

    createRoom(roomId: string, hostId: string, hostName: string, hostSocketId: string): GameRoom {
        const defaultSettings: GameSettings = {
            initialHandCount: 1,
            maxLifes: 2,
            winConditionCount: 3,
            timeLimitGame: 120,
            timeLimitVoting: 30
        };

        const hostPlayer: Player = {
            userId: hostId,
            socketId: hostSocketId,
            name: hostName,
            color: this.generateColor(),
            role: 'PLAYER',
            status: 'ONLINE',
            isReady: false,
            joinedAt: Date.now(),
            lastActiveAt: Date.now()
        };

        const room: GameRoom = {
            roomId,
            hostId,
            phase: 'LOBBY',
            phaseEndTime: 0,
            createdAt: Date.now(),
            lastActivityAt: Date.now(),
            settings: defaultSettings,
            currentRound: 1,
            currentHandCount: defaultSettings.initialHandCount,
            successCount: 0,
            currentLifes: defaultSettings.maxLifes,
            isEndlessMode: false,
            theme: {
                id: 'default',
                category: 'Default',
                title: 'Waiting for Theme...',
                scaleMin: '1',
                scaleMax: '100',
                editingUserId: null,
                lockExpiresAt: null
            },
            players: new Map([[hostId, hostPlayer]]),
            deck: [],
            cards: [],
            timerId: null
        };

        this.rooms.set(roomId, room);
        return room;
    }

    getRoom(roomId: string): GameRoom | undefined {
        return this.rooms.get(roomId);
    }

    getRooms(): Map<string, GameRoom> {
        return this.rooms;
    }

    removeRoom(roomId: string) {
        const room = this.rooms.get(roomId);
        if (room && room.timerId) {
            clearTimeout(room.timerId);
        }
        this.rooms.delete(roomId);
    }

    private generateColor(): string {
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEEAD', '#D4A5A5', '#9B59B6', '#3498DB'];
        return colors[Math.floor(Math.random() * colors.length)];
    }
}

export const store = new Store();
