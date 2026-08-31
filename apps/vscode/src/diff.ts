export interface MinimalEdit {
  /** Offset where the replacement begins. */
  start: number;
  /** Offset in the original text where the replacement ends. */
  end: number;
  replacement: string;
}

/**
 * Narrow a whole-document rewrite to the span that actually changed.
 *
 * The edit layer returns complete text, but handing the editor a full-range
 * replace would move every cursor and mark the whole file changed. Trimming the
 * common prefix and suffix keeps a drag to one tight undo step.
 */
// @lat: [[extension#Causal Canvas extension#Surgical Edits]]
export function minimalEdit(current: string, next: string): MinimalEdit | undefined {
  if (current === next) return undefined;

  const limit = Math.min(current.length, next.length);
  let start = 0;
  while (start < limit && current.charCodeAt(start) === next.charCodeAt(start)) start++;

  let fromEnd = 0;
  while (
    fromEnd < limit - start &&
    current.charCodeAt(current.length - 1 - fromEnd) === next.charCodeAt(next.length - 1 - fromEnd)
  ) {
    fromEnd++;
  }

  return {
    start,
    end: current.length - fromEnd,
    replacement: next.slice(start, next.length - fromEnd),
  };
}
