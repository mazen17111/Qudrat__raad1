import { StudentUser } from '../types';

const TG_PROFILES_CACHE_KEY = 'raad_cached_tg_profiles';
const TG_SAVED_ACCOUNTS_KEY = 'raad_saved_telegram_accounts';
const TG_PENDING_SYNC_KEY = 'raad_pending_tg_sync_profiles';

export interface SavedTelegramAccount {
  id: string | number;
  name: string;
  username?: string;
  photoUrl?: string;
}

function readJsonMap<T>(key: string): Record<string, T> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, T>;
      }
    }
  } catch {}
  return {};
}

function writeJsonMap<T>(key: string, map: Record<string, T>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {}
}

export function getCachedTelegramUser(telegramId: string | number): StudentUser | null {
  if (typeof window === 'undefined' || !telegramId) return null;
  const tgKey = String(telegramId).trim();
  if (!tgKey) return null;

  const profiles = readJsonMap<StudentUser>(TG_PROFILES_CACHE_KEY);
  if (profiles[tgKey]) {
    return profiles[tgKey];
  }

  // Also inspect active session & cached admin students list if available locally (0 Firestore reads)
  try {
    const sessRaw = localStorage.getItem('raad_student_auth_session') || localStorage.getItem('raad_student_session');
    if (sessRaw) {
      const sess = JSON.parse(sessRaw) as StudentUser;
      if (sess?.telegramId && String(sess.telegramId) === tgKey) {
        return sess;
      }
    }
  } catch {}

  try {
    const adminStudentsRaw = localStorage.getItem('raad_cached_admin_students');
    if (adminStudentsRaw) {
      const list = JSON.parse(adminStudentsRaw) as StudentUser[];
      if (Array.isArray(list)) {
        const match = list.find((s) => s?.telegramId && String(s.telegramId) === tgKey);
        if (match) return match;
      }
    }
  } catch {}

  return null;
}

export function saveCachedTelegramUser(user: StudentUser): SavedTelegramAccount[] {
  if (typeof window === 'undefined' || !user) return [];
  const tgId = user.telegramId ? String(user.telegramId).trim() : '';
  if (tgId) {
    const profiles = readJsonMap<StudentUser>(TG_PROFILES_CACHE_KEY);
    profiles[tgId] = user;
    writeJsonMap(TG_PROFILES_CACHE_KEY, profiles);

    try {
      const newAcc: SavedTelegramAccount = {
        id: tgId,
        name: user.name,
        username: user.telegramUsername || '',
        photoUrl: user.photoUrl || '',
      };
      const raw = localStorage.getItem(TG_SAVED_ACCOUNTS_KEY);
      const currentList: SavedTelegramAccount[] = raw ? JSON.parse(raw) : [];
      const updated = [newAcc, ...(Array.isArray(currentList) ? currentList : []).filter((a) => String(a.id) !== tgId)];
      localStorage.setItem(TG_SAVED_ACCOUNTS_KEY, JSON.stringify(updated));
      return updated;
    } catch {}
  }
  return [];
}

export function markTelegramUserPendingSync(user: StudentUser): void {
  if (!user?.telegramId) return;
  const tgKey = String(user.telegramId).trim();
  const pending = readJsonMap<StudentUser>(TG_PENDING_SYNC_KEY);
  pending[tgKey] = user;
  writeJsonMap(TG_PENDING_SYNC_KEY, pending);
}

export function clearTelegramUserPendingSync(telegramId: string | number): void {
  const tgKey = String(telegramId).trim();
  if (!tgKey) return;
  const pending = readJsonMap<StudentUser>(TG_PENDING_SYNC_KEY);
  if (pending[tgKey]) {
    delete pending[tgKey];
    writeJsonMap(TG_PENDING_SYNC_KEY, pending);
  }
}

export function getPendingTelegramUserSync(telegramId: string | number): StudentUser | null {
  const tgKey = String(telegramId).trim();
  if (!tgKey) return null;
  const pending = readJsonMap<StudentUser>(TG_PENDING_SYNC_KEY);
  return pending[tgKey] || null;
}

export function buildFallbackTelegramUser(params: {
  telegramId: string | number;
  name?: string;
  username?: string;
  photoUrl?: string;
  existing?: StudentUser | null;
}): StudentUser {
  const telegramIdStr = String(params.telegramId).trim();
  const existing = params.existing || getCachedTelegramUser(telegramIdStr);
  const nowIso = new Date().toISOString();

  if (existing) {
    return {
      ...existing,
      name: existing.name || params.name || `طالب_${telegramIdStr}`,
      telegramId: telegramIdStr,
      telegramUsername: params.username || existing.telegramUsername || '',
      photoUrl: params.photoUrl || existing.photoUrl || '',
      lastLoginAt: nowIso,
    };
  }

  return {
    id: `tg_${telegramIdStr}`,
    name: params.name || (params.username ? params.username : `طالب_${telegramIdStr}`),
    email: params.username ? `${params.username.toLowerCase()}@telegram.raad` : `tg_${telegramIdStr}@telegram.raad`,
    password: `tg_${telegramIdStr}_pass`,
    telegramId: telegramIdStr,
    telegramUsername: params.username || '',
    photoUrl: params.photoUrl || '',
    daysAllowed: 0,
    isUnlimited: false,
    isVip: false,
    subscriptionStatus: 'unspecified',
    subscriptionStartDate: '',
    subscriptionEndDate: '',
    isCounterPaused: false,
    pausedRemainingDays: 0,
    isIndividuallyBlocked: false,
    isIndividuallyWhitelisted: false,
    watchedVideoIds: [],
    totalExamsTaken: 0,
    averageScore: 0,
    enrolledCourseIds: [],
    preferredThemeColor: 'default',
    createdAt: nowIso,
    lastLoginAt: nowIso,
  };
}
