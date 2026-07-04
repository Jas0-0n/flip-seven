export function buildDeck() {
  let deck = [];
  let id = 0;
  for (let v = 0; v <= 12; v++) {
    let count = v === 0 ? 1 : v;
    for (let i = 0; i < count; i++) {
      deck.push({ type: 'number', value: v, effect: null, id: 'n' + (id++) });
    }
  }
  deck.push({ type: 'special', value: '+2', effect: 2, id: 'sp2' });
  deck.push({ type: 'special', value: '+4', effect: 4, id: 'sp4' });
  deck.push({ type: 'special', value: '+6', effect: 6, id: 'sp6' });
  deck.push({ type: 'special', value: '+8', effect: 8, id: 'sp8' });
  deck.push({ type: 'special', value: '+10', effect: 10, id: 'sp10' });
  deck.push({ type: 'special', value: 'x2', effect: 'double', id: 'spx2' });
  for (let i = 1; i <= 10; i++) {
    deck.push({ type: 'action', value: 'freeze', effect: 'freeze', id: 'af' + i });
  }
  for (let i = 1; i <= 10; i++) {
    deck.push({ type: 'revive', value: 'revive', effect: 'revive', id: 'rv' + i });
  }
  return deck;
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createInitialState() {
  return {
    players: [
      { id: 1, hand: [], score: 0 },
      { id: 2, hand: [], score: 0 }
    ],
    currentPlayer: Math.random() < 0.5 ? 1 : 2,
    state: 'waiting',
    deck: shuffle(buildDeck()),
    discard: [],
    roundNumber: 1,
    totalFlipsThisRound: 0,
    history: [],
    flipAnimating: false,
    playerOut: [false, false],
    firstOut: null
  };
}
