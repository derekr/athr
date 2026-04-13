/** Generate a short random ID suffix using crypto */
function randomSuffix(length = 12): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, length);
}

/** Session ID: sess_xxxxxxxxxxxx */
export function newSessionId(): string {
  return `sess_${randomSuffix(12)}`;
}

/** Correlation ID: cor_xxxxxxxxxxxx */
export function newCorrelationId(): string {
  return `cor_${randomSuffix(12)}`;
}

/** Search ID: srch_xxxxxxxxxxxx */
export function newSearchId(): string {
  return `srch_${randomSuffix(12)}`;
}

/** Track ID: t_xxxxxxxxxxxx */
export function newTrackId(): string {
  return `t_${randomSuffix(12)}`;
}

/** Album ID: alb_xxxxxxxxxxxx */
export function newAlbumId(): string {
  return `alb_${randomSuffix(12)}`;
}

/** Artist ID: art_xxxxxxxxxxxx */
export function newArtistId(): string {
  return `art_${randomSuffix(12)}`;
}
