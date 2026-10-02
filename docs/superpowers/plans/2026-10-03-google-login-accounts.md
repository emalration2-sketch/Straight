# 구글 로그인 · 계정 데이터 · 권한 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 구글 로그인을 필수로 만들고, 진행도를 `users/{uid}`에 저장하며, `devAccounts`·`entitlements`로 개발자·테스터·멤버십·유료 아이템 소유를 판정하고, 숨은 전적과 밸런스 로그를 쌓고, 보안 규칙을 "로그인한 사용자만"으로 바꾼다.

**Architecture:** 단일 `index.html`의 모듈 스크립트에서 게임 본체 IIFE를 `startGame()` 함수로 바꾸고, 그 앞에 **로그인 관문**(Firebase Auth + Firestore 읽기)을 둔다. 관문은 로그인 → 계정 문서 3개 읽기 → 계정 진행도를 localStorage에 채움(계정별 캐시) → `startGame()` 순서로 동작하므로, localStorage를 동기적으로 읽는 기존 게임 코드는 거의 그대로 둔다. 저장은 판 종료·꾸미기 변경·탭 숨김 때만 `users/{uid}`에 한 번 쓴다.

**Tech Stack:** Vanilla JS(ES5 스타일), Firebase JS SDK 10.13.0 (app/auth/firestore, gstatic CDN 동적 import), Firestore 보안 규칙 v2, Node(`node --check`).

**Spec:** [계정·부분 유료화 설계 섹션 1·2·3·4](../specs/2026-10-02-account-monetization-design.md)

## Global Constraints

- **구글 로그인 필수.** 로그인 전에는 게임 진입 불가. 첫 로그인 때 닉네임 설정(구글 이름 기본값, 최대 12자 — 기존 `applyNickname` 규칙과 동일).
- **기존 localStorage 진행도는 이관하지 않는다.** 계정 데이터가 유일한 기준.
- `entitlements/{uid}`: 본인 읽기만, 쓰기는 콘솔만. 필드 `items: [...]`(구매한 영구 아이템 id), `membershipUntil`(만료 시각).
- 특수 계정 = `devAccounts/{Gmail}` 문서의 `role`. **코드에 이메일을 넣지 않는다.** `email_verified`일 때만 본인 문서 읽기 허용, 쓰기 금지.
  - `dev`: 모든 업적·유료·멤버·이벤트 아이템 + VIP + 그랜드마스터 + `balanceLogs` 읽기.
  - `tester`: 위와 같되 `balanceLogs` 읽기 불가.
- 유료 아이템 id 형식(`entitlements.items`): `"<종류>:<id>"` — 예 `"border:neon"`, `"pattern:onyx"`, `"theme:ocean"`.
- 멤버십 만료 시 유료·멤버 아이템은 자동으로 기본값으로 돌아간다(기존 로드 시 소유 검사로 처리됨).
- 숨은 전적 `users/{uid}.record = { wins, losses, draws, games, solo:{…}, online:{…} }` — 화면에 표시하지 않는다.
- `balanceLogs`: 판마다 익명 문서 1개(uid·닉네임·이메일 금지). 로그인 사용자는 추가만, 읽기는 `role:"dev"`만.
- 카카오톡 등 인앱 브라우저는 감지해 "Chrome/Safari로 열기" 안내.
- 화면 문구에 "개발자 계정" 같은 내부 표현 금지.
- Firebase 콘솔 조작은 사용자가 Claude 앱 브라우저 창에서 직접 로그인한 뒤에만, **게시 전 사용자 확인**. 비밀번호 입력 금지.
- 각 태스크 검증 후 **바로 커밋·`origin/main` 푸시**.

## 검증 방법 (공통)

1. 문법: 
```bash
bash "$TEMP/sgcheck.sh"
```
(`$TEMP/sgcheck.sh`가 없으면: `cd /c/Users/jin/holdme/straight-game && node -e "const s=require('fs').readFileSync('index.html','utf8');const m=[...s.matchAll(/<script type=\"module\">([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n');require('fs').writeFileSync(process.env.TEMP+'/sg.mjs',m)" && node --check "$TEMP/sg.mjs" && echo SYNTAX_OK`) — Expected `SYNTAX_OK`.
2. 화면: 브라우저 창에서 `http://localhost:5175/` (다른 대화의 서버가 같은 폴더를 띄우고 있으면 그 주소로 바로 이동). **구글 로그인은 사용자가 직접** 브라우저 창에서 한다 — 로그인이 필요한 단계에서 사용자에게 요청하고 기다린다. `localhost`는 승인 도메인에 이미 있다.
3. Firestore 문서 확인: 페이지 안에서 `javascript_tool`로 직접 읽을 수 없으므로(모듈 스코프), 콘솔(Firestore 데이터 화면)에서 사용자 로그인 상태로 확인하거나 게임 동작(새로고침 후 진행도 유지 등)으로 확인한다.

---

### Task 1: 보안 규칙 v2 (추가형) 작성·게시

