// Ready-made habits for the New Habit dialog, and Habit Ideas packs that add a few at once.
// Colors are keys from _utils/habitColors.

import type { Habit } from '@/lib/datacenter';

export type HabitTemplate = {
  key: string;
  name: string;
  emoji: string;
  color: string;
  kind?: Habit['kind'];
  goalValue?: number;
  goalUnit?: string;
  goalPeriod?: Habit['goalPeriod'];
  timeRange?: Habit['timeRange'];
  barAction?: Habit['barAction'];
};

export type HabitCategory = { key: string; label: string; emoji: string; templates: HabitTemplate[] };

const t = (key: string, emoji: string, name: string, color: string, extra: Partial<HabitTemplate> = {}): HabitTemplate =>
  ({ key, emoji, name, color, ...extra });

// Amount goals log with "+ amount" by default; plain "1 time" goals just check off
const amount = (goalValue: number, goalUnit: string, more: Partial<HabitTemplate> = {}): Partial<HabitTemplate> =>
  ({ goalValue, goalUnit, barAction: 'add', ...more });

const T = {
  walk:       t('walk', '🚶', 'Walk', 'mint', amount(6000, 'steps')),
  run:        t('run', '🏃', 'Run', 'coral', amount(3, 'km', { timeRange: 'morning' })),
  sleep:      t('sleep', '🛏️', 'Sleep', 'indigo', amount(8, 'h', { timeRange: 'evening' })),
  water:      t('water', '💧', 'Drink water', 'sky', amount(2000, 'ml')),
  meditate:   t('meditate', '🧘', 'Meditate', 'violet', amount(10, 'min', { timeRange: 'morning' })),
  stand:      t('stand', '🧍', 'Stand up', 'tangerine', amount(8, 'times')),
  cycle:      t('cycle', '🚴', 'Cycling', 'lime', amount(10, 'km')),
  workout:    t('workout', '💪', 'Workout', 'rose', amount(30, 'min')),
  yoga:       t('yoga', '🧘‍♀️', 'Yoga', 'pink', amount(20, 'min', { timeRange: 'morning' })),
  stretch:    t('stretch', '🤸', 'Stretch', 'grape', amount(10, 'min')),
  swim:       t('swim', '🏊', 'Swim', 'aqua', amount(30, 'min')),
  pushups:    t('pushups', '🏋️', 'Push-ups', 'brick', amount(30, 'times')),
  breakfast:  t('breakfast', '🍳', 'Eat breakfast', 'sunflower', { timeRange: 'morning' }),
  fruit:      t('fruit', '🍎', 'Eat fruit', 'lime', amount(2, 'times')),
  vitamins:   t('vitamins', '💊', 'Take vitamins', 'ochre', { timeRange: 'morning' }),
  read:       t('read', '📖', 'Read', 'navy', amount(20, 'pages', { timeRange: 'evening' })),
  journal:    t('journal', '📓', 'Journal', 'plum', { timeRange: 'evening' }),
  gratitude:  t('gratitude', '🙏', 'Write 3 gratitudes', 'sunflower', { timeRange: 'evening' }),
  learn:      t('learn', '🧠', 'Learn something new', 'indigo', amount(30, 'min')),
  language:   t('language', '🗣️', 'Practice a language', 'teal', amount(15, 'min')),
  instrument: t('instrument', '🎸', 'Practice an instrument', 'rust', amount(20, 'min')),
  plan:       t('plan', '🗓️', 'Plan tomorrow', 'slate', { timeRange: 'evening' }),
  tidy:       t('tidy', '🧹', 'Tidy up', 'sage', amount(15, 'min')),
  bed:        t('bed', '🛏️', 'Make the bed', 'dust-blue', { timeRange: 'morning' }),
  skincare:   t('skincare', '🧴', 'Skincare routine', 'blush', amount(2, 'times')),
  floss:      t('floss', '🦷', 'Floss', 'fog', { timeRange: 'evening' }),
  save:       t('save', '💰', 'Save money', 'forest', amount(10, '$')),
  budget:     t('budget', '📊', 'Track expenses', 'olive', { timeRange: 'evening' }),
  friend:     t('friend', '📞', 'Contact a friend', 'coral', { goalPeriod: 'week' }),
  family:     t('family', '👨‍👩‍👧', 'Family time', 'tangerine', amount(30, 'min')),
  outside:    t('outside', '🌳', 'Go outside', 'moss', amount(20, 'min')),
  noPhone:    t('no-phone-bed', '📵', 'No phone in bed', 'charcoal', { timeRange: 'evening' }),
  // Quit habits: the goal is the most allowed — 0 means not at all
  quitSmoke:  t('quit-smoking', '🚭', 'Quit smoking', 'stone', { kind: 'quit', goalValue: 0, goalUnit: 'times' }),
  lessCoffee: t('less-coffee', '☕', 'Drink less coffee', 'cocoa', { kind: 'quit', goalValue: 2, goalUnit: 'cups' }),
  noSugar:    t('no-sugar', '🍬', 'No sugar', 'pink', { kind: 'quit', goalValue: 0, goalUnit: 'times' }),
  lessScreen: t('less-screen', '📱', 'Less screen time', 'slate', { kind: 'quit', goalValue: 2, goalUnit: 'h' }),
  noAlcohol:  t('no-alcohol', '🍷', 'No alcohol', 'plum', { kind: 'quit', goalValue: 0, goalUnit: 'drinks' }),
  lessGames:  t('less-games', '🎮', 'Play fewer games', 'grape', { kind: 'quit', goalValue: 1, goalUnit: 'h' }),
  noJunk:     t('no-junk-food', '🍔', 'No junk food', 'mustard', { kind: 'quit', goalValue: 0, goalUnit: 'times' }),
};

