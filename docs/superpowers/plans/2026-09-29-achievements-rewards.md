# 업적/보상 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 온보딩/리텐션 해금 시스템(승/판수 OR 단일 트랙, 아바타·패턴만)을
완전히 교체해, 승리·판수 분리 트랙 + 기타 미션 10개 + 튜토리얼 보상 1개(총 31개
milestone)와 아바타·패턴·칭호·테두리 4가지 보상, 업적 화면, 수집품 화면(칭호·테두리
장착 포함)을 구현한다.

**Architecture:** 단일 파일(`index.html`, IIFE vanilla ES5 JS, 빌드 스텝 없음)에
순차적으로 패치를 쌓는다. `UNLOCK_MILESTONES`의 각 항목이 숫자 필드 비교 대신
`check(stats)`/`hint(stats)` 함수를 직접 갖는 구조로 바꿔 이질적인 조건(누적 수,
배열 길이, 불리언 플래그)을 하나의 테이블에서 다룬다. DOM에 의존하지 않는 순수
로직(`checkUnlocks`, milestone `check`/`hint` 함수들)은 `node -e`로 독립 검증하고,
`localStorage`/DOM에 얽힌 부분(잠금 UI, 토스트, 업적·수집품 화면, 장착 표시)은
로컬 dev 서버(포트는 태스크마다 새로 지정, `npx serve -l <port> .`)에서 브라우저로
검증한다.

**Tech Stack:** Vanilla JS(ES5), 순수 HTML/CSS, Node.js(로직 검증 스크립트 실행에만 사용).

**Spec:** [docs/superpowers/specs/2026-09-29-achievements-rewards-design.md](../specs/2026-09-29-achievements-rewards-design.md)

## Global Constraints

- 빌드 스텝을 추가하지 않는다 — 여전히 단일 `index.html` 파일로 완결.
- 기존 코드 스타일(ES5 `function`, `var`, `el()`/`$()` 헬퍼, `try{...}catch(e){}`로
  감싼 모든 `localStorage` 호출)을 그대로 따른다.
- 온라인 멀티플레이(Firestore 동기화) 경로를 깨뜨리지 않는다 — `state.statsRecorded`
  가드와 세 지점(`checkWin`/`declareDraw`/`applyRemoteRoomState`) 훅 구조는
  이미 완성되어 있으므로(현재 `index.html:506~509`, `1620`, `984/989`)
  **호출 시그니처만** `won`(boolean) → `outcome, meta`로 바꾸고 나머지 흐름은
  그대로 둔다.
- 해금 id는 배열 인덱스가 아니라 안정적 의미값으로 키잉한다 — 이미 확립된 규칙
  (`avatar:`/`pattern:` 접두사)을 칭호(`title:`)/테두리(`border:`)에도 동일하게 적용.
- 패턴 CSS는 실제 카드 크기(`--card-w: clamp(30px, 6.4vh, 58px)`)에서 뭉개지지
  않아야 한다 — 반드시 브라우저에서 실제 크기로 확인 후 다음 태스크로 넘어간다.
- 스펙 3절의 합계 검증(아바타 7 / 패턴 8 / 칭호 11 / 테두리 5, 전부 슬롯 수와
  정확히 일치)을 코드에 그대로 반영한다 — 남거나 모자란 항목이 있으면 스펙과
  다시 대조한다.

---

## Task 1: 데이터 모델 — milestone 함수화 + 신규 통계 필드

**Files:**
- Modify: `index.html:409~503` (`CARD_BACK_PRESETS` 뒤 ~ `recordGameResult` 끝),
  `index.html:1185~1202`(`findMilestone`/`unlockHintText`/`unlockHintShort`)

**Interfaces:**
- Consumes: 없음(최상위 데이터 레이어).
- Produces: `UNLOCK_MILESTONES`(31개 항목, `{id,kind,label,check(stats),hint(stats)}`
  shape), `loadStats()`(신규 필드 포함), `checkUnlocks(stats,unlocks)`,
  `recordGameResult(outcome, meta)`, `maybeRecordLocalGameResult(outcome, meta)`,
  `bumpStatAndCheck(field, delta)`, `recordTutorialDone()` — Task 2~7이 이 정확한
  함수명과 시그니처를 그대로 사용한다. 이 Step에서 함께 고치는
  `findMilestone(id)`/`unlockHintText(id)`/`unlockHintShort(id)`는 **임시본**이다
  — 새 `UNLOCK_MILESTONES`의 id 형식(`win:10` 등)에 맞춰 컴파일 가능한 상태로만
  고쳐두는 것이고, Task 2 Step 2b에서 label 기반 조회(`findMilestoneByLabel`/
  `unlockHintTextFor`/`unlockHintShortFor`)로 완전히 대체되며 이 세 함수는
  삭제된다. Task 2 이전까지는 아바타/패턴 잠금 힌트 텍스트가 빈 문자열로
  보일 수 있다(호출부가 여전히 `"avatar:"+이름` 형식의 id를 넘기는데 milestone
  id는 더 이상 그 형식이 아니므로) — 이는 Task 2에서 고쳐지는 알려진 임시
  상태이며, Task 1 자체의 브라우저 검증 범위 밖이다(Task 1은 `node -e`
  순수 로직 검증만 한다).

- [ ] **Step 1: 현재 `index.html:438~503` 블록(`loadStats`부터 `recordGameResult`
  끝까지)을 전부 아래로 교체한다.**

```js
function loadStats(){
  try{
    var raw = localStorage.getItem("straightStats");
    var p = raw ? JSON.parse(raw) : {};
    return {
      wins: p.wins||0, games: p.games||0, draws: p.draws||0,
      winStreak: p.winStreak||0, prismBanked: p.prismBanked||0,
      jokersBanked: p.jokersBanked||0, hardWins: p.hardWins||0,
      onlineWins: p.onlineWins||0, fourPOnlineWins: p.fourPOnlineWins||0,
      colorsWon: p.colorsWon||[], hasKStraightWin: !!p.hasKStraightWin,
      hasBigHandWin: !!p.hasBigHandWin, tutorialDone: !!p.tutorialDone
    };
  }catch(e){
    return { wins:0, games:0, draws:0, winStreak:0, prismBanked:0, jokersBanked:0,
      hardWins:0, onlineWins:0, fourPOnlineWins:0, colorsWon:[], hasKStraightWin:false,
      hasBigHandWin:false, tutorialDone:false };
  }
}
function saveStats(stats){
  try{ localStorage.setItem("straightStats", JSON.stringify(stats)); }catch(e){}
}
function loadUnlocksRaw(){
  try{
    var raw = localStorage.getItem("straightUnlocks");
    if(raw===null) return null;
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  }catch(e){ return null; }
}
function saveUnlocks(list){
  try{ localStorage.setItem("straightUnlocks", JSON.stringify(list)); }catch(e){}
}
function isExistingPlayer(){
  try{
    var keys = ["straightClientId","straightNickname","straightCardTheme","straightArtPreset","straightAiDifficulty"];
    for(var i=0;i<keys.length;i++){ if(localStorage.getItem(keys[i])!==null) return true; }
    return false;
  }catch(e){ return false; }
}
function initUnlocksIfNeeded(){
  var allIds = UNLOCK_MILESTONES.map(function(m){ return m.id; });
  var existing = loadUnlocksRaw();
  if(isExistingPlayer()){
    var merged = existing===null ? allIds.slice() : existing.concat(allIds.filter(function(id){ return existing.indexOf(id)===-1; }));
    if(existing===null || merged.length!==existing.length) saveUnlocks(merged);
    return merged;
  }
  if(existing!==null) return existing;
  saveUnlocks([]);
  return [];
}
function isAvatarUnlocked(name, unlocks){
  if(UNLOCK_STARTER_AVATARS.indexOf(name)!==-1) return true;
  return unlocks.indexOf("avatar:"+name)!==-1;
}
function isPatternUnlocked(id, unlocks){
  if(UNLOCK_STARTER_PATTERNS.indexOf(id)!==-1) return true;
  return unlocks.indexOf("pattern:"+id)!==-1;
}
function isTitleUnlocked(id, unlocks){
  return unlocks.indexOf("title:"+id)!==-1;
}
function isBorderUnlocked(id, unlocks){
  return unlocks.indexOf("border:"+id)!==-1;
}
function checkUnlocks(stats, unlocks){
  var updated = unlocks.slice();
  var newly = [];
  UNLOCK_MILESTONES.forEach(function(m){
    if(updated.indexOf(m.id)!==-1) return;
    if(m.check(stats)){
      updated.push(m.id);
      newly.push(m);
    }
  });
  return { updated:updated, newly:newly };
}
function recordGameResult(outcome, meta){
  var stats = loadStats();
  stats.games = stats.games+1;
  if(outcome==="win"){
    stats.wins = stats.wins+1;
    stats.winStreak = stats.winStreak+1;
    if(meta){
      if(meta.difficulty==="hard") stats.hardWins = stats.hardWins+1;
      if(meta.isOnline) stats.onlineWins = stats.onlineWins+1;
      if(meta.isOnline && meta.playerCount===4) stats.fourPOnlineWins = stats.fourPOnlineWins+1;
      if(meta.straight && meta.straight.start===10) stats.hasKStraightWin = true;
      if(meta.straight && stats.colorsWon.indexOf(meta.straight.color)===-1) stats.colorsWon.push(meta.straight.color);
      if(meta.scoreLen>=20) stats.hasBigHandWin = true;
    }
  } else if(outcome==="draw"){
    stats.draws = stats.draws+1;
    stats.winStreak = 0;
  } else if(outcome==="loss"){
    stats.winStreak = 0;
  }
  saveStats(stats);
  var result = checkUnlocks(stats, loadUnlocksRaw() || straightUnlocks);
  straightUnlocks = result.updated;
  saveUnlocks(straightUnlocks);
  return result.newly;
}
function bumpStatAndCheck(field, delta){
  var stats = loadStats();
  stats[field] = (stats[field]||0)+delta;
  saveStats(stats);
  var result = checkUnlocks(stats, loadUnlocksRaw() || straightUnlocks);
  straightUnlocks = result.updated;
  saveUnlocks(straightUnlocks);
  pendingUnlocks = pendingUnlocks.concat(result.newly);
}
function recordTutorialDone(){
  var stats = loadStats();
  if(stats.tutorialDone) return;
  stats.tutorialDone = true;
  saveStats(stats);
  var result = checkUnlocks(stats, loadUnlocksRaw() || straightUnlocks);
  straightUnlocks = result.updated;
  saveUnlocks(straightUnlocks);
  pendingUnlocks = pendingUnlocks.concat(result.newly);
}
```

