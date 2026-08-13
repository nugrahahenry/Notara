// test/run.js
const { execSync } = require('child_process');

console.log('==================================================');
console.log('          NALIRA TEST INFRASTRUCTURE RUNNER        ');
console.log('==================================================');

try {
  // 1. Compile TypeScript source files
  execSync('node test/compile.js', { stdio: 'inherit' });

  console.log('\n--------------------------------------------------');
  console.log(' Running Test Suite: Tiers 1 - 4 + Capture, Learning, Auth, Post-auth Experience, Auth Errors, API Boundaries, AI API Access, AI API Security, Billing Security, Health, Identity, App Shell UI, and Technical Config Policies');
  console.log('--------------------------------------------------\n');

  // 2. Run the test suite via Node.js native test runner
  execSync('node --test test/tier1.test.js test/tier2.test.js test/tier3.test.js test/tier4.test.js test/capture-policy.test.js test/capture-pipeline.test.js test/capture-task.test.js test/learning-fallback.test.js test/auth-redirect.test.js test/post-auth-experience.test.js test/auth-errors.test.js test/api-boundary.test.js test/ai-api-access.test.js test/ai-api-security.test.js test/billing-plans.test.js test/billing-security.test.js test/billing-security-contract.test.js test/supabase-billing-security.test.js test/runtime-health.test.js test/product-identity.test.js test/app-shell-ui.test.js test/onboarding-ui.test.js test/technical-config.test.js', { stdio: 'inherit' });

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
