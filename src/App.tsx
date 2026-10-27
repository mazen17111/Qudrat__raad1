import React, { useState, useEffect } from 'react';
import { StudentUser, SystemSettings, FeaturesConfig, IntroLessonConfig, CourseItem } from './types';
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

export default function App() {
  const [currentUser, setCurrentUser] = useState<StudentUser | null>(() => {
    try {
      const saved = localStorage.getItem(STUDENT_SESSION_KEY);
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
    } catch (e) {}
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

  const handleSelectCourse = (course: CourseItem) => {
    setActiveCourse(course);
  };

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
          />
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
