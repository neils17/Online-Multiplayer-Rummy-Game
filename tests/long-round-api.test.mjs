import assert from 'node:assert/strict';
const base = process.env.GAME_URL || 'http://localhost:3000';
const api = async body => {
  const response = await fetch(base+'/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const result = await response.json();
  assert.equal(response.status,200,result.error);
  return result;
};
const first = await api({action:'create',name:'Long round A'});
const second = await api({action:'join',name:'Long round B',code:first.game.code});
const seats = [{code:first.game.code,token:first.token},{code:first.game.code,token:second.token}];
let state = second.game, recycled = false, previousRemaining = state.remaining;
for(let turn=0;turn<100;turn++) {
  const me=state.turn, seat=seats[me], previousTop=state.pile[0];
  const before = (await api({...seat,action:'poll'})).game;
  const drawn = (await api({...seat,action:'draw'})).game;
  const card = drawn.players[me].hand.find(c=>!before.players[me].hand.some(old=>old.id===c.id));
  assert.ok(card);
  assert.equal(drawn.players[me].hand.length,14);
  assert.deepEqual(drawn.players[1-me].hand,[]);
  if(drawn.remaining>previousRemaining)recycled=true;
  previousRemaining=drawn.remaining;
  state=(await api({...seat,action:'discard',cardId:card.id})).game;
  assert.equal(state.players[me].hand.length,13);
  assert.equal(state.pile[0].id,card.id);
  assert.equal(state.underDiscard.id,previousTop.id);
  assert.equal(state.turn,1-me);
  assert.equal(state.phase,'draw');
  assert.equal(state.status,'playing');
}
assert.ok(recycled,'exercise a full stock recycle');
assert.deepEqual(state.players.map(p=>p.score),[0,0]);
console.log('PASS: 100 alternating draw-to-discard turns, deck recycling, exact discard-underneath continuity, private opponent hands, stable hand counts and scores.');
