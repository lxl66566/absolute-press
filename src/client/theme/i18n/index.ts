import type { Accessor } from 'solid-js';

import {
  formatMessage,
  messagesForLang,
  messagesForSite,
  type Messages,
} from '../../../shared/i18n/index.ts';
import type { PagePayload } from '../../../shared/types.ts';

// Copy tables and pure resolution live in shared/i18n (also imported by the
// node build); this facade only carries the solid/DOM-dependent helpers.
export { formatMessage };
export type { Messages };

/**
 * Messages for one page's site block: locale key -> lang -> table, so a
 * default locale whose lang is not Chinese resolves its own copy. Each
 * locale is a separate static page, hence non-reactive by design.
 */
export function useMessages(
  site: Accessor<Pick<PagePayload['site'], 'locale' | 'locales'>>,
): Messages {
  return messagesForSite(site());
}

/**
 * Messages for components without a site prop (islands on the mermaid
 * fence path): read the static page language (`<html lang>`); each locale
 * is its own document. Unknown languages fall back to zh.
 */
export function pageMessages(): Messages {
  return messagesForLang(document.documentElement.lang);
}
