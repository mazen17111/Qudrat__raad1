import React, { useState, useEffect, useRef } from 'react';
import {
  StudentUser,
  SystemSettings,
  FeaturesConfig,
  IntroLessonConfig,
  CourseItem,
  CourseThemeColor,
  SectionItem,
  ResourceItem,
  ContentItem,
} from './types';
import {
  db,
  testConnection,
  seedInitialPlatformData,
  DEFAULT_SETTINGS,
  OperationType,
  reportFirestoreListenerError,
  subscribeQuotaExceeded,
  FIRESTORE_PRICING_URL,
  FIRESTORE_UPGRADE_URL,
} from './firebase';
import {
  loadCachedCourses,
  loadCachedSections,
  loadCachedResources,
  loadCachedContentItems,
  syncCatalogFromFirestore,
  subscribeCatalogUpdated,
} from './utils/firestoreCache';
import { doc, onSnapshot, updateDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { AuthView } from './components/AuthView';
import { CoursesPortal } from './components/CoursesPortal';
import { StudentHome } from './components/StudentHome';
import { AdminPanel } from './components/AdminPanel';
import { AdminPasswordModal } from './components/AdminPasswordModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AlertTriangle, X } from 'lucide-react';

const STUDENT_SESSION_KEY = 'raad_student_auth_session';
const THEME_STORAGE_KEY = 'raad_platform_theme_dark';
const CACHED_SETTINGS_KEY = 'raad_cached_system_settings';
const COURSE_THEME_STORAGE_KEY = 'raad_student_course_theme_color';
const VALID_THEME_COLORS: CourseThemeColor[] = ['default', 'red', 'green', 'blue', 'purple', 'pink', 'orange', 'black'];

function normalizeThemeColor(value: unknown): CourseThemeColor | null {
  if (value === 'white') return 'orange';
  if (typeof value === 'string' && VALID_THEME_COLORS.includes(value as CourseThemeColor)) {
    return value as CourseThemeColor;
  }
  return null;
}

function getPerUserThemeStorageKey(userId: string): string {
  return `raad_student_course_theme_${userId}`;
}

function getSavedThemeForUser(userId?: string | null): CourseThemeColor | null {
  if (!userId) return null;
  try {
    const saved = localStorage.getItem(getPerUserThemeStorageKey(userId));
    return normalizeThemeColor(saved);
  } catch (e) {}
  return null;
}

function saveThemeForUser(userId: string | null | undefined, color: CourseThemeColor): void {
  try {
    localStorage.setItem(COURSE_THEME_STORAGE_KEY, color);
    if (userId) {
      localStorage.setItem(getPerUserThemeStorageKey(userId), color);
    }
  } catch (e) {}
}

// Parse Telegram callback parameters from current URL (e.g. /?id=... or /telegram/callback?id=...)
function parseTelegramAuthFromUrl(): StudentUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) {
      const firstName = params.get('first_name') || '';
      const lastName = params.get('last_name') || '';
      const username = params.get('username') || '';
      const photoUrl = params.get('photo_url') || '';
      const fullName = [firstName, lastName].filter(Boolean).join(' ') || username || `طالب_${id}`;
      const telegramIdStr = String(id);

      const student: StudentUser = {
        id: `tg_${telegramIdStr}`,
        name: fullName,
        email: username ? `${username.toLowerCase()}@telegram.user` : `tg_${telegramIdStr}@raad.platform`,
        password: `auto_tg_${telegramIdStr}`,
        telegramId: telegramIdStr,
        telegramUsername: username,
        photoUrl: photoUrl,
        daysAllowed: 365,
        isUnlimited: true,
        subscriptionStartDate: new Date().toISOString(),
        subscriptionEndDate: '',
        isIndividuallyBlocked: false,
        isIndividuallyWhitelisted: true,
        watchedVideoIds: [],
        totalExamsTaken: 0,
        averageScore: 0,
        enrolledCourseIds: ['course_default_1'],
        preferredThemeColor: 'default',
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };

      // Clean query params from URL address bar without reloading
      const cleanPath = window.location.pathname.replace(/\/callback|\/telegram\/callback/, '') || '/';
      window.history.replaceState({}, document.title, cleanPath);

      // Persist in localStorage
      try {
        localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(student));
        localStorage.setItem('raad_student_session', JSON.stringify(student));
      } catch (e) {}

      return student;
    }
  } catch (err) {
    console.warn('Error parsing telegram params from URL:', err);
  }
  return null;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<StudentUser | null>(() => {
    // 1. Direct Telegram Login URL Callback check
    const fromUrl = parseTelegramAuthFromUrl();
    if (fromUrl) return fromUrl;

    // 2. Saved session in localStorage
    try {
      const saved = localStorage.getItem(STUDENT_SESSION_KEY) || localStorage.getItem('raad_student_session');
      if (saved) {
        return JSON.parse(saved) as StudentUser;
      }
    } catch (e) {
      console.error('Failed to parse saved student session:', e);
    }
    return null;
  });

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme !== null) {
        return savedTheme === 'true';
      }
    } catch (e) {}
    return true;
  });

  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [isAdminPasswordModalOpen, setIsAdminPasswordModalOpen] = useState<boolean>(false);

  // Initialize systemSettings from cached localStorage immediately for instant logo & branding rendering
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(() => {
    try {
      const cached = localStorage.getItem(CACHED_SETTINGS_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.logoUrl) {
          const img = new Image();
          img.src = parsed.logoUrl;
        }
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (e) {}
    return DEFAULT_SETTINGS;
  });

  // Initialize courses from cached localStorage immediately so updated courses & covers show in 0ms with no stale flash
  const [courses, setCourses] = useState<CourseItem[]>(() => {
    const cached = loadCachedCourses();
    cached.forEach((c: CourseItem) => {
      if (c.imageUrl) {
        const img = new Image();
        img.src = c.imageUrl;
      }
    });
    return cached;
  });

  // Preloaded sections, resources & content items so entering any course is instantaneous (0ms)
  const [sections, setSections] = useState<SectionItem[]>(() => loadCachedSections());
  const [resources, setResources] = useState<ResourceItem[]>(() => loadCachedResources());
  const [contentItems, setContentItems] = useState<ContentItem[]>(() => loadCachedContentItems());

  const [activeCourse, setActiveCourse] = useState<CourseItem | null>(null);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState<boolean>(false);
  const [isQuotaBannerDismissed, setIsQuotaBannerDismissed] = useState<boolean>(false);
  const pendingThemeRef = useRef<{ userId: string; color: CourseThemeColor } | null>(null);

  useEffect(() => {
    return subscribeQuotaExceeded((exceeded) => {
      if (exceeded) {
        setIsQuotaExceeded(true);
      }
    });
  }, []);

  // Initialize and test connection on mount
  useEffect(() => {
    (async () => {
      const connected = await testConnection();
      if (connected) {
        await seedInitialPlatformData();
      }
    })();

    // Listen to real-time global settings & theme
    const unsub = onSnapshot(
      doc(db, 'system_settings', 'global'),
      (docSnap) => {
        if (docSnap.exists()) {
          const fetched = docSnap.data() as Partial<SystemSettings>;
          const mergedFeatures: FeaturesConfig = {
            telegramMainGroupUrl: fetched.features?.telegramMainGroupUrl || DEFAULT_SETTINGS.features?.telegramMainGroupUrl || 'https://t.me/raad_qiyas_main',
            telegramDiscussionGroupUrl: fetched.features?.telegramDiscussionGroupUrl || DEFAULT_SETTINGS.features?.telegramDiscussionGroupUrl || 'https://t.me/raad_qiyas_discussion',
            isDiagnosticEnabled: fetched.features?.isDiagnosticEnabled ?? true,
            isFriendsChallengeEnabled: fetched.features?.isFriendsChallengeEnabled ?? true,
          };
          const mergedIntroLesson: IntroLessonConfig = {
            isActive: fetched.introLesson?.isActive ?? true,
            title: fetched.introLesson?.title || DEFAULT_SETTINGS.introLesson?.title || 'الحصة التعريفية لشرح المنصة وطريقة الاستفادة منها',
            videoUrl: fetched.introLesson?.videoUrl || DEFAULT_SETTINGS.introLesson?.videoUrl || '',
            description: fetched.introLesson?.description || DEFAULT_SETTINGS.introLesson?.description,
          };
          const updated = {
            ...DEFAULT_SETTINGS,
            ...fetched,
            features: mergedFeatures,
            introLesson: mergedIntroLesson,
          };
          setSystemSettings(updated);
          try {
            localStorage.setItem(CACHED_SETTINGS_KEY, JSON.stringify(updated));
          } catch (e) {}
          if (updated.logoUrl) {
            const img = new Image();
            img.src = updated.logoUrl;
          }
        }
      },
      (error) => {
        reportFirestoreListenerError(error, OperationType.GET, 'system_settings/global');
      }
    );

    return () => {
      unsub();
    };
  }, []);

  // Smart cached sync for courses, sections, resources & content_items:
  // Only reads Firestore when user is logged in AND cache is empty, expired, or admin updated catalogUpdatedAt
  useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;

    syncCatalogFromFirestore({
      remoteVersion: systemSettings.catalogUpdatedAt,
      includeContent: true,
    }).then((snapshot) => {
      if (cancelled) return;
      setCourses(snapshot.courses);
      setSections(snapshot.sections);
      setResources(snapshot.resources);
      setContentItems(snapshot.contentItems);

      snapshot.courses.forEach((c) => {
        if (c.imageUrl) {
          const img = new Image();
          img.src = c.imageUrl;
        }
      });

      setActiveCourse((prev) => {
        if (!prev) return prev;
        const fresh = snapshot.courses.find((c) => c.id === prev.id);
        return fresh || null;
      });
    });

    const unsubLocalCatalog = subscribeCatalogUpdated((snapshot) => {
      if (cancelled) return;
      setCourses(snapshot.courses);
      setSections(snapshot.sections);
      setResources(snapshot.resources);
      setContentItems(snapshot.contentItems);
      setActiveCourse((prev) => {
        if (!prev) return prev;
        return snapshot.courses.find((c) => c.id === prev.id) || null;
      });
    });

    return () => {
      cancelled = true;
      unsubLocalCatalog();
    };
  }, [currentUser?.id, systemSettings.catalogUpdatedAt]);

  // Sync platform logo to browser favicon and shortcuts across all browsers
  useEffect(() => {
    const logoToUse = systemSettings.logoUrl || '/favicon.svg';
    try {
      if (systemSettings.logoUrl) {
        localStorage.setItem('raad_platform_logo_url', systemSettings.logoUrl);
      }
      const iconLinks = document.querySelectorAll<HTMLLinkElement>("link[rel*='icon'], link[rel*='apple-touch-icon']");
      iconLinks.forEach((link) => {
        link.href = logoToUse;
      });
    } catch (e) {}
  }, [systemSettings.logoUrl]);

  // Sync current user document & preload course contents in real-time when logged in
  useEffect(() => {
    if (!currentUser?.id) return;
    const uid = currentUser.id;

    const unsubUser = onSnapshot(
      doc(db, 'users', uid),
      (docSnap) => {
        if (!docSnap.exists() || (docSnap.data() as any)?.isDeleted) {
          // Account was deleted by admin (normal or permanent delete) -> Log out immediately so the platform is closed in real-time!
          setCurrentUser(null);
          try {
            localStorage.removeItem(STUDENT_SESSION_KEY);
          } catch (e) {}
          return;
        }

        const rawRemote = docSnap.data() as Partial<StudentUser>;
        const updated = { id: docSnap.id, ...rawRemote } as StudentUser;
        const savedLocal = getSavedThemeForUser(uid);
        const remoteColor = normalizeThemeColor(updated.preferredThemeColor);
        const pending = pendingThemeRef.current;

        let resolvedColor: CourseThemeColor;
        if (pending && pending.userId === uid) {
          resolvedColor = pending.color;
          if (remoteColor === pending.color) {
            pendingThemeRef.current = null;
          }
        } else if (savedLocal) {
          // Local explicit student preference always persists until the student changes it themselves
          resolvedColor = savedLocal;
        } else if (remoteColor) {
          resolvedColor = remoteColor;
          saveThemeForUser(uid, remoteColor);
        } else {
          resolvedColor = 'default';
        }

        const mergedUser: StudentUser = {
          ...updated,
          preferredThemeColor: resolvedColor,
        };

        setCurrentUser(mergedUser);
        setCourseThemeColor(resolvedColor);
        try {
          localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(mergedUser));
        } catch (e) {}
      },
      (error) => {
        reportFirestoreListenerError(error, OperationType.GET, `users/${uid}`);
      }
    );

    return () => {
      unsubUser();
    };
  }, [currentUser?.id]);

  // Sync dark / light theme to document HTML element & localStorage
  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, String(isDarkMode));
    } catch (e) {}

    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => !prev);
  };

  const handleSecretTriggerAdmin = () => {
    setIsAdminPasswordModalOpen(true);
  };

  const handleAdminSuccess = () => {
    setIsAdminPasswordModalOpen(false);
    setIsAdminOpen(true);
  };

  // Student explicit logout: clear session ONLY; preserve per-user preferred theme color permanently
  const handleStudentLogout = () => {
    try {
      localStorage.removeItem(STUDENT_SESSION_KEY);
      localStorage.removeItem(COURSE_THEME_STORAGE_KEY);
    } catch (e) {}
    pendingThemeRef.current = null;
    setCourseThemeColor('default');
    setCurrentUser(null);
    setActiveCourse(null);
  };

  // Student login success: restore saved theme color permanently & enter Courses Portal
  const handleStudentLoginSuccess = (user: StudentUser) => {
    const savedLocal = getSavedThemeForUser(user.id);
    const remoteColor = normalizeThemeColor(user.preferredThemeColor);
    const resolvedColor: CourseThemeColor = savedLocal || remoteColor || 'default';

    const syncedUser: StudentUser = {
      ...user,
      preferredThemeColor: resolvedColor,
    };

    try {
      localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(syncedUser));
    } catch (e) {}
    saveThemeForUser(user.id, resolvedColor);

    if (resolvedColor === 'black') {
      setIsDarkMode(true);
    }

    setCurrentUser(syncedUser);
    setActiveCourse(null);
    setCourseThemeColor(resolvedColor);

    // If local saved color differs from user doc, quietly sync back to Firestore
    if (savedLocal && remoteColor !== savedLocal) {
      setDoc(doc(db, 'users', user.id), { preferredThemeColor: savedLocal }, { merge: true }).catch(() => {});
    }
  };

  // Course activation handler
  const handleActivateCourse = async (courseId: string) => {
    if (!currentUser) return;
    const currentEnrolled = currentUser.enrolledCourseIds || [];
    if (!currentEnrolled.includes(courseId)) {
      try {
        const userRef = doc(db, 'users', currentUser.id);
        await updateDoc(userRef, {
          enrolledCourseIds: arrayUnion(courseId)
        });
      } catch (err) {
        console.error('Error updating enrolled courses in Firestore:', err);
      }

      const updatedUser: StudentUser = {
        ...currentUser,
        enrolledCourseIds: [...currentEnrolled, courseId]
      };
      setCurrentUser(updatedUser);
      try {
        localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(updatedUser));
      } catch (e) {}
    }

    const targetCourse = courses.find((c) => c.id === courseId);
    if (targetCourse) {
      setActiveCourse(targetCourse);
    }
  };

  const [courseThemeColor, setCourseThemeColor] = useState<CourseThemeColor>(() => {
    const savedForUser = getSavedThemeForUser(currentUser?.id);
    if (savedForUser) return savedForUser;
    const normalizedUserColor = normalizeThemeColor(currentUser?.preferredThemeColor);
    if (normalizedUserColor) {
      return normalizedUserColor;
    }
    try {
      const saved = localStorage.getItem(COURSE_THEME_STORAGE_KEY);
      const normalizedSaved = normalizeThemeColor(saved);
      if (normalizedSaved) {
        return normalizedSaved;
      }
    } catch (e) {}
    return 'default';
  });

  // Sync preferredThemeColor if user changes, never discarding saved per-user preference
  useEffect(() => {
    if (currentUser?.id) {
      const savedLocal = getSavedThemeForUser(currentUser.id);
      const userColor: CourseThemeColor = savedLocal
        || normalizeThemeColor(currentUser.preferredThemeColor)
        || 'default';
      setCourseThemeColor(userColor);
      saveThemeForUser(currentUser.id, userColor);
    } else {
      setCourseThemeColor('default');
    }
  }, [currentUser?.id]);

  // Apply pure-black mode globally when student's active theme is 'black'
  useEffect(() => {
    const isAllBlack = Boolean(currentUser && !isAdminOpen && courseThemeColor === 'black');
    document.documentElement.classList.toggle('theme-black', isAllBlack);
  }, [currentUser, isAdminOpen, courseThemeColor]);

  const handleSelectCourseThemeColor = async (color: CourseThemeColor) => {
    setCourseThemeColor(color);
    saveThemeForUser(currentUser?.id, color);

    if (color === 'black') {
      setIsDarkMode(true);
    }

    if (currentUser?.id) {
      pendingThemeRef.current = { userId: currentUser.id, color };
      setCurrentUser((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, preferredThemeColor: color };
        try {
          localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
      try {
        const userRef = doc(db, 'users', currentUser.id);
        await setDoc(userRef, { preferredThemeColor: color }, { merge: true });
      } catch (err) {
        console.warn('Failed to update preferredThemeColor in Firestore:', err);
      }
    }
  };

  const handleSelectCourse = (course: CourseItem) => {
    setActiveCourse(course);
  };

  // Set up global Telegram widget handlers so Telegram login works anywhere instantly
  useEffect(() => {
    (window as any).onTelegramAuth = (tgUser: any) => {
      if (!tgUser || !tgUser.id) return;
      const fullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || tgUser.username || `طالب_${tgUser.id}`;
      const telegramIdStr = String(tgUser.id);
      const studentUser: StudentUser = {
        id: `tg_${telegramIdStr}`,
        name: fullName,
        email: tgUser.username ? `${tgUser.username.toLowerCase()}@telegram.user` : `tg_${telegramIdStr}@raad.platform`,
        password: `auto_tg_${telegramIdStr}`,
        telegramId: telegramIdStr,
        telegramUsername: tgUser.username || '',
        photoUrl: tgUser.photo_url || '',
        daysAllowed: 365,
        isUnlimited: true,
        subscriptionStartDate: new Date().toISOString(),
        subscriptionEndDate: '',
        isIndividuallyBlocked: false,
        isIndividuallyWhitelisted: true,
        watchedVideoIds: [],
        totalExamsTaken: 0,
        averageScore: 0,
        enrolledCourseIds: ['course_default_1'],
        preferredThemeColor: 'default',
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };
      handleStudentLoginSuccess(studentUser);
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'TELEGRAM_AUTH_SUCCESS' && event.data.user) {
        handleStudentLoginSuccess(event.data.user);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className={isDarkMode ? 'dark min-h-screen bg-slate-950 text-white w-full max-w-full overflow-x-hidden' : 'light min-h-screen bg-white text-slate-900 w-full max-w-full overflow-x-hidden'} dir="rtl">
      {isQuotaExceeded && !isQuotaBannerDismissed && (
        <div className="sticky top-0 z-[9999] bg-amber-500/95 text-slate-950 px-4 py-2.5 shadow-lg border-b border-amber-600">
          <div className="max-w-6xl mx-auto flex items-start sm:items-center justify-between gap-3 text-xs sm:text-sm font-bold">
            <div className="flex items-start sm:items-center gap-2.5 flex-wrap">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0 text-slate-950" />
              <span>
                تم تجاوز الحد اليومي المجاني لقراءات قاعدة البيانات (Firestore Free Daily Read Quota) — يتم العمل الآن من النسخة المحفوظة مؤقتاً، وسيتم إعادة تعيين الحصة تلقائياً في اليوم التالي.
              </span>
              <div className="flex items-center gap-3 underline font-black">
                <a href={FIRESTORE_UPGRADE_URL} target="_blank" rel="noopener noreferrer" className="hover:opacity-80">
                  ترقية قاعدة البيانات
                </a>
                <a href={FIRESTORE_PRICING_URL} target="_blank" rel="noopener noreferrer" className="hover:opacity-80">
                  تفاصيل باقة Spark
                </a>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsQuotaBannerDismissed(true)}
              className="p-1 rounded-lg hover:bg-black/10 transition shrink-0"
              aria-label="إغلاق التنبيه"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {/* If Admin Panel is open */}
      {isAdminOpen ? (
        <AdminPanel
          systemSettings={systemSettings}
          onExit={() => setIsAdminOpen(false)}
        />
      ) : currentUser ? (
        !activeCourse ? (
          /* Student Courses Portal (واجهة الكورسات) */
          <ErrorBoundary fallbackTitle="واجهة الكورسات">
            <CoursesPortal
              currentUser={currentUser}
              courses={courses}
              systemSettings={systemSettings}
              isDarkMode={isDarkMode}
              toggleDarkMode={toggleDarkMode}
              onLogout={handleStudentLogout}
              onSecretTriggerAdmin={handleSecretTriggerAdmin}
              onActivateCourse={handleActivateCourse}
              onSelectCourse={handleSelectCourse}
              currentThemeColor={courseThemeColor}
              onSelectThemeColor={handleSelectCourseThemeColor}
            />
          </ErrorBoundary>
        ) : (
          /* Student Main Course Platform */
          <ErrorBoundary fallbackTitle="تنبيه في المنصة">
            <StudentHome
              currentUser={currentUser}
              onLogout={handleStudentLogout}
              systemSettings={systemSettings}
              isDarkMode={isDarkMode}
              toggleDarkMode={toggleDarkMode}
              onSecretTriggerAdmin={handleSecretTriggerAdmin}
              activeCourse={activeCourse}
              onBackToCourses={() => setActiveCourse(null)}
              currentThemeColor={courseThemeColor}
              onSelectThemeColor={handleSelectCourseThemeColor}
              preloadedSections={sections}
              preloadedResources={resources}
              preloadedContentItems={contentItems}
            />
          </ErrorBoundary>
        )
      ) : (
        /* If not logged in: Login and Sign Up View */
        <AuthView
          onSuccessAuth={handleStudentLoginSuccess}
          isDarkMode={isDarkMode}
          toggleDarkMode={toggleDarkMode}
          systemSettings={systemSettings}
          onSecretTriggerAdmin={handleSecretTriggerAdmin}
        />
      )}

      {/* Secret 7-Clicks Admin Password Modal */}
      <AdminPasswordModal
        isOpen={isAdminPasswordModalOpen}
        onClose={() => setIsAdminPasswordModalOpen(false)}
        onSuccess={handleAdminSuccess}
      />
    </div>
  );
}
