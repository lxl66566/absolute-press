import { describe, expect, it } from 'vitest';

import { foucScript } from '../prefs.ts';

describe('foucScript', () => {
  // Byte-locked against the pre-refactor literal: the script is inlined
  // into every page's <head> before any stylesheet, so any output change
  // must be a deliberate delivery-contract change, never accidental drift.
  it('emits the exact bootstrap script', () => {
    expect(foucScript()).toBe(
      '!function(){try{var t=localStorage.getItem("ap-theme");' +
        'if(t!=="dark"&&t!=="light"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}' +
        'document.documentElement.dataset.theme=t;' +
        'var w=parseInt(localStorage.getItem("ap-sidebar-w"),10);' +
        'if(w){w=Math.min(Math.max(w,208),Math.min(576,innerWidth*.5));' +
        'document.documentElement.style.setProperty("--ap-sidebar-w",w+"px")}}catch(e){}}()',
    );
  });
});
