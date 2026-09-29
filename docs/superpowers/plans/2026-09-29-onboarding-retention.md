# 온보딩/리텐션 (D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 신규 플레이어에게 선택적 튜토리얼 캐러셀을 제공하고, 누적 플레이/승리
기반으로 아바타와 카드 뒷면 패턴을 점진적으로 해금하는 리텐션 장치를 추가한다.

**Architecture:** 단일 파일(`index.html`, IIFE vanilla JS, 빌드 스텝 없음)에
순차적으로 패치를 쌓는다. `localStorage`만으로 상태를 유지하는 이 프로젝트의
기존 패턴(`straightNickname`, `straightCardTheme`, `straightArtPreset`)을
그대로 따라 `straightStats`(승/판 카운터)와 `straightUnlocks`(해금된 항목 id
배열) 두 키를 추가한다. DOM에 의존하지 않는 순수 로직(마일스톤 판정)은
`node -e`로 독립 검증하고, `localStorage` 읽기/쓰기 및 UI(잠금 표시, 토스트,
튜토리얼 모달)는 로컬 dev 서버(`.claude/launch.json`의 `straight-game` 설정,
포트 5175)에서 브라우저로 수동 검증한다 — 이 프로젝트의 기존 개발 방식과 동일.

**Tech Stack:** Vanilla JS(ES5 스타일), 순수 HTML/CSS, Node.js(로직 검증용
스크립트 실행에만 사용).

**Spec:** [docs/superpowers/specs/2026-09-28-onboarding-retention-design.md](../specs/2026-09-28-onboarding-retention-design.md)

## Global Constraints

- 빌드 스텝을 추가하지 않는다 — 여전히 단일 `index.html` 파일로 완결.
- 기존 코드 스타일(ES5 `function`, `var`, `el()`/`$()` 헬퍼, `try{...}catch(e){}`로
  감싼 모든 `localStorage` 호출)을 그대로 따른다.
- 온라인 멀티플레이(Firestore 동기화) 경로를 깨뜨리지 않는다.
- **스펙과의 차이(이 계획에서 확정한 사항 — 구현 시 스펙 대신 이 문서를 따를 것):**
  1. 스펙 작성 이후 카드 랭크 체계가 1~10에서 13랭크(A,2~10,J,Q,K)로 바뀌었고,
     "연속 캡처 콤보 보너스"는 이번 세션에서 완전히 삭제되었다. 튜토리얼 콘텐츠는
     스펙 원문이 아니라 이 계획의 Task 5에 적힌 **현재 규칙 기준** 문구를 그대로 쓴다.
  2. 스펙은 조커를 "와일드카드로 아무 바닥 카드나 가져올 수 있다"고 설명하지만
     이는 더 이상 사실이 아니다. 현재 손패 조커는 캡처에 전혀 쓸 수 없고, 턴을
     소모하지 않고 점수덱에 내려놓아(`bankJoker`) 스트레이트의 빈 자리를
     채우는 용도로만 쓰인다. 튜토리얼은 이 동작을 설명한다.
  3. 스펙에 없던 프리즘카드(색상 무관, 랭크 7 고정)를 튜토리얼에 별도 슬라이드로
     추가한다(Task 5의 슬라이드 4) — 현재 게임의 핵심 규칙인데 스펙에 반영이
     안 되어 있어 빠지면 튜토리얼이 불완전해진다.
  4. 스펙은 "나머지 6아바타 + 5패턴"(11개)을 해금 대상으로 정의했지만 예시로 든
     임계값은 10개("1/2/3/5/8/12/18/25/35/50")뿐이다. 이 계획은 같은 증가
     패턴을 이어 11번째 임계값(승수 65 / 게임수 195)을 추가해 11개를 맞춘다
     (Task 1의 `UNLOCK_MILESTONES` 참고).
  5. 해금 id는 배열 인덱스가 아니라 안정적인 의미값으로 키잉한다 — 아바타는
     `"avatar:"+캐릭터이름`(이름은 고유하고 절대 안 바뀜), 패턴은 이미 존재하는
     `CARD_BACK_PRESETS[i].id`를 그대로 쓴 `"pattern:"+preset.id`. 배열 순서가
     나중에 바뀌어도 이미 저장된 해금 기록이 깨지지 않는다.
  6. 온라인 멀티플레이에서 "게임 종료"는 **로컬 클라이언트 기준으로 정확히 한 번만**
     기록해야 한다. `checkWin`/`declareDraw`는 그 액션을 실행한 클라이언트에서만
     불리고, 다른 클라이언트는 `applyRemoteRoomState`의 동기화 분기에서 결과를
     통보받는다 — 이 세 지점 모두에서 게임 결과를 기록하되 `state.statsRecorded`
     플래그로 중복 기록을 막는다(Task 2에서 상세 구현).

---

## Task 1: 진행도/해금 데이터 레이어 (순수 로직)

**Files:**
- Modify: `index.html` — `CARD_BACK_PRESETS` 선언(약 396번째 줄) 바로 뒤에
  새 블록 삽입.

**Interfaces:**
- Consumes: 기존 `CHARACTERS`(8개, `name` 필드로 식별), 기존
  `CARD_BACK_PRESETS`(7개, 이미 `id` 필드 보유).
