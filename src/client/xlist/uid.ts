/**
 * Shared uid sequence for the two ap-xlist renderers (the ExpandableList
 * island and XList): both stamp reveal ids `ap-xlist-<n>-<row>` into the same
 * page, so one counter must serve both or the ids collide whenever a page
 * mixes the two list kinds.
 */

let seq = 0;

export function nextXListUid(): string {
  return `ap-xlist-${++seq}`;
}
