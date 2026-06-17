# Notara Test Infrastructure

This document details the design, structure, and execution flow of the testing infrastructure implemented for the Notara project.

---

## Technical Design & Simulation Layer

Due to network restrictions (`CODE_ONLY` mode) preventing the download of headless browser binaries (e.g., Playwright, Puppeteer), Notara utilizes a custom **Node.js-native testing harness** powered by the built-in `node:test` and `node:assert` modules.

To execute tests that depend on web-browser APIs, Next.js page states, and Supabase client mutations, we have developed a simulation layer comprising three core parts:

### 1. Browser API Simulation (`test/mocks/browser.mock.js`)
* **DOM Globals**: Simulates global `window`, `document`, `navigator`, and storage contexts (`localStorage`, `sessionStorage`).
* **Audio & Recording APIs**: Mocks `MediaRecorder` state changes and event listeners (`onstart`, `onstop`, `ondataavailable`) to output dummy audio chunks.
* **Speech Recognition**: Mock implementations of `SpeechRecognition` and `webkitSpeechRecognition` to simulate speech-to-text translation and trigger the `onresult` callbacks.
* **Libraries Mocking**: Intercepts modules like `html2canvas` via Node.js's native `Module._load` hook to return a mock rendering function that outputs data URLs.
* **Print & Export Mock**: Mocks `window.print` and `document.createElement('a')` click behavior to test PDF and Word exports cleanly without visual UI dependencies.

### 2. Supabase Offline Simulator (`test/mocks/supabase.mock.js`)
* **Database State**: Maintains a real, reactive, in-memory state representing the Supabase database schema (`folders`, `summaries`, `chat_messages`, `study_groups`, `group_members`, and `group_folders`).
* **Query Builder**: A custom `MockQueryBuilder` class that handles real filter operations (`eq`, `in`), orderings (`order`), single selections (`single`), insertions (`insert`), updates (`update`), and deletions (`delete`).
* **MFA & Auth Simulator**: A complete mock representation of `supabase.auth` and `supabase.auth.mfa` that supports user registration, credentials login, OAuth redirects, and TOTP enrollment/challenge/verification/unenrollment.

### 3. Application State Simulator (`test/simulators/app.simulator.js`)
* Bridges the browser and database mock systems to mimic state logic from `app/page.tsx` and `app/login/page.tsx`.
* Coordinates state updates (e.g., `isRecordingMode`, `mfaEnabled`, `chosenSaveFolderId`) and calls the **actual database functions** (`lib/db.ts`) compiled into CommonJS.

---

## 4-Tier Test Case Hierarchy

The test suite contains **60 comprehensive test cases** organized across four distinct tiers:

### Tier 1: Feature Coverage (25 test cases)
Verifies that each of the 5 core features works as expected under standard conditions:
* **Feature 1: Voice Input** (5 tests) — Focuses on starting, pausing, resuming, stopping recordings, and transcribing speech into chat inputs.
* **Feature 2: Share Cards** (5 tests) — Focuses on layouts, html2canvas calling, and safe file downscaling.
* **Feature 3: Study Groups** (5 tests) — Focuses on group creation, joining, membership lists, and folder sharing.
* **Feature 4: Auth & 2FA** (5 tests) — Focuses on signup, sign-in, Google OAuth, and MFA enrollment/verification.
* **Feature 5: Summary, Exports, & Search** (5 tests) — Focuses on summary creation, PDF/Word exports, Ctrl+K activation, and query filtering.

### Tier 2: Boundary & Corner Cases (25 test cases)
Tests limits, validation errors, and exceptional conditions for all features:
* File size warning limits (>20MB check).
* Recording session caps (30 minutes for free tier; 120 minutes for pro tier).
* Clean handling of special characters, emojis, and excessively long titles.
* Validation on empty invite codes, duplicate group memberships, and duplicate shared folders.
* Invalid credentials, invalid 2FA codes, and missing MFA factors.
* Monthly free-tier quotas (max 5 summaries) and folder limit caps (max 3 summaries per folder).
* Safe escaping of regex characters in Ctrl+K search terms.

### Tier 3: Cross-Feature Combinations (5 test cases)
Tests the interaction between multiple components:
* **Auth + Study Group**: Flow of user registering and immediately creating a study group.
* **Voice Note + Summary**: Recording a live voice note and directly compiling it into a new summary.
* **Summary + Folder + Search**: Organizing a new summary under a folder and querying it via command search.
* **Summary + Share Link + Share Card**: Generating a public URL for a summary and downloading its share card.
* **MFA + Secure Group**: Requiring a verified 2FA factor to initialize group operations.

### Tier 4: Real-World Scenarios (5 test cases)
Simulates end-to-end user workflows:
* **4.1 Study Group Collaboration**: Log in, create a group, create folder, share folder, verify membership.
* **4.2 Multi-File Lecture Pipeline**: Log in, queue 3 lecture files, submit queue for sequential processing, inspect and export to Word.
* **4.3 Live Recording Share Deck**: Log in, record live with pause/resume, compile summary, toggle sharing to public, generate Story Share Card.
* **4.4 Collaborative Study Forking**: User A creates and shares a public summary; User B forks it, organizes it into a folder, and verifies private status.
* **4.5 Secure Workspace Setup & Active Study**: Log in, enroll 2FA, log out, log in with MFA challenge, open summary, and accumulate active study focus timer stored in localStorage.

---

## Setup & Execution

1. **Compilation Step**: Before running tests, TypeScript source files are compiled to a `build/` directory using standard `tsc`:
   ```bash
   node test/compile.js
   ```
2. **Execution Step**: Run the compiled test suite using Node's native test runner:
   ```bash
   node --test test/tier1.test.js test/tier2.test.js test/tier3.test.js test/tier4.test.js
   ```
3. **Automated Command**: Compile and run all tests in one go:
   ```bash
   npm test
   ```
