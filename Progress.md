# AgentsDebate — Progress

Last updated: 2026-05-01 (Phase I — 신뢰도 80% 달성까지 자동 재토론 반복)

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
    ├── judge.ts            runJudge — Claude Opus 4.7(고정)로 합의 추출
    ├── debate-engine.ts    runDebate AsyncGenerator — 3라운드 토론 (병렬/라운드로빈)
    └── db.ts               localStorage CRUD (loadHistory/saveDebate/deleteDebate/clearHistory)
```

#### 핵심 기술 결정사항
- **스트리밍**: SSE (`ReadableStream` + `text/event-stream`)로 라운드별 실시간 UI 업데이트
- **병렬 호출**: 라운드당 `Promise.allSettled` — 한 모델 실패가 전체를 멈추지 않음
- **타임아웃**: 모델당 30초 (`Promise.race`)
- **클라이언트 초기화**: 지연 초기화 (함수 최초 호출 시 생성) — 빌드 타임 오류 방지
- **Judge AI**: Claude Opus 4.7 (`claude-opus-4-7`) 고정

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
[라운드 0] GPT / Claude / Gemini 동시 응답 (병렬) 또는 순차 응답 (라운드로빈)
    ↓
[라운드 1] 각 모델이 다른 모델의 답에 반론 생성
    ↓
[라운드 2] 재반론 또는 동의
    ↓
[Judge 패스] Claude Opus 4.7 (고정) → 합의 항목 추출 → JSON 출력
    ↓
출력: { consensus: [...], disputed: [...], confidence: 0~1 }
```

### 기술 스펙
- **Judge AI**: Claude Opus 4.7 (`claude-opus-4-7`) 고정
- **라운드**: 고정 3라운드 (루프 없음)
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

### Phase E — 토론 기록 저장 및 불러오기 ✅ 완료 (2026-05-01)

**구현 내용:**
- `lib/db.ts` — `DebateRecord`에 `rounds` 필드 추가 (전체 대화 내용 저장)
- `components/chat-screen.tsx` — 토론 완료 시 rounds 포함 저장 + `loadedDebate` prop으로 과거 토론 복원
- `components/sidebar.tsx` — `onSelectDebate` 콜백 추가, 항목 클릭 시 해당 토론 불러오기
- `app/page.tsx` — `selectedDebate` 상태 관리, 클릭 시 채팅 화면 전환 및 복원

**동작 흐름:**
1. 토론 완료 → rounds + consensus 모두 localStorage에 저장
2. 사이드바 항목 클릭 → `handleSelectDebate` → `nav='chat'` + `selectedDebate` 설정
3. `ChatScreen`의 `useEffect`가 `loadedDebate` 변경을 감지 → topic/rounds/consensus/phase 복원

---

### Phase D — 모델 API 호환성 버그 수정 ✅ 완료 (2026-05-01)

**수정 내용:**
- `lib/models.ts` — GPT o-시리즈 모델(o1, o1-mini, o3, o4-mini) 지원: `max_tokens` → `max_completion_tokens`
- `lib/models.ts` — Gemini 안전 필터 차단 시 예외 처리 추가 (`res.response.text()` try-catch, 차단 사유 반환)

**원인:**
| 모델 | 원인 | 증상 |
|------|------|------|
| o1-mini 등 o-시리즈 | OpenAI API가 `max_tokens` 거부, 400 에러 | `null` 반환 → 메시지 없음 |
| Gemini 안전 필터 | 차단된 응답에서 `.text()` 예외 발생 | 에러 → `null` 반환 → 메시지 없음 |

---

### Phase C — 모델 세부 버전 선택 ✅ 완료 (2026-05-01)

**구현 내용:**
- 설정 화면에서 GPT / Claude / Gemini 각 모델별 세부 버전을 드롭다운으로 선택 가능
- 선택된 버전은 실제 API 호출까지 전달 (types → models → debate-engine → API route)
- 토론 화면 상단 모델 pills에 선택된 버전명 실시간 반영

**지원 버전 목록:**
| 모델 | 선택 가능한 버전 (총 19개) |
|------|--------------------------|
| GPT | gpt-4o, gpt-4o mini, gpt-4.1, gpt-4.1 mini, gpt-4.1 nano, o1, o3, o3-mini, o4-mini |
| Claude | Opus 4.7, Sonnet 4.6, Haiku 4.5, 3.5 Sonnet, 3.5 Haiku, 3 Opus |
| Gemini | 2.5 Pro, 2.5 Flash, 2.0 Flash, 2.0 Flash Lite |

> o1-mini(deprecated), gpt-4.5-preview, Gemini 1.5 시리즈는 API 호환성 문제로 제거됨

