import { test, expect } from '@playwright/test';

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

async function goToSettings(page: any) {
  await page.getByRole('button', { name: /모델 설정/ }).click();
  await expect(page.getByText('참여 모델 및 버전')).toBeVisible({ timeout: 10_000 });
  // 드롭다운이 완전히 렌더링될 때까지 대기
  await page.waitForSelector('select', { state: 'visible' });
}

async function goToChat(page: any) {
  await page.getByRole('button', { name: /채팅/ }).click();
}

async function selectModelVersion(page: any, modelIndex: 0 | 1 | 2, value: string) {
  const selects = page.locator('select');
  await selects.nth(modelIndex).selectOption(value);
}

// ─── TC-1: 기본 UI 렌더링 ─────────────────────────────────────────────────────
test('TC-1: 앱 로드 시 사이드바와 채팅 화면이 표시된다', async ({ page }) => {
  await page.goto('/');

  // 사이드바 로고
  await expect(page.getByText('AgentsDebate')).toBeVisible();

  // 새 토론 버튼
  await expect(page.getByRole('button', { name: /새 토론 시작/ })).toBeVisible();

  // 채팅 빈 상태 메시지
  await expect(page.getByText('합의 추출 준비 완료')).toBeVisible();

  // 토론 주제 입력창
  await expect(page.getByPlaceholder(/AGI는/)).toBeVisible();

  await page.screenshot({ path: 'tests/screenshots/tc1-initial-ui.png' });
});

// ─── TC-2: 설정 화면 네비게이션 ───────────────────────────────────────────────
test('TC-2: 설정 화면으로 이동하고 돌아올 수 있다', async ({ page }) => {
  await page.goto('/');

  await goToSettings(page);
  await expect(page.getByRole('main').getByText('모델 설정')).toBeVisible();
  await expect(page.getByText('최소 2개 이상 필요합니다')).toBeVisible();

  // API 키 상태 섹션
  await expect(page.getByText('API 키 상태')).toBeVisible();

  await page.screenshot({ path: 'tests/screenshots/tc2-settings.png' });

  // 채팅으로 복귀
  await goToChat(page);
  await expect(page.getByText('합의 추출 준비 완료')).toBeVisible();
});

// ─── TC-3: 모델 버전 선택 (o1-mini, 1.5 Flash) ────────────────────────────────
test('TC-3: GPT를 o1-mini, Gemini를 1.5 Flash로 선택할 수 있다', async ({ page }) => {
  await page.goto('/');
  await goToSettings(page);

  // GPT(index 0) → o1-mini
  await selectModelVersion(page, 0, 'o4-mini');
  await expect(page.locator('select').nth(0)).toHaveValue('o4-mini');

  // Gemini(index 2) → gemini-2.0-flash
  await selectModelVersion(page, 2, 'gemini-2.5-flash');
  await expect(page.locator('select').nth(2)).toHaveValue('gemini-2.5-flash');

  await page.screenshot({ path: 'tests/screenshots/tc3-model-selection.png' });

  // 채팅 화면 pills에도 반영되는지 확인
  await goToChat(page);
  await expect(page.getByText('o4-mini')).toBeVisible();
  await expect(page.getByText('Gemini 2.5 Flash')).toBeVisible();

  await page.screenshot({ path: 'tests/screenshots/tc3-pills-in-chat.png' });
});

