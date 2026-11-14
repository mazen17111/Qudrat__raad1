import { ThemeConfig } from '../types';

export type CourseThemeColor = 'default' | 'red' | 'green' | 'blue' | 'purple' | 'pink' | 'orange' | 'black';

export interface CourseColorOption {
  id: CourseThemeColor;
  label: string;
  hex: string;
  circleClass: string;
}

export const COURSE_COLOR_OPTIONS: CourseColorOption[] = [
  {
    id: 'default',
    label: 'الافتراضي',
    hex: '#2563eb',
    circleClass: 'bg-gradient-to-tr from-slate-400 via-slate-200 to-white dark:from-slate-600 dark:via-slate-400 dark:to-slate-300 border border-slate-300 dark:border-slate-500',
  },
  {
    id: 'red',
    label: 'أحمر',
    hex: '#ef4444',
    circleClass: 'bg-red-500 hover:bg-red-400 border border-red-300 shadow-sm shadow-red-500/50',
  },
  {
    id: 'green',
    label: 'أخضر',
    hex: '#10b981',
    circleClass: 'bg-emerald-500 hover:bg-emerald-400 border border-emerald-300 shadow-sm shadow-emerald-500/50',
  },
  {
    id: 'blue',
    label: 'أزرق',
    hex: '#3b82f6',
    circleClass: 'bg-blue-500 hover:bg-blue-400 border border-blue-300 shadow-sm shadow-blue-500/50',
  },
  {
    id: 'purple',
    label: 'بنفسجي',
    hex: '#8b5cf6',
    circleClass: 'bg-purple-500 hover:bg-purple-400 border border-purple-300 shadow-sm shadow-purple-500/50',
  },
  {
    id: 'pink',
    label: 'وردي',
    hex: '#ec4899',
    circleClass: 'bg-pink-500 hover:bg-pink-400 border border-pink-300 shadow-sm shadow-pink-500/50',
  },
  {
    id: 'orange',
    label: 'برتقالي',
    hex: '#f97316',
    circleClass: 'bg-orange-500 hover:bg-orange-400 border border-orange-300 shadow-sm shadow-orange-500/50',
  },
  {
    id: 'black',
    label: 'أسود',
    hex: '#000000',
    circleClass: 'bg-black hover:bg-neutral-900 border-2 border-neutral-600 shadow-sm shadow-black/60',
  },
];