- Produces: `UNLOCK_MILESTONES`(배열), `UNLOCK_STARTER_AVATARS`,
  `UNLOCK_STARTER_PATTERNS`, `loadStats()`, `saveStats(stats)`,
  `loadUnlocksRaw()`, `saveUnlocks(list)`, `isExistingPlayer()`,
  `initUnlocksIfNeeded()`, `isAvatarUnlocked(name, unlocks)`,
  `isPatternUnlocked(id, unlocks)`, `checkUnlocks(stats, unlocks)`,
  `recordGameResult(won)` — Task 2가 그대로 호출한다.

- [ ] **Step 1: `index.html`의 `CARD_BACK_PRESETS` 선언(현재 388~396번째 줄)
  바로 뒤, `var backPresetIndex = 0;` 앞에 다음 블록을 삽입한다:**

```js
/* ---------------- progress / unlocks ---------------- */

var UNLOCK_STARTER_AVATARS = ["허니뱅","고양이 예언자"];
var UNLOCK_STARTER_PATTERNS = ["stripe","zigzag"];

var UNLOCK_MILESTONES = [
  { winsRequired:1,  gamesRequired:3,   kind:"avatar",  id:"avatar:바코드 라이언", label:"바코드 라이언" },
  { winsRequired:2,  gamesRequired:6,   kind:"avatar",  id:"avatar:메가블록",     label:"메가블록" },
  { winsRequired:3,  gamesRequired:9,   kind:"pattern", id:"pattern:argyle",     label:"아가일" },
  { winsRequired:5,  gamesRequired:15,  kind:"avatar",  id:"avatar:카이저 핑",    label:"카이저 핑" },
  { winsRequired:8,  gamesRequired:24,  kind:"pattern", id:"pattern:diamond",    label:"다이아몬드" },
  { winsRequired:12, gamesRequired:36,  kind:"avatar",  id:"avatar:매드독",      label:"매드독" },
  { winsRequired:18, gamesRequired:54,  kind:"pattern", id:"pattern:honeycomb",  label:"허니콤" },
  { winsRequired:25, gamesRequired:75,  kind:"avatar",  id:"avatar:크러셔 루",   label:"크러셔 루" },
  { winsRequired:35, gamesRequired:105, kind:"pattern", id:"pattern:diagonal",   label:"다이애그널" },
  { winsRequired:50, gamesRequired:150, kind:"avatar",  id:"avatar:스파크 렉스", label:"스파크 렉스" },
  { winsRequired:65, gamesRequired:195, kind:"pattern", id:"pattern:ripple",     label:"리플" }
];

function loadStats(){
  try{
    var raw = localStorage.getItem("straightStats");
    if(!raw) return { wins:0, games:0 };
    var parsed = JSON.parse(raw);
    return { wins:parsed.wins||0, games:parsed.games||0 };
  }catch(e){ return { wins:0, games:0 }; }
}
function saveStats(stats){
  try{ localStorage.setItem("straightStats", JSON.stringify(stats)); }catch(e){}
}
function loadUnlocksRaw(){
  try{
    var raw = localStorage.getItem("straightUnlocks");
    return raw===null ? null : JSON.parse(raw);
  }catch(e){ return null; }
}
function saveUnlocks(list){
  try{ localStorage.setItem("straightUnlocks", JSON.stringify(list)); }catch(e){}
}
function isExistingPlayer(){
  try{
    return localStorage.getItem("straightNickname")!==null || localStorage.getItem("straightCardTheme")!==null;
  }catch(e){ return false; }
}
function initUnlocksIfNeeded(){
  var existing = loadUnlocksRaw();
  if(existing!==null) return existing;
  var initial = isExistingPlayer() ? UNLOCK_MILESTONES.map(function(m){ return m.id; }) : [];
  saveUnlocks(initial);
  return initial;
}
function isAvatarUnlocked(name, unlocks){
  if(UNLOCK_STARTER_AVATARS.indexOf(name)!==-1) return true;
  return unlocks.indexOf("avatar:"+name)!==-1;
}
function isPatternUnlocked(id, unlocks){
  if(UNLOCK_STARTER_PATTERNS.indexOf(id)!==-1) return true;
  return unlocks.indexOf("pattern:"+id)!==-1;
}
function checkUnlocks(stats, unlocks){
  var updated = unlocks.slice();
  var newly = [];
  UNLOCK_MILESTONES.forEach(function(m){
    if(updated.indexOf(m.id)!==-1) return;
    if(stats.wins>=m.winsRequired || stats.games>=m.gamesRequired){
      updated.push(m.id);
      newly.push(m);
    }
  });
  return { updated:updated, newly:newly };
}
function recordGameResult(won){
  var stats = loadStats();
  stats.games++;
  if(won) stats.wins++;
  saveStats(stats);
  var result = checkUnlocks(stats, straightUnlocks);
  straightUnlocks = result.updated;
  saveUnlocks(straightUnlocks);
  return result.newly;
}

var straightUnlocks = initUnlocksIfNeeded();
```

- [ ] **Step 2: 순수 로직(`checkUnlocks`, `isAvatarUnlocked`,
  `isPatternUnlocked`) 검증 — `localStorage`가 필요 없는 부분만 발췌해
  독립 실행한다.** 아래 스크립트를 그대로 실행:

```bash
node -e "
function checkUnlocks(stats, unlocks){
  var UNLOCK_MILESTONES = [
    { winsRequired:1, gamesRequired:3, id:'avatar:바코드 라이언' },
    { winsRequired:2, gamesRequired:6, id:'avatar:메가블록' },
    { winsRequired:3, gamesRequired:9, id:'pattern:argyle' }
  ];
  var updated = unlocks.slice();
  var newly = [];
  UNLOCK_MILESTONES.forEach(function(m){
    if(updated.indexOf(m.id)!==-1) return;
    if(stats.wins>=m.winsRequired || stats.games>=m.gamesRequired){
      updated.push(m.id);
      newly.push(m);
    }
  });
  return { updated:updated, newly:newly };
}
// case 1: 승수 미달이지만 게임수로 먼저 도달
var r1 = checkUnlocks({wins:0, games:3}, []);
console.assert(r1.newly.length===1 && r1.newly[0].id==='avatar:바코드 라이언', 'case1 실패: '+JSON.stringify(r1));
// case 2: 이미 해금된 항목은 다시 newly에 안 들어감
var r2 = checkUnlocks({wins:5, games:5}, ['avatar:바코드 라이언']);
console.assert(r2.newly.length===1 && r2.newly[0].id==='avatar:메가블록', 'case2 실패: '+JSON.stringify(r2));
console.assert(r2.updated.indexOf('avatar:바코드 라이언')!==-1, 'case2 기존 해금 유지 실패');
// case 3: 아무 조건도 못 채우면 newly 비어있음
var r3 = checkUnlocks({wins:0, games:0}, []);
console.assert(r3.newly.length===0, 'case3 실패: '+JSON.stringify(r3));
console.log('모든 케이스 통과');
"
```

  Expected: `모든 케이스 통과` 출력, 에러 없음.

- [ ] **Step 3: 마이그레이션 로직(`isExistingPlayer`+`initUnlocksIfNeeded`)
  수동 점검 — 브라우저 devtools 콘솔이 아니라 코드 리딩으로 확인.** 다음을
  확인하고 체크한다: `isExistingPlayer()`가 `straightNickname` 또는
  `straightCardTheme` 중 하나라도 있으면 `true`를 반환하는지, `initUnlocksIfNeeded()`가
  `existing!==null`일 때(이미 초기화됨) 그대로 반환하고 새로 `saveUnlocks`를
  호출하지 않는지(재실행 시 값을 덮어쓰지 않도록).

- [ ] **Step 4: 커밋**

```bash
git add index.html
git commit -m "feat: add progress tracking and unlock data layer for onboarding retention"
```

---

## Task 2: 게임 종료 훅 연결 + 해금 토스트 UI

**Files:**
- Modify: `index.html`
  - `state` 초기 선언 (현재 `winnerIndex: null,` 줄, 약 740번째 줄)
  - `checkWin(playerIdx)` (약 1491번째 줄)
  - `declareDraw()` (약 1459번째 줄)
  - `applyRemoteRoomState(data)` 의 게임오버 동기화 분기 (약 860~872번째 줄)
  - `startOnlineGame()`의 상태 리셋 블록 (약 1040~1044번째 줄)
  - `runOrderCutscene()`의 상태 리셋 블록 (약 1358~1362번째 줄)
  - `showWinScreen(player, straight)` / `showDrawScreen()` (약 1483, 1569번째 줄)
  - `#screen-win` HTML (약 341~346번째 줄)

**Interfaces:**
- Consumes: Task 1의 `recordGameResult(won)`.
- Produces: `state.statsRecorded`(boolean), `pendingUnlocks`(모듈 스코프
  배열) — Task 3/4는 이 태스크가 만든 `straightUnlocks` 갱신 흐름에만
  의존하고 직접 호출할 필요 없음.

- [ ] **Step 1: `state` 초기 선언에 플래그 추가.** 현재:
  ```js
  mpMaxPlayers: 4,
  winnerIndex: null,
  ```
  다음으로 교체:
  ```js
  mpMaxPlayers: 4,
  winnerIndex: null,
  statsRecorded: false,
  ```

- [ ] **Step 2: 게임 시작 시 플래그 리셋 — `startOnlineGame()`.** 현재:
  ```js
  state.turnSeq = 0;
  state.noProgressStreak = 0;
  state.aiDifficulty = chosenAiDifficulty;
  ```
  다음으로 교체:
  ```js
  state.turnSeq = 0;
  state.noProgressStreak = 0;
  state.statsRecorded = false;
  state.aiDifficulty = chosenAiDifficulty;
  ```

- [ ] **Step 3: 게임 시작 시 플래그 리셋 — `runOrderCutscene()`이 호출하는
  솔로 게임 초기화 블록.** 현재:
  ```js
  state.turnSeq = 0;
  state.noProgressStreak = 0;
  aiDriveGuard = {};
  ```
  다음으로 교체:
  ```js
  state.turnSeq = 0;
  state.noProgressStreak = 0;
  state.statsRecorded = false;
  aiDriveGuard = {};
  ```

- [ ] **Step 4: 공용 헬퍼 추가.** Task 1에서 추가한 `recordGameResult` 함수
  바로 뒤에 다음을 추가한다:
  ```js
  var pendingUnlocks = [];
  function maybeRecordLocalGameResult(won){
    if(state.statsRecorded) return;
    state.statsRecorded = true;
    pendingUnlocks = recordGameResult(won);
  }
  ```

