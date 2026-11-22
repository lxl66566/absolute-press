/**
 * Date helpers shared by the client theme (article cards) and the node
 * build (build components, listings). No DOM imports: node consumes this
 * too, so relative specifiers carry an explicit .ts (plain node ESM
 * type-stripping).
 *
 * Zones: every date string that flows through the pipeline (frontmatter
 * `date`/`updated`, git `updatedAt`, sitemap/RSS instants) is a full ISO
 * instant. Interpretation of zoneless frontmatter stamps happens once,
 * upstream, in normalizeDateString (frontmatter.ts); this module only
 * renders an instant on a zone's wall calendar. The default 'UTC' keeps
 * builds and visitors host-independent; a configured site zone (config
 * `timeZone`, validated in resolveConfig) moves both the interpretation
 * and the rendering so the shown date stays the author's written calendar
 * date.
 */
const pad = (n: number): string => String(n).padStart(2, '0');

/** Long-offset formatters per zone: 'GMT+08:00' / 'GMT-05:30' / 'GMT'. */
const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Offset of `timeZone` at the given UTC instant, in milliseconds east of
 * UTC. `Intl` is the only source of zone rules (DST included) — no offset
 * tables shipped with the framework.
 */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  let dtf = offsetFormatters.get(timeZone);
  if (dtf === undefined) {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    });
    offsetFormatters.set(timeZone, dtf);
  }
  const part = dtf.formatToParts(utcMs).find(p => p.type === 'timeZoneName');
  const match = part && /^GMT([+-])(\d{2}):(\d{2})$/.exec(part.value);
  if (!match) return 0; // 'GMT' (offset zero) or an exotic spelling
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return (match[1] === '-' ? -minutes : minutes) * 60_000;
}

/**
 * UTC instant of a zone-local wall time. `wallMs` carries the written wall
 * components read as UTC (`Date.UTC` of them). The offset depends on the
 * zone's rules at the resolved instant, so a first guess is corrected
 * once; two passes cover every real zone (offsets change at most a few
 * times a year by a few hours). Wall times inside a DST gap have no true
 * instant — they resolve deterministically past the transition, which is
 * the best a stamp can do.
 */
export function wallTimeToUtc(wallMs: number, timeZone: string): number {
  let instant = wallMs - zoneOffsetMs(wallMs, timeZone);
  instant = wallMs - zoneOffsetMs(instant, timeZone);
  return instant;
}

/**
 * Format a date string or Date as `yyyy-MM-dd` on the wall calendar of
 * `timeZone`; null when invalid. The instant is shifted onto that wall
 * clock and read back with the UTC getters, so node-built HTML and every
 * visitor's client-side re-render produce the same string regardless of
 * the build host or browser timezone.
 */
export function formatDate(
  value: string | Date | null | undefined,
  timeZone: string = 'UTC',
): string | null {
  if (!value) return null;
  const ms =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(ms)) return null;
  const shifted = new Date(
    timeZone === 'UTC' ? ms : ms + zoneOffsetMs(ms, timeZone),
  );
  // Years pad to the `yyyy-` ISO shape (`getUTCFullYear` would print a
  // bare `500-`); earlier dates only ever arrive via full ISO strings.
  return `${String(shifted.getUTCFullYear()).padStart(4, '0')}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}
