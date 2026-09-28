# 게임플레이 깊이 (A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카드 랭크를 1~10에서 전통 카드게임식 13랭크(A,2~10,J,Q,K)로 개편하고,
색상 무관 프리즘카드, 3단계 AI 난이도, 연속 캡처 콤보 보너스를 추가해 한 판의
전략적 깊이와 긴장감을 높인다.

**Architecture:** 단일 파일(`index.html`, IIFE로 감싼 vanilla JS, 빌드 스텝
없음)에 순차적으로 패치를 쌓는다. 이 프로젝트는 테스트 러너/빌드 도구가 전혀
없으므로, DOM에 의존하지 않는 순수 로직 함수(`buildDeck`, `isValidEat`,
`findStraight`, `findValidCaptures`, `chooseAiCapture`)는 각 태스크에서 그
함수 본문을 그대로 복사한 `node -e` 스크립트로 독립 검증한 뒤 동일 코드를
`index.html`에 반영한다. DOM/게임 상태에 얽힌 부분(카드 렌더링, 난이도 선택
UI, 콤보 보너스 턴 흐름)은 로컬 dev 서버(`.claude/launch.json`의
`straight-game` 설정, `npx serve` 포트 5175)를 띄워 브라우저에서 수동
검증한다 — 이 프로젝트의 기존 개발 방식과 동일하다.

**Tech Stack:** Vanilla JS (ES5 스타일), 순수 HTML/CSS, Node.js(로직 검증용
스크립트 실행에만 사용, 프로젝트 의존성 아님).

**Spec:** [docs/superpowers/specs/2026-09-28-gameplay-depth-design.md](../specs/2026-09-28-gameplay-depth-design.md)

## Global Constraints

- 빌드 스텝을 추가하지 않는다 — 여전히 단일 `index.html` 파일로 완결.
- 기존 코드 스타일(ES5 `function`, `var`, `Array.prototype.forEach.call` 등)을
  그대로 따른다.
- 온라인 멀티플레이(Firestore 동기화) 경로를 깨뜨리지 않는다 — 플레이어
  객체에 새 필드를 추가할 때는 기존 필드 나열 순서 끝에 덧붙이는 방식으로
  최소 diff를 유지한다.
- 스펙의 "미확정 사항"(초기 딜 매수 조정 여부)은 이번 계획에서 건드리지
  않는다 — 초기 딜 로직은 변경하지 않고, 덱 크기만 커진 채로 플레이테스트
  가능한 상태로 남긴다.

---

## Part 1: 13랭크 카드 체계 + 프리즘카드

### Task 1: 덱 생성 — 13랭크 확장 + 프리즘카드 2장 추가

**Files:**
- Modify: `index.html:647-658` (`buildDeck`)

**Interfaces:**
- Produces: `buildDeck(colors)` → 카드 객체 배열. 각 카드는
  `{ id, color, value, isJoker, isPrism }`. 일반 카드는 `isPrism:false`,
  조커는 `{isJoker:true, isPrism:false, color:null, value:null}`, 프리즘은
  `{isJoker:false, isPrism:true, color:null, value:7}`.

- [ ] **Step 1: 현재 로직을 node -e로 재현해 기준선 확인**

Run:
```bash
node -e "
function buildDeck(colors){
  var deck=[]; var id=0;
  colors.forEach(function(c){
    for(var v=1; v<=10; v++){
      for(var s=0; s<2; s++){
        deck.push({ id:id++, color:c, value:v, isJoker:false });
      }
    }
  });
  for(var i=0;i<2;i++) deck.push({ id:id++, isJoker:true, color:null, value:null });
  return deck;
}
var d = buildDeck(['PINK','BLUE','YELLOW','GREEN']);
console.log('old deck size (4 colors):', d.length);
"
```
Expected: `old deck size (4 colors): 82` (4색 x 10랭크 x 2장 + 조커 2장).
이 숫자가 Step 2에서 몇 장 늘어나는지 비교할 기준선이다.

- [ ] **Step 2: 새 buildDeck 로직을 node -e로 검증**

```bash
node -e "
function buildDeck(colors){
  var deck=[]; var id=0;
  colors.forEach(function(c){
    for(var v=1; v<=13; v++){
      for(var s=0; s<2; s++){
        deck.push({ id:id++, color:c, value:v, isJoker:false, isPrism:false });
      }
    }
  });
  for(var i=0;i<2;i++) deck.push({ id:id++, isJoker:true, color:null, value:null, isPrism:false });
  for(var p=0;p<2;p++) deck.push({ id:id++, isJoker:false, isPrism:true, color:null, value:7 });
  return deck;
}
var d = buildDeck(['PINK','BLUE','YELLOW','GREEN']);
console.assert(d.length === 4*13*2+2+2, 'FAIL deck size, got '+d.length);
console.assert(d.filter(function(c){return c.isPrism;}).length === 2, 'FAIL prism count');
console.assert(d.filter(function(c){return c.isJoker;}).length === 2, 'FAIL joker count');
console.assert(d.filter(function(c){return !c.isJoker && !c.isPrism && c.color==='PINK' && c.value===13;}).length === 2, 'FAIL K count per color');
console.assert(d.filter(function(c){return !c.isJoker && !c.isPrism && c.value===7 && c.color==='PINK';}).length === 2, 'FAIL normal 7 untouched');
console.log('deck size (4 colors):', d.length, '- all assertions passed');
"
```
Expected: `deck size (4 colors): 110 - all assertions passed` (4x13x2=104 +
조커2 + 프리즘2 = 110. 기존 82장 대비 +28장).

