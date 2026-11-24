/**
 * Roving tabindex for composite widgets (tab lists and radio groups): the group is one Tab stop,
 * the arrow keys move focus and select, and Home and End jump to the ends. This is the keyboard
 * model of the WAI-ARIA Authoring Practices for tabs with automatic activation and radio groups.
 */
import type { KeyboardEvent } from 'react';

/** Which arrow keys walk the group: tabs use Left and Right, radio groups also Up and Down. */
export type RovingAxis = 'horizontal' | 'both';

const PREVIOUS_KEYS: Record<RovingAxis, readonly string[]> = {
  horizontal: ['ArrowLeft'],
  both: ['ArrowLeft', 'ArrowUp'],
};
const NEXT_KEYS: Record<RovingAxis, readonly string[]> = {
  horizontal: ['ArrowRight'],
  both: ['ArrowRight', 'ArrowDown'],
};

/**
 * The index a key press moves to from `index`, wrapping at both ends, or undefined when the key
 * is not one of the group's navigation keys.
 */
export function rovingTarget(
  key: string,
  index: number,
  count: number,
  axis: RovingAxis,
): number | undefined {
  if (count <= 0) return undefined;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (NEXT_KEYS[axis].includes(key)) return (index + 1) % count;
  if (PREVIOUS_KEYS[axis].includes(key)) return (index - 1 + count) % count;
  return undefined;
}

/** A group of options in display order, with the selected value and how to change it. */
export interface RovingGroup<T extends string> {
  values: readonly T[];
  value: T;
  onChange: (value: T) => void;
  axis: RovingAxis;
}

/** Every option of the item's group, in document order: same role, same tablist or radiogroup. */
function groupItems(item: HTMLElement): HTMLElement[] {
  const role = item.getAttribute('role') ?? '';
  const group = item.closest('[role="tablist"], [role="radiogroup"]');
  return group ? [...group.querySelectorAll<HTMLElement>(`[role="${role}"]`)] : [];
}

/**
 * `tabIndex` and `onKeyDown` for the option at `index`. Only the selected option is in the Tab
 * order (the first one when nothing is selected); a navigation key selects its target and moves
 * focus there, so the selection follows focus.
 */
export function rovingItemProps<T extends string>(group: RovingGroup<T>, index: number) {
  const selected = group.values.indexOf(group.value);
  const tabStop = selected === -1 ? 0 : selected;
  return {
    tabIndex: index === tabStop ? 0 : -1,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = rovingTarget(event.key, index, group.values.length, group.axis);
      const next = target === undefined ? undefined : group.values[target];
      if (target === undefined || next === undefined) return;
      event.preventDefault();
      if (next !== group.value) group.onChange(next);
      groupItems(event.currentTarget)[target]?.focus();
    },
  };
}
