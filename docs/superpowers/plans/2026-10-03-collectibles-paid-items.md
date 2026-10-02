# 수집품 개편 마무리 + 첫 출시 유료 아이템 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 수집품 개편 스펙의 나머지(패턴·칭호·테두리·테마·그랜드마스터 34업적)와 첫 출시 유료 아이템(테두리 4·패턴 4·테마 2·멤버 캐릭터 2)을 정의하고, 수집품 화면에 가격·멤버십·이벤트 상태로 잠금 표시한다.

**Architecture:** 단일 `index.html`(IIFE 안의 ES5 vanilla JS, 빌드 없음)을 순서대로 패치한다. 먼저 모든 아이템 목록에 `event`/`paid`/`member`/`gm` 플래그를 두고 하나의 소유 판정(`specialItemOwned`)으로 묶은 뒤, 데이터(목록·업적·통계) → 디자인(CSS) → 테마 → 캐릭터 순으로 쌓는다. 결제와 `entitlements`는 후속 단계이므로 유료·멤버 아이템 소유는 지금의 `hasMembership()`(로컬호스트만 true) 하나로 판정한다.

**Tech Stack:** Vanilla JS(ES5), HTML/CSS, Node.js(`node --check`만), Claude 앱 미리보기 브라우저.

**Spec:** [수집품 개편](../specs/2026-10-03-collectibles-redesign.md), [계정·유료화 섹션 2·5](../specs/2026-10-02-account-monetization-design.md)

## Global Constraints

- 빌드 스텝 없음, 단일 `index.html`. 기존 스타일 유지: `var`, `function`, `el()`/`$()`, 모든 `localStorage` 접근은 `try{}catch(e){}`.
- 가격: 유료 테두리·패턴 **2,200원**, 유료 테마 **3,300원**, 멤버십 3,300원/30일. 결제·구매 버튼은 이번 범위 아님.
- 그랜드마스터 조건 = 업적 **34개**(캐릭터 8 + 패턴 8 + 칭호 11 + 테두리 7). 이벤트·유료·멤버 아이템은 업적이 아니다.
- 그랜드마스터 보상 = 칭호 **그랜드마스터**, 테두리 **솔라리스**, 패턴 **로열**.
- 이벤트 아이템 문구: **"🎉 이벤트로 만나요!"**. 화면에 "개발자 계정" 같은 내부 표현 금지.
- 테두리는 이름표(`.name-tag`) 크기를 바꾸지 않는다(색·장식만).
- 기존 진행도 이관 불필요(로그인 도입 시 새로 시작). 업적 ID 변경 시 `UNLOCK_SCHEMA_VERSION`을 올려 통계에서 재계산.
- 각 태스크가 끝나 검증되면 **바로 커밋하고 `origin/main`에 푸시**한다(사용자 상시 지시).

## 검증 방법 (모든 태스크 공통)

이 저장소에는 테스트 프레임워크가 없다. 각 태스크는 아래 두 가지로 검증한다.

1. **문법 검사** — 모듈 스크립트를 뽑아 `node --check`:

```bash
cd /c/Users/jin/holdme/straight-game && node -e "const s=require('fs').readFileSync('index.html','utf8');const m=[...s.matchAll(/<script type=\"module\">([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n');require('fs').writeFileSync(process.env.TEMP+'/sg.mjs',m)" && node --check "$TEMP/sg.mjs" && echo SYNTAX_OK
```
Expected: `SYNTAX_OK`

2. **화면 검사** — `preview_start {name:"straight-game"}`(포트 5175). 로컬호스트는 개발자 취급이라 전부 해금되어 보인다. **잠금 상태를 보려면 `http://localhost:5175/?nodev=1`** (Task 1에서 추가). 수집품 화면은 시작 화면의 `🏆 수집품` 버튼. 텍스트는 `get_page_text`/`read_page`로, 디자인은 `computer screenshot`으로 확인한다. 콘솔 오류는 `read_console_messages {onlyErrors:true}`로 0건이어야 한다.

---

### Task 1: 아이템 종류 플래그와 소유 판정 통합

**Files:**
- Modify: `index.html` — `isDevAccount()`(~927행), `isThemeOwned()`(~932행), `isGrandMasterItem`/`sortCollectionItems`/`isEventItem`/`isAvatarUnlocked`/`isPatternUnlocked`/`isBorderUnlocked`(~1105–1153행), `collectionItemsFor`/`collectionItemDetailText`/`renderCollectionScreen`(~3497–3605행)

**Interfaces:**
- Produces:
  - `PRICE_LABELS` — `{ border:"2,200원", pattern:"2,200원", theme:"3,300원" }`
  - `presetListFor(kind) -> Array` — kind ∈ `"avatar"|"pattern"|"title"|"border"|"theme"`
  - `presetByName(kind, name) -> object|null`
  - `isEventItem(kind,name)`, `isPaidItem(kind,name)`, `isMemberItem(kind,name)`, `isGrandMasterItem(kind,name)` → boolean (각 프리셋의 `event`/`paid`/`member`/`gm` 플래그)
  - `specialItemOwned(preset) -> true|false|null` — 이벤트·유료·멤버가 아니면 `null`(=업적으로 판정)
  - 프리셋 플래그 규약: 이후 태스크는 목록 항목에 `event:true` / `paid:true` / `member:true` / `gm:true`만 붙이면 잠금·문구·정렬이 자동 적용된다.

- [ ] **Step 1: `?nodev` 스위치 추가** — `isDevAccount()`를 교체:

```js
function isDevAccount(){
  // ?nodev on a local server previews the game as an ordinary player (locks visible).
  if(/[?&]nodev\b/.test(location.search)) return false;
  var h = location.hostname;
  return h==="localhost" || h==="127.0.0.1";
}
```

- [ ] **Step 2: 공통 헬퍼로 교체** — 기존 `isGrandMasterItem`, `isEventItem` 함수 두 개를 지우고 `sortCollectionItems` 바로 위에 다음을 넣는다:

