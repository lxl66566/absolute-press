import { describe, expect, it } from 'vitest';

import type { PageChrome } from '../../../shared/types.ts';
import { chromeAsset } from '../chrome-asset.ts';

describe('chromeAsset', () => {
  it('serializes the chrome as a default-exporting ES module', () => {
    const { source } = chromeAsset({
      navbar: [{ kind: 'leaf', text: 'A', link: '/a' }],
      sidebar: [{ kind: 'link', text: 'A', link: '/a' }],
    });
    expect(source).toMatch(/^export default \{"navbar":/);
    expect(
      JSON.parse(source.replace(/^export default /, '').replace(/;\n$/, '')),
    ).toEqual({
      navbar: [{ kind: 'leaf', text: 'A', link: '/a' }],
      sidebar: [{ kind: 'link', text: 'A', link: '/a' }],
    });
  });

  it('omits the icons key when the site registers none', () => {
    const { source } = chromeAsset({ navbar: [], sidebar: [] });
    expect(source).not.toContain('"icons"');
  });

  it('names the file after the content hash and stays stable', () => {
    const data: PageChrome = {
      icons: { 'solid/x': '<svg/>' },
      navbar: [{ kind: 'leaf', text: 'A', link: '/a' }],
      sidebar: [],
    };
    const first = chromeAsset(data);
    expect(first.fileName).toMatch(/^assets\/chrome-[0-9a-f]{8}\.js$/);
    expect(chromeAsset(data).fileName).toBe(first.fileName);
    expect(chromeAsset({ ...data, navbar: [] }).fileName).not.toBe(
      first.fileName,
    );
  });
});