- [ ] **Step 5: `checkWin(playerIdx)`에 훅 연결.** 현재(약 1491~1508번째 줄):
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
      playWinCeremony(playerIdx, straight, function(){
        showWinScreen(player, straight);
      });
      return true;
    }
    return false;
  }
  ```
  `pushRoomState();` 다음 줄에 한 줄 추가:
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

- [ ] **Step 6: `declareDraw()`에 훅 연결.** 현재:
  ```js
  function declareDraw(){
    state.gameOver = true;
    state.isDraw = true;
    state.winnerIndex = null;
    state.winnerStraight = null;
    state.ceremonyShown = true;
    clearTurnTimer();
    pushLog("🤝 중앙 덱이 모두 소진되어 무승부로 게임이 종료되었습니다.");
    render();
    pushRoomState();
    setTimeout(showDrawScreen, 1000);
  }
  ```
  `pushRoomState();` 다음 줄에 추가:
  ```js
  function declareDraw(){
    state.gameOver = true;
    state.isDraw = true;
    state.winnerIndex = null;
    state.winnerStraight = null;
    state.ceremonyShown = true;
    clearTurnTimer();
    pushLog("🤝 중앙 덱이 모두 소진되어 무승부로 게임이 종료되었습니다.");
    render();
    pushRoomState();
    maybeRecordLocalGameResult(false);
    setTimeout(showDrawScreen, 1000);
  }
  ```

- [ ] **Step 7: `applyRemoteRoomState(data)`의 동기화 분기에 훅 연결
  (다른 클라이언트가 승패를 통보받는 경로 — 온라인 멀티플레이 전용).**
  현재(약 860~872번째 줄):
  ```js
    if(state.gameOver && !wasOver && !state.ceremonyShown){
      state.ceremonyShown = true;
      if(state.isDraw){
        setTimeout(showDrawScreen, 800);
      } else {
        var winner = state.players[state.winnerIndex];
        if(winner && state.winnerStraight){
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
  이렇게 세 지점(`checkWin`, `declareDraw`, `applyRemoteRoomState`) 모두
  `maybeRecordLocalGameResult`를 부르지만, `state.statsRecorded` 플래그가
  매 게임당 정확히 한 번만 실제로 기록되게 막아준다 — 액션을 실행한
  클라이언트 자신도 Firestore 스냅샷을 되돌려받아 이 분기를 다시 탈 수 있기
  때문에 이 가드가 없으면 중복 카운트된다.

- [ ] **Step 8: 승리/무승부 화면에 해금 토스트 DOM 추가.** `#screen-win`
  현재(약 341~346번째 줄):
  ```html
    <div class="screen hidden" id="screen-win">
      <div class="win-emoji">🏆</div>
      <h1 id="win-title" style="font-size:24px;"></h1>
      <p class="sub" id="win-reason"></p>
      <button class="btn primary big" id="restart-btn">다시하기</button>
    </div>
  ```
  다음으로 교체:
  ```html
    <div class="screen hidden" id="screen-win">
      <div class="win-emoji">🏆</div>
      <h1 id="win-title" style="font-size:24px;"></h1>
      <p class="sub" id="win-reason"></p>
      <div class="unlock-toast hidden" id="unlock-toast"></div>
      <button class="btn primary big" id="restart-btn">다시하기</button>
    </div>
  ```

- [ ] **Step 9: 토스트 렌더 헬퍼 추가 + 양쪽 화면 함수에서 호출.**
  `showDrawScreen`/`showWinScreen` 바로 위에 헬퍼를 추가하고, 두 함수
  끝에서 호출한다. 현재:
  ```js
  function showDrawScreen(){
    var emojiEl = document.querySelector(".win-emoji");
    if(emojiEl) emojiEl.textContent = "🤝";
    $("win-title").innerHTML = "무승부";
    $("win-reason").textContent = "중앙 덱이 모두 소진되어 승부를 가리지 못했습니다.";
    switchScreen("win");
  }
  ```
  다음으로 교체(헬퍼 추가 + 호출):
  ```js
  function renderUnlockToast(){
    var toast = $("unlock-toast");
    if(pendingUnlocks.length===0){
      toast.classList.add("hidden");
      toast.innerHTML = "";
      return;
    }
    var lines = pendingUnlocks.map(function(m){
      var kindLabel = m.kind==="avatar" ? "새 아바타" : "새 카드 뒷면";
      return "🎉 "+kindLabel+" 해금: "+m.label;
    });
    toast.innerHTML = lines.join("<br>");
    toast.classList.remove("hidden");
    pendingUnlocks = [];
  }

  function showDrawScreen(){
    var emojiEl = document.querySelector(".win-emoji");
    if(emojiEl) emojiEl.textContent = "🤝";
    $("win-title").innerHTML = "무승부";
    $("win-reason").textContent = "중앙 덱이 모두 소진되어 승부를 가리지 못했습니다.";
    switchScreen("win");
    renderUnlockToast();
  }
  ```
  그리고 `showWinScreen(player, straight)` 현재:
  ```js
  function showWinScreen(player, straight){
    var reason = COLOR_NAMES[straight.color]+" 스트레이트 ("+straightRangeLabel(straight)+") 완성!";
    $("win-title").innerHTML = player.avatar+" "+player.name+" 승리!";
    $("win-reason").textContent = "🎉 스트레이트! · "+reason;
    switchScreen("win");
    var emojiEl = document.querySelector(".win-emoji");
    if(emojiEl){
      emojiEl.textContent = "🏆";
      emojiEl.classList.remove("bounce-in");
      void emojiEl.offsetWidth;
      emojiEl.classList.add("bounce-in");
    }
    spawnConfetti();
  }
  ```
  `spawnConfetti();` 다음 줄에 `renderUnlockToast();` 추가.

- [ ] **Step 10: CSS 추가.** `.win-emoji.bounce-in{...}` 규칙(약 206번째 줄)
  바로 뒤에 추가:
  ```css
  .unlock-toast{margin-top:10px;padding:8px 14px;border-radius:10px;background:rgba(255,215,107,.15);border:1px solid var(--accent);color:var(--accent);font-size:12.5px;font-weight:700;line-height:1.5;}
  .unlock-toast.hidden{display:none;}
  ```

- [ ] **Step 11: 브라우저 수동 검증.** 로컬 dev 서버(포트 5175)에서:
  1. devtools 콘솔에서 `localStorage.clear()` 실행 후 새로고침 (완전 신규
     플레이어 시뮬레이션).
  2. 솔로 1인 AI 난이도 "쉬움"으로 게임 시작, 브라우저 콘솔에서
     `localStorage.setItem('straightStats', JSON.stringify({wins:0, games:2}))`로
     미리 게임 수를 채워둔 뒤 게임을 이겨서 3번째 게임을 완료 — 승리 화면에
     "🎉 새 아바타 해금: 바코드 라이언" 토스트가 보이는지 확인.
  3. `localStorage.getItem('straightStats')`로 wins/games가 정확히 반영됐는지 확인.
  4. 무승부(중앙 덱 소진)로 게임을 끝내도 games는 증가하고 wins는 증가하지
     않는지 확인 — 중앙덱을 빨리 비우려면 콘솔에서
     `document.title` 등으로 game state에 접근할 순 없으므로(IIFE 스코프),
     대신 게임을 몇 판 반복 플레이해서 games 카운터가 매 판마다 정확히 1씩
     느는지로 검증한다.

- [ ] **Step 12: 커밋**

```bash
git add index.html
git commit -m "feat: hook stats tracking and unlock toast into win/draw flow"
```

---

## Task 3: 아바타 피커 잠금 UI (솔로 모드 `screen-avatar`)

**Files:**
- Modify: `index.html` — 아바타 그리드 생성 블록(약 1061~1073번째 줄).

**Interfaces:**
- Consumes: Task 1의 `straightUnlocks`(모듈 스코프 var), `isAvatarUnlocked`,
  `UNLOCK_MILESTONES`, Task 1의 `loadStats`.
- Produces: 없음(터미널 UI).

- [ ] **Step 1: 남은 조건 문자열 헬퍼 추가.** 아바타 그리드 생성 블록
  바로 앞에 추가:
  ```js
  function unlockHintText(id){
    var m = null;
    for(var i=0;i<UNLOCK_MILESTONES.length;i++){ if(UNLOCK_MILESTONES[i].id===id){ m=UNLOCK_MILESTONES[i]; break; } }
    if(!m) return "";
    var stats = loadStats();
    var remainWins = Math.max(0, m.winsRequired - stats.wins);
    var remainGames = Math.max(0, m.gamesRequired - stats.games);
    return "🔒 승리 "+remainWins+"회 또는 플레이 "+remainGames+"판 후 해금";
  }
  ```

- [ ] **Step 2: 아바타 그리드 생성 로직 수정.** 현재(약 1061~1073번째 줄):
  ```js
  var avatarGrid = $("avatar-grid");
  CHARACTERS.forEach(function(ch){
    var b = el("button","avatar-btn");
    b.innerHTML = "<span>"+avatarIconHTML(ch)+"</span><span class=\"nm\">"+ch.name+"</span>";
    b.addEventListener("click", function(){
      sfxSelect();
      Array.prototype.forEach.call(avatarGrid.children, function(c){ c.classList.remove("selected"); });
      b.classList.add("selected");
      chosenCharacter = ch;
      $("avatar-next-btn").disabled = false;
    });
    avatarGrid.appendChild(b);
  });
  ```
  다음으로 교체:
  ```js
  var avatarGrid = $("avatar-grid");
  CHARACTERS.forEach(function(ch){
    var unlocked = isAvatarUnlocked(ch.name, straightUnlocks);
    var b = el("button","avatar-btn"+(unlocked?"":" locked"));
    b.innerHTML = "<span>"+avatarIconHTML(ch)+"</span><span class=\"nm\">"+ch.name+"</span>";
    if(!unlocked){
      b.title = unlockHintText("avatar:"+ch.name);
      b.disabled = true;
    } else {
      b.addEventListener("click", function(){
        sfxSelect();
        Array.prototype.forEach.call(avatarGrid.children, function(c){ c.classList.remove("selected"); });
        b.classList.add("selected");
        chosenCharacter = ch;
        $("avatar-next-btn").disabled = false;
      });
    }
    avatarGrid.appendChild(b);
  });
  ```
  (`b`는 `<button>` 엘리먼트이므로 `disabled = true`가 네이티브 클릭/키보드
  포커스를 모두 막아준다 — 별도 `pointer-events` 처리 불필요.)

- [ ] **Step 3: CSS 추가.** `.avatar-btn.selected{...}` 규칙(약 64번째 줄)
  바로 뒤에 추가:
  ```css
  .avatar-btn.locked{position:relative;opacity:.42;filter:grayscale(.7);cursor:not-allowed;}
  .avatar-btn.locked::after{content:"🔒";position:absolute;top:4px;right:6px;font-size:13px;}
  ```

- [ ] **Step 4: 브라우저 수동 검증.** `localStorage.clear()` 후 새로고침,
  솔로 모드로 아바타 선택 화면 진입 — 8개 중 2개(허니뱅, 고양이 예언자)만
  선택 가능하고 나머지 6개는 흐릿하게 자물쇠 아이콘과 함께 표시되며 클릭이
  안 먹히는지 확인. 잠긴 아바타에 마우스를 올리면 브라우저 기본 title
  툴팁으로 "🔒 승리 N회 또는 플레이 M판 후 해금"이 뜨는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add index.html
git commit -m "feat: lock unearned avatars in solo avatar picker"
```

---

## Task 4: 카드 뒷면 패턴 잠금 UI (설정 모달)

**Files:**
- Modify: `index.html` — `openSettingsModal()` 안의 `CARD_BACK_PRESETS`
  그리드 생성 블록.

**Interfaces:**
- Consumes: Task 1의 `straightUnlocks`, `isPatternUnlocked`,
  Task 3의 `unlockHintText`.
- Produces: 없음(터미널 UI).

- [ ] **Step 1: 패턴 그리드 생성 로직 수정.** `openSettingsModal()` 안의
  현재 코드:
  ```js
  var artLabel = el("div","section-label","🎨 카드 뒷면");
  var artRow = el("div","swatch-grid");
  CARD_BACK_PRESETS.forEach(function(preset, i){
    var pb = el("button","swatch-btn"+(i===backPresetIndex?" primary":""));
    var preview = el("span","pattern-preview "+preset.cls);
    pb.appendChild(preview);
    pb.appendChild(el("span","pattern-name", preset.name));
    pb.addEventListener("click", function(){
      setBackPreset(i);
      Array.prototype.forEach.call(artRow.children, function(c){ c.classList.remove("primary"); });
      pb.classList.add("primary");
      sfxSelect();
    });
    artRow.appendChild(pb);
  });
  ```
  다음으로 교체:
  ```js
  var artLabel = el("div","section-label","🎨 카드 뒷면");
  var artRow = el("div","swatch-grid");
  CARD_BACK_PRESETS.forEach(function(preset, i){
    var unlocked = isPatternUnlocked(preset.id, straightUnlocks);
    var pb = el("button","swatch-btn"+(i===backPresetIndex?" primary":"")+(unlocked?"":" locked"));
    var preview = el("span","pattern-preview "+preset.cls);
    pb.appendChild(preview);
    pb.appendChild(el("span","pattern-name", preset.name));
    if(!unlocked){
      pb.title = unlockHintText("pattern:"+preset.id);
      pb.disabled = true;
    } else {
      pb.addEventListener("click", function(){
        setBackPreset(i);
        Array.prototype.forEach.call(artRow.children, function(c){ c.classList.remove("primary"); });
        pb.classList.add("primary");
        sfxSelect();
      });
    }
    artRow.appendChild(pb);
  });
  ```

- [ ] **Step 2: CSS 추가.** `.swatch-btn.primary{...}` 규칙(약 193번째 줄)
  바로 뒤에 추가:
  ```css
  .swatch-btn.locked{position:relative;opacity:.42;filter:grayscale(.7);cursor:not-allowed;}
  .swatch-btn.locked::after{content:"🔒";position:absolute;top:4px;right:6px;font-size:12px;}
  ```

- [ ] **Step 3: 브라우저 수동 검증.** 설정 모달을 열어 "카드 뒷면" 섹션에서
  7개 중 2개(스트라이프, 지그재그)만 선택 가능하고 나머지 5개는 흐릿하게
  자물쇠와 함께 표시되며 클릭이 안 먹히는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add index.html
git commit -m "feat: lock unearned card-back patterns in settings modal"
```

---

## Task 5: 튜토리얼 캐러셀

**Files:**
- Modify: `index.html`
  - `#screen-start` HTML (약 215~225번째 줄)
  - 새 함수 블록 (설정 모달 함수들 근처에 추가)
  - CSS 추가

**Interfaces:**
- Consumes: 기존 `el()`, `$()`, `cardEl(coin, opts)`, `closeModal()`,
  `switchScreen(name)`, `sfxSelect()`, `tooltipLayer`.
- Produces: `openTutorialModal()` — 다른 태스크가 의존하지 않는 독립 기능.

- [ ] **Step 1: 시작 화면에 튜토리얼 버튼 추가.** 현재(약 215~225번째 줄):
  ```html
    <div class="screen" id="screen-start">
      <div class="title-block">
        <div class="title-main">스트레이트<span>!</span></div>
        <div class="title-sub">(STRAIGHT!)</div>
        <div class="title-by">by. PixelRooM</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;justify-content:center;">
        <button class="btn primary big" id="start-btn">게임 시작</button>
        <button class="icon-btn" id="start-settings-btn" title="설정">⚙️</button>
      </div>
    </div>
  ```
  다음으로 교체:
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

- [ ] **Step 2: 튜토리얼 슬라이드 데이터 + 모달 함수 추가.**
  `function openSettingsModal(){` 정의 바로 앞에 다음 블록을 통째로 추가한다
  (현재 규칙 기준 — 13랭크, 프리즘카드, 조커=점수덱 전용, 콤보 없음):
  ```js
  var TUTORIAL_SLIDES = [
    {
      title: "🎯 목표",
      build: function(){
        var wrap = el("div","tutorial-slide-body");
        wrap.appendChild(el("p","tutorial-text","같은 색 카드로 5장 연속 숫자(스트레이트)를 가장 먼저 완성하면 즉시 승리합니다. 숫자는 A, 2~10, J, Q, K 순서입니다."));
        var row = el("div","tutorial-card-row");
        [3,4,5,6,7].forEach(function(v){
          row.appendChild(cardEl({ id:"tut-goal-"+v, color:"PINK", value:v }, { cls:"tiny" }));
        });
        wrap.appendChild(row);
        return wrap;
      }
    },
    {
      title: "🔄 턴마다 할 일",
      build: function(){
        var wrap = el("div","tutorial-slide-body");
        wrap.appendChild(el("p","tutorial-text","내 턴에는 둘 중 하나를 합니다.<br>① 손패 카드로 바닥 카드를 <b>가져오기(캡처)</b><br>② 가져올 카드가 없으면 중앙 덱에서 <b>2장 뽑기</b>"));
        return wrap;
      }
    },
    {
      title: "🎨 색상 + 숫자 매칭",
      build: function(){
        var wrap = el("div","tutorial-slide-body");
        wrap.appendChild(el("p","tutorial-text","손패 카드가 바닥 카드와 <b>같은 색이면서 숫자가 같거나 높으면</b> 가져올 수 있습니다.<br>숫자가 정확히 같으면 색이 달라도 가져올 수 있습니다."));
        var row = el("div","tutorial-card-row");
        row.appendChild(cardEl({ id:"tut-match-hand", color:"BLUE", value:9 }, { cls:"tiny" }));
        row.appendChild(el("span","tutorial-arrow","→"));
        row.appendChild(cardEl({ id:"tut-match-floor", color:"BLUE", value:6 }, { cls:"tiny" }));
        wrap.appendChild(row);
        return wrap;
      }
    },
    {
      title: "🌈 프리즘카드",
      build: function(){
        var wrap = el("div","tutorial-slide-body");
        wrap.appendChild(el("p","tutorial-text","색이 없는 특수 카드로 숫자는 항상 7입니다.<br>손패의 아무 7로나 가져올 수 있고, 점수덱에서는 검사 중인 모든 색의 7 자리로 동시에 인정됩니다."));
        var row = el("div","tutorial-card-row");
        row.appendChild(cardEl({ id:"tut-prism", isPrism:true, value:7, color:null }, { cls:"tiny" }));
        wrap.appendChild(row);
        return wrap;
      }
    },
    {
      title: "🃏 조커 사용법",
      build: function(){
        var wrap = el("div","tutorial-slide-body");
        wrap.appendChild(el("p","tutorial-text","조커는 캡처에는 쓸 수 없습니다.<br>대신 내 턴에 언제든(턴을 소모하지 않고) 점수덱에 내려놓을 수 있고, 스트레이트의 빈 자리를 색상·숫자 상관없이 채워줍니다.<br>손패에서 조커를 누르면 점수덱이 반짝이고, 그 자리를 누르면 내려놓습니다."));
        var row = el("div","tutorial-card-row");
        row.appendChild(cardEl({ id:"tut-joker", isJoker:true }, { cls:"tiny" }));
        wrap.appendChild(row);
        return wrap;
      }
    },
    {
      title: "⚠️ 바닥 조커 특수 규칙",
      build: function(){
        var wrap = el("div","tutorial-slide-body");
        wrap.appendChild(el("p","tutorial-text","바닥에 놓인 조커는 손패의 <b>A</b>로만 가져올 수 있습니다."));
        var row = el("div","tutorial-card-row");
        row.appendChild(cardEl({ id:"tut-floorjoker-a", color:"YELLOW", value:1 }, { cls:"tiny" }));
        row.appendChild(el("span","tutorial-arrow","→"));
        row.appendChild(cardEl({ id:"tut-floorjoker-j", isJoker:true }, { cls:"tiny" }));
        wrap.appendChild(row);
        return wrap;
      }
    },
    {
      title: "🏆 승리 조건",
      build: function(){
        var wrap = el("div","tutorial-slide-body");
        wrap.appendChild(el("p","tutorial-text","점수덱에 같은 색 5연속 숫자를 가장 먼저 완성하면 즉시 승리합니다.<br>아무도 완성하지 못한 채 중앙 덱이 모두 소진되면 무승부로 게임이 끝납니다."));
        return wrap;
      }
    }
  ];

  function openTutorialModal(){
    closeModal();
    var slideIdx = 0;
    var backdrop = el("div","modal-backdrop");
    var box = el("div","modal-box tutorial-box");
    var closeX = el("button","icon-btn tutorial-close","✖");
    closeX.addEventListener("click", function(){ closeModal(); });
    var titleEl = el("h2","");
    var bodyHost = el("div","");
    var dotsRow = el("div","tutorial-dots");
    var dots = TUTORIAL_SLIDES.map(function(){
      var d = el("span","tutorial-dot");
      dotsRow.appendChild(d);
      return d;
    });
    var navRow = el("div","tutorial-nav");
    var prevBtn = el("button","btn","← 이전");
    var nextBtn = el("button","btn primary","다음 →");
    var startBtn = el("button","btn primary hidden","🎮 시작하기");

    function renderSlide(){
      var slide = TUTORIAL_SLIDES[slideIdx];
      titleEl.textContent = slide.title;
      bodyHost.innerHTML = "";
      bodyHost.appendChild(slide.build());
      dots.forEach(function(d,i){ d.classList.toggle("active", i===slideIdx); });
      prevBtn.disabled = slideIdx===0;
      var isLast = slideIdx===TUTORIAL_SLIDES.length-1;
      nextBtn.classList.toggle("hidden", isLast);
      startBtn.classList.toggle("hidden", !isLast);
    }

    prevBtn.addEventListener("click", function(){
      if(slideIdx>0){ slideIdx--; sfxSelect(); renderSlide(); }
    });
    nextBtn.addEventListener("click", function(){
      if(slideIdx<TUTORIAL_SLIDES.length-1){ slideIdx++; sfxSelect(); renderSlide(); }
    });
    startBtn.addEventListener("click", function(){
      closeModal();
      switchScreen("mode");
    });
    navRow.appendChild(prevBtn);
    navRow.appendChild(nextBtn);
    navRow.appendChild(startBtn);

    box.appendChild(closeX);
    box.appendChild(titleEl);
    box.appendChild(bodyHost);
    box.appendChild(dotsRow);
    box.appendChild(navRow);
    backdrop.appendChild(box);
    backdrop.addEventListener("click", function(e){ if(e.target===backdrop) closeModal(); });
    tooltipLayer.appendChild(backdrop);
    renderSlide();
  }

  ```
  (이 블록은 `openSettingsModal` 함수 선언 바로 앞에 위치하되, 함수
  선언끼리는 호이스팅되므로 순서 자체는 실행에 영향 없다 — 다만 가독성을
  위해 이 위치에 둔다.)

- [ ] **Step 3: 버튼 이벤트 연결.** `$("start-settings-btn").addEventListener(...)`
  블록 바로 뒤에 추가:
  ```js
  $("tutorial-btn").addEventListener("click", function(){
    sfxSelect();
    openTutorialModal();
  });
  ```

- [ ] **Step 4: CSS 추가.** `.modal-box h2{...}` 규칙(약 187번째 줄) 바로
  뒤에 추가:
  ```css
  .tutorial-box{max-width:340px;text-align:center;position:relative;}
  .tutorial-close{position:absolute;top:8px;right:8px;width:28px;height:28px;font-size:14px;}
  .tutorial-slide-body{min-height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;}
  .tutorial-text{font-size:13px;line-height:1.55;color:var(--text);text-align:left;}
  .tutorial-card-row{display:flex;align-items:center;gap:6px;justify-content:center;flex-wrap:wrap;}
  .tutorial-arrow{font-size:18px;color:var(--muted);}
  .tutorial-dots{display:flex;gap:6px;justify-content:center;margin:10px 0;}
  .tutorial-dot{width:7px;height:7px;border-radius:50%;background:rgba(var(--line-rgb),.3);}
  .tutorial-dot.active{background:var(--accent);}
  .tutorial-nav{display:flex;gap:8px;justify-content:center;}
  ```

- [ ] **Step 5: 브라우저 수동 검증.** 시작 화면에서 "📖" 버튼 클릭 →
  7장 캐러셀이 열리는지, ← 이전/다음 → 버튼과 하단 도트가 슬라이드와
  같이 움직이는지, 3번째(색상+숫자)와 6번째(바닥 조커) 슬라이드에 예시
  카드가 실제 카드 스타일로 렌더링되는지, 마지막 슬라이드에서 "다음 →"
  대신 "🎮 시작하기"만 보이고 누르면 모드 선택 화면으로 넘어가는지, ✖로
  아무 때나 닫아도 에러 없는지 확인. 콘솔에 에러가 없는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add index.html
git commit -m "feat: add optional tutorial carousel to start screen"
```

---

## Task 6: 전체 흐름 통합 검증

**Files:** 없음(읽기 전용 검증 — 코드 수정 없음, 단 Step 1에서 발견되는
문제가 있다면 그 자리에서 고친다).

- [ ] **Step 1: 규칙서(`buildRulebookPanel`)와 튜토리얼 내용이 서로 모순되지
  않는지 대조.** `index.html`에서 `function buildRulebookPanel(){` 본문을
  읽고 Task 5의 `TUTORIAL_SLIDES` 문구와 비교 — 랭크 체계, 프리즘카드,
  조커 규칙 설명이 서로 다른 말을 하고 있지 않은지 확인한다.

- [ ] **Step 2: 기존 플레이어 마이그레이션 종단 시나리오.** 브라우저
  devtools 콘솔에서:
  ```js
  localStorage.clear();
  localStorage.setItem("straightNickname", "테스터");
  ```
  새로고침 후 `localStorage.getItem("straightUnlocks")`를 확인 — 11개
  마일스톤 id가 전부 포함된 배열이어야 한다(기존 플레이어는 전체 해금).
  아바타 피커와 설정 모달 카드 뒷면 그리드에 잠금 아이콘이 하나도 없는지
  확인.

- [ ] **Step 3: 완전 신규 플레이어 종단 시나리오.** `localStorage.clear()`
  후 새로고침 — 아바타 8개 중 6개, 카드 뒷면 7개 중 5개가 잠겨 있는지
  확인. 튜토리얼을 열어 끝까지 넘겨보고 "시작하기"로 정상 진입하는지 확인.

- [ ] **Step 4: 온라인 멀티플레이 경로 회귀 확인.** 두 개의 브라우저 탭으로
  방 만들기 → 참가 → 게임 진행 → 한쪽이 승리 시 양쪽 탭 모두 정확히 한 번씩
  `localStorage`의 `straightStats.games`가 증가하는지 확인(승리한 탭은
  `wins`도 함께 증가). 콘솔에 에러가 없는지 확인.

- [ ] **Step 5: 최종 커밋(발견된 수정 사항이 있었던 경우에만).**

```bash
git add index.html
git commit -m "fix: reconcile rulebook wording found during onboarding flow verification"
```
