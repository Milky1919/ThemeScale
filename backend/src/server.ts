import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { registerRoomHandlers } from './handlers/roomHandler';
import { registerGameHandlers } from './handlers/gameHandler';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*", // In production, set this to the frontend URL
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    registerRoomHandlers(io, socket);
    registerGameHandlers(io, socket);

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Local: http://localhost:${PORT}`);
    console.log(`Frontend: http://localhost:5173`);
    console.log(`App (via Nginx): http://localhost`);
});