- [ ] **Step 2: `index.html:424~436`의 기존 `UNLOCK_MILESTONES` 배열 전체를
  아래 31개 항목으로 교체한다.** (`index.html:421~422`의
  `UNLOCK_STARTER_AVATARS`/`UNLOCK_STARTER_PATTERNS` 선언은 Task 2에서 값만
  바꾸므로 지금은 건드리지 않는다.)

```js
function rem(target, current){ return Math.max(0, target-(current||0)); }
var UNLOCK_MILESTONES = [
  { id:"win:10",   kind:"avatar",  label:"나이트올빼미",   check:function(s){ return s.wins>=10; },   hint:function(s){ return rem(10,s.wins)+"승"; } },
  { id:"win:20",   kind:"title",   label:"초보",          check:function(s){ return s.wins>=20; },   hint:function(s){ return rem(20,s.wins)+"승"; } },
  { id:"win:30",   kind:"avatar",  label:"고양이 예언자",  check:function(s){ return s.wins>=30; },   hint:function(s){ return rem(30,s.wins)+"승"; } },
  { id:"win:50",   kind:"avatar",  label:"슬로우모",       check:function(s){ return s.wins>=50; },   hint:function(s){ return rem(50,s.wins)+"승"; } },
  { id:"win:100",  kind:"title",   label:"능숙",          check:function(s){ return s.wins>=100; },  hint:function(s){ return rem(100,s.wins)+"승"; } },
  { id:"win:200",  kind:"avatar",  label:"크러셔 루",      check:function(s){ return s.wins>=200; },  hint:function(s){ return rem(200,s.wins)+"승"; } },
  { id:"win:300",  kind:"avatar",  label:"메가블록",       check:function(s){ return s.wins>=300; },  hint:function(s){ return rem(300,s.wins)+"승"; } },
  { id:"win:400",  kind:"title",   label:"마스터",        check:function(s){ return s.wins>=400; },  hint:function(s){ return rem(400,s.wins)+"승"; } },
  { id:"win:500",  kind:"avatar",  label:"카이저 핑",      check:function(s){ return s.wins>=500; },  hint:function(s){ return rem(500,s.wins)+"승"; } },
  { id:"win:1000", kind:"avatar",  label:"폭스트릭",       check:function(s){ return s.wins>=1000; }, hint:function(s){ return rem(1000,s.wins)+"승"; } },

  { id:"games:10",   kind:"pattern", label:"도트",     check:function(s){ return s.games>=10; },   hint:function(s){ return rem(10,s.games)+"판"; } },
  { id:"games:20",   kind:"title",   label:"발걸음",   check:function(s){ return s.games>=20; },   hint:function(s){ return rem(20,s.games)+"판"; } },
  { id:"games:30",   kind:"pattern", label:"웨이브",   check:function(s){ return s.games>=30; },   hint:function(s){ return rem(30,s.games)+"판"; } },
  { id:"games:50",   kind:"pattern", label:"아가일",   check:function(s){ return s.games>=50; },   hint:function(s){ return rem(50,s.games)+"판"; } },
  { id:"games:100",  kind:"title",   label:"꾸준함",   check:function(s){ return s.games>=100; },  hint:function(s){ return rem(100,s.games)+"판"; } },
  { id:"games:200",  kind:"pattern", label:"다이아몬드", check:function(s){ return s.games>=200; }, hint:function(s){ return rem(200,s.games)+"판"; } },
  { id:"games:300",  kind:"pattern", label:"홀로그램", check:function(s){ return s.games>=300; },  hint:function(s){ return rem(300,s.games)+"판"; } },
  { id:"games:400",  kind:"title",   label:"베테랑",   check:function(s){ return s.games>=400; },  hint:function(s){ return rem(400,s.games)+"판"; } },
  { id:"games:500",  kind:"pattern", label:"로열",     check:function(s){ return s.games>=500; },  hint:function(s){ return rem(500,s.games)+"판"; } },
  { id:"games:1000", kind:"pattern", label:"코스믹",   check:function(s){ return s.games>=1000; }, hint:function(s){ return rem(1000,s.games)+"판"; } },

  { id:"misc:streak10",   kind:"border", label:"불꽃",    check:function(s){ return s.winStreak>=10; },      hint:function(s){ return rem(10,s.winStreak)+"연승"; } },
  { id:"misc:prism10",    kind:"border", label:"레인보우", check:function(s){ return s.prismBanked>=10; },    hint:function(s){ return "프리즘 "+rem(10,s.prismBanked)+"개"; } },
  { id:"misc:draws10",    kind:"title",  label:"평화",    check:function(s){ return s.draws>=10; },          hint:function(s){ return "무승부 "+rem(10,s.draws)+"회"; } },
  { id:"misc:jokers20",   kind:"title",  label:"콜렉터",  check:function(s){ return s.jokersBanked>=20; },   hint:function(s){ return "조커 "+rem(20,s.jokersBanked)+"개"; } },
  { id:"misc:hard100",    kind:"border", label:"트로피",  check:function(s){ return s.hardWins>=100; },      hint:function(s){ return "어려움 "+rem(100,s.hardWins)+"승"; } },
  { id:"misc:kstraight",  kind:"border", label:"실버",    check:function(s){ return s.hasKStraightWin; },    hint:function(s){ return "10-J-Q-K-A 완성"; } },
  { id:"misc:online4p50", kind:"border", label:"하트",    check:function(s){ return s.fourPOnlineWins>=50; },hint:function(s){ return "4인전 "+rem(50,s.fourPOnlineWins)+"승"; } },
  { id:"misc:online1",    kind:"title",  label:"소셜",    check:function(s){ return s.onlineWins>=1; },      hint:function(s){ return "온라인 "+rem(1,s.onlineWins)+"승"; } },
  { id:"misc:allcolors",  kind:"title",  label:"올컬러",  check:function(s){ return s.colorsWon.length>=4; },hint:function(s){ return rem(4,s.colorsWon.length)+"색 남음"; } },
  { id:"misc:bighand",    kind:"title",  label:"빅핸드",  check:function(s){ return s.hasBigHandWin; },      hint:function(s){ return "점수덱 20장 승리"; } },

  { id:"pattern:diagonal", kind:"pattern", label:"다이애그널", check:function(s){ return s.tutorialDone; }, hint:function(s){ return "튜토리얼 완주"; } }
];
```

- [ ] **Step 3: `index.html:1185~1202`의 `findMilestone`/`unlockHintText`/
  `unlockHintShort`를 아래로 교체한다.**

```js
function findMilestone(id){
  for(var i=0;i<UNLOCK_MILESTONES.length;i++){ if(UNLOCK_MILESTONES[i].id===id) return UNLOCK_MILESTONES[i]; }
  return null;
}
function unlockHintText(id){
  var m = findMilestone(id);
  if(!m) return "";
  return "🔒 "+m.hint(loadStats())+" 후 해금";
}
function unlockHintShort(id){
  var m = findMilestone(id);
  if(!m) return "";
  return m.hint(loadStats());
}
```

- [ ] **Step 4: 순수 로직 검증 — `checkUnlocks`와 milestone `check`/`hint` 함수
  본체를 실제 코드에서 그대로 복사해 독립 실행한다.** 아래 스크립트를 그대로 실행:

