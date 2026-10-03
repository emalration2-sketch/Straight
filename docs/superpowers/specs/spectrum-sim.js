// Monte Carlo for the proposed "Spectrum Straight": 4 colors x 1..10 + 2 jokers, 2 hole each,
// board 3 (flop) then up to 5; a hand = both hole cards + exactly 3 board cards; jokers wild.
function deck(){ const d=[]; for(let c=0;c<4;c++) for(let v=1;v<=10;v++) d.push({v,c}); d.push({j:1},{j:1}); return d; }
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const k=Math.random()*(i+1)|0; [a[i],a[k]]=[a[k],a[i]]; } return a; }
function isStraight(cards){ const j=cards.filter(c=>c.j).length; const vs=new Set(cards.filter(c=>!c.j).map(c=>c.v));
  if(vs.size + j < 5 || vs.size !== 5-j) return false; for(let s=1;s<=6;s++){ let miss=0; for(let k=0;k<5;k++) if(!vs.has(s+k)) miss++; if(miss<=j && [...vs].every(v=>v>=s&&v<s+5)) return true; } return false; }
function made(hole, board){ for(let a=0;a<board.length;a++) for(let b=a+1;b<board.length;b++) for(let c=b+1;c<board.length;c++) if(isStraight([...hole,board[a],board[b],board[c]])) return true; return false; }
function run(n, N, swap){ let flop=0, river=0, none=0, ties=0;
  for(let t=0;t<N;t++){ const d=shuffle(deck()); const holes=[]; for(let p=0;p<n;p++) holes.push([d.pop(),d.pop()]);
    const board=[d.pop(),d.pop(),d.pop()];
    let w=holes.filter(h=>made(h,board)).length; if(w){ flop++; if(w>1) ties++; continue; }
    if(swap){ for(const h of holes){ // swap the worse hole card once if it helps nothing yet: naive — swap the card farthest from the other
        const far = Math.abs((h[0].v||5.5)-(h[1].v||5.5))>4; if(far && !h[0].j && !h[1].j){ h[1]=d.pop(); } } }
    board.push(d.pop()); w=holes.filter(h=>made(h,board)).length; if(w){ river++; if(w>1) ties++; continue; }
    board.push(d.pop()); w=holes.filter(h=>made(h,board)).length; if(w){ river++; if(w>1) ties++; continue; }
    none++; }
  const p=x=>(100*x/N).toFixed(1)+'%';
  console.log(n+'인'+(swap?' +교체':'')+': 플랍 승부 '+p(flop)+', 턴/리버 승부 '+p(river)+', 아무도 못 만듦 '+p(none)+', 동시 완성(무승부) '+p(ties));
}
for(const n of [2,3,4]) run(n, 200000, false);
for(const n of [2,4]) run(n, 200000, true);
// Variant: 3 hole cards, use any 2 of them + 3 board.
function made3(hole, board){ for(let x=0;x<3;x++) for(let y=x+1;y<3;y++) if(made([hole[x],hole[y]], board)) return true; return false; }
// Smart swap: replace the hole card that is farthest from the median of hole+board with the top card.
function smartSwap(h, board, d){ if(h.some(c=>c.j)) return; const vals=[...h,...board].filter(c=>!c.j).map(c=>c.v).sort((a,b)=>a-b); const med=vals[vals.length>>1];
  let worst=0; for(let i=1;i<h.length;i++) if(Math.abs(h[i].v-med)>Math.abs(h[worst].v-med)) worst=i; if(Math.abs(h[worst].v-med)>=3) h[worst]=d.pop(); }
function run2(n, N, holeN, swap){ let flop=0, river=0, none=0, ties=0; const mk = holeN===3 ? made3 : made;
  for(let t=0;t<N;t++){ const d=shuffle(deck()); const holes=[]; for(let p=0;p<n;p++){ const h=[]; for(let k=0;k<holeN;k++) h.push(d.pop()); holes.push(h); }
    const board=[d.pop(),d.pop(),d.pop()]; let w=holes.filter(h=>mk(h,board)).length; if(w){ flop++; if(w>1) ties++; continue; }
    let done=false; for(let st=0;st<2;st++){ if(swap) holes.forEach(h=>smartSwap(h,board,d)); board.push(d.pop()); w=holes.filter(h=>mk(h,board)).length; if(w){ river++; if(w>1) ties++; done=true; break; } }
    if(!done) none++; }
  const p=x=>(100*x/N).toFixed(1)+'%';
  console.log(n+'인 손패'+holeN+(swap?' +교체(거리마다 1장)':'')+': 플랍 '+p(flop)+', 턴/리버 '+p(river)+', 실패 '+p(none)+', 무승부 '+p(ties));
}
for(const n of [2,4]) run2(n, 200000, 3, false);
for(const n of [2,4]) run2(n, 200000, 2, true);
for(const n of [2,4]) run2(n, 200000, 3, true);
