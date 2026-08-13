import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/202608110001_backend_foundation.sql",
  "utf8",
);

describe("migration security invariants", () => {
  it("enables RLS on every backend table without public policies", () => {
    for (const table of [
      "media_sessions",
      "media_assets",
      "processing_jobs",
      "edit_versions",
      "job_events",
      "provider_webhook_events",
    ]) {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
    expect(migration).not.toMatch(/create\s+policy/i);
  });

  it("revokes PUBLIC function execution and grants only backend RPC", () => {
    expect(migration).toContain(
      "revoke execute on all functions in schema public from public, anon, authenticated",
    );
    expect(migration).not.toContain(
      "grant execute on all functions in schema public",
    );
  });

  it("creates a private bucket and avoids exposing storage through PostgREST", () => {
    expect(migration).toMatch(/'media-assets', 'media-assets', false/);
    const config = readFileSync("supabase/config.toml", "utf8");
    expect(config).toContain('schemas = ["public"]');
    expect(config).not.toContain('schemas = ["public", "storage"]');
  });
});