```bash
node -e "
function rem(target, current){ return Math.max(0, target-(current||0)); }
var UNLOCK_MILESTONES = [
  { id:'win:10', kind:'avatar', label:'나이트올빼미', check:function(s){ return s.wins>=10; }, hint:function(s){ return rem(10,s.wins)+'승'; } },
  { id:'win:20', kind:'title', label:'초보', check:function(s){ return s.wins>=20; }, hint:function(s){ return rem(20,s.wins)+'승'; } },
  { id:'misc:kstraight', kind:'border', label:'실버', check:function(s){ return s.hasKStraightWin; }, hint:function(s){ return '10-J-Q-K-A 완성'; } },
  { id:'misc:allcolors', kind:'title', label:'올컬러', check:function(s){ return s.colorsWon.length>=4; }, hint:function(s){ return rem(4,s.colorsWon.length)+'색 남음'; } }
];
function checkUnlocks(stats, unlocks){
  var updated = unlocks.slice();
  var newly = [];
  UNLOCK_MILESTONES.forEach(function(m){
    if(updated.indexOf(m.id)!==-1) return;
    if(m.check(stats)){ updated.push(m.id); newly.push(m); }
  });
  return { updated:updated, newly:newly };
}
var assert = require('assert');
// case 1: 숫자 조건
var r1 = checkUnlocks({wins:10,games:0,hasKStraightWin:false,colorsWon:[]}, []);
assert.strictEqual(r1.newly.length, 1);
assert.strictEqual(r1.newly[0].id, 'win:10');
// case 2: 이미 해금된 건 다시 안 들어감, 새 것만 추가
var r2 = checkUnlocks({wins:20,games:0,hasKStraightWin:false,colorsWon:[]}, ['win:10']);
assert.strictEqual(r2.newly.length, 1);
assert.strictEqual(r2.newly[0].id, 'win:20');
assert.ok(r2.updated.indexOf('win:10')!==-1);
// case 3: 불리언 조건
var r3 = checkUnlocks({wins:0,games:0,hasKStraightWin:true,colorsWon:[]}, []);
assert.ok(r3.newly.some(function(m){ return m.id==='misc:kstraight'; }));
// case 4: 배열 길이 조건
var r4 = checkUnlocks({wins:0,games:0,hasKStraightWin:false,colorsWon:['PINK','BLUE','YELLOW','GREEN']}, []);
assert.ok(r4.newly.some(function(m){ return m.id==='misc:allcolors'; }));
// case 5: hint 함수가 남은 수를 정확히 계산
assert.strictEqual(UNLOCK_MILESTONES[0].hint({wins:3}), '7승');
assert.strictEqual(UNLOCK_MILESTONES[0].hint({wins:15}), '0승');
console.log('모든 케이스 통과');
"
```

  Expected: `모든 케이스 통과` 출력, 에러 없음.

- [ ] **Step 5: 전체 31개 milestone 테이블 구조 검증 — 스펙 3절의 합계와 실제
  코드가 일치하는지 확인.** 아래 스크립트로 실제 `index.html`에서
  `UNLOCK_MILESTONES` 블록만 추출해 검증(수동으로 복사해서 실행 가능하지만,
  실제 파일을 읽어 정규식으로 추출하는 편이 더 정확하다):

```bash
node -e "
var fs = require('fs');
var src = fs.readFileSync('index.html', 'utf8');
var start = src.indexOf('var UNLOCK_MILESTONES = [');
var end = src.indexOf('];', start) + 2;
var block = src.slice(start, end).replace('var UNLOCK_MILESTONES = ', 'var UNLOCK_MILESTONES = ');
eval(block.replace('function rem', 'function rem').replace(/^var UNLOCK_MILESTONES/, 'global.UNLOCK_MILESTONES'));
function rem(t,c){ return Math.max(0,t-(c||0)); }
var assert = require('assert');
assert.strictEqual(UNLOCK_MILESTONES.length, 31, 'milestone 개수 31이어야 함, 실제: '+UNLOCK_MILESTONES.length);
var byKind = {};
UNLOCK_MILESTONES.forEach(function(m){ byKind[m.kind]=(byKind[m.kind]||0)+1; });
assert.strictEqual(byKind.avatar, 7, 'avatar 7이어야 함, 실제: '+byKind.avatar);
assert.strictEqual(byKind.pattern, 8, 'pattern 8이어야 함, 실제: '+byKind.pattern);
assert.strictEqual(byKind.title, 11, 'title 11이어야 함, 실제: '+byKind.title);
assert.strictEqual(byKind.border, 5, 'border 5이어야 함, 실제: '+byKind.border);
var ids = UNLOCK_MILESTONES.map(function(m){ return m.id; });
assert.strictEqual(new Set(ids).size, ids.length, 'id 중복 없어야 함');
console.log('구조 검증 통과: avatar='+byKind.avatar+' pattern='+byKind.pattern+' title='+byKind.title+' border='+byKind.border);
"
```

  `rem`이 `UNLOCK_MILESTONES` 정의보다 먼저 필요하므로 `eval` 순서 문제가 나면,
  파일에서 추출한 블록 앞에 `function rem(t,c){ return Math.max(0,t-(c||0)); }\n`
  를 붙여서 실행한다. Expected: `구조 검증 통과: avatar=7 pattern=8 title=11 border=5`.

- [ ] **Step 6: 커밋**

```bash
git add index.html
git commit -m "feat: replace unlock milestone table with function-based conditions and richer stats"
```

---

## Task 2: 콘텐츠 카탈로그 — 아바타/패턴/칭호/테두리 데이터 + CSS

**Files:**
- Modify: `index.html:409~417`(`CARD_BACK_PRESETS`), `index.html:421~422`
  (starter 배열), `index.html:603~612`(`CHARACTERS`), CSS 패턴 블록
  (`index.html:170~177` 부근), 새 CSS 블록(칭호/테두리)

**Interfaces:**
- Consumes: Task 1의 `UNLOCK_MILESTONES`(어떤 id가 실제로 카탈로그에 존재해야
  하는지 검증할 때 참조).
- Produces: 최종 `CARD_BACK_PRESETS`(12개), `CHARACTERS`(11개), `UNLOCK_STARTER_AVATARS`
  (4개), `UNLOCK_STARTER_PATTERNS`(4개), `BORDER_PRESETS`(5개), `TITLE_PRESETS`
  (11개) — Task 5(장착)와 Task 6/7(화면)이 이 배열들을 그대로 순회한다.

- [ ] **Step 1: `CARD_BACK_PRESETS` 확장.** 현재(`index.html:409~417`):
  ```js
  var CARD_BACK_PRESETS = [
    { id:"stripe", name:"스트라이프", cls:"pattern-stripe" },
    { id:"zigzag", name:"지그재그", cls:"pattern-zigzag" },
    { id:"argyle", name:"아가일", cls:"pattern-argyle" },
    { id:"diamond", name:"다이아몬드", cls:"pattern-diamond" },
    { id:"honeycomb", name:"허니콤", cls:"pattern-honeycomb" },
    { id:"diagonal", name:"다이애그널", cls:"pattern-diagonal" },
    { id:"ripple", name:"리플", cls:"pattern-ripple" }
  ];
  ```
  다음으로 교체:
  ```js
  var CARD_BACK_PRESETS = [
    { id:"stripe", name:"스트라이프", cls:"pattern-stripe" },
    { id:"zigzag", name:"지그재그", cls:"pattern-zigzag" },
    { id:"argyle", name:"아가일", cls:"pattern-argyle" },
    { id:"diamond", name:"다이아몬드", cls:"pattern-diamond" },
    { id:"honeycomb", name:"허니콤", cls:"pattern-honeycomb" },
    { id:"diagonal", name:"다이애그널", cls:"pattern-diagonal" },
    { id:"ripple", name:"리플", cls:"pattern-ripple" },
    { id:"dot", name:"도트", cls:"pattern-dot" },
    { id:"wave", name:"웨이브", cls:"pattern-wave" },
    { id:"hologram", name:"홀로그램", cls:"pattern-hologram" },
    { id:"royal", name:"로열", cls:"pattern-royal" },
    { id:"cosmic", name:"코스믹", cls:"pattern-cosmic" }
  ];
  ```

- [ ] **Step 2: starter 배열 갱신.** 현재(`index.html:421~422`):
  ```js
  var UNLOCK_STARTER_AVATARS = ["허니뱅","고양이 예언자"];
  var UNLOCK_STARTER_PATTERNS = ["stripe","zigzag"];
  ```
  다음으로 교체:
  ```js
  var UNLOCK_STARTER_AVATARS = ["허니뱅","바코드 라이언","스파크 렉스","매드독"];
  var UNLOCK_STARTER_PATTERNS = ["stripe","zigzag","honeycomb","ripple"];
  ```
  (고양이 예언자는 이제 `win:30` 보상이므로 starter 목록에서 빠진다 — Task 1의
  milestone 테이블에 `avatar:고양이 예언자` id가 없다는 점에 주의: 이 프로젝트는
  이미 `isAvatarUnlocked`가 starter 아니면 `unlocks.indexOf("avatar:"+name)`로
  검사하므로, milestone id가 정확히 `"avatar:"+ch.name`과 일치해야 한다. Task 1의
  `win:30` 항목 label이 "고양이 예언자"이지만 **id는 `"win:30"`이지 `"avatar:고양이 예언자"`가
  아니다** — 이 불일치를 이 Step에서 반드시 고친다. 아래 Step 2b 참고.)

