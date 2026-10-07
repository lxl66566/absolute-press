/**
 * UI copy tables and pure resolution, shared by the client chrome and the
 * node build layer (heimu tooltip). No solid / DOM imports here: this
 * directory is imported by the node build, so relative specifiers carry an
 * explicit .ts (plain node ESM type-stripping requirement).
 */
import type { LocaleInfo } from '../types.ts';
import { en } from './en.ts';
import { type Messages, zh } from './zh.ts';

export type { Messages };
export { en, zh };

/**
 * Resolve UI copy by `<html lang>` prefix: `en`/`en-US` -> en, anything
 * else (unknown or missing) falls back to zh. The table has two entries,
 * so a prefix match beats registering every region variant.
 */
export function messagesForLang(lang: string | undefined): Messages {
  return (lang ?? '').toLowerCase().startsWith('en') ? en : zh;
}

/**
 * Payload locale key -> `<html lang>` via the site's locales table
 * (e.g. 'root' -> 'zh-CN'); '' when the key is unknown.
 */
export function langOfLocale(
  locale: string | undefined,
  locales: LocaleInfo[],
): string {
  return locales.find(l => l.key === locale)?.lang ?? '';
}

/** UI copy for a payload site block: locale key -> lang -> table. */
export function messagesForSite(site: {
  locale: string;
  locales: LocaleInfo[];
}): Messages {
  return messagesForLang(langOfLocale(site.locale, site.locales));
}

/** Fill `{key}` placeholders in a message template. */
export function formatMessage(
  template: string,
  params: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (raw, key: string) => {
    const value = params[key];
    return value === undefined ? raw : String(value);
  });
}