export const HABIT_CATEGORIES: HabitCategory[] = [
  { key: 'popular', label: 'Popular', emoji: '🔥', templates: [T.walk, T.sleep, T.water, T.meditate, T.run, T.read, T.workout, T.stand, T.cycle] },
  { key: 'health', label: 'Health', emoji: '❤️', templates: [T.water, T.sleep, T.breakfast, T.fruit, T.vitamins, T.skincare, T.floss, T.outside] },
  { key: 'sports', label: 'Sports', emoji: '🏃', templates: [T.run, T.walk, T.cycle, T.workout, T.yoga, T.stretch, T.swim, T.pushups] },
  { key: 'lifestyle', label: 'Lifestyle', emoji: '🏡', templates: [T.bed, T.tidy, T.plan, T.save, T.budget, T.friend, T.family, T.noPhone] },
  { key: 'mind', label: 'Mind', emoji: '🧠', templates: [T.meditate, T.read, T.journal, T.gratitude, T.learn, T.language, T.instrument] },
  { key: 'quit', label: 'Quit', emoji: '🚫', templates: [T.quitSmoke, T.lessCoffee, T.noSugar, T.lessScreen, T.noAlcohol, T.lessGames, T.noJunk] },
];

export type HabitIdea = { key: string; title: string; subtitle: string; emoji: string; color: string; templates: HabitTemplate[] };

export const HABIT_IDEAS: HabitIdea[] = [
  { key: 'lose-weight', title: 'Lose weight', subtitle: "Not easy, but it's possible", emoji: '⚖️', color: 'violet', templates: [T.walk, T.water, T.noSugar, T.workout, T.sleep] },
  { key: 'save-money', title: 'Build savings', subtitle: 'Start small, start now', emoji: '💰', color: 'sunflower', templates: [T.save, T.budget, T.noJunk] },
  { key: 'be-healthy', title: 'Be healthy', subtitle: 'A healthy life beats a wealthy one', emoji: '💚', color: 'mint', templates: [T.water, T.breakfast, T.fruit, T.vitamins, T.sleep, T.outside] },
  { key: 'tiny-habits', title: 'Tiny habits', subtitle: 'Small habits, big results', emoji: '✅', color: 'sky', templates: [T.bed, T.floss, T.stand, T.gratitude] },
  { key: 'be-social', title: 'Be social', subtitle: 'Real life, real people', emoji: '🫶', color: 'pink', templates: [T.friend, T.family, T.lessScreen] },
  { key: 'be-positive', title: 'Be positive', subtitle: 'Notice the good things', emoji: '😊', color: 'tangerine', templates: [T.gratitude, T.journal, T.meditate, T.outside] },
  { key: 'gain-muscle', title: 'Gain muscle', subtitle: 'Build the body you want', emoji: '💪', color: 'indigo', templates: [T.workout, T.pushups, T.sleep, T.water] },
  { key: 'skin-care', title: 'Skin care', subtitle: 'Glow, consistently', emoji: '🧴', color: 'rose', templates: [T.skincare, T.water, T.sleep, T.noSugar] },
  { key: 'sleep-better', title: 'Sleep better', subtitle: 'Rest is productive', emoji: '🌙', color: 'navy', templates: [T.noPhone, T.lessCoffee, T.sleep, T.meditate] },
  { key: 'keep-learning', title: 'Keep learning', subtitle: 'A little every day', emoji: '📚', color: 'teal', templates: [T.read, T.learn, T.language, T.instrument] },
];

/** The habit fields a template fills in (merge into makeHabit()). */
export type TemplateFields = Pick<Habit, 'text' | 'emoji' | 'color' | 'kind' | 'goalValue' | 'goalUnit' | 'goalPeriod' | 'timeRange' | 'barAction' | 'templateKey'>;

export function habitFromTemplate(tpl: HabitTemplate): TemplateFields {
  return {
    text: tpl.name,
    emoji: tpl.emoji,
    color: tpl.color,
    kind: tpl.kind ?? 'build',
    goalValue: tpl.goalValue ?? 1,
    goalUnit: tpl.goalUnit ?? 'times',
    goalPeriod: tpl.goalPeriod ?? 'day',
    timeRange: tpl.timeRange ?? 'anytime',
    barAction: tpl.barAction ?? 'done',
    templateKey: tpl.key,
  };
}

/** Units offered in the editor (any other text works too). */
export const HABIT_UNITS = ['times', 'min', 'h', 'ml', 'L', 'km', 'steps', 'pages', 'cups', 'kcal', '$'];

/** A curated set for the emoji picker. */
export const HABIT_EMOJIS = [
  '✅', '🔥', '⭐', '💪', '🏃', '🚶', '🚴', '🏊', '🧘', '🤸', '🏋️', '⚽',
  '💧', '🍎', '🥗', '🍳', '☕', '💊', '🛏️', '😴', '🌙', '☀️', '🌳', '🌱',
  '📖', '📓', '✍️', '🧠', '🎓', '🗣️', '🎸', '🎨', '💻', '🗓️', '⏰', '🎯',
  '💰', '📊', '🧹', '🧺', '🧴', '🦷', '📞', '🫶', '👨‍👩‍👧', '🐶', '🙏', '😊',
  '🚭', '🍬', '🍷', '📵', '🎮', '🍔', '📱', '🚫',
];