- [ ] **Step 2b: milestone id와 `isAvatarUnlocked`/`isPatternUnlocked`의
  조회 키를 맞춘다.** Task 1에서 만든 milestone id는 `win:10`/`games:10`/`misc:*`
  형태지만, `isAvatarUnlocked(name, unlocks)`는 `"avatar:"+name`을
  `unlocks.indexOf`로 찾는다. 두 가지 방법 중 하나를 선택해야 하는데, **id
  형식을 그대로 두고 조회 함수 쪽을 kind 기반으로 바꾸는 방법**을 쓴다(milestone
  id는 스펙 3절 표와 정확히 일치시켜야 대조가 쉬우므로 `win:10` 형식을 유지).
  `isAvatarUnlocked`/`isPatternUnlocked`/`isTitleUnlocked`/`isBorderUnlocked`를
  "이름/kind로 milestone을 찾아 그 id가 unlocks에 있는지" 방식으로 바꾼다.
  Task 1 Step 1에서 이미 작성한 네 함수를 아래로 다시 교체한다(덮어쓰기):
  ```js
  function findMilestoneByLabel(kind, label){
    for(var i=0;i<UNLOCK_MILESTONES.length;i++){
      var m = UNLOCK_MILESTONES[i];
      if(m.kind===kind && m.label===label) return m;
    }
    return null;
  }
  function isAvatarUnlocked(name, unlocks){
    if(UNLOCK_STARTER_AVATARS.indexOf(name)!==-1) return true;
    var m = findMilestoneByLabel("avatar", name);
    return m ? unlocks.indexOf(m.id)!==-1 : false;
  }
  function isPatternUnlocked(id, unlocks){
    var preset = null;
    for(var i=0;i<CARD_BACK_PRESETS.length;i++){ if(CARD_BACK_PRESETS[i].id===id){ preset=CARD_BACK_PRESETS[i]; break; } }
    if(!preset) return false;
    if(UNLOCK_STARTER_PATTERNS.indexOf(id)!==-1) return true;
    var m = findMilestoneByLabel("pattern", preset.name);
    return m ? unlocks.indexOf(m.id)!==-1 : false;
  }
  function isTitleUnlocked(id, unlocks){
    var preset = null;
    for(var i=0;i<TITLE_PRESETS.length;i++){ if(TITLE_PRESETS[i].id===id){ preset=TITLE_PRESETS[i]; break; } }
    if(!preset) return false;
    var m = findMilestoneByLabel("title", preset.name);
    return m ? unlocks.indexOf(m.id)!==-1 : false;
  }
  function isBorderUnlocked(id, unlocks){
    var preset = null;
    for(var i=0;i<BORDER_PRESETS.length;i++){ if(BORDER_PRESETS[i].id===id){ preset=BORDER_PRESETS[i]; break; } }
    if(!preset) return false;
    var m = findMilestoneByLabel("border", preset.name);
    return m ? unlocks.indexOf(m.id)!==-1 : false;
  }
  function unlockHintTextFor(kind, label){
    var m = findMilestoneByLabel(kind, label);
    return m ? ("🔒 "+m.hint(loadStats())+" 후 해금") : "";
  }
  function unlockHintShortFor(kind, label){
    var m = findMilestoneByLabel(kind, label);
    return m ? m.hint(loadStats()) : "";
  }
  ```
  이 Step은 `CHARACTERS`/`CARD_BACK_PRESETS`/`TITLE_PRESETS`/`BORDER_PRESETS`가
  전부 이 시점까지 선언되어 있어야 동작하므로, 이 함수들을 파일 안에서
  **네 배열 전부의 선언 뒤(`CHARACTERS` 선언 뒤, `index.html:612` 이후)**로
  옮겨서 정의한다. Task 1 Step 1에서 넣었던 구버전 네 함수(`CARD_BACK_PRESETS`
  선언 직후에 있던 것)는 삭제한다. **Task 1 Step 3에서 만든
  `findMilestone(id)`/`unlockHintText(id)`/`unlockHintShort(id)`(id 인자를 받는
  구버전 — Task 1은 `UNLOCK_MILESTONES`의 id 형식이 `win:10` 같은 트랙 기반으로
  바뀐 것에 맞춰 이 세 함수의 본문만 우선 고쳐 커밋을 독립적으로 성립시키는
  용도였다)도 이 Step에서 함께 삭제한다** — 아래에서 만드는
  `findMilestoneByLabel`/`unlockHintTextFor`/`unlockHintShortFor`가 완전히
  대체하고, 이 Step 끝에서 두 그리드의 호출부도 신버전으로 바꾸므로 구버전을
  남겨두면 아무도 호출하지 않는 죽은 코드가 된다.
  또한 `index.html:1204~1223`(아바타 그리드 빌드)과
  설정 모달의 카드뒷면 그리드(`index.html:2555~2574` 부근)가 쓰는
  `unlockHintText("avatar:"+ch.name)`/`unlockHintText("pattern:"+preset.id)`
  호출을 `unlockHintTextFor("avatar", ch.name)`/`unlockHintTextFor("pattern", preset.name)`로,
  `unlockHintShort(...)`도 `unlockHintShortFor(...)`로 바꾼다(Task 4에서 두
  그리드를 다시 손볼 때 이 호출부도 함께 정리한다 — 지금 Task 2에서는 함수
  정의만 옮기고 호출부 치환은 Task 4로 넘겨도 되지만, 그리드가 깨진 채로 두 태스크
  사이에 커밋하지 않도록 **이 Step에서 호출부까지 함께 바꾼다**).

- [ ] **Step 3: 새 캐릭터 3종 추가.** 현재(`index.html:603~612`):
  ```js
  var CHARACTERS = [
    { emoji:"🦡", name:"허니뱅" },
    { emoji:"🐈‍⬛", name:"고양이 예언자" },
    { emoji:"🦁", name:"바코드 라이언" },
    { emoji:"🐳", name:"메가블록" },
    { emoji:"🐧", name:"카이저 핑" },
    { emoji:"🐕", name:"매드독" },
    { emoji:"🦘", name:"크러셔 루" },
    { emoji:"🐉", name:"스파크 렉스" }
  ];
  ```
  다음으로 교체:
  ```js
  var CHARACTERS = [
    { emoji:"🦡", name:"허니뱅" },
    { emoji:"🐈‍⬛", name:"고양이 예언자" },
    { emoji:"🦁", name:"바코드 라이언" },
    { emoji:"🐳", name:"메가블록" },
    { emoji:"🐧", name:"카이저 핑" },
    { emoji:"🐕", name:"매드독" },
    { emoji:"🦘", name:"크러셔 루" },
    { emoji:"🐉", name:"스파크 렉스" },
    { emoji:"🦉", name:"나이트올빼미" },
    { emoji:"🐢", name:"슬로우모" },
    { emoji:"🦊", name:"폭스트릭" }
  ];
  ```

- [ ] **Step 4: `TITLE_PRESETS`/`BORDER_PRESETS` 배열 추가.** `CHARACTERS`
  선언 바로 뒤(`index.html:612` 이후, `avatarIconHTML` 함수 앞)에 추가:
  ```js
  var TITLE_PRESETS = [
    { id:"beginner", name:"초보" },
    { id:"skilled", name:"능숙" },
    { id:"master", name:"마스터" },
    { id:"firststep", name:"발걸음" },
    { id:"consistent", name:"꾸준함" },
    { id:"veteran", name:"베테랑" },
    { id:"peace", name:"평화" },
    { id:"collector", name:"콜렉터" },
    { id:"social", name:"소셜" },
    { id:"allcolor", name:"올컬러" },
    { id:"bighand", name:"빅핸드" }
  ];
  var BORDER_PRESETS = [
    { id:"silver", name:"실버", cls:"border-silver" },
    { id:"rainbow", name:"레인보우", cls:"border-rainbow" },
    { id:"trophy", name:"트로피", cls:"border-trophy" },
    { id:"flame", name:"불꽃", cls:"border-flame" },
    { id:"heart", name:"하트", cls:"border-heart" }
  ];
  ```

- [ ] **Step 5: 신규 패턴 5종 CSS.** 현재(`index.html:170~177`)의 선택자 목록
  줄:
  ```css
  .pattern-stripe::after,.pattern-zigzag::after,.pattern-argyle::after,.pattern-diamond::after,.pattern-honeycomb::after,.pattern-diagonal::after,.pattern-ripple::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:1;}
  ```
  다음으로 교체(신규 5개 클래스 추가):
  ```css
  .pattern-stripe::after,.pattern-zigzag::after,.pattern-argyle::after,.pattern-diamond::after,.pattern-honeycomb::after,.pattern-diagonal::after,.pattern-ripple::after,.pattern-dot::after,.pattern-wave::after,.pattern-hologram::after,.pattern-royal::after,.pattern-cosmic::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:1;}
  ```
  그 아래(`.pattern-ripple::after{...}` 규칙 다음 줄)에 추가:
  ```css
  .pattern-dot::after{background-image:radial-gradient(rgba(0,0,0,.35) 1.5px, transparent 1.7px);background-size:7px 7px;}
  .pattern-wave::after{background-image:radial-gradient(rgba(0,0,0,.16) 1.4px, transparent 1.6px),radial-gradient(rgba(0,0,0,.16) 1.4px, transparent 1.6px);background-size:10px 8px;background-position:0 0,5px 4px;}
  .pattern-hologram::after{background-image:linear-gradient(115deg, transparent 0 15%, rgba(255,255,255,.5) 15% 19%, transparent 19% 45%, rgba(255,255,255,.35) 45% 48%, transparent 48% 75%, rgba(255,255,255,.45) 75% 78%, transparent 78% 100%);}
  .pattern-royal::after{background-image:linear-gradient(45deg,rgba(246,168,60,.55) 25%,transparent 25%,transparent 75%,rgba(246,168,60,.55) 75%),linear-gradient(45deg,rgba(246,168,60,.55) 25%,transparent 25%,transparent 75%,rgba(246,168,60,.55) 75%),radial-gradient(rgba(255,215,107,.7) 1.3px, transparent 1.5px);background-size:14px 14px,14px 14px,14px 14px;background-position:0 0,7px 7px,3.5px 3.5px;}
  .pattern-cosmic::after{background-image:radial-gradient(rgba(255,255,255,.9) 1px, transparent 1.2px),radial-gradient(rgba(255,255,255,.55) 0.8px, transparent 1px),radial-gradient(rgba(255,215,107,.8) 1.3px, transparent 1.5px);background-size:9px 9px,6px 6px,16px 16px;background-position:0 0,3px 5px,8px 2px;}
  ```