export const COURSE_COLOR_THEMES: Record<Exclude<CourseThemeColor, 'default'>, ThemeConfig> = {
  red: {
    id: 'course-red',
    name: 'أحمر ناري مخصص للكورس',
    primary: '#ef4444',
    secondary: '#dc2626',
    accent: '#f87171',
    bgGradient: 'from-slate-950 via-red-950/40 to-slate-900',
    cardBg: 'bg-slate-900/90 border-red-500/25',
    headerBg: 'bg-slate-900/95 border-red-500/30',
    accentBorder: 'border-red-500/40',
    badgeBg: 'bg-red-500/20 text-red-400 border-red-500/30',
    buttonGradient: 'from-red-600 via-rose-600 to-red-700 hover:from-red-500 hover:to-rose-500 text-white',
  },
  green: {
    id: 'course-green',
    name: 'أخضر زمردي مخصص للكورس',
    primary: '#10b981',
    secondary: '#059669',
    accent: '#34d399',
    bgGradient: 'from-slate-950 via-emerald-950/40 to-slate-900',
    cardBg: 'bg-slate-900/90 border-emerald-500/25',
    headerBg: 'bg-slate-900/95 border-emerald-500/30',
    accentBorder: 'border-emerald-500/40',
    badgeBg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    buttonGradient: 'from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 text-white',
  },
  blue: {
    id: 'course-blue',
    name: 'أزرق ملكي مخصص للكورس',
    primary: '#3b82f6',
    secondary: '#2563eb',
    accent: '#60a5fa',
    bgGradient: 'from-slate-950 via-blue-950/40 to-slate-900',
    cardBg: 'bg-slate-900/90 border-blue-500/25',
    headerBg: 'bg-slate-900/95 border-blue-500/30',
    accentBorder: 'border-blue-500/40',
    badgeBg: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    buttonGradient: 'from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white',
  },
  purple: {
    id: 'course-purple',
    name: 'بنفسجي ملكي مخصص للكورس',
    primary: '#8b5cf6',
    secondary: '#7c3aed',
    accent: '#a78bfa',
    bgGradient: 'from-slate-950 via-purple-950/40 to-slate-900',
    cardBg: 'bg-slate-900/90 border-purple-500/25',
    headerBg: 'bg-slate-900/95 border-purple-500/30',
    accentBorder: 'border-purple-500/40',
    badgeBg: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    buttonGradient: 'from-purple-600 via-violet-600 to-purple-700 hover:from-purple-500 hover:to-violet-500 text-white',
  },
  pink: {
    id: 'course-pink',
    name: 'وردي أنيق مخصص للكورس',
    primary: '#ec4899',
    secondary: '#db2777',
    accent: '#f472b6',
    bgGradient: 'from-slate-950 via-pink-950/40 to-slate-900',
    cardBg: 'bg-slate-900/90 border-pink-500/25',
    headerBg: 'bg-slate-900/95 border-pink-500/30',
    accentBorder: 'border-pink-500/40',
    badgeBg: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
    buttonGradient: 'from-pink-600 via-rose-600 to-pink-700 hover:from-pink-500 hover:to-rose-500 text-white',
  },
  orange: {
    id: 'course-orange',
    name: 'برتقالي مشرق مخصص للكورس',
    primary: '#f97316',
    secondary: '#ea580c',
    accent: '#fb923c',
    bgGradient: 'from-slate-950 via-orange-950/40 to-slate-900',
    cardBg: 'bg-slate-900/90 border-orange-500/25',
    headerBg: 'bg-slate-900/95 border-orange-500/30',
    accentBorder: 'border-orange-500/40',
    badgeBg: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    buttonGradient: 'from-orange-600 via-amber-600 to-orange-700 hover:from-orange-500 hover:to-amber-500 text-white',
  },
  black: {
    id: 'course-black',
    name: 'أسود ملكي مخصص للكورس',
    primary: '#000000',
    secondary: '#000000',
    accent: '#ffffff',
    bgGradient: 'from-black via-black to-black',
    cardBg: 'bg-black border-white/20',
    headerBg: 'bg-black border-white/20',
    accentBorder: 'border-white/25',
    badgeBg: 'bg-black text-white border-white/25',
    buttonGradient: 'from-black via-black to-black hover:from-neutral-950 hover:to-neutral-950 text-white border border-white/30',
  },
};

export function getEffectiveCourseTheme(
  color: CourseThemeColor | undefined,
  defaultTheme: ThemeConfig
): ThemeConfig {
  if (!color || color === 'default') {
    return defaultTheme;
  }
  return COURSE_COLOR_THEMES[color] || defaultTheme;
}

export function getEnterPlatformButtonClass(color: CourseThemeColor | undefined): string {
  switch (color) {
    case 'red':
      return 'bg-gradient-to-r from-red-600 via-rose-600 to-red-600 hover:from-red-500 hover:to-rose-500 text-white shadow-lg shadow-red-600/30';
    case 'green':
      return 'bg-gradient-to-r from-emerald-600 via-green-600 to-emerald-600 hover:from-emerald-500 hover:to-green-500 text-white shadow-lg shadow-emerald-600/30';
    case 'blue':
      return 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-600/30';
    case 'purple':
      return 'bg-gradient-to-r from-purple-600 via-violet-600 to-purple-600 hover:from-purple-500 hover:to-violet-500 text-white shadow-lg shadow-purple-600/30';
    case 'pink':
      return 'bg-gradient-to-r from-pink-600 via-rose-600 to-pink-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-lg shadow-pink-600/30';
    case 'orange':
      return 'bg-gradient-to-r from-orange-600 via-amber-500 to-orange-600 hover:from-orange-500 hover:to-amber-400 text-white shadow-lg shadow-orange-600/30';
    case 'black':
      return 'bg-black hover:bg-neutral-950 text-white border border-white/30';
    default:
      return 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-600/25';
  }
}

