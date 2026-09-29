# 업적/보상 확장 설계

## 배경

기존 온보딩/리텐션 기능(`docs/superpowers/specs/2026-09-28-onboarding-retention-design.md`)이
승/판수 단일 트랙(둘 중 먼저 도달)으로 11개 아바타/패턴을 해금하는 구조를 만들었다.
이 문서는 그 시스템을 완전히 재설계한다: 승리 트랙과 판수 트랙을 분리하고, 보상
종류를 4가지(아바타/카드뒷면 패턴/칭호/닉네임 테두리)로 늘리고, 플레이 패턴 기반
"기타 미션" 10개를 추가하고, 이 모든 것을 한눈에 보는 업적 화면과 실제 소유물을
관리하는 수집품 화면을 신설한다. 대화로 여러 차례 조정을 거쳐 확정된 스펙이며,
아래 수치·이름·조건은 전부 최종 확정본이다.

## 1. 데이터 모델

### 1.1 저장소 (localStorage)

- `straightStats` — 하나의 JSON 객체. 필드:
  - `wins`(number), `games`(number), `draws`(number)
  - `winStreak`(number) — 현재 연승. 승리 시 +1, 패배/무승부 시 0.
  - `prismBanked`(number) — 프리즘카드를 점수덱에 넣은 누적 횟수.
  - `jokersBanked`(number) — 조커를 점수덱에 내려놓은 누적 횟수.
  - `hardWins`(number) — `state.aiDifficulty==="hard"`일 때 거둔 승수.
  - `onlineWins`(number) — 온라인 대전 승수.
  - `fourPOnlineWins`(number) — 온라인 4인전 승수.
  - `colorsWon`(string[]) — 스트레이트를 완성해본 색상 목록(중복 없음). `COLORS`의 키(PINK/BLUE/YELLOW/GREEN) 사용.
  - `hasKStraightWin`(boolean) — 10-J-Q-K-A(끝쪽 스트레이트, `straight.start===10`)로 승리한 적 있는지.
  - `hasBigHandWin`(boolean) — 승리 시점 점수덱 카드 수(`player.score.length`)가 20장 이상이었는지.
  - `tutorialDone`(boolean) — 튜토리얼 캐러셀 마지막 슬라이드에서 "🎮 시작하기"를 누른 적 있는지.
  - 모든 필드는 `stats.field||0`(숫자) 또는 `stats.field||false`/`stats.field||[]` 형태로 읽어 누락을 방어한다(기존 `loadStats` 패턴).
- `straightUnlocks` — 해금된 milestone id 문자열 배열. 기존과 동일한 저장 방식.
- `straightActiveTitle` — 현재 장착한 칭호 id(또는 없음).
- `straightActiveBorder` — 현재 장착한 테두리 id(또는 없음).

### 1.2 UNLOCK_MILESTONES — 조건을 함수로

기존(이전 세션) 구조는 `winsRequired`/`gamesRequired` 숫자 필드 두 개를 OR로 비교했다.
이번엔 조건 종류가 훨씬 다양해져(누적 수, 배열 길이, 불리언 플래그) 각 항목에
**조건 판정 함수**를 직접 갖는 구조로 바꾼다:

```js
{ id:"win:10", kind:"avatar", label:"나이트올빼미", check:function(s){ return s.wins>=10; } }
```

- `id` — 안정적 의미값 키(기존 규칙 유지: `avatar:`/`pattern:`/`title:`/`border:` 접두사 + 이름).
- `kind` — `"avatar"|"pattern"|"title"|"border"` 중 하나. 해금 토스트 문구와 수집품 화면 분류에 쓰인다.
- `label` — 표시 이름.
- `check(stats)` — `straightStats`를 받아 boolean 반환.

`checkUnlocks(stats, unlocks)`는 각 milestone에 대해 `updated.indexOf(m.id)===-1 && m.check(stats)`일 때만
새로 해금 처리한다. 나머지 로직(이미 해금된 항목 skip, `newly` 배열 반환)은 기존과 동일.

### 1.3 기록 지점

