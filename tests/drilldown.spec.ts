/**
 * TC-10 ~ TC-15: 합의 결과 기반 심화 토론(Drill-Down) 기능 테스트
 *
 * 핵심 동작:
 *  1. 이견 항목 [심화 →] 클릭 → 입력창 prefill
 *  2. [심화 토론 시작 →] 클릭 → 이전 합의를 전제로 새 토론 시작
 *  3. 완료 후 TurnDivider에 전제 표시
 *  4. 사이드바 +N 뱃지 업데이트
 *  5. confidence < 30% 시 경고
 *
 * /api/debate 를 mock해서 빠르고 deterministic하게 실행.
 */

import { test, expect, type Page } from '@playwright/test';

// ─── Mock SSE 데이터 ────────────────────────────────────────────────────────

const DISPUTED_ITEM = 'AI가 창의적 업무를 완전히 대체할 수 있는가';
const CONSENSUS_ITEM_1 = 'AI는 생산성 향상에 기여한다';
const CONSENSUS_ITEM_2 = 'AI는 반복 업무를 자동화할 수 있다';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
};

function makeSse(events: object[]): string {
  return events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('');
}

const FIRST_DEBATE_SSE = makeSse([
  { type: 'round_start', round: 0, label: '초기 입장 표명' },
  { type: 'message', round: 0, modelId: 'gpt',    content: 'GPT 초기 응답' },
  { type: 'message', round: 0, modelId: 'claude', content: 'Claude 초기 응답' },
  { type: 'message', round: 0, modelId: 'gemini', content: 'Gemini 초기 응답' },
  { type: 'round_start', round: 1, label: '반론 및 심화' },
  { type: 'message', round: 1, modelId: 'gpt',    content: 'GPT 반론' },
  { type: 'message', round: 1, modelId: 'claude', content: 'Claude 반론' },
  { type: 'message', round: 1, modelId: 'gemini', content: 'Gemini 반론' },
  { type: 'round_start', round: 2, label: '공통점 탐색' },
  { type: 'message', round: 2, modelId: 'gpt',    content: 'GPT 최종' },
  { type: 'message', round: 2, modelId: 'claude', content: 'Claude 최종' },
  { type: 'message', round: 2, modelId: 'gemini', content: 'Gemini 최종' },
  {
    type: 'judge_result',
    consensus: [CONSENSUS_ITEM_1, CONSENSUS_ITEM_2],
    disputed: [DISPUTED_ITEM],
    confidence: 0.72,
  },
  { type: 'done' },
]);

const SECOND_DEBATE_SSE = makeSse([
  { type: 'round_start', round: 0, label: '초기 입장 표명' },
  { type: 'message', round: 0, modelId: 'gpt',    content: 'GPT 심화 응답' },
  { type: 'message', round: 0, modelId: 'claude', content: 'Claude 심화 응답' },
  { type: 'message', round: 0, modelId: 'gemini', content: 'Gemini 심화 응답' },
  { type: 'round_start', round: 1, label: '반론 및 심화' },
  { type: 'message', round: 1, modelId: 'gpt',    content: 'GPT 심화 반론' },
  { type: 'message', round: 1, modelId: 'claude', content: 'Claude 심화 반론' },
  { type: 'message', round: 1, modelId: 'gemini', content: 'Gemini 심화 반론' },
  { type: 'round_start', round: 2, label: '공통점 탐색' },
  { type: 'message', round: 2, modelId: 'gpt',    content: 'GPT 심화 최종' },
  { type: 'message', round: 2, modelId: 'claude', content: 'Claude 심화 최종' },
  { type: 'message', round: 2, modelId: 'gemini', content: 'Gemini 심화 최종' },
  {
    type: 'judge_result',
    consensus: ['창의적 업무의 부분적 대체만 가능하다'],
    disputed: ['예술 분야에서의 AI 역할'],
    confidence: 0.65,
  },
  { type: 'done' },
]);

const LOW_CONFIDENCE_SSE = makeSse([
  { type: 'round_start', round: 0, label: '초기 입장 표명' },
  { type: 'message', round: 0, modelId: 'gpt',    content: 'GPT 응답' },
  { type: 'message', round: 0, modelId: 'claude', content: 'Claude 응답' },
  { type: 'message', round: 0, modelId: 'gemini', content: 'Gemini 응답' },
  { type: 'round_start', round: 1, label: '반론 및 심화' },
  { type: 'message', round: 1, modelId: 'gpt',    content: 'GPT 반론' },
  { type: 'message', round: 1, modelId: 'claude', content: 'Claude 반론' },
  { type: 'message', round: 1, modelId: 'gemini', content: 'Gemini 반론' },
  { type: 'round_start', round: 2, label: '공통점 탐색' },
  { type: 'message', round: 2, modelId: 'gpt',    content: 'GPT 최종' },
  { type: 'message', round: 2, modelId: 'claude', content: 'Claude 최종' },
  { type: 'message', round: 2, modelId: 'gemini', content: 'Gemini 최종' },
  {
    type: 'judge_result',
    consensus: [],
    disputed: ['모든 항목에 이견이 있음'],
    confidence: 0.15,
  },
  { type: 'done' },
]);

