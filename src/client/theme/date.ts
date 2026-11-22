export { formatDate } from '../../shared/date';
// Node build components format dates through the shared module too; the
// re-export keeps one import site for theme consumers.

import type { PagePayload } from '../../shared/types';

/**
 * Resolved zone of the payload page's locale (config `timeZone`); 'UTC'
 * only if the payload locale went missing, which the build never produces.
 */
export function timeZoneOf(site: PagePayload['site']): string {
  return (
    site.locales.find(locale => locale.key === site.locale)?.timeZone ?? 'UTC'
  );
}