기존 3곳(로컬 승리 `checkWin`, 로컬 무승부 `declareDraw`, 원격 동기화
`applyRemoteRoomState`의 게임오버 분기)은 그대로 유지하되, 넘기는 인자를
`won`(boolean) 대신 `outcome`("win"|"loss"|"draw") + `meta`로 바꾼다.
`state.statsRecorded` 가드는 기존과 동일하게 클라이언트당 게임 1회 정확히 1번만
기록되게 막는다(이 부분은 이미 완성되어 있으므로 손대지 않는다 — 현재 코드:
`index.html:1671`의 `checkWin`, `index.html:1620`의 `declareDraw`,
`index.html:988~991` 부근의 `applyRemoteRoomState` 분기, `maybeRecordLocalGameResult`
정의부).

```js
function recordGameResult(outcome, meta){
  var stats = loadStats(); // 아래 1.4에서 새 필드까지 읽도록 확장
  stats.games = (stats.games||0)+1;
  if(outcome==="win"){
    stats.wins = (stats.wins||0)+1;
    stats.winStreak = (stats.winStreak||0)+1;
    if(meta){
      if(meta.difficulty==="hard") stats.hardWins = (stats.hardWins||0)+1;
      if(meta.isOnline) stats.onlineWins = (stats.onlineWins||0)+1;
      if(meta.isOnline && meta.playerCount===4) stats.fourPOnlineWins = (stats.fourPOnlineWins||0)+1;
      if(meta.straight && meta.straight.start===10) stats.hasKStraightWin = true;
      if(meta.straight){
        stats.colorsWon = stats.colorsWon||[];
        if(stats.colorsWon.indexOf(meta.straight.color)===-1) stats.colorsWon.push(meta.straight.color);
      }
      if(meta.scoreLen>=20) stats.hasBigHandWin = true;
    }
  } else if(outcome==="draw"){
    stats.draws = (stats.draws||0)+1;
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
function maybeRecordLocalGameResult(outcome, meta){
  if(state.statsRecorded) return;
  state.statsRecorded = true;
  pendingUnlocks = pendingUnlocks.concat(recordGameResult(outcome, meta));
}
```

**호출부 변경**(현재 `index.html`의 정확한 위치):

- `checkWin(playerIdx)` (`index.html:1671`) — 현재: `maybeRecordLocalGameResult(playerIdx===state.myIndex);`
  변경 후: 승자가 로컬 플레이어면
  `maybeRecordLocalGameResult("win", { difficulty: state.aiDifficulty, isOnline: isMultiplayer(), playerCount: state.turnOrder.length, straight: straight, scoreLen: player.score.length });`,
  아니면 `maybeRecordLocalGameResult("loss");`
- `declareDraw()` (`index.html:1620`) — `maybeRecordLocalGameResult(false)` → `maybeRecordLocalGameResult("draw")`.
- `applyRemoteRoomState`의 게임오버 분기(`index.html:988` 부근) — draw 쪽은 `maybeRecordLocalGameResult("draw")`,
  win 쪽은 승자가 로컬이면 `"win"`+같은 meta(단, `state.winnerStraight`/`state.winnerIndex`/동기화된 `state.turnOrder`/`state.aiDifficulty`에서 값을 읽는다), 아니면 `"loss"`.

**즉시 반영이 필요한 두 카운터**(게임 도중, 게임 종료를 기다리지 않고 바로 판정):

```js
function bumpStatAndCheck(field, delta){
  var stats = loadStats();
  stats[field] = (stats[field]||0)+delta;
  saveStats(stats);
  var result = checkUnlocks(stats, loadUnlocksRaw() || straightUnlocks);
  straightUnlocks = result.updated;
  saveUnlocks(straightUnlocks);
  pendingUnlocks = pendingUnlocks.concat(result.newly);
}
```

- `finishEat(playerIdx, handIdx, floorIdx, capturedCoin)` (`index.html:1870`) — `capturedCoin.isPrism && playerIdx===state.myIndex`일 때
  `bumpStatAndCheck("prismBanked", 1)`.