```js
var PRICE_LABELS = { border:"2,200원", pattern:"2,200원", theme:"3,300원" };
function presetListFor(kind){
  if(kind==="avatar") return CHARACTERS;
  if(kind==="pattern") return CARD_BACK_PRESETS;
  if(kind==="title") return TITLE_PRESETS;
  if(kind==="border") return BORDER_PRESETS;
  if(kind==="theme") return CARD_THEMES;
  return [];
}
function presetByName(kind, name){
  var list = presetListFor(kind);
  for(var i=0;i<list.length;i++){ if(list[i].name===name) return list[i]; }
  return null;
}
function isEventItem(kind, name){ var p = presetByName(kind, name); return !!(p && p.event); }
function isPaidItem(kind, name){ var p = presetByName(kind, name); return !!(p && p.paid); }
function isMemberItem(kind, name){ var p = presetByName(kind, name); return !!(p && p.member); }
function isGrandMasterItem(kind, name){ var p = presetByName(kind, name); return !!(p && p.gm); }
// Items no achievement grants. Until purchases and entitlements land, membership (a local
// dev server for now) owns paid and member items, and only the dev account sees events.
function specialItemOwned(p){
  if(p.event) return isDevAccount();
  if(p.paid || p.member) return hasMembership();
  return null;
}
```

- [ ] **Step 3: 정렬 키 확장** — `sortCollectionItems`의 `key()`를 교체(업적 → 그랜드마스터 → 유료 → 멤버 → 이벤트 순):

```js
  function key(it){
    if(isEventItem(kind, it.name)) return 2e6;
    if(isMemberItem(kind, it.name)) return 1.7e6;
    if(isPaidItem(kind, it.name)) return 1.5e6;
    return isGrandMasterItem(kind, it.name) ? 1e6 : milestoneSortKey(kind, it.name);
  }
```

- [ ] **Step 4: 소유 판정에 `specialItemOwned` 적용** — 네 함수를 교체:

```js
function isAvatarUnlocked(name, unlocks){
  var ch = presetByName("avatar", name);
  if(!ch) return false;
  var special = specialItemOwned(ch);
  if(special!==null) return special;
  if(UNLOCK_STARTER_AVATARS.indexOf(name)!==-1) return true;
  var m = findMilestoneByLabel("avatar", name);
  return m ? unlocks.indexOf(m.id)!==-1 : false;
}
function isPatternUnlocked(id, unlocks){
  var preset = null;
  for(var i=0;i<CARD_BACK_PRESETS.length;i++){ if(CARD_BACK_PRESETS[i].id===id){ preset=CARD_BACK_PRESETS[i]; break; } }
  if(!preset) return false;
  var special = specialItemOwned(preset);
  if(special!==null) return special;
  if(preset.gm) return isGrandMaster(unlocks);
  if(UNLOCK_STARTER_PATTERNS.indexOf(id)!==-1) return true;
  var m = findMilestoneByLabel("pattern", preset.name);
  return m ? unlocks.indexOf(m.id)!==-1 : false;
}
function isBorderUnlocked(id, unlocks){
  var preset = null;
  for(var i=0;i<BORDER_PRESETS.length;i++){ if(BORDER_PRESETS[i].id===id){ preset=BORDER_PRESETS[i]; break; } }
  if(!preset) return false;
  var special = specialItemOwned(preset);
  if(special!==null) return special;
  if(preset.gm) return isGrandMaster(unlocks);
  if(UNLOCK_STARTER_BORDERS.indexOf(id)!==-1) return true;
  var m = findMilestoneByLabel("border", preset.name);
  return m ? unlocks.indexOf(m.id)!==-1 : false;
}
```

그리고 ~932행 `isThemeOwned`를:

```js
function isThemeOwned(theme){
  if(!theme) return false;
  var special = specialItemOwned(theme);
  return special===null ? true : special;
}
```

(`isTitleUnlocked`는 칭호에 유료·이벤트가 없으므로 그대로 둔다.)

- [ ] **Step 5: 수집품 문구** — `collectionItemDetailText` 앞부분을 교체(테마 전용 분기 제거, 공통 분기):

```js
function collectionItemDetailText(kind, name){
  if(isEventItem(kind, name)) return "🎉 이벤트로 만나요!";
  if(isMemberItem(kind, name)) return "👑 멤버십 전용";
  if(isPaidItem(kind, name)) return "💎 "+PRICE_LABELS[kind];
  if(kind==="theme") return "기본 테마";
  if(isGrandMasterItem(kind, name)){
```
(이하 기존 그랜드마스터·업적 분기는 그대로.)

- [ ] **Step 6: 수집품 카드** — `collectionItemsFor`의 테마 항목에서 `member:!!t.member,`를 지우고, `renderCollectionScreen`의 미보유 줄 조건을 교체:

```js
    // Member items already say "👑 멤버십 전용" in their detail line, so no second line.
    if(!it.unlocked && !isMemberItem(tab, it.name)){
```

- [ ] **Step 7: 문법 검사** — 공통 명령 실행. Expected: `SYNTAX_OK`

- [ ] **Step 8: 화면 검사**
  - `http://localhost:5175/` → 수집품 → 테마 탭: 그린 펠트·월넛·블랙 마블이 해금, 상세 "👑 멤버십 전용".
  - `http://localhost:5175/?nodev=1` → 아바타 탭: 썬더 죠스·블랙 스콜피온이 "🔒 미보유 / 🎉 이벤트로 만나요!", 맨 뒤. 테마 탭: 멤버 테마 3종 잠금, "🔒 미보유" 줄 없음.
  - 콘솔 오류 0건.

- [ ] **Step 9: 커밋·푸시**

```bash
git add index.html && git commit -m "refactor: unified event/paid/member item flags and ownership; ?nodev preview switch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push origin main
```

---

### Task 2: 목록·업적·통계 재정의 (34업적)

