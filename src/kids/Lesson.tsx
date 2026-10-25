import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Award } from 'lucide-react';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { kidsDb } from './db';
import { LESSONS, PASS_SCORE, unlocked } from './lessons/content';
import { LessonPicture } from './lessons/pictures';
import type { Kids } from './types';
import { BigButton, Celebrate, Panel } from './ui';

/** One lesson: screens with one picture and two sentences, then a three-question quiz (KD-9). */
export function Lesson({ kids }: { kids: Kids }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const lesson = LESSONS.find((l) => l.id === Number(id));
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);
  const done = new Set(kids.progress.map((p) => p.lessonId));
  if (!lesson || !unlocked(lesson.id, done)) return <Navigate to="/kids/learn" replace />;

  const screens = lesson.screens();
  const quiz = lesson.quiz();
  const total = screens.length + quiz.length;
  const score = answers.filter((a, i) => a === quiz[i].answer).length;

  if (finished) {
    const passed = score >= PASS_SCORE;
    return (
      <Panel title={lesson.title()}>
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-2xl font-bold" data-testid="quiz-score">
            {t('{score} of {total} right', { score, total: quiz.length })}
          </p>
          {passed ? (
            <>
              <Award className="size-20 text-[#ca8a04]" aria-hidden />
              <Celebrate text={t('You earned the badge “{title}”!', { title: lesson.title() })} />
            </>
          ) : (
            <p>{t('Nearly! Try the lesson again to earn the badge.')}</p>
          )}
          <div className="flex flex-wrap justify-center gap-3">
            {!passed && (
              <BigButton
                onClick={() => {
                  setStep(0);
                  setAnswers([]);
                  setFinished(false);
                }}
              >
                {t('Try again')}
              </BigButton>
            )}
            <BigButton tone="plain" onClick={() => navigate('/kids/learn')}>
              {t('Back to lessons')}
            </BigButton>
          </div>
        </div>
      </Panel>
    );
  }

  const inQuiz = step >= screens.length;
  const question = inQuiz ? quiz[step - screens.length] : undefined;
  const qIndex = step - screens.length;
  const picked = question ? answers[qIndex] : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{lesson.title()}</h1>
        <span
          className="text-base text-muted-foreground"
          aria-label={t('Step {n} of {total}', { n: step + 1, total })}
        >
          {step + 1} / {total}
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className="h-full rounded-full bg-primary" style={{ width: `${((step + 1) / total) * 100}%` }} />
      </div>
      {!inQuiz ? (
        <Panel>
          <div className="flex min-h-72 flex-col items-center justify-center gap-5 text-center">
            <LessonPicture picture={screens[step].picture} />
            {screens[step].lines.map((line) => (
              <p key={line} className="text-xl font-semibold">
                {line}
              </p>
            ))}
          </div>
        </Panel>
      ) : (
        <Panel title={t('Quiz')}>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-3 text-xl font-bold">{question!.q}</legend>
            {question!.options.map((o, i) => {
              const chosen = picked === i;
              const show = picked !== undefined;
              const right = i === question!.answer;
              return (
                <button
                  key={o}
                  type="button"
                  disabled={show}
                  aria-pressed={chosen}
                  className={cn(
                    'min-h-14 rounded-2xl border-2 bg-surface px-4 text-left text-lg font-semibold focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none',
                    show && right && 'border-good bg-[#dcfce7] text-[#14532d]',
                    show && chosen && !right && 'border-[#f59e0b] bg-[#fef3c7] text-[#713f12]',
                  )}
                  onClick={() => setAnswers((a) => Object.assign([...a], { [qIndex]: i }))}
                >
                  {o}
                  {show && right && <span className="ml-2">✓</span>}
                </button>
              );
            })}
            {picked !== undefined && (
              <p className="text-lg font-semibold" role="status">
                {picked === question!.answer
                  ? t('Yes, that is right!')
                  : t('Good try! The right answer is marked.')}
              </p>
            )}
          </fieldset>
        </Panel>
      )}
      <div className="flex justify-between gap-3">
        <BigButton tone="plain" disabled={step === 0 || inQuiz} onClick={() => setStep((s) => s - 1)}>
          <ArrowLeft aria-hidden /> {t('Back')}
        </BigButton>
        <BigButton
          disabled={inQuiz && picked === undefined}
          onClick={async () => {
            if (step + 1 < total) {
              setStep((s) => s + 1);
              return;
            }
            if (score >= PASS_SCORE)
              await kidsDb.progress.put({
                profileId: kids.profile!.id,
                lessonId: lesson.id,
                score,
                badgeAt: new Date().toISOString(),
              });
            setFinished(true);
          }}
        >
          {step + 1 < total ? t('Next') : t('Finish')} <ArrowRight aria-hidden />
        </BigButton>
      </div>
    </div>
  );
}
