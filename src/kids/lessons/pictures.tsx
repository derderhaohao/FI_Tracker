import {
  ShoppingBasket,
  Briefcase,
  CalendarDays,
  CloudLightning,
  Droplets,
  Gift,
  Landmark,
  Mail,
  Snowflake,
  Sprout,
  Store,
  Sun,
  Tag,
  Target,
  TreeDeciduous,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import { JarArt } from '../art/Art';
import type { Picture } from './content';

const ICONS: Partial<Record<Picture, LucideIcon>> = {
  work: Briefcase,
  gift: Gift,
  redEnvelope: Mail,
  need: Droplets,
  want: Wind,
  goal: Target,
  calendar: CalendarDays,
  bank: Landmark,
  shop: Store,
  snowball: Snowflake,
  seed: Sprout,
  tree: TreeDeciduous,
  storm: CloudLightning,
  sun: Sun,
  price: Tag,
  basket: ShoppingBasket,
  freedom: Sun,
};

/** The one picture on a lesson screen. */
export function LessonPicture({ picture }: { picture: Picture }) {
  if (picture === 'jars')
    return (
      <div className="flex justify-center gap-2" aria-hidden>
        <JarArt jar="spend" level={0.6} size={84} />
        <JarArt jar="save" level={0.4} size={84} />
        <JarArt jar="grow" level={0.3} size={84} />
      </div>
    );
  const Icon = ICONS[picture] ?? Sprout;
  return (
    <span
      className="mx-auto flex size-36 items-center justify-center rounded-full bg-[#dcfce7] text-[#166534] dark:bg-[#14532d] dark:text-[#dcfce7]"
      aria-hidden
    >
      <Icon className="size-20" />
    </span>
  );
}