// ─── TC-4: 토론 시작 — o1-mini + Gemini 1.5 Flash 응답 진단 ──────────────────
test('TC-4: o1-mini + 1.5 Flash 토론 — 각 모델 응답 확인', async ({ page }) => {
  await page.goto('/');

  // 모델 버전 설정
  await goToSettings(page);
  await selectModelVersion(page, 0, 'o4-mini');          // GPT → o4-mini (o1-mini deprecated)
  await selectModelVersion(page, 2, 'gemini-2.5-flash'); // Gemini → 2.0 Flash (1.5 not in this API key)
  await goToChat(page);

  // 토론 주제 입력
  const input = page.getByPlaceholder(/AGI는/);
  await input.fill('원격근무가 생산성을 높이는가?');

  await page.screenshot({ path: 'tests/screenshots/tc4-before-start.png' });

  // 토론 시작
  await page.getByRole('button', { name: '토론 시작', exact: true }).click();

  // '토론 중...' 버튼으로 바뀌는지 확인
  await expect(page.getByRole('button', { name: '토론 중...' })).toBeVisible({ timeout: 5_000 });

  // ── 라운드 0: 초기 입장 표명 ──
  await expect(page.getByText('초기 입장 표명')).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: 'tests/screenshots/tc4-round0-start.png' });

  // round 1('상호 반론')이 나타나면 round 0 응답이 완료된 것 (chat-screen.tsx 로컬 레이블 기준)
  console.log('▶ 라운드 0 완료 대기 (최대 90초)...');
  let round1appeared = false;
  try {
    await expect(page.getByText('상호 반론')).toBeVisible({ timeout: 90_000 });
    round1appeared = true;
  } catch { /* timeout — 2개 미만 응답 */ }

  await page.screenshot({ path: 'tests/screenshots/tc4-round0-responses.png' });

  // 오류 메시지 체크
  const errorEl = page.locator('div').filter({ hasText: /^오류:/ }).first();
  const hasError = await errorEl.isVisible({ timeout: 2_000 }).catch(() => false);
  if (hasError) {
    const errorText = await errorEl.textContent();
    console.log('  ⚠️  오류 메시지:', errorText);
    await page.screenshot({ path: 'tests/screenshots/tc4-error.png' });
  }

  if (round1appeared) {
    // round 1이 시작됐으면 각 모델 버블 카운트
    const gptCount    = await page.locator('text=ChatGPT').count();
    const claudeCount = await page.locator('text=Claude').count();
    const geminiCount = await page.locator('text=Gemini').count();
    // 타이핑 인디케이터("ChatGPT 응답 중") 제외: 실제 버블은 2번째 이상
    console.log('  ChatGPT 버블:', gptCount >= 2 ? '✅ 응답 있음' : '❌ 응답 없음', `(${gptCount}개)`);
    console.log('  Claude 버블:', claudeCount >= 2 ? '✅ 응답 있음' : '❌ 응답 없음', `(${claudeCount}개)`);
    console.log('  Gemini 버블:', geminiCount >= 2 ? '✅ 응답 있음' : '❌ 응답 없음', `(${geminiCount}개)`);
  }

  console.log('  라운드 0 → 1 진행:', round1appeared ? '✅' : '❌ (모델 응답 실패)');
  expect(round1appeared, '라운드 0에서 2개 이상 모델이 응답하고 라운드 1로 넘어가야 합니다').toBe(true);
});

// ─── TC-5: 전체 토론 완주 (합의 카드 출력) ───────────────────────────────────
test('TC-5: 전체 토론 3라운드 완주 후 합의 카드가 표시된다', async ({ page }) => {
  await page.goto('/');

  // 모델 버전 설정
  await goToSettings(page);
  await selectModelVersion(page, 0, 'o4-mini');
  await selectModelVersion(page, 2, 'gemini-2.5-flash');
  await goToChat(page);

  await page.getByPlaceholder(/AGI는/).fill('인공지능이 인간의 창의성을 대체할 수 있는가?');
  await page.getByRole('button', { name: '토론 시작', exact: true }).click();

  // 합의 추출 결과 카드 대기 (최대 150초 — 3라운드 + judge)
  console.log('▶ 합의 카드 대기 중 (최대 150초)...');
  let appeared = false;
  try {
    await expect(page.getByText('합의 추출 결과')).toBeVisible({ timeout: 150_000 });
    appeared = true;
  } catch { /* 타임아웃 또는 미출력 */ }

  await page.screenshot({ path: 'tests/screenshots/tc5-final.png' });

  if (appeared) {
    console.log('  ✅ 합의 카드 표시됨');
    const confidence = await page.locator('text=합의 신뢰도').isVisible().catch(() => false);
    console.log('  신뢰도 섹션:', confidence ? '있음' : '없음');

    // 동의/이견 섹션
    const hasConsensus = await page.getByText('모든 AI가 동의한 내용').isVisible().catch(() => false);
    const hasDisputed  = await page.getByText('이견이 있는 내용').isVisible().catch(() => false);
    console.log('  동의 항목:', hasConsensus ? '있음' : '없음');
    console.log('  이견 항목:', hasDisputed  ? '있음' : '없음');
  } else {
    const errText = await page.locator('div:has-text("오류:")').last().textContent().catch(() => '(없음)');
    console.log('  ❌ 합의 카드 미출력. 오류:', errText);
  }

  expect(appeared, '합의 카드가 표시되어야 합니다').toBe(true);
});