**Files:**
- Modify: `index.html` — `CARD_BACK_PRESETS`(~624행), `UNLOCK_STARTER_*`(~641–643행), `UNLOCK_MILESTONES`(~645–682행), `loadStats`(~684행), `UNLOCK_SCHEMA_VERSION`(~741행), `recordGameResult`(~751행), `TITLE_PRESETS`/`BORDER_PRESETS`(~1014–1041행), 승리 기록 호출 2곳(~1838, ~2570행의 `scoreLen`), 리셋 카드 사용(~3371행)

**Interfaces:**
- Consumes: Task 1의 프리셋 플래그 규약.
- Produces:
  - 통계 필드 `winsByColor: {PINK,BLUE,YELLOW,GREEN}`(숫자), `bombsUsed`(숫자). `colorsWon`, `hasBigHandWin` 제거.
  - 새 프리셋 id(Task 3·4 CSS가 사용): 패턴 `sakura`(`pattern-sakura`), `snowflake`(`pattern-snowflake`), `onyx`(`pattern-onyx`), `carbon`(`pattern-carbon`), `stained`(`pattern-stained`), `crystal`(`pattern-crystal`); 테두리 `emerald`(`border-emerald`), `ruby`(`border-ruby`), `neon`(`border-neon`), `chrome`(`border-chrome`), `opal`(`border-opal`), `blackgold`(`border-blackgold`).
  - 칭호 id: `bomber`(폭탄마), `streak`(연승 머신).

- [ ] **Step 1: 패턴 목록 교체** — `CARD_BACK_PRESETS` 전체를:

```js
var CARD_BACK_PRESETS = [
  { id:"stripe", name:"스트라이프", cls:"pattern-stripe" },
  { id:"zigzag", name:"지그재그", cls:"pattern-zigzag" },
  { id:"argyle", name:"아가일", cls:"pattern-argyle" },
  { id:"honeycomb", name:"허니콤", cls:"pattern-honeycomb" },
  { id:"solar", name:"솔라", cls:"pattern-solar" },
  { id:"scale", name:"비늘", cls:"pattern-scale" },
  { id:"ripple", name:"리플", cls:"pattern-ripple" },
  { id:"diamond", name:"다이아몬드", cls:"pattern-diamond" },
  { id:"cosmic", name:"코스믹", cls:"pattern-cosmic" },
  { id:"hologram", name:"홀로그램", cls:"pattern-hologram" },
  { id:"diagonal", name:"다이애그널", cls:"pattern-diagonal" },
  // Grand Master pattern: the gold-foil design, now named 로열 (the old 로열 design is gone).
  { id:"goldfoil", name:"로열", cls:"pattern-goldfoil", gm:true },
  { id:"sakura", name:"벚꽃", cls:"pattern-sakura", event:true },
  { id:"snowflake", name:"눈송이", cls:"pattern-snowflake", event:true },
  { id:"onyx", name:"오닉스", cls:"pattern-onyx", paid:true },
  { id:"carbon", name:"카본", cls:"pattern-carbon", paid:true },
  { id:"stained", name:"스테인드글라스", cls:"pattern-stained", paid:true },
  { id:"crystal", name:"크리스탈", cls:"pattern-crystal", paid:true }
];
```

CSS에서 `.pattern-royal::after{...}` 줄(~333행)을 삭제하고, 공통 선택자 줄(~321행)의 `.pattern-royal::after`를 `.pattern-sakura::after,.pattern-snowflake::after,.pattern-onyx::after,.pattern-carbon::after,.pattern-stained::after,.pattern-crystal::after`로 바꾼다. (저장된 `royal` 패턴은 목록에 없으니 시작 시 기본 패턴으로 자동 복귀한다.)

- [ ] **Step 2: 시작 아이템**

```js
var UNLOCK_STARTER_PATTERNS = ["stripe","zigzag","argyle"];
var UNLOCK_STARTER_BORDERS = ["coral","blueberry","stars"];
```

- [ ] **Step 3: 칭호·테두리 목록 교체**

```js
var TITLE_PRESETS = [
  { id:"beginner", name:"초보" },
  { id:"skilled", name:"승부사" },
  { id:"master", name:"카드의 신" },
  { id:"consistent", name:"개근상" },
  { id:"veteran", name:"카드에 진심" },
  { id:"peace", name:"평화주의자" },
  { id:"collector", name:"조커 마니아" },
  { id:"social", name:"인싸 등극" },
  { id:"allcolor", name:"무지개 정복자" },
  { id:"bomber", name:"폭탄마" },
  { id:"streak", name:"연승 머신" },
  { id:"grandmaster", name:"그랜드마스터", gm:true }
];
var BORDER_PRESETS = [
  { id:"coral", name:"코랄", cls:"border-coral" },
  { id:"blueberry", name:"블루베리", cls:"border-blueberry" },
  { id:"stars", name:"별자리", cls:"border-stars" },
  { id:"aurora", name:"오로라", cls:"border-aurora" },
  { id:"rainbow", name:"레인보우", cls:"border-rainbow" },
  { id:"heart", name:"하트", cls:"border-heart" },
  { id:"silver", name:"실버", cls:"border-silver" },
  { id:"flame", name:"불꽃", cls:"border-flame" },
  { id:"emerald", name:"에메랄드", cls:"border-emerald" },
  { id:"ruby", name:"루비", cls:"border-ruby" },
  // Grand Master border (was named 그랜드마스터; same design).
  { id:"legend", name:"솔라리스", cls:"border-legend", gm:true },
  { id:"candy", name:"캔디", cls:"border-candy", event:true },
  { id:"trophy", name:"트로피", cls:"border-trophy", event:true },
  { id:"sprout", name:"새싹", cls:"border-sprout", event:true },
  { id:"mint", name:"민트", cls:"border-mint", event:true },
  { id:"neon", name:"네온", cls:"border-neon", paid:true },
  { id:"chrome", name:"크롬", cls:"border-chrome", paid:true },
  { id:"opal", name:"오팔", cls:"border-opal", paid:true },
  { id:"blackgold", name:"블랙골드", cls:"border-blackgold", paid:true }
];
```