- [ ] **Step 6: 테두리 CSS.** `.lock-hint{...}` 규칙(`index.html:68` 부근) 뒤에
  추가:
  ```css
  .border-ring{position:relative;display:inline-flex;}
  .border-silver{border:5px groove #b8bcc4;border-radius:50%;}
  .border-rainbow{border-width:4px;border-style:solid;border-radius:50%;border-top-color:#d4537e;border-right-color:#7f77dd;border-bottom-color:#33d6c0;border-left-color:#f6a83c;}
  .border-trophy{border:4px double #f6a83c;border-radius:50%;}
  .border-trophy::after{content:"";position:absolute;top:-5px;left:50%;transform:translateX(-50%);width:6px;height:6px;border-radius:50%;background:#f6a83c;}
  .border-flame{border:3px solid #d85a30;border-radius:50%;}
  .border-flame::before,.border-flame::after{content:"";position:absolute;top:-3px;width:5px;height:5px;border-radius:50%;background:#f6a83c;}
  .border-flame::before{left:32%;}
  .border-flame::after{left:62%;}
  .border-heart{border:3px solid #d4537e;border-radius:50%;}
  .border-heart::after{content:"";position:absolute;top:-3px;left:50%;transform:translateX(-50%);width:6px;height:6px;border-radius:50%;background:#ff8fb3;}
  ```
  (테두리는 아바타 아이콘 하나를 감싸는 원형 래퍼에 적용하는 클래스다 — 실제
  DOM 구조는 Task 5에서 만든다. 이 Step은 CSS 정의만 담당.)

- [ ] **Step 7: 브라우저로 카드 패턴 5종을 실제 크기에서 확인.** 로컬
  dev 서버(포트 5201, `npx serve -l 5201 .`)를 띄우고 설정 모달의 카드 뒷면
  섹션을 연다 — 지금은 아직 잠금 UI가 옛 milestone 기준으로 깨져 있을 수
  있으니(Task 4에서 고침), 콘솔에서 `localStorage.setItem('straightNickname','t')`
  후 새로고침해 전체 해금 상태로 만들고 확인한다. 도트/웨이브/홀로그램/로열/코스믹
  스와치(34×34px 미리보기)가 서로 구분 가능한지, 그리고 실제 카드(30~58px)에
  적용했을 때도 눌러붙지 않는지 확인 — 실제 카드 확인은 아무 게임이나 시작해서
  `#deck-visual .layer`에 반영된 모양을 본다(패턴은 `setBackPreset`이
  `applyBackPresetToDeckVisual()`을 호출해 덱 비주얼에도 즉시 반영됨). 문제가
  있으면 이 Step에서 CSS 수치를 조정한다. 서버를 끄고 포트가 비었는지 확인한다.

- [ ] **Step 8: 커밋**

```bash
git add index.html
git commit -m "feat: add new avatars, patterns, titles, and border presets"
```

---

## Task 3: 게임 이벤트 훅 — outcome/meta 배선 + 실시간 카운터

**Files:**
- Modify: `index.html`의 `checkWin`(~1660대), `declareDraw`(~1610대),
  `applyRemoteRoomState`의 게임오버 분기(~981~994), `finishEat`(~1870대),
  `bankJoker`(~1917대), `maybeRecordLocalGameResult` 정의부(~506~509),
  `openTutorialModal`의 `startBtn` 핸들러(~2479~2482)

**Interfaces:**
- Consumes: Task 1의 `recordGameResult(outcome, meta)`, `bumpStatAndCheck(field, delta)`,
  `recordTutorialDone()`.
- Produces: 없음(터미널 통합 — Task 6/7이 최종 소비자).

- [ ] **Step 1: `maybeRecordLocalGameResult` 시그니처 변경.** 현재:
  ```js
  function maybeRecordLocalGameResult(won){
    if(state.statsRecorded) return;
    state.statsRecorded = true;
    pendingUnlocks = recordGameResult(won);
  }
  ```
  다음으로 교체:
  ```js
  function maybeRecordLocalGameResult(outcome, meta){
    if(state.statsRecorded) return;
    state.statsRecorded = true;
    pendingUnlocks = pendingUnlocks.concat(recordGameResult(outcome, meta));
  }
  ```

- [ ] **Step 2: `checkWin(playerIdx)` 훅 갱신.** 현재:
  ```js
  function checkWin(playerIdx){
    var player = state.players[playerIdx];
    var straight = findStraight(player.score, state.colors);
    if(straight){
      state.gameOver = true;
      state.winnerIndex = playerIdx;
      state.winnerStraight = straight;
      state.ceremonyShown = true;
      clearTurnTimer();
      render();
      pushRoomState();
      maybeRecordLocalGameResult(playerIdx===state.myIndex);
      playWinCeremony(playerIdx, straight, function(){
        showWinScreen(player, straight);
      });
      return true;
    }
    return false;
  }
  ```
  `maybeRecordLocalGameResult(playerIdx===state.myIndex);` 줄만 아래로 교체:
  ```js
      if(playerIdx===state.myIndex){
        maybeRecordLocalGameResult("win", {
          difficulty: state.aiDifficulty,
          isOnline: isMultiplayer(),
          playerCount: state.turnOrder.length,
          straight: straight,
          scoreLen: player.score.length
        });
      } else {
        maybeRecordLocalGameResult("loss");
      }
  ```

- [ ] **Step 3: `declareDraw()` 훅 갱신.** 현재 `maybeRecordLocalGameResult(false);`
  줄을 `maybeRecordLocalGameResult("draw");`로 교체.

- [ ] **Step 4: `applyRemoteRoomState`의 게임오버 분기 갱신.** 현재
  (`index.html:981~994` 부근):
  ```js
    if(state.gameOver && !wasOver && !state.ceremonyShown){
      state.ceremonyShown = true;
      if(state.isDraw){
        maybeRecordLocalGameResult(false);
        setTimeout(showDrawScreen, 800);
      } else {
        var winner = state.players[state.winnerIndex];
        if(winner && state.winnerStraight){
          maybeRecordLocalGameResult(state.winnerIndex===state.myIndex);
          playWinCeremony(state.winnerIndex, state.winnerStraight, function(){
            showWinScreen(winner, state.winnerStraight);
          });
        }
      }
    }
  ```
  다음으로 교체:
  ```js
    if(state.gameOver && !wasOver && !state.ceremonyShown){
      state.ceremonyShown = true;
      if(state.isDraw){
        maybeRecordLocalGameResult("draw");
        setTimeout(showDrawScreen, 800);
      } else {
        var winner = state.players[state.winnerIndex];
        if(winner && state.winnerStraight){
          if(state.winnerIndex===state.myIndex){
            maybeRecordLocalGameResult("win", {
              difficulty: state.aiDifficulty,
              isOnline: isMultiplayer(),
              playerCount: state.turnOrder.length,
              straight: state.winnerStraight,
              scoreLen: winner.score.length
            });
          } else {
            maybeRecordLocalGameResult("loss");
          }
          playWinCeremony(state.winnerIndex, state.winnerStraight, function(){
            showWinScreen(winner, state.winnerStraight);
          });
        }
      }
    }
  ```

- [ ] **Step 5: `finishEat` 프리즘 카운터.** 현재(`index.html:1870`부터)의
  콜백 안, `player.score.push(capturedCoin);` 바로 다음 줄에 추가:
  ```js
      if(capturedCoin.isPrism && playerIdx===state.myIndex) bumpStatAndCheck("prismBanked", 1);
  ```
  (정확한 삽입 위치: `player.hand.splice(handIdx,1);` 전이든 후든 상관없으나,
  `player.score.push(capturedCoin);` 바로 다음 줄에 넣는다.)

- [ ] **Step 6: `bankJoker` 조커 카운터.** 현재(`index.html:1917`부터):
  ```js
  function bankJoker(handIdx){
    if(state.animating || !isHumanTurn()) return;
    var player = state.players[state.myIndex];
    var joker = player.hand.splice(handIdx,1)[0];
    player.score.push(joker);
    pushLog(player.name+"가 조커를 점수덱에 내려놓았습니다!");
    clearSelectionState();
    render();
    pushRoomState();
    checkWin(state.myIndex);
  }
  ```
  `player.score.push(joker);` 다음 줄에 `bumpStatAndCheck("jokersBanked", 1);` 추가:
  ```js
  function bankJoker(handIdx){
    if(state.animating || !isHumanTurn()) return;
    var player = state.players[state.myIndex];
    var joker = player.hand.splice(handIdx,1)[0];
    player.score.push(joker);
    bumpStatAndCheck("jokersBanked", 1);
    pushLog(player.name+"가 조커를 점수덱에 내려놓았습니다!");
    clearSelectionState();
    render();
    pushRoomState();
    checkWin(state.myIndex);
  }
  ```

- [ ] **Step 7: 튜토리얼 완주 훅.** `openTutorialModal()`의 `startBtn` 클릭
  핸들러 현재:
  ```js
  startBtn.addEventListener("click", function(){
    closeModal();
    $("start-btn").click();
  });
  ```
  다음으로 교체:
  ```js
  startBtn.addEventListener("click", function(){
    recordTutorialDone();
    closeModal();
    $("start-btn").click();
  });
  ```

