import { t } from '@/i18n';

// The ten Beginner lessons (PRD Part D, KD-9): one picture and at most two short sentences per
// screen, then a three-question quiz. Written fresh for children in English and Traditional
// Chinese; all text goes through t(). Lessons unlock in order, so lesson 10 follows 5 and 6.

export type Picture =
  | 'work'
  | 'gift'
  | 'redEnvelope'
  | 'need'
  | 'want'
  | 'jars'
  | 'goal'
  | 'calendar'
  | 'bank'
  | 'shop'
  | 'snowball'
  | 'seed'
  | 'tree'
  | 'storm'
  | 'sun'
  | 'price'
  | 'basket'
  | 'freedom';

export interface Screen {
  picture: Picture;
  lines: string[];
}

export interface Question {
  q: string;
  options: string[];
  /** Index of the right option. */
  answer: number;
}

export interface LessonDef {
  id: number;
  title: () => string;
  idea: () => string;
  screens: () => Screen[];
  quiz: () => Question[];
}

/** A badge needs at least this many right answers. */
export const PASS_SCORE = 2;

export const LESSONS: LessonDef[] = [
  {
    id: 1,
    title: () => t('Where money comes from'),
    idea: () => t('People earn money by working.'),
    screens: () => [
      {
        picture: 'work',
        lines: [t('Grown-ups earn money by working.'), t('A baker bakes bread. A nurse helps sick people.')],
      },
      {
        picture: 'gift',
        lines: [t('Kids can get pocket money and gifts.'), t('Some kids earn a little by helping at home.')],
      },
      {
        picture: 'redEnvelope',
        lines: [t('At Lunar New Year, many kids get red envelopes.'), t('That money is a gift from family.')],
      },
      {
        picture: 'jars',
        lines: [
          t('Money is something people share for work and things.'),
          t('Knowing where it comes from helps you use it well.'),
        ],
      },
    ],
    quiz: () => [
      {
        q: t('How do most grown-ups get money?'),
        options: [t('By working'), t('It grows on trees'), t('From the TV')],
        answer: 0,
      },
      {
        q: t('A red envelope at Lunar New Year is…'),
        options: [t('A bill to pay'), t('A gift from family'), t('A school test')],
        answer: 1,
      },
      {
        q: t('Which is a way a kid can earn a little money?'),
        options: [t('Helping with chores'), t('Sleeping late'), t('Watching cartoons')],
        answer: 0,
      },
    ],
  },
  {
    id: 2,
    title: () => t('Needs and wants'),
    idea: () => t('Needs come first; wants can wait.'),
    screens: () => [
      {
        picture: 'need',
        lines: [t('A need is something you must have.'), t('Food, water, a home and clothes are needs.')],
      },
      { picture: 'want', lines: [t('A want is nice to have.'), t('A new toy or a sweet is a want.')] },
      { picture: 'shop', lines: [t('Pay for needs first.'), t('Then you can choose some wants.')] },
      {
        picture: 'calendar',
        lines: [t('Wants can wait.'), t('Waiting a little can make a want even more fun.')],
      },
    ],
    quiz: () => [
      {
        q: t('Which one is a need?'),
        options: [t('A new game'), t('Lunch'), t('A sticker')],
        answer: 1,
      },
      {
        q: t('Which one is a want?'),
        options: [t('Water'), t('A coat in winter'), t('A toy robot')],
        answer: 2,
      },
      {
        q: t('What should you pay for first?'),
        options: [t('Needs'), t('Wants'), t('Whatever is shiny')],
        answer: 0,
      },
    ],
  },
  {
    id: 3,
    title: () => t('Three jars'),
    idea: () => t('Split every coin: some to spend, some to save, some to grow.'),
    screens: () => [
      {
        picture: 'jars',
        lines: [
          t('You have three jars: Spend, Savings and Grow.'),
          t('Every time you get money, it is split between them.'),
        ],
      },
      { picture: 'shop', lines: [t('Spend is for things you want soon.'), t('A snack or a small toy.')] },
      { picture: 'goal', lines: [t('Savings is for your goals.'), t('Something bigger, like a bike.')] },
      { picture: 'seed', lines: [t('Grow is for planting.'), t('Those coins stay for years and grow.')] },
    ],
    quiz: () => [
      {
        q: t('Which jar is for a bike you want next year?'),
        options: [t('Spend'), t('Savings'), t('No jar')],
        answer: 1,
      },
      {
        q: t('Coins in the Grow jar are…'),
        options: [t('Planted for many years'), t('Spent today'), t('Thrown away')],
        answer: 0,
      },
      {
        q: t('When you get money, you…'),
        options: [t('Put it all in Spend'), t('Split it between the jars'), t('Hide it under the bed')],
        answer: 1,
      },
    ],
  },
  {
    id: 4,
    title: () => t('Goals and patience'),
    idea: () => t('Saving a little each week adds up to something big.'),
    screens: () => [
      {
        picture: 'goal',
        lines: [t('A goal is something you save for.'), t('Pick one thing you really want.')],
      },
      { picture: 'calendar', lines: [t('Save a little every week.'), t('Small coins add up.')] },
      {
        picture: 'jars',
        lines: [t('Ten coins a week is 520 coins in a year.'), t('That is the power of patience.')],
      },
      { picture: 'sun', lines: [t('When you reach your goal, it feels great.'), t('You did it yourself!')] },
    ],
    quiz: () => [
      {
        q: t('Saving 10 coins every week for a year gives about…'),
        options: [t('10 coins'), t('520 coins'), t('1 coin')],
        answer: 1,
      },
      {
        q: t('What helps you reach a goal?'),
        options: [t('Saving a little each week'), t('Spending everything'), t('Forgetting about it')],
        answer: 0,
      },
      {
        q: t('A goal is…'),
        options: [t('Something you save for'), t('A kind of snack'), t('A bank')],
        answer: 0,
      },
    ],
  },
  {
    id: 5,
    title: () => t('Money can grow'),
    idea: () => t('Money in a bank or a business can earn more money.'),
    screens: () => [
      {
        picture: 'bank',
        lines: [t('A bank keeps money safe.'), t('It also pays you a little extra each year.')],
      },
      {
        picture: 'shop',
        lines: [
          t('People can also own a small part of a business.'),
          t('When the business does well, their part grows.'),
        ],
      },
      {
        picture: 'seed',
        lines: [t('Planting money is like planting a seed.'), t('Give it time, and it grows.')],
      },
      {
        picture: 'tree',
        lines: [t('The extra money is like fruit on a tree.'), t('You did not have to work for that fruit.')],
      },
    ],
    quiz: () => [
      {
        q: t('A bank pays you a little extra because…'),
        options: [t('Your money stayed with it'), t('It is your birthday'), t('You asked nicely')],
        answer: 0,
      },
      {
        q: t('Planting money is like…'),
        options: [t('Planting a seed'), t('Eating a cake'), t('Losing a sock')],
        answer: 0,
      },
      {
        q: t('Owning part of a business means…'),
        options: [
          t('Your part can grow when it does well'),
          t('You must work there'),
          t('You get free toys'),
        ],
        answer: 0,
      },
    ],
  },
  {
    id: 6,
    title: () => t('Snowball growth'),
    idea: () => t('Growth on top of growth: starting early matters most.'),
    screens: () => [
      {
        picture: 'snowball',
        lines: [
          t('A snowball rolling downhill picks up more snow.'),
          t('The bigger it gets, the faster it grows.'),
        ],
      },
      {
        picture: 'tree',
        lines: [t('Money that grows can grow again.'), t('Next year the fruit grows fruit too.')],
      },
      {
        picture: 'calendar',
        lines: [t('Two kids plant the same coins.'), t('The one who starts earlier ends up with much more.')],
      },
      { picture: 'seed', lines: [t('So the best time to plant is early.'), t('Even small coins count.')] },
    ],
    quiz: () => [
      {
        q: t('Why does a snowball grow faster as it rolls?'),
        options: [t('Bigger snowballs pick up more snow'), t('It gets cold'), t('Someone pushes it')],
        answer: 0,
      },
      {
        q: t('Who ends up with more: someone who plants early or late?'),
        options: [t('Late'), t('Early'), t('The same')],
        answer: 1,
      },
      {
        q: t('Growth on top of growth means…'),
        options: [t('Your fruit grows fruit too'), t('Money disappears'), t('Prices go down')],
        answer: 0,
      },
    ],
  },
  {
    id: 7,
    title: () => t('Ups and downs'),
    idea: () => t('Growing money sometimes drops; patient people wait for it to come back.'),
    screens: () => [
      { picture: 'storm', lines: [t('Some years are stormy.'), t('A money tree can lose some leaves.')] },
      {
        picture: 'sun',
        lines: [t('Then the sun comes back.'), t('Over many years, trees usually grow again.')],
      },
      {
        picture: 'calendar',
        lines: [t('Patient people do not pull up their tree in a storm.'), t('They wait for good weather.')],
      },
      {
        picture: 'tree',
        lines: [
          t('Money you need soon belongs in Savings, not Grow.'),
          t('Grow money can wait out the storms.'),
        ],
      },
    ],
    quiz: () => [
      {
        q: t('In a stormy year, a money tree…'),
        options: [t('Can go down for a while'), t('Always grows'), t('Turns into gold')],
        answer: 0,
      },
      {
        q: t('What do patient people do in a storm?'),
        options: [t('Pull up the tree'), t('Wait for good weather'), t('Cry all day')],
        answer: 1,
      },
      {
        q: t('Money you need next week should be in…'),
        options: [t('Savings or Spend'), t('Grow'), t('A tree hole')],
        answer: 0,
      },
    ],
  },
  {
    id: 8,
    title: () => t('Prices go up'),
    idea: () => t('Things cost more over time, so money that sits still buys less.'),
    screens: () => [
      {
        picture: 'price',
        lines: [
          t('When grandma was young, ice cream cost much less.'),
          t('Prices slowly go up over the years.'),
        ],
      },
      {
        picture: 'jars',
        lines: [t('Coins that just sit still do not go up.'), t('So later they buy less.')],
      },
      {
        picture: 'tree',
        lines: [t('Money that grows can keep up with prices.'), t('That is one more reason to plant coins.')],
      },
      {
        picture: 'shop',
        lines: [t('So when you plan, think about later prices.'), t('Things will likely cost a bit more.')],
      },
    ],
    quiz: () => [
      {
        q: t('Over many years, prices usually…'),
        options: [t('Go up'), t('Go down to zero'), t('Never change')],
        answer: 0,
      },
      {
        q: t('Coins hidden in a box for 20 years will buy…'),
        options: [t('More'), t('Less'), t('Exactly the same')],
        answer: 1,
      },
      {
        q: t('Money that grows can…'),
        options: [t('Keep up with prices'), t('Stop prices'), t('Make prices fall')],
        answer: 0,
      },
    ],
  },
  {
    id: 9,
    title: () => t('Don’t put all eggs in one basket'),
    idea: () => t('Spreading money across many things is safer.'),
    screens: () => [
      {
        picture: 'basket',
        lines: [t('If all your eggs are in one basket and it falls…'), t('…all the eggs can break.')],
      },
      {
        picture: 'tree',
        lines: [
          t('A garden with many trees is safer than one tree.'),
          t('If one tree has a bad year, the others can still grow.'),
        ],
      },
      {
        picture: 'shop',
        lines: [t('Grown-ups spread their money over many businesses.'), t('That is called spreading out.')],
      },
      {
        picture: 'sun',
        lines: [t('Spreading out does not stop every storm.'), t('But it makes a big fall less likely.')],
      },
    ],
    quiz: () => [
      {
        q: t('Why plant many trees instead of one?'),
        options: [
          t('If one has a bad year, others can still grow'),
          t('Trees get lonely'),
          t('It costs less'),
        ],
        answer: 0,
      },
      {
        q: t('“All eggs in one basket” means…'),
        options: [t('Everything in one place'), t('Breakfast time'), t('A safe plan')],
        answer: 0,
      },
      {
        q: t('Spreading money out makes a big fall…'),
        options: [t('Less likely'), t('Certain'), t('Bigger')],
        answer: 0,
      },
    ],
  },
  {
    id: 10,
    title: () => t('Freedom'),
    idea: () => t('When your tree’s fruit pays for your life, work becomes a choice.'),
    screens: () => [
      {
        picture: 'tree',
        lines: [
          t('Imagine a money tree so big that its fruit pays for your life.'),
          t('Food, home, fun: all from the fruit.'),
        ],
      },
      {
        picture: 'calendar',
        lines: [t('First add up what a grown-up life costs in a year.'), t('Then multiply by 25.')],
      },
      {
        picture: 'jars',
        lines: [
          t('That is your freedom number.'),
          t('A tree that big gives about 4 coins for every 100 each year.'),
        ],
      },
      {
        picture: 'freedom',
        lines: [
          t('When your tree reaches it, you are free.'),
          t('You can still work, but now it is your choice.'),
        ],
      },
    ],
    quiz: () => [
      {
        q: t('Your freedom number is the yearly cost times…'),
        options: [t('2'), t('25'), t('1000')],
        answer: 1,
      },
      {
        q: t('Being free means…'),
        options: [
          t('Your tree’s fruit pays for your life'),
          t('You never spend money'),
          t('You win a prize'),
        ],
        answer: 0,
      },
      {
        q: t('Why does planting early help you be free sooner?'),
        options: [
          t('Growth on top of growth has more time'),
          t('Trees like mornings'),
          t('It does not help'),
        ],
        answer: 0,
      },
    ],
  },
];

/** Whether a lesson is open: in order, so each needs the one before it (and 10 needs 5 and 6). */
export function unlocked(id: number, done: ReadonlySet<number>): boolean {
  if (id === 1) return true;
  if (id === 10 && !(done.has(5) && done.has(6))) return false;
  return done.has(id - 1);
}
