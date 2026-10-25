import { useNavigate } from 'react-router-dom';
import { Award, Minus, Plus } from 'lucide-react';
import { t } from '@/i18n';
import { JarArt, TreeArt } from './art/Art';
import { coins, goalName, jarName } from './copy';
import { LESSONS } from './lessons/content';
import { treeSize, weeksToGoal, type Jar } from './math';
import { weeklySavePace } from './db';
import type { Kids } from './types';
import { BigButton, Panel } from './ui';
import { GoalIcon } from './goalIcons';

const JARS: Jar[] = ['spend', 'save', 'grow'];

/** My Garden (KD-4): the three jars, a tree sized by the Grow jar, the top goal and badges. */
export function Garden({ kids }: { kids: Kids }) {
  const navigate = useNavigate();
  const { jars, goals, progress, profile } = kids;
  const top = goals[0];
  const most = Math.max(1, jars.spend, jars.save, jars.grow);
  const weeks = top ? weeksToGoal(top.price, jars.save, weeklySavePace(kids.entries)) : undefined;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('Hi, {name}!', { name: profile!.nickname })}</h1>
      <Panel>
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-around">
          <div className="flex flex-col items-center">
            <TreeArt size={treeSize(jars.grow)} px={150} />
            <p className="text-center text-base text-muted-foreground">
              {jars.grow > 0
                ? t('Your money tree is growing.')
                : t('Plant coins in the Grow jar to start a tree.')}
            </p>
          </div>
          <ul className="flex gap-3" aria-label={t('Your jars')}>
            {JARS.map((j) => (
              <li key={j} className="flex flex-col items-center">
                <JarArt jar={j} level={jars[j] / most} />
                <span className="font-semibold">{jarName(j)}</span>
                <span className="text-base tabular" data-testid={`jar-${j}`}>
                  {coins(jars[j])}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Panel>
      <div className="grid grid-cols-2 gap-3">
        <BigButton tone="good" onClick={() => navigate('/kids/jars?add=in')}>
          <Plus aria-hidden /> {t('I got money')}
        </BigButton>
        <BigButton tone="warm" onClick={() => navigate('/kids/jars?add=out')}>
          <Minus aria-hidden /> {t('I spent money')}
        </BigButton>
      </div>
      <Panel title={t('My top goal')}>
        {top ? (
          <div className="flex items-center gap-4">
            <GoalIcon picture={top.picture} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {goalName(top.picture)} · {coins(top.price)}
              </p>
              <div className="mt-1 h-5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <div
                  className="h-full rounded-full bg-[#3b82f6]"
                  style={{ width: `${Math.min(100, (jars.save / top.price) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-base text-muted-foreground">
                {jars.save >= top.price
                  ? t('You have enough!')
                  : weeks !== undefined
                    ? t('About {n} more weeks', { n: weeks })
                    : t('Put coins in Savings to get there.')}
              </p>
            </div>
          </div>
        ) : (
          <BigButton tone="plain" onClick={() => navigate('/kids/jars#goals')}>
            {t('Choose a goal')}
          </BigButton>
        )}
      </Panel>
      <Panel title={t('My badges')}>
        {progress.length === 0 ? (
          <p className="text-base text-muted-foreground">
            {t('Finish a lesson in Learn to earn your first badge.')}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-3">
            {progress
              .slice()
              .sort((a, b) => a.lessonId - b.lessonId)
              .map((p) => (
                <li key={p.lessonId} className="flex flex-col items-center text-sm font-semibold">
                  <Award className="size-10 text-[#ca8a04]" aria-hidden />
                  {LESSONS.find((l) => l.id === p.lessonId)?.title()}
                </li>
              ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