- [ ] **Step 8: 브라우저 수동 검증.** 로컬 dev 서버(포트 5202)에서, 온보딩
  기능 때 썼던 방식대로 **임시 디버그 훅**을 파일 맨 끝 `})();` 직전에 추가해
  실제 `checkWin`/`declareDraw`/`bumpStatAndCheck`/`recordTutorialDone` 경로를
  왕복시킨다(검증 후 반드시 삭제하고 grep으로 0건 확인):
  ```js
  window.__debugStats = function(){
    var s = loadStats();
    console.log(JSON.stringify(s));
    console.log(JSON.stringify(straightUnlocks));
  };
  window.__debugPrism = function(){
    bumpStatAndCheck("prismBanked", 1);
    window.__debugStats();
  };
  window.__debugTutorial = function(){
    recordTutorialDone();
    window.__debugStats();
  };
  ```
  확인 시나리오:
  1. `localStorage.clear(); localStorage.setItem('straightUnlocks','[]');` 후
     새로고침, `window.__debugPrism()`을 10번 호출 — `prismBanked`가 10까지
     오르고 10번째 호출 직후 `pendingUnlocks`에 `misc:prism10`(레인보우)이
     들어있는지 `window.pendingUnlocks`로 확인(모듈 스코프라 콘솔에서 직접
     못 읽으면 `__debugStats` 호출 후 `straightUnlocks` 배열에
     `"misc:prism10"`이 포함됐는지로 대신 확인).
  2. `window.__debugTutorial()` 호출 — `straightUnlocks`에 `"pattern:diagonal"`이
     포함되는지 확인.
  3. 실제 2인 솔로 게임을 진행해 정상 승리 1회 — `checkWin` 경로에서 에러 없이
     `wins`/`games`/`winStreak`가 갱신되는지 `__debugStats()`로 확인.
  4. 콘솔 에러 없는지 확인.
  5. 디버그 훅 3개를 삭제하고 `grep -n "__debug" index.html`이 0건인지 확인
     후 서버를 끈다.

- [ ] **Step 9: 커밋**

```bash
git add index.html
git commit -m "feat: wire win/draw/prism/joker/tutorial events into the stats layer"
```

---

## Task 4: 잠금 UI 재정비 — 아바타/패턴 그리드가 새 milestone과 맞물리게

**Files:**
- Modify: 아바타 그리드 빌드(`index.html:1204~1223` 부근), 설정 모달 카드뒷면
  그리드(`index.html:2555~2574` 부근)

**Interfaces:**
- Consumes: Task 2의 `isAvatarUnlocked`/`isPatternUnlocked`/`unlockHintTextFor`/
  `unlockHintShortFor`.
- Produces: 없음.

(Task 2 Step 2b에서 두 그리드의 호출부를 이미 `unlockHintTextFor`/
`unlockHintShortFor`로 바꿔뒀다면 이 태스크는 **검증 전용**이다. 아직 안 바꿨다면
아래 Step 1에서 마저 바꾼다.)

- [ ] **Step 1: 호출부 확인/수정.** 아바타 그리드(`index.html:1204~1223`)에서
  `b.title = unlockHintText("avatar:"+ch.name);`와
  `unlockHintShort("avatar:"+ch.name)`가 남아있다면
  `unlockHintTextFor("avatar", ch.name)`/`unlockHintShortFor("avatar", ch.name)`로
  바꾼다. 설정 모달 카드뒷면 그리드(`index.html:2555~2574`)의
  `unlockHintText("pattern:"+preset.id)`/`unlockHintShort("pattern:"+preset.id)`도
  `unlockHintTextFor("pattern", preset.name)`/`unlockHintShortFor("pattern", preset.name)`로
  바꾼다.

- [ ] **Step 2: 브라우저 수동 검증.** 로컬 dev 서버(포트 5203)에서:
  1. `localStorage.clear(); localStorage.setItem('straightUnlocks','[]');` 후
     새로고침, 솔로 모드 아바타 선택 화면 진입 — 11개 중 4개(허니뱅, 바코드
     라이언, 스파크 렉스, 매드독)만 선택 가능하고 나머지 7개(고양이 예언자,
     메가블록, 카이저 핑, 크러셔 루, 나이트올빼미, 슬로우모, 폭스트릭)는
     🔒 표시 + "10승" 같은 힌트가 보이는지 확인.
  2. 설정 모달 카드뒷면 — 12개 중 4개(스트라이프, 지그재그, 허니콤, 리플)만
     선택 가능하고 나머지 8개는 🔒 + 힌트 표시 확인.
  3. `localStorage.clear(); localStorage.setItem('straightNickname','t');` 후
     새로고침 — 두 그리드 모두 잠금 없이 전부 선택 가능한지 확인(기존 플레이어
     자가치유 마이그레이션이 새 31개 milestone에도 그대로 적용되는지 검증).
  4. 콘솔 에러 없는지 확인 후 서버를 끈다.

- [ ] **Step 3: 커밋**

```bash
git add index.html
git commit -m "fix: point avatar and pattern lock UI at the new label-based unlock lookup"
```

---

## Task 5: 칭호·테두리 장착 시스템

**Files:**
- Modify: `index.html`(새 함수), 아바타 피커, 게임 중 상단바 플레이어 표시,
  승리 화면

**Interfaces:**
- Consumes: Task 2의 `TITLE_PRESETS`/`BORDER_PRESETS`/`isTitleUnlocked`/
  `isBorderUnlocked`.
- Produces: `setActiveTitle(id)`, `setActiveBorder(id)`, `getActiveTitle()`,
  `getActiveBorder()`, `renderNameWithTitle(name)`(문자열 헬퍼),
  `wrapAvatarWithBorder(avatarHTML)`(문자열 헬퍼) — Task 6/7이 동일 헬퍼를
  재사용한다.

- [ ] **Step 1: 장착 상태 저장/조회 함수.** `TITLE_PRESETS`/`BORDER_PRESETS`
  선언 뒤(Task 2 Step 4에서 넣은 위치 바로 다음)에 추가:
  ```js
  function getActiveTitle(){
    try{ return localStorage.getItem("straightActiveTitle"); }catch(e){ return null; }
  }
  function setActiveTitle(id){
    try{ localStorage.setItem("straightActiveTitle", id||""); }catch(e){}
  }
  function getActiveBorder(){
    try{ return localStorage.getItem("straightActiveBorder"); }catch(e){ return null; }
  }
  function setActiveBorder(id){
    try{ localStorage.setItem("straightActiveBorder", id||""); }catch(e){}
  }
  function activeTitleLabel(){
    var id = getActiveTitle();
    if(!id) return null;
    if(!isTitleUnlocked(id, straightUnlocks)) return null;
    for(var i=0;i<TITLE_PRESETS.length;i++){ if(TITLE_PRESETS[i].id===id) return TITLE_PRESETS[i].name; }
    return null;
  }
  function activeBorderCls(){
    var id = getActiveBorder();
    if(!id) return null;
    if(!isBorderUnlocked(id, straightUnlocks)) return null;
    for(var i=0;i<BORDER_PRESETS.length;i++){ if(BORDER_PRESETS[i].id===id) return BORDER_PRESETS[i].cls; }
    return null;
  }
  function nameWithTitle(name){
    var t = activeTitleLabel();
    return t ? (name+" 〈"+t+"〉") : name;
  }
  function avatarWithBorderHTML(avatarInner){
    var cls = activeBorderCls();
    return cls ? ("<span class=\"border-ring "+cls+"\">"+avatarInner+"</span>") : avatarInner;
  }
  ```
  (`activeTitleLabel`/`activeBorderCls`가 매번 `isTitleUnlocked`/`isBorderUnlocked`로
  재검증하는 이유: 저장된 장착 id가 가리키는 항목을 나중에 잃을 방법은
  없지만—해금은 단조 증가—방어적으로 항상 재검증해 잠긴 것을 표시하는 사고를
  막는다.)

- [ ] **Step 2: 아바타 피커에 반영.** `index.html:1204~1223` 아바타 그리드
  빌드에서 `b.innerHTML = "<span>"+avatarIconHTML(ch)+"</span><span class=\"nm\">"+ch.name+"</span>";`
  줄을 다음으로 교체:
  ```js
  b.innerHTML = avatarWithBorderHTML("<span>"+avatarIconHTML(ch)+"</span>")+"<span class=\"nm\">"+nameWithTitle(ch.name)+"</span>";
  ```
  (미해금 아바타 칸까지 칭호/테두리가 씌워지는 게 이상해 보일 수 있으나, 실제
  선택 가능한 카드(starter+해금분)에서만 의미 있게 보이고 잠긴 칸은 이미
  `opacity:.42` 처리되어 있어 문제 없다.)

- [ ] **Step 3: 게임 중 상단바 표시.** 게임 화면에서 내 캐릭터 이름이
  렌더링되는 지점을 찾는다(`renderOpponents`/`renderScore` 등에서
  `player.name`을 그대로 쓰는 곳들과, 상단바의 "내 캐릭터" 표시 지점). 최소
  다음 두 곳에 반영한다:
  1. 상단 내 정보 표시(플레이어 이름+아바타가 나오는 HTML) — 이름은
     `nameWithTitle(player.name)`으로, 아바타는 `avatarWithBorderHTML(player.avatar)`로 감싼다.
  2. 로그(`pushLog`) 메시지는 손대지 않는다(장황해지는 걸 피하기 위해 로그
     텍스트에는 칭호를 넣지 않는다 — 스펙 4.4의 "주요 화면"에 로그는 포함하지 않음).
  정확한 삽입 지점은 구현 시점에 `grep -n "player.name" index.html`로
  실제 렌더 함수 목록을 뽑아 하나씩 확인한다(이 플랜 작성 시점 라인 번호는
  Task 1~4의 편집으로 이미 밀려 있으므로 신뢰하지 않는다).

- [ ] **Step 4: 승리 화면 표시.** `showWinScreen(player, straight)`의
  `$("win-title").innerHTML = player.avatar+" "+player.name+" 승리!";`를
  `$("win-title").innerHTML = avatarWithBorderHTML(player.avatar)+" "+nameWithTitle(player.name)+" 승리!";`로
  교체한다(단, 이 표시는 **로컬 플레이어 자신이 장착한 칭호/테두리**만 반영
  하므로 — `activeTitleLabel`/`activeBorderCls`가 로컬 `localStorage`를 읽는
  함수라 — 상대방이 이겼을 때 상대방의 칭호는 표시되지 않는다는 한계가 있다.
  이는 계정 없는 로컬 전용 구조의 자연스러운 제약이므로 스펙 범위 안에서
  받아들인다. 승리자가 로컬 플레이어일 때만 의미 있게 동작한다는 점을 이 태스크
  완료 후 컨트롤러 원장에 기록한다.)

