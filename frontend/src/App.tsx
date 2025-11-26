import React from 'react';
import { SocketProvider, useSocket } from './context/SocketContext';
import { Lobby } from './components/Lobby';
import { GameBoard } from './components/GameBoard';
import { Result } from './components/Result';
import { ThemeSelection } from './components/ThemeSelection';

const GameRouter: React.FC = () => {
    const { roomState } = useSocket();

    if (!roomState || roomState.phase === 'LOBBY') {
        return <Lobby />;
    }

    if (roomState.phase === 'THEME_SELECTION') {
        return <ThemeSelection />;
    }

    if (roomState.phase === 'PLAYING') {
        return <GameBoard />;
    }

    if (roomState.phase === 'RESULT_REVEAL' || roomState.phase === 'RESULT_VOTING' || roomState.phase === 'ENDED') {
        return <Result />;
    }

    return <div>Unknown Phase</div>;
};

function App() {
    return (
        <SocketProvider>
            <GameRouter />
        </SocketProvider>
    );
}

export default App;
