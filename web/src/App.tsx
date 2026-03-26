import { useState } from 'react';
import { useNakama } from './hooks/useNakama';
import { useMatch } from './hooks/useMatch';
import { LoginScreen } from './components/LoginScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { GameScreen } from './components/GameScreen';
import { GameOver } from './components/GameOver';
import { LeaderboardScreen } from './components/LeaderboardScreen';

type AppScreen = 'lobby' | 'leaderboard';

export default function App() {
  const nakama = useNakama();
  const { state: match, findMatch, createMatch, joinMatch, sendMove, leaveMatch } = useMatch(
    nakama.socket,
    nakama.client,
    nakama.session,
  );
  const [screen, setScreen] = useState<AppScreen>('lobby');

  // 1. Not logged in yet
  if (!nakama.session) {
    return (
      <LoginScreen
        onLogin={nakama.login}
        isConnecting={nakama.isConnecting}
        error={nakama.error}
      />
    );
  }

  // 2. Game just ended — show result screen
  if (match.phase === 'finished') {
    return <GameOver match={match} onPlayAgain={leaveMatch} />;
  }

  // 3. Leaderboard
  if (screen === 'leaderboard') {
    return (
      <LeaderboardScreen
        client={nakama.client}
        session={nakama.session}
        onBack={() => setScreen('lobby')}
      />
    );
  }

  // 4. In lobby or searching/waiting — show lobby shell
  if (match.phase === 'idle' || match.phase === 'searching' || match.phase === 'waiting') {
    return (
      <LobbyScreen
        onFindMatch={findMatch}
        onCreateMatch={createMatch}
        onJoinMatch={joinMatch}
        onShowLeaderboard={() => setScreen('leaderboard')}
        phase={match.phase}
        matchId={match.matchId}
        matchMode={match.matchMode}
      />
    );
  }

  // 5. Active game
  return (
    <GameScreen
      match={match}
      onMove={sendMove}
      onLeave={leaveMatch}
    />
  );
}
