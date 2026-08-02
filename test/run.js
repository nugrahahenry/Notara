// test/run.js
const { execSync } = require('child_process');
const path = require('path');

console.log('==================================================');
console.log('          NOTARA TEST INFRASTRUCTURE RUNNER        ');
console.log('==================================================');

try {
  // 1. Compile TypeScript source files
  execSync('node test/compile.js', { stdio: 'inherit' });

  console.log('\n--------------------------------------------------');
  console.log(' Running Test Suite: Tiers 1 - 4 + Capture Task/Learning Policies');
  console.log('--------------------------------------------------\n');

  // 2. Run the test suite via Node.js native test runner
  execSync('node --test test/tier1.test.js test/tier2.test.js test/tier3.test.js test/tier4.test.js test/capture-policy.test.js test/capture-pipeline.test.js test/capture-task.test.js test/learning-fallback.test.js', { stdio: 'inherit' });

  console.log('\n==================================================');
  console.log(' ✅ ALL TEST SUITES EXECUTED AND PASSED SUCCESSFUL!');
  console.log('==================================================');
  process.exit(0);
} catch (error) {
  console.log('\n==================================================');
  console.log(' ❌ TEST SUITE EXECUTION FAILED! PLEASE CHECK ERROR LOG.');
  console.log('==================================================');
  process.exit(1);
}
