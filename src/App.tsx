import React, { useState, useEffect } from 'react';
import { StudentUser, SystemSettings } from './types';
import { db, testConnection, seedInitialPlatformData, DEFAULT_SETTINGS } from './firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { AuthView } from './components/AuthView';
import { StudentHome } from './components/StudentHome';
import { AdminPanel } from './components/AdminPanel';
import { AdminPasswordModal } from './components/AdminPasswordModal';

const STUDENT_SESSION_KEY = 'raad_student_auth_session';
const THEME_STORAGE_KEY = 'raad_platform_theme_dark';

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
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);

  // Initialize and test connection on mount
  useEffect(() => {
    testConnection();
    seedInitialPlatformData();

    // Listen to real-time global settings & theme
    const unsub = onSnapshot(doc(db, 'system_settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        setSystemSettings(docSnap.data() as SystemSettings);
      }
    });

    return () => unsub();
  }, []);

  // Sync current user document in real-time when logged in
  useEffect(() => {
    if (!currentUser?.id) return;

    const unsubUser = onSnapshot(doc(db, 'users', currentUser.id), (docSnap) => {
      if (docSnap.exists()) {
        const updated = { id: docSnap.id, ...docSnap.data() } as StudentUser;
        setCurrentUser(updated);
        try {
          localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(updated));
        } catch (e) {}
      } else {
        // User was deleted by admin
        try {
          localStorage.removeItem(STUDENT_SESSION_KEY);
        } catch (e) {}
        setCurrentUser(null);
      }
    });

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
  };

  // Student login success: save to state & localStorage
  const handleStudentLoginSuccess = (user: StudentUser) => {
    try {
      localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(user));
    } catch (e) {}
    setCurrentUser(user);
  };

  return (
    <div className={isDarkMode ? 'dark min-h-screen bg-slate-950 text-white' : 'light min-h-screen bg-white text-slate-900'} dir="rtl">
      {/* If Admin Panel is open */}
      {isAdminOpen ? (
        <AdminPanel
          systemSettings={systemSettings}
          onExit={() => setIsAdminOpen(false)}
        />
      ) : currentUser ? (
        /* If logged in: Student Main Interface */
        <StudentHome
          currentUser={currentUser}
          onLogout={handleStudentLogout}
          systemSettings={systemSettings}
          isDarkMode={isDarkMode}
          toggleDarkMode={toggleDarkMode}
          onSecretTriggerAdmin={handleSecretTriggerAdmin}
        />
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
