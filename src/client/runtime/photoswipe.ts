import type PhotoSwipeLightbox from 'photoswipe/lightbox';

export interface ZoomableImage {
  src: string;
  width: number;
  height: number;
  /** Small placeholder shown while the full image loads. */
  msrc?: string;
  alt?: string;
}

let lightboxPromise: Promise<PhotoSwipeLightbox> | null = null;

/** Shared lightbox instance; photoswipe (js + css) loads on first zoom. */
function getLightbox(): Promise<PhotoSwipeLightbox> {
  lightboxPromise ??= (async () => {
    const [{ default: PhotoSwipeLightboxClass }] = await Promise.all([
      import('photoswipe/lightbox'),
      import('photoswipe/style.css'),
    ]);
    const lightbox = new PhotoSwipeLightboxClass({
      pswpModule: () => import('photoswipe'),
      // Darker than the 0.8 default (L6): the old PhotoSwipe theme sat
      // noticeably darker, and page content bleeding through weakened the
      // focus. PhotoSwipe hides arrows and the counter itself on
      // single-slide galleries, so a lone image stays unadorned.
      bgOpacity: 0.92,
    });
    lightbox.init();
    return lightbox;
  })();
  return lightboxPromise;
}

/**
 * Page-gallery assembly (L6), the one funnel for both zoom entry paths
 * (delegated prose click + island): open the whole content gallery at
 * `locate`'s position when it holds more than one image — PhotoSwipe then
 * shows arrows and the "1 / 3" counter on its own; a lone image (or no
 * match, `locate` -> -1) stays a plain single-slide view.
 */
async function openInPageGallery(
  locate: (group: HTMLImageElement[]) => number,
  single: ZoomableImage,
): Promise<void> {
  const content = document.getElementById('ap-content');
  const group = content ? galleryImages(content) : [];
  const index = locate(group);
  if (group.length > 1 && index >= 0) {
    await openImages(group.map(imageData), index);
  } else {
    await openImages([single], 0);
  }
}

/** Open a single image in the shared lightbox. */
export async function openImage(image: ZoomableImage): Promise<void> {
  // Page gallery (L6): islands pass slide data, not the DOM element, so
  // match the passed image against the page's zoomable set by src.
  await openInPageGallery(
    group => group.findIndex(img => (img.currentSrc || img.src) === image.src),
    image,
  );
}

/** Open a gallery at `index`; PhotoSwipe adds paging and "1 / 3" counting. */
export async function openImages(
  images: ZoomableImage[],
  index: number,
): Promise<void> {
  if (images.length === 0) return;
  const lightbox = await getLightbox();
  lightbox.loadAndOpen(
    Math.max(0, Math.min(index, images.length - 1)),
    images.map(image => ({
      src: image.src,
      width: image.width,
      height: image.height,
      msrc: image.msrc ?? image.src,
      ...(image.alt ? { alt: image.alt } : {}),
    })),
  );
}

/** Slide data from an <img>; falls back when natural size is unavailable. */
export function imageData(img: HTMLImageElement): ZoomableImage {
  return {
    src: img.currentSrc || img.src,
    width: img.naturalWidth || 1200,
    height: img.naturalHeight || 800,
    msrc: img.src,
    ...(img.alt ? { alt: img.alt } : {}),
  };
}

/**
 * The page's zoomable image set: every content image not wrapped in a
 * link/button (linked images keep their native behavior). Island images
 * (ZoomedImg masks etc.) are members for gallery paging even though the
 * delegated click handler skips them — the old lightbox counted the whole
 * page's images, and a mixed page should page through all of them.
 */
function galleryImages(content: HTMLElement): HTMLImageElement[] {
  return [...content.querySelectorAll('img')].filter(
    img =>
      content.contains(img) &&
      // Skip helper images without a real source (sizes placeholders etc.).
      (img.currentSrc || img.src) !== '',
  );
}

/**
 * Delegated click-to-zoom for prose images inside #ap-content. Runs at
 * click time so late-mounted content (e.g. unlocked PasswordGate prose) is
 * covered; islands render their own zoom behavior and are skipped. Two
 * deliberate exemptions: PasswordGate (locked prose must not zoom — the
 * lightbox would expose the encrypted content's images) and ExpandableList
 * (its entries are plain re-rendered prose; skipping them would take the
 * zoom away after hydration — the static table zooms fine). The list's row
 * toggle ignores clicks on images, so zoom and expand never fire together.
 * A clicked image opens as part of the page gallery (L6): with more than
 * one slide PhotoSwipe shows the left/right arrows and the "1 / 3" counter
 * on its own; a lone image keeps the plain view.
 */
export function initLightbox(): void {
  const content = document.getElementById('ap-content');
  if (!content) return;
  content.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const img = target.closest('img');
    if (!img || !content.contains(img)) return;
    // Linked/buttoned images keep their native behavior.
    if (img.closest('a, button')) return;
    // Skip islands that own their click behavior (ZoomedImg masks etc.);
    // closest() picks the innermost island, so a nested ZoomedImg inside an
    // exempted ExpandableList still owns its images.
    const island = img.closest<HTMLElement>('[data-ap-island]');
    if (
      island !== null &&
      island.dataset.apIsland !== 'PasswordGate' &&
      island.dataset.apIsland !== 'ExpandableList'
    ) {
      return;
    }
    event.preventDefault();
    void openInPageGallery(group => group.indexOf(img), imageData(img));
  });
}