기존 `rooms` 규칙은 그대로 두고 새 컬렉션 규칙만 추가한다(지금 라이브 클라이언트가 깨지지 않게). `rooms`의 로그인 강제는 Task 6에서.

**Files:**
- Modify: `firestore.rules` (전체 교체)

**Interfaces:**
- Produces: 컬렉션 `users/{uid}`, `entitlements/{uid}`, `devAccounts/{email}`, `balanceLogs/{autoId}` 접근 규칙. `balanceLogs` 허용 필드: `players, mode, aiDifficulty, firstSeat, winnerSeat, winnerOrder, turns, jokers, bombs, autoResets, straight, at`.

- [ ] **Step 1: 규칙 파일 교체**

```
rules_version = '2';

// Signed-in players (Google) own users/{uid}. Entitlements and devAccounts are written
// only from the console. balanceLogs are anonymous append-only game summaries that only
// the developer role can read.
// Deploy: Firebase console > Firestore Database > Rules > paste > Publish.
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn(){ return request.auth != null; }
    function verifiedEmail(){
      return signedIn() && request.auth.token.email_verified == true;
    }
    function devRole(){
      return verifiedEmail()
        && exists(/databases/$(database)/documents/devAccounts/$(request.auth.token.email))
        && get(/databases/$(database)/documents/devAccounts/$(request.auth.token.email)).data.role == 'dev';
    }

    match /users/{uid} {
      allow read, create, update: if signedIn() && request.auth.uid == uid;
      allow delete: if false;
    }
    match /entitlements/{uid} {
      allow read: if signedIn() && request.auth.uid == uid;
      allow write: if false;
    }
    match /devAccounts/{email} {
      allow get: if verifiedEmail() && request.auth.token.email == email;
      allow list, write: if false;
    }
    match /balanceLogs/{id} {
      allow create: if signedIn()
        && request.resource.data.keys().hasOnly(['players','mode','aiDifficulty','firstSeat','winnerSeat','winnerOrder','turns','jokers','bombs','autoResets','straight','at'])
        && request.resource.data.players is int
        && request.resource.data.players >= 2 && request.resource.data.players <= 4
        && request.resource.data.mode in ['solo', 'online'];
      allow read: if devRole();
      allow update, delete: if false;
    }

    match /rooms/{code} {
      allow get: if code.matches('^[A-HJ-NP-Z2-9]{5}$');
      allow list: if false;
      allow create: if code.matches('^[A-HJ-NP-Z2-9]{5}$')
        && request.resource.data.phase == 'lobby'
        && request.resource.data.players is list
        && request.resource.data.players.size() <= 4;
      allow update: if request.resource.data.players is list
        && request.resource.data.players.size() <= 4
        && request.resource.data.phase in ['lobby', 'playing'];
      allow delete: if false;
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 2: 게시** — 사용자에게 브라우저 창에서 Firebase 콘솔(`https://console.firebase.google.com/project/straight-game/firestore/rules`) 로그인을 요청. 편집기 내용을 위 규칙으로 바꾼 뒤, **게시 직전 사용자 확인**을 받고 "게시". (편집기 전체 선택 후 붙여넣기: 편집기 클릭 → `ctrl+a` → `type`으로 입력.)

- [ ] **Step 3: 확인** — 콘솔 규칙 화면에 새 규칙과 게시 시각이 보인다. 라이브 사이트 `https://emalration2-sketch.github.io/Straight/`에서 온라인 방 만들기가 여전히 된다(rooms 규칙 불변).

- [ ] **Step 4: 커밋·푸시**

```bash
git add firestore.rules && git commit -m "feat(rules): users, entitlements, devAccounts, balanceLogs rules (rooms unchanged)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push origin main
```

---

### Task 2: 로그인 관문 + 인앱 브라우저 안내 + 첫 닉네임

**Files:**
- Modify: `index.html` — CSS(`.unlock-popup` 규칙 근처에 추가), HTML(`<div id="tooltip-layer"></div>` 바로 앞에 관문 추가), 모듈 스크립트 상단 `ensureFirebase()`(~633–653행), 게임 IIFE 시작 `(function(){`(~655행)와 끝 `})();`(파일 끝 `</script>` 직전), 설정 모달(~3918–3972행)

**Interfaces:**
- Produces (모듈 최상위, 게임 코드에서 사용):
  - `fbFs` — firestore 모듈 객체(`doc, getDoc, setDoc, addDoc, collection, increment, serverTimestamp` 등)
  - `fbAuth`, `fbAuthApi` — auth 인스턴스와 auth 모듈 객체
  - `account` — 로그인 전 `null`, 이후 `{ uid, email, role: "dev"|"tester"|null, items: string[], membershipUntil: number(ms) }`
  - `SYNCED_KEYS` — 계정에 저장되는 localStorage 키 목록
  - `startGame()` — 게임 본체(기존 IIFE). **딱 한 번** 호출.
  - `signOutAndReload()`

- [ ] **Step 1: `ensureFirebase` 확장** — 기존 함수와 변수 선언을 교체:

```js
var fbDb = null, fbDoc = null, fbSetDoc = null, fbUpdateDoc = null, fbGetDoc = null, fbOnSnapshot = null, fbRunTransaction = null;
var fbFs = null, fbAuth = null, fbAuthApi = null;
var fbReadyPromise = null;
function ensureFirebase(){
  if(fbReadyPromise) return fbReadyPromise;
  fbReadyPromise = Promise.all([
    import("https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js"),
    import("https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js")
  ]).then(function(mods){
    var appMod = mods[0], fsMod = mods[1], authMod = mods[2];
    var fbApp = appMod.initializeApp(firebaseConfig);
    fbDb = fsMod.getFirestore(fbApp);
    fbFs = fsMod;
    fbDoc = fsMod.doc;
    fbSetDoc = fsMod.setDoc;
    fbUpdateDoc = fsMod.updateDoc;
    fbGetDoc = fsMod.getDoc;
    fbOnSnapshot = fsMod.onSnapshot;
    fbRunTransaction = fsMod.runTransaction;
    fbAuthApi = authMod;
    fbAuth = authMod.getAuth(fbApp);
  }).catch(function(e){
    fbReadyPromise = null;
    throw e;
  });
  return fbReadyPromise;
}
```

그리고 위의 파일 상단 주석("Firebase is loaded lazily …")을 다음으로 교체:

```js
/* Firebase (app, auth, firestore) loads at startup: Google sign-in is required before
   the game starts, and the account's progress lives in Firestore users/{uid}. */
```

- [ ] **Step 2: 게임 IIFE를 함수로** — `(function(){` + 다음 줄 `"use strict";`를

```js
function startGame(){
"use strict";
```

로, 파일 끝 `</script>` 바로 앞의 `})();`를 `}`로 바꾼다.

- [ ] **Step 3: 관문 HTML** — `<div id="tooltip-layer"></div>` 바로 앞에:

```html
<div class="login-gate" id="login-gate">
  <div class="login-card">
    <div class="login-logo">스트레이트<span>!</span></div>
    <p class="login-msg" id="login-msg">불러오는 중...</p>
    <div class="login-inapp hidden" id="login-inapp">
      <p>카카오톡·인스타그램 등 앱 안의 브라우저에서는 구글 로그인이 막혀 있어요.<br><b>Chrome</b> 또는 <b>Safari</b>로 열어 주세요.</p>
      <button class="btn primary" id="login-open-external">다른 브라우저로 열기</button>
      <button class="btn" id="login-copy-link">링크 복사</button>
    </div>
    <button class="btn primary big hidden" id="login-google-btn">G&nbsp; Google로 시작하기</button>
    <div class="login-nick hidden" id="login-nick">
      <p>게임에서 쓸 닉네임을 정해 주세요</p>
      <input type="text" class="nickname-input" id="login-nick-input" maxlength="12">
      <button class="btn primary" id="login-nick-btn">시작하기</button>
    </div>
    <button class="btn hidden" id="login-retry-btn">다시 시도</button>
  </div>
</div>
```

- [ ] **Step 4: 관문 CSS** — `.unlock-popup-head{…}` 줄 뒤에:

```css
.login-gate{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg);}
.login-gate.hidden{display:none;}
.login-card{width:100%;max-width:340px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;}
.login-logo{font-family:var(--font-display);font-size:40px;color:var(--text);}
.login-logo span{color:var(--pink);}
.login-msg{font-size:13px;color:var(--muted);min-height:1.4em;}
.login-inapp,.login-nick{display:flex;flex-direction:column;gap:8px;width:100%;font-size:13px;color:var(--text);line-height:1.5;}
.login-inapp.hidden,.login-nick.hidden{display:none;}
.login-nick .nickname-input{width:100%;text-align:center;font-size:15px;padding:10px;}
```

- [ ] **Step 5: 관문 로직** — `ensureFirebase` 함수 바로 뒤(=`function startGame(){` 앞)에:

```js
/* ---------------- account (Google sign-in gate) ---------------- */
var account = null;
// localStorage keys that belong to the signed-in account (mirrored to users/{uid}.progress).
var SYNCED_KEYS = ["straightStats","straightUnlocks","straightUnlocksVer","straightNewUnlocks",
  "straightActiveTitle","straightActiveBorder","straightDefaultAvatar","straightArtPreset",
  "straightCardTheme","straightNickname","straightAiDifficulty"];

function gateEl(id){ return document.getElementById(id); }
function showGate(mode, msg){
  gateEl("login-gate").classList.remove("hidden");
  gateEl("login-msg").textContent = msg || "";
  gateEl("login-google-btn").classList.toggle("hidden", mode!=="signin");
  gateEl("login-inapp").classList.toggle("hidden", mode!=="inapp");
  gateEl("login-nick").classList.toggle("hidden", mode!=="nickname");
  gateEl("login-retry-btn").classList.toggle("hidden", mode!=="error");
}
function isInAppBrowser(){
  return /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp|; wv\)/i.test(navigator.userAgent);
}
function openInExternalBrowser(){
  var url = location.href;
  if(/KAKAOTALK/i.test(navigator.userAgent)){
    location.href = "kakaotalk://web/openExternal?url="+encodeURIComponent(url);
  } else if(/Android/i.test(navigator.userAgent)){
    location.href = "intent://"+location.host+location.pathname+location.search+"#Intent;scheme=https;package=com.android.chrome;end";
  } else {
    gateEl("login-msg").textContent = "오른쪽 아래(또는 위) ⋯ 메뉴에서 'Safari로 열기'를 눌러 주세요.";
  }
}
function toMillis(v){
  if(!v) return 0;
  if(typeof v.toMillis==="function") return v.toMillis();
  var n = Number(v);
  return isFinite(n) ? n : 0;
}
// The account's saved progress replaces whatever another account (or a pre-login
// session) left in this browser; nothing from before sign-in is carried over.
function hydrateProgress(uid, data){
  try{
    var prevUid = localStorage.getItem("straightAccountUid");
    var progress = data && data.progress && typeof data.progress==="object" ? data.progress : null;
    if(progress || prevUid!==uid){
      SYNCED_KEYS.forEach(function(k){ localStorage.removeItem(k); });
    }
    if(progress){
      SYNCED_KEYS.forEach(function(k){ if(typeof progress[k]==="string") localStorage.setItem(k, progress[k]); });
    }
    localStorage.setItem("straightAccountUid", uid);
  }catch(e){}
}
function loadAccount(user){
  var F = fbFs;
  var email = user.email || "";
  return Promise.all([
    F.getDoc(F.doc(fbDb,"users",user.uid)),
    F.getDoc(F.doc(fbDb,"entitlements",user.uid)).catch(function(){ return null; }),
    (email && user.emailVerified) ? F.getDoc(F.doc(fbDb,"devAccounts",email)).catch(function(){ return null; }) : Promise.resolve(null)
  ]).then(function(r){
    var userSnap = r[0], entSnap = r[1], devSnap = r[2];
    var ent = entSnap && entSnap.exists() ? entSnap.data() : {};
    var dev = devSnap && devSnap.exists() ? devSnap.data() : {};
    account = {
      uid: user.uid, email: email,
      role: (dev.role==="dev" || dev.role==="tester") ? dev.role : null,
      items: Array.isArray(ent.items) ? ent.items.map(String) : [],
      membershipUntil: toMillis(ent.membershipUntil)
    };
    hydrateProgress(user.uid, userSnap.exists() ? userSnap.data() : null);
    return userSnap.exists();
  });
}
var gameStarted = false;
function enterGame(){
  if(gameStarted) return;
  gameStarted = true;
  gateEl("login-gate").classList.add("hidden");
  startGame();
}
function cleanNick(s){ return String(s==null?"":s).replace(/[<>&"'`]/g,"").trim().slice(0, 12); }
function askNickname(defaultName){
  showGate("nickname", "");
  var input = gateEl("login-nick-input");
  input.value = cleanNick(defaultName);
  gateEl("login-nick-btn").onclick = function(){
    var nick = cleanNick(input.value);
    if(!nick){ input.focus(); return; }
    try{ localStorage.setItem("straightNickname", nick); }catch(e){}
    var F = fbFs;
    F.setDoc(F.doc(fbDb,"users",account.uid), {
      progress: { straightNickname: nick }, createdAt: F.serverTimestamp(), updatedAt: F.serverTimestamp()
    }, { merge:true }).catch(function(e){ console.error("계정 생성 실패", e); });
    enterGame();
  };
}
function signInWithGoogle(){
  var provider = new fbAuthApi.GoogleAuthProvider();
  fbAuthApi.signInWithPopup(fbAuth, provider).catch(function(e){
    if(e && e.code==="auth/popup-blocked") return fbAuthApi.signInWithRedirect(fbAuth, provider);
    if(e && (e.code==="auth/popup-closed-by-user" || e.code==="auth/cancelled-popup-request")) return;
    console.error("로그인 실패", e);
    showGate("signin", "로그인에 실패했어요. 다시 시도해 주세요.");
  });
}
function signOutAndReload(){
  var p = fbAuth ? fbAuthApi.signOut(fbAuth) : Promise.resolve();
  p.then(function(){ location.reload(); }, function(){ location.reload(); });
}
function bootAuth(){
  if(isInAppBrowser()){ showGate("inapp", ""); return; }
  showGate("loading", "불러오는 중...");
  ensureFirebase().then(function(){
    fbAuthApi.onAuthStateChanged(fbAuth, function(user){
      if(gameStarted) return;
      if(!user){ showGate("signin", "구글 계정으로 로그인하면 기록이 저장돼요."); return; }
      showGate("loading", "계정 불러오는 중...");
      loadAccount(user).then(function(hasDoc){
        if(hasDoc) enterGame();
        else askNickname(user.displayName || "");
      }).catch(function(e){
        console.error("계정 불러오기 실패", e);
        showGate("error", "계정을 불러오지 못했어요. 네트워크를 확인해 주세요.");
      });
    });
  }).catch(function(e){
    console.error("Firebase 로드 실패", e);
    showGate("error", "연결에 실패했어요. 네트워크를 확인해 주세요.");
  });
}
gateEl("login-google-btn").addEventListener("click", signInWithGoogle);
gateEl("login-retry-btn").addEventListener("click", function(){ location.reload(); });
gateEl("login-open-external").addEventListener("click", openInExternalBrowser);
gateEl("login-copy-link").addEventListener("click", function(){
  var done = function(){ gateEl("login-msg").textContent = "링크를 복사했어요. Chrome/Safari 주소창에 붙여 넣어 주세요."; };
  if(navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, done); else done();
});
```

그리고 파일 끝 `}`(Step 2에서 바꾼 줄) **바로 뒤**, `</script>` 앞에:

```js
bootAuth();
```

- [ ] **Step 6: 설정에 로그아웃** — 설정 모달에서 `var quitRow = null;` 바로 앞에:

```js
  var logoutRow = el("div","settings-row");
  logoutRow.style.justifyContent = "center";
  logoutRow.style.borderBottom = "none";
  var logoutBtn = el("button","btn","🚪 로그아웃");
  logoutBtn.style.width = "100%";
  logoutBtn.addEventListener("click", function(){
    if(!confirm("로그아웃할까요?")) return;
    saveProgressNow().then(signOutAndReload);
  });
  logoutRow.appendChild(logoutBtn);