**수정된 파일:**
- `lib/types.ts` — `ModelVersions`, `MODEL_VERSION_LIST`, `DEFAULT_MODEL_VERSIONS` 추가
- `lib/models.ts` — `callModel`에 `versionOverride` 파라미터 추가, `callAllModels`에 `modelVersions` 전달
- `lib/debate-engine.ts` — `runDebate`에 `modelVersions` 파라미터 추가
- `app/api/debate/route.ts` — 요청 body에서 `modelVersions` 수신 및 전달
- `app/page.tsx` — `modelVersions` 상태 및 `updateModelVersion` 함수 추가
- `components/settings-screen.tsx` — 각 모델 행에 버전 드롭다운 UI 추가
- `components/chat-screen.tsx` — `modelVersions` prop 수신, API 전달, pills에 버전명 표시

---

### Phase D — 로컬 DB (토론 기록 영속화) ✅ 완료 (2026-05-01)

**구현 내용:**
- `lib/db.ts` 신규 — `localStorage` 기반 CRUD (`loadHistory`, `saveDebate`), 최대 50건 유지
- 토론 완료 시(`judge_result` 이벤트) 자동 저장, 브라우저 탭을 닫아도 기록 유지
- 사이드바의 하드코딩 더미 데이터(`HIST`) 제거 → 실제 저장된 기록 표시
- 기록이 없을 때 "아직 토론 기록이 없습니다" 안내 문구
- 가장 최근 완료된 토론이 사이드바에서 활성(파란색) 하이라이트

**수정된 파일:**
- `lib/db.ts` — 신규, DebateRecord 타입 + loadHistory/saveDebate 함수
- `components/chat-screen.tsx` — `onDebateSaved` prop 추가, judge_result 시 saveDebate 호출
- `components/sidebar.tsx` — 더미 HIST 제거, `history` / `activeDebateId` prop 수신
- `app/page.tsx` — useEffect로 초기 히스토리 로드, handleDebateSaved 콜백, activeDebateId 추적

---

### Phase F — 라운드로빈 모드 + Judge 모델 업그레이드 ✅ 완료 (2026-05-01)

**구현 내용:**
- `components/chat-screen.tsx` — 모델 pills 옆에 **라운드로빈 ON/OFF 토글 버튼** 추가 (기본값 OFF)
- `lib/debate-engine.ts` — `roundRobin` 파라미터 추가; ON 시 각 모델이 순서대로 앞선 모델의 응답을 보면서 순차 답변
- `app/api/debate/route.ts` — 요청 body에서 `roundRobin` 수신 및 전달
- `lib/judge.ts` — Judge 모델을 `claude-sonnet-4-6` → **`claude-opus-4-7`** 로 변경 (고정)

**라운드로빈 동작:**
| 라운드 | 각 모델이 보는 컨텍스트 |
|--------|------------------------|
| Round 0 | 1번째: 주제만 / 2번째: 주제 + 1번째 응답 / 3번째: 주제 + 1,2번째 응답 |
| Round 1 | 이전 라운드 전체 + 현재 라운드에서 앞선 모델의 반론 |
| Round 2 | 이전 라운드 전체 + 현재 라운드에서 앞선 모델의 재반론 |

**수정된 파일:**
- `lib/judge.ts` — Judge 모델 → `claude-opus-4-7`
- `lib/debate-engine.ts` — 라운드로빈 순차 실행 로직 + `callModelsSequential` AsyncGenerator
- `app/api/debate/route.ts` — `roundRobin` 파라미터 수신
- `components/chat-screen.tsx` — 라운드로빈 토글 버튼 UI + API 전달

---

### Phase G — 기록 삭제 UI + 이중저장 버그 수정 ✅ 완료 (2026-05-01)

**수정된 버그: 이중 저장**
- 원인: React 18 Strict Mode가 state updater 함수를 개발 환경에서 2회 호출 → `saveDebate`가 `setRounds(updater)` 안에 있어서 2번 실행
- 수정: `roundsRef` (useRef)로 rounds를 동기적으로 추적 + `savedRef`로 중복 저장 방지 → `saveDebate`를 state updater 밖에서 직접 호출

**추가 기능: 기록 삭제 UI**
- 사이드바 개별 항목 호버 시 X 버튼(분홍색 원형) 출현 → 클릭 시 해당 토론 삭제
- 사이드바 "최근 토론" 헤더에 "전체 삭제" 링크 추가

**수정된 파일:**
- `lib/db.ts` — `deleteDebate(id)`, `clearHistory()` 함수 추가
- `components/sidebar.tsx` — 호버 state, X 버튼, 전체 삭제 버튼, `data-history-id` 속성
- `app/page.tsx` — `handleDeleteDebate`, `handleClearHistory` 콜백 추가
- `components/chat-screen.tsx` — `roundsRef` + `savedRef`로 이중 저장 방지

**Playwright 테스트 4개 추가 (tests/history.spec.ts), 전체 통과 (11.3s):**
| 케이스 | 검증 내용 |
|--------|-----------|
| TC-6 | 토론 완료 후 사이드바에 1건 저장 |
| TC-7 | Strict Mode 이중 저장 없음 (localStorage 1건) |
| TC-8 | 개별 항목 호버 → X 버튼 → 삭제 동작 |
| TC-9 | 전체 삭제 버튼 → 모든 기록 제거 |

