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
  // Overwrite tsconfig compiler options to compile CommonJS to build/ directory
  execSync('npx tsc --project tsconfig.json --noEmit false --outDir build --module commonjs --target es2020 --skipLibCheck true', {
    cwd: rootDir,
    stdio: 'inherit'
  });
  console.log('Compilation completed successfully!');
} catch (error) {
  console.error('Compilation failed. Trying fallback compilation...', error.message);
  // If full project compile fails, try compiling only lib/
  try {
    execSync('npx tsc lib/db.ts lib/supabase.ts lib/types.ts --noEmit false --outDir build/lib --module commonjs --target es2020 --skipLibCheck true', {
      cwd: rootDir,
      stdio: 'inherit'
    });
    console.log('Fallback compilation completed successfully!');
  } catch (err) {
    console.error('All compilation methods failed.', err.message);
    process.exit(1);
  }
}