// ─── 헬퍼 ───────────────────────────────────────────────────────────────────

async function setupFreshPage(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

async function runAndWaitConsensus(page: Page, topic: string, nthCard = 0) {
  await page.getByPlaceholder(/AGI는/).fill(topic);
  await page.getByRole('button', { name: '토론 시작', exact: true }).click();
  await expect(page.getByText('합의 추출 결과').nth(nthCard)).toBeVisible({ timeout: 10_000 });
}

// ─── TC-10: 심화 토론 입력창 표시 ────────────────────────────────────────────

test('TC-10: 토론 완료 후 합의 카드 하단에 심화 토론 입력창이 표시된다', async ({ page }) => {
  await setupFreshPage(page);
  await page.route('/api/debate', route =>
    route.fulfill({ status: 200, headers: SSE_HEADERS, body: FIRST_DEBATE_SSE })
  );

  await runAndWaitConsensus(page, 'AI와 일자리의 미래');
  await page.screenshot({ path: 'tests/screenshots/tc10-after-debate.png' });

  // 심화 토론 섹션 헤더
  await expect(page.getByText(/이 결론을 바탕으로 이어서 토론/)).toBeVisible({ timeout: 3_000 });

  // 입력 필드
  const followUpInput = page.getByPlaceholder('이견 항목을 클릭하거나 새 방향을 직접 입력하세요');
  await expect(followUpInput).toBeVisible();

  // 심화 토론 시작 버튼 (비활성 — 입력 비어있을 때)
  const startBtn = page.getByRole('button', { name: /심화 토론 시작/ });
  await expect(startBtn).toBeVisible();
  await expect(startBtn).toBeDisabled();

  console.log('  ✅ 심화 토론 입력창·버튼 표시 확인');
  await page.screenshot({ path: 'tests/screenshots/tc10-followup-visible.png' });
});

// ─── TC-11: [심화 →] 버튼이 입력창에 prefill ─────────────────────────────────

test('TC-11: 이견 항목 [심화 →] 클릭 시 입력창에 텍스트가 채워진다', async ({ page }) => {
  await setupFreshPage(page);
  await page.route('/api/debate', route =>
    route.fulfill({ status: 200, headers: SSE_HEADERS, body: FIRST_DEBATE_SSE })
  );

  await runAndWaitConsensus(page, 'AI와 일자리의 미래');

  // 이견 항목 텍스트 확인
  await expect(page.getByText(DISPUTED_ITEM)).toBeVisible({ timeout: 3_000 });

  await page.screenshot({ path: 'tests/screenshots/tc11-before-click.png' });

  // [심화 →] 버튼 클릭
  await page.locator('button').filter({ hasText: '심화 →' }).first().click();

  // 입력창에 이견 항목 prefill 확인
  const input = page.getByPlaceholder('이견 항목을 클릭하거나 새 방향을 직접 입력하세요');
  await expect(input).toHaveValue(DISPUTED_ITEM, { timeout: 3_000 });

  // 버튼도 이제 활성화 확인
  await expect(page.getByRole('button', { name: /심화 토론 시작/ })).toBeEnabled({ timeout: 2_000 });

  console.log(`  ✅ 입력창 prefill: "${DISPUTED_ITEM}"`);
  await page.screenshot({ path: 'tests/screenshots/tc11-after-click.png' });
});

// ─── TC-12: 심화 토론 완료 후 두 번째 합의 카드 표시 ─────────────────────────

test('TC-12: 심화 토론 완료 후 두 번째 합의 카드가 표시된다', async ({ page }) => {
  await setupFreshPage(page);

  let callCount = 0;
  await page.route('/api/debate', route => {
    const body = callCount === 0 ? FIRST_DEBATE_SSE : SECOND_DEBATE_SSE;
    callCount++;
    route.fulfill({ status: 200, headers: SSE_HEADERS, body });
  });

  // 첫 번째 토론
  await runAndWaitConsensus(page, 'AI와 일자리의 미래');

  // 이견 항목 클릭 → 심화 토론 시작
  await page.locator('button').filter({ hasText: '심화 →' }).first().click();
  await page.getByRole('button', { name: /심화 토론 시작/ }).click();

  // 두 번째 합의 카드 대기
  await expect(page.getByText('합의 추출 결과').nth(1)).toBeVisible({ timeout: 10_000 });

  // 심화 토론 전용 결과가 표시됨
  await expect(page.getByText('창의적 업무의 부분적 대체만 가능하다')).toBeVisible({ timeout: 3_000 });

  // 총 합의 카드 2개 존재
  const cardCount = await page.getByText('합의 추출 결과').count();
  console.log(`  합의 카드 수: ${cardCount}`);
  expect(cardCount).toBe(2);

  console.log('  ✅ 두 번째 합의 카드 표시 확인');
  await page.screenshot({ path: 'tests/screenshots/tc12-second-consensus.png' });
});

// ─── TC-13: TurnDivider에 전제 표시 + API priorConsensus 전달 확인 ────────────

test('TC-13: TurnDivider에 이전 합의 전제가 표시되고 API에 priorConsensus가 전달된다', async ({ page }) => {
  await setupFreshPage(page);

  let capturedPriorConsensus: string[] | undefined;
  let callCount = 0;
  await page.route('/api/debate', async route => {
    const body = callCount === 0 ? FIRST_DEBATE_SSE : SECOND_DEBATE_SSE;
    if (callCount === 1) {
      const reqBody = JSON.parse(route.request().postData() ?? '{}');
      capturedPriorConsensus = reqBody.priorConsensus;
    }
    callCount++;
    await route.fulfill({ status: 200, headers: SSE_HEADERS, body });
  });

  await runAndWaitConsensus(page, 'AI와 일자리의 미래');

  // 심화 토론 시작
  await page.locator('button').filter({ hasText: '심화 →' }).first().click();
  await page.getByRole('button', { name: /심화 토론 시작/ }).click();
  await expect(page.getByText('합의 추출 결과').nth(1)).toBeVisible({ timeout: 10_000 });

  await page.screenshot({ path: 'tests/screenshots/tc13-turndivider.png' });

  // TurnDivider "심화 토론 2" 라벨
  await expect(page.getByText('심화 토론 2').first()).toBeVisible({ timeout: 3_000 });

  // TurnDivider 안의 "이전 합의를 전제로 진행" 섹션
  await expect(page.getByText('이전 합의를 전제로 진행')).toBeVisible({ timeout: 3_000 });

  // TurnDivider 안에 첫 번째 합의 항목 표시
  await expect(page.getByText(`• ${CONSENSUS_ITEM_1}`)).toBeVisible({ timeout: 3_000 });

  // API 요청에 priorConsensus가 실제로 전달됐는지 검증
  console.log('  API 전달 priorConsensus:', capturedPriorConsensus);
  expect(Array.isArray(capturedPriorConsensus)).toBe(true);
  expect(capturedPriorConsensus!.length).toBeGreaterThan(0);
  expect(capturedPriorConsensus![0]).toContain('AI는 생산성 향상에 기여한다');

  console.log('  ✅ TurnDivider 표시 + API 파라미터 전달 확인');
});

// ─── TC-14: 사이드바 +N 뱃지 ─────────────────────────────────────────────────

test('TC-14: 심화 토론 완료 후 사이드바 항목에 +1 뱃지가 표시된다', async ({ page }) => {
  await setupFreshPage(page);

  let callCount = 0;
  await page.route('/api/debate', route => {
    const body = callCount === 0 ? FIRST_DEBATE_SSE : SECOND_DEBATE_SSE;
    callCount++;
    route.fulfill({ status: 200, headers: SSE_HEADERS, body });
  });

  await runAndWaitConsensus(page, 'AI와 일자리의 미래');

  // 첫 번째 토론 후: +N 뱃지 없음
  const badge = page.locator('span').filter({ hasText: /^\+\d+$/ });
  expect(await badge.count()).toBe(0);
  console.log('  1차 토론 후 뱃지 없음 ✅');

  // 심화 토론 완료
  await page.locator('button').filter({ hasText: '심화 →' }).first().click();
  await page.getByRole('button', { name: /심화 토론 시작/ }).click();
  await expect(page.getByText('합의 추출 결과').nth(1)).toBeVisible({ timeout: 10_000 });

  await page.screenshot({ path: 'tests/screenshots/tc14-sidebar-badge.png' });

  // "+1" 뱃지 출현
  await expect(badge.first()).toBeVisible({ timeout: 3_000 });
  const badgeText = await badge.first().textContent();
  console.log(`  사이드바 뱃지: "${badgeText}"`);
  expect(badgeText).toBe('+1');

  console.log('  ✅ 사이드바 +1 뱃지 확인');
});

// ─── TC-15: 신뢰도 30% 미만 경고 ────────────────────────────────────────────

test('TC-15: 합의 신뢰도 30% 미만 시 경고 메시지가 표시되고 입력창은 유지된다', async ({ page }) => {
  await setupFreshPage(page);
  await page.route('/api/debate', route =>
    route.fulfill({ status: 200, headers: SSE_HEADERS, body: LOW_CONFIDENCE_SSE })
  );

  await runAndWaitConsensus(page, '매우 논쟁적인 주제');

  await page.screenshot({ path: 'tests/screenshots/tc15-low-confidence.png' });

  // 신뢰도 15% 표시 (exact match to avoid matching warning message)
  await expect(page.getByText('15%', { exact: true })).toBeVisible({ timeout: 3_000 });

  // 경고 메시지 확인
  const warning = page.getByText(/합의 신뢰도가 낮습니다/);
  await expect(warning).toBeVisible({ timeout: 3_000 });
  const warningText = await warning.textContent();
  console.log(`  경고 메시지: "${warningText}"`);
  expect(warningText).toContain('15%');

  // 경고가 있어도 심화 토론 입력창은 여전히 표시
  await expect(
    page.getByPlaceholder('이견 항목을 클릭하거나 새 방향을 직접 입력하세요')
  ).toBeVisible();

  console.log('  ✅ 저신뢰도 경고 + 입력창 유지 확인');
});
