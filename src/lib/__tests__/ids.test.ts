import { describe, it, expect } from "bun:test";
import {
  newSessionId,
  newCorrelationId,
  newSearchId,
  newTrackId,
  newAlbumId,
  newArtistId,
} from "../ids";

describe("ID generators", () => {
  it("newSessionId starts with sess_", () => {
    expect(newSessionId()).toMatch(/^sess_/);
  });

  it("newCorrelationId starts with cor_", () => {
    expect(newCorrelationId()).toMatch(/^cor_/);
  });

  it("newSearchId starts with srch_", () => {
    expect(newSearchId()).toMatch(/^srch_/);
  });

  it("newTrackId starts with t_", () => {
    expect(newTrackId()).toMatch(/^t_/);
  });

  it("newAlbumId starts with alb_", () => {
    expect(newAlbumId()).toMatch(/^alb_/);
  });

  it("newArtistId starts with art_", () => {
    expect(newArtistId()).toMatch(/^art_/);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => newSessionId()));
    expect(ids.size).toBe(100);
  });

  it("IDs have the expected format (prefix + 12 alphanumeric chars)", () => {
    const id = newSessionId();
    const suffix = id.slice("sess_".length);
    expect(suffix).toMatch(/^[0-9a-f]{12}$/);
  });
});