- [ ] **Step 3: `index.html`에 반영**

`index.html:647-658`의 `buildDeck`을 다음으로 교체:

```js
function buildDeck(colors){
  var deck=[]; var id=0;
  colors.forEach(function(c){
    for(var v=1; v<=13; v++){
      for(var s=0; s<2; s++){
        deck.push({ id:id++, color:c, value:v, isJoker:false, isPrism:false });
      }
    }
  });
  for(var i=0;i<2;i++) deck.push({ id:id++, isJoker:true, color:null, value:null, isPrism:false });
  for(var p=0;p<2;p++) deck.push({ id:id++, isJoker:false, isPrism:true, color:null, value:7 });
  return deck;
}
```

- [ ] **Step 4: `pointValue`는 변경 불필요함을 확인**

`index.html:666`의 현재 코드:
```js
function pointValue(coin){ if(coin.isJoker) return 10; return coin.value===1 ? 1 : coin.value; }
```
`coin.value`가 11/12/13(J/Q/K)이어도 마지막 `: coin.value` 분기로 그대로
반환되므로 코드 변경이 필요 없다. 아래로 확인만 한다:
```bash
node -e "
function pointValue(coin){ if(coin.isJoker) return 10; return coin.value===1 ? 1 : coin.value; }
console.assert(pointValue({value:11})===11, 'J');
console.assert(pointValue({value:12})===12, 'Q');
console.assert(pointValue({value:13})===13, 'K');
console.log('pointValue already handles J/Q/K correctly, no change needed');
"
```

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Extend deck to 13 ranks (A-K) and add 2 additive prism cards

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: 캡처 판정 - A/K 경계 + 프리즘 색 무관

**Files:**
- Modify: `index.html:677-685` (`isValidEat`)

**Interfaces:**
- Consumes: 카드 객체 `{color, value, isJoker, isPrism}` (Task 1에서 정의).
- Produces: `isValidEat(hand, floor)` → boolean. 이후 Task 5의
  `findValidCaptures`가 이 함수를 그대로 호출해 재사용한다.

- [ ] **Step 1: 새 규칙을 node -e로 검증 (기존 케이스 + 새 케이스 전부)**

```bash
node -e "
function isValidEat(hand, floor){
  if(hand.isJoker) return true;
  if(floor.isJoker) return hand.value === 1;
  if(hand.value === floor.value) return true;
  if(!hand.isPrism && !floor.isPrism && hand.color !== floor.color) return false;
  if(floor.value === 1) return hand.value === 13;
  if(hand.value === 1 && floor.value === 13) return true;
  return hand.value >= floor.value;
}
function c(color,value,extra){ return Object.assign({color:color,value:value,isJoker:false,isPrism:false}, extra||{}); }
var J = {isJoker:true, isPrism:false, color:null, value:null};

console.assert(isValidEat(J, c('P',5))===true, '1: hand joker wild');
console.assert(isValidEat(c('P',5), J)===false, '2: floor joker needs hand A');
console.assert(isValidEat(c('P',1), J)===true, '3: hand A captures floor joker');
console.assert(isValidEat(c('P',7), c('B',7))===true, '4: same value any color');
console.assert(isValidEat(c('P',8), c('B',5))===false, '5: diff color diff value fails');
console.assert(isValidEat(c('P',9), c('P',5))===true, '6: same color hand>=floor');
console.assert(isValidEat(c('P',3), c('P',5))===false, '7: same color hand<floor fails');

console.assert(isValidEat(c('P',13), c('P',1))===true, '8: hand K captures floor A');
console.assert(isValidEat(c('P',10), c('P',1))===false, '9: hand 10 no longer captures floor A');
console.assert(isValidEat(c('P',1), c('P',13))===true, '10: hand A captures floor K');
console.assert(isValidEat(c('P',1), c('P',10))===false, '11: hand A no longer captures floor 10');

var prismHand = c(null, 7, {isPrism:true});
var prismFloor = c(null, 7, {isPrism:true});
console.assert(isValidEat(prismHand, c('B',3))===true, '12: prism hand attacks any color, rank>=floor');
console.assert(isValidEat(c('P',9), prismFloor)===true, '13: any hand rank>=7 captures floor prism (color bypass)');
console.assert(isValidEat(c('P',5), prismFloor)===false, '14: hand rank<7 still fails vs prism');

console.log('all isValidEat assertions passed');
"
```
Expected: `all isValidEat assertions passed`.

- [ ] **Step 2: `index.html`에 반영**

`index.html:677-685`의 `isValidEat`을 다음으로 교체 (주석도 갱신):