- [ ] **Step 5: 브라우저 수동 검증.** 로컬 dev 서버(포트 5204)에서:
  1. 콘솔에서 `setActiveTitle('beginner'); setActiveBorder('flame');` 실행
     (아직 해금 전이라 `activeTitleLabel()`/`activeBorderCls()`는 `null`을
     반환해야 함 — 아바타 피커에 아무 변화 없는지 확인).
  2. `localStorage.setItem('straightUnlocks', JSON.stringify(['win:20','misc:streak10']));`
     로 강제 해금 후 새로고침 — 아바타 피커에서 내 캐릭터 이름 옆에
     "〈초보〉"가, 아바타 아이콘에 주황 불꽃 테두리가 보이는지 확인.
  3. 콘솔 에러 없는지 확인 후 서버를 끈다.

- [ ] **Step 6: 커밋**

```bash
git add index.html
git commit -m "feat: add title and border equip system with display in avatar picker and win screen"
```

---

## Task 6: 업적 화면

**Files:**
- Modify: `index.html`(`screen-start` HTML, `switchScreen` 목록, 새
  `screen-achievements` HTML+빌드 함수)

**Interfaces:**
- Consumes: Task 1의 `UNLOCK_MILESTONES`/`straightUnlocks`/`loadStats`, Task 2의
  카탈로그 배열(미리보기용).
- Produces: `renderAchievementsScreen()` — Task 8 통합 검증에서 호출 경로를
  확인한다.

- [ ] **Step 1: 시작 화면에 업적 버튼 추가.** 현재
  (`index.html:234~245` 부근, Task 2까지 반영된 상태 기준 — 정확한 현재 줄은
  `grep -n "id=\"screen-start\"" index.html`로 재확인):
  ```html
    <div class="screen" id="screen-start">
      <div class="title-block">
        <div class="title-main">스트레이트<span>!</span></div>
        <div class="title-sub">(STRAIGHT!)</div>
        <div class="title-by">by. PixelRooM</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;justify-content:center;">
        <button class="btn primary big" id="start-btn">게임 시작</button>
        <button class="icon-btn" id="tutorial-btn" title="튜토리얼">📖</button>
        <button class="icon-btn" id="start-settings-btn" title="설정">⚙️</button>
      </div>
    </div>
  ```
  다음으로 교체(🏆 업적, 🎒 수집품 버튼 추가):
  ```html
    <div class="screen" id="screen-start">
      <div class="title-block">
        <div class="title-main">스트레이트<span>!</span></div>
        <div class="title-sub">(STRAIGHT!)</div>
        <div class="title-by">by. PixelRooM</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;">
        <button class="btn primary big" id="start-btn">게임 시작</button>
        <button class="icon-btn" id="tutorial-btn" title="튜토리얼">📖</button>
        <button class="icon-btn" id="achievements-btn" title="업적">🏆</button>
        <button class="icon-btn" id="collection-btn" title="수집품">🎒</button>
        <button class="icon-btn" id="start-settings-btn" title="설정">⚙️</button>
      </div>
    </div>
  ```

- [ ] **Step 2: `screen-achievements` HTML 블록 추가.** `#screen-win`의
  닫는 `</div>` 바로 뒤(`index.html:367` 부근, Task 2 이후 줄 재확인)에 추가:
  ```html
  <div class="screen hidden" id="screen-achievements">
    <h1 style="font-size:20px;">🏆 업적</h1>
    <div class="achv-list" id="achv-list"></div>
    <button class="btn" id="achv-back-btn">← 뒤로</button>
  </div>
  ```

- [ ] **Step 3: `switchScreen` 목록에 `"achievements"` 추가.** (`"collection"`은
  Task 7에서 추가한다 — `screen-collection` HTML이 아직 없는 상태에서 이 배열에
  넣으면 `$("screen-collection")`이 `null`이 되어 `classList.toggle`에서 에러가
  난다.) `index.html:621~625` 현재:
  ```js
  function switchScreen(name){
    ["start","avatar","mode","online-choice","room-create","join","lobby","count","order","game","win"].forEach(function(s){
      $("screen-"+s).classList.toggle("hidden", s!==name);
    });
  }
  ```
  다음으로 교체:
  ```js
  function switchScreen(name){
    ["start","avatar","mode","online-choice","room-create","join","lobby","count","order","game","win","achievements"].forEach(function(s){
      $("screen-"+s).classList.toggle("hidden", s!==name);
    });
  }
  ```

- [ ] **Step 4: 미리보기 렌더 헬퍼 + 목록 빌드 함수.** `openTutorialModal`
  함수 앞(Task 2/3에서 옮긴 헬퍼 함수들 뒤 아무 곳이나, 파일 흐름상
  `TUTORIAL_SLIDES` 선언 앞)에 추가:
  ```js
  function milestonePreviewHTML(m){
    if(m.kind==="avatar"){
      var ch = null;
      for(var i=0;i<CHARACTERS.length;i++){ if(CHARACTERS[i].name===m.label){ ch=CHARACTERS[i]; break; } }
      return "<span class=\"achv-preview\">"+(ch?avatarIconHTML(ch):"❓")+"</span>";
    }
    if(m.kind==="pattern"){
      var preset = null;
      for(var j=0;j<CARD_BACK_PRESETS.length;j++){ if(CARD_BACK_PRESETS[j].name===m.label){ preset=CARD_BACK_PRESETS[j]; break; } }
      return "<span class=\"achv-preview pattern-preview "+(preset?preset.cls:"")+"\"></span>";
    }
    if(m.kind==="border"){
      var b = null;
      for(var k=0;k<BORDER_PRESETS.length;k++){ if(BORDER_PRESETS[k].name===m.label){ b=BORDER_PRESETS[k]; break; } }
      return "<span class=\"achv-preview border-ring "+(b?b.cls:"")+"\"></span>";
    }
    return "<span class=\"achv-preview achv-title-chip\">"+m.label+"</span>";
  }
  function achievementGroupLabel(id){
    if(id.indexOf("win:")===0) return "🏆 승리 트랙";
    if(id.indexOf("games:")===0) return "🎮 판 수 트랙";
    if(id.indexOf("misc:")===0) return "✨ 기타 미션";
    return "📖 튜토리얼";
  }
  function renderAchievementsScreen(){
    var host = $("achv-list");
    host.innerHTML = "";
    var stats = loadStats();
    var groups = {};
    var order = [];
    UNLOCK_MILESTONES.forEach(function(m){
      var g = achievementGroupLabel(m.id);
      if(!groups[g]){ groups[g]=[]; order.push(g); }
      groups[g].push(m);
    });
    order.forEach(function(g){
      host.appendChild(el("div","achv-group-title", g));
      groups[g].forEach(function(m){
        var unlocked = straightUnlocks.indexOf(m.id)!==-1;
        var row = el("div","achv-row"+(unlocked?"":" locked"));
        row.appendChild(el("div","", milestonePreviewHTML(m)));
        var info = el("div","achv-info");
        info.appendChild(el("p","achv-label", m.label));
        info.appendChild(el("p","achv-cond", unlocked ? "달성" : m.hint(stats)+" 남음"));
        row.appendChild(info);
        host.appendChild(row);
      });
    });
  }
  ```

- [ ] **Step 5: 버튼 이벤트 연결.** `$("tutorial-btn").addEventListener(...)`
  블록 뒤에 추가:
  ```js
  $("achievements-btn").addEventListener("click", function(){
    sfxSelect();
    renderAchievementsScreen();
    switchScreen("achievements");
  });
  $("achv-back-btn").addEventListener("click", function(){
    sfxSelect();
    switchScreen("start");
  });
  ```

- [ ] **Step 6: CSS.** `.unlock-toast.hidden{...}` 규칙 뒤에 추가:
  ```css
  .achv-list{width:100%;max-width:420px;max-height:60vh;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding:4px;}
  .achv-group-title{font-size:12px;font-weight:700;color:var(--muted);margin:10px 0 2px;}
  .achv-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:var(--panel2);}
  .achv-row.locked{opacity:.55;}
  .achv-preview{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;font-size:18px;border-radius:50%;}
  .achv-title-chip{font-size:10px;background:rgba(255,215,107,.18);color:var(--accent);width:auto;padding:0 6px;border-radius:8px;}
  .achv-info{flex:1;min-width:0;}
  .achv-label{font-size:13px;font-weight:700;margin:0;}
  .achv-cond{font-size:11px;color:var(--muted);margin:1px 0 0;}
  ```

- [ ] **Step 7: 브라우저 수동 검증.** 로컬 dev 서버(포트 5205)에서 🏆 버튼을
  눌러 업적 화면이 열리는지, 31개 항목이 4개 그룹(승리/판수/기타/튜토리얼)으로
  묶여 스크롤되는지, 해금된 것과 안 된 것이 시각적으로 구분되는지(흐림),
  잠긴 항목에 "N승 남음" 같은 문구가 보이는지 확인. ← 뒤로 버튼이 시작화면으로
  돌아가는지 확인. 콘솔 에러 없는지 확인 후 서버를 끈다.

- [ ] **Step 8: 커밋**

```bash
git add index.html
git commit -m "feat: add achievements screen listing all 31 milestones by track"
```

---

## Task 7: 수집품 화면 + 칭호/테두리 장착 UI

**Files:**
- Modify: `index.html`(`switchScreen`에 `"collection"` 추가, 새
  `screen-collection` HTML+빌드 함수)

