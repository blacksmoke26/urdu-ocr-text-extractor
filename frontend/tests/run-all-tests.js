#!/usr/bin/env node
/**
 * Main test runner — runs all route test scripts in sequence.
 *
 * Usage:
 *   cd frontend/tests
 *   node run-all-tests.js           # uses default API_BASE_URL
 *   API_BASE_URL=http://localhost:8000/api/v2 node run-all-tests.js
 */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  yellow: "\x1b[33m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

const scripts = [
  "test-system-routes.js",
  "test-ocr-routes.js",
  "test-pdf-routes.js",
  "test-export-routes.js",
  "test-realtime-routes.js",
];

function colorize(text, color) {
  return `${color}${text}${C.reset}`;
}

console.log(`\n${colorize(colorize("━━━ Urdu OCR v2 — Full API Test Suite ━━━", C.bold), C.blue)}\n`);
console.log(`   Base URL : ${colorize(process.env.API_BASE_URL || "http://localhost:8000/api/v2", C.yellow)}`);
console.log(`   Scripts  : ${scripts.length} test modules\n`);

const results = [];
let currentIdx = 0;

async function runScript(index) {
  if (index >= scripts.length) {
    printFinalSummary();
    return;
  }

  const script = scripts[index];
  console.log(`${colorize(`━━━[${index + 1}/${scripts.length}] Running: ${script} ━━━`, C.bold)}\n`);

  return new Promise((resolve) => {
    const child = spawn("node", [path.join(__dirname, script)], {
      stdio: "inherit",
      env: { ...process.env },
    });

    child.on("close", (code) => {
      results.push({ name: script, passed: code === 0 });
      console.log();
      currentIdx = index + 1;
      runScript(index + 1);
    });
  });
}

function printFinalSummary() {
  const allPassed = results.every((r) => r.passed);
  const totalPasses = results.filter((r) => r.passed).length;

  console.log(`\n${colorize("━".repeat(60), C.bold)}\n`);
  console.log(`${colorize(colorize("FINAL RESULTS", C.bold), C.bold)}:\n`);

  for (const r of results) {
    if (r.passed) {
      console.log(`  ${C.green}✓ PASSED${C.reset}   ${r.name}`);
    } else {
      console.log(`  ${C.red}✗ FAILED${C.reset}   ${r.name}`);
    }
  }

  console.log();
  if (allPassed) {
    console.log(`${colorize(colorize(`All ${totalPasses}/${results.length} test groups passed!`, C.bold), C.green)}\n`);
  } else {
    const failed = results.filter((r) => !r.passed).map((r) => r.name);
    console.log(`${colorize(`${results.length - totalPasses}/${results.length} group(s) failed:`, C.yellow)} ${failed.join(", ")}\n`);
  }

  console.log(`${colorize("Note:", C.dim)} File-upload routes (OCR/PDF) need the backend server running and models loaded.\n`);
  console.log(`${colorize("To re-run a specific group:", C.bold)} node ${scripts[0]}\n`);

  process.exit(allPassed ? 0 : 1);
}

// Start the chain
runScript(0).catch((err) => {
  console.error(`${C.red}Fatal error:${C.reset}`, err.message);
  process.exit(1);
});