- `bankJoker(handIdx)` (`index.html:1917`) — 항상 로컬 플레이어이므로 무조건
  `bumpStatAndCheck("jokersBanked", 1)`.

**튜토리얼 완주**(2.4절 참고): 마지막 슬라이드 "🎮 시작하기" 클릭 시
```js
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

`pendingUnlocks`에 게임 중간에 쌓인 항목(프리즘/조커/튜토리얼)은 다음 승리/무승부
화면의 토스트에서 함께 보여준다(기존 `renderUnlockToast` 재사용, 여러 줄 표시는
이미 지원됨).

### 1.4 기존 필드 마이그레이션

기존에 배포된 `recordGameResult(won)` 시그니처를 쓰는 호출부는 전부 위 새 시그니처로
교체한다(하위 호환 불필요 — 아직 실사용자가 거의 없는 신규 배포 기능).
`loadStats()`는 그대로 두되 신규 필드들도 `||` 기본값으로 안전하게 읽도록
`{ wins:parsed.wins||0, games:parsed.games||0, draws:parsed.draws||0, winStreak:parsed.winStreak||0,
prismBanked:parsed.prismBanked||0, jokersBanked:parsed.jokersBanked||0, hardWins:parsed.hardWins||0,
onlineWins:parsed.onlineWins||0, fourPOnlineWins:parsed.fourPOnlineWins||0,
colorsWon:parsed.colorsWon||[], hasKStraightWin:!!parsed.hasKStraightWin,
hasBigHandWin:!!parsed.hasBigHandWin, tutorialDone:!!parsed.tutorialDone }`로 확장한다.

`isExistingPlayer()`/`initUnlocksIfNeeded()`의 자가치유 방식(기존 플레이어는 매
로드마다 신규 milestone id를 자동 병합)은 그대로 유지 — 이번에도 milestone
테이블이 커지므로 동일한 메커니즘이 필요하다.

## 2. 콘텐츠 카탈로그 (전부 확정)

### 2.1 기본 제공(항상 해금)

- 아바타(4): 허니뱅, 바코드 라이언, 스파크 렉스, **매드독**(신규 편입)
- 카드 뒷면 패턴(4): 스트라이프, 지그재그, **허니콤, 리플**(신규 편입)
- 카드 테마 3종 — 기존과 동일, 잠금 대상 아님

### 2.2 신규 캐릭터 3종 (CHARACTERS 배열에 추가)

```js
{ emoji:"🦉", name:"나이트올빼미" },
{ emoji:"🐢", name:"슬로우모" },
{ emoji:"🦊", name:"폭스트릭" }
```

(이전 라운드에서 제안했던 스퀴럴봄/니들스핀/허니스팅/컬러시프트/잉크블롭 5종은
승리 트랙 7칸에 자리가 없어 채택하지 않는다 — 기존 캐릭터 재배치만으로 정확히
채워진다.)

### 2.3 신규 패턴 3종 (CARD_BACK_PRESETS + CSS)

기존 패턴은 모두 무채색 반투명 오버레이라 상위 보상으로는 약하다는 피드백에 따라,
300/500/1000판 전용으로 색이 들어간 화려한 패턴 3종을 새로 만든다. 실제 카드
크기(`--card-w: clamp(30px, 6.4vh, 58px)`)에서 뭉개지지 않는지 반드시 브라우저로
확인한다(이 프로젝트가 과거 여러 번 겪은 문제).

```js
{ id:"dot", name:"도트", cls:"pattern-dot" },
{ id:"wave", name:"웨이브", cls:"pattern-wave" },
{ id:"hologram", name:"홀로그램", cls:"pattern-hologram" },
{ id:"royal", name:"로열", cls:"pattern-royal" },
{ id:"cosmic", name:"코스믹", cls:"pattern-cosmic" }
```

CSS 방향(정확한 수치는 구현 단계에서 실제 카드 크기로 조정):
- **도트**: `radial-gradient` 반복 점무늬 (기존 patterns와 동일한 기법).
- **웨이브**: 두 겹 `radial-gradient` 점을 가로/세로로 어긋나게 배치해 물결처럼 보이는 격자.
- **홀로그램**: 흰색 사선 광택 줄무늬 3개 (`linear-gradient` 하드스톱으로 좁은 흰 띠 3개, 홀로그램 스티커 느낌).
- **로열**: 금색(`#f6a83c`류) 다이아몬드 격자(기존 argyle 기법, 색만 금색) + 격자 교차점마다 작은 금빛 점.
- **코스믹**: 크고 작은 흰색/금색 별점을 밀도 다른 `radial-gradient` 2~3겹으로 흩뿌린 별자리.

