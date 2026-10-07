import type { Element as SolidElement, ParentProps } from 'solid-js';

/** Inline stroke icons (lucide-style, 24x24). Sized via `class` (e.g. size-5). */
function Svg(
  props: ParentProps<{ class?: string; label?: string }>,
): SolidElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden={props.label === undefined ? 'true' : undefined}
      role={props.label === undefined ? undefined : 'img'}
      aria-label={props.label}
      class={props.class ?? 'size-5'}
    >
      {props.children}
    </svg>
  );
}

export function MenuIcon(props: { class?: string }): SolidElement {
  return (
    <Svg class={props.class}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Svg>
  );
}

export function CloseIcon(props: { class?: string }): SolidElement {
  return (
    <Svg class={props.class}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Svg>
  );
}

export function SunIcon(props: { class?: string }): SolidElement {
  return (
    <Svg class={props.class}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </Svg>
  );
}

export function MoonIcon(props: { class?: string }): SolidElement {
  return (
    <Svg class={props.class}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </Svg>
  );
}

export function ChevronDownIcon(props: { class?: string }): SolidElement {
  return (
    <Svg class={props.class}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

export function GlobeIcon(props: { class?: string }): SolidElement {
  return (
    <Svg class={props.class}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </Svg>
  );
}

export function ArrowUpIcon(props: { class?: string }): SolidElement {
  return (
    <Svg class={props.class}>
      <path d="M12 19V5m-7 7 7-7 7 7" />
    </Svg>
  );
}

export function ClockIcon(props: { class?: string }): SolidElement {
  return (
    <Svg class={props.class}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </Svg>
  );
}

export function FolderIcon(props: { class?: string }): SolidElement {
  return (
    <Svg class={props.class}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </Svg>
  );
}

export function TagIcon(props: { class?: string }): SolidElement {
  return (
    <Svg class={props.class}>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r="0.5" fill="currentColor" />
    </Svg>
  );
}

export function ListIcon(props: { class?: string }): SolidElement {
  return (
    <Svg class={props.class}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </Svg>
  );
}

export function RssIcon(props: { class?: string }): SolidElement {
  return (
    <Svg class={props.class}>
      <path d="M4 11a9 9 0 0 1 9 9" />
      <path d="M4 4a16 16 0 0 1 16 16" />
      <circle cx="5" cy="19" r="1" />
    </Svg>
  );
}
