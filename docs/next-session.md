# 다음 세션 인수인계 (2026-10-03 갱신)

새 세션은 이 문서부터 읽고 시작한다. 함께 읽을 문서:

- 계정·유료화 스펙(확정): `docs/superpowers/specs/2026-10-02-account-monetization-design.md`
- 수집품 개편 스펙(확정): `docs/superpowers/specs/2026-10-03-collectibles-redesign.md`
- 로드맵: `docs/roadmap.md`
- 게임 본체: `index.html` (단일 파일, 빌드 없음, GitHub Pages 배포)

## 작업 규칙

- 사용자는 한국어로 대화. 작업이 끝나고 검증되면 **바로 커밋하고 `origin/main`에 푸시**한다.
- 문법 검사: `index.html`의 `<script type="module">` 내용을 추출해 `node --check`.
- 화면 확인: `.claude/launch.json`의 `straight-game`(포트 5175) 미리보기. 로컬호스트는 지금 임시로 개발자 계정으로 취급된다(`isDevAccount()`), 그래서 잠금 상태는 로컬에서 안 보인다.
- 화면 문구에 "개발자 계정" 같은 내부 표현을 쓰지 않는다. 이벤트 아이템은 "🎉 이벤트로 만나요!"처럼 기대감 있게.
- Firebase 콘솔은 Claude 앱 브라우저 창에서 사용자가 직접 로그인한 뒤에만 조작 가능(비밀번호 입력 금지). 콘솔 설정 변경(저장·게시)은 실행 전 사용자 확인. 브라우저 창이 좁으면 대화상자 버튼이 가려지니 대화상자 안을 가로·세로 스크롤해서 찾을 것.

## 지금까지 끝난 것

- Firebase: 보안 규칙 게시, Google 로그인 사용 설정, 승인 도메인 추가, `devAccounts`(dev/tester) 생성 — 아래 진행 기록.
- 그랜드마스터 세트, 멤버십 전용 테마 3종, VIP 배지, 수집품 "테마" 탭, AI 난이도 강화, 기본 테두리 코랄.
- **수집품 개편 중 캐릭터 부분 완료**: 14종(700승 렉스 버서커 신규, 이벤트 캐릭터 썬더 죠스·블랙 스콜피온 잠금), 업적 스키마 4, 온라인 대기실 캐릭터 잠금.

## 이번 세션에서 할 것

1. **첫 출시 유료 아이템 구성 결정**(사용자와 먼저): 유료 테두리·패턴·테마·멤버 전용 캐릭터를 각각 몇 종, 어떤 디자인으로. 추천: 테두리 4, 패턴 4, 테마 2, 멤버 캐릭터 2. 가격은 확정안 그대로(테두리·패턴 2,200원, 테마 3,300원, 멤버십 3,300원/30일).
2. **수집품 개편 나머지 구현**(스펙 2026-10-03): 패턴(로열=기존 골드포일 디자인, 기존 로열 삭제, 벚꽃·눈송이 이벤트), 칭호(12종, 폭탄마·연승 머신 신규, 색깔별 20승), 테두리(15종, 솔라리스·에메랄드·루비, 하트 디자인 변경, 이벤트 4종), 테마(체리 삭제), 그랜드마스터 = 칭호 그랜드마스터·테두리 솔라리스·패턴 로열.
3. **구현 계획서 작성 → 개발**(superpowers:writing-plans → 실행). 순서:
   1. 구글 로그인(필수) + `users/{uid}` 진행도 저장(기존 localStorage 진행도는 이관 안 함)
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
- (2026-10-03) 수집품 개편 확정(스펙 문서), 캐릭터 부분 구현, 온라인 대기실 캐릭터 잠금, 화면 문구에서 "개발자 계정" 표현 제거.
