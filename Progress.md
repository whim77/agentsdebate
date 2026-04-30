# AgentsDebate — Progress

Last updated: 2026-04-30

---

## 제품 한 줄 정의

> 여러 AI가 상호 반론한 후 **모든 AI가 동의한 내용만 추출**하는 도구.
> 반론을 견뎌낸 것만 남는다 = 더 신뢰할 수 있는 결론.

---

## 완료된 작업

### 1. UI 프로토타입 (AgentsDebate v3.html)
- 위치: `/mnt/c/claude_project/agentsdebate/AgentsDebate v3.html`
- 기술: React 18 + Babel CDN, 단일 self-contained HTML 파일
- 상태: **백엔드 없음 — UI 시연용**

---

### 2. Next.js 풀스택 구현 ✅ 완료

**빌드 결과:**
```
▲ Next.js 15.3.1
✓ Compiled successfully
Route (app)
  ○ /             — Chat/Settings/Stats UI (101KB)
  ƒ /api/debate   — SSE 스트리밍 토론 엔드포인트
```

#### 파일 구조

```
agentsdebate/
├── app/
│   ├── layout.tsx          Poppins 폰트, 메타데이터
│   ├── page.tsx            루트 화면 (Sidebar + 화면 전환)
│   ├── globals.css         디자인 시스템 CSS 변수
│   └── api/debate/route.ts SSE 스트리밍 POST 엔드포인트
├── components/
│   ├── sidebar.tsx         사이드바 (로고, 새 토론, 검색, 최근 토론, 하단 내비)
│   ├── model-pill.tsx      모델 아이콘 뱃지 (ModelPill 컴포넌트)
│   ├── chat-screen.tsx     메인 토론 화면 (SSE 소비, 라운드 타임라인, 합의 카드)
│   ├── settings-screen.tsx 모델 토글 설정 (최소 2개 선택 강제)
│   └── stats-screen.tsx    통계 화면 (모의 데이터)
└── lib/
    ├── types.ts            타입 정의 (Model, DebateEvent 등)
    ├── models.ts           callModel / callAllModels (30초 타임아웃, Promise.allSettled)
    ├── judge.ts            runJudge — Claude claude-sonnet-4-6로 합의 추출
    └── debate-engine.ts    runDebate AsyncGenerator — 3라운드 토론 오케스트레이션
```

#### 핵심 기술 결정사항
- **스트리밍**: SSE (`ReadableStream` + `text/event-stream`)로 라운드별 실시간 UI 업데이트
- **병렬 호출**: 라운드당 `Promise.allSettled` — 한 모델 실패가 전체를 멈추지 않음
- **타임아웃**: 모델당 30초 (`Promise.race`)
- **클라이언트 초기화**: 지연 초기화 (함수 최초 호출 시 생성) — 빌드 타임 오류 방지
- **Judge AI**: Claude claude-sonnet-4-6, 플러그인 교체 가능 구조

#### 수정된 버그
- `lib/models.ts`, `lib/judge.ts`: API 클라이언트를 모듈 로드 시점에 생성하던 코드 수정  
  → 빌드 시 `OPENAI_API_KEY missing` 오류 발생 원인이었음  
  → 함수 내부 지연 초기화로 변경하여 해결

---

## 실행 방법

```bash
# 1. API 키 설정
cp .env.example .env.local
# .env.local에 실제 키 입력:
#   OPENAI_API_KEY=sk-...
#   ANTHROPIC_API_KEY=sk-ant-...
#   GEMINI_API_KEY=AI...

# 2. 개발 서버 실행
node node_modules/next/dist/bin/next dev
# → http://localhost:3000
```

> WSL2 환경에서는 `npm run build` 대신 `node node_modules/next/dist/bin/next [build|dev]` 직접 실행

---

## 핵심 문제 정의 (오피스아워 결과)

**진짜 고통:** "어떤 AI의 답을 믿어야 하는가"  
→ 탭 여러 개 마찰이 아니라 신뢰 문제가 핵심이다.

**기존 도구와의 차이:**
| 도구 | 방식 | 한계 |
|------|------|------|
| MultipleChat | 병렬 나란히 표시 | 어떤 답이 더 나은지 사용자가 직접 판단 |
| DebateAI / VoxArena | AI가 반대 입장으로 토론 | 콘텐츠 소비용, 답 추출 아님 |
| **AgentsDebate** | 반론 후 합의 추출 | 반론 불가능한 교집합만 출력 |

---

## 기술 설계 (승인됨)

### 전체 흐름

```
사용자 프롬프트
    ↓
[라운드 0] GPT / Claude / Gemini 동시 응답 (Promise.allSettled)
    ↓
[라운드 1] 각 모델이 다른 모델의 답에 반론 생성
    ↓
[라운드 2] 재반론 또는 동의
    ↓
[Judge 패스] Claude claude-sonnet-4-6 → 합의 항목 추출 → JSON 출력
    ↓
출력: { consensus: [...], disputed: [...], confidence: 0~1 }
```

### 기술 스펙
- **Judge AI**: Claude claude-sonnet-4-6 (교체 가능한 플러그인 구조)
- **라운드**: 고정 2라운드 (루프 없음)
- **병렬 호출**: 각 라운드 Promise.allSettled — 순차 아님
- **타임아웃**: 모델당 30초, 초과 시 해당 모델 제외
- **API 실패**: 2개 이하 모델 응답 시 합의 추출 불가 표시
- **예상 비용**: 쿼리당 $0.15~$0.80 (6K~15K 토큰 누적)

---

## 로드맵 현황

### Phase B — UI 연결 MVP ✅ 완료
- [x] Next.js 프로젝트 스캐폴딩 (package.json, tsconfig, next.config)
- [x] lib 레이어 (types, models, debate-engine, judge)
- [x] API 라우트 (SSE 스트리밍 `/api/debate`)
- [x] UI 컴포넌트 전체 (sidebar, chat-screen, settings-screen, stats-screen)
- [x] 빌드 성공 확인

### Phase A — 합의 추출 검증 (다음 단계)
실제 API 키로 동작 검증 필요:
- [ ] 20개 실제 프롬프트로 토론 실행
- [ ] Judge 합의 추출 품질 확인
- [ ] 단순 다수결 대비 효과 비교

**Phase A 성공 기준:**
- A-1: 20개 중 15개 이상에서 비어있지 않은 합의 추출
- A-2: 토론 방식이 단일 모델보다 명확히 더 유용 (5개 이상에서 주관 판단)
- A-3: Judge 프롬프트가 수정 없이 일관된 JSON 반환

---

## 열린 질문들

1. **Judge 편향**: Claude가 Judge면 Claude에 유리한 합의 가능. Phase A에서 Judge 모델 바꿔가며 결과 차이 측정.
2. **합의 없는 경우**: 모든 모델이 다른 주장이면 합의 섹션 비어버림. 수학/코딩처럼 정답이 있는 질문으로 먼저 테스트.
3. **다수결 기준선**: "토론 없이 다수결"과 비교해야 debate의 실제 가치 측정 가능.

---

## 참고 문서

- 디자인 문서 (승인됨): `~/.gstack/projects/whim77-anthropic-proxy/whim77-main-design-20260430-154659.md`
- UI 프로토타입: `AgentsDebate v3.html`
