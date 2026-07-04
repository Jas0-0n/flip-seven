export function calculateRoundScore(state, playerIdx) {
  const player = state.players[playerIdx];
  let hasX2 = false;
  let sum = 0;
  for (const card of player.hand) {
    if (card.type === 'number') sum += card.value;
    else if (card.type === 'special') {
      if (card.effect === 'double') hasX2 = true;
      else sum += card.effect;
    }
  }
  return hasX2 ? sum * 2 : sum;
}

export function checkWinner(state, playerIdx) {
  return state.players[playerIdx].score >= 200;
}

export function getActivePlayers(state) {
  const active = [];
  for (let i = 0; i < 2; i++) {
    if (!state.playerOut[i]) active.push(i);
  }
  return active;
}

export function switchToNextPlayer(state) {
  const active = getActivePlayers(state);
  if (active.length <= 1) return;
  const curIdx = state.currentPlayer - 1;
  const pos = active.indexOf(curIdx);
  state.currentPlayer = active[(pos + 1) % active.length] + 1;
}
