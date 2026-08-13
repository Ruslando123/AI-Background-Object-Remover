import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  JOB_OPERATIONS,
  type JobStatus,
} from "../../supabase/functions/_shared/types.js";

const router = readFileSync("supabase/functions/api-v1/index.ts", "utf8");
const normalizedRouter = router.replaceAll("\\", "");
const openapi = readFileSync("docs/backend/openapi.yaml", "utf8");
const migration = readFileSync(
  "supabase/migrations/202608110001_backend_foundation.sql",
  "utf8",
);

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? typescriptFiles(path)
      : entry.name.endsWith(".ts")
        ? [path]
        : [];
  });
}

describe("API/schema/documentation consistency", () => {
  it.each([
    "/sessions",
    "/uploads/presign",
    "/assets/complete-upload",
    "/jobs",
    "/capabilities",
    "/webhooks/",
    "/download",
    "/retry",
    "/cancel",
  ])("documents and routes %s", (fragment) => {
    expect(normalizedRouter).toContain(fragment);
    expect(openapi).toContain(fragment);
  });

  it("keeps operations identical across types, migration, and OpenAPI", () => {
    for (const operation of JOB_OPERATIONS) {
      expect(migration).toContain(`'${operation}'`);
      expect(openapi).toContain(operation);
    }
  });

  it("keeps job statuses identical across schema and OpenAPI", () => {
    const statuses: JobStatus[] = [
      "draft",
      "validating",
      "queued",
      "submitting",
      "processing",
      "postprocessing",
      "completed",
      "failed",
      "cancelled",
      "expired",
    ];
    for (const status of statuses) {
      expect(migration).toContain(`'${status}'`);
      expect(openapi).toMatch(new RegExp(`\\b${status}\\b`));
    }
  });

  it("uses Deno/Web platform APIs rather than Node imports in Edge code", () => {
    for (const file of typescriptFiles("supabase/functions")) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/from ["']node:/);
      expect(source, file).not.toMatch(/require\s*\(/);
    }
  });

  it("keeps secret-bearing values outside the structured-log allowlist", () => {
    const logger = readFileSync("supabase/functions/_shared/logger.ts", "utf8");
    for (const forbidden of [
      "sessionToken",
      "serviceRoleKey",
      "signedUrl",
      "apiKey",
      "rawBody",
    ]) {
      expect(logger).not.toContain(`"${forbidden}"`);
    }
  });
});