**Playwright 테스트 6개 추가 (tests/drilldown.spec.ts), 전체 통과 (18.4s):**
| 케이스 | 검증 내용 |
|--------|-----------|
| TC-10 | 토론 완료 후 합의 카드 하단에 심화 토론 입력창 표시 |
| TC-11 | 이견 항목 [심화 →] 클릭 시 입력창 prefill + 버튼 활성화 |
| TC-12 | 심화 토론 완료 후 두 번째 합의 카드 표시 |
| TC-13 | TurnDivider 표시 + API에 priorConsensus 배열 전달 |
| TC-14 | 심화 토론 완료 후 사이드바 +1 뱃지 표시 |
| TC-15 | 15% 신뢰도 경고 메시지 + 입력창 유지 |

---

### Phase H — 합의 결과 기반 이어서 토론 (Drill-Down) ✅ 완료 (2026-05-01)

**설계 배경 (Claude Opus 4.7 어드바이저 제안):**
> "disputed 항목을 클릭하면 그 쟁점만 분리해 다시 토론하고, 이전 consensus는 새 토론의 전제로 박힌다"

**구현 내용:**
- 이견 항목마다 **[심화 →]** 버튼 → 클릭 시 아래 입력창에 prefill
- 합의 카드 하단에 **후속 질문 입력창** ("이 결론을 바탕으로 이어서 토론")
- 이전 consensus 최대 5개를 새 토론 프롬프트에 "이미 합의된 전제"로 삽입
- 하나의 사이드바 항목 안에 최대 5회 심화 토론 누적 (`turns[]` 구조)
- 심화 토론 n회차 상단에 **TurnDivider** — 이전 합의 전제 내용 표시
- 사이드바 항목에 `+N` 뱃지로 심화 횟수 표시
- confidence < 30% 시 "합의 신뢰도 낮음" 경고 표시

**가드레일:**
- 최대 5 turn 제한 (초과 시 입력창 숨김 + 안내 문구)
- prior consensus 최대 5개 cap (토큰 절약)
- "새 토론 시작" 클릭 시 `chatKey` 변경으로 ChatScreen 리셋

**데이터 모델 변경:**
```typescript
// lib/types.ts — 신규
interface DebateTurn {
  topic: string;
  rounds: RoundResult[];
  consensus: ConsensusResult;
  priorConsensus?: string[];
  triggeredBy?: { kind: 'disputed' | 'free'; item?: string };
}

// lib/db.ts — DebateRecord 구조 변경
interface DebateRecord {
  id: string; models: ModelId[]; modelVersions: ModelVersions; timestamp: number;
  turns: DebateTurn[];  // 기존 topic/rounds/consensus → turns[0]으로 마이그레이션
}
```

**수정된 파일:**
- `lib/types.ts` — `DebateTurn` 추가
- `lib/db.ts` — `DebateRecord` turns 구조로 전환, 구버전 자동 마이그레이션, `updateDebate` 추가
- `lib/debate-engine.ts` — `priorConsensus` 파라미터 + `buildPriorContext` 헬퍼
- `app/api/debate/route.ts` — `priorConsensus` 수신
- `components/chat-screen.tsx` — 전면 재작성 (turns 누적 렌더링, 심화 토론 UI)
- `components/sidebar.tsx` — `turns[0].topic` + `+N` 뱃지
- `app/page.tsx` — `chatKey` 리셋, `handleDebateSaved` update/insert 분기

---

### Phase I — 신뢰도 80% 달성까지 자동 재토론 ✅ 완료 (2026-05-01)

**동작 방식:**
- 토론 완료 후 Judge 신뢰도가 80% 미만이면 **자동으로 다음 심화 토론을 시작**
- 최대 5회(MAX_TURNS)까지 반복; 80% 이상이 되거나 5회 소진 시 중단
- 자동 재토론 시 이전 turns의 **모든 합의 항목을 축적**해 priorConsensus로 전달 (최대 5개)
- 원래 토론 주제를 유지하면서 이미 합의된 항목은 재론하지 않도록 유도

**UI 변경사항:**
- 합의 카드 하단에 ⚡ **"신뢰도 N% — X회차 심화 토론을 자동으로 시작합니다"** 배너 표시 (800ms 후 자동 시작)
- TurnDivider: 자동 재토론 회차는 분홍색 ⚡ **"자동 심화 N회차 (이전% → 목표 80%)"** 배지
- 자동 재토론 진행 중에는 수동 follow-up 입력창 숨김
- 신뢰도 80% 이상 달성 시 수동 심화 토론 입력창 다시 표시

**수정된 파일:**
- `lib/types.ts` — `triggeredBy.kind`에 `'auto'` 추가
- `components/chat-screen.tsx` — `AUTO_CONFIDENCE_THRESHOLD`, `autoRetryPending`, `triggeredByRef`, 자동 재토론 로직, `TurnDivider` / `ConsensusCard` UI

---

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
