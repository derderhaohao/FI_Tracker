import type { GoalPicture } from './db';
import { GOAL_ICONS } from './icons';

/** A goal's picture in a soft circle. */
export function GoalIcon({ picture }: { picture: GoalPicture }) {
  const Icon = GOAL_ICONS[picture];
  return (
    <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-[#dbeafe] text-[#1d4ed8]">
      <Icon className="size-9" aria-hidden />
    </span>
  );
}
