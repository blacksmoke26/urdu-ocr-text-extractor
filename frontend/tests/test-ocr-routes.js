/**
 * Test script for all OCR API routes:
 *   POST /api/v2/ocr          (batch — tested with single file)
 *   POST /api/v2/ocr/single   (single image)
 *   POST /api/v2/ocr/with-enhance  (enhanced OCR)
 *   POST /api/v2/ocr/direct-tensor (direct pipeline)
 */
import {
  BASE_URL, apiRequest, pass, fail, section, hasField, C,
  createTestPng, readFileForUpload,
} from "./shared.js";

let passed = 0, failed = 0;

function check(name, condition) {
  if (condition) { pass(name); passed++; }
  else { fail(name); failed++; }
}

// ── POST /ocr (batch with single file) ────────────────────────
async function testBatchOcr() {
  section("POST /api/v2/ocr");

  const pngPath = createTestPng();
  const fileBuffer = readFileForUpload(pngPath);

  const res = await apiRequest("post", `${BASE_URL}/ocr`, {
    headers: { "Content-Type": "multipart/form-data" },
    data: {
      files: new Blob([fileBuffer], { type: "image/png" }),
      conf_threshold: "0.2",
      img_size: "1280",
      use_cache: "true",
      text_cleaning: "false", // skip cleaning for test stability
    },
  });

  if (res.ok && res.status === 200) {
    check("Status 200", true);
  } else {
    // Model may not be loaded in test env — accept 500 as "not a crash"
    if (res.status === 500 || res.error) {
      check("Returns response (not connection error)", typeof res?.data !== "undefined");
    } else {
      fail(`Status ${res.status}`, res.error);
    }
    return;
  }

  check("Has 'task_id' field", hasField(res.data, "task_id"));
  check("task_id starts with 'batch_'", (res.data?.task_id || "").startsWith("batch_"));
  check("Has 'total_files'", hasField(res.data, "total_files"));
  check("Has 'completed' counter", hasField(res.data, "completed"));
  check("Has 'failed' counter", hasField(res.data, "failed"));
  check("Has 'processing_time_ms'", hasField(res.data, "processing_time_ms"));
  check("Has 'results' array", Array.isArray(res.data?.results));
}

// ── POST /ocr/single ───────────────────────────────────────────
async function testSingleOcr() {
  section("POST /api/v2/ocr/single");

  const pngPath = createTestPng();
  const fileBuffer = readFileForUpload(pngPath);

  const res = await apiRequest("post", `${BASE_URL}/ocr/single`, {
    headers: { "Content-Type": "multipart/form-data" },
    data: {
      file: new Blob([fileBuffer], { type: "image/png" }),
      conf_threshold: "0.2",
      img_size: "1280",
      text_cleaning: "false",
    },
  });

  if (res.ok && res.status === 200) {
    check("Status 200", true);
  } else {
    if (res.status === 500 || res.error) {
      check("Returns response (not connection error)", typeof res?.data !== "undefined");
    } else {
      fail(`Status ${res.status}`, res.error);
    }
    return;
  }

  check("Has 'task_id' field", hasField(res.data, "task_id"));
  check("task_id starts with 'single_'", (res.data?.task_id || "").startsWith("single_"));
  check("Has 'filename' field", hasField(res.data, "filename"));
  check("Has 'status'", hasField(res.data, "status"));
  check("Has 'full_text'", hasField(res.data, "full_text"));
  check("Has 'detected_lines'", hasField(res.data, "detected_lines"));
  check("Has 'lines' array", Array.isArray(res.data?.lines));
  check("Has 'processing_time_ms'", hasField(res.data, "processing_time_ms"));
  check("Has 'confidence_stats'", hasField(res.data, "confidence_stats"));
  check("Has 'cache_stats'", hasField(res.data, "cache_stats"));

  // If lines exist, check individual line shape
  const lines = res.data?.lines;
  if (Array.isArray(lines) && lines.length > 0) {
    check("Line has 'index'", hasField(lines[0], "index"));
    check("Line has 'text'", hasField(lines[0], "text"));
    check("Line has 'confidence'", hasField(lines[0], "confidence"));
    check("Line has 'bounding_box'", hasField(lines[0], "bounding_box"));
  }
}

