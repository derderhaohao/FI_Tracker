import { Navigate, Route, Routes } from 'react-router-dom';
import { addTranslations, useLang } from '@/i18n';
import { KidsLayout } from './KidsLayout';
import { Garden } from './Garden';
import { JarsAndGoals } from './JarsAndGoals';
import { Grow } from './Grow';
import { Learn } from './Learn';
import { Lesson } from './Lesson';
import { ParentCorner } from './ParentCorner';
import { Profiles } from './Profiles';
import { useKids } from './useKids';
import { KIDS_ZH_TW } from './zh-TW';

// Beginner mode's Chinese text arrives with this lazy chunk.
addTranslations(KIDS_ZH_TW);

/**
 * Beginner mode (PRD Part D): its own routes under #/kids, its own layout and database. It never
 * reads or writes the FI plan (KD-2); the ESLint boundary enforces that.
 */
export function KidsApp() {
  useLang();
  const kids = useKids();
  if (kids.loading) return null;
  // No child yet: the first step is a profile (KD-3).
  if (!kids.profile)
    return (
      <Routes>
        <Route path="parent" element={<ParentCorner kids={kids} />} />
        <Route path="*" element={<Profiles kids={kids} first />} />
      </Routes>
    );
  return (
    <Routes>
      <Route element={<KidsLayout kids={kids} />}>
        <Route index element={<Garden kids={kids} />} />
        <Route path="jars" element={<JarsAndGoals kids={kids} />} />
        <Route path="grow" element={<Grow kids={kids} />} />
        <Route path="learn" element={<Learn kids={kids} />} />
        <Route path="learn/:id" element={<Lesson kids={kids} />} />
        <Route path="profiles" element={<Profiles kids={kids} />} />
        <Route path="parent" element={<ParentCorner kids={kids} />} />
        <Route path="*" element={<Navigate to="/kids" replace />} />
      </Route>
    </Routes>
  );
}
