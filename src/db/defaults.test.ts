import { FiDatabase } from './db';
import { DEFAULT_CATEGORIES, defaultSettings, ensureDefaults, requestPersistence } from './defaults';
import { accountDefaults } from '@/domain/accounts';

let n = 0;
const fresh = () => new FiDatabase(`defaults-test-${++n}`);

describe('first-run defaults', () => {
  it('creates settings, one assumption set and the starter categories once', async () => {
    const db = fresh();
    await ensureDefaults(db);
    const settings = await db.settings.get('singleton');
    expect(settings?.baseCurrency).toBe('TWD');
    expect(settings?.defaultSwr).toBe(0.04);
    expect(await db.assumptionSets.count()).toBe(1);
    expect(settings?.activeAssumptionSetId).toBe((await db.assumptionSets.toArray())[0].id);
    expect(await db.categories.count()).toBe(DEFAULT_CATEGORIES.length);

    await ensureDefaults(db);
    expect(await db.assumptionSets.count()).toBe(1);
    expect(await db.categories.count()).toBe(DEFAULT_CATEGORIES.length);
  });

  it('has a target allocation that sums to 100% and both income and expense categories', () => {
    const total = Object.values(defaultSettings('x').targetAllocation).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBeCloseTo(1, 12);
    expect(DEFAULT_CATEGORIES.some((c) => c.kind === 'income')).toBe(true);
    expect(DEFAULT_CATEGORIES.filter((c) => c.kind === 'expense' && c.essential).length).toBeGreaterThan(0);
  });

  it('asks for persistent storage only when the browser supports it', async () => {
    const original = navigator.storage;
    Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true });
    expect(await requestPersistence()).toBe(false);
    const persist = vi.fn(async () => true);
    Object.defineProperty(navigator, 'storage', {
      value: { persist, persisted: async () => false },
      configurable: true,
    });
    expect(await requestPersistence()).toBe(true);
    expect(persist).toHaveBeenCalled();
    Object.defineProperty(navigator, 'storage', {
      value: { persist, persisted: async () => true },
      configurable: true,
    });
    persist.mockClear();
    expect(await requestPersistence()).toBe(true);
    expect(persist).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'storage', {
      value: {
        persisted: () => Promise.reject(new Error('blocked')),
        persist,
      },
      configurable: true,
    });
    expect(await requestPersistence()).toBe(false);
    Object.defineProperty(navigator, 'storage', { value: original, configurable: true });
  });
});

describe('account defaults', () => {
  it.each([
    ['cash', 'cash', true, undefined],
    ['brokerage', 'tw_equity', true, undefined],
    ['pension', 'other', true, 60],
    ['insurance', 'other', false, undefined],
    ['property', 'property', false, undefined],
    ['liability', 'other', false, undefined],
  ] as const)(
    'a %s account is %s, investable %s, access age %s',
    (type, assetClass, investable, accessAge) => {
      expect(accountDefaults(type)).toEqual({
        assetClass,
        investable,
        ...(accessAge ? { accessAge } : {}),
      });
    },
  );

  it('uses the given pension access age', () => {
    expect(accountDefaults('pension', 65).accessAge).toBe(65);
  });
});