- [ ] **Step 4: 업적 표 교체** — `UNLOCK_MILESTONES` 전체를 아래로. 캐릭터 8·패턴 8·칭호 11·테두리 7 = 34. 100판은 패턴(리플)과 칭호(개근상)가 겹치므로 패턴 쪽 id에 종류를 붙인다.

```js
function colorsAt20(s){
  return ALL_COLORS.filter(function(c){ return (s.winsByColor[c]||0)>=20; }).length;
}
var UNLOCK_MILESTONES = [
  { id:"win:10",   kind:"avatar",  label:"나이트올빼미",   check:function(s){ return s.wins>=10; },   detail:function(s){ return "승리 "+Math.min(s.wins,10)+"/10회"; } },
  { id:"win:20",   kind:"title",   label:"초보",          check:function(s){ return s.wins>=20; },   detail:function(s){ return "승리 "+Math.min(s.wins,20)+"/20회"; } },
  { id:"win:30",   kind:"avatar",  label:"볼트 드라코",    check:function(s){ return s.wins>=30; },   detail:function(s){ return "승리 "+Math.min(s.wins,30)+"/30회"; } },
  { id:"win:50",   kind:"avatar",  label:"폭스트릭",       check:function(s){ return s.wins>=50; },   detail:function(s){ return "승리 "+Math.min(s.wins,50)+"/50회"; } },
  // 100 wins rewards both a character and a title, so ids carry the reward kind.
  { id:"win:100:avatar", kind:"avatar", label:"고양이 예언자", check:function(s){ return s.wins>=100; }, detail:function(s){ return "승리 "+Math.min(s.wins,100)+"/100회"; } },
  { id:"win:100",  kind:"title",   label:"승부사",          check:function(s){ return s.wins>=100; },  detail:function(s){ return "승리 "+Math.min(s.wins,100)+"/100회"; } },
  { id:"win:300",  kind:"avatar",  label:"슬로우모",       check:function(s){ return s.wins>=300; },  detail:function(s){ return "승리 "+Math.min(s.wins,300)+"/300회"; } },
  { id:"win:400",  kind:"title",   label:"카드의 신",        check:function(s){ return s.wins>=400; },  detail:function(s){ return "승리 "+Math.min(s.wins,400)+"/400회"; } },
  { id:"win:500",  kind:"avatar",  label:"카이저 핑",      check:function(s){ return s.wins>=500; },  detail:function(s){ return "승리 "+Math.min(s.wins,500)+"/500회"; } },
  { id:"win:700",  kind:"avatar",  label:"렉스 버서커",    check:function(s){ return s.wins>=700; },  detail:function(s){ return "승리 "+Math.min(s.wins,700)+"/700회"; } },
  { id:"win:1000", kind:"avatar",  label:"메가블록",       check:function(s){ return s.wins>=1000; }, detail:function(s){ return "승리 "+Math.min(s.wins,1000)+"/1000회"; } },

  { id:"games:10",   kind:"pattern", label:"허니콤",   check:function(s){ return s.games>=10; },   detail:function(s){ return "플레이 "+Math.min(s.games,10)+"/10판"; } },
  { id:"games:30",   kind:"pattern", label:"솔라",     check:function(s){ return s.games>=30; },   detail:function(s){ return "플레이 "+Math.min(s.games,30)+"/30판"; } },
  { id:"games:50",   kind:"pattern", label:"비늘",     check:function(s){ return s.games>=50; },   detail:function(s){ return "플레이 "+Math.min(s.games,50)+"/50판"; } },
  // 100 games rewards both a pattern and a title.
  { id:"games:100:pattern", kind:"pattern", label:"리플", check:function(s){ return s.games>=100; }, detail:function(s){ return "플레이 "+Math.min(s.games,100)+"/100판"; } },
  { id:"games:100",  kind:"title",   label:"개근상",   check:function(s){ return s.games>=100; },  detail:function(s){ return "플레이 "+Math.min(s.games,100)+"/100판"; } },
  { id:"games:300",  kind:"pattern", label:"다이아몬드", check:function(s){ return s.games>=300; }, detail:function(s){ return "플레이 "+Math.min(s.games,300)+"/300판"; } },
  { id:"games:400",  kind:"title",   label:"카드에 진심", check:function(s){ return s.games>=400; },  detail:function(s){ return "플레이 "+Math.min(s.games,400)+"/400판"; } },
  { id:"games:500",  kind:"pattern", label:"코스믹",   check:function(s){ return s.games>=500; },  detail:function(s){ return "플레이 "+Math.min(s.games,500)+"/500판"; } },
  { id:"games:700",  kind:"border",  label:"루비",     check:function(s){ return s.games>=700; },  detail:function(s){ return "플레이 "+Math.min(s.games,700)+"/700판"; } },
  { id:"games:1000", kind:"pattern", label:"홀로그램", check:function(s){ return s.games>=1000; }, detail:function(s){ return "플레이 "+Math.min(s.games,1000)+"/1000판"; } },

  { id:"misc:streak5",    kind:"title",  label:"연승 머신",  check:function(s){ return s.winStreak>=5; },       detail:function(s){ return "연승 "+Math.min(s.winStreak,5)+"/5회"; } },
  { id:"misc:streak10",   kind:"border", label:"불꽃",      check:function(s){ return s.winStreak>=10; },      detail:function(s){ return "연승 "+Math.min(s.winStreak,10)+"/10회"; } },
  { id:"misc:prism50",    kind:"border", label:"오로라",    check:function(s){ return s.prismBanked>=50; },    detail:function(s){ return "프리즘 획득 "+Math.min(s.prismBanked,50)+"/50개"; } },
  { id:"misc:hard100",    kind:"border", label:"레인보우",  check:function(s){ return s.hardWins>=100; },      detail:function(s){ return "어려움 승리 "+Math.min(s.hardWins,100)+"/100회"; } },
  { id:"misc:kstraight",  kind:"border", label:"실버",      check:function(s){ return s.hasKStraightWin; },    boolCond:true, detail:function(s){ return "6-7-8-9-10 스트레이트"; } },
  { id:"misc:online4p50", kind:"border", label:"하트",      check:function(s){ return s.fourPOnlineWins>=50; },detail:function(s){ return "4인전(온라인) 승리 "+Math.min(s.fourPOnlineWins,50)+"/50회"; } },
  { id:"misc:online30",   kind:"border", label:"에메랄드",  check:function(s){ return s.onlineWins>=30; },     detail:function(s){ return "온라인 승리 "+Math.min(s.onlineWins,30)+"/30회"; } },
  { id:"misc:draws10",    kind:"title",  label:"평화주의자", check:function(s){ return s.draws>=10; },          detail:function(s){ return "무승부 "+Math.min(s.draws,10)+"/10회"; } },
  { id:"misc:jokers50",   kind:"title",  label:"조커 마니아", check:function(s){ return s.jokersBanked>=50; },   detail:function(s){ return "조커 사용 "+Math.min(s.jokersBanked,50)+"/50개"; } },
  { id:"misc:bombs30",    kind:"title",  label:"폭탄마",    check:function(s){ return s.bombsUsed>=30; },      detail:function(s){ return "폭탄 카드 사용 "+Math.min(s.bombsUsed,30)+"/30회"; } },
  { id:"misc:online1",    kind:"title",  label:"인싸 등극", check:function(s){ return s.onlineWins>=1; },      boolCond:true, detail:function(s){ return "온라인 승리"; } },
  { id:"misc:colors20",   kind:"title",  label:"무지개 정복자", check:function(s){ return colorsAt20(s)>=4; }, detail:function(s){ return "색깔마다 20승 "+colorsAt20(s)+"/4색"; } },

  { id:"pattern:diagonal", kind:"pattern", label:"다이애그널", check:function(s){ return s.tutorialDone; }, boolCond:true, detail:function(s){ return "튜토리얼 완주"; } }
];
```

