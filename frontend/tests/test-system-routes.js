/**
 * Test script for all System API routes:
 *   GET  /api/v2/health
 *   GET  /api/v2/stats
 *   POST /api/v2/device/switch
 *   GET  /api/v2/cache/stats
 *   POST /api/v2/cache/clear
 *   GET  /api/v2/config
 */
import {
  BASE_URL, apiRequest, pass, fail, section, hasField, C,
} from "./shared.js";

let passed = 0, failed = 0;

function check(name, condition) {
  if (condition) { pass(name); passed++; }
  else { fail(name); failed++; }
}

// ── GET /health ───────────────────────────────────────────────
async function testHealth() {
  section("GET /api/v2/health");
  const res = await apiRequest("get", `${BASE_URL}/health`);

  if (res.ok && res.status === 200) {
    check("Status 200", true);
  } else {
    fail(`Status ${res.status}`, res.error || "Not OK");
    return; // skip further checks
  }

  check("Response has 'status' field", hasField(res.data, "status"));
  check("Status value is 'healthy'", res.data?.status === "healthy");
  check("Response has 'service' field", hasField(res.data, "service"));
  check("Response has 'version' field", hasField(res.data, "version"));
  check("Response has 'models_loaded' field", hasField(res.data, "models_loaded"));
  check("Response has 'device' field", hasField(res.data, "device"));
  check("Response has 'cuda_available' field", hasField(res.data, "cuda_available"));
}

// ── GET /stats ────────────────────────────────────────────────
async function testStats() {
  section("GET /api/v2/stats");
  const res = await apiRequest("get", `${BASE_URL}/stats`);

  if (res.ok && res.status === 200) {
    check("Status 200", true);
  } else {
    fail(`Status ${res.status}`, res.error || "Not OK");
    return;
  }

  check("Response has 'total_requests'", hasField(res.data, "total_requests"));
  check("Response has 'requests_per_second'", hasField(res.data, "requests_per_second"));
  check("Response has 'latency' object", hasField(res.data, "latency"));
  check("Response has 'ocr_success' counter", hasField(res.data, "ocr_success"));
  check("Response has 'gpu_memory_used_gb'", hasField(res.data, "gpu_memory_used_gb"));
}

// ── POST /device/switch (safe tests only) ─────────────────────
async function testDeviceSwitch() {
  section("POST /api/v2/device/switch");

  // Test with empty body (auto-detect)
  const res1 = await apiRequest("post", `${BASE_URL}/device/switch`);
  if (res1.ok && res1.status === 200) {
    check("Empty device → auto-detect returns ok", hasField(res1.data, "status"));
  } else {
    // May fail if models aren't loaded — still a valid response shape
    check("Empty device response is JSON (not HTML)", typeof res1?.data?.status === "object" || typeof res1?.data?.detail === "string");
  }

  // Test with invalid device value
  const res2 = await apiRequest("post", `${BASE_URL}/device/switch`, {
    data: { device: "invalid_device" },
  });
  if (res2.ok && res2.status === 400) {
    check("Invalid device → HTTP 400", true);
  } else {
    fail("Invalid device should return 400", `got ${res2.status}`);
  }

  // Test with "cpu" string (safe, won't crash even if GPU unavailable)
  const res3 = await apiRequest("post", `${BASE_URL}/device/switch`, {
    data: { device: "cpu" },
  });
  if (res3.ok && res3.status === 200) {
    check('Device "cpu" → status ok', hasField(res3.data, "status"));
  } else if (res3.ok && res3.status === 500) {
    check('Device "cpu" returns detail (expected if model unavailable)', hasField(res3.data, "detail"));
  } else {
    fail('Device "cpu"', res3.error || `Status ${res3.status}`);
  }
}

// ── GET /cache/stats ──────────────────────────────────────────
async function testCacheStats() {
  section("GET /api/v2/cache/stats");
  const res = await apiRequest("get", `${BASE_URL}/cache/stats`);

  if (res.ok && res.status === 200) {
    check("Status 200", true);
  } else {
    fail(`Status ${res.status}`, res.error || "Not OK");
    return;
  }

  check("Response has 'cache' object", hasField(res.data, "cache"));
  const cache = res.data?.cache;
  if (cache) {
    check("Cache has 'entries_in_memory'", hasField(cache, "entries_in_memory"));
    check("Cache has 'hits'", hasField(cache, "hits"));
    check("Cache has 'misses'", hasField(cache, "misses"));
    check("Cache has 'hit_rate_pct'", hasField(cache, "hit_rate_pct"));
    check("Entries is number", typeof cache.entries_in_memory === "number");
  }
}

// ── POST /cache/clear ─────────────────────────────────────────
async function testCacheClear() {
  section("POST /api/v2/cache/clear");
  const res = await apiRequest("post", `${BASE_URL}/cache/clear`);

  if (res.ok && res.status === 200) {
    check("Status 200", true);
    check("Response has 'status' field", hasField(res.data, "status"));
    check("'status' is 'ok'", res.data?.status === "ok");
  } else {
    fail(`Status ${res.status}`, res.error || "Not OK");
  }
}

// ── GET /config ───────────────────────────────────────────────
async function testConfig() {
  section("GET /api/v2/config");
  const res = await apiRequest("get", `${BASE_URL}/config`);

  if (res.ok && res.status === 200) {
    check("Status 200", true);
  } else {
    fail(`Status ${res.status}`, res.error || "Not OK");
    return;
  }

  check("Has 'server' section", hasField(res.data, "server"));
  check("Server has 'host'", hasField(res.data, "server.host"));
  check("Server has 'port'", hasField(res.data, "server.port"));
  check("Port is number", typeof res.data?.server?.port === "number");

  check("Has 'model' section", hasField(res.data, "model"));
  check("Model has 'default_device'", hasField(res.data, "model.default_device"));
  check("Model has 'conf_threshold'", hasField(res.data, "model.conf_threshold"));

  check("Has 'limits' section", hasField(res.data, "limits"));
  check("Limits has 'max_file_size_mb'", hasField(res.data, "limits.max_file_size_mb"));
  check("Limits has 'max_batch_files'", hasField(res.data, "limits.max_batch_files"));

  check("Has 'features' section", hasField(res.data, "features"));
  check("Features has 'cache_enabled'", hasField(res.data, "features.cache_enabled"));
  check("Features has 'rate_limiting_enabled'", hasField(res.data, "features.rate_limiting_enabled"));
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log(`${C.bold}${C.blue}Testing System Routes${C.reset}\n`);
  console.log(`Base URL: ${BASE_URL}\n`);

  await testHealth();
  await testStats();
  await testDeviceSwitch();
  await testCacheStats();
  await testCacheClear();
  await testConfig();

  printSummary();
}

function printSummary() {
  console.log(`\n${C.bold}━━━ System Routes Summary ━━━${C.reset}`);
  console.log(`  ${C.green}Passed: ${passed}${C.reset}`);
  console.log(`  ${failed > 0 ? C.red : C.gray}Failed: ${failed}${C.reset}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`${C.red}Fatal error:${C.reset}`, err.message);
  process.exit(1);
});