기존 `허니콤`, `다이애그널`은 2.1절대로 기본 제공으로 이동. `리플`도 기본 제공(2.1)이지만
**"다이애그널"은 2.4절 튜토리얼 보상으로 이동**하므로 CARD_BACK_PRESETS에서 기본 제공군이
아니라 잠금(튜토리얼 조건부) 상태로 유지한다 — 요약하면:
- 기본 제공: 스트라이프, 지그재그, 허니콤, 리플
- 튜토리얼 완주 보상: 다이애그널
- 신규 밀리언즈 잠금: 도트, 웨이브, 아가일(기존), 다이아몬드(기존), 홀로그램, 로열, 코스믹

### 2.4 튜토리얼 완주 보상

`openTutorialModal()`의 마지막 슬라이드 "🎮 시작하기" 버튼 핸들러(현재
`closeModal(); $("start-btn").click();`)에 `recordTutorialDone();` 호출을 추가한다.
milestone 테이블에 다음 항목 추가:

```js
{ id:"pattern:diagonal", kind:"pattern", label:"다이애그널", check:function(s){ return s.tutorialDone===true; } }
```

### 2.5 닉네임 장식 테두리 (신규 보상 종류)

시안 20종 중 5종만 채택. 이름은 전부 한 단어로 단순화, 색은 게임 기존 팔레트에서 가져온다.

```js
var BORDER_PRESETS = [
  { id:"silver",   name:"실버",    cls:"border-silver" },
  { id:"rainbow",  name:"레인보우", cls:"border-rainbow" },
  { id:"trophy",   name:"트로피",  cls:"border-trophy" },
  { id:"flame",    name:"불꽃",    cls:"border-flame" },
  { id:"heart",    name:"하트",    cls:"border-heart" }
];
```

구현 방향(원형 아바타 아이콘을 감싸는 링):
- **실버**: `border: 6px groove #b8bcc4;` (CSS groove 스타일로 입체감).
- **레인보우**: 4방향 border-color를 각각 다르게(`#d4537e`/`#7f77dd`/`#33d6c0`/`#f6a83c`) — 구글 로고 배색(RGBY)과 겹치지 않도록 이 4색으로 확정.
- **트로피**: `border: 5px double #f6a83c;` + 상단에 작은 금색 점 장식.
- **불꽃**: `border: 3px solid #d85a30;` + 상단 좌우에 작은 주황 점 2개.
- **하트**: `border: 3px solid #d4537e;` + 상단 중앙에 작은 분홍 점 1개.

기본(미보유 시): 테두리 없음(장식 없이 기존 그대로 표시).

### 2.6 칭호 (신규 보상 종류, 텍스트 배지)

```js
var TITLE_PRESETS = [
  { id:"beginner",    name:"초보" },
  { id:"skilled",     name:"능숙" },
  { id:"master",      name:"마스터" },
  { id:"firststep",   name:"발걸음" },
  { id:"consistent",  name:"꾸준함" },
  { id:"veteran",     name:"베테랑" },
  { id:"peace",       name:"평화" },
  { id:"collector",   name:"콜렉터" },
  { id:"social",      name:"소셜" },
  { id:"allcolor",    name:"올컬러" },
  { id:"bighand",     name:"빅핸드" }
];
```

기본(미보유 시): 칭호 없음.

## 3. 최종 미션/보상 테이블

id 규칙: `win:<N>`, `games:<N>`, `misc:<slug>`.

