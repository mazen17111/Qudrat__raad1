import React, { useState, useEffect } from 'react';
import { StudentUser, SystemSettings } from './types';
import { db, testConnection, seedInitialPlatformData, DEFAULT_SETTINGS } from './firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { AuthView } from './components/AuthView';
import { StudentHome } from './components/StudentHome';
import { AdminPanel } from './components/AdminPanel';
import { AdminPasswordModal } from './components/AdminPasswordModal';

export default function App() {
  const [currentUser, setCurrentUser] = useState<StudentUser | null>(null);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
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
        setCurrentUser({ id: docSnap.id, ...docSnap.data() } as StudentUser);
      } else {
        // User was deleted by admin
        setCurrentUser(null);
      }
    });

    return () => unsubUser();
  }, [currentUser?.id]);

  // Sync dark / light theme to document HTML element
  useEffect(() => {
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
          onLogout={() => setCurrentUser(null)}
          systemSettings={systemSettings}
          isDarkMode={isDarkMode}
          toggleDarkMode={toggleDarkMode}
          onSecretTriggerAdmin={handleSecretTriggerAdmin}
        />
      ) : (
        /* If not logged in: Login and Sign Up View */
        <AuthView
          onSuccessAuth={(user) => setCurrentUser(user)}
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
