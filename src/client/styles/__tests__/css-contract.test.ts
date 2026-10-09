import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { LAYER_ORDER } from '../../../node/build/shell.ts';

/**
 * Compile-time gate for the framework's cascade contract (design notes:
 * .agents/skills/css-cascade/SKILL.md). The contract keeps the "system css
 * ate my component" class of bug unrepresentable:
 * - every framework rule lives in one of the @layer blocks, so unlayered
 *   site CSS always wins without specificity work;
 * - no id selectors: the strongest possible framework selector is a class,
 *   so no future rule can restart a specificity arms race;
 * - prose rules are scoped :where(.ap-main): markdown defaults sit at zero
 *   specificity in the lowest framework layer;
 * - !important is banned except where inline styles must lose (shiki) or as
 *   the global reduced-motion override.
 */

const clientRoot = path.resolve(
  fileURLToPath(new URL('../..', import.meta.url)),
);
const shellTs = fs.readFileSync(
  path.join(clientRoot, '../node/build/shell.ts'),
  'utf8',
);

/** Framework layer names css may use, in cascade order. */
const FRAMEWORK_LAYERS = ['ap-base', 'ap-prose', 'ap-chrome'] as const;

interface Rule {
  /** Path under src/client, forward slashes. */
  file: string;
  /** Selector prelude, comments stripped, whitespace collapsed. */
  selector: string;
  /** Innermost enclosing @layer name; null outside any layer block. */
  layer: string | null;
  /** Declaration text of the rule block. */
  body: string;
}

/** Strip block comments — they may contain unbalanced braces. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

type BlockKind = 'layer' | 'group' | 'rule';

/**
 * Walk the stylesheet with a block stack. `{` classifies the prelude:
 * `@layer n` opens a named layer block, other at-rules (media / keyframes /
 * supports / property) open a group block, anything else is a style rule
 * whose declarations are collected verbatim. `}` pops. A rule's layer is
 * the nearest layer ancestor, so nesting through @media keeps the context.
 */
function collectRules(file: string, css: string): Rule[] {
  const src = stripComments(css);
  const rules: Rule[] = [];
  const kinds: BlockKind[] = [];
  const layerNames: string[] = [];
  let prelude = '';
  const push = (kind: BlockKind, name?: string): void => {
    kinds.push(kind);
    if (kind === 'layer') layerNames.push(name ?? '');
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (ch === '{') {
      const head = prelude.trim();
      if (head.startsWith('@layer')) {
        push('layer', head.slice('@layer'.length).trim());
      } else if (head.startsWith('@')) {
        push('group');
      } else {
        push('rule');
        let depth = 1;
        let j = i + 1;
        for (; j < src.length && depth > 0; j++) {
          if (src[j] === '{') depth++;
          else if (src[j] === '}') depth--;
        }
        rules.push({
          file,
          selector: head.replace(/\s+/g, ' '),
          layer: layerNames.at(-1) ?? null,
          body: src.slice(i + 1, j - 1),
        });
      }
      prelude = '';
    } else if (ch === '}') {
      if (kinds.pop() === 'layer') layerNames.pop();
      prelude = '';
    } else if (ch === ';') {
      // Top-level statements (@import / @charset) never open a block.
      prelude = '';
    } else {
      prelude += ch;
    }
  }
  return rules;
}

function listCssFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.css')) out.push(full);
    }
  };
  walk(clientRoot);
  return out;
}

const rules = listCssFiles().flatMap(file => {
  const rel = path.relative(clientRoot, file).replaceAll('\\', '/');
  return collectRules(rel, fs.readFileSync(file, 'utf8'));
});

describe('css cascade contract', () => {
  it('every framework rule lives in a framework layer', () => {
    const bad = rules
      .filter(
        r =>
          r.layer === null ||
          !FRAMEWORK_LAYERS.includes(
            r.layer as (typeof FRAMEWORK_LAYERS)[number],
          ),
      )
      .map(r => `${r.file}: ${r.selector} (layer ${r.layer})`);
    expect(bad).toEqual([]);
  });

  it('no id selectors (ids are the JS mount contract, css uses classes)', () => {
    const bad = rules
      .filter(r => /(?:^|[\s,>+~(])#[a-zA-Z_][\w-]*/.test(r.selector))
      .map(r => `${r.file}: ${r.selector}`);
    expect(bad).toEqual([]);
  });

  it('prose rules are scoped to the content column', () => {
    const bad = rules
      .filter(r => r.layer === 'ap-prose' && !r.selector.includes('.ap-main'))
      .map(r => `${r.file}: ${r.selector}`);
    expect(bad).toEqual([]);
  });

  it('!important only where inline styles must lose', () => {
    const bad = rules
      .filter(r => /!\s*important/.test(r.body))
      .filter(
        r =>
          !(
            r.file === 'styles/theme.css' &&
            r.selector.includes('.ap-code pre.shiki')
          ) && !(r.file === 'styles/theme.css' && r.body.includes('0.01ms')),
      )
      .map(r => `${r.file}: ${r.selector}`);
    expect(bad).toEqual([]);
  });

  it('the shell layer order lists every consumer layer', () => {
    expect(shellTs).toContain(`'${LAYER_ORDER}'`);
    const declared = LAYER_ORDER.split(', ');
    for (const name of [
      ...FRAMEWORK_LAYERS,
      'properties',
      'theme',
      'base',
      'preflights',
      'shortcuts',
      'default',
    ]) {
      expect(declared).toContain(name);
    }
  });
});
