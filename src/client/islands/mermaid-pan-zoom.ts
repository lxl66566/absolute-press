import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, type ZoomTransform } from 'd3-zoom';

export interface PanZoomHandle {
  /** Reset the transform to identity (fit). */
  reset(): void;
  destroy(): void;
}

/** Wheel / pinch zoom bounds. */
const SCALE_MIN = 0.5;
const SCALE_MAX = 4;

/**
 * Pan & zoom for a mermaid chart: `inner` is transformed inside `canvas`
 * (overflow hidden). Interactions are chosen so the page keeps scrolling:
 * wheel zooms only while Ctrl/Cmd is held (trackpad pinch reports ctrl too),
 * single-finger touch scrolls the page while two fingers pinch, mouse drag
 * always pans. Double-click or `reset()` returns to the fit view.
 */
export function mountPanZoom(
  canvas: HTMLDivElement,
  inner: HTMLElement,
): PanZoomHandle {
  const apply = (t: ZoomTransform): void => {
    inner.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.k})`;
  };
  const behavior = d3zoom<HTMLDivElement, unknown>()
    .scaleExtent([SCALE_MIN, SCALE_MAX])
    .filter((event: Event) => {
      if (event.type === 'wheel') {
        // Trackpad pinch reports ctrl+wheel; plain wheel must keep scrolling.
        const { ctrlKey, metaKey } = event as WheelEvent;
        return ctrlKey || metaKey;
      }
      // One-finger touch belongs to page scrolling (touch-action: pan-y).
      if (event.type === 'touchstart') {
        return (event as TouchEvent).touches.length >= 2;
      }
      return true;
    })
    .on('zoom', event => {
      apply(event.transform);
    });
  const selection = select(canvas);
  selection.call(behavior).on('dblclick.zoom', null);
  const reset = (): void => {
    selection.call(behavior.transform, zoomIdentity);
  };
  selection.on('dblclick.ap-mermaid', event => {
    event.preventDefault();
    reset();
  });
  return {
    reset,
    destroy(): void {
      selection.on('.zoom', null).on('dblclick.ap-mermaid', null);
      inner.style.transform = '';
    },
  };
}