export interface LinkedCardTheme {
  cardBg: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  targetBadge: string;
  label: string;
  titleHover: string;
  info: string;
  button: string;
  iconColor: string;
}

export function getLinkedExamCardTheme(color: CourseThemeColor | undefined, isDarkMode: boolean): LinkedCardTheme {
  switch (color) {
    case 'red':
      return {
        cardBg: isDarkMode
          ? 'bg-gradient-to-br from-red-950/80 via-slate-900 to-red-900/50 border-red-500/90 hover:border-red-400 shadow-red-500/15'
          : 'bg-gradient-to-br from-red-50 via-white to-red-50/60 border-red-500 hover:border-red-600 shadow-red-500/10',
        badgeBg: 'bg-red-500/20',
        badgeText: 'text-red-500 dark:text-red-400',
        badgeBorder: 'border-red-500/40',
        targetBadge: isDarkMode ? 'text-red-400 bg-black/40 border-red-500/20' : 'text-red-900 bg-red-100 border-red-300',
        label: isDarkMode ? 'text-red-400/90' : 'text-red-800',
        titleHover: isDarkMode ? 'group-hover:text-red-300' : 'group-hover:text-red-800',
        info: isDarkMode ? 'text-red-400' : 'text-red-800',
        button: 'bg-gradient-to-r from-red-600 via-red-500 to-red-600 hover:from-red-500 hover:to-red-400 text-white shadow-lg shadow-red-600/30',
        iconColor: 'text-red-500 dark:text-red-400',
      };
    case 'green':
      return {
        cardBg: isDarkMode
          ? 'bg-gradient-to-br from-emerald-950/80 via-slate-900 to-emerald-900/50 border-emerald-500/90 hover:border-emerald-400 shadow-emerald-500/15'
          : 'bg-gradient-to-br from-emerald-50 via-white to-emerald-50/60 border-emerald-500 hover:border-emerald-600 shadow-emerald-500/10',
        badgeBg: 'bg-emerald-500/20',
        badgeText: 'text-emerald-500 dark:text-emerald-400',
        badgeBorder: 'border-emerald-500/40',
        targetBadge: isDarkMode ? 'text-emerald-400 bg-black/40 border-emerald-500/20' : 'text-emerald-900 bg-emerald-100 border-emerald-300',
        label: isDarkMode ? 'text-emerald-400/90' : 'text-emerald-800',
        titleHover: isDarkMode ? 'group-hover:text-emerald-300' : 'group-hover:text-emerald-800',
        info: isDarkMode ? 'text-emerald-400' : 'text-emerald-800',
        button: 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-lg shadow-emerald-600/30',
        iconColor: 'text-emerald-500 dark:text-emerald-400',
      };
    case 'blue':
      return {
        cardBg: isDarkMode
          ? 'bg-gradient-to-br from-blue-950/80 via-slate-900 to-blue-900/50 border-blue-500/90 hover:border-blue-400 shadow-blue-500/15'
          : 'bg-gradient-to-br from-blue-50 via-white to-blue-50/60 border-blue-500 hover:border-blue-600 shadow-blue-500/10',
        badgeBg: 'bg-blue-500/20',
        badgeText: 'text-blue-500 dark:text-blue-400',
        badgeBorder: 'border-blue-500/40',
        targetBadge: isDarkMode ? 'text-blue-400 bg-black/40 border-blue-500/20' : 'text-blue-900 bg-blue-100 border-blue-300',
        label: isDarkMode ? 'text-blue-400/90' : 'text-blue-800',
        titleHover: isDarkMode ? 'group-hover:text-blue-300' : 'group-hover:text-blue-800',
        info: isDarkMode ? 'text-blue-400' : 'text-blue-800',
        button: 'bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600 hover:from-blue-500 hover:to-blue-400 text-white shadow-lg shadow-blue-600/30',
        iconColor: 'text-blue-500 dark:text-blue-400',
      };
    case 'purple':
      return {
        cardBg: isDarkMode
          ? 'bg-gradient-to-br from-purple-950/80 via-slate-900 to-purple-900/50 border-purple-500/90 hover:border-purple-400 shadow-purple-500/15'
          : 'bg-gradient-to-br from-purple-50 via-white to-purple-50/60 border-purple-500 hover:border-purple-600 shadow-purple-500/10',
        badgeBg: 'bg-purple-500/20',
        badgeText: 'text-purple-500 dark:text-purple-400',
        badgeBorder: 'border-purple-500/40',
        targetBadge: isDarkMode ? 'text-purple-400 bg-black/40 border-purple-500/20' : 'text-purple-900 bg-purple-100 border-purple-300',
        label: isDarkMode ? 'text-purple-400/90' : 'text-purple-800',
        titleHover: isDarkMode ? 'group-hover:text-purple-300' : 'group-hover:text-purple-800',
        info: isDarkMode ? 'text-purple-400' : 'text-purple-800',
        button: 'bg-gradient-to-r from-purple-600 via-violet-500 to-purple-600 hover:from-purple-500 hover:to-violet-400 text-white shadow-lg shadow-purple-600/30',
        iconColor: 'text-purple-500 dark:text-purple-400',
      };
    case 'pink':
      return {
        cardBg: isDarkMode
          ? 'bg-gradient-to-br from-pink-950/80 via-slate-900 to-pink-900/50 border-pink-500/90 hover:border-pink-400 shadow-pink-500/15'
          : 'bg-gradient-to-br from-pink-50 via-white to-pink-50/60 border-pink-500 hover:border-pink-600 shadow-pink-500/10',
        badgeBg: 'bg-pink-500/20',
        badgeText: 'text-pink-500 dark:text-pink-400',
        badgeBorder: 'border-pink-500/40',
        targetBadge: isDarkMode ? 'text-pink-400 bg-black/40 border-pink-500/20' : 'text-pink-900 bg-pink-100 border-pink-300',
        label: isDarkMode ? 'text-pink-400/90' : 'text-pink-800',
        titleHover: isDarkMode ? 'group-hover:text-pink-300' : 'group-hover:text-pink-800',
        info: isDarkMode ? 'text-pink-400' : 'text-pink-800',
        button: 'bg-gradient-to-r from-pink-600 via-rose-500 to-pink-600 hover:from-pink-500 hover:to-rose-400 text-white shadow-lg shadow-pink-600/30',
        iconColor: 'text-pink-500 dark:text-pink-400',
      };
    case 'orange':
      return {
        cardBg: isDarkMode
          ? 'bg-gradient-to-br from-orange-950/80 via-slate-900 to-amber-900/50 border-orange-500/90 hover:border-orange-400 shadow-orange-500/15'
          : 'bg-gradient-to-br from-orange-50 via-white to-amber-50/60 border-orange-500 hover:border-orange-600 shadow-orange-500/10',
        badgeBg: 'bg-orange-500/20',
        badgeText: 'text-orange-500 dark:text-orange-400',
        badgeBorder: 'border-orange-500/40',
        targetBadge: isDarkMode ? 'text-orange-400 bg-black/40 border-orange-500/20' : 'text-orange-900 bg-orange-100 border-orange-300',
        label: isDarkMode ? 'text-orange-400/90' : 'text-orange-800',
        titleHover: isDarkMode ? 'group-hover:text-orange-300' : 'group-hover:text-orange-800',
        info: isDarkMode ? 'text-orange-400' : 'text-orange-800',
        button: 'bg-gradient-to-r from-orange-600 via-amber-500 to-orange-600 hover:from-orange-500 hover:to-amber-400 text-white shadow-lg shadow-orange-600/30',
        iconColor: 'text-orange-500 dark:text-orange-400',
      };
    case 'black':
      return {
        cardBg: 'bg-black border-white/25 hover:border-white/50 text-white',
        badgeBg: 'bg-black',
        badgeText: 'text-white',
        badgeBorder: 'border-white/25',
        targetBadge: 'text-white bg-black border-white/25',
        label: 'text-white',
        titleHover: 'group-hover:text-white',
        info: 'text-white',
        button: 'bg-black hover:bg-neutral-950 text-white border border-white/30',
        iconColor: 'text-white',
      };
    default:
      // Default natural amber styling for exam box
      return {
        cardBg: isDarkMode
          ? 'bg-gradient-to-br from-amber-950/80 via-slate-900 to-amber-900/50 border-amber-500/90 hover:border-amber-400 shadow-amber-500/15'
          : 'bg-gradient-to-br from-amber-50 via-white to-amber-50/60 border-amber-500 hover:border-amber-600 shadow-amber-500/10',
        badgeBg: 'bg-amber-500/20',
        badgeText: 'text-amber-500',
        badgeBorder: 'border-amber-500/40',
        targetBadge: isDarkMode ? 'text-amber-400 bg-black/40 border-amber-500/20' : 'text-amber-900 bg-amber-100 border-amber-300',
        label: isDarkMode ? 'text-amber-400/90' : 'text-amber-800',
        titleHover: isDarkMode ? 'group-hover:text-amber-300' : 'group-hover:text-amber-800',
        info: isDarkMode ? 'text-amber-400' : 'text-amber-800',
        button: 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 shadow-lg shadow-amber-500/30',
        iconColor: 'text-amber-500',
      };
  }
}