### 3.1 승리 트랙 (칭호·아바타만)

| id | 조건 | kind | 보상 |
|---|---|---|---|
| `win:10` | wins≥10 | avatar | 나이트올빼미 |
| `win:20` | wins≥20 | title | 초보 |
| `win:30` | wins≥30 | avatar | 고양이 예언자 |
| `win:50` | wins≥50 | avatar | 슬로우모 |
| `win:100` | wins≥100 | title | 능숙 |
| `win:200` | wins≥200 | avatar | 크러셔 루 |
| `win:300` | wins≥300 | avatar | 메가블록 |
| `win:400` | wins≥400 | title | 마스터 |
| `win:500` | wins≥500 | avatar | 카이저 핑 |
| `win:1000` | wins≥1000 | avatar | 폭스트릭 |

### 3.2 판 수 트랙 (칭호·패턴만)

| id | 조건 | kind | 보상 |
|---|---|---|---|
| `games:10` | games≥10 | pattern | 도트 |
| `games:20` | games≥20 | title | 발걸음 |
| `games:30` | games≥30 | pattern | 웨이브 |
| `games:50` | games≥50 | pattern | 아가일 |
| `games:100` | games≥100 | title | 꾸준함 |
| `games:200` | games≥200 | pattern | 다이아몬드 |
| `games:300` | games≥300 | pattern | 홀로그램 |
| `games:400` | games≥400 | title | 베테랑 |
| `games:500` | games≥500 | pattern | 로열 |
| `games:1000` | games≥1000 | pattern | 코스믹 |

(300/500/1000판 자리가 2.3절의 신규 화려한 패턴 3종 자리다 — 허니콤/다이애그널/리플은
2.1/2.4절대로 기본 제공/튜토리얼 보상으로 옮겨졌으므로 여기서 빠졌다.)

### 3.3 기타 미션 (칭호·테두리만)

| id | 조건 | kind | 보상 |
|---|---|---|---|
| `misc:streak10` | winStreak≥10 | border | 불꽃 |
| `misc:prism10` | prismBanked≥10 | border | 레인보우 |
| `misc:draws10` | draws≥10 | title | 평화 |
| `misc:jokers20` | jokersBanked≥20 | title | 콜렉터 |
| `misc:hard100` | hardWins≥100 | border | 트로피 |
| `misc:kstraight` | hasKStraightWin | border | 실버 |
| `misc:online4p50` | fourPOnlineWins≥50 | border | 하트 |
| `misc:online1` | onlineWins≥1 | title | 소셜 |
| `misc:allcolors` | colorsWon.length≥4 | title | 올컬러 |
| `misc:bighand` | hasBigHandWin | title | 빅핸드 |

### 3.4 튜토리얼

| id | 조건 | kind | 보상 |
|---|---|---|---|
| `pattern:diagonal` | tutorialDone | pattern | 다이애그널 |

**합계 검증** (전부 정확히 일치, 남는 것도 모자란 것도 없음):
- milestone 총 21개(win 10 + games 10 + tutorial 1) + misc 10 = 31개.
- 아바타: 필요 슬롯 7개(win 트랙의 10/30/50/200/300/500/1000) = 2.2절 캐릭터
  재배치분 7개(나이트올빼미·고양이 예언자·슬로우모·크러셔 루·메가블록·카이저 핑·폭스트릭)와 정확히 일치.
- 패턴: 필요 슬롯 8개(games 트랙 7개 + 튜토리얼 1개) = 2.3절 카탈로그 8개
  (도트·웨이브·아가일·다이아몬드·홀로그램·로열·코스믹·다이애그널)와 정확히 일치.
- 칭호: 필요 슬롯 11개(win 트랙 3 + games 트랙 3 + 기타 미션 5) = 2.6절
  TITLE_PRESETS 11개와 정확히 일치.
- 테두리: 필요 슬롯 5개(기타 미션 5) = 2.5절 BORDER_PRESETS 5개와 정확히 일치.

## 4. UI

### 4.1 잠금 표시 재사용

