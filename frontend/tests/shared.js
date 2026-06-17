/**
 * Shared utilities for all route test scripts.
 */
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BASE_URL = process.env.API_BASE_URL || "http://localhost:8000/api/v2";

/** Colors for terminal output */
export const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
};

export function pass(label) {
  console.log(`  ${C.green}✓${C.reset} ${label}`);
}

export function fail(label, reason = "") {
  console.log(`  ${C.red}✗${C.reset} ${label}${reason ? ` — ${C.yellow}${reason}${C.reset}` : ""}`);
}

export function section(title) {
  console.log(`\n${C.bold}${C.blue}━━━ ${title} ━━━${C.reset}`);
}

/** Create a minimal valid PNG image (1x1 white pixel) for testing file upload routes */
export function createTestPng() {
  // Minimal PNG: IHDR + IDAT + IEND
  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk length + type
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // width=1, height=1
    0x08, 0x02, 0x00, 0x00, 0x00, 0xff, 0x9f, 0x4b, // bit depth, color type, etc.
    0x00, 0x00, 0x00, 0x07, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
    0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00,
    0x00, 0x02, 0x00, 0x01, // compressed data
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, // IEND chunk
    0xae, 0x42, 0x60, 0x82,
  ]);

  const outputPath = path.join(__dirname, "test_image.png");
  fs.writeFileSync(outputPath, pngHeader);
  return outputPath;
}

/** Create a minimal valid PDF (1 page, blank) for testing PDF routes */
export function createTestPdf() {
  // Minimal valid PDF document
  const pdfContent = `%PDF-1.0
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer<</Size 4/Root 1 0 R>>
startxref
190
%%EOF`;

  const outputPath = path.join(__dirname, "test_file.pdf");
  fs.writeFileSync(outputPath, pdfContent);
  return outputPath;
}

/** Read a file as Buffer for upload */
export function readFileForUpload(filePath) {
  return fs.readFileSync(filePath);
}

/** Make an API request with proper error handling */
export async function apiRequest(method, url, options = {}) {
  const config = {
    method,
    url,
    timeout: 30000,
    ...options,
    // Don't validate SSL for local dev
    httpsAgent: new (await import("https")).Agent({ rejectUnauthorized: false }),
  };

  try {
    const response = await axios(config);
    return { ok: true, status: response.status, data: response.data };
  } catch (err) {
    if (err.response) {
      return {
        ok: false,
        status: err.response.status,
        data: err.response.data,
        error: `HTTP ${err.response.status}`,
      };
    } else if (err.code === "ECONNREFUSED") {
      return {
        ok: false,
        error: "Connection refused. Is the server running?",
      };
    } else if (err.code === "ETIMEDOUT") {
      return { ok: false, error: "Request timed out" };
    }
    return { ok: false, error: err.message };
  }
}

/** Check that a required field exists in response data */
export function hasField(data, fieldPath, expectedType) {
  const parts = fieldPath.split(".");
  let val = data;
  for (const p of parts) {
    if (val === undefined || val === null) return false;
    val = val[p];
  }
  if (expectedType && typeof val !== expectedType) return false;
  return true;
}

/** Format bytes to human readable */
export function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export default {
  BASE_URL,
  apiRequest,
  pass, fail, section,
  createTestPng, createTestPdf,
  hasField, formatBytes, C,
};
