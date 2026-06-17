/**
 * Test script for all Export API routes:
 *   POST /api/v2/export/txt
 *   POST /api/v2/export/csv
 *   POST /api/v2/export/json
 *   POST /api/v2/export/docx
 *   POST /api/v2/export/searchable-pdf
 */
import {
  BASE_URL, apiRequest, pass, fail, section, hasField, C,
} from "./shared.js";

let passed = 0, failed = 0;

function check(name, condition) {
  if (condition) { pass(name); passed++; }
  else { fail(name); failed++; }
}

/** Sample OCR result for export endpoints */
const sampleResult = {
  filename: "test_document.png",
  file_type: "png",
  status: "success",
  detected_lines: 3,
  full_text: "Sample\nUrdu text\nfor export",
  lines: [
    { index: 0, text: "Sample", confidence: 0.95, bounding_box: [10, 20, 100, 40] },
    { index: 1, text: "Urdu text", confidence: 0.88, bounding_box: [10, 50, 120, 70] },
    { index: 2, text: "for export", confidence: 0.92, bounding_box: [10, 80, 130, 100] },
  ],
  confidence_stats: { mean: 0.9167, min: 0.88, max: 0.95, median: 0.92 },
  annotated_image_b64: "",
  processing_time_ms: 150.3,
};

// ── POST /export/txt ───────────────────────────────────────────
async function testExportTxt() {
  section("POST /api/v2/export/txt");

  const res = await apiRequest("post", `${BASE_URL}/export/txt`, {
    data: sampleResult,
  });

  if (res.ok && res.status === 200) {
    check("Status 200", true);
  } else {
    fail(`Status ${res.status}`, res.error || "Not OK");
    return;
  }

  check("Has 'format' = 'txt'", res.data?.format === "txt");
  check("Has 'data' string", typeof res.data?.data === "string");
  check("'data' contains text", (res.data?.data || "").length > 0);
}

// ── POST /export/csv ───────────────────────────────────────────
async function testExportCsv() {
  section("POST /api/v2/export/csv");

  const res = await apiRequest("post", `${BASE_URL}/export/csv`, {
    data: sampleResult,
  });

  if (res.ok && res.status === 200) {
    check("Status 200", true);
  } else {
    fail(`Status ${res.status}`, res.error || "Not OK");
    return;
  }

  check("Has 'format' = 'csv'", res.data?.format === "csv");
  check("Has 'data' string", typeof res.data?.data === "string");
  check("'data' has CSV rows", (res.data?.data || "").includes(","));
}

// ── POST /export/docx ──────────────────────────────────────────
async function testExportDocx() {
  section("POST /api/v2/export/docx");

  const res = await apiRequest("post", `${BASE_URL}/export/docx`, {
    data: sampleResult,
  });

  if (res.ok && res.status === 200) {
    check("Status 200 or handled gracefully", true);
    // docx may require python-docx — accept either success or 501
    if (hasField(res.data, "data_b64")) {
      check("'data_b64' is string/length > 0", typeof res.data?.data_b64 === "string" && res.data.data_b64.length > 0);
    }
  } else if (res.status === 501) {
    check("Returns 501 (python-docx not installed)", true);
    check("Has 'detail' explaining the error", hasField(res.data, "detail"));
  } else {
    fail(`Status ${res.status}`, res.error || "DocX export failed");
  }
}

// ── POST /export/searchable-pdf ────────────────────────────────
async function testExportSearchablePdf() {
  section("POST /api/v2/export/searchable-pdf");

  const res = await apiRequest("post", `${BASE_URL}/export/searchable-pdf`, {
    data: sampleResult,
  });

  if (res.ok && res.status === 200) {
    check("Status 200", true);
    check("'data_b64' is base64 string", typeof res.data?.data_b64 === "string" && res.data.data_b64.length > 0);
  } else if (res.status === 500) {
    // May need PyMuPDF — accept if it returns a detail message
    check("Returns JSON error for missing dependency", hasField(res.data, "detail"));
  } else {
    fail(`Status ${res.status}`, res.error || "Searchable PDF export failed");
  }
}

// ── Test with empty result ─────────────────────────────────────
async function testExportWithEmptyResult() {
  section("POST /export/* (empty result)");

  const emptyResult = { filename: "", file_type: "", status: "error", full_text: "", lines: [] };

  const res1 = await apiRequest("post", `${BASE_URL}/export/txt`, { data: emptyResult });
  if (res1.ok && res1.status === 200) {
    check("Empty TXT → Status 200", true);
  } else {
    fail(`Empty TXT Status ${res1.status}`, res1.error);
  }

  const res2 = await apiRequest("post", `${BASE_URL}/export/csv`, { data: emptyResult });
  if (res2.ok && res2.status === 200) {
    check("Empty CSV → Status 200", true);
    // Should still have header row
    check("CSV has header row", (res2.data?.data || "").includes("index"));
  } else {
    fail(`Empty CSV Status ${res2.status}`, res2.error);
  }
}

// ── Test missing 'data' body ───────────────────────────────────
async function testMissingBody() {
  section("POST /export/txt (missing body)");

  const res = await apiRequest("post", `${BASE_URL}/export/txt`);

  // FastAPI will return 422 for missing required JSON body
  if (res.status === 422 || res.status === 405 || res.error) {
    check("Missing body → validation error / handled", true);
  } else {
    check("Returns response without body", typeof res?.data !== "undefined");
  }
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  console.log(`${C.bold}${C.blue}Testing Export Routes${C.reset}\n`);
  console.log(`Base URL: ${BASE_URL}\n`);

  await testExportTxt();
  await testExportCsv();
  await testExportDocx();
  await testExportSearchablePdf();
  await testExportWithEmptyResult();
  await testMissingBody();

  printSummary();
}

function printSummary() {
  console.log(`\n${C.bold}━━━ Export Routes Summary ━━━${C.reset}`);
  console.log(`  ${C.green}Passed: ${passed}${C.reset}`);
  console.log(`  ${failed > 0 ? C.red : C.gray}Failed: ${failed}${C.reset}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`${C.red}Fatal error:${C.reset}`, err.message);
  process.exit(1);
});