`ALL_COLORS`는 이 표보다 아래(~887행)에 `var`로 선언돼 있지만 `colorsAt20`은 실행 시점에만 읽으므로 문제없다.

- [ ] **Step 5: 통계** — `loadStats`를 교체:

```js
function loadStats(){
  var p = {};
  try{ p = JSON.parse(localStorage.getItem("straightStats") || "{}") || {}; }catch(e){}
  return {
    wins: p.wins||0, games: p.games||0, draws: p.draws||0,
    winStreak: p.winStreak||0, prismBanked: p.prismBanked||0,
    jokersBanked: p.jokersBanked||0, hardWins: p.hardWins||0,
    onlineWins: p.onlineWins||0, fourPOnlineWins: p.fourPOnlineWins||0,
    winsByColor: Object.assign({ PINK:0, BLUE:0, YELLOW:0, GREEN:0 }, p.winsByColor||{}),
    bombsUsed: p.bombsUsed||0,
    hasKStraightWin: !!p.hasKStraightWin, tutorialDone: !!p.tutorialDone
  };
}
```

`recordGameResult`의 승리 분기에서 `colorsWon`·`scoreLen` 두 줄을 아래 한 줄로 교체:

```js
      if(meta.straight) stats.winsByColor[meta.straight.color] = (stats.winsByColor[meta.straight.color]||0)+1;
```

승리 기록 호출 두 곳(~1838행, ~2570행)에서 `scoreLen: ...` 속성과 바로 앞 줄 끝의 쉼표를 지운다(`straight: state.winnerStraight` / `straight: straight`가 마지막 속성이 됨).

- [ ] **Step 6: 폭탄 사용 기록** — 사람이 리셋 카드를 쓰는 곳(~3371행)을:

```js
  if(state.mode==="reset-choice" && handCoin && handCoin.isReset){
    bumpStatAndCheck("bombsUsed", 1);
    useResetCard(state.myIndex, handIdx);
    return;
  }
```

- [ ] **Step 7: 스키마 버전** — 업적 id가 바뀌었으므로:

```js
// "5": collectibles redesign (patterns/titles/borders, 34 achievements) — re-derive once.
var UNLOCK_SCHEMA_VERSION = "5";
```
(기존 `"4"` 주석 줄을 이 줄로 교체.)

- [ ] **Step 8: 문법 검사** — Expected: `SYNTAX_OK`

- [ ] **Step 9: 화면 검사** (`?nodev=1`)
  - 패턴 탭 순서: 스트라이프·지그재그·아가일(보유) → 허니콤 "플레이 0/10판 남음" … 홀로그램 → 다이애그널 → 로열 "🏆 모든 업적 달성 0/34" → 오닉스·카본·스테인드글라스·크리스탈 "💎 2,200원" → 벚꽃·눈송이 "🎉 이벤트로 만나요!". 옛 "그랜드마스터" 패턴 이름 없음.
  - 칭호 탭 12종, 손이 큰 편·카드 산책러 없음. 무지개 정복자 "색깔마다 20승 0/4색 남음", 폭탄마 "폭탄 카드 사용 0/30회 남음".
  - 테두리 탭: 코랄·블루베리·별자리 보유, 솔라리스 "0/34", 유료 4종 "💎 2,200원", 이벤트 4종.
  - 혼자하기 한 판에서 리셋 카드를 사용한 뒤 콘솔에서 `JSON.parse(localStorage.straightStats).bombsUsed`가 1 이상.
  - 콘솔 오류 0건. (새 패턴·테두리 미리보기가 비어 보이는 건 Task 3·4에서 채움.)

- [ ] **Step 10: 커밋·푸시**

```bash
git add index.html && git commit -m "feat: collectibles redesign data — patterns, titles, borders, 34 achievements, paid/event items

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push origin main
```

---

### Task 3: 새 패턴 디자인 (이벤트 2 + 유료 4)

**Files:**
- Modify: `index.html` CSS — 패턴 규칙들(~321–334행) 뒤, `.pattern-preview` 앞