```js
/* eat validity rules:
   - joker in hand is always wild
   - floor joker can only be captured by a hand A
   - same NUMBER beats regardless of color
   - prism cards (rank 7, color:null) skip the color check entirely
   - otherwise same color required
   - floor A(1) can only be captured by a hand K(13) (same color)
   - hand A(1) can capture a floor K(13) (same color)
   - otherwise same color & hand value >= floor value
*/
function isValidEat(hand, floor){
  if(hand.isJoker) return true;
  if(floor.isJoker) return hand.value === 1;
  if(hand.value === floor.value) return true;
  if(!hand.isPrism && !floor.isPrism && hand.color !== floor.color) return false;
  if(floor.value === 1) return hand.value === 13;
  if(hand.value === 1 && floor.value === 13) return true;
  return hand.value >= floor.value;
}
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Move the A-boundary capture rule from value 10 to K, add prism color bypass

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: 스트레이트 판정 - 전통 10구간 + 프리즘 다색 카운트

**Files:**
- Modify: `index.html:687-700` (`findStraight`)

**Interfaces:**
- Consumes: `score` 배열(플레이어의 획득 카드 더미), `colors` 배열.
- Produces: `findStraight(score, colors)` → `{color, start}` 또는 `null`.
  `checkWin`(`index.html:1452`)이 그대로 소비하므로 반환 형태는 바꾸지 않는다.

- [ ] **Step 1: 새 로직을 node -e로 검증**

```bash
node -e "
function findStraight(score, colors){
  var jokerCount = score.filter(function(c){ return c.isJoker; }).length;
  for(var ci=0; ci<colors.length; ci++){
    var color = colors[ci];
    var vals = {};
    score.forEach(function(c){ if(!c.isJoker && (c.color===color || c.isPrism)) vals[c.value]=true; });
    for(var start=1; start<=10; start++){
      var missing=0;
      for(var k=0;k<5;k++){
        var rank = start+k;
        var lookup = rank>13 ? rank-13 : rank;
        if(!vals[lookup]) missing++;
      }
      if(missing<=jokerCount) return { color:color, start:start };
    }
  }
  return null;
}
function c(color,value,extra){ return Object.assign({color:color,value:value,isJoker:false,isPrism:false}, extra||{}); }

var s1 = [c('P',1),c('P',2),c('P',3),c('P',4),c('P',5)];
console.assert(findStraight(s1,['P']).start===1, 'A-5 straight recognized, got '+JSON.stringify(findStraight(s1,['P'])));

var s2 = [c('P',10),c('P',11),c('P',12),c('P',13),c('P',1)];
var r2 = findStraight(s2,['P']);
console.assert(r2 !== null && r2.start===10, '10-K-A straight recognized, got '+JSON.stringify(r2));

var s3 = [c('P',13),c('P',1),c('P',2),c('P',3),c('P',4)];
console.assert(findStraight(s3,['P'])===null, 'K-A-2-3-4 wraparound must be rejected, got '+JSON.stringify(findStraight(s3,['P'])));

var s4 = [c('P',3),c('P',4),c('P',5),c('P',6), c(null,7,{isPrism:true})];
var r4 = findStraight(s4,['P']);
console.assert(r4 !== null && r4.start===3, 'prism fills PINK rank-7 slot for 3-7 straight, got '+JSON.stringify(r4));

console.log('all findStraight assertions passed');
"
```
Expected: `all findStraight assertions passed`.

- [ ] **Step 2: `index.html`에 반영**

`index.html:687-700`의 `findStraight`을 다음으로 교체:

```js
function findStraight(score, colors){
  var jokerCount = score.filter(function(c){ return c.isJoker; }).length;
  for(var ci=0; ci<colors.length; ci++){
    var color = colors[ci];
    var vals = {};
    score.forEach(function(c){ if(!c.isJoker && (c.color===color || c.isPrism)) vals[c.value]=true; });
    for(var start=1; start<=10; start++){
      var missing=0;
      for(var k=0;k<5;k++){
        var rank = start+k;
        var lookup = rank>13 ? rank-13 : rank;
        if(!vals[lookup]) missing++;
      }
      if(missing<=jokerCount) return { color:color, start:start };
    }
  }
  return null;
}
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Rewrite findStraight for traditional A-low/A-high 10-window straights, count prism cards toward every color

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: 카드 렌더링 - J/Q/K 라벨 + 프리즘 비주얼

**Files:**
- Modify: `index.html:1776-1798` (`cardEl`)
- Modify: `index.html` `<style>` 블록 (조커 스타일 근처, 약 line 155 부근에
  `.card.prism` 규칙 추가)

**Interfaces:**
- Consumes: 카드 객체 `{color, value, isJoker, isPrism}`.
- Produces: `rankLabel(value)` 헬퍼 (신규) - `cardEl` 내부에서만 쓰이지만
  다른 곳에서 랭크 텍스트가 필요해지면 재사용 가능하도록 최상위 함수로 둔다.

- [ ] **Step 1: `rankLabel` 헬퍼를 node -e로 검증**

```bash
node -e "
function rankLabel(v){
  if(v===1) return 'A';
  if(v===11) return 'J';
  if(v===12) return 'Q';
  if(v===13) return 'K';
  return v;
}
console.assert(rankLabel(1)==='A', 'A');
console.assert(rankLabel(7)===7, '7 passthrough');
console.assert(rankLabel(11)==='J', 'J');
console.assert(rankLabel(12)==='Q', 'Q');
console.assert(rankLabel(13)==='K', 'K');
console.log('rankLabel assertions passed');
"
```

- [ ] **Step 2: `index.html`에 `rankLabel` 추가**

`index.html:666` (`pointValue` 함수) 바로 다음 줄에 삽입:

```js
function rankLabel(v){
  if(v===1) return "A";
  if(v===11) return "J";
  if(v===12) return "Q";
  if(v===13) return "K";
  return v;
}
```

- [ ] **Step 3: `cardEl`을 프리즘 분기 + `rankLabel` 사용으로 교체**

`index.html:1776-1798`의 `cardEl`을 다음으로 교체:

```js
function cardEl(coin, opts){
  opts = opts||{};
  var d = el("div", "card"+(opts.cls?(" "+opts.cls):""));
  if(opts.id) d.id = opts.id;
  if(opts.faceDown){
    d.classList.add("back");
    return d;
  }
  if(coin && coin.id!==undefined) d.dataset.cid = coin.id;
  if(coin.isJoker){
    d.classList.add("joker");
    if(opts.wild) d.classList.add("wildfloor");
    d.textContent = "★";
  } else {
    if(coin.isPrism){
      d.classList.add("prism");
      d.style.background = "linear-gradient(135deg,#ff6b6b,#ffd76b 25%,#4ce0a0 50%,#33d6c0 75%,#7f77dd)";
    } else {
      var base = COLORS[coin.color];
      d.style.background = "linear-gradient(155deg,"+shadeColor(base,35)+","+base+" 55%,"+shadeColor(base,-35)+")";
    }
    var clsStr = opts.cls || "";
    var isSmall = clsStr.indexOf("tiny")!==-1 || clsStr.indexOf("opp")!==-1;
    if(!isSmall) d.classList.add(CARD_BACK_PRESETS[backPresetIndex].cls);
    d.appendChild(el("span","card-num", rankLabel(coin.value)));
  }
  return d;
}
```

- [ ] **Step 4: 프리즘 카드 테두리 CSS 추가**

`index.html`의 `.card.joker{...}` 규칙(line 155 부근) 바로 다음 줄에 추가:

```css
.card.prism{color:#241f3d;border-color:rgba(255,255,255,.55);}
```

(프리즘 배경은 이미 밝은 다색 그라데이션이라 텍스트를 어둡게 해서 대비를
확보하고, 테두리를 살짝 밝혀 다른 카드와 구분되는 특별함을 준다.)

- [ ] **Step 5: 브라우저에서 렌더링 확인**

`preview_start({name:"straight-game"})`로 서버를 띄우고, 솔로 게임을 시작해
손패/바닥에 J, Q, K 카드가 "J"/"Q"/"K"로 표시되는지, 프리즘카드(중앙덱에서
뽑히면 등장)가 무지개색 배경에 숫자 "7"로 표시되는지 확인한다. 콘솔 에러
없는지 `read_console_messages`로 확인.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "Render J/Q/K rank labels and a distinct rainbow-gradient face for prism cards

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Part 2: AI 난이도 단계

### Task 5: 캡처 후보 탐색 + 난이도별 선택 로직 (순수 함수)

**Files:**
- Modify: `index.html` - `/* ---------------- AI ---------------- */` 주석
  (line 1715) 바로 다음에 `findValidCaptures`, `colorProgress`,
  `chooseAiCapture` 세 함수를 추가.

**Interfaces:**
- Consumes: `isValidEat(hand, floor)` (Task 2), `pointValue(coin)` (기존).
- Produces:
  - `findValidCaptures(hand, floor)` → `[{hi, fi, hand, floor}, ...]`
  - `chooseAiCapture(options, difficulty, aiPlayer, opponents)` →
    `{hi, fi, hand, floor}` 또는 `null`
  - Task 6(`aiTakeTurn` 교체)과 Task 8(콤보 보너스)이 이 두 함수를 그대로
    가져다 쓴다.

- [ ] **Step 1: 세 함수를 node -e로 검증**