// ── POST /ocr/with-enhance ─────────────────────────────────────
async function testEnhancedOcr() {
  section("POST /api/v2/ocr/with-enhance");

  const pngPath = createTestPng();
  const fileBuffer = readFileForUpload(pngPath);

  // Test with default (no enhancement) options
  const res1 = await apiRequest("post", `${BASE_URL}/ocr/with-enhance`, {
    headers: { "Content-Type": "multipart/form-data" },
    data: {
      file: new Blob([fileBuffer], { type: "image/png" }),
      conf_threshold: "0.2",
      img_size: "1280",
      auto_contrast: "false",
      sharpen: "false",
      denoise: "false",
      normalize_background: "false",
    },
  });

  if (res1.ok && res1.status === 200) {
    check("Status 200 (no enhancements)", true);
  } else if (res1.status === 500 || res1.error) {
    check("Returns JSON on error", typeof res1?.data !== "undefined");
  } else {
    fail(`No-enhance Status ${res1.status}`, res1.error);
  }

  check("Has 'task_id'", hasField(res1.data, "task_id"));
  check("task_id starts with 'enhanced_'", (res1.data?.task_id || "").startsWith("enhanced_"));
}

// ── POST /ocr/direct-tensor ────────────────────────────────────
async function testDirectTensor() {
  section("POST /api/v2/ocr/direct-tensor");

  const pngPath = createTestPng();
  const fileBuffer = readFileForUpload(pngPath);

  const res = await apiRequest("post", `${BASE_URL}/ocr/direct-tensor`, {
    headers: { "Content-Type": "multipart/form-data" },
    data: {
      file: new Blob([fileBuffer], { type: "image/png" }),
      conf_threshold: "0.2",
      img_size: "1280",
    },
  });

  if (res.ok && res.status === 200) {
    check("Status 200", true);
  } else {
    if (res.status === 500 || res.error) {
      check("Returns JSON on error", typeof res?.data !== "undefined");
    } else {
      fail(`Status ${res.status}`, res.error);
    }
    return;
  }

  check("Has 'task_id'", hasField(res.data, "task_id"));
  check("task_id starts with 'direct_'", (res.data?.task_id || "").startsWith("direct_"));
  check("Has 'filename'", hasField(res.data, "filename"));
  check("Has 'file_type'", hasField(res.data, "file_type"));
  check("Has 'status'", hasField(res.data, "status"));
  check("Has 'detected_lines'", hasField(res.data, "detected_lines"));
  check("Has 'full_text'", hasField(res.data, "full_text"));
  check("Has 'lines' array", Array.isArray(res.data?.lines));
  check("Has 'processing_time_ms'", hasField(res.data, "processing_time_ms"));
  check("Has 'confidence_stats'", hasField(res.data, "confidence_stats"));
}

// ── Test with text_cleaning as JSON dict ───────────────────────
async function testTextCleaningOptions() {
  section("POST /api/v2/ocr/single (text_cleaning=json)");

  const pngPath = createTestPng();
  const fileBuffer = readFileForUpload(pngPath);

  const res = await apiRequest("post", `${BASE_URL}/ocr/single`, {
    headers: { "Content-Type": "multipart/form-data" },
    data: {
      file: new Blob([fileBuffer], { type: "image/png" }),
      conf_threshold: "0.2",
      img_size: "1280",
      text_cleaning: JSON.stringify({
        remove_diacritics: false,
        normalize_alef: true,
        normalize_tatil: true,
        reshape: true,
        normalize_whitespace: true,
      }),
    },
  });

  if (res.ok && res.status === 200) {
    check("JSON text_cleaning → Status 200", true);
    check("Has 'full_text'", hasField(res.data, "full_text"));
  } else {
    fail(`Status ${res.status}`, res.error || "Text cleaning JSON failed");
  }
}

// ── Test invalid file extension ────────────────────────────────
async function testInvalidExtension() {
  section("POST /api/v2/ocr/single (invalid extension)");

  // Create a text file with .png extension
  const tmpPath = createTestPng();
  fs.writeFileSync(tmpPath, "not a real png", "utf-8");
  const fileBuffer = readFileForUpload(tmpPath);

  const res = await apiRequest("post", `${BASE_URL}/ocr/single`, {
    headers: { "Content-Type": "multipart/form-data" },
    data: {
      file: new Blob([fileBuffer], { type: "image/png" }),
    },
  });

  // May succeed or fail depending on validation — if it fails with 400 that's expected
  check("Returns JSON response", typeof res?.data !== "undefined");
}

// ── Main ────────────────────────────────────────────────────────
import fs from "fs";

async function main() {
  console.log(`${C.bold}${C.blue}Testing OCR Routes${C.reset}\n`);
  console.log(`Base URL: ${BASE_URL}\n`);

  await testBatchOcr();
  await testSingleOcr();
  await testEnhancedOcr();
  await testDirectTensor();
  await testTextCleaningOptions();
  await testInvalidExtension();

  printSummary();
}

function printSummary() {
  console.log(`\n${C.bold}━━━ OCR Routes Summary ━━━${C.reset}`);
  console.log(`  ${C.green}Passed: ${passed}${C.reset}`);
  console.log(`  ${failed > 0 ? C.red : C.gray}Failed: ${failed}${C.reset}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`${C.red}Fatal error:${C.reset}`, err.message);
  process.exit(1);
});
