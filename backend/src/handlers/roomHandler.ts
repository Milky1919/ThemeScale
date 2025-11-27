import { Server, Socket } from 'socket.io';
import { store } from '../state/store';
import { Player, RoomStateDTO, PlayerDTO, CardDTO } from '../types';
import { v4 as uuidv4 } from 'uuid';

export const registerRoomHandlers = (io: Server, socket: Socket) => {
    const joinRoom = (payload: { roomId: string; name: string; userId?: string }) => {
        const { roomId, name } = payload;
        let userId = payload.userId;

        // Validate inputs
        if (!roomId || !name) {
            socket.emit('error', { code: 'INVALID_INPUT', message: 'Room ID and Name are required.' });
            return;
        }

        const finalUserId = userId || uuidv4();
        let room = store.getRoom(roomId);
        let player: Player | undefined;

        // Create room if it doesn't exist (First user is host)
        if (!room) {
            room = store.createRoom(roomId, finalUserId, name, socket.id);
            player = room.players.get(finalUserId);
            console.log(`Room ${roomId} created by ${name} (${finalUserId})`);
        } else {
            // Join existing room
            player = room.players.get(finalUserId);

            if (player) {
                // Reconnection
                player.socketId = socket.id;
                player.status = 'ONLINE';
                player.name = name; // Update name on reconnect?
                console.log(`User ${name} (${finalUserId}) reconnected to ${roomId}`);
            } else {
                // New player joining
                // Check capacity (Spectators)
                // For now, just add as PLAYER or SPECTATOR based on phase
                const role = room.phase === 'LOBBY' ? 'PLAYER' : 'SPECTATOR';

                // Generate random color
                const colors = ['#E63946', '#F1FAEE', '#A8DADC', '#457B9D', '#1D3557', '#E76F51', '#F4A261', '#2A9D8F'];
                const color = colors[Math.floor(Math.random() * colors.length)];

                player = {
                    userId: finalUserId,
                    socketId: socket.id,
                    name,
                    color,
                    role,
                    status: 'ONLINE',
                    isReady: false,
                    joinedAt: Date.now(),
                    lastActiveAt: Date.now()
                };
                room.players.set(finalUserId, player);
                console.log(`User ${name} (${finalUserId}) joined ${roomId} as ${role}`);
            }
        }

        // Join Socket.IO room
        socket.join(roomId);

        // Send Sync Data (Unicast)
        const roomStateDTO: RoomStateDTO = {
            roomId: room.roomId,
            hostId: room.hostId,
            phase: room.phase,
            phaseEndTime: room.phaseEndTime,
            settings: room.settings,
            currentRound: room.currentRound,
            currentHandCount: room.currentHandCount,
            successCount: room.successCount,
            currentLifes: room.currentLifes,
            isEndlessMode: room.isEndlessMode,
            resultMessage: room.resultMessage,
            resultInvalidCardIds: room.resultInvalidCardIds,
            theme: room.theme,
            players: Array.from(room.players.values()).map((p: Player) => ({
                userId: p.userId,
                name: p.name,
                color: p.color,
                role: p.role,
                status: p.status,
                isReady: p.isReady,
                isSubmitted: p.isSubmitted,
                vote: p.vote
            })),
            cards: room.cards.map(c => ({
                id: c.id,
                ownerId: c.ownerId,
                metaphor: c.metaphor,
                order: c.order,
                isSubmitted: c.isSubmitted,
                number: (c.ownerId === finalUserId || room?.phase === 'RESULT_REVEAL' || room?.phase === 'ENDED') ? c.number : undefined
            }))
        };

        // My Hand (Unicast)
        const myHand = room.cards.filter(c => c.ownerId === finalUserId);

        socket.emit('room:sync', { publicState: roomStateDTO, myHand, userId: finalUserId });

        // Broadcast Player Update
        const playersList = Array.from(room.players.values()).map((p: Player) => ({
            userId: p.userId,
            name: p.name,
            color: p.color,
            role: p.role,
            status: p.status,
            isReady: p.isReady
        }));
        io.to(roomId).emit('player:update', playersList);
    };

    const disconnect = () => {
        // Find room and player
        for (const [roomId, room] of store.getRooms()) {
            for (const [userId, player] of room.players) {
                if (player.socketId === socket.id) {
                    player.status = 'OFFLINE';
                    player.lastActiveAt = Date.now();
                    console.log(`User ${player.name} disconnected from ${roomId}`);

                    // Broadcast update
                    const playersList = Array.from(room.players.values()).map((p: Player) => ({
                        userId: p.userId,
                        name: p.name,
                        color: p.color,
                        role: p.role,
                        status: p.status,
                        isReady: p.isReady
                    }));
                    io.to(roomId).emit('player:update', playersList);
                    return;
                }
            }
        }
    };

    socket.on('join', joinRoom);
    socket.on('disconnect', disconnect);
};
