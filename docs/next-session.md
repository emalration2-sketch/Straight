# 다음 세션 인수인계 (2026-10-02 작성)

새 세션에서 **구글 로그인 구현(4단계)** 부터 시작한다. 이 문서와 아래 문서를 먼저 읽을 것.

- 스펙(확정): `docs/superpowers/specs/2026-10-02-account-monetization-design.md`
- 로드맵: `docs/roadmap.md`
- 게임 본체: `index.html` (단일 파일, 빌드 없음, GitHub Pages 배포)

## 작업 규칙

- 사용자는 한국어로 대화. 작업이 끝나고 검증되면 **바로 커밋하고 `origin/main`에 푸시**한다.
- 문법 검사: `index.html`의 `<script type="module">` 내용을 추출해 `node --check`.
- 화면 확인: `.claude/launch.json`의 `straight-game`(포트 5175) 미리보기. 로컬호스트는 지금 임시로 "개발자 계정"으로 취급된다(`isDevAccount()`).
- Firebase 콘솔은 Claude 앱 브라우저 창에서 사용자가 직접 로그인한 뒤에만 조작 가능(비밀번호 입력 금지). 콘솔 설정 변경(저장·게시)은 실행 전 사용자 확인.

## 오늘까지 끝난 것

- Firestore 보안 규칙 게시 완료(저장소 `firestore.rules` 그대로). 확인: 방 목록 조회 403, 정상 코드 방 조회 200.
- 그랜드마스터 세트(칭호·테두리·패턴 모두 "그랜드마스터", 게임 시작 로그 알림), 멤버십 전용 테마 3종(그린 펠트·월넛 테이블·블랙 마블), VIP 배지, 수집품 "테마" 탭.
- AI 난이도 차이 강화(`aiDecide` 순수 함수, 시뮬레이션으로 검증).
- 기본 테두리 골드 → 코랄.

## 이번 세션에서 처리할 것 (아직 안 됨)

1. ~~Firebase 콘솔 작업~~ → **완료**(아래 진행 기록).
2. **첫 출시 유료 아이템 구성 결정**(사용자 결정 대기): 테두리·패턴·테마·멤버 전용 캐릭터 개수. 추천: 테두리 4, 패턴 4, 테마 2, 멤버 캐릭터 2.
3. **구현 계획서 작성 → 개발**(superpowers:writing-plans → 실행). 순서:
   1. 구글 로그인(필수) + `users/{uid}` 진행도 저장(기존 localStorage 진행도는 이관 안 함, "기존 플레이어 전부 해금" 규칙 제거)
   2. `devAccounts` 역할(dev/tester) 판정 + `entitlements/{uid}` 권한 → `isDevAccount()`/`hasMembership()` 임시 판정 교체
   3. 숨은 전적(`users/{uid}.record`)과 밸런스 데이터(`balanceLogs`, dev만 읽기)
   4. 보안 규칙을 "로그인한 사용자만"으로 재작성·게시(`users`, `entitlements`, `devAccounts`, `balanceLogs`, `rooms`)
   5. 수집품에 유료 아이템 가격 표시(결제는 후속 단계)
   - 카카오톡 등 인앱 브라우저 감지 → "Chrome/Safari로 열기" 안내 포함.

## 사용자 확인 대기

- 어려움 AI가 견제할 때 상대 손패를 참고하는 것: 사용자가 몇 판 해 본 뒤 판단. 적당한 때 물어볼 것.

## 진행 기록

- (2026-10-02) Firestore 보안 규칙 게시 완료(저장소 `firestore.rules`). 확인: `rooms` 목록 403, 정상 코드 조회 200.
- (2026-10-02) Authentication 시작 + **Google 로그인 사용 설정됨**. 공개 프로젝트 이름 "스트레이트!", 지원 이메일 emalration2@gmail.com.
- (2026-10-02) 승인 도메인에 `emalration2-sketch.github.io` 추가(기본: localhost, straight-game.firebaseapp.com, straight-game.web.app).
- (2026-10-02) Firestore `devAccounts/emalration2@gmail.com {role:"dev"}`, `devAccounts/dlatnwls0624@gmail.com {role:"tester"}` 생성. 현재 규칙상 비로그인 읽기 403(로그인 규칙 작성 시 본인 이메일 문서만 읽기 허용하도록 추가할 것).
