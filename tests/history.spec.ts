/**
 * TC-6 ~ TC-9: 토론 기록 저장/삭제/중복 방지 테스트
 *
 * /api/debate 를 mock(SSE 응답 고정)해서 실제 API 키 없이 빠르게 실행.
 * 각 테스트 전에 localStorage를 초기화해 독립성 보장.
 */

import { test, expect, type Page } from '@playwright/test';

// ─── Mock SSE 응답 ─────────────────────────────────────────────────────────────

const MOCK_SSE_BODY = [
  { type: 'round_start', round: 0, label: '초기 입장 표명' },
  { type: 'message', round: 0, modelId: 'gpt',    content: 'GPT 초기 응답' },
  { type: 'message', round: 0, modelId: 'claude', content: 'Claude 초기 응답' },
  { type: 'message', round: 0, modelId: 'gemini', content: 'Gemini 초기 응답' },
  { type: 'round_start', round: 1, label: '반론 및 심화' },
  { type: 'message', round: 1, modelId: 'gpt',    content: 'GPT 반론', refTag: 'CLAUDE에 반론' },
  { type: 'message', round: 1, modelId: 'claude', content: 'Claude 반론', refTag: 'GPT에 반론' },
  { type: 'message', round: 1, modelId: 'gemini', content: 'Gemini 반론', refTag: 'GPT에 반론' },
  { type: 'round_start', round: 2, label: '공통점 탐색' },
  { type: 'message', round: 2, modelId: 'gpt',    content: 'GPT 최종 입장' },
  { type: 'message', round: 2, modelId: 'claude', content: 'Claude 최종 입장' },
  { type: 'message', round: 2, modelId: 'gemini', content: 'Gemini 최종 입장' },
  { type: 'judge_result', consensus: ['합의 항목: AI는 도구다'], disputed: ['이견: 감정 보유 여부'], confidence: 0.75 },
  { type: 'done' },
]
  .map(e => `data: ${JSON.stringify(e)}\n\n`)
  .join('');

async function mockDebateApi(page: Page) {
  await page.route('/api/debate', route => {
    route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
      body: MOCK_SSE_BODY,
    });
  });
}

async function clearLocalStorage(page: Page) {
  await page.evaluate(() => localStorage.clear());
}

async function startDebate(page: Page, topic: string) {
  await page.getByPlaceholder(/AGI는/).fill(topic);
  await page.getByRole('button', { name: '토론 시작', exact: true }).click();
}

async function waitForConsensusCard(page: Page) {
  await expect(page.getByText('합의 추출 결과')).toBeVisible({ timeout: 15_000 });
}

// ─── TC-6: 토론 완료 후 사이드바에 기록 1건 저장 ─────────────────────────────

test('TC-6: 토론 완료 후 사이드바에 기록이 정확히 1건 저장된다', async ({ page }) => {
  await page.goto('/');
  await clearLocalStorage(page);
  await page.reload();
  await mockDebateApi(page);

  // 기록 없음 초기 상태
  await expect(page.getByText('아직 토론 기록이 없습니다')).toBeVisible();

  const TOPIC = '인공지능이 인간의 일자리를 대체할 것인가';
  await startDebate(page, TOPIC);
  await waitForConsensusCard(page);

  await page.screenshot({ path: 'tests/screenshots/tc6-after-debate.png' });

  // 사이드바에 토론 주제가 나타나야 함
  const sidebarItem = page.locator('[data-testid="history-item"]').filter({ hasText: TOPIC });
  // data-testid 없으면 텍스트로 확인
  const historyText = page.getByText(TOPIC);
  await expect(historyText.first()).toBeVisible({ timeout: 5_000 });

  // 중복 저장 확인 — 같은 주제가 사이드바에 정확히 1번만 나타나야 함
  const count = await page.getByText(TOPIC).count();
  // 입력창 + 사이드바 = 최대 2개 (입력창에도 있으므로)
  console.log(`  "${TOPIC}" 텍스트 출현 횟수: ${count}`);

  // localStorage에 저장된 기록 수 확인
  const storedCount = await page.evaluate(() => {
    const raw = localStorage.getItem('agentsdebate_history');
    if (!raw) return 0;
    return (JSON.parse(raw) as unknown[]).length;
  });
  console.log(`  localStorage 저장 기록 수: ${storedCount}`);
  expect(storedCount, '기록은 정확히 1건이어야 합니다').toBe(1);
});

