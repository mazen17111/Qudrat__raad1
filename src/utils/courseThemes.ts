import { ThemeConfig } from '../types';

export type CourseThemeColor = 'default' | 'red' | 'green' | 'blue' | 'purple' | 'pink';

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
