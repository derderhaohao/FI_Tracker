import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Compass, ListChecks } from 'lucide-react';
import { importBackup } from '@/io/backup';
import { buildDemoBackup } from '@/io/demo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/** First screen for a browser with no data: guided setup or the demo. */
export function Welcome() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  return (
    <div className="mx-auto max-w-4xl py-6">
      <h1 className="text-3xl font-semibold tracking-tight">Welcome to FI Tracker</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        When can you stop depending on a paycheck, and which strategy gets you there most reliably? FI Tracker
        turns your balances and monthly cash flow into a projected financial-independence date, then lets you
        test strategies against it.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="flex flex-col">
          <CardContent className="flex flex-1 flex-col gap-3 p-6">
            <ListChecks className="size-8 text-primary" aria-hidden />
            <h2 className="text-lg font-semibold">Set up my data</h2>
            <p className="text-sm text-muted-foreground">
              Six short steps, about 10 minutes: your birth year, today's account balances, monthly pay and
              spending, and what you'd spend once you stop working. You get your projected FI date at the end,
              and can refine everything later.
            </p>
            <p className="text-sm text-muted-foreground">
              Have to hand: rough balances of your bank, broker and 勞退 accounts.
            </p>
            <div className="mt-auto pt-2">
              <Button onClick={() => navigate('/setup')}>Start setup</Button>
            </div>
          </CardContent>
        </Card>
        <Card className="flex flex-col">
          <CardContent className="flex flex-1 flex-col gap-3 p-6">
            <Compass className="size-8 text-primary" aria-hidden />
            <h2 className="text-lg font-semibold">Look around with demo data</h2>
            <p className="text-sm text-muted-foreground">
              Explore every screen with a made-up person's 21 months of balances, cash flow and scenarios.
              Nothing you do affects real data.
            </p>
            <p className="text-sm text-muted-foreground">
              When you are ready for your own numbers, Settings → <strong>Delete all data</strong> brings you
              back here.
            </p>
            <div className="mt-auto pt-2">
              <Button
                variant="outline"
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  await importBackup(buildDemoBackup());
                }}
              >
                {loading ? 'Loading…' : 'Load demo data'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        Everything stays in this browser; nothing is sent anywhere. Moving from another device?{' '}
        <Link to="/settings#backup" className="text-primary hover:underline">
          Restore a backup
        </Link>
        .
      </p>
    </div>
  );
}