```

`if(!nickLocked) box.appendChild(nickRow);` 줄 바로 뒤에:

```js
  if(!inGame) box.appendChild(logoutRow);
```

(`saveProgressNow`는 Task 3에서 정의. Task 2 단계에선 아래 임시 정의를 `SYNCED_KEYS` 선언 바로 뒤에 둔다 — Task 3에서 진짜 구현으로 교체:)

```js
function saveProgressNow(){ return Promise.resolve(); }
```

- [ ] **Step 7: 문법 검사** — Expected `SYNTAX_OK`

- [ ] **Step 8: 화면 검사**
  - `http://localhost:5175/` → 관문이 "불러오는 중..." 후 "Google로 시작하기" 버튼. 그 아래 시작 화면이 비쳐 보이지 않는다.
  - 사용자에게 버튼을 눌러 직접 구글 로그인하도록 요청 → 첫 로그인이면 닉네임 단계(구글 이름이 기본값) → "시작하기" → 시작 화면. 수집품을 열면 진행도가 0(기존 기록 이관 없음).
  - 새로고침 → 로그인 유지, 닉네임 단계 없이 바로 시작 화면.
  - 설정 → "🚪 로그아웃" → 확인 → 관문으로 돌아감.
  - 인앱 브라우저 안내: 모듈 스코프라 페이지에서 직접 호출할 수 없으므로 코드 리뷰로 확인하고, Task 6 이후 사용자에게 휴대폰 카카오톡에서 라이브 링크를 열어 안내 화면이 뜨는지 확인을 요청한다.
  - 콘솔 오류 0건(로그인 팝업 닫힘 오류 제외).

- [ ] **Step 9: 커밋·푸시** — 주의: 이 커밋부터 라이브 사이트도 로그인이 필요해진다(Task 1 규칙이 이미 게시돼 있어야 함).

```bash
git add index.html && git commit -m "feat: required Google sign-in gate, first-login nickname, in-app browser notice, sign-out

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push origin main
```

---

### Task 3: 진행도 클라우드 저장

**Files:**
- Modify: `index.html` — Task 2의 임시 `saveProgressNow`, `bumpStatAndCheck`(~829행), `recordTutorialDone`(~838행), `saveNewUnlocks`(~859행), `maybeRecordLocalGameResult`(~890행), `setBackPreset`(~919행), `setCardTheme`(~1036행), `setActiveTitle`/`setActiveBorder`/`setDefaultAvatar`(~1109–1130행), `applyNickname`(~2031행), AI 난이도 저장(~2208행)

**Interfaces:**
- Consumes: `account`, `SYNCED_KEYS`, `fbFs`, `fbDb`.
- Produces: `saveProgressNow() -> Promise`, `saveProgressSoon()`(1.5초 디바운스), `markProgressDirty()`.

- [ ] **Step 1: 저장 함수** — 임시 `saveProgressNow` 한 줄을 교체:

```js
// Writes happen only at game end, on cosmetic changes and when the tab is hidden, so a
// game costs about one write. Mid-game stat bumps just mark the progress dirty.
var progressSaveTimer = null, progressDirty = false;
function collectProgress(){
  var out = {};
  SYNCED_KEYS.forEach(function(k){
    try{ var v = localStorage.getItem(k); if(v!==null) out[k] = v; }catch(e){}
  });
  return out;
}
function saveProgressNow(){
  if(!account || !fbDb) return Promise.resolve();
  clearTimeout(progressSaveTimer); progressSaveTimer = null;
  progressDirty = false;
  var F = fbFs;
  return F.setDoc(F.doc(fbDb,"users",account.uid), { progress: collectProgress(), updatedAt: F.serverTimestamp() }, { merge:true })
    .catch(function(e){ progressDirty = true; console.error("진행도 저장 실패", e); });
}
function saveProgressSoon(){
  if(!account) return;
  progressDirty = true;
  clearTimeout(progressSaveTimer);
  progressSaveTimer = setTimeout(saveProgressNow, 1500);
}
function markProgressDirty(){ progressDirty = true; }
document.addEventListener("visibilitychange", function(){
  if(document.visibilityState==="hidden" && progressDirty) saveProgressNow();
});
```

- [ ] **Step 2: 훅 연결** — 각 함수 본문 **마지막 줄**에 추가:
  - `bumpStatAndCheck` → `markProgressDirty();`
  - `recordTutorialDone` → `saveProgressSoon();` (함수 첫 줄 `if(stats.tutorialDone) return;` 이후 경로의 끝)
  - `saveNewUnlocks` → `saveProgressSoon();`
  - `setBackPreset` → `saveProgressSoon();`
  - `setCardTheme` → `saveProgressSoon();`
  - `setActiveTitle` → `saveProgressSoon();`
  - `setActiveBorder` → `saveProgressSoon();`
  - `setDefaultAvatar` → `saveProgressSoon();`
  - `applyNickname` → `saveProgressSoon();`
  - AI 난이도 저장 줄 `try{ localStorage.setItem("straightAiDifficulty", pair[0]); }catch(e){}` 바로 뒤 → `saveProgressSoon();`
  - `maybeRecordLocalGameResult`를:

```js
function maybeRecordLocalGameResult(outcome, meta){
  if(state.statsRecorded) return;
  state.statsRecorded = true;
  recordGameResult(outcome, meta);
  saveProgressNow();
}
```

- [ ] **Step 3: 문법 검사** — Expected `SYNTAX_OK`

- [ ] **Step 4: 화면 검사** (사용자 로그인 상태)
  - 수집품에서 테두리 장착 → 2초 대기 → 새로고침 → 같은 테두리가 장착돼 있다.
  - 혼자하기 한 판 끝까지(쉬움, 2인) → 새로고침 → 수집품 진행도 "플레이 1/10판"이 유지된다.
  - 콘솔에 "진행도 저장 실패" 없음.
  - (선택) 사용자 확인 하에 Firestore 콘솔 `users/{uid}` 문서에 `progress` 맵이 보인다.

- [ ] **Step 5: 커밋·푸시**

```bash
git add index.html && git commit -m "feat: save account progress to users/{uid} at game end, on cosmetic changes and on tab hide

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push origin main
```

---

### Task 4: 역할·권한 판정 교체 (dev/tester/멤버십/유료 소유)

**Files:**
- Modify: `index.html` — `isDevAccount`/`hasMembership`(~927–937행 블록과 주석), `specialItemOwned`와 그 호출부, `isGrandMaster`, `isAvatarUnlocked`/`isPatternUnlocked`/`isTitleUnlocked`/`isBorderUnlocked`/`isThemeOwned`

**Interfaces:**
- Consumes: `account`.
- Produces: `accountRole() -> "dev"|"tester"|null`, `isDevAccount()`, `isSpecialAccount()`, `hasMembership()`, `ownsItem(kind, id)`, `specialItemOwned(kind, preset)`.

- [ ] **Step 1: 판정 함수 교체** — 기존 주석 블록("Membership will come from …")과 `isDevAccount`, `hasMembership` 정의를 교체:

```js
// Roles come from devAccounts/{gmail} (console-only); membership and bought items from
// entitlements/{uid}. ?nodev previews the game as an ordinary player.
function accountRole(){
  if(/[?&]nodev\b/.test(location.search)) return null;
  return account ? account.role : null;
}
function isDevAccount(){ return accountRole()==="dev"; }
// Developer and tester accounts both get every item, VIP and Grand Master.
function isSpecialAccount(){ var r = accountRole(); return r==="dev" || r==="tester"; }
function hasMembership(){
  if(isSpecialAccount()) return true;
  return !!account && !/[?&]nodev\b/.test(location.search) && account.membershipUntil > Date.now();
}
function ownsItem(kind, id){
  return !!account && !/[?&]nodev\b/.test(location.search) && account.items.indexOf(kind+":"+id)!==-1;
}
```


- [ ] **Step 2: `specialItemOwned`에 종류 인자** — 교체:

```js
// Items no achievement grants: events (special accounts only until events run), member
// items (membership) and paid items (membership or bought in entitlements.items).
function specialItemOwned(kind, p){
  if(p.event) return isSpecialAccount();
  if(p.member) return hasMembership();
  if(p.paid) return hasMembership() || ownsItem(kind, p.id || p.name);
  return null;
}
```