```bash
node -e "
function isValidEat(hand, floor){
  if(hand.isJoker) return true;
  if(floor.isJoker) return hand.value === 1;
  if(hand.value === floor.value) return true;
  if(!hand.isPrism && !floor.isPrism && hand.color !== floor.color) return false;
  if(floor.value === 1) return hand.value === 13;
  if(hand.value === 1 && floor.value === 13) return true;
  return hand.value >= floor.value;
}
function pointValue(coin){ if(coin.isJoker) return 10; return coin.value===1 ? 1 : coin.value; }

function findValidCaptures(hand, floor){
  var options = [];
  hand.forEach(function(h, hi){
    floor.forEach(function(f, fi){
      if(isValidEat(h,f)) options.push({ hi:hi, fi:fi, hand:h, floor:f });
    });
  });
  return options;
}

function colorProgress(score, color){
  var vals = {};
  score.forEach(function(c){
    if(c.isJoker) return;
    if(c.color===color || c.isPrism) vals[c.value] = true;
  });
  return Object.keys(vals).length;
}

function chooseAiCapture(options, difficulty, aiPlayer, opponents){
  if(options.length===0) return null;
  function baseVal(o){ return o.floor.isJoker ? 10 : pointValue(o.floor); }
  if(difficulty==='easy'){
    var best=null;
    options.forEach(function(o){ var v=baseVal(o); if(!best||v>best.v) best={o:o,v:v}; });
    return best.o;
  }
  if(difficulty==='normal'){
    var scored = options.map(function(o){
      var s = baseVal(o);
      if(o.floor.isPrism) s += 4;
      s += colorProgress(aiPlayer.score, o.floor.color) * 2;
      return { o:o, s:s };
    });
    scored.sort(function(a,b){ return b.s-a.s; });
    return scored[0].o;
  }
  var scored2 = options.map(function(o){
    var s = baseVal(o);
    if(o.floor.isPrism) s += 6;
    s += colorProgress(aiPlayer.score, o.floor.color) * 2;
    var denies = opponents.some(function(opp){
      return opp.hand.some(function(oh){ return isValidEat(oh, o.floor); });
    });
    if(denies) s += 4;
    return { o:o, s:s };
  });
  scored2.sort(function(a,b){ return b.s-a.s; });
  return scored2[0].o;
}

function c(color,value,extra){ return Object.assign({color:color,value:value,isJoker:false,isPrism:false}, extra||{}); }

var hand = [c('P',5), c('P',9)];
var floor = [c('P',3), c('B',9), c('P',9)];
var opts = findValidCaptures(hand, floor);
console.assert(opts.length===3, 'expected 3 valid combos, got '+opts.length);

var easyPick = chooseAiCapture(opts, 'easy', {score:[]}, []);
console.assert(pointValue(easyPick.floor)===9, 'easy picks highest point value, got '+JSON.stringify(easyPick));

var aiWithProgress = { score:[c('P',3),c('P',4)] };
var optsColor = findValidCaptures([c('P',5),c('P',9)], [c('P',5),c('B',9)]);
var normalPick = chooseAiCapture(optsColor, 'normal', aiWithProgress, []);
console.assert(normalPick.floor.value===5 && normalPick.floor.color==='P', 'normal prefers own-color progress over higher point value, got '+JSON.stringify(normalPick));

var optsDeny = findValidCaptures([c('P',6),c('P',9)], [c('P',6),c('B',9)]);
var opponent = { hand:[c('P',6)] };
var hardPick = chooseAiCapture(optsDeny, 'hard', {score:[]}, [opponent]);
console.assert(hardPick.floor.value===6, 'hard denies the card the opponent could also take, got '+JSON.stringify(hardPick));

console.log('all chooseAiCapture assertions passed');
"
```
Expected: `all chooseAiCapture assertions passed`.

- [ ] **Step 2: `index.html`에 반영**

`index.html`의 `/* ---------------- AI ---------------- */` 주석(line 1715)
바로 다음, `function aiTakeTurn(playerIdx){` 위에 삽입:

```js
function findValidCaptures(hand, floor){
  var options = [];
  hand.forEach(function(h, hi){
    floor.forEach(function(f, fi){
      if(isValidEat(h,f)) options.push({ hi:hi, fi:fi, hand:h, floor:f });
    });
  });
  return options;
}

function colorProgress(score, color){
  var vals = {};
  score.forEach(function(c){
    if(c.isJoker) return;
    if(c.color===color || c.isPrism) vals[c.value] = true;
  });
  return Object.keys(vals).length;
}

function chooseAiCapture(options, difficulty, aiPlayer, opponents){
  if(options.length===0) return null;
  function baseVal(o){ return o.floor.isJoker ? 10 : pointValue(o.floor); }
  if(difficulty==="easy"){
    var best=null;
    options.forEach(function(o){ var v=baseVal(o); if(!best||v>best.v) best={o:o,v:v}; });
    return best.o;
  }
  if(difficulty==="normal"){
    var scored = options.map(function(o){
      var s = baseVal(o);
      if(o.floor.isPrism) s += 4;
      s += colorProgress(aiPlayer.score, o.floor.color) * 2;
      return { o:o, s:s };
    });
    scored.sort(function(a,b){ return b.s-a.s; });
    return scored[0].o;
  }
  var scored2 = options.map(function(o){
    var s = baseVal(o);
    if(o.floor.isPrism) s += 6;
    s += colorProgress(aiPlayer.score, o.floor.color) * 2;
    var denies = opponents.some(function(opp){
      return opp.hand.some(function(oh){ return isValidEat(oh, o.floor); });
    });
    if(denies) s += 4;
    return { o:o, s:s };
  });
  scored2.sort(function(a,b){ return b.s-a.s; });
  return scored2[0].o;
}
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Add findValidCaptures and difficulty-aware chooseAiCapture pure helpers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: 난이도 선택 UI + `aiTakeTurn`에 연결

**Files:**
- Modify: `index.html:270-276` (`screen-count` HTML)
- Modify: `index.html:1075-1091` (count 화면 스크립트)
- Modify: `index.html:1717-1734` (`aiTakeTurn` 캡처 선택 부분)

**Interfaces:**
- Consumes: `chooseAiCapture`, `findValidCaptures` (Task 5).
- Produces: `state.aiDifficulty` (`"easy"|"normal"|"hard"`, 기본 `"normal"`),
  localStorage 키 `straightAiDifficulty`.

- [ ] **Step 1: HTML에 난이도 pill 추가**

`index.html:270-276`의 `screen-count` 블록을 다음으로 교체:

```html
  <div class="screen hidden" id="screen-count">
    <h1 style="font-size:20px;">플레이 인원 선택</h1>
    <p class="sub">부족한 인원은 AI가 대신 플레이합니다 · 인원수만큼 색상이 사용됩니다</p>
    <div class="count-row" id="count-row"></div>
    <p class="sub" style="margin-top:14px;">AI 난이도</p>
    <div class="count-row" id="difficulty-row"></div>
    <button class="btn primary big" id="count-next-btn" disabled>다음</button>
    <button class="btn" id="count-back-btn">← 뒤로</button>
  </div>