export function getLinkedFileCardTheme(color: CourseThemeColor | undefined, isDarkMode: boolean): LinkedCardTheme {
  switch (color) {
    case 'red':
      return {
        cardBg: isDarkMode
          ? 'bg-gradient-to-br from-rose-950/80 via-slate-900 to-red-950/50 border-rose-500/90 hover:border-rose-400 shadow-rose-500/15'
          : 'bg-gradient-to-br from-rose-50 via-white to-rose-50/60 border-rose-500 hover:border-rose-600 shadow-rose-500/10',
        badgeBg: 'bg-rose-500/20',
        badgeText: 'text-rose-500 dark:text-rose-400',
        badgeBorder: 'border-rose-500/40',
        targetBadge: isDarkMode ? 'text-rose-400 bg-black/40 border-rose-500/20' : 'text-rose-900 bg-rose-100 border-rose-300',
        label: isDarkMode ? 'text-rose-400/90' : 'text-rose-800',
        titleHover: isDarkMode ? 'group-hover:text-rose-300' : 'group-hover:text-rose-800',
        info: isDarkMode ? 'text-rose-400' : 'text-rose-800',
        button: 'bg-gradient-to-r from-rose-600 via-red-500 to-rose-600 hover:from-rose-500 hover:to-red-400 text-white shadow-lg shadow-rose-600/30',
        iconColor: 'text-rose-500 dark:text-rose-400',
      };
    case 'green':
      return {
        cardBg: isDarkMode
          ? 'bg-gradient-to-br from-teal-950/80 via-slate-900 to-emerald-950/50 border-teal-500/90 hover:border-teal-400 shadow-teal-500/15'
          : 'bg-gradient-to-br from-teal-50 via-white to-teal-50/60 border-teal-500 hover:border-teal-600 shadow-teal-500/10',
        badgeBg: 'bg-teal-500/20',
        badgeText: 'text-teal-500 dark:text-teal-400',
        badgeBorder: 'border-teal-500/40',
        targetBadge: isDarkMode ? 'text-teal-400 bg-black/40 border-teal-500/20' : 'text-teal-900 bg-teal-100 border-teal-300',
        label: isDarkMode ? 'text-teal-400/90' : 'text-teal-800',
        titleHover: isDarkMode ? 'group-hover:text-teal-300' : 'group-hover:text-teal-800',
        info: isDarkMode ? 'text-teal-400' : 'text-teal-800',
        button: 'bg-gradient-to-r from-teal-600 via-emerald-500 to-teal-600 hover:from-teal-500 hover:to-emerald-400 text-white shadow-lg shadow-teal-600/30',
        iconColor: 'text-teal-500 dark:text-teal-400',
      };
    case 'blue':
      return {
        cardBg: isDarkMode
          ? 'bg-gradient-to-br from-indigo-950/80 via-slate-900 to-sky-950/50 border-indigo-500/90 hover:border-indigo-400 shadow-indigo-500/15'
          : 'bg-gradient-to-br from-indigo-50 via-white to-sky-50/60 border-indigo-500 hover:border-indigo-600 shadow-indigo-500/10',
        badgeBg: 'bg-indigo-500/20',
        badgeText: 'text-indigo-500 dark:text-indigo-400',
        badgeBorder: 'border-indigo-500/40',
        targetBadge: isDarkMode ? 'text-indigo-400 bg-black/40 border-indigo-500/20' : 'text-indigo-900 bg-indigo-100 border-indigo-300',
        label: isDarkMode ? 'text-indigo-400/90' : 'text-indigo-800',
        titleHover: isDarkMode ? 'group-hover:text-indigo-300' : 'group-hover:text-indigo-800',
        info: isDarkMode ? 'text-indigo-400' : 'text-indigo-800',
        button: 'bg-gradient-to-r from-indigo-600 via-blue-500 to-indigo-600 hover:from-indigo-500 hover:to-blue-400 text-white shadow-lg shadow-indigo-600/30',
        iconColor: 'text-indigo-500 dark:text-indigo-400',
      };
    case 'purple':
      return {
        cardBg: isDarkMode
          ? 'bg-gradient-to-br from-violet-950/80 via-slate-900 to-purple-950/50 border-violet-500/90 hover:border-violet-400 shadow-violet-500/15'
          : 'bg-gradient-to-br from-violet-50 via-white to-purple-50/60 border-violet-500 hover:border-violet-600 shadow-violet-500/10',
        badgeBg: 'bg-violet-500/20',
        badgeText: 'text-violet-500 dark:text-violet-400',
        badgeBorder: 'border-violet-500/40',
        targetBadge: isDarkMode ? 'text-violet-400 bg-black/40 border-violet-500/20' : 'text-violet-900 bg-violet-100 border-violet-300',
        label: isDarkMode ? 'text-violet-400/90' : 'text-violet-800',
        titleHover: isDarkMode ? 'group-hover:text-violet-300' : 'group-hover:text-violet-800',
        info: isDarkMode ? 'text-violet-400' : 'text-violet-800',
        button: 'bg-gradient-to-r from-violet-600 via-purple-500 to-violet-600 hover:from-violet-500 hover:to-purple-400 text-white shadow-lg shadow-violet-600/30',
        iconColor: 'text-violet-500 dark:text-violet-400',
      };
    case 'pink':
      return {
        cardBg: isDarkMode
          ? 'bg-gradient-to-br from-rose-950/80 via-slate-900 to-pink-950/50 border-rose-500/90 hover:border-rose-400 shadow-rose-500/15'
          : 'bg-gradient-to-br from-rose-50 via-white to-rose-50/60 border-rose-500 hover:border-rose-600 shadow-rose-500/10',
        badgeBg: 'bg-rose-500/20',
        badgeText: 'text-rose-500 dark:text-rose-400',
        badgeBorder: 'border-rose-500/40',
        targetBadge: isDarkMode ? 'text-rose-400 bg-black/40 border-rose-500/20' : 'text-rose-900 bg-rose-100 border-rose-300',
        label: isDarkMode ? 'text-rose-400/90' : 'text-rose-800',
        titleHover: isDarkMode ? 'group-hover:text-rose-300' : 'group-hover:text-rose-800',
        info: isDarkMode ? 'text-rose-400' : 'text-rose-800',
        button: 'bg-gradient-to-r from-rose-600 via-pink-500 to-rose-600 hover:from-rose-500 hover:to-pink-400 text-white shadow-lg shadow-rose-600/30',
        iconColor: 'text-rose-500 dark:text-rose-400',
      };
    case 'orange':
      return {
        cardBg: isDarkMode
          ? 'bg-gradient-to-br from-orange-950/80 via-slate-900 to-amber-900/50 border-orange-500/90 hover:border-orange-400 shadow-orange-500/15'
          : 'bg-gradient-to-br from-orange-50 via-white to-amber-50/60 border-orange-500 hover:border-orange-600 shadow-orange-500/10',
        badgeBg: 'bg-orange-500/20',
        badgeText: 'text-orange-500 dark:text-orange-400',
        badgeBorder: 'border-orange-500/40',
        targetBadge: isDarkMode ? 'text-orange-400 bg-black/40 border-orange-500/20' : 'text-orange-900 bg-orange-100 border-orange-300',
        label: isDarkMode ? 'text-orange-400/90' : 'text-orange-800',
        titleHover: isDarkMode ? 'group-hover:text-orange-300' : 'group-hover:text-orange-800',
        info: isDarkMode ? 'text-orange-400' : 'text-orange-800',
        button: 'bg-gradient-to-r from-orange-600 via-amber-500 to-orange-600 hover:from-orange-500 hover:to-amber-400 text-white shadow-lg shadow-orange-600/30',
        iconColor: 'text-orange-500 dark:text-orange-400',
      };
    case 'black':
      return {
        cardBg: 'bg-black border-white/25 hover:border-white/50 text-white',
        badgeBg: 'bg-black',
        badgeText: 'text-white',
        badgeBorder: 'border-white/25',
        targetBadge: 'text-white bg-black border-white/25',
        label: 'text-white',
        titleHover: 'group-hover:text-white',
        info: 'text-white',
        button: 'bg-black hover:bg-neutral-950 text-white border border-white/30',
        iconColor: 'text-white',
      };
    default:
      // Default natural emerald styling for file box
      return {
        cardBg: isDarkMode
          ? 'bg-gradient-to-br from-emerald-950/80 via-slate-900 to-teal-900/50 border-emerald-500/90 hover:border-emerald-400 shadow-emerald-500/15'
          : 'bg-gradient-to-br from-emerald-50 via-white to-teal-50/60 border-emerald-500 hover:border-emerald-600 shadow-emerald-500/10',
        badgeBg: 'bg-emerald-500/20',
        badgeText: 'text-emerald-500',
        badgeBorder: 'border-emerald-500/40',
        targetBadge: isDarkMode ? 'text-emerald-400 bg-black/40 border-emerald-500/20' : 'text-emerald-900 bg-emerald-100 border-emerald-300',
        label: isDarkMode ? 'text-emerald-400/90' : 'text-emerald-800',
        titleHover: isDarkMode ? 'group-hover:text-emerald-300' : 'group-hover:text-emerald-800',
        info: isDarkMode ? 'text-emerald-400' : 'text-emerald-800',
        button: 'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 hover:from-emerald-400 hover:to-teal-300 text-slate-950 shadow-lg shadow-emerald-500/30',
        iconColor: 'text-emerald-500',
      };
  }
}
