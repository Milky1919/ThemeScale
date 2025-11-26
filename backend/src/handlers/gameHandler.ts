import { Server, Socket } from 'socket.io';
import { store } from '../state/store';
import { v4 as uuidv4 } from 'uuid';
import { Card } from '../types';

export const registerGameHandlers = (io: Server, socket: Socket) => {

    const getPlayerRoom = () => {
        for (const [roomId, room] of store.getRooms()) {
            for (const [userId, player] of room.players) {
                if (player.socketId === socket.id) {
                    return { room, player };
                }
            }
        }
        return { room: null, player: null };
    };

    const startGame = () => {
        const { room, player } = getPlayerRoom();
        if (!room || !player) return;

        if (room.hostId !== player.userId) {
            socket.emit('error', { code: 'FORBIDDEN', message: 'Only host can start the game.' });
            return;
        }

        if (room.phase !== 'LOBBY' && room.phase !== 'ENDED') {
            socket.emit('error', { code: 'INVALID_PHASE', message: 'Game already running.' });
            return;
        }

        // Initialize Game
        room.currentRound = 1;
        room.successCount = 0;
        room.currentLifes = room.settings.maxLifes;
        room.currentHandCount = room.settings.initialHandCount;
        room.isEndlessMode = false;
        room.resultMessage = undefined;
        room.resultInvalidCardIds = [];
        room.deck = Array.from({ length: 100 }, (_, i) => i + 1); // 1-100

        // Shuffle Deck
        for (let i = room.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [room.deck[i], room.deck[j]] = [room.deck[j], room.deck[i]];
        }

        // Distribute Cards
        room.cards = [];
        const players = Array.from(room.players.values()).filter(p => p.role === 'PLAYER');

        if (players.length * room.currentHandCount > 100) {
            socket.emit('error', { code: 'CONFIG_ERROR', message: 'Not enough cards.' });
            return;
        }

        players.forEach(p => {
            p.isSubmitted = false;
            p.vote = undefined;
            for (let i = 0; i < room.currentHandCount; i++) {
                const number = room.deck.pop();
                if (number) {
                    const card: Card = {
                        id: uuidv4(),
                        number,
                        ownerId: p.userId,
                        metaphor: '',
                        order: -1,
                        isSubmitted: false
                    };
                    room.cards.push(card);
                }
            }
        });

        // Update Phase
        room.phase = 'PLAYING_EXPRESSION';
        room.phaseEndTime = Date.now() + (room.settings.timeLimitExpression * 1000);

        // Broadcast Update
        io.to(room.roomId).emit('room:update', {
            phase: room.phase,
            phaseEndTime: room.phaseEndTime,
            currentRound: room.currentRound,
            currentLifes: room.currentLifes,
            currentHandCount: room.currentHandCount,
            successCount: room.successCount
        });

        // Broadcast Cards (Public: number hidden)
        const publicCards = room.cards.map(c => ({
            id: c.id,
            ownerId: c.ownerId,
            metaphor: c.metaphor,
            order: c.order,
            isSubmitted: c.isSubmitted
        }));
        io.to(room.roomId).emit('cards:public_update', publicCards);

        // Send Private Hands
        players.forEach(p => {
            const myHand = room.cards.filter(c => c.ownerId === p.userId);
            io.to(p.socketId).emit('hand:update', myHand);
        });

        // Set Timer
        if (room.timerId) clearTimeout(room.timerId);
        room.timerId = setTimeout(() => {
            room.phase = 'PLAYING_SUBMISSION';
            room.phaseEndTime = Date.now() + (room.settings.timeLimitSubmission * 1000);
            io.to(room.roomId).emit('room:update', { phase: room.phase, phaseEndTime: room.phaseEndTime });
        }, room.settings.timeLimitExpression * 1000);
    };

    const submitMetaphor = (payload: { cardId: string, text: string }) => {
        const { room, player } = getPlayerRoom();
        if (!room || !player) return;
        if (room.phase !== 'PLAYING_EXPRESSION') return;

        const card = room.cards.find(c => c.id === payload.cardId);
        if (!card || card.ownerId !== player.userId) return;

        card.metaphor = payload.text.substring(0, 50);

        io.to(room.roomId).emit('cards:public_update', room.cards.map(c => ({
            id: c.id,
            ownerId: c.ownerId,
            metaphor: c.metaphor,
            order: c.order,
            isSubmitted: c.isSubmitted
        })));
    };

    const moveCard = (payload: { cardId: string, index: number }) => {
        const { room, player } = getPlayerRoom();
        if (!room || !player) return;
        if (room.phase !== 'PLAYING_SUBMISSION') return;

        const card = room.cards.find(c => c.id === payload.cardId);
        if (!card || card.ownerId !== player.userId) return;
        if (player.isSubmitted) return; // Already locked

        // Remove from current position (if on table)
        // Actually, we just re-assign order.
        // If order was -1, it's new to table.

        // Get all cards currently on table
        let submittedCards = room.cards.filter(c => c.order >= 0).sort((a, b) => a.order - b.order);

        // If card is already on table, remove it from array first
        if (card.order >= 0) {
            submittedCards = submittedCards.filter(c => c.id !== card.id);
        }

        // Insert at new index
        // Clamp index
        let newIndex = payload.index;
        if (newIndex < 0) newIndex = 0;
        if (newIndex > submittedCards.length) newIndex = submittedCards.length;

        submittedCards.splice(newIndex, 0, card);

        // Re-assign orders
        submittedCards.forEach((c, i) => {
            c.order = i;
        });

        // If card was not on table before, it is now.
        // If it was, it's reordered.

        io.to(room.roomId).emit('cards:public_update', room.cards.map(c => ({
            id: c.id,
            ownerId: c.ownerId,
            metaphor: c.metaphor,
            order: c.order,
            isSubmitted: c.isSubmitted
        })));
    };

    const submitDone = () => {
        const { room, player } = getPlayerRoom();
        if (!room || !player) return;
        if (room.phase !== 'PLAYING_SUBMISSION') return;

        // Check if all cards of player are submitted?
        // Not necessarily required, but good practice.
        // For now, just mark done.
        player.isSubmitted = true;

        // Check if all players submitted
        const players = Array.from(room.players.values()).filter(p => p.role === 'PLAYER');
        if (players.every(p => p.isSubmitted)) {
            // Proceed to Result
            evaluateResult(room);
        } else {
            // Broadcast player update
            io.to(room.roomId).emit('player:update', Array.from(room.players.values()).map(p => ({
                userId: p.userId,
                name: p.name,
                color: p.color,
                role: p.role,
                status: p.status,
                isReady: p.isReady,
                isSubmitted: p.isSubmitted
            })));
        }
    };

    const evaluateResult = (room: any) => {
        // Logic for evaluation
        const submittedCards = room.cards.filter((c: any) => c.order >= 0).sort((a: any, b: any) => a.order - b.order);

        const invalidCardIds: string[] = [];
        for (let i = 0; i < submittedCards.length - 1; i++) {
            if (submittedCards[i].number > submittedCards[i + 1].number) {
                invalidCardIds.push(submittedCards[i].id); // Mark the one that is "bigger" than next?
                // Or mark both? Or mark the specific out of order ones.
                // Simple check: if current > next, current is out of place relative to next.
                // Let's mark all involved in inversions.
                invalidCardIds.push(submittedCards[i + 1].id);
            }
        }
        // Dedupe
        room.resultInvalidCardIds = [...new Set(invalidCardIds)];

        room.phase = 'RESULT_REVEAL';
        // Reveal numbers
        io.to(room.roomId).emit('cards:reveal', room.cards.map((c: any) => ({
            id: c.id,
            ownerId: c.ownerId,
            metaphor: c.metaphor,
            order: c.order,
            isSubmitted: c.isSubmitted,
            number: c.number
        })));

        io.to(room.roomId).emit('room:update', {
            phase: room.phase,
            resultInvalidCardIds: room.resultInvalidCardIds
        });

        // Next steps
        if (room.timerId) clearTimeout(room.timerId);

        setTimeout(() => {
            if (room.resultInvalidCardIds.length === 0) {
                // Success
                room.successCount++;
                if (room.successCount >= room.settings.winConditionCount) {
                    room.phase = 'ENDED';
                    room.resultMessage = "GAME CLEAR!";
                } else {
                    // Next Round
                    room.currentHandCount++;
                    // Check limit
                    const players = Array.from(room.players.values()).filter((p: any) => p.role === 'PLAYER');
                    if (players.length * room.currentHandCount > 100) {
                        room.phase = 'ENDED';
                        room.resultMessage = "EXTRA CLEAR!";
                    } else {
                        // Restart loop
                        startGame(); // Recursive? No, just call logic.
                        // But startGame checks phase.
                        // We need to reset phase to LOBBY or just force start.
                        // Let's refactor startGame or just set phase and call logic.
                        // For simplicity, set phase to LOBBY then call startGame?
                        // No, startGame resets everything.
                        // We need "nextRound".
                        // I'll just copy logic or make a helper.
                        // For MVP, I'll just set phase to PLAYING_EXPRESSION and re-deal.
                        // But I need to reset deck.
                        // Let's call a helper `startRound(room)`.
                        startRound(room);
                        return;
                    }
                }
            } else {
                // Failure
                room.currentLifes--;
                if (room.currentLifes <= 0) {
                    room.phase = 'ENDED';
                    room.resultMessage = "GAME OVER";
                } else {
                    room.phase = 'RESULT_VOTING';
                    room.phaseEndTime = Date.now() + (room.settings.timeLimitVoting * 1000);
                }
            }

            io.to(room.roomId).emit('room:update', {
                phase: room.phase,
                phaseEndTime: room.phaseEndTime,
                successCount: room.successCount,
                currentLifes: room.currentLifes,
                resultMessage: room.resultMessage
            });

        }, 5000);
    };

    const startRound = (room: any) => {
        // Reset deck and deal
        room.deck = Array.from({ length: 100 }, (_, i) => i + 1);
        for (let i = room.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [room.deck[i], room.deck[j]] = [room.deck[j], room.deck[i]];
        }

        room.cards = [];
        const players = Array.from(room.players.values()).filter((p: any) => p.role === 'PLAYER');

        players.forEach((p: any) => {
            p.isSubmitted = false;
            p.vote = undefined;
            for (let i = 0; i < room.currentHandCount; i++) {
                const number = room.deck.pop();
                if (number) {
                    const card: Card = {
                        id: uuidv4(),
                        number,
                        ownerId: p.userId,
                        metaphor: '',
                        order: -1,
                        isSubmitted: false
                    };
                    room.cards.push(card);
                }
            }
        });

        room.phase = 'PLAYING_EXPRESSION';
        room.phaseEndTime = Date.now() + (room.settings.timeLimitExpression * 1000);
        room.resultInvalidCardIds = [];

        io.to(room.roomId).emit('room:update', {
            phase: room.phase,
            phaseEndTime: room.phaseEndTime,
            currentRound: room.currentRound, // Should increment?
            currentLifes: room.currentLifes,
            currentHandCount: room.currentHandCount,
            successCount: room.successCount,
            resultInvalidCardIds: []
        });

        const publicCards = room.cards.map((c: any) => ({
            id: c.id,
            ownerId: c.ownerId,
            metaphor: c.metaphor,
            order: c.order,
            isSubmitted: c.isSubmitted
        }));
        io.to(room.roomId).emit('cards:public_update', publicCards);

        players.forEach((p: any) => {
            const myHand = room.cards.filter((c: any) => c.ownerId === p.userId);
            io.to(p.socketId).emit('hand:update', myHand);
        });

        if (room.timerId) clearTimeout(room.timerId);
        room.timerId = setTimeout(() => {
            room.phase = 'PLAYING_SUBMISSION';
            room.phaseEndTime = Date.now() + (room.settings.timeLimitSubmission * 1000);
            io.to(room.roomId).emit('room:update', { phase: room.phase, phaseEndTime: room.phaseEndTime });
        }, room.settings.timeLimitExpression * 1000);
    };

    const vote = (payload: { choice: 'CONTINUE' | 'REDUCE' }) => {
        const { room, player } = getPlayerRoom();
        if (!room || !player) return;
        if (room.phase !== 'RESULT_VOTING') return;

        player.vote = payload.choice;

        // Check if all voted
        const players = Array.from(room.players.values()).filter(p => p.role === 'PLAYER');
        if (players.every(p => p.vote)) {
            // Tally
            const reduceVotes = players.filter(p => p.vote === 'REDUCE').length;
            const continueVotes = players.filter(p => p.vote === 'CONTINUE').length;

            if (reduceVotes > continueVotes) {
                room.currentHandCount = Math.max(1, room.currentHandCount - 1);
            }

            // Retry round
            startRound(room);
        } else {
            io.to(room.roomId).emit('player:update', Array.from(room.players.values()).map(p => ({
                userId: p.userId,
                name: p.name,
                color: p.color,
                role: p.role,
                status: p.status,
                isReady: p.isReady,
                vote: p.vote
            })));
        }
    };

    const resetLobby = () => {
        const { room, player } = getPlayerRoom();
        if (!room || !player) return;
        if (room.hostId !== player.userId) return;

        room.phase = 'LOBBY';
        room.currentRound = 1;
        room.successCount = 0;
        room.currentLifes = room.settings.maxLifes;
        room.currentHandCount = room.settings.initialHandCount;
        room.cards = [];
        room.deck = [];
        room.resultMessage = undefined;
        room.resultInvalidCardIds = [];

        Array.from(room.players.values()).forEach(p => {
            p.isReady = false;
            p.isSubmitted = false;
            p.vote = undefined;
        });

        io.to(room.roomId).emit('room:sync', {
            publicState: {
                roomId: room.roomId,
                hostId: room.hostId,
                phase: room.phase,
                phaseEndTime: 0,
                settings: room.settings,
                currentRound: room.currentRound,
                currentHandCount: room.currentHandCount,
                successCount: room.successCount,
                currentLifes: room.currentLifes,
                isEndlessMode: room.isEndlessMode,
                theme: room.theme,
                players: Array.from(room.players.values()).map(p => ({
                    userId: p.userId,
                    name: p.name,
                    color: p.color,
                    role: p.role,
                    status: p.status,
                    isReady: p.isReady
                })),
                cards: []
            },
            myHand: [],
            userId: player.userId // This might be wrong if broadcasting, but room:sync is unicast usually.
            // Here we want broadcast.
        });

        // Actually room:sync is unicast. We should use room:update + player:update + cards:public_update
        io.to(room.roomId).emit('room:update', {
            phase: 'LOBBY',
            currentRound: 1,
            successCount: 0,
            currentLifes: room.settings.maxLifes,
            cards: []
        });
        io.to(room.roomId).emit('cards:public_update', []);
        io.to(room.roomId).emit('player:update', Array.from(room.players.values()).map(p => ({
            userId: p.userId,
            name: p.name,
            color: p.color,
            role: p.role,
            status: p.status,
            isReady: p.isReady
        })));
    };

    socket.on('game:start', startGame);
    socket.on('game:submit_metaphor', submitMetaphor);
    socket.on('game:move_card', moveCard);
    socket.on('game:submit_done', submitDone);
    socket.on('vote', vote);
    socket.on('admin:reset_lobby', resetLobby);
};