**Interfaces:**
- Consumes: Task 2의 클래스 `pattern-sakura`, `pattern-snowflake`, `pattern-onyx`, `pattern-carbon`, `pattern-stained`, `pattern-crystal`(공통 `::after` 선택자에 이미 포함).

- [ ] **Step 1: CSS 추가** — `.pattern-cosmic::after` 줄 바로 뒤에:

```css
/* Event patterns. */
.pattern-sakura::after{background-image:radial-gradient(circle at 50% 50%,rgba(255,196,218,.9) 0 2.2px,transparent 2.6px),radial-gradient(circle at 50% 50%,rgba(255,255,255,.75) 0 1px,transparent 1.3px),linear-gradient(160deg,rgba(255,170,200,.22),transparent 70%);background-size:14px 14px,9px 9px,100% 100%;background-position:0 0,4px 6px,0 0;}
.pattern-snowflake::after{content:"❄";display:flex;align-items:center;justify-content:center;font-size:1.4em;color:rgba(255,255,255,.85);background-image:radial-gradient(rgba(255,255,255,.8) .9px,transparent 1.2px),linear-gradient(180deg,rgba(190,225,255,.25),transparent 70%);background-size:8px 8px,100% 100%;}
/* Paid patterns: premium materials — stone, carbon, glass, crystal. */
.pattern-onyx::after{background-image:linear-gradient(118deg,transparent 0 34%,rgba(255,255,255,.22) 34.5% 35.5%,transparent 36%),linear-gradient(64deg,transparent 0 62%,rgba(255,255,255,.14) 62.5% 63.2%,transparent 63.7%),linear-gradient(135deg,rgba(10,10,14,.78),rgba(40,40,52,.62));box-shadow:inset 0 0 0 2px rgba(233,185,73,.45);}
.pattern-carbon::after{background:linear-gradient(27deg,#151515 5px,transparent 5px) 0 5px/20px 20px,linear-gradient(207deg,#151515 5px,transparent 5px) 10px 0/20px 20px,linear-gradient(27deg,#222 5px,transparent 5px) 0 10px/20px 20px,linear-gradient(207deg,#222 5px,transparent 5px) 10px 5px/20px 20px,linear-gradient(90deg,#1b1b1b 10px,transparent 10px) 0 0/20px 20px,linear-gradient(#1d1d1d 25%,#1a1a1a 25% 50%,transparent 50% 75%,#242424 75%) 0 0/20px 20px,#131313;opacity:.85;}
.pattern-stained::after{background-image:linear-gradient(rgba(20,14,30,.7) 1.5px,transparent 1.5px),linear-gradient(90deg,rgba(20,14,30,.7) 1.5px,transparent 1.5px),conic-gradient(from 45deg,rgba(255,90,120,.5) 0 25%,rgba(80,160,255,.5) 0 50%,rgba(255,210,80,.5) 0 75%,rgba(90,220,150,.5) 0);background-size:12px 12px,12px 12px,24px 24px;}
.pattern-crystal::after{background-image:linear-gradient(60deg,rgba(255,255,255,.38) 25%,transparent 25% 75%,rgba(255,255,255,.38) 75%),linear-gradient(120deg,rgba(255,255,255,.22) 25%,transparent 25% 75%,rgba(255,255,255,.22) 75%),linear-gradient(135deg,rgba(190,230,255,.45),rgba(255,255,255,0) 60%);background-size:16px 28px,16px 28px,100% 100%;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.55);}
```

- [ ] **Step 2: 문법 검사** — Expected: `SYNTAX_OK`

- [ ] **Step 3: 화면 검사** — 수집품 → 패턴 탭 스크린샷: 6종 미리보기가 서로 뚜렷이 구분되고(벚꽃 분홍 점, 눈송이 ❄, 오닉스 검은 돌결+금테, 카본 직조, 스테인드글라스 색유리+격자, 크리스탈 면 반사). 한 종을 장착하고 혼자하기를 시작해 덱/상대 카드 뒷면에 적용되는지 스크린샷으로 확인. 클라우드(밝은) 테마와 자수정(어두운) 테마 둘 다 확인.

- [ ] **Step 4: 커밋·푸시**

```bash
git add index.html && git commit -m "feat: sakura/snowflake event patterns and onyx/carbon/stained glass/crystal paid patterns

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push origin main
```

---

### Task 4: 테두리 디자인 (하트 변경, 에메랄드·루비, 유료 4)

**Files:**
- Modify: `index.html` CSS — `.border-ring.*`(~85–103행), `.name-tag.border-*`(~118–136행)

**Interfaces:**
- Consumes: Task 2의 클래스 `border-emerald`, `border-ruby`, `border-neon`, `border-chrome`, `border-opal`, `border-blackgold`, 기존 `border-heart`.

- [ ] **Step 1: 하트 테두리 변경** — 기존 두 줄
`.border-ring.border-heart::after{...}` 를 삭제하고 다음으로 교체:

```css
.border-ring.border-heart::before{content:"♥";position:absolute;top:-11px;left:50%;transform:translateX(-50%);font-size:14px;line-height:1;color:#ff5c8a;text-shadow:0 1px 2px rgba(0,0,0,.35);}
```

그리고 `.name-tag.border-heart{...}` 줄 바로 뒤에:

```css
.name-tag.border-heart::after{content:"♥";position:absolute;top:-7px;right:8px;font-size:11px;line-height:1;color:#ff5c8a;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,.35);}
```

- [ ] **Step 2: 새 테두리 링(수집품 미리보기)** — `.border-ring.border-sprout::before` 줄 뒤에:

```css
.border-ring.border-emerald{border:4px solid transparent;background:linear-gradient(var(--panel2),var(--panel2)) padding-box,linear-gradient(135deg,#b6f5d2,#1fae6a 35%,#0b6b3f 60%,#5ee0a0) border-box;}
.border-ring.border-ruby{border:4px solid transparent;background:linear-gradient(var(--panel2),var(--panel2)) padding-box,linear-gradient(135deg,#ffc2cf,#d7193f 35%,#7d0a22 60%,#ff5c7a) border-box;}
.border-ring.border-neon{border:3px solid #39f3ff;box-shadow:0 0 6px #39f3ff,0 0 12px rgba(255,61,230,.7),inset 0 0 6px rgba(57,243,255,.6);}
.border-ring.border-chrome{border:4px solid transparent;background:linear-gradient(var(--panel2),var(--panel2)) padding-box,linear-gradient(160deg,#ffffff,#9aa3b2 30%,#3c4250 50%,#e8ecf2 70%,#7d8696) border-box;}
.border-ring.border-opal{border:4px solid transparent;background:linear-gradient(var(--panel2),var(--panel2)) padding-box,conic-gradient(#ffd6e8,#d6f0ff,#e3ffd6,#fff3c4,#e8d6ff,#ffd6e8) border-box;box-shadow:0 0 6px rgba(214,240,255,.6);}
.border-ring.border-blackgold{border:4px solid #111;box-shadow:inset 0 0 0 1.5px #e9b949,0 0 0 1.5px #e9b949;}
```

- [ ] **Step 3: 새 테두리 이름표** — `.name-tag.border-candy{...}` 줄 뒤에(모두 `border` 두께 2px 유지, 크기 불변):

```css
.name-tag.border-emerald{border-color:transparent;background:linear-gradient(90deg,rgba(31,174,106,.3),rgba(31,174,106,.06)) padding-box,linear-gradient(var(--panel2),var(--panel2)) padding-box,linear-gradient(115deg,#b6f5d2,#1fae6a 35%,#0b6b3f 60%,#5ee0a0) border-box;}
.name-tag.border-ruby{border-color:transparent;background:linear-gradient(90deg,rgba(215,25,63,.3),rgba(215,25,63,.06)) padding-box,linear-gradient(var(--panel2),var(--panel2)) padding-box,linear-gradient(115deg,#ffc2cf,#d7193f 35%,#7d0a22 60%,#ff5c7a) border-box;}
.name-tag.border-neon{border-color:#39f3ff;background:linear-gradient(90deg,rgba(255,61,230,.24),rgba(57,243,255,.08)),var(--panel2);box-shadow:0 0 6px rgba(57,243,255,.8),0 0 12px rgba(255,61,230,.45);}
.name-tag.border-chrome{border-color:transparent;background:linear-gradient(90deg,rgba(230,234,240,.26),rgba(230,234,240,.05)) padding-box,linear-gradient(var(--panel2),var(--panel2)) padding-box,linear-gradient(115deg,#ffffff,#9aa3b2 25%,#3c4250 45%,#e8ecf2 65%,#7d8696 85%,#ffffff) border-box;background-size:auto,auto,240% 100%;animation:tagSheen 2.8s ease-in-out infinite alternate;}
.name-tag.border-opal{border-color:transparent;background:linear-gradient(90deg,rgba(255,214,232,.22),rgba(214,240,255,.18),rgba(227,255,214,.12)) padding-box,linear-gradient(var(--panel2),var(--panel2)) padding-box,linear-gradient(90deg,#ffd6e8,#d6f0ff,#e3ffd6,#fff3c4,#e8d6ff,#ffd6e8) border-box;background-size:auto,auto,240% 100%;animation:tagSheen 3.2s linear infinite alternate;}
.name-tag.border-blackgold{border-color:#e9b949;background:linear-gradient(90deg,rgba(0,0,0,.6),rgba(0,0,0,.28)),var(--panel2);box-shadow:inset 0 0 0 1px #111;}
```

(애니메이션은 기존 `@media (prefers-reduced-motion: reduce){.name-tag{animation:none !important;}}`가 이미 꺼 준다.)

- [ ] **Step 4: 문법 검사** — Expected: `SYNTAX_OK`

- [ ] **Step 5: 화면 검사** — 수집품 → 테두리 탭 스크린샷: 하트 링 위에 ♥, 에메랄드(초록 보석)·루비(빨강 보석)·네온(발광)·크롬(금속)·오팔(파스텔 무지개)·블랙골드(검정+금선)가 구분된다. 각 유료 테두리와 하트를 장착하고 혼자하기를 시작해 내 이름표 스크린샷 — 이름표 높이가 다른 테두리와 같은지 `javascript_tool`로 `document.querySelector('.name-tag').getBoundingClientRect().height` 비교(장착 전후 동일).

- [ ] **Step 6: 커밋·푸시**

```bash
git add index.html && git commit -m "feat: heart border with heart shape; emerald/ruby borders; neon/chrome/opal/black gold paid borders

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push origin main
```

---

### Task 5: 테마 정리 (체리 삭제, 유료 테마 2)

**Files:**
- Modify: `index.html` — `CARD_THEMES`(~899–920행), 테마 스킨 CSS(~206–223행 뒤), 설정 화면 테마 버튼(~3816행)

**Interfaces:**
- Consumes: Task 1의 `paid` 플래그·`isThemeOwned`·`PRICE_LABELS.theme`.
- Produces: 테마 id `neon`(스킨 `board-skin-neon`), `ocean`(스킨 `board-skin-ocean`).

- [ ] **Step 1: 테마 목록** — `CARD_THEMES`에서 `cherry` 항목(4행 중 2행)을 삭제하고, `marble` 항목 뒤에 쉼표와 함께 추가:

```js
  // Paid themes (3,300원): a palette plus a table skin, like the member themes.
  { id:"neon", name:"네온 아케이드", paid:true, skin:"board-skin-neon", isDark:true, bg:"#0D0221", panel:"#1A0638", panel2:"#260A4F",
    text:"#F5EEFF", muted:"#B9A3E3", lineRgb:"255,255,255",
    colors:{ PINK:"#FF3DE6", BLUE:"#39F3FF", YELLOW:"#FFE53D", GREEN:"#3DFF8B" } },
  { id:"ocean", name:"오션 딥", paid:true, skin:"board-skin-ocean", isDark:true, bg:"#03192B", panel:"#06263F", panel2:"#0A3353",
    text:"#E6F6FF", muted:"#8FBCD8", lineRgb:"255,255,255",
    colors:{ PINK:"#FF6F91", BLUE:"#4FC3F7", YELLOW:"#FFD54F", GREEN:"#4DE0B5" } }
```

