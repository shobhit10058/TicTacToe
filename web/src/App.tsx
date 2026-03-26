import { useNakama } from './hooks/useNakama';
import { useMatch } from './hooks/useMatch';
import { LoginScreen } from './components/LoginScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { GameScreen } from './components/GameScreen';
import { GameOver } from './components/GameOver';

export default function App() {
  const nakama = useNakama();
  const { state: match, findMatch, createMatch, joinMatch, sendMove, leaveMatch } = useMatch(
    nakama.socket,
    nakama.client,
    nakama.session,
  );

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

  // 3. In lobby (idle) — no active match
  if (match.phase === 'idle') {
    return (
      <LobbyScreen
        onFindMatch={findMatch}
        onCreateMatch={createMatch}
        onJoinMatch={joinMatch}
        phase={match.phase}
        matchId={match.matchId}
      />
    );
  }

  // 4. Searching / waiting / playing
  if (match.phase === 'searching' || match.phase === 'waiting') {
    return (
      <LobbyScreen
        onFindMatch={findMatch}
        onCreateMatch={createMatch}
        onJoinMatch={joinMatch}
        phase={match.phase}
        matchId={match.matchId}
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
