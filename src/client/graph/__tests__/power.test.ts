import { describe, expect, it } from 'vitest';

import { simPower } from '../power';

describe('simPower', () => {
  it('runs only when the canvas is in view and the tab is visible', () => {
    expect(simPower(true, true)).toBe('run');
    // Scrolled out of view: the usual state while the body is being read.
    expect(simPower(false, true)).toBe('stop');
    // Background tab.
    expect(simPower(true, false)).toBe('stop');
    expect(simPower(false, false)).toBe('stop');
  });
});
