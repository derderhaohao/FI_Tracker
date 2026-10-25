import { useLiveQuery } from 'dexie-react-hooks';
import {
  balances,
  defaultGrowth,
  getSetting,
  kidsDb,
  type Entry,
  type Goal,
  type Growth,
  type Profile,
  type Progress,
} from './db';

const EMPTY: never[] = [];

/** The active child and their jars, goals and lessons, live from the kids database. */
export function useKids() {
  const profiles = useLiveQuery(() => kidsDb.profiles.orderBy('createdAt').toArray(), []);
  const activeId = useLiveQuery(() => getSetting<string | undefined>('activeProfile', undefined), []);
  const growth = useLiveQuery(() => getSetting<Growth>('growth', defaultGrowth()), []);
  const allowance = useLiveQuery(() => getSetting<number>('allowance', 0), []);
  const profile: Profile | undefined = profiles?.find((p) => p.id === activeId) ?? profiles?.[0];
  const pid = profile?.id ?? '';
  const entries = useLiveQuery(
    () => (pid ? kidsDb.entries.where('profileId').equals(pid).sortBy('date') : EMPTY),
    [pid],
  ) as Entry[] | undefined;
  const goals = useLiveQuery(
    () => (pid ? kidsDb.goals.where('profileId').equals(pid).sortBy('createdAt') : EMPTY),
    [pid],
  ) as Goal[] | undefined;
  const progress = useLiveQuery(
    () => (pid ? kidsDb.progress.where('profileId').equals(pid).toArray() : EMPTY),
    [pid],
  ) as Progress[] | undefined;
  const loading = profiles === undefined || (activeId === undefined && profiles.length > 0 && !profile);
  return {
    loading: profiles === undefined || loading,
    profiles: profiles ?? EMPTY,
    profile,
    entries: entries ?? EMPTY,
    jars: balances(entries ?? EMPTY),
    goals: (goals ?? EMPTY).filter((g) => !g.reachedAt),
    progress: progress ?? EMPTY,
    growth: growth ?? defaultGrowth(),
    /** Weekly allowance the parent set (KD-11), 0 when not set. */
    allowance: allowance ?? 0,
  };
}
