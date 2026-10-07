/**
 * Pure run/stop decision for the d3 force simulation, shared by the two
 * event sources that feed it (visibilitychange for background tabs,
 * IntersectionObserver for the article-tail canvas being scrolled out of
 * view): the perpetual Brownian motion only burns frames while the chart
 * can actually be seen. Kept free of the d3 import graph so it stays
 * unit-testable in a bare node environment.
 */

/** Whether the simulation timer should be running. */
export type SimPower = 'run' | 'stop';

/** Run only when the canvas is in the viewport AND the tab is visible. */
export function simPower(inView: boolean, pageVisible: boolean): SimPower {
  return inView && pageVisible ? 'run' : 'stop';
}