(저장된 `cherry`는 목록에 없어 시작 시 기본 테마로 자동 복귀한다.)

- [ ] **Step 2: 스킨 CSS** — `.board-skin-marble{...}` 블록 뒤에:

```css
.board-skin-neon{
  --skin-bg:linear-gradient(rgba(57,243,255,.07) 1px,transparent 1px) 0 0/24px 24px,linear-gradient(90deg,rgba(255,61,230,.07) 1px,transparent 1px) 0 0/24px 24px,radial-gradient(ellipse at 50% 110%,rgba(255,61,230,.28),transparent 60%),linear-gradient(180deg,#140533,#0a0118);
  --skin-floor-bg:rgba(10,1,24,.55);
  --skin-floor-border:#39f3ff;
  --skin-floor-shadow:0 0 10px rgba(57,243,255,.45),inset 0 0 12px rgba(255,61,230,.22);
}
.board-skin-ocean{
  --skin-bg:radial-gradient(ellipse at 30% -10%,rgba(120,220,255,.24),transparent 55%),repeating-linear-gradient(100deg,rgba(255,255,255,.025) 0 2px,transparent 2px 18px),linear-gradient(180deg,#0a3a5c,#031626);
  --skin-floor-bg:rgba(3,22,38,.45);
  --skin-floor-border:#4fc3f7;
  --skin-floor-shadow:inset 0 0 0 3px rgba(0,0,0,.25),0 4px 14px rgba(0,30,60,.5);
}
```

- [ ] **Step 3: 설정 화면 표시** — 테마 버튼 이름 줄을:

```js
    tb.appendChild(el("span","pattern-name", (theme.member?"👑 ":theme.paid?"💎 ":"")+theme.name));
```

- [ ] **Step 4: 문법 검사** — Expected: `SYNTAX_OK`

- [ ] **Step 5: 화면 검사**
  - `?nodev=1` 수집품 → 테마 탭: 클라우드·자수정·포레스트(기본 테마) → 네온 아케이드·오션 딥 "🔒 미보유 / 💎 3,300원" → 멤버 3종 "👑 멤버십 전용". 체리 없음. 설정 화면 테마 버튼에 💎 표시·잠금.
  - `/`(개발자): 네온 아케이드·오션 딥을 각각 적용하고 혼자하기 게임 화면 스크린샷 — 바닥판 테두리 발광/청록, 카드 색 대비가 읽힌다.
  - 콘솔 오류 0건.

- [ ] **Step 6: 커밋·푸시**

```bash
git add index.html && git commit -m "feat: remove cherry theme; neon arcade and ocean deep paid themes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push origin main
```

---

### Task 6: 멤버 전용 캐릭터 + 문서 갱신

**Files:**
- Modify: `index.html` — `CHARACTERS`(~997–1012행)
- Modify: `docs/superpowers/specs/2026-10-03-collectibles-redesign.md`, `docs/next-session.md`, `docs/roadmap.md`(유료 아이템/수집품 항목이 있으면 상태 갱신)

**Interfaces:**
- Consumes: Task 1의 `member` 플래그(아바타 선택·온라인 대기실·수집품 잠금은 모두 `isAvatarUnlocked`를 거치므로 자동 적용).

- [ ] **Step 1: 캐릭터 추가** — `CHARACTERS`에서 이벤트 캐릭터 주석 줄 앞에:

```js
  // Member-only characters.
  { emoji:"🦄", name:"유니콘", member:true },
  { emoji:"🐼", name:"판다 킹", member:true },
```

- [ ] **Step 2: 문법 검사** — Expected: `SYNTAX_OK`

- [ ] **Step 3: 화면 검사**
  - `?nodev=1`: 캐릭터 선택 화면에서 유니콘·판다 킹이 🔒로 비활성. 수집품 아바타 탭에서 업적 캐릭터 → 멤버 2종 "👑 멤버십 전용"(미보유 줄 없음) → 이벤트 2종 순서.
  - `/`: 유니콘 선택 가능, 혼자하기 이름표에 🦄.
  - 온라인 대기실은 같은 `isAvatarUnlocked`를 쓰므로 코드 확인으로 갈음(~2287행).

- [ ] **Step 4: 문서 갱신**
  - 수집품 스펙: 패턴·칭호·테두리·테마·그랜드마스터 제목에 "**구현 완료(2026-10-03)**" 표시, "남은 디자인 작업" 줄을 "완료"로.
  - `docs/next-session.md`: "이번 세션에서 할 것" 2번을 완료로 바꾸고, 다음 할 일을 3번(구글 로그인 계획서 → 개발)로 올린다. 진행 기록에 "(2026-10-03) 수집품 개편 나머지 + 첫 출시 유료 아이템 정의·가격 표시 구현(`?nodev=1`로 로컬에서 잠금 화면 확인 가능)" 추가.

- [ ] **Step 5: 커밋·푸시**

```bash
git add index.html docs && git commit -m "feat: unicorn and panda king member characters; docs: collectibles redesign done

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push origin main
```

---

## 범위 밖 (후속 계획)

- 구글 로그인·`users/{uid}`·`entitlements`·`devAccounts` 역할 판정(→ `hasMembership()`/`isDevAccount()` 교체, 유료 아이템 개별 소유), 숨은 전적·밸런스 데이터, 보안 규칙 재작성, 인앱 브라우저 안내 — next-session 3번 계획서에서.
- 구매 버튼·결제.
- AI 상대는 지금처럼 모든 캐릭터에서 무작위로 고른다(이벤트·멤버 캐릭터 포함). 바꿀지 사용자 확인 필요.
