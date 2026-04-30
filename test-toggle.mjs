// 설정 화면 모델 토글 로직 테스트
// 실행: node test-toggle.mjs

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

// page.tsx의 toggleModel 로직 복제
function toggleModel(activeModels, id) {
  if (activeModels.includes(id)) {
    if (activeModels.length <= 2) return activeModels; // 최소 2개 보호
    return activeModels.filter(m => m !== id);
  }
  return [...activeModels, id];
}

// settings-screen.tsx의 onClick 조건 복제
function canToggle(active, activeModels) {
  if (active && activeModels.length <= 2) return false; // 비활성화 차단
  return true;
}

function simulateClick(activeModels, modelId) {
  const active = activeModels.includes(modelId);
  if (!canToggle(active, activeModels)) {
    console.log(`    → 클릭 차단됨 (최소 2개 보호)`);
    return activeModels;
  }
  return toggleModel(activeModels, modelId);
}

console.log('\n=== 설정 화면 토글 테스트 ===\n');

// ─── 테스트 1: ChatGPT OFF → ON ───
console.log('[테스트 1] ChatGPT 비활성화 후 재활성화');
{
  let models = ['gpt', 'claude', 'gemini'];
  console.log(`  초기 상태: [${models}]`);

  models = simulateClick(models, 'gpt');
  console.log(`  GPT 클릭 후: [${models}]`);
  assert('GPT가 비활성화됨', !models.includes('gpt'));
  assert('Claude, Gemini 유지', models.includes('claude') && models.includes('gemini'));

  models = simulateClick(models, 'gpt');
  console.log(`  GPT 재클릭 후: [${models}]`);
  assert('GPT가 다시 활성화됨', models.includes('gpt'));
}

// ─── 테스트 2: 최소 2개 보호 ───
console.log('\n[테스트 2] 2개만 남은 상태에서 추가 비활성화 차단');
{
  let models = ['claude', 'gemini'];
  console.log(`  초기 상태: [${models}]`);

  models = simulateClick(models, 'claude');
  console.log(`  Claude 클릭 시도 후: [${models}]`);
  assert('Claude 비활성화 차단됨 (최소 2개 보호)', models.includes('claude'));
  assert('Gemini 유지', models.includes('gemini'));
}

// ─── 테스트 3: 비활성 상태에서는 항상 활성화 가능 ───
console.log('\n[테스트 3] 비활성 모델은 항상 활성화 가능');
{
  let models = ['claude', 'gemini'];
  console.log(`  초기 상태 (gpt 없음): [${models}]`);

  const active = models.includes('gpt'); // false
  const blocked = !canToggle(active, models);
  assert('GPT 활성화 차단 안됨', !blocked);

  models = simulateClick(models, 'gpt');
  console.log(`  GPT 클릭 후: [${models}]`);
  assert('GPT 활성화됨', models.includes('gpt'));
}

// ─── 결과 ───
console.log(`\n결과: ${passed}개 통과 / ${failed}개 실패\n`);
if (failed > 0) process.exit(1);
