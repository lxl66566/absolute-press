/**
 * Icon set for the social surfaces (navbar rail + drawer footer + build-time
 * profile card): builtins with the site config `icons` overlaid, so every
 * surface resolves a name identically. The builtin table lives in shared
 * (see shared/brand-icons.ts).
 */
import { BUILTIN_SOCIAL_ICONS } from '../../../shared/brand-icons';

export { BUILTIN_SOCIAL_ICONS };

export function socialIconSet(
  icons: Record<string, string> | undefined,
): Record<string, string> {
  return { ...BUILTIN_SOCIAL_ICONS, ...icons };
}
