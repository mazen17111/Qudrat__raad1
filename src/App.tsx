import React, { useState, useEffect } from 'react';
import { StudentUser, SystemSettings, FeaturesConfig, IntroLessonConfig, CourseItem, CourseThemeColor } from './types';
import { db, testConnection, seedInitialPlatformData, DEFAULT_SETTINGS, INITIAL_COURSES, restoreDefaultCoursesAndContent } from './firebase';
import { doc, onSnapshot, collection, updateDoc, arrayUnion } from 'firebase/firestore';
import { AuthView } from './components/AuthView';
import { CoursesPortal } from './components/CoursesPortal';
import { StudentHome } from './components/StudentHome';
import { AdminPanel } from './components/AdminPanel';
import { AdminPasswordModal } from './components/AdminPasswordModal';
import { ErrorBoundary } from './components/ErrorBoundary';

const STUDENT_SESSION_KEY = 'raad_student_auth_session';
const THEME_STORAGE_KEY = 'raad_platform_theme_dark';
const CACHED_SETTINGS_KEY = 'raad_cached_system_settings';
const CACHED_COURSES_KEY = 'raad_cached_courses';
const COURSE_THEME_STORAGE_KEY = 'raad_student_course_theme_color';

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
    try {
      const saved = localStorage.getItem(CACHED_COURSES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // If cached courses contains deleted dummy courses (e.g. course_default_2), discard immediately
          if (parsed.some((c: CourseItem) => c.id === 'course_default_2')) {
            try { localStorage.removeItem(CACHED_COURSES_KEY); } catch (e) {}
            return INITIAL_COURSES;
          }
          parsed.forEach((c: CourseItem) => {
            if (c.imageUrl) {
              const img = new Image();
              img.src = c.imageUrl;
            }
          });
          return parsed;
        }
      }
    } catch (e) {}
    return INITIAL_COURSES;
  });

  const [activeCourse, setActiveCourse] = useState<CourseItem | null>(null);

  // Initialize and test connection on mount
  useEffect(() => {
    testConnection();
    seedInitialPlatformData();

    // Listen to real-time global settings & theme
    const unsub = onSnapshot(doc(db, 'system_settings', 'global'), (docSnap) => {
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
    });

    // Listen to real-time courses collection (NEVER resurrect deleted courses automatically)
    const unsubCourses = onSnapshot(collection(db, 'courses'), (snap) => {
      const list: CourseItem[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as CourseItem));
      list.sort((a, b) => (a.order || 0) - (b.order || 0));
      setCourses(list);
      try {
        localStorage.setItem(CACHED_COURSES_KEY, JSON.stringify(list));
      } catch (e) {}

      // Preload current course images for 0-latency display
      list.forEach((c) => {
        if (c.imageUrl) {
          const img = new Image();
          img.src = c.imageUrl;
        }
      });

      setActiveCourse((prev) => {
        if (!prev) return prev;
        const fresh = list.find((c) => c.id === prev.id);
        return fresh || null;
      });
    });

    return () => {
      unsub();
      unsubCourses();
    };
  }, []);

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

  // Sync current user document in real-time when logged in
  useEffect(() => {
    if (!currentUser?.id) return;

    const unsubUser = onSnapshot(
      doc(db, 'users', currentUser.id),
      (docSnap) => {
        if (!docSnap.exists() || (docSnap.data() as any)?.isDeleted) {
          // Account was deleted by admin (normal or permanent delete) -> Log out immediately so the platform is closed in real-time!
          setCurrentUser(null);
          try {
            localStorage.removeItem(STUDENT_SESSION_KEY);
          } catch (e) {}
          return;
        }

        const updated = { id: docSnap.id, ...docSnap.data() } as StudentUser;
        setCurrentUser(updated);
        try {
          localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(updated));
        } catch (e) {}
      },
      (error) => {
        console.warn('Realtime user sync notice:', error);
      }
    );

    return () => unsubUser();
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

  // Student explicit logout: only when the student clicks logout does the session clear!
  const handleStudentLogout = () => {
    try {
      localStorage.removeItem(STUDENT_SESSION_KEY);
      localStorage.removeItem(COURSE_THEME_STORAGE_KEY);
    } catch (e) {}
    setCourseThemeColor('default');
    setCurrentUser(null);
    setActiveCourse(null);
  };

  // Student login success: save to state & localStorage
  const handleStudentLoginSuccess = (user: StudentUser) => {
    try {
      localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(user));
    } catch (e) {}
    setCurrentUser(user);
    // Student always starts on the Courses Portal per request
    setActiveCourse(null);

    // Ensure every new account starts with 'default', or loads their own saved choice
    const userColor = (user.preferredThemeColor && ['default', 'red', 'green', 'blue', 'purple', 'pink'].includes(user.preferredThemeColor))
      ? user.preferredThemeColor
      : 'default';
    setCourseThemeColor(userColor);
    try {
      localStorage.setItem(COURSE_THEME_STORAGE_KEY, userColor);
    } catch (e) {}
  };

  // Course activation handler
  const handleActivateCourse = async (courseId: string) => {
    if (!currentUser) return;
    try {
      const userRef = doc(db, 'users', currentUser.id);
      await updateDoc(userRef, {
        enrolledCourseIds: arrayUnion(courseId)
      });
    } catch (err) {
      console.error('Error updating enrolled courses in Firestore:', err);
    }

    const currentEnrolled = currentUser.enrolledCourseIds || [];
    if (!currentEnrolled.includes(courseId)) {
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
    if (currentUser?.preferredThemeColor && ['default', 'red', 'green', 'blue', 'purple', 'pink'].includes(currentUser.preferredThemeColor)) {
      return currentUser.preferredThemeColor as CourseThemeColor;
    }
    try {
      const saved = localStorage.getItem(COURSE_THEME_STORAGE_KEY);
      if (saved && ['default', 'red', 'green', 'blue', 'purple', 'pink'].includes(saved)) {
        return saved as CourseThemeColor;
      }
    } catch (e) {}
    return 'default';
  });

  // Sync preferredThemeColor if updated in user document or on user change
  useEffect(() => {
    if (currentUser) {
      const userColor = (currentUser.preferredThemeColor && ['default', 'red', 'green', 'blue', 'purple', 'pink'].includes(currentUser.preferredThemeColor))
        ? currentUser.preferredThemeColor
        : 'default';
      setCourseThemeColor(userColor);
      try {
        localStorage.setItem(COURSE_THEME_STORAGE_KEY, userColor);
      } catch (e) {}
    } else {
      setCourseThemeColor('default');
    }
  }, [currentUser?.id, currentUser?.preferredThemeColor]);

  const handleSelectCourseThemeColor = async (color: CourseThemeColor) => {
    setCourseThemeColor(color);
    try {
      localStorage.setItem(COURSE_THEME_STORAGE_KEY, color);
    } catch (e) {}

    if (currentUser?.id) {
      try {
        const userRef = doc(db, 'users', currentUser.id);
        await updateDoc(userRef, { preferredThemeColor: color });
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
