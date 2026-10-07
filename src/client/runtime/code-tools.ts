/**
 * Code block tools runtime (M7): the language label and copy button are
 * emitted at build time (renderer.ts); this module adds the click behavior —
 * clipboard write with a transient "copied" state on the button. One
 * delegated listener covers every block, including islands hydrated later.
 *
 * The copied state is a color/icon swap only (icons never animate).
 */

const COPIED_CLASS = 'is-copied';
const COPIED_RESET_MS = 1600;

/** Per-button reset timer so a re-click restarts (not cancels-then-clears). */
const resetTimers = new WeakMap<HTMLButtonElement, number>();

export function initCodeTools(): void {
  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('.ap-code__copy');
    if (!button) return;
    const pre = button.closest('.ap-code')?.querySelector('pre');
    if (!pre) return;
    void writeClipboard(codeTextOf(pre)).then(ok => {
      if (!ok) return false;
      const previous = resetTimers.get(button);
      if (previous !== undefined) window.clearTimeout(previous);
      button.classList.add(COPIED_CLASS);
      resetTimers.set(
        button,
        window.setTimeout(() => {
          button.classList.remove(COPIED_CLASS);
          resetTimers.delete(button);
        }, COPIED_RESET_MS),
      );
      return true;
    });
  });
}

/**
 * Code text of a shiki pre. `.line` spans joined with newlines: the flex
 * column layout makes `innerText` drop the inter-line separators, so text
 * content is read per line instead (gutter numbers are pseudo-elements and
 * never appear in it).
 */
function codeTextOf(pre: Element): string {
  const lines = pre.querySelectorAll('.line');
  if (lines.length === 0) return pre.textContent ?? '';
  const parts: string[] = [];
  lines.forEach(line => parts.push(line.textContent ?? ''));
  return parts.join('\n');
}

/** Clipboard API with a hidden-textarea fallback; true on success. */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return legacyCopy(text);
  }
}

/** execCommand fallback for contexts where the async clipboard is blocked. */
function legacyCopy(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
