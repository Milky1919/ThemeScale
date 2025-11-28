import { Server, Socket } from 'socket.io';
import { store } from '../state/store';
import { v4 as uuidv4 } from 'uuid';
import { Card, RoomState, Player } from '../types';
import { THEMES } from '../data/themes';

export const registerGameHandlers = (io: Server, socket: Socket) => {

    const getPlayerRoom = (): { room: RoomState | null, player: Player | null } => {
        for (const [roomId, room] of store.getRooms()) {
            for (const [userId, player] of room.players) {
                if (player.socketId === socket.id) {
                    return { room, player };
                }
            }
        }
        return { room: null, player: null };
    };

    const startThemeSelection = (room: RoomState) => {
        room.phase = 'THEME_SELECTION';
        room.phaseEndTime = 0;

        // Select 3 Random Candidates
        const candidates = [];
        const availableThemes = [...THEMES];
        for (let i = 0; i < 3; i++) {
            if (availableThemes.length === 0) break;
            const idx = Math.floor(Math.random() * availableThemes.length);
            candidates.push(availableThemes[idx]);
            availableThemes.splice(idx, 1);
        }
        room.themeCandidates = candidates;

        io.to(room.roomId).emit('room:update', {
            phase: room.phase,
            phaseEndTime: room.phaseEndTime,
            currentRound: room.currentRound,
            currentLifes: room.currentLifes,
            currentHandCount: room.currentHandCount,
            successCount: room.successCount,
            themeCandidates: room.themeCandidates
        });

        // Broadcast Cards (Public: number hidden)
        const publicCards = room.cards.map((c) => ({
            id: c.id,
            ownerId: c.ownerId,
            metaphor: c.metaphor,
            order: c.order,
            isSubmitted: c.isSubmitted
        }));
        io.to(room.roomId).emit('cards:public_update', publicCards);

        // Send Private Hands
        const players = Array.from(room.players.values()).filter((p) => p.role === 'PLAYER');
        players.forEach((p) => {
            const myHand = room.cards.filter((c) => c.ownerId === p.userId);
            io.to(p.socketId).emit('hand:update', myHand);
        });
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
        room.deck = Array.from({ length: 100 }, (_, i) => i + 1);

        // Shuffle Deck
        for (let i = room.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [room.deck[i], room.deck[j]] = [room.deck[j], room.deck[i]];
        }

        // Distribute Cards
        room.cards = [];
        const players = Array.from(room.players.values()).filter((p) => p.role === 'PLAYER');

        if (players.length * room.currentHandCount > 100) {
            socket.emit('error', { code: 'CONFIG_ERROR', message: 'Not enough cards.' });
            return;
        }

        players.forEach((p) => {
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

        io.to(room.roomId).emit('player:update', Array.from(room.players.values()).map(p => ({
            userId: p.userId,
            name: p.name,
            color: p.color,
            role: p.role,
            status: p.status,
            isReady: p.isReady,
            isSubmitted: p.isSubmitted,
            vote: p.vote
        })));

        startThemeSelection(room);
    };

    const startRound = (room: RoomState) => {
        room.phase = 'PLAYING';
        // Use timeLimitGame for the playing phase
        room.phaseEndTime = room.settings.timeLimitGame > 0 ? Date.now() + (room.settings.timeLimitGame * 1000) : 0;

        io.to(room.roomId).emit('room:update', {
            phase: room.phase,
            phaseEndTime: room.phaseEndTime,
            theme: room.theme
        });
    };

    const selectTheme = (payload: { themeId?: string, customTheme?: any }) => {
        const { room, player } = getPlayerRoom();
        if (!room || !player) return;
        if (room.hostId !== player.userId) return;
        if (room.phase !== 'THEME_SELECTION') return;

        if (payload.customTheme) {
            room.theme = {
                id: uuidv4(),
                title: payload.customTheme.title,
                scaleMin: payload.customTheme.scaleMin,
                scaleMax: payload.customTheme.scaleMax
            };
        } else if (payload.themeId) {
            const selected = room.themeCandidates?.find(t => t.id === payload.themeId);
            if (selected) {
                room.theme = selected;
            }
        }

        if (room.theme) {
            startRound(room);
        }
    };

    const updateThemeText = (payload: { title: string, scaleMin: string, scaleMax: string }) => {
        const { room, player } = getPlayerRoom();
        if (!room || !player) return;
        if (room.hostId !== player.userId) return;

        if (room.theme) {
            room.theme.title = payload.title;
            room.theme.scaleMin = payload.scaleMin;
            room.theme.scaleMax = payload.scaleMax;

            io.to(room.roomId).emit('room:update', { theme: room.theme });
        }
    };

    const pauseTimer = () => {
        const { room, player } = getPlayerRoom();
        if (!room || !player) return;
        if (room.hostId !== player.userId) return;

        if (room.phaseEndTime > 0) {
            room.pausedRemaining = Math.max(0, room.phaseEndTime - Date.now());
            room.phaseEndTime = 0; // 0 means paused/no limit
            io.to(room.roomId).emit('room:update', { phaseEndTime: 0 });
        }
    };

    const resumeTimer = () => {
        const { room, player } = getPlayerRoom();
        if (!room || !player) return;
        if (room.hostId !== player.userId) return;

        if (room.pausedRemaining && room.pausedRemaining > 0) {
            room.phaseEndTime = Date.now() + room.pausedRemaining;
            room.pausedRemaining = null;
            io.to(room.roomId).emit('room:update', { phaseEndTime: room.phaseEndTime });
        }
    };

    const submitMetaphor = (payload: { cardId: string, metaphor: string }) => {
        const { room, player } = getPlayerRoom();
        if (!room || !player) return;

        const card = room.cards.find(c => c.id === payload.cardId);
        if (!card || card.ownerId !== player.userId) return;

        card.metaphor = payload.metaphor;

        // Notify owner
        const myHand = room.cards.filter((c) => c.ownerId === player.userId);
        socket.emit('hand:update', myHand);

        // Notify public (hide number)
        const publicCards = room.cards.map((c) => ({
            id: c.id,
            ownerId: c.ownerId,
            metaphor: c.metaphor,
            order: c.order,
            isSubmitted: c.isSubmitted
        }));
        io.to(room.roomId).emit('cards:public_update', publicCards);
    };

    const moveCard = (payload: { cardId: string, order: number }) => {
        const { room, player } = getPlayerRoom();
        if (!room || !player) return;

        const card = room.cards.find(c => c.id === payload.cardId);
        if (!card) return; // Allow moving any card if it's on table? No, usually only own cards or any card on table.
        // Rule: Players can move their own cards from hand to table.
        // Once on table, anyone can move them (cooperative game).

        // If card is in hand (order -1), only owner can move it.
        if (card.order === -1 && card.ownerId !== player.userId) return;

        card.order = payload.order;

        // Auto-unsubmit if player moves a card (Free movement rule)
        if (player.isSubmitted) {
            player.isSubmitted = false;
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

        // Notify public
        const publicCards = room.cards.map((c) => ({
            id: c.id,
            ownerId: c.ownerId,
            metaphor: c.metaphor,
            order: c.order,
            isSubmitted: c.isSubmitted
        }));
        io.to(room.roomId).emit('cards:public_update', publicCards);

        // Notify owner (hand update)
        if (card.ownerId === player.userId) {
            const myHand = room.cards.filter((c) => c.ownerId === player.userId);
            socket.emit('hand:update', myHand);
        }
    };

    const submitDone = () => {
        const { room, player } = getPlayerRoom();
        if (!room || !player) return;

        // Check if player has cards in hand
        const hasCardsInHand = room.cards.some(c => c.ownerId === player.userId && c.order === -1);
        if (hasCardsInHand) {
            socket.emit('error', { code: 'CARDS_IN_HAND', message: '全ての手札を場に出してください。' });
            return;
        }

        player.isSubmitted = !player.isSubmitted;

        io.to(room.roomId).emit('player:update', Array.from(room.players.values()).map(p => ({
            userId: p.userId,
            name: p.name,
            color: p.color,
            role: p.role,
            status: p.status,
            isReady: p.isReady,
            isSubmitted: p.isSubmitted
        })));

        // Check if all players submitted
        const players = Array.from(room.players.values()).filter(p => p.role === 'PLAYER');
        if (players.every(p => p.isSubmitted)) {
            // Check if all cards are on table
            const allCardsOnTable = room.cards.every(c => c.order >= 0);

            if (allCardsOnTable) {
                // Evaluate Result
                const submittedCards = room.cards.sort((a, b) => a.order - b.order);
                let isSuccess = true;
                const invalidCardIds: string[] = [];

                for (let i = 0; i < submittedCards.length - 1; i++) {
                    if (submittedCards[i].number > submittedCards[i + 1].number) {
                        isSuccess = false;
                        invalidCardIds.push(submittedCards[i].id);
                        invalidCardIds.push(submittedCards[i + 1].id); // Mark both as problematic? Or just the first one?
                        // Usually just mark the ones that break order.
                    }
                }

                if (isSuccess) {
                    room.successCount++;
                    room.resultMessage = "成功！";
                    // Check for level up / extra clear
                    if (room.cards.length === 0) { // Should not happen if allCardsOnTable is true
                        // Logic for next round
                    }
                } else {
                    room.currentLifes--;
                    room.resultMessage = "失敗...";
                    room.resultInvalidCardIds = [...new Set(invalidCardIds)];
                }

                if (room.currentLifes <= 0) {
                    room.phase = 'ENDED';
                    room.resultMessage = "ゲームオーバー";
                } else {
                    room.phase = 'RESULT_VOTING';
                    room.phaseEndTime = Date.now() + (room.settings.timeLimitVoting * 1000);
                }

                // Reveal all numbers
                const publicCards = room.cards.map((c) => ({
                    id: c.id,
                    ownerId: c.ownerId,
                    metaphor: c.metaphor,
                    order: c.order,
                    isSubmitted: c.isSubmitted,
                    number: c.number // Reveal number
                }));
                io.to(room.roomId).emit('cards:public_update', publicCards);

                io.to(room.roomId).emit('room:update', {
                    phase: room.phase,
                    phaseEndTime: room.phaseEndTime,
                    successCount: room.successCount,
                    currentLifes: room.currentLifes,
                    resultMessage: room.resultMessage,
                    resultInvalidCardIds: room.resultInvalidCardIds
                });
            }
        }
    };

    const vote = (payload: { choice: 'CONTINUE' | 'REDUCE' }) => {
        const { room, player } = getPlayerRoom();
        if (!room || !player) return;
        if (room.phase !== 'RESULT_VOTING') return;

        player.vote = payload.choice;

        const players = Array.from(room.players.values()).filter(p => p.role === 'PLAYER');
        if (players.every(p => p.vote)) {
            const reduceVotes = players.filter(p => p.vote === 'REDUCE').length;
            const continueVotes = players.filter(p => p.vote === 'CONTINUE').length;

            if (reduceVotes > continueVotes) {
                room.currentHandCount = Math.max(1, room.currentHandCount - 1);
            }

            // Prepare next round
            room.currentRound++;

            // Return cards from the previous round to the deck.
            const usedCardNumbers = room.cards.map(c => c.number);
            room.deck.push(...usedCardNumbers);

            // Shuffle the deck.
            for (let i = room.deck.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [room.deck[i], room.deck[j]] = [room.deck[j], room.deck[i]];
            }

            // Check if there are enough cards for the next round.
            if (players.length * room.currentHandCount > room.deck.length) {
                room.phase = 'ENDED';
                room.resultMessage = "山札のカードが足りません。";
                io.to(room.roomId).emit('room:update', {
                    phase: room.phase,
                    resultMessage: room.resultMessage
                });
                return;
            }

            room.cards = [];
            players.forEach((p) => {
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
                    } else {
                        console.error(`[Room ${room.roomId}] Deck empty during card distribution!`);
                    }
                }
            });

            startThemeSelection(room);

        } else {
            io.to(room.roomId).emit('player:update', Array.from(room.players.values()).map(p => ({
                userId: p.userId,
                name: p.name,
                color: p.color,
                role: p.role,
                status: p.status,
                isReady: p.isReady,
                isSubmitted: p.isSubmitted,
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
            userId: player.userId
        });

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

    const updateSettings = (payload: Partial<any>) => {
        const { room, player } = getPlayerRoom();
        if (!room || !player) return;
        if (room.hostId !== player.userId) return;
        if (room.phase !== 'LOBBY') return;

        room.settings = { ...room.settings, ...payload };

        io.to(room.roomId).emit('room:update', { settings: room.settings });
    };

    const updateColor = (payload: { color: string }) => {
        const { room, player } = getPlayerRoom();
        if (!room || !player) return;
        if (room.phase !== 'LOBBY') return;

        // Check if color is already taken
        const isTaken = Array.from(room.players.values()).some(p => p.color === payload.color && p.userId !== player.userId);
        if (isTaken) {
            socket.emit('error', { code: 'COLOR_TAKEN', message: 'This color is already taken.' });
            return;
        }

        player.color = payload.color;

        io.to(room.roomId).emit('player:update', Array.from(room.players.values()).map(p => ({
            userId: p.userId,
            name: p.name,
            color: p.color,
            role: p.role,
            status: p.status,
            isReady: p.isReady,
            isSubmitted: p.isSubmitted
        })));
    };

    socket.on('game:start', startGame);
    socket.on('room:update_settings', updateSettings);
    socket.on('player:update_color', updateColor);
    socket.on('game:select_theme', selectTheme);
    socket.on('game:update_theme_text', updateThemeText);
    socket.on('game:pause_timer', pauseTimer);
    socket.on('game:resume_timer', resumeTimer);
    socket.on('game:submit_metaphor', submitMetaphor);
    socket.on('game:move_card', moveCard);
    socket.on('game:submit_done', submitDone);
    socket.on('vote', vote);
    socket.on('admin:reset_lobby', resetLobby);
};

export const checkTimeouts = (io: Server) => {
    const now = Date.now();
    for (const [roomId, room] of store.getRooms()) {
        if (room.phaseEndTime > 0 && now >= room.phaseEndTime) {
            console.log(`Room ${roomId} time expired for phase ${room.phase}`);

            if (room.phase === 'PLAYING') {
                // Time's up! Force Game Over or Result
                room.phase = 'ENDED';
                room.resultMessage = "時間切れ！ゲームオーバー";
                room.phaseEndTime = 0;

                io.to(roomId).emit('room:update', {
                    phase: room.phase,
                    phaseEndTime: 0,
                    resultMessage: room.resultMessage
                });
            } else if (room.phase === 'RESULT_VOTING') {
                // Voting time over, force next round or end
                // For now, let's just force next round logic similar to 'CONTINUE' majority
                // Or just reset to LOBBY if undecided?
                // Let's force a "CONTINUE" behavior for simplicity or just stop the timer.
                room.phaseEndTime = 0;
                io.to(roomId).emit('room:update', { phaseEndTime: 0 });
            }
        }
    }
};
