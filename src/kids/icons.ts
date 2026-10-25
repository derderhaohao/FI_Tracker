import {
  Bike,
  BookOpen,
  Candy,
  Car,
  Gamepad2,
  Gift,
  Hammer,
  Heart,
  Home,
  Mail,
  Plane,
  Sparkles,
  ToyBrick,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import type { Category, GoalPicture, Source } from './db';

export const GOAL_ICONS: Record<GoalPicture, LucideIcon> = {
  bike: Bike,
  game: Gamepad2,
  book: BookOpen,
  trip: Plane,
  gift: Gift,
};

export const SOURCE_ICONS: Record<Source, LucideIcon> = {
  allowance: Sparkles,
  chores: Hammer,
  redEnvelope: Mail,
  gift: Gift,
  other: Heart,
};

export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  snack: Candy,
  toy: ToyBrick,
  book: BookOpen,
  game: Gamepad2,
  giftForSomeone: Gift,
  other: Heart,
  goal: Sparkles,
};

export const COST_ICONS = {
  home: Home,
  food: Utensils,
  transport: Car,
  fun: Gamepad2,
  travel: Plane,
} as const;