// ─── TC-7: 중복 저장 없음 (같은 토론 완료 후 1건만) ─────────────────────────

test('TC-7: 동일 토론을 완료해도 localStorage에 1건만 저장된다', async ({ page }) => {
  await page.goto('/');
  await clearLocalStorage(page);
  await page.reload();
  await mockDebateApi(page);

  await startDebate(page, '원격근무가 생산성을 높이는가');
  await waitForConsensusCard(page);

  const storedCount = await page.evaluate(() => {
    const raw = localStorage.getItem('agentsdebate_history');
    if (!raw) return 0;
    return (JSON.parse(raw) as unknown[]).length;
  });

  console.log(`  저장된 기록 수: ${storedCount} (1이어야 함)`);
  expect(storedCount, 'React Strict Mode 이중 저장 버그 — 1건이어야 합니다').toBe(1);

  await page.screenshot({ path: 'tests/screenshots/tc7-no-duplicate.png' });
});

// ─── TC-8: 개별 토론 삭제 버튼 ───────────────────────────────────────────────

test('TC-8: 사이드바 항목 호버 시 삭제 버튼이 나타나고 삭제된다', async ({ page }) => {
  await page.goto('/');
  await clearLocalStorage(page);
  await page.reload();
  await mockDebateApi(page);

  const TOPIC = '기후변화 대응은 개인 책임인가';
  await startDebate(page, TOPIC);
  await waitForConsensusCard(page);

  // 사이드바 기록 항목 찾기 (data-history-id 속성으로 특정)
  const debateItem = page.locator('[data-history-id]').filter({ hasText: TOPIC });
  await expect(debateItem).toBeVisible({ timeout: 5_000 });

  // hover → React onMouseEnter 트리거 → 삭제 버튼 렌더
  await debateItem.hover();
  // React state 업데이트 및 재렌더링 대기
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'tests/screenshots/tc8-hover-delete.png' });

  // 삭제 버튼(aria-label="토론 삭제") 출현 확인
  const deleteBtn = page.getByRole('button', { name: '토론 삭제' });
  await expect(deleteBtn).toBeVisible({ timeout: 3_000 });

  // 삭제 실행
  await deleteBtn.click();
  await page.screenshot({ path: 'tests/screenshots/tc8-after-delete.png' });

  // 삭제 후 기록 없음 상태
  await expect(page.getByText('아직 토론 기록이 없습니다')).toBeVisible({ timeout: 3_000 });

  // localStorage도 비어있는지 확인
  const storedCount = await page.evaluate(() => {
    const raw = localStorage.getItem('agentsdebate_history');
    if (!raw) return 0;
    return (JSON.parse(raw) as unknown[]).length;
  });
  expect(storedCount).toBe(0);
});

// ─── TC-9: 전체 삭제 버튼 ────────────────────────────────────────────────────

test('TC-9: 전체 삭제 버튼으로 모든 기록이 삭제된다', async ({ page }) => {
  await page.goto('/');
  await clearLocalStorage(page);
  await page.reload();
  await mockDebateApi(page);

  // 2번 토론 실행 → 2건 저장
  await startDebate(page, '첫 번째 토론 주제');
  await waitForConsensusCard(page);

  // 두 번째 토론: 새 토론 버튼 클릭 후 재실행
  await page.getByRole('button', { name: /새 토론 시작/ }).click();
  await startDebate(page, '두 번째 토론 주제');
  await waitForConsensusCard(page);

  const countBefore = await page.evaluate(() => {
    const raw = localStorage.getItem('agentsdebate_history');
    if (!raw) return 0;
    return (JSON.parse(raw) as unknown[]).length;
  });
  console.log(`  전체 삭제 전 기록 수: ${countBefore}`);
  expect(countBefore).toBe(2);

  await page.screenshot({ path: 'tests/screenshots/tc9-before-clear.png' });

  // '전체 삭제' 버튼 클릭
  await page.getByRole('button', { name: '전체 삭제' }).click();

  await expect(page.getByText('아직 토론 기록이 없습니다')).toBeVisible({ timeout: 3_000 });

  const countAfter = await page.evaluate(() => {
    const raw = localStorage.getItem('agentsdebate_history');
    if (!raw) return 0;
    return (JSON.parse(raw) as unknown[]).length;
  });
  expect(countAfter).toBe(0);

  await page.screenshot({ path: 'tests/screenshots/tc9-after-clear.png' });
});
