import { parseHTML } from 'linkedom';
import { describe, expect, it, vi } from 'vitest';

import { galleryImages, openImages } from '../photoswipe';

// The lightbox module is stubbed so the load can be made to fail: the
// constructor throws while `fail` is set, mirroring a broken chunk fetch.
const lightboxState = vi.hoisted(() => ({ fail: true }));
vi.mock('photoswipe/lightbox', () => ({
  default: class {
    constructor() {
      if (lightboxState.fail) throw new Error('photoswipe load failed');
    }
    init(): void {}
    loadAndOpen(): void {}
  },
}));

/**
 * galleryImages only queries the content element it is handed (no global
 * document), so a linkedom subtree stands in for #ap-content. The markup
 * mirrors the hydrated ZoomedImg DOM shape (figure > wrapper.is-masked > img).
 */
function images(src: string): string[] {
  const { document } = parseHTML(`<div id="ap-content">${src}</div>`);
  const content = document.getElementById('ap-content')!;
  return galleryImages(content).map(img => img.getAttribute('src') ?? '');
}

describe('galleryImages', () => {
  it('collects plain content images', () => {
    expect(images('<img src="/a.png"><img src="/b.png">')).toEqual([
      '/a.png',
      '/b.png',
    ]);
  });

  it('skips still-masked ZoomedImg images, keeps revealed ones', () => {
    expect(
      images(
        '<img src="/a.png">' +
          '<figure class="ap-zoomed"><div class="ap-zoomed__wrapper is-masked">' +
          '<img src="/masked.png"></div></figure>' +
          '<figure class="ap-zoomed"><div class="ap-zoomed__wrapper">' +
          '<img src="/revealed.png"></div></figure>',
      ),
    ).toEqual(['/a.png', '/revealed.png']);
  });

  it('skips sourceless helper images', () => {
    expect(images('<img><img src="/a.png">')).toEqual(['/a.png']);
  });
});

describe('lightbox load retry', () => {
  it('retries after a failed load instead of caching the rejection', async () => {
    const image = { src: '/a.png', width: 1, height: 1 };
    await expect(openImages([image], 0)).rejects.toThrow(
      'photoswipe load failed',
    );
    // The failed load was dropped from the cache: the next zoom loads again
    // (and succeeds now), it does not re-await the stored rejection.
    lightboxState.fail = false;
    await expect(openImages([image], 0)).resolves.toBeUndefined();
  });
});
