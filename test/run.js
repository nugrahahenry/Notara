// test/run.js
const { execSync } = require('child_process');

console.log('==================================================');
console.log('          NALIRA TEST INFRASTRUCTURE RUNNER        ');
console.log('==================================================');

try {
  // 1. Compile TypeScript source files
  execSync('node test/compile.js', { stdio: 'inherit' });

  console.log('\n--------------------------------------------------');
  console.log(' Running Test Suite: Tiers 1 - 4 + Capture, Recording Boundary, Transcript Quality, Guided Learning, Compare, Auth, Dashboard Session, Post-auth Experience, API, Billing, Health, Identity, App Shell UI, and Technical Config Policies');
  console.log('--------------------------------------------------\n');

  // 2. Run the test suite via Node.js native test runner
  execSync('node --test test/tier1.test.js test/tier2.test.js test/tier3.test.js test/tier4.test.js test/capture-policy.test.js test/capture-pipeline.test.js test/capture-task.test.js test/recording-boundary.test.js test/transcript-quality.test.js test/transcript-persistence.test.js test/guided-foundation.test.js test/guided-ui-contract.test.js test/guided-compare-domain.test.js test/guided-compare-ui.test.js test/chat-thread-state.test.js test/learning-fallback.test.js test/auth-redirect.test.js test/dashboard-session.test.js test/post-auth-experience.test.js test/auth-errors.test.js test/api-boundary.test.js test/ai-api-access.test.js test/ai-api-security.test.js test/ai-usage.test.js test/ai-usage-security.test.js test/billing-plans.test.js test/billing-security.test.js test/billing-security-contract.test.js test/supabase-billing-security.test.js test/runtime-health.test.js test/product-identity.test.js test/app-shell-ui.test.js test/onboarding-ui.test.js test/technical-config.test.js', { stdio: 'inherit' });

  console.log('\n==================================================');
  console.log(' ✅ ALL TEST SUITES EXECUTED AND PASSED SUCCESSFUL!');
  console.log('==================================================');
  process.exit(0);
} catch {
  console.log('\n==================================================');
  console.log(' ❌ TEST SUITE EXECUTION FAILED! PLEASE CHECK ERROR LOG.');
  console.log('==================================================');
  process.exit(1);
}
