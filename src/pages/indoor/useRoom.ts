import { useMemo, useState } from 'react';
import type { Household } from '@/lib/profile/schema';
import { roomFromHome, type Room } from './room';

/** The current room and the ways to change it. */
export interface RoomControls {
  room: Room;
  /** Changes some settings, keeping the rest. */
  update: (patch: Partial<Room>) => void;
  /** Replaces the whole room, e.g. with a quick win. */
  replace: (room: Room) => void;
  /** Goes back to the household's own home and the live outdoor reading. */
  reset: () => void;
}

/**
 * The lab's room. It follows the household profile and live outdoor air until the user edits
 * it, then keeps the edits until reset.
 */
export function useRoom(home: Household['home'], liveOutdoor: number): RoomControls {
  const initial = useMemo(() => roomFromHome(home, liveOutdoor), [home, liveOutdoor]);
  const [edited, setEdited] = useState<Room | null>(null);
  const room = edited ?? initial;
  return {
    room,
    update: (patch) => setEdited({ ...room, ...patch }),
    replace: setEdited,
    reset: () => setEdited(null),
  };
}
