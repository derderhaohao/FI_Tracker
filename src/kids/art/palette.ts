import type { Jar } from '../math';

/** Avatar colours: eight animal faces. */
export const AVATARS = [
  { face: '#f6c177', ear: '#e0a458', name: 'cat' },
  { face: '#c8a27a', ear: '#8a6a4f', name: 'dog' },
  { face: '#b07d52', ear: '#7d5636', name: 'bear' },
  { face: '#f1f1f1', ear: '#f4b6c2', name: 'rabbit' },
  { face: '#9ccfd8', ear: '#5fa8b5', name: 'owl' },
  { face: '#f08a5d', ear: '#c75b2f', name: 'fox' },
  { face: '#ffffff', ear: '#333333', name: 'panda' },
  { face: '#9bd18b', ear: '#5fa64c', name: 'frog' },
] as const;

export const AVATAR_COUNT = AVATARS.length;

/** Jar colours, always shown with the jar's name. */
export const JAR_COLORS: Record<Jar, string> = { spend: '#f59e0b', save: '#3b82f6', grow: '#16a34a' };