호출부 4곳 수정: `isThemeOwned` → `specialItemOwned("theme", theme)`, `isAvatarUnlocked` → `specialItemOwned("avatar", ch)`, `isPatternUnlocked` → `specialItemOwned("pattern", preset)`, `isBorderUnlocked` → `specialItemOwned("border", preset)`.

- [ ] **Step 3: 특수 계정 = 전부 해금** — 다섯 함수의 첫 줄에 추가:
  - `isThemeOwned`: `if(!theme) return false;` 다음 줄에 `if(isSpecialAccount()) return true;`
  - `isAvatarUnlocked`: `if(!ch) return false;` 다음 줄에 `if(isSpecialAccount()) return true;`
  - `isPatternUnlocked`, `isTitleUnlocked`, `isBorderUnlocked`: 각각 `if(!preset) return false;` 다음 줄에 `if(isSpecialAccount()) return true;`
  - `isGrandMaster`: `if(isDevAccount()) return true;` → `if(isSpecialAccount()) return true;`

- [ ] **Step 4: 문법 검사** — Expected `SYNTAX_OK`

- [ ] **Step 5: 화면 검사**
  - 사용자(dev 계정 emalration2@gmail.com)로 로그인한 상태: 수집품 모든 탭이 전부 해금(업적·유료·멤버·이벤트), 혼자하기 이름표에 VIP, 게임 시작 로그에 "🏆 그랜드마스터 …님이 함께합니다!".
  - `?nodev=1`: 업적 아이템 잠금, 유료 "💎", 멤버 "👑", VIP 없음.
  - (선택, 사용자 확인 후) 콘솔에서 테스트용으로 `entitlements/{본인 uid}`에 `items:["border:neon"]`를 만들면 `?nodev=1`에서도 네온만 해금 → 확인 후 문서 삭제.

- [ ] **Step 6: 커밋·푸시**

```bash
git add index.html && git commit -m "feat: dev/tester roles from devAccounts, membership and bought items from entitlements

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push origin main
```

---

### Task 5: 숨은 전적 + 밸런스 로그

**Files:**
- Modify: `index.html` — `maybeRecordLocalGameResult`, `state` 초기값(~1687행), 게임 시작 두 곳(온라인 ~2100–2116행, 혼자하기 ~2468–2481행의 `state.statsRecorded = false;` 근처), `pushRoomState`, `sanitizeRoomData`, `applyRemoteRoomState`, `bankJoker`(~2931행), AI 조커(~3120–3127행), `useResetCard`, `resetFloor`

**Interfaces:**
- Consumes: `account`, `fbFs`, `fbDb`, `iAmHost()`, `isMultiplayer()`.
- Produces: `state.balance = { jokers, bombs, autoResets }`(숫자, 방 데이터로 동기화), `recordAccountResult(outcome, online)`, `logBalanceGame()`.

- [ ] **Step 1: 카운터 상태** — `state` 객체의 `prismRanks: []` 앞에 `balance: { jokers:0, bombs:0, autoResets:0 },` 추가. 게임 시작 두 곳에서 `state.statsRecorded = false;` 바로 뒤에:

```js
  state.balance = { jokers:0, bombs:0, autoResets:0 };
```

- [ ] **Step 2: 카운트**
  - `bankJoker`: `player.score.push(joker);` 다음 줄에 `state.balance.jokers++;`
  - AI 조커 루프: `player.score.push(player.hand.splice(jokerIndices[ji],1)[0]);` 다음 줄에 `state.balance.jokers++;`
  - `useResetCard`: `player.hand.splice(handIdx, 1);` 다음 줄에 `state.balance.bombs++;`
  - `resetFloor`: `state.floorResetStreak = …` 다음 줄에 `state.balance.autoResets++;`

- [ ] **Step 3: 방 동기화** — `pushRoomState`의 `floorResetStreak: state.floorResetStreak,` 뒤에 `balance: state.balance,`. `applyRemoteRoomState`의 `state.floorResetStreak = data.floorResetStreak || 0;` 뒤에 `state.balance = data.balance;`. `sanitizeRoomData`의 `return data;` 앞에:

```js
  var bl = data.balance || {};
  data.balance = { jokers:Math.max(0, Number(bl.jokers)||0), bombs:Math.max(0, Number(bl.bombs)||0), autoResets:Math.max(0, Number(bl.autoResets)||0) };
```

- [ ] **Step 4: 기록 함수** — `maybeRecordLocalGameResult` 바로 위에:

```js
// Hidden account record (never shown in game) — for future ranked play and levels.
function recordAccountResult(outcome, online){
  if(!account || !fbDb) return;
  var F = fbFs, inc = F.increment(1);
  var field = outcome==="win" ? "wins" : outcome==="draw" ? "draws" : "losses";
  var bucket = { games:inc }; bucket[field] = inc;
  var record = { games:inc }; record[field] = inc; record[online ? "online" : "solo"] = bucket;
  F.setDoc(F.doc(fbDb,"users",account.uid), { record:record }, { merge:true })
    .catch(function(e){ console.error("전적 저장 실패", e); });
}
// One anonymous summary per finished game (written by the host only online). No uid,
// nickname or email — only the developer role can read these.
function logBalanceGame(){
  if(!account || !fbDb) return;
  var F = fbFs, b = state.balance || {}, ws = state.winnerStraight;
  var hasAI = state.players.some(function(p){ return p && p.isAI; });
  var winner = state.isDraw ? null : state.winnerIndex;
  F.addDoc(F.collection(fbDb,"balanceLogs"), {
    players: state.turnOrder.length,
    mode: isMultiplayer() ? "online" : "solo",
    aiDifficulty: hasAI ? (state.aiDifficulty || null) : null,
    firstSeat: state.turnOrder.length ? state.turnOrder[0] : null,
    winnerSeat: winner,
    winnerOrder: winner===null || winner===undefined ? null : state.turnOrder.indexOf(winner),
    turns: state.turnSeq || 0,
    jokers: b.jokers || 0,
    bombs: b.bombs || 0,
    autoResets: b.autoResets || 0,
    straight: ws ? { color:ws.color, start:ws.start } : null,
    at: F.serverTimestamp()
  }).catch(function(e){ console.error("밸런스 기록 실패", e); });
}
```

`maybeRecordLocalGameResult`를:

```js
function maybeRecordLocalGameResult(outcome, meta){
  if(state.statsRecorded) return;
  state.statsRecorded = true;
  recordGameResult(outcome, meta);
  recordAccountResult(outcome, isMultiplayer());
  if(iAmHost()) logBalanceGame();
  saveProgressNow();
}
```

(`state.turnOrder.length`가 2~4이므로 규칙의 `players` 검사를 통과한다. 혼자하기는 `iAmHost()`가 항상 true.)

- [ ] **Step 5: 문법 검사** — Expected `SYNTAX_OK`

- [ ] **Step 6: 화면 검사**
  - 로그인 상태로 혼자하기 한 판 완료 → 콘솔에 "전적 저장 실패"/"밸런스 기록 실패" 없음.
  - 사용자 확인 하에 Firestore 콘솔: `users/{uid}.record`에 `games:1`과 `solo.games:1`, `balanceLogs`에 새 문서 1개(필드 12개, uid·닉네임 없음).
  - 판 도중 조커를 점수덱에 내려놓은 판이면 `jokers ≥ 1`.

- [ ] **Step 7: 커밋·푸시**

```bash
git add index.html && git commit -m "feat: hidden account record and anonymous balance logs per finished game

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push origin main
```

---

### Task 6: 방 규칙 로그인 강제 + 문서

**Files:**
- Modify: `firestore.rules` — `rooms` 블록
- Modify: `docs/superpowers/specs/2026-10-02-account-monetization-design.md`(하위 프로젝트 표 A·B·D 상태), `docs/next-session.md`, `docs/roadmap.md`(해당 항목이 있으면)

- [ ] **Step 1: rooms 규칙** — `match /rooms/{code}` 블록을:

```
    match /rooms/{code} {
      allow get: if signedIn() && code.matches('^[A-HJ-NP-Z2-9]{5}$');
      allow list: if false;
      allow create: if signedIn() && code.matches('^[A-HJ-NP-Z2-9]{5}$')
        && request.resource.data.phase == 'lobby'
        && request.resource.data.players is list
        && request.resource.data.players.size() <= 4;
      allow update: if signedIn()
        && request.resource.data.players is list
        && request.resource.data.players.size() <= 4
        && request.resource.data.phase in ['lobby', 'playing'];
      allow delete: if false;
    }
```

파일 상단 주석도 "Signed-in players (Google) …"로 이미 바뀌어 있는지 확인(Task 1).

- [ ] **Step 2: 게시** — Task 1 Step 2와 같은 절차(사용자 로그인·게시 전 확인).

- [ ] **Step 3: 확인** — 라이브 사이트(Task 2~5 푸시 후)에서 로그인 → 온라인 방 만들기 → 다른 탭(같은 계정 가능)에서 코드로 입장 → 게임 시작이 된다.

- [ ] **Step 4: 문서**
  - 스펙 하위 프로젝트 표: A "구현 완료(2026-10-0x)", B "구현 완료", D "구현 완료". 상태 줄 유지.
  - `docs/next-session.md`: "이번 세션에서 할 것" 3번의 1~4를 완료로, 남은 일 = 결제(후속), 사용자 확인 대기 항목 유지. 진행 기록에 규칙 게시 2회와 로그인 도입 기록.

- [ ] **Step 5: 커밋·푸시**

```bash
git add firestore.rules docs && git commit -m "feat(rules): rooms require sign-in; docs: login and accounts done

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push origin main
```

---

## 범위 밖

- 결제(토스페이먼츠/포트원 + Cloud Functions)와 구매 버튼, 멤버십 구매·연장.
- 개발자 전용 통계 화면(필요할 때 따로).
- 그랜드마스터·업적 서버 검증(결제 서버와 함께).