```

- [ ] **Step 2: 난이도 상태 변수 + pill 렌더링 스크립트 추가**

`index.html:1075`(`var countRow = $("count-row");`) 바로 앞에 삽입:

```js
var chosenAiDifficulty = (function(){
  try{ return localStorage.getItem("straightAiDifficulty") || "normal"; }catch(e){ return "normal"; }
})();
var difficultyRow = $("difficulty-row");
[["easy","쉬움"],["normal","보통"],["hard","어려움"]].forEach(function(pair){
  var b = el("button","count-btn"+(pair[0]===chosenAiDifficulty?" selected":""), pair[1]);
  b.addEventListener("click", function(){
    sfxSelect();
    Array.prototype.forEach.call(difficultyRow.children, function(c){ c.classList.remove("selected"); });
    b.classList.add("selected");
    chosenAiDifficulty = pair[0];
    try{ localStorage.setItem("straightAiDifficulty", pair[0]); }catch(e){}
  });
  difficultyRow.appendChild(b);
});
```

- [ ] **Step 3: 게임 시작 시 `state.aiDifficulty`에 반영**

`index.html:1255` 근처 `runOrderCutscene` 함수 맨 앞(`switchScreen("order");`
바로 다음 줄)에 추가:

```js
state.aiDifficulty = chosenAiDifficulty;
```

- [ ] **Step 4: `aiTakeTurn`이 새 헬퍼를 쓰도록 교체**

`index.html:1717-1734`의 아래 블록:
```js
function aiTakeTurn(playerIdx){
  if(state.gameOver) return;
  var player = state.players[playerIdx];

  var best = null;
  player.hand.forEach(function(h, hi){
    state.floor.forEach(function(f, fi){
      if(isValidEat(h,f)){
        var val = f.isJoker ? 10 : pointValue(f);
        if(!best || val>best.val) best = { hi:hi, fi:fi, val:val };
      }
    });
  });

  if(best){
    doEat(playerIdx, best.hi, best.fi);
    return;
  }
```
를 다음으로 교체:
```js
function aiTakeTurn(playerIdx){
  if(state.gameOver) return;
  var player = state.players[playerIdx];

  var opponents = state.players.filter(function(p, i){ return i!==playerIdx; });
  var options = findValidCaptures(player.hand, state.floor);
  var best = chooseAiCapture(options, state.aiDifficulty || "normal", player, opponents);

  if(best){
    doEat(playerIdx, best.hi, best.fi);
    return;
  }
```
(이 아래 조커 리필/드로우 폴백 로직은 그대로 둔다 - `best`가 `null`일 때만
도달하는 코드라 변경 불필요.)

- [ ] **Step 5: 브라우저에서 난이도별 동작 차이 확인**

`preview_start({name:"straight-game"})`로 서버를 띄우고, 인원 선택 화면에서
"쉬움"으로 몇 판, "어려움"으로 몇 판 진행해본다. 어려움에서 AI가 내 손패가
바로 가져갈 수 있는 바닥 카드를 잘 안 남기는지(견제 행동) 게임 로그로
확인한다. localStorage에 `straightAiDifficulty`가 저장/복원되는지
`localStorage.getItem("straightAiDifficulty")`로 확인.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "Add AI difficulty selector on the count screen and wire it into aiTakeTurn

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Part 3: 연속 캡처 콤보 보너스

### Task 7: 플레이어 객체에 `captureStreak` 필드 추가

**Files:**
- Modify: `index.html:874, 907, 997, 1262, 1268` (플레이어 객체 리터럴 5곳)

**Interfaces:**
- Produces: 모든 플레이어 객체가 `captureStreak:0`을 갖는다. Task 8이 이
  필드를 증가/리셋한다.

- [ ] **Step 1: 5곳 모두에 `captureStreak:0` 추가**

`index.html:874`:
```js
    var me = { clientId: myClientId, name:null, characterName:null, avatar:null, avatarPicked:false, isAI:false, hand:[], score:[], captureStreak:0 };
```
`index.html:907`: 동일한 패턴으로 `captureStreak:0` 추가 (874번 줄과 완전히
같은 텍스트).

`index.html:997`:
```js
    lobbyPlayers.push({ clientId:null, name:ch.name, characterName:ch.name, avatar:avatarIconHTML(ch), isAI:true, hand:[], score:[], captureStreak:0 });
```

`index.html:1262`:
```js
  players.push({ idx:0, name:(chosenNickname||chosenCharacter.name)+" (나)", characterName:chosenCharacter.name, avatar:avatarIconHTML(chosenCharacter), isAI:false, hand:[], score:[], captureStreak:0 });
```

`index.html:1268`:
```js
    players.push({ idx:i, name:ch.name, characterName:ch.name, avatar:avatarIconHTML(ch), isAI:true, hand:[], score:[], captureStreak:0 });
```

- [ ] **Step 2: grep으로 5곳 다 반영됐는지 확인**

Run: `grep -c "captureStreak:0" index.html`
Expected: `5`

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Add captureStreak field to every player object for the combo bonus system

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: 콤보 스트릭 증가/리셋 + 보너스 캡처 흐름

**Files:**
- Modify: `index.html:1644-1673` (`doEat`, `finishEat`)
- Modify: `index.html:1675-1694` (`drawTwoAndEndTurn`)
- Modify: `index.html:1696-1713` (`jokerRefresh`)
- Modify: `index.html:1717-1772` (`aiTakeTurn` 드로우/조커 폴백 부분)
- Modify: `index.html:1433-1442` (`passWithEmptyDeck`)
- Modify: `index.html:1811-1826` (`renderInstruction`)
- Modify: `index.html:703-710` (`state` 초기값)

**Interfaces:**
- Consumes: `player.captureStreak` (Task 7), `findValidCaptures`,
  `chooseAiCapture` (Task 5), `sfxJoker()` (기존 효과음 재사용).
- Produces: `state.bonusCaptureFor` (턴 진행 중 보너스 캡처 대기 중인
  playerIdx 또는 `null`) - `renderInstruction`이 이 값을 읽어 힌트를 바꾼다.

이 태스크는 DOM/게임 상태에 강하게 얽혀 있어 순수 단위 테스트가 불가능하다
(카드 애니메이션, 턴 순서, 타이머가 모두 실제 브라우저 상태에 의존). 각 Step
은 정확한 코드 변경 + 브라우저 수동 검증으로 구성한다.

- [ ] **Step 1: `doEat`/`finishEat`에 보너스 파라미터 추가**

`index.html:1644-1673`을 다음으로 교체:

```js
function doEat(playerIdx, handIdx, floorIdx, isBonusCapture){
  var floorCoin = state.floor[floorIdx];
  finishEat(playerIdx, handIdx, floorIdx, floorCoin, isBonusCapture);
}

function finishEat(playerIdx, handIdx, floorIdx, capturedCoin, isBonusCapture){
  var player = state.players[playerIdx];
  var handCoin = player.hand[handIdx];
  state.animating = true;

  playCaptureAnimation({
    playerIdx: playerIdx,
    handIdx: handIdx,
    floorIdx: floorIdx,
    isHuman: playerIdx===state.myIndex,
    handCoin: handCoin,
    capturedCoin: capturedCoin
  }, function(){
    player.score.push(capturedCoin);
    player.hand.splice(handIdx,1);
    state.floor[floorIdx] = { id:handCoin.id, isJoker:handCoin.isJoker, color:handCoin.color, value:handCoin.value, isPrism:handCoin.isPrism };
    pushLog(player.name+"가 "+coinLabel(handCoin)+"(으)로 바닥의 "+coinLabel(capturedCoin)+"을(를) 가져왔습니다!");
    state.noProgressStreak = 0;
    state.animating = false;
    clearSelectionState();
    if(!isBonusCapture){
      player.captureStreak = (player.captureStreak||0) + 1;
    }
    render();
    if(checkWin(playerIdx)) return;

    if(!isBonusCapture && player.captureStreak===2 && findValidCaptures(player.hand, state.floor).length>0){
      state.bonusCaptureFor = playerIdx;
      pushLog("🔥 "+player.name+" 콤보! 보너스 캡처 기회를 얻었습니다.");
      sfxJoker();
      render();
      if(player.isAI){
        setTimeout(function(){ aiBonusCapture(playerIdx); }, 700);
      }
      return;
    }
    endTurn();
  });
}

function aiBonusCapture(playerIdx){
  state.bonusCaptureFor = null;
  var player = state.players[playerIdx];
  var opponents = state.players.filter(function(p, i){ return i!==playerIdx; });
  var options = findValidCaptures(player.hand, state.floor);
  var pick = chooseAiCapture(options, state.aiDifficulty || "normal", player, opponents);
  if(pick){
    doEat(playerIdx, pick.hi, pick.fi, true);
  } else {
    endTurn();
  }
}
```

참고: `state.floor[floorIdx] = {...}`에 `isPrism:handCoin.isPrism`을 추가한
것은 기존 코드의 누락을 함께 고친 것이다 - 프리즘카드로 캡처하면 손에 있던
프리즘카드가 바닥에 새로 놓이는데, 기존 코드는 `isPrism` 필드를 복사하지
않아 바닥에서 일반 카드처럼(색 무관 판정 없이) 취급될 뻔했다.

- [ ] **Step 2: 드로우 경로에서 스트릭 리셋 (사람)**

`index.html:1675-1694`의 `drawTwoAndEndTurn` 콜백 안, `endTurn();` 바로 위
줄에 추가:
```js
  animateDrawFromDeck(n, $("hand-coins"), function(){
    var drawn = state.centerDeck.splice(0, n);
    player.hand = player.hand.concat(drawn);
    pushLog(player.name+"가 중앙 덱에서 "+n+"장을 뽑고 턴을 마쳤습니다.");
    state.animating = false;
    render();
    player.captureStreak = 0;
    endTurn();
  });
```

- [ ] **Step 3: 조커 리필 경로에서도 스트릭 리셋 (사람)**

`index.html:1696-1713`의 `jokerRefresh` 콜백도 동일하게 `endTurn();` 바로
위에 `player.captureStreak = 0;` 추가.

- [ ] **Step 4: AI의 드로우/조커 리필 경로에서도 스트릭 리셋**

`index.html:1717-1772`의 `aiTakeTurn` 안, 조커 리필 콜백과 일반 드로우
콜백 각각에서 `endTurn();` 바로 위에 `player.captureStreak = 0;` 추가 (두
군데: 조커 리필 `animateDrawFromDeck(n5, ...)` 콜백, 일반 드로우
`animateDrawFromDeck(n2, ...)` 콜백).

- [ ] **Step 5: 뽑을 카드가 없어 패스하는 경로에서도 리셋**

`index.html:1433-1442`의 `passWithEmptyDeck`:
```js
function passWithEmptyDeck(player){
  pushLog(player.name+"가 뽑을 카드가 없어 턴을 넘겼습니다.");
  player.captureStreak = 0;
  state.noProgressStreak++;
  if(state.noProgressStreak >= state.turnOrder.length){
    declareDraw();
    return;
  }
  render();
  endTurn();
}
```

- [ ] **Step 6: 보너스 캡처 대기 중 힌트 텍스트 추가**

`index.html:1811-1826`의 `renderInstruction`을 다음으로 교체:
```js
function renderInstruction(){
  var bar = $("instruction-bar");
  if(state.gameOver){ bar.textContent = "게임이 종료되었습니다!"; return; }
  if(!isHumanTurn()){
    if(state.animating){ bar.textContent = "카드가 이동 중입니다..."; return; }
    var cur = state.players[currentPlayerIdx()];
    bar.innerHTML = (cur ? cur.avatar+" "+cur.name : "상대") + "의 턴입니다...";
    return;
  }
  if(state.bonusCaptureFor === state.myIndex){
    bar.innerHTML = "🔥 콤보! 보너스 캡처 기회입니다. 손패를 클릭하거나 [2장 뽑고 턴 종료]로 넘어가세요.";
    return;
  }
  switch(state.mode){
    case "eat-target": bar.textContent = "🎯 타겟이 될 바닥 카드를 선택하세요!"; break;
    case "joker-choice": bar.textContent = "🃏 조커로 무엇을 할지 선택하세요!"; break;
    case "joker-eat-target": bar.textContent = "🃏 조커로 가져올 바닥 카드를 선택하세요! (아무거나 가능)"; break;
    default: bar.innerHTML = "✋ 행동을 선택하세요! 손패를 클릭하거나,<br>가져올 수 없으면 [2장 뽑고 턴 종료]를 누르세요.";
  }
}
```

- [ ] **Step 7: 사람이 보너스를 쓰지 않고 드로우로 턴을 넘길 때도 플래그 정리**

`index.html:1675-1694`의 `drawTwoAndEndTurn` 맨 앞, `if(state.animating ||
!isHumanTurn()) return;` 바로 다음 줄에 추가:
```js
  state.bonusCaptureFor = null;
```

- [ ] **Step 8: `state` 초기값에 `bonusCaptureFor` 추가**

`index.html:703-710`의 `var state = { players: [], floor: [], centerDeck: [],
colors: [], turnOrder: [], currentTurnPos: 0,` 블록에 `currentTurnPos: 0,`
다음 줄로 추가:
```js
  bonusCaptureFor: null,
```

- [ ] **Step 9: 브라우저에서 콤보 흐름 전체 검증**

`preview_start({name:"straight-game"})`로 서버를 띄우고:
1. 솔로 게임에서 2턴 연속 캡처를 만들어 "🔥 콤보!" 로그와 힌트 문구가
   뜨는지 확인.
2. 보너스 캡처를 실제로 한 번 더 수행해서 턴이 정상적으로 넘어가는지, 그
   보너스 캡처 자체는 또 다른 보너스를 만들지 않는지(스트릭이 계속 오르지
   않고 이번 보너스 턴에서 멈추는지) 확인.
3. 보너스 캡처 대신 "2장 뽑고 턴 종료"를 눌러서 정상적으로 스킵되는지 확인.
4. AI가 스트릭 2를 찍었을 때 자동으로 보너스 캡처를 한 번 더 수행하는지
   게임 로그로 확인.
5. `read_console_messages`로 에러 없는지 확인.

- [ ] **Step 10: Commit**

```bash
git add index.html
git commit -m "Add capped one-per-turn combo bonus capture on a 2-streak, for both human and AI

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes (작성자 자체 점검, 참고용)

- **스펙 커버리지**: 1절(랭크 개편) -> Task 1-4, 2절(프리즘카드) -> Task
  1(덱), Task 2(캡처), Task 3(스코어링), Task 4(렌더링)에 분산 반영, 3절(AI
  난이도) -> Task 5-6, 4절(콤보 보너스) -> Task 7-8. 스펙의 모든 섹션에
  대응하는 태스크가 있다.
- **플레이스홀더 스캔**: 전체 스텝에 실제 코드/명령어를 넣었고 "TODO"류
  문구 없음.
- **타입/이름 일관성**: `isPrism`, `captureStreak`, `bonusCaptureFor`,
  `chooseAiCapture`, `findValidCaptures` 이름을 태스크 전체에서 동일하게
  사용했는지 재확인 완료.
- **스펙 대비 발견한 보정**: 스펙 문서는 "기존 buildDeck이 색상당 1장씩"이라고
  암묵 가정했으나, 실제 코드는 색상당 2장씩(`for(var s=0;s<2;s++)`)이었다.
  Task 1에서 정확한 수치(4색 기준 82->110장)로 바로잡았다 - 스코프 변경은
  아니고 계산 오류 정정.
