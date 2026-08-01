// test/compile.js
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Compiling TypeScript files for testing...');

const rootDir = path.resolve(__dirname, '..');
const buildDir = path.resolve(rootDir, 'build');

// Ensure clean build directory
if (fs.existsSync(buildDir)) {
  fs.rmSync(buildDir, { recursive: true, force: true });
}

try {
  execSync('npx tsc --project tsconfig.test.json', {
    cwd: rootDir,
    stdio: 'inherit'
  });
  console.log('Compilation completed successfully!');
} catch (error) {
  console.error('Compilation failed.', error.message);
  process.exit(1);
}
