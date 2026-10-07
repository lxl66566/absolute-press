/**
 * markdown-it-container ships no type declarations (minimal local shim).
 * Only the options this project uses are declared.
 */
declare module 'markdown-it-container' {
  import type { MarkdownIt, RendererRule } from 'markdown-it';

  interface ContainerPluginOptions {
    marker?: string;
    validate?: (params: string, markup: string) => boolean;
    render?: RendererRule;
  }

  export default function container(
    md: MarkdownIt,
    name: string,
    options?: ContainerPluginOptions,
  ): void;
}
