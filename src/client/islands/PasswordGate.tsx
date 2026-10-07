import { createEffect, createSignal, Show } from 'solid-js';
import type { Element as SolidElement } from 'solid-js';

import { hydrateIslands } from '../runtime/hydrate';
import { formatMessage, pageMessages } from '../theme/i18n';
import { upgradeMermaidFences } from '../theme/mount';
import { setGateUnlocked } from '../theme/state';

import './PasswordGate.css';

/**
 * Client-side password gate (island name: `PasswordGate`).
 *
 * The build layer wraps gated prose in this placeholder; `childrenHtml` is
 * the full page body, restored once a password whose sha256 hex is listed in
 * `hashes` is entered. Client-side obfuscation only — the content ships in
 * the HTML (CSS-hidden), this is not real encryption.
 */
export interface PasswordGateProps {
  childrenHtml?: string;
  /** sha256 hex of the accepted passwords. */
  hashes?: string[];
  hint?: string;
}

/**
 * Route-scoped storage keys for remembered unlocks. The session key keeps
 * the pre-existing sessionStorage behavior; the remember-me key persists in
 * localStorage until the reader clears site data (L13).
 */
export function gateStorageKeys(pathname: string): [string, string] {
  return [`ap-gate:${pathname}`, `ap-gate-saved:${pathname}`];
}

/**
 * Restore a remembered unlock. The session key wins (it reflects the most
 * recent unlock of this visit), then the remember-me key. Only hashes
 * listed in `hashes` count: a stale saved hash for a since-changed password
 * must not unlock anything.
 */
export function pickSavedHash(
  read: (key: string) => string | null,
  hashes: readonly string[],
  pathname: string,
): string | null {
  const [sessionKey, savedKey] = gateStorageKeys(pathname);
  for (const key of [sessionKey, savedKey]) {
    const saved = read(key);
    if (saved !== null && hashes.includes(saved)) return saved;
  }
  return null;
}

/** WebCrypto sha256 hex; must match node/build/encrypt.ts. */
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(buf)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Read a key across both stores; unavailable storage reads as empty. */
function readSaved(key: string): string | null {
  try {
    return sessionStorage.getItem(key) ?? localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function PasswordGate(props: PasswordGateProps): SolidElement {
  // Islands carry no locale prop: derive messages from the page language.
  // (The build layer may still embed a `locale` field in data-props; it is
  // deliberately ignored — <html lang> is the single source.)
  const t = pageMessages();
  const hashes = () => props.hashes ?? [];
  const [unlocked, setUnlocked] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const [remember, setRemember] = createSignal(false);
  let inputRef: HTMLInputElement | undefined;
  let gateRef: HTMLDivElement | undefined;
  let contentRef: HTMLDivElement | undefined;
  let shakeTimer: number | undefined;

  // Mount effect: a previous unlock is remembered by hash — this session's
  // sessionStorage entry, or the reader-side "remember password" entry.
  createEffect(
    () => 0,
    () => {
      if (
        pickSavedHash(readSaved, hashes(), window.location.pathname) !== null
      ) {
        setUnlocked(true);
        // Shared with the Toc chrome: encrypted headings stay hidden
        // until the gate opens.
        setGateUnlocked(true);
      } else {
        // A fresh gate resets the shared signal: under client-side
        // navigation a previously unlocked page would otherwise leak its
        // state into this locked page's TOC.
        setGateUnlocked(false);
      }
      if (!unlocked()) inputRef?.focus();
    },
  );

  // Unlock rebuilds the page body from the build-time childrenHtml: the
  // embedded islands (Mermaid, ZoomedImg, nested gates, ...) exist only as
  // fresh placeholder markup nobody scanned yet. Give the rebuilt container
  // the same treatment mountTheme gave the page body, then hydrate it. The
  // runtime's mounted marker keeps this idempotent; a nested gate re-mounts
  // locked and its own unlock runs this effect again — bounded, no recursion.
  createEffect(
    () => unlocked(),
    () => {
      // Render effects settle before user effects, so the <Show> branch and
      // its ref exist here; queueMicrotask keeps the rebuild-then-hydrate
      // pattern of ExpandableList (belt and braces for re-entrancy).
      queueMicrotask(() => {
        if (!contentRef) return;
        upgradeMermaidFences(contentRef);
        hydrateIslands(contentRef);
      });
    },
  );

  const submit = async (): Promise<void> => {
    const value = inputRef?.value ?? '';
    if (value === '') return;
    const hash = await sha256Hex(value);
    if (hashes().includes(hash)) {
      const [sessionKey, savedKey] = gateStorageKeys(window.location.pathname);
      try {
        sessionStorage.setItem(sessionKey, hash);
        // Remember password: persist the hash so later visits unlock
        // themselves (localStorage, route-scoped).
        if (remember()) localStorage.setItem(savedKey, hash);
      } catch {
        // best-effort persistence
      }
      setUnlocked(true);
      setGateUnlocked(true);
    } else {
      if (inputRef) inputRef.value = '';
      restartShake();
    }
  };

  /**
   * Restart the wrong-password shake (450ms, see PasswordGate.css). A rapid
   * retry must cancel the pending reset of the previous failure — otherwise it
   * drops the class mid-shake — and must re-add the class after a committed
   * style recalc, or the CSS animation never replays.
   */
  const restartShake = (): void => {
    window.clearTimeout(shakeTimer);
    setFailed(false);
    // The class removal lands in the scheduler's microtask flush; force a
    // reflow after it so the re-add restarts the animation.
    queueMicrotask(() => {
      if (!failed()) {
        void gateRef?.offsetWidth;
        setFailed(true);
      }
      shakeTimer = window.setTimeout(() => setFailed(false), 500);
    });
  };

  return (
    <div ref={gateRef} class={`ap-gate${failed() ? ' ap-gate--shake' : ''}`}>
      <Show
        when={unlocked()}
        fallback={
          <form
            class="ap-gate__form"
            onSubmit={e => {
              e.preventDefault();
              void submit();
            }}
          >
            <svg
              class="ap-gate__lock"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            <p class="ap-gate__title">{t.gate.title}</p>
            <Show when={props.hint}>
              {hint => (
                <p class="ap-gate__hint">
                  {formatMessage(t.gate.hint, { hint: hint() })}
                </p>
              )}
            </Show>
            <input
              ref={inputRef}
              type="password"
              class="ap-gate__input"
              placeholder={t.gate.placeholder}
              aria-label={t.gate.placeholder}
              autocomplete="off"
            />
            <label class="ap-gate__remember">
              <input
                type="checkbox"
                checked={remember()}
                onInput={e => setRemember(e.currentTarget.checked)}
              />
              {t.gate.remember}
            </label>
            <button type="submit" class="ap-gate__submit">
              {t.gate.submit}
            </button>
            <Show when={failed()}>
              <p class="ap-gate__error" role="alert">
                {t.gate.error}
              </p>
            </Show>
          </form>
        }
      >
        <div
          class="ap-gate__content"
          ref={contentRef}
          innerHTML={props.childrenHtml ?? ''}
        />
      </Show>
    </div>
  );
}