기존 아바타 피커(`screen-avatar`)와 설정 모달 카드뒷면 그리드의 잠금 UI(흐림 +
🔒 + 칸 안 상시 노출 힌트 텍스트, `unlockHintText`/`unlockHintShort`/`.locked`
CSS)를 그대로 재사용한다. `unlockHintText`/`unlockHintShort`는 이제
`m.winsRequired`/`m.gamesRequired` 숫자 비교 대신 `m.check`를 쓰므로, 남은 조건을
사람이 읽을 문구로 바꿔줄 별도 함수가 필요하다 — 각 milestone에 `hint(stats)`
필드(또는 `id` 접두사로 트랙 판별)를 추가해 "10승 남음"/"3판 남음"/"프리즘 4개 남음"
같은 문구를 생성한다. 정확한 문구 포맷은 계획 단계에서 확정.

### 4.2 업적 화면 (신규 `screen-achievements`)

시작 화면에 🏆 버튼 추가(튜토리얼/설정 버튼 옆). 31개 milestone 전체를 트랙별
섹션(승리/판수/기타/튜토리얼)으로 묶어 목록 표시. 각 줄: 조건 텍스트 + 보상
미리보기(아바타 원형 아이콘 또는 패턴 스와치 또는 테두리 링 또는 칭호 칩) + 잠금
여부 + (잠긴 경우) 진행도. `openSettingsModal`/`openTutorialModal`과 같은 모달
패턴을 따르거나, 다른 화면들처럼 `screen-*` 풀스크린으로 만들 수 있다 —
계획 단계에서 목록 스크롤 UX를 보고 결정.

### 4.3 수집품 화면 (신규, 업적과 별도)

실제로 보유한 아이템만 카테고리별(아바타/패턴/칭호/테두리)로 모아 보여주는 화면.
칭호와 테두리는 여러 개 가질 수 있으므로 여기서 **장착(equip)** 선택 가능 —
아바타/패턴처럼 라디오 선택 방식(`setActiveTitle(id)`/`setActiveBorder(id)`,
기존 `setCardTheme`/`setBackPreset` 패턴을 그대로 따라 `localStorage`에 저장).
아바타/패턴은 이미 각각 캐릭터 선택 화면/설정 모달에 장착 UI가 있으므로 여기서는
소유 현황만 보여줘도 되고, 칭호/테두리만 장착 UI가 필요하다.

### 4.4 칭호/테두리 표시 위치

- 장착한 칭호: 닉네임 옆에 소괄호나 배지로 상시 표시(예: "허니뱅 〈마스터〉") — 아바타
  피커, 게임 중 상단바, 승리 화면 등 플레이어 이름이 나오는 곳.
- 장착한 테두리: 아바타 아이콘을 감싸는 원형 링으로 상시 표시 — 같은 위치들.
- 정확히 어느 화면까지 적용할지(전부 vs 주요 화면만)는 계획 단계에서 UI 임팩트
  보고 확정하되, 최소 아바타 피커와 게임 중 상단바에는 반드시 반영한다.

## 5. 범위 밖

- 일일 도전과제, 계정 간 동기화(여전히 기기별 localStorage).
- 칭호/테두리 외 추가 장식 슬롯(예: 카드 뒷면 애니메이션).
- 업적 알림을 인앱 푸시/실시간 멀티플레이어 동시 알림으로 확장하는 것 — 지금처럼
  각자 자기 화면에서 승리/무승부 시점에만 토스트로 확인.

## 6. 성공 기준

- 신규 설치 플레이어가 처음 10승/10판만 찍어도 뭔가(아바타든 패턴이든) 곧바로 손에
  잡힌다 — 칭호만 연속으로 주지 않는다.
- 300/500/1000 같은 상위 구간 보상이 하위 구간보다 시각적으로 확실히 화려하다.
- 기존 플레이어(마이그레이션 대상)는 배포 시점에 이미 갖고 있던 것을 잃지 않는다.
- 튜토리얼을 끝까지 본 사람에게는 실질적 보상이 하나 주어진다.