**Interfaces:**
- Consumes: Task 2의 카탈로그 배열, Task 5의 `getActiveTitle`/`setActiveTitle`/
  `getActiveBorder`/`setActiveBorder`/`isTitleUnlocked`/`isBorderUnlocked`.
- Produces: `renderCollectionScreen()`.

- [ ] **Step 1: `switchScreen` 목록에 `"collection"` 추가.** Task 6 Step 3에서
  만든 배열:
  ```js
  ["start","avatar","mode","online-choice","room-create","join","lobby","count","order","game","win","achievements"]
  ```
  끝에 `"collection"`을 추가한다.

- [ ] **Step 2: `screen-collection` HTML.** `#screen-achievements` 블록
  뒤에 추가:
  ```html
  <div class="screen hidden" id="screen-collection">
    <h1 style="font-size:20px;">🎒 수집품</h1>
    <div class="coll-tabs" id="coll-tabs"></div>
    <div class="coll-grid" id="coll-grid"></div>
    <button class="btn" id="coll-back-btn">← 뒤로</button>
  </div>
  ```

- [ ] **Step 3: 빌드 함수.** `renderAchievementsScreen` 정의 뒤에 추가:
  ```js
  var COLLECTION_TABS = [
    { kind:"avatar", label:"아바타" },
    { kind:"pattern", label:"패턴" },
    { kind:"title", label:"칭호" },
    { kind:"border", label:"테두리" }
  ];
  var collectionActiveTab = "avatar";
  function collectionItemsFor(kind){
    if(kind==="avatar"){
      return CHARACTERS.map(function(ch){
        return { id:"avatar:"+ch.name, name:ch.name, unlocked:isAvatarUnlocked(ch.name, straightUnlocks), preview:"<span class=\"achv-preview\">"+avatarIconHTML(ch)+"</span>" };
      });
    }
    if(kind==="pattern"){
      return CARD_BACK_PRESETS.map(function(p){
        return { id:"pattern:"+p.id, name:p.name, unlocked:isPatternUnlocked(p.id, straightUnlocks), preview:"<span class=\"achv-preview pattern-preview "+p.cls+"\"></span>" };
      });
    }
    if(kind==="title"){
      return TITLE_PRESETS.map(function(t){
        return { id:t.id, name:t.name, unlocked:isTitleUnlocked(t.id, straightUnlocks), preview:"<span class=\"achv-preview achv-title-chip\">"+t.name+"</span>" };
      });
    }
    return BORDER_PRESETS.map(function(b){
      return { id:b.id, name:b.name, unlocked:isBorderUnlocked(b.id, straightUnlocks), preview:"<span class=\"achv-preview border-ring "+b.cls+"\"></span>" };
    });
  }
  function renderCollectionScreen(){
    var tabsHost = $("coll-tabs");
    tabsHost.innerHTML = "";
    COLLECTION_TABS.forEach(function(t){
      var b = el("button","btn coll-tab"+(t.kind===collectionActiveTab?" primary":""), t.label);
      b.addEventListener("click", function(){
        collectionActiveTab = t.kind;
        sfxSelect();
        renderCollectionScreen();
      });
      tabsHost.appendChild(b);
    });
    var grid = $("coll-grid");
    grid.innerHTML = "";
    var items = collectionItemsFor(collectionActiveTab);
    var canEquip = collectionActiveTab==="title" || collectionActiveTab==="border";
    var activeId = collectionActiveTab==="title" ? getActiveTitle() : (collectionActiveTab==="border" ? getActiveBorder() : null);
    items.forEach(function(it){
      var card = el("div","coll-item"+(it.unlocked?"":" locked")+(canEquip && it.unlocked && activeId===it.id ? " equipped" : ""));
      card.appendChild(el("div","", it.preview));
      card.appendChild(el("p","coll-item-name", it.name));
      if(!it.unlocked){
        card.appendChild(el("p","coll-item-state","🔒 미보유"));
      } else if(canEquip){
        var btn = el("button","btn"+(activeId===it.id?" primary":""), activeId===it.id?"장착 중":"장착");
        btn.addEventListener("click", function(){
          if(collectionActiveTab==="title") setActiveTitle(it.id); else setActiveBorder(it.id);
          sfxSelect();
          renderCollectionScreen();
        });
        card.appendChild(btn);
      } else {
        card.appendChild(el("p","coll-item-state","보유"));
      }
      grid.appendChild(card);
    });
  }
  ```

- [ ] **Step 4: 버튼 이벤트 연결.** `$("achv-back-btn").addEventListener(...)`
  블록 뒤에 추가:
  ```js
  $("collection-btn").addEventListener("click", function(){
    sfxSelect();
    collectionActiveTab = "avatar";
    renderCollectionScreen();
    switchScreen("collection");
  });
  $("coll-back-btn").addEventListener("click", function(){
    sfxSelect();
    switchScreen("start");
  });
  ```

- [ ] **Step 5: CSS.** `.achv-cond{...}` 규칙 뒤에 추가:
  ```css
  .coll-tabs{display:flex;gap:6px;margin:8px 0;flex-wrap:wrap;justify-content:center;}
  .coll-tab{font-size:12px;padding:6px 12px;}
  .coll-grid{width:100%;max-width:480px;max-height:55vh;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fit, minmax(100px, 1fr));gap:8px;padding:4px;}
  .coll-item{background:var(--panel2);border-radius:10px;padding:10px 6px;display:flex;flex-direction:column;align-items:center;gap:6px;}
  .coll-item.locked{opacity:.45;}
  .coll-item.equipped{border:2px solid var(--accent);}
  .coll-item-name{font-size:11.5px;font-weight:700;margin:0;}
  .coll-item-state{font-size:10px;color:var(--muted);margin:0;}
  ```

- [ ] **Step 6: 브라우저 수동 검증.** 로컬 dev 서버(포트 5206)에서:
  1. `localStorage.clear(); localStorage.setItem('straightUnlocks', JSON.stringify(['win:20','misc:streak10']));`
     후 새로고침, 🎒 버튼 클릭 — 4개 탭(아바타/패턴/칭호/테두리) 전환 확인.
  2. 칭호 탭에서 "초보"(해금됨)에 "장착" 버튼이 있는지, 눌렀을 때 "장착 중"으로
     바뀌는지 확인. 테두리 탭에서 "불꽃"도 동일하게 확인.
  3. 시작 화면 → 아바타 선택 화면으로 가서 내 캐릭터 이름 옆에 "〈초보〉"와
     불꽃 테두리가 실제로 보이는지 확인(Task 5의 결과와 연결됨을 검증).
  4. 아바타/패턴 탭은 장착 버튼 없이 보유 현황만 보이는지 확인(아바타/패턴은
     각자의 기존 화면에서 장착).
  5. 콘솔 에러 없는지 확인 후 서버를 끈다.

- [ ] **Step 7: 커밋**

```bash
git add index.html
git commit -m "feat: add collection screen with title and border equip UI"
```

---

## Task 8: 전체 통합 검증

**Files:** 없음(읽기 전용 검증 — 발견되는 문제가 있으면 그 자리에서 고친다).

- [ ] **Step 1: 신규 플레이어 종단 시나리오.** `localStorage.clear()` 후
  새로고침. 아바타 4/11, 패턴 4/12만 해금 상태인지, 업적 화면에 31개 항목이
  전부 뜨는지, 수집품 화면 4개 탭이 전부 동작하는지, 튜토리얼을 끝까지 보면
  `pattern:diagonal`(다이애그널)이 해금되고 토스트가 뜨는지(다음 게임
  종료 시점에 `pendingUnlocks`가 소비되므로, 튜토리얼 직후가 아니라 한 판
  끝난 뒤 토스트가 뜬다는 점 확인 — 즉시 토스트를 원한다면 Task 3에서
  `recordTutorialDone()` 직후 별도 알림을 추가해야 하는데, 이 플랜 범위에서는
  "다음 승리/무승부 화면에서 함께 표시"로 충분한지 실제로 확인하고, 만약
  사용자 경험상 너무 늦다고 판단되면 이 Step에서 즉시-토스트 여부를 컨트롤러가
  판단해 리포트에 기록한다).

- [ ] **Step 2: 기존 플레이어 마이그레이션 종단 시나리오.** `localStorage.clear();
  localStorage.setItem("straightNickname","테스터");` 후 새로고침 —
  `straightUnlocks`에 31개 id가 전부 들어있는지, 잠금 화면 어디에도 🔒가 없는지
  확인.

- [ ] **Step 3: 미션 다양성 스팟체크.** 디버그 훅 없이 실제 플레이로 최소
  2가지 미션을 직접 재현해본다: (a) 무승부를 1회 만들어 `draws` 카운터가
  오르는지, (b) 어려움 난이도로 1승해 `hardWins`가 오르는지. 나머지(연승,
  10-J-Q-K-A, 4색, 빅핸드, 온라인 계열)는 Task 3 Step 8에서 이미 함수 단위로
  검증했으므로 여기서는 재확인만 하고 반복 플레이로 소모하지 않는다.

- [ ] **Step 4: 온라인 멀티플레이 경로 회귀 확인.** 두 브라우저 탭으로 방
  만들기 → 참가 → 게임 진행 → 승리 시 양쪽 탭 모두 `games`가 정확히 1회씩
  오르고, 이긴 쪽만 `wins`/`winStreak`가 오르는지 확인. 콘솔 에러 없는지 확인.

- [ ] **Step 5: 최종 커밋(발견된 수정이 있었던 경우에만).**

```bash
git add index.html
git commit -m "fix: address integration issues found in achievements system verification"
```
