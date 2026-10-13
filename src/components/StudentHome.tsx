import React, { useState, useEffect } from 'react';
import {
  Play,
  PlayCircle,
  Award,
  FileText,
  Folder,
  BarChart3,
  Moon,
  Sun,
  LogOut,
  Clock,
  Sparkles,
  Tv,
  Bell,
  CheckCircle,
  ExternalLink,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Flame,
  AlertTriangle,
  Zap,
  Lock,
  Layers,
  HelpCircle,
  Download,
  Wrench,
  MessageCircle,
  Calendar,
  Infinity as InfinityIcon,
  Send,
  Target,
  X,
  Video,
} from 'lucide-react';
import {
  StudentUser,
  SystemSettings,
  SectionItem,
  ResourceItem,
  ContentItem,
  ExamQuestion,
  FolderItem
} from '../types';
import { db } from '../firebase';
import {
  collection,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  query,
  where
} from 'firebase/firestore';
import { StatsModal } from './StatsModal';
import { FoldersModal } from './FoldersModal';
import { ExamRunner } from './ExamRunner';

interface StudentHomeProps {
  currentUser: StudentUser;
  onLogout: () => void;
  systemSettings: SystemSettings;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  onSecretTriggerAdmin: () => void;
}

interface SupervisorContactButtonsProps {
  settings: SystemSettings;
  studentName: string;
  contextText: string;
}

const SupervisorContactButtons: React.FC<SupervisorContactButtonsProps> = ({
  settings,
  studentName,
  contextText,
}) => {
  const rawWhatsapp = settings.whatsappNumber || '966500000000';
  const cleanWhatsapp = rawWhatsapp.replace(/[^0-9]/g, '') || '966500000000';
  const rawTelegram = settings.telegramUsername || '@raad_aksam';
  const cleanTelegram = rawTelegram.replace(/^@/, '').trim() || 'raad_aksam';

  const whatsappMsg = `السلام عليكم، أتواصل معك بخصوص منصة أقسام رعد (${contextText}) - الطالب: ${studentName}`;
  const whatsappUrl = `https://wa.me/${cleanWhatsapp}?text=${encodeURIComponent(whatsappMsg)}`;
  const telegramUrl = `https://t.me/${cleanTelegram}`;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-md mx-auto pt-3">
      {/* WhatsApp Button */}
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs md:text-sm shadow-xl shadow-emerald-600/30 transition transform hover:scale-[1.02]"
      >
        <MessageCircle className="w-5 h-5 fill-current shrink-0" />
        <span>تواصل واتساب ({rawWhatsapp})</span>
      </a>

      {/* Telegram Button */}
      <a
        href={telegramUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white font-black text-xs md:text-sm shadow-xl shadow-sky-600/30 transition transform hover:scale-[1.02]"
      >
        <Send className="w-4 h-4 shrink-0" />
        <span>تواصل تليجرام ({rawTelegram.startsWith('@') ? rawTelegram : `@${rawTelegram}`})</span>
      </a>
    </div>
  );
};

export const StudentHome: React.FC<StudentHomeProps> = ({
  currentUser,
  onLogout,
  systemSettings,
  isDarkMode,
  toggleDarkMode,
  onSecretTriggerAdmin,
}) => {
  // Navigation & Modals
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showFoldersModal, setShowFoldersModal] = useState(false);

  // Active exam state
  const [activeExam, setActiveExam] = useState<{
    id: string;
    title: string;
    questions: ExamQuestion[];
    isTimed: boolean;
    durationMinutes?: number;
    targetPercentage?: number;
  } | null>(null);

  // Timed prompt modal for standard exam click
  const [examToStart, setExamToStart] = useState<ContentItem | null>(null);

  // Educational Data
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);

  // Selection State
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [selectedResourceId, setSelectedResourceId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'videos' | 'exams' | 'files'>('videos');
  const [activeVideo, setActiveVideo] = useState<ContentItem | null>(null);

  // Secret 7 clicks tracker on footer center sentence
  const [secretClickCount, setSecretClickCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);

  // Real-time listener for sections, resources, items
  useEffect(() => {
    const unsubSections = onSnapshot(collection(db, 'sections'), (snap) => {
      const list: SectionItem[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as SectionItem));
      list.sort((a, b) => (a.order || 0) - (b.order || 0));
      setSections(list);
      if (list.length > 0 && !selectedSectionId) {
        setSelectedSectionId(list[0].id);
      }
    });

    const unsubResources = onSnapshot(collection(db, 'resources'), (snap) => {
      const list: ResourceItem[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as ResourceItem));
      list.sort((a, b) => (a.order || 0) - (b.order || 0));
      setResources(list);
    });

    const unsubItems = onSnapshot(collection(db, 'content_items'), (snap) => {
      const list: ContentItem[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as ContentItem));
      // Sort strictly from oldest to newest (من الأقدم للأحدث)
      list.sort((a, b) => {
        const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (tA !== tB) return tA - tB;
        return (a.id || '').localeCompare(b.id || '');
      });
      setContentItems(list);
    });

    const qFolders = query(collection(db, 'folders'), where('userId', '==', currentUser.id));
    const unsubFolders = onSnapshot(qFolders, (snap) => {
      const list: FolderItem[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as FolderItem));
      setFolders(list);
    });

    return () => {
      unsubSections();
      unsubResources();
      unsubItems();
      unsubFolders();
    };
  }, [currentUser.id]);

  // When selectedSectionId changes, default to first resource if none selected
  useEffect(() => {
    if (!selectedSectionId) return;
    const resList = resources.filter((r) => r.sectionId === selectedSectionId);
    if (resList.length > 0 && (!selectedResourceId || !resList.find((r) => r.id === selectedResourceId))) {
      setSelectedResourceId(resList[0].id);
    }
  }, [selectedSectionId, resources]);

  // When selectedResourceId changes, default to first video (oldest video) if none active or if switching resource
  useEffect(() => {
    if (!selectedResourceId) return;
    const vids = contentItems
      .filter((i) => i.resourceId === selectedResourceId && i.type === 'video')
      .sort((a, b) => {
        const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (tA !== tB) return tA - tB;
        return (a.id || '').localeCompare(b.id || '');
      });
    if (vids.length > 0 && (!activeVideo || !vids.find((v) => v.id === activeVideo.id))) {
      setActiveVideo(vids[0]);
    }
  }, [selectedResourceId, contentItems]);

  // Calculate subscription remaining days and elapsed days (progress starts from 0 and increases each day)
  let daysLeft = 0;
  let totalDays = currentUser.daysAllowed || 0;
  let elapsedDays = 0;
  let progressPercentage = 0;
  let isSubscriptionExpired = false;
  let formattedEndDate = '';

  if (currentUser.subscriptionEndDate) {
    const endMs = new Date(currentUser.subscriptionEndDate).getTime();
    const nowMs = Date.now();
    const diff = endMs - nowMs;
    daysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    if (diff <= 0) {
      isSubscriptionExpired = true;
    }
    elapsedDays = Math.max(0, totalDays - daysLeft);
    progressPercentage = totalDays > 0 ? Math.min(100, Math.round((elapsedDays / totalDays) * 100)) : 0;

    try {
      const endDateObj = new Date(currentUser.subscriptionEndDate);
      formattedEndDate = endDateObj.toLocaleDateString('ar-SA', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (e) {
      formattedEndDate = new Date(currentUser.subscriptionEndDate).toLocaleDateString('ar-SA');
    }
  }

  // Handle secret 7 clicks on center footer sentence
  const handleFooterSentenceClick = () => {
    const now = Date.now();
    if (now - lastClickTime > 2500) {
      setSecretClickCount(1);
    } else {
      const nextCount = secretClickCount + 1;
      setSecretClickCount(nextCount);
      if (nextCount >= 7) {
        setSecretClickCount(0);
        onSecretTriggerAdmin();
      }
    }
    setLastClickTime(now);
  };

  // Play Video
  const handleSelectVideo = (vid: ContentItem) => {
    setActiveVideo(vid);
  };

  // Toggle watch confirmation manually (or cancel progress: "ويمكنه الضغط عليه لالغاء التقدم")
  const handleToggleWatchVideo = async (videoId: string) => {
    const isCurrentlyWatched = currentUser.watchedVideoIds?.includes(videoId);
    try {
      const userRef = doc(db, 'users', currentUser.id);
      if (isCurrentlyWatched) {
        await updateDoc(userRef, {
          watchedVideoIds: arrayRemove(videoId),
        });
      } else {
        await updateDoc(userRef, {
          watchedVideoIds: arrayUnion(videoId),
        });
      }
    } catch (err) {
      console.error('Error toggling watched video status:', err);
    }
  };

  // Automatically activate when video finishes to the end: "اذا تم مشاهدة الفيديو للاخير يتفعل تلقائيا"
  const handleVideoEnded = async (videoId: string) => {
    if (currentUser.watchedVideoIds?.includes(videoId)) return;
    try {
      const userRef = doc(db, 'users', currentUser.id);
      await updateDoc(userRef, {
        watchedVideoIds: arrayUnion(videoId),
      });
    } catch (err) {
      console.error('Error marking video as ended:', err);
    }
  };

  // Start Exam with Timed/Untimed preference
  const confirmStartExam = async (isTimed: boolean) => {
    if (!examToStart) return;
    if (examToStart.isExternal && examToStart.url) {
      window.open(examToStart.url, '_blank');
      setExamToStart(null);
      return;
    }

    let finalQuestions: ExamQuestion[] = Array.isArray(examToStart.questions) ? [...examToStart.questions] : [];

    // If questions array is empty in local state, fetch directly from Firestore to guarantee freshest data
    if (finalQuestions.length === 0) {
      try {
        const snap = await getDoc(doc(db, 'content_items', examToStart.id));
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data.questions) && data.questions.length > 0) {
            finalQuestions = data.questions;
          }
        }
      } catch (err) {
        console.error('Error fetching questions live from Firestore:', err);
      }
    }

    // High-yield practice fallback: if exam is still empty, populate practice questions so student is NEVER blocked!
    if (finalQuestions.length === 0) {
      finalQuestions = [
        {
          id: `q_sample_1`,
          questionText: `سؤال تدريبي: ما ناتج قسمة 120 على 4؟`,
          imageUrl: '',
          options: ['30', '25', '40', '35'],
          correctOptionIndex: 0,
          explanation: '120 ÷ 4 = 30.',
        },
        {
          id: `q_sample_2`,
          questionText: 'سماء : نجوم (تناظر لفظي)',
          imageUrl: '',
          options: ['حديقة : أشجار', 'بحر : سمك', 'غابة : حيوانات', 'مدينة : سيارات'],
          correctOptionIndex: 0,
          explanation: 'العلاقة: مكانية وتكوينية (السماء تزينها النجوم والحديقة تزينها الأشجار).',
        },
        {
          id: `q_sample_3`,
          questionText: 'إذا كان س + ص = 10 و س - ص = 4 ، فما قيمة س؟',
          imageUrl: '',
          options: ['7', '6', '8', '5'],
          correctOptionIndex: 0,
          explanation: 'بجمع المعادلتين: 2س = 14 => س = 7.',
        }
      ];
    }

    setActiveExam({
      id: examToStart.id,
      title: examToStart.title,
      questions: finalQuestions,
      isTimed,
      durationMinutes: examToStart.durationMinutes || 15,
      targetPercentage: examToStart.targetPercentage || 90,
    });
    setExamToStart(null);
  };

  // Start folder exam from FoldersModal
  const handleStartFolderExam = (folderTitle: string, questions: ExamQuestion[], isTimed: boolean) => {
    setActiveExam({
      id: `folder_${Date.now()}`,
      title: `اختبار ${folderTitle}`,
      questions,
      isTimed,
      durationMinutes: Math.max(5, questions.length * 2),
      targetPercentage: 90,
    });
  };

  // ================= 1. CHECK PLATFORM LOCK & SELECTIVE ACCESS =================
  const isWhitelisted = currentUser.isIndividuallyWhitelisted === true;
  const isBlacklisted = currentUser.isIndividuallyBlocked === true;

  // Case A: Platform is Locked globally
  if (systemSettings.isPlatformLocked && !isWhitelisted) {
    const isMaintenance = systemSettings.lockReason === 'maintenance';
    const whatsappNum = systemSettings.whatsappNumber || '966500000000';
    const whatsappUrl = `https://wa.me/${whatsappNum}?text=${encodeURIComponent(`السلام عليكم، أرغب في تفعيل وتجديد اشتراكي في منصة أقسام رعد - الطالب: ${currentUser.name}`)}`;

    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-between p-6 text-center text-white">
        <div className="flex-1 flex flex-col items-center justify-center max-w-lg w-full">
          {isMaintenance ? (
            /* Maintenance with Screwdriver Icon & Card */
            <div className="space-y-6">
              <div className="relative mx-auto w-24 h-24 rounded-3xl bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center text-amber-400 shadow-2xl shadow-amber-500/20 animate-pulse">
                <Wrench className="w-12 h-12" />
                <div className="absolute -top-2 -right-2 text-2xl">🛠️</div>
              </div>
              <h1 className="text-2xl md:text-4xl font-black">يوجد صيانة حالياً بالمنصة</h1>
              <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 text-slate-300 text-sm md:text-base leading-relaxed shadow-xl">
                {systemSettings.maintenanceMessage || systemSettings.lockMessage || 'يوجد صيانة حالياً في المنصة لتطوير السيرفرات وتحديث المحتوى، سنعود قريباً بإذن الله.'}
              </div>

              {/* WhatsApp & Telegram Buttons in Maintenance */}
              <SupervisorContactButtons
                settings={systemSettings}
                studentName={currentUser.name}
                contextText="صيانة بالمنصة"
              />
            </div>
          ) : (
            /* Subscription with WhatsApp & Telegram Icon & Direct Contact */
            <div className="space-y-6">
              <div className="relative mx-auto w-24 h-24 rounded-3xl bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-2xl shadow-emerald-500/20">
                <MessageCircle className="w-12 h-12" />
                <div className="absolute -top-2 -right-2 text-2xl">💬</div>
              </div>
              <h1 className="text-2xl md:text-4xl font-black">تفعيل وانتهاء الاشتراك</h1>
              <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 text-slate-300 text-sm md:text-base leading-relaxed shadow-xl">
                {systemSettings.subscriptionMessage || systemSettings.lockMessage || 'تم قفل المنصة بداعي تفعيل وانتهاء الاشتراك، يرجى التواصل مع المشرف لتجديد وتفعيل الاشتراك.'}
              </div>

              {/* WhatsApp & Telegram Buttons in Subscription Lock */}
              <SupervisorContactButtons
                settings={systemSettings}
                studentName={currentUser.name}
                contextText="تفعيل وانتهاء الاشتراك"
              />
            </div>
          )}

          <div className="pt-8">
            <button
              onClick={onLogout}
              className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs md:text-sm font-bold border border-slate-700 transition"
            >
              تسجيل الخروج
            </button>
          </div>
        </div>

        {/* 3 Footer Sentences (Right, Center, Left) */}
        <footer className="w-full py-4 border-t border-slate-900 select-none">
          <div className="max-w-[1700px] mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-slate-500 font-semibold px-4">
            <div className="text-right w-full md:w-1/3">المصمم مازن محمد محروس</div>
            <div
              onClick={handleFooterSentenceClick}
              className="text-center w-full md:w-1/3 cursor-pointer hover:text-amber-400 transition"
            >
              جميع محتويات المنصة محفوظة لمنصة اقسام رعد
            </div>
            <div className="text-left w-full md:w-1/3 text-amber-500/80">
              منصة اقسام رعد تضمن لك المئوية باذن الله
            </div>
          </div>
        </footer>
      </div>
    );
  }

  // Case B: Platform is Open, but student is individually blocked
  if (!systemSettings.isPlatformLocked && isBlacklisted) {
    const reason = currentUser.blockedReason || 'supervisor';
    const whatsappNum = systemSettings.whatsappNumber || '966500000000';
    const whatsappUrl = `https://wa.me/${whatsappNum}?text=${encodeURIComponent(`السلام عليكم، تم تعليق حسابي في منصة أقسام رعد - الطالب: ${currentUser.name}`)}`;

    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-between p-6 text-center text-white">
        <div className="flex-1 flex flex-col items-center justify-center max-w-lg w-full">
          {reason === 'maintenance' ? (
            <div className="space-y-6">
              <div className="relative mx-auto w-24 h-24 rounded-3xl bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center text-amber-400 shadow-2xl">
                <Wrench className="w-12 h-12" />
                <div className="absolute -top-2 -right-2 text-2xl">🛠️</div>
              </div>
              <h1 className="text-2xl md:text-4xl font-black">يوجد صيانة حالياً بالمنصة</h1>
              <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 text-slate-300 text-sm leading-relaxed">
                {currentUser.blockedCustomMessage || systemSettings.maintenanceMessage || 'يوجد صيانة حالياً في المنصة، سنعود قريباً بإذن الله.'}
              </div>

              {/* WhatsApp & Telegram Buttons */}
              <SupervisorContactButtons
                settings={systemSettings}
                studentName={currentUser.name}
                contextText="صيانة بالمنصة"
              />
            </div>
          ) : reason === 'subscription' ? (
            <div className="space-y-6">
              <div className="relative mx-auto w-24 h-24 rounded-3xl bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-2xl">
                <MessageCircle className="w-12 h-12" />
                <div className="absolute -top-2 -right-2 text-2xl">💬</div>
              </div>
              <h1 className="text-2xl md:text-4xl font-black">تم انتهاء اشتراكك</h1>
              <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 text-slate-300 text-sm leading-relaxed">
                {currentUser.blockedCustomMessage || 'تم انتهاء اشتراكك تواصل مع المشرف لتجديد الاشتراك اذا رغبت'}
              </div>

              {/* WhatsApp & Telegram Buttons */}
              <SupervisorContactButtons
                settings={systemSettings}
                studentName={currentUser.name}
                contextText="تجديد الاشتراك"
              />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="relative mx-auto w-24 h-24 rounded-3xl bg-rose-500/10 border-2 border-rose-500/30 flex items-center justify-center text-rose-400 shadow-2xl">
                <ShieldAlert className="w-12 h-12" />
              </div>
              <h1 className="text-2xl md:text-4xl font-black text-rose-400">قام المشرف بقفل المنصة عليك</h1>
              <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 text-slate-300 text-sm leading-relaxed">
                {currentUser.blockedCustomMessage || 'تم تعليق وصول حسابك للمنصة من قبل الإدارة. يرجى التواصل مع المشرف للاستفسار.'}
              </div>

              {/* WhatsApp & Telegram Buttons */}
              <SupervisorContactButtons
                settings={systemSettings}
                studentName={currentUser.name}
                contextText="استفسار عن قفل المنصة"
              />
            </div>
          )}

          <div className="pt-8">
            <button
              onClick={onLogout}
              className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs md:text-sm font-bold border border-slate-700 transition"
            >
              تسجيل الخروج
            </button>
          </div>
        </div>

        {/* 3 Footer Sentences (Right, Center, Left) */}
        <footer className="w-full py-4 border-t border-slate-900 select-none">
          <div className="max-w-[1700px] mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-slate-500 font-semibold px-4">
            <div className="text-right w-full md:w-1/3">المصمم مازن محمد محروس</div>
            <div
              onClick={handleFooterSentenceClick}
              className="text-center w-full md:w-1/3 cursor-pointer hover:text-amber-400 transition"
            >
              جميع محتويات المنصة محفوظة لمنصة اقسام رعد
            </div>
            <div className="text-left w-full md:w-1/3 text-amber-500/80">
              منصة اقسام رعد تضمن لك المئوية باذن الله
            </div>
          </div>
        </footer>
      </div>
    );
  }

  // ================= 2. CHECK SUBSCRIPTION EXPIRATION =================
  if (isSubscriptionExpired && totalDays > 0 && !currentUser.isUnlimited) {
    const whatsappNum = systemSettings.whatsappNumber || '966500000000';
    const whatsappUrl = `https://wa.me/${whatsappNum}?text=${encodeURIComponent(`السلام عليكم، انتهت مدة اشتراكي في منصة أقسام رعد وأرغب في التجديد - الطالب: ${currentUser.name}`)}`;

    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-between p-6 text-center text-white">
        <div className="flex-1 flex flex-col items-center justify-center max-w-lg w-full space-y-6">
          <div className="p-5 rounded-3xl bg-amber-500/10 border border-amber-500/30 text-amber-400 animate-bounce">
            <Clock className="w-16 h-16" />
          </div>
          <h1 className="text-2xl md:text-4xl font-black">انتهاء مدة الاشتراك</h1>
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 text-slate-200 text-lg font-bold shadow-2xl leading-relaxed">
            تم انتهاء اشتراكك تواصل مع المشرف لتجديد الاشتراك اذا رغبت
          </div>

          {/* WhatsApp & Telegram Supervisor Contact Buttons */}
          <SupervisorContactButtons
            settings={systemSettings}
            studentName={currentUser.name}
            contextText="انتهاء مدة الاشتراك"
          />

          <div>
            <button
              onClick={onLogout}
              className="px-8 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs md:text-sm font-bold transition"
            >
              تسجيل الخروج
            </button>
          </div>
        </div>

        {/* 3 Footer Sentences (Right, Center, Left) */}
        <footer className="w-full py-4 border-t border-slate-900 select-none">
          <div className="max-w-[1700px] mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-slate-500 font-semibold px-4">
            <div className="text-right w-full md:w-1/3">المصمم مازن محمد محروس</div>
            <div
              onClick={handleFooterSentenceClick}
              className="text-center w-full md:w-1/3 cursor-pointer hover:text-amber-400 transition"
            >
              جميع محتويات المنصة محفوظة لمنصة اقسام رعد
            </div>
            <div className="text-left w-full md:w-1/3 text-amber-500/80">
              منصة اقسام رعد تضمن لك المئوية باذن الله
            </div>
          </div>
        </footer>
      </div>
    );
  }

  // ================= 3. ACTIVE INTERACTIVE EXAM MODE =================
  if (activeExam) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'bg-slate-950 text-white' : 'bg-white text-slate-900'}`}>
        <ExamRunner
          examTitle={activeExam.title}
          examId={activeExam.id}
          questions={activeExam.questions}
          currentUser={currentUser}
          defaultFolders={folders}
          isTimedInitial={activeExam.isTimed}
          durationMinutes={activeExam.durationMinutes}
          targetPercentage={activeExam.targetPercentage}
          isDarkMode={isDarkMode}
          onFinishExam={() => {
            // Exam finished and recorded
          }}
          onExit={() => setActiveExam(null)}
        />
      </div>
    );
  }

  const activeTheme = systemSettings.activeTheme;
  const currentSectionResources = resources.filter((r) => r.sectionId === selectedSectionId);
  const currentResourceItems = contentItems
    .filter((i) => i.resourceId === selectedResourceId)
    .sort((a, b) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (tA !== tB) return tA - tB;
      return (a.id || '').localeCompare(b.id || '');
    });

  const resourceVideos = currentResourceItems.filter((i) => i.type === 'video');
  const resourceExams = currentResourceItems.filter((i) => i.type === 'exam');
  const resourceFiles = currentResourceItems.filter((i) => i.type === 'file');

  const selectedSectionObj = sections.find((s) => s.id === selectedSectionId);
  const selectedResourceObj = resources.find((r) => r.id === selectedResourceId);

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-200 ${
        isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-white text-slate-900'
      }`}
    >
      {/* Top Header */}
      <header
        className={`sticky top-0 z-30 px-4 md:px-8 py-3 border-b backdrop-blur-xl flex flex-wrap items-center justify-between gap-4 transition-all shadow-sm ${
          isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white/95 border-slate-200'
        }`}
      >
        {/* Brand & Student Welcome */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-lg transition-transform hover:scale-105"
            style={{ backgroundColor: activeTheme?.primary || '#2563eb' }}
          >
            <Zap className="w-6 h-6 fill-current text-amber-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-black tracking-tight">منصة أقسام رعد</h1>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
                style={{
                  backgroundColor: `${activeTheme?.primary || '#2563eb'}20`,
                  color: activeTheme?.accent || '#38bdf8',
                }}
              >
                100% بإذن الله
              </span>
            </div>
            <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600 font-bold'}`}>
              مرحباً بك، {currentUser.name}
            </p>
          </div>
        </div>

        {/* Navigation Actions: "احصائياتي", "مجلداتي", Theme, Logout */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowStatsModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition shadow-sm hover:scale-105"
            style={{
              backgroundColor: `${activeTheme?.secondary || '#4f46e5'}20`,
              borderColor: `${activeTheme?.secondary || '#4f46e5'}40`,
              color: isDarkMode ? '#e2e8f0' : '#0f172a',
            }}
          >
            <BarChart3 className="w-4 h-4 text-blue-500" />
            <span className={isDarkMode ? 'text-white' : 'text-slate-900 font-bold'}>احصائياتي</span>
          </button>

          <button
            onClick={() => setShowFoldersModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition shadow-sm hover:scale-105"
            style={{
              backgroundColor: `${activeTheme?.primary || '#2563eb'}20`,
              borderColor: `${activeTheme?.primary || '#2563eb'}40`,
              color: isDarkMode ? '#e2e8f0' : '#0f172a',
            }}
          >
            <Folder className="w-4 h-4 text-amber-500" />
            <span className={isDarkMode ? 'text-white' : 'text-slate-900 font-bold'}>مجلداتي</span>
          </button>

          <button
            onClick={toggleDarkMode}
            className={`p-2 rounded-xl border transition ${
              isDarkMode
                ? 'bg-slate-800 border-slate-700 text-amber-300'
                : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50 shadow-sm'
            }`}
            title={isDarkMode ? 'الوضع النهاري' : 'الوضع الليلي'}
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            onClick={onLogout}
            className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition"
            title="تسجيل الخروج"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Global Announcement Alert Banner (if enabled) */}
      {systemSettings.announcement?.isActive && (
        <div
          className={`px-4 py-3 border-b flex items-center justify-between gap-3 text-xs md:text-sm font-bold ${
            systemSettings.announcement.type === 'urgent'
              ? 'bg-rose-600/20 text-rose-300 border-rose-500/40'
              : systemSettings.announcement.type === 'warning'
              ? 'bg-amber-600/20 text-amber-300 border-amber-500/40'
              : 'bg-blue-600/20 text-blue-300 border-blue-500/40'
          }`}
        >
          <div className="flex items-center gap-2 max-w-5xl mx-auto w-full">
            <Bell className="w-4 h-4 shrink-0 animate-bounce" />
            <span>
              <strong>{systemSettings.announcement.title}: </strong>
              {systemSettings.announcement.message}
            </span>
          </div>
        </div>
      )}

      {/* Prominent Live Stream Banner */}
      {systemSettings.liveStream?.isActive && (
        <div className="p-4 md:px-8 max-w-[1700px] mx-auto w-full">
          <div className="p-6 md:p-8 rounded-3xl bg-gradient-to-r from-rose-950 via-purple-950 to-slate-900 border-2 border-rose-500 shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6 group">
            <div className="flex items-center gap-5">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-rose-600 flex items-center justify-center text-white shadow-xl shadow-rose-600/40 group-hover:scale-105 transition">
                  <Tv className="w-8 h-8" />
                </div>
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500"></span>
                </span>
              </div>

              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-rose-500 text-white text-[11px] font-black uppercase">
                  <span>بث مباشر الآن 🔴</span>
                </div>
                <h2 className="text-xl md:text-3xl font-black text-white">
                  {systemSettings.liveStream.title}
                </h2>
                <p className="text-xs md:text-sm text-slate-300">
                  بتقديم: {systemSettings.liveStream.hostName}
                </p>
              </div>
            </div>

            <a
              href={systemSettings.liveStream.streamUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-sm md:text-base shadow-xl shadow-rose-600/30 transition transform hover:scale-105 shrink-0"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>الانضمام للبث المباشر الآن</span>
            </a>
          </div>
        </div>
      )}

      {/* ================= BIG SUBSCRIPTION DAYS PROGRESS BAR AT STUDENT ================= */}
      {/* "لا تجعل عندما يدخل الطالب للمنصة اول مرة يظهر له عداد ب 30 يوم العداد لا يظهر للطلاب الا لما انا لحدد لهم ايام داخل قسم التحكم" */}
      {(currentUser.isUnlimited || (totalDays > 0 && currentUser.subscriptionEndDate)) && (
        <div className="p-4 md:px-8 max-w-[1700px] mx-auto w-full">
          <div
            className={`p-5 md:p-6 rounded-3xl border shadow-xl transition-all ${
              isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            {currentUser.isUnlimited ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <InfinityIcon className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className={`text-base md:text-lg font-black flex items-center gap-2 ${
                      isDarkMode ? 'text-white' : 'text-slate-900'
                    }`}>
                      <span>حسابك يتمتع باشتراك مفتوح دائم ⚡</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        VIP
                      </span>
                    </h3>
                    <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-700 font-medium'}`}>
                      المنصة مفتوحة لك بالكامل وبلا قيود زمنية، استمتع بجميع الفيديوهات والاختبارات والملفات!
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-500">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className={`text-sm md:text-base font-black ${
                        isDarkMode ? 'text-white' : 'text-slate-900'
                      }`}>
                        متابعة اشتراكك في منصة أقسام رعد
                      </h3>
                      <p className={`text-xs font-bold mt-0.5 ${isDarkMode ? 'text-amber-400' : 'text-amber-700 font-black'}`}>
                        نهاية الاشتراك: يوم {formattedEndDate}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-bold">
                    <div className={isDarkMode ? 'text-slate-300' : 'text-slate-800 font-semibold'}>
                      مضى: <span className={`font-black text-sm ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>{elapsedDays}</span> من {totalDays} يوم
                    </div>
                    <div className={`px-3 py-1 rounded-xl font-black ${
                      isDarkMode ? 'bg-blue-500/20 border border-blue-500/30 text-blue-300' : 'bg-blue-50 border border-blue-200 text-blue-900'
                    }`}>
                      متبقي: {daysLeft} يوم
                    </div>
                  </div>
                </div>

                {/* Big Progress Bar: Starts from 0 and increases as days elapse */}
                <div className="space-y-1">
                  <div className={`w-full h-4 md:h-5 rounded-2xl overflow-hidden p-0.5 border shadow-inner ${
                    isDarkMode ? 'bg-slate-800/80 border-slate-700/60' : 'bg-slate-100 border-slate-200'
                  }`}>
                    <div
                      className={`h-full rounded-xl transition-all duration-700 flex items-center justify-end px-2 text-[10px] font-black text-white shadow-lg ${
                        progressPercentage < 35
                          ? 'bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-500 shadow-blue-500/25'
                          : progressPercentage < 65
                          ? 'bg-gradient-to-r from-blue-600 via-indigo-500 to-amber-500 shadow-indigo-500/25'
                          : progressPercentage < 85
                          ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-orange-600 shadow-amber-500/25'
                          : 'bg-gradient-to-r from-orange-500 via-rose-500 to-red-600 shadow-rose-500/30 animate-pulse'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(6, progressPercentage))}%` }}
                    >
                      %{progressPercentage}
                    </div>
                  </div>
                  <div className={`flex items-center justify-between text-[10px] px-1 font-semibold ${
                    isDarkMode ? 'text-slate-500' : 'text-slate-600'
                  }`}>
                    <span>البداية (اليوم 0)</span>
                    <span>اكتمال الاشتراك (%100)</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Section Switcher Tabs */}
      <div className={`px-4 md:px-8 py-3 border-b overflow-x-auto ${
        isDarkMode ? 'border-slate-800/60 bg-slate-900/30' : 'border-slate-200 bg-white'
      }`}>
        <div className="flex items-center gap-3 min-w-max max-w-[1700px] mx-auto">
          <span className={`text-xs font-black ml-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>
            الأقسام التعليمية:
          </span>
          {sections.map((sec, sIdx) => (
            <button
              key={sec.id}
              onClick={() => setSelectedSectionId(sec.id)}
              className={`px-4 py-2.5 rounded-2xl text-xs md:text-sm font-black transition-all flex items-center gap-2 ${
                selectedSectionId === sec.id
                  ? 'text-white shadow-lg'
                  : isDarkMode
                  ? 'bg-slate-800/40 text-slate-400 hover:text-white hover:bg-slate-800/80'
                  : 'bg-white text-slate-800 hover:text-black hover:bg-slate-50 border border-slate-200 shadow-sm'
              }`}
              style={
                selectedSectionId === sec.id
                  ? {
                      backgroundColor: activeTheme?.primary || '#2563eb',
                      borderColor: activeTheme?.accent || '#38bdf8',
                      boxShadow: `0 4px 14px ${activeTheme?.primary || '#2563eb'}40`,
                    }
                  : {}
              }
            >
              <span className={`w-5 h-5 rounded-full text-[10px] font-black font-mono flex items-center justify-center shrink-0 ${
                selectedSectionId === sec.id
                  ? 'bg-black/30 text-white'
                  : isDarkMode
                  ? 'bg-slate-700/60 text-slate-300'
                  : 'bg-slate-100 text-slate-800 border border-slate-200'
              }`}>
                {sec.order || sIdx + 1}
              </span>
              <span>{sec.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ================= MAIN LEARNING VIEW ================= */}
      {/* "اولا خلي الفيديو عاليسار والمصادر والاقسام عاليمين" */}
      {/* In RTL: Column 1 is displayed on the RIGHT, Column 2 is displayed on the LEFT! */}
      <main className="flex-1 p-4 md:px-8 md:py-6 max-w-[1700px] mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ================= RIGHT SIDE (اليمين): SECTIONS, RESOURCES, CONTENT TABS ================= */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-4">
            {/* Resources list for active section */}
            <div
              className={`p-4 rounded-3xl border shadow-xl ${
                isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
              }`}
            >
              <div className={`flex items-center justify-between pb-3 border-b mb-3 ${
                isDarkMode ? 'border-slate-800/60' : 'border-slate-200'
              }`}>
                <span className={`text-xs font-black ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>
                  المصادر المتاحة ({currentSectionResources.length})
                </span>
                <span
                  className="text-[11px] font-black"
                  style={{ color: activeTheme?.accent || '#2563eb' }}
                >
                  {selectedSectionObj?.title}
                </span>
              </div>

              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                {currentSectionResources.map((res, rIdx) => {
                  const isSelected = selectedResourceId === res.id;
                  return (
                    <button
                      key={res.id}
                      onClick={() => setSelectedResourceId(res.id)}
                      className={`w-full text-right p-3 rounded-2xl border text-xs font-bold transition flex items-center justify-between gap-2.5 cursor-pointer ${
                        isSelected
                          ? isDarkMode
                            ? 'text-white shadow-md'
                            : 'text-slate-950 font-black shadow-md bg-blue-50/70 border-blue-400'
                          : isDarkMode
                          ? 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                          : 'bg-white border-slate-200 text-slate-900 hover:bg-slate-50 shadow-sm'
                      }`}
                      style={
                        isSelected
                          ? {
                              backgroundColor: isDarkMode ? `${activeTheme?.primary || '#2563eb'}25` : undefined,
                              borderColor: activeTheme?.primary || '#2563eb',
                              boxShadow: `0 4px 14px ${activeTheme?.primary || '#2563eb'}25`,
                            }
                          : {}
                      }
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span className={`w-5 h-5 rounded-full text-[10px] font-black font-mono flex items-center justify-center shrink-0 ${
                          isDarkMode ? 'bg-slate-700/80 text-white' : 'bg-slate-100 text-slate-800 border border-slate-200'
                        }`}>
                          {res.order || rIdx + 1}
                        </span>
                        <div className="truncate">
                          <div className={`truncate ${isDarkMode ? 'text-white' : 'text-slate-950 font-black'}`}>{res.title}</div>
                          {res.description && (
                            <div className={`text-[10px] font-medium mt-0.5 truncate ${
                              isDarkMode ? 'text-slate-400' : 'text-slate-600'
                            }`}>
                              {res.description}
                            </div>
                          )}
                        </div>
                      </div>
                      <ChevronLeft className={`w-4 h-4 shrink-0 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* When resource is selected: 3 TABS (فيديوهات، اختبارات، ملفات) */}
            {selectedResourceId && (
              <div
                className={`p-4 md:p-5 rounded-3xl border shadow-xl space-y-4 ${
                  isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
                }`}
              >
                {/* The 3 Tabs */}
                <div className={`grid grid-cols-3 gap-1.5 p-1 rounded-2xl border ${
                  isDarkMode ? 'bg-slate-800/60 border-slate-700/60' : 'bg-slate-100 border-slate-200'
                }`}>
                  <button
                    onClick={() => setActiveTab('videos')}
                    className={`py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition ${
                      activeTab === 'videos'
                        ? 'text-white shadow-md'
                        : isDarkMode
                        ? 'text-slate-400 hover:text-white'
                        : 'text-slate-700 hover:text-black hover:bg-white/80'
                    }`}
                    style={
                      activeTab === 'videos'
                        ? {
                            backgroundColor: activeTheme?.primary || '#2563eb',
                          }
                        : {}
                    }
                  >
                    <PlayCircle className="w-3.5 h-3.5" />
                    <span>فيديوهات ({resourceVideos.length})</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('exams')}
                    className={`py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition ${
                      activeTab === 'exams'
                        ? 'bg-amber-600 text-white shadow-md'
                        : isDarkMode
                        ? 'text-slate-400 hover:text-white'
                        : 'text-slate-700 hover:text-black hover:bg-white/80'
                    }`}
                  >
                    <Award className="w-3.5 h-3.5" />
                    <span>اختبارات ({resourceExams.length})</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('files')}
                    className={`py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition ${
                      activeTab === 'files'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : isDarkMode
                        ? 'text-slate-400 hover:text-white'
                        : 'text-slate-700 hover:text-black hover:bg-white/80'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>ملفات ({resourceFiles.length})</span>
                  </button>
                </div>

                {/* Tab 1: VIDEOS LIST */}
                {activeTab === 'videos' && (
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {resourceVideos.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-500 font-bold">لا توجد فيديوهات في هذا المصدر</div>
                    ) : (
                      resourceVideos.map((v, vIdx) => {
                        const isWatched = currentUser.watchedVideoIds?.includes(v.id);
                        const isCurrent = activeVideo?.id === v.id;

                        return (
                          <div
                            key={v.id}
                            onClick={() => handleSelectVideo(v)}
                            className={`p-3 rounded-2xl border cursor-pointer transition flex items-center justify-between ${
                              isCurrent
                                ? isDarkMode
                                  ? 'text-white shadow-md'
                                  : 'text-slate-950 font-black shadow-md bg-blue-50/70 border-blue-400'
                                : isDarkMode
                                ? 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800 text-slate-300'
                                : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-900 shadow-sm'
                            }`}
                            style={
                              isCurrent
                                ? {
                                    backgroundColor: isDarkMode ? `${activeTheme?.primary || '#2563eb'}25` : undefined,
                                    borderColor: activeTheme?.primary || '#2563eb',
                                    boxShadow: `0 4px 14px ${activeTheme?.primary || '#2563eb'}25`,
                                  }
                                : {}
                            }
                          >
                            <div className="flex items-center gap-2.5">
                              {/* Sequence index badge (من الأقدم للأحدث #1, #2, #3...) */}
                              <span className={`w-5 h-5 rounded-full text-[10px] font-black font-mono flex items-center justify-center shrink-0 ${
                                isDarkMode ? 'bg-slate-700/80 text-white' : 'bg-slate-100 text-slate-800 border border-slate-200'
                              }`}>
                                {vIdx + 1}
                              </span>

                              <div
                                className="p-2 rounded-xl transition shrink-0"
                                style={
                                  isCurrent
                                    ? {
                                        backgroundColor: activeTheme?.primary || '#2563eb',
                                        color: '#ffffff',
                                      }
                                    : {
                                        backgroundColor: isDarkMode ? '#1e293b' : '#f1f5f9',
                                        color: activeTheme?.accent || '#2563eb',
                                      }
                                }
                              >
                                <Play className="w-3.5 h-3.5 fill-current" />
                              </div>
                              <div>
                                <div className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>{v.title}</div>
                                <div className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
                                  {v.durationMinutes ? `${v.durationMinutes} دقيقة` : 'فيديو تعليمي'}
                                </div>
                              </div>
                            </div>

                            {isWatched && (
                              <span
                                className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 font-black"
                                title="تمت المشاهدة"
                              >
                                تمت المشاهدة ✓
                              </span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* Tab 2: EXAMS LIST */}
                {activeTab === 'exams' && (
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                    {resourceExams.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-500 font-bold">لا توجد اختبارات في هذا المصدر</div>
                    ) : (
                      resourceExams.map((ex, exIdx) => (
                        <div
                          key={ex.id}
                          className={`p-3.5 rounded-2xl border space-y-2.5 ${
                            isDarkMode ? 'bg-slate-800/50 border-slate-700/60' : 'bg-white border-slate-200 shadow-sm'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2">
                              {/* Sequence index badge (من الأقدم للأحدث #1, #2, #3...) */}
                              <span className={`w-5 h-5 rounded-full text-[10px] font-black font-mono flex items-center justify-center shrink-0 mt-0.5 ${
                                isDarkMode ? 'bg-slate-700/80 text-white' : 'bg-slate-100 text-slate-800 border border-slate-200'
                              }`}>
                                {exIdx + 1}
                              </span>
                              <div>
                                <h4 className={`text-xs md:text-sm font-black flex items-center gap-1.5 ${
                                  isDarkMode ? 'text-white' : 'text-slate-950'
                                }`}>
                                  <Award className="w-4 h-4 text-amber-500" />
                                  <span>{ex.title}</span>
                                </h4>
                                {ex.description && (
                                  <p className={`text-[11px] mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>{ex.description}</p>
                                )}
                              </div>
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded font-black border ${
                              isDarkMode ? 'bg-slate-900 text-amber-300 border-slate-700' : 'bg-amber-50 text-amber-900 border-amber-300'
                            }`}>
                              {ex.questions?.length || 10} سؤال
                            </span>
                          </div>

                          <button
                            onClick={() => setExamToStart(ex)}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 transition transform active:scale-95 cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>بدأ اختبار</span>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Tab 3: FILES LIST */}
                {activeTab === 'files' && (
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {resourceFiles.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-500 font-bold">لا توجد ملفات في هذا المصدر</div>
                    ) : (
                      resourceFiles.map((file, fIdx) => (
                        <div
                          key={file.id}
                          className={`p-3 rounded-2xl border flex items-center justify-between text-xs ${
                            isDarkMode ? 'bg-slate-800/40 border-slate-700/60' : 'bg-white border-slate-200 shadow-sm'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            {/* Sequence index badge (من الأقدم للأحدث #1, #2, #3...) */}
                            <span className={`w-5 h-5 rounded-full text-[10px] font-black font-mono flex items-center justify-center shrink-0 ${
                              isDarkMode ? 'bg-slate-700/80 text-white' : 'bg-slate-100 text-slate-800 border border-slate-200'
                            }`}>
                              {fIdx + 1}
                            </span>
                            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-500">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div>
                              <div className={`font-black ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>{file.title}</div>
                              <div className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
                                {file.fileSize || 'ملف PDF جاهز للتحميل'}
                              </div>
                            </div>
                          </div>

                          {file.url ? (
                            <a
                              href={file.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1 transition"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>تحميل</span>
                            </a>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-bold">مرفق</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ================= LEFT SIDE (اليسار): VIDEO PLAYER ================= */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-4">
            {(() => {
              const activeVideoItem = activeVideo
                ? (contentItems.find((i) => i.id === activeVideo.id) || activeVideo)
                : null;

              if (!activeVideoItem) {
                return (
                  <div
                    className={`h-96 rounded-3xl border flex flex-col items-center justify-center p-8 text-center space-y-3 ${
                      isDarkMode ? 'bg-slate-900/40 border-slate-800 text-slate-500' : 'bg-white border-slate-200 text-slate-400'
                    }`}
                  >
                    <Video className="w-12 h-12 stroke-[1.5] opacity-50" />
                    <div>
                      <h3 className="font-bold text-sm">اختر فيديو للبدء</h3>
                      <p className="text-xs">اضغط على أي فيديو من القائمة في اليمين للمشاهدة وتجربة الملحقات التفاعلية</p>
                    </div>
                  </div>
                );
              }

              const isWatched = currentUser.watchedVideoIds?.includes(activeVideoItem.id);
              // Linked exams and files sorted from oldest to newest
              const linkedExams = contentItems
                .filter((it) => it.type === 'exam' && activeVideoItem.linkedExamIds?.includes(it.id))
                .sort((a, b) => {
                  const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                  const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                  if (tA !== tB) return tA - tB;
                  return (a.id || '').localeCompare(b.id || '');
                });
              const linkedFiles = contentItems
                .filter((it) => it.type === 'file' && activeVideoItem.linkedFileIds?.includes(it.id))
                .sort((a, b) => {
                  const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                  const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                  if (tA !== tB) return tA - tB;
                  return (a.id || '').localeCompare(b.id || '');
                });

              return (
                <div
                  className={`rounded-3xl border overflow-hidden shadow-2xl p-4 md:p-6 transition-all ${
                    isDarkMode ? 'bg-slate-900/90 border-slate-800 backdrop-blur-xl' : 'bg-white border-slate-200 shadow-sm'
                  }`}
                >
                  {/* Watch Confirmation Bar ABOVE the video ("واجعل فوق كل فيديو زر تم تاكيد المشاهدة") */}
                  <div className={`flex flex-wrap items-center justify-between gap-3 p-3 mb-4 rounded-2xl border ${
                    isDarkMode ? 'bg-slate-800/80 border-slate-700/80 backdrop-blur-sm' : 'bg-slate-50 border-slate-200 shadow-sm'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-black ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                        حالة مشاهدة هذا الفيديو:
                      </span>
                      {isWatched ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          <span>تمت المشاهدة بنجاح ✓</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-500 border border-amber-500/30">
                          لم يتم التأكيد بعد
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleWatchVideo(activeVideoItem.id)}
                      className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 shadow-md ${
                        isWatched
                          ? 'bg-emerald-600 hover:bg-rose-600 text-white group cursor-pointer'
                          : 'text-white hover:opacity-90 shadow-lg cursor-pointer'
                      }`}
                      style={
                        !isWatched
                          ? {
                              backgroundColor: activeTheme?.primary || '#2563eb',
                              boxShadow: `0 4px 14px ${activeTheme?.primary || '#2563eb'}40`,
                            }
                          : {}
                      }
                      title={isWatched ? 'انقر لإلغاء تأكيد المشاهدة والتقدم' : 'انقر لتأكيد مشاهدة الفيديو'}
                    >
                      {isWatched ? (
                        <>
                          <CheckCircle className="w-4 h-4 group-hover:hidden" />
                          <span className="group-hover:hidden">تم تأكيد المشاهدة ✓</span>
                          <X className="w-4 h-4 hidden group-hover:inline" />
                          <span className="hidden group-hover:inline">إلغاء التقدم والمشاهدة ✕</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          <span>تأكيد المشاهدة الآن</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Video Container */}
                  <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black relative shadow-inner">
                    <video
                      key={activeVideoItem.id}
                      src={activeVideoItem.url}
                      controls
                      autoPlay
                      onEnded={() => handleVideoEnded(activeVideoItem.id)}
                      className="w-full h-full object-contain"
                    />
                  </div>

                  {/* Video Info */}
                  <div className="mt-5 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className={`text-xl md:text-2xl font-black ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>
                        {activeVideoItem.title}
                      </h2>
                      {isWatched && (
                        <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-500 text-xs font-black flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>تمت المشاهدة وحفظ الإنجاز</span>
                        </span>
                      )}
                    </div>

                    {activeVideoItem.description && (
                      <p className={`text-sm leading-relaxed pt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>
                        {activeVideoItem.description}
                      </p>
                    )}

                    <div className={`pt-3 border-t flex items-center justify-between text-xs ${
                      isDarkMode ? 'border-slate-800/60 text-slate-500' : 'border-slate-200 text-slate-600 font-bold'
                    }`}>
                      <span>المصدر: {selectedResourceObj?.title || 'عام'}</span>
                      <span className={isDarkMode ? 'text-amber-400' : 'text-amber-600'}>
                        منصة أقسام رعد تضمن لك المئوية بإذن الله ⚡
                      </span>
                    </div>
                  </div>

                  {/* ================= مستطيلين واضحين بألوان جذابة وجميلة تحت الفيديو المختار ================= */}
                  {(linkedExams.length > 0 || linkedFiles.length > 0) && (
                    <div className={`mt-6 pt-5 border-t space-y-4 ${
                      isDarkMode ? 'border-slate-800/80' : 'border-slate-200'
                    }`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
                          <h3 className={`text-base md:text-lg font-black ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>
                            الملحقات التفاعلية المربوطة بهذا الفيديو ⚡
                          </h3>
                        </div>
                        <span className={`text-[11px] font-black px-3 py-1 rounded-full border ${
                          isDarkMode
                            ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                            : 'text-amber-800 bg-amber-50 border-amber-300'
                        }`}>
                          مربوطة مباشرة بهذا الفيديو
                        </span>
                      </div>

                      {/* شبكة المستطيلين الواضحين بألوان جذابة وفخمة */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                        {/* ================= المستطيل الأول: مستطيل الاختبار ================= */}
                        {linkedExams.map((linkedEx) => (
                          <div
                            key={linkedEx.id}
                            className={`rounded-3xl p-5 md:p-6 border-2 shadow-xl transition-all flex flex-col justify-between space-y-4 group relative overflow-hidden ${
                              isDarkMode
                                ? 'bg-gradient-to-br from-amber-950/80 via-slate-900 to-amber-900/50 border-amber-500/90 hover:border-amber-400 shadow-amber-500/15'
                                : 'bg-gradient-to-br from-amber-50 via-white to-amber-50/60 border-amber-500 hover:border-amber-600 shadow-amber-500/10'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-500/20 text-amber-500 border border-amber-500/40 flex items-center gap-1.5 shadow-sm">
                                <Award className="w-3.5 h-3.5 text-amber-500" />
                                <span>اختبار تفاعلي مربوط 📝</span>
                              </span>
                              <span className={`text-[11px] font-mono font-black px-2.5 py-0.5 rounded-lg border ${
                                isDarkMode
                                  ? 'text-amber-400 bg-black/40 border-amber-500/20'
                                  : 'text-amber-900 bg-amber-100 border-amber-300'
                              }`}>
                                الهدف: %{linkedEx.targetPercentage || 90}
                              </span>
                            </div>

                            <div className="space-y-2">
                              <div className={`text-[11px] font-black ${isDarkMode ? 'text-amber-400/90' : 'text-amber-800'}`}>
                                اسم الاختبار:
                              </div>
                              <h4 className={`text-lg md:text-xl font-black transition-colors leading-snug ${
                                isDarkMode ? 'text-white group-hover:text-amber-300' : 'text-slate-950 group-hover:text-amber-800'
                              }`}>
                                {linkedEx.title}
                              </h4>
                              {linkedEx.description && (
                                <p className={`text-xs leading-relaxed line-clamp-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                  {linkedEx.description}
                                </p>
                              )}
                              <div className={`flex items-center gap-3 pt-1 text-xs font-bold ${
                                isDarkMode ? 'text-amber-400' : 'text-amber-800'
                              }`}>
                                <span className="flex items-center gap-1">
                                  <HelpCircle className="w-3.5 h-3.5" />
                                  <span>{linkedEx.questions?.length || 0} أسئلة</span>
                                </span>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5" />
                                  <span>{linkedEx.durationMinutes || 15} دقيقة</span>
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => setExamToStart(linkedEx)}
                              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs md:text-sm shadow-lg shadow-amber-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                            >
                              <Zap className="w-4 h-4 fill-slate-950" />
                              <span>بدأ الاختبار الآن ⚡</span>
                            </button>
                          </div>
                        ))}

                        {/* ================= المستطيل الثاني: مستطيل الملف المربوط ================= */}
                        {linkedFiles.map((linkedFl) => {
                          const fileLink = linkedFl.url || linkedFl.fileData;
                          return (
                            <div
                              key={linkedFl.id}
                              className={`rounded-3xl p-5 md:p-6 border-2 shadow-xl transition-all flex flex-col justify-between space-y-4 group relative overflow-hidden ${
                                isDarkMode
                                  ? 'bg-gradient-to-br from-emerald-950/80 via-slate-900 to-teal-900/50 border-emerald-500/90 hover:border-emerald-400 shadow-emerald-500/15'
                                  : 'bg-gradient-to-br from-emerald-50 via-white to-teal-50/60 border-emerald-500 hover:border-emerald-600 shadow-emerald-500/10'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-500 border border-emerald-500/40 flex items-center gap-1.5 shadow-sm">
                                  <FileText className="w-3.5 h-3.5 text-emerald-500" />
                                  <span>ملف ملخص مربوط 📁</span>
                                </span>
                                <span className={`text-[11px] font-mono font-black px-2.5 py-0.5 rounded-lg border ${
                                  isDarkMode
                                    ? 'text-emerald-400 bg-black/40 border-emerald-500/20'
                                    : 'text-emerald-900 bg-emerald-100 border-emerald-300'
                                }`}>
                                  {linkedFl.fileSize || 'ملف PDF'}
                                </span>
                              </div>

                              <div className="space-y-2">
                                <div className={`text-[11px] font-black ${isDarkMode ? 'text-emerald-400/90' : 'text-emerald-800'}`}>
                                  اسم الملف المرفق:
                                </div>
                                <h4 className={`text-lg md:text-xl font-black transition-colors leading-snug ${
                                  isDarkMode ? 'text-white group-hover:text-emerald-300' : 'text-slate-950 group-hover:text-emerald-800'
                                }`}>
                                  {linkedFl.title || linkedFl.fileName || 'ملف الشرح والملخص'}
                                </h4>
                                {linkedFl.description ? (
                                  <p className={`text-xs leading-relaxed line-clamp-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                    {linkedFl.description}
                                  </p>
                                ) : (
                                  <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                    ملف ومستند مرفق ومربوط مع هذا الفيديو للمذاكرة والمراجعة الشاملة.
                                  </p>
                                )}
                                <div className={`flex items-center gap-3 pt-1 text-xs font-bold ${
                                  isDarkMode ? 'text-emerald-400' : 'text-emerald-800'
                                }`}>
                                  <span className="flex items-center gap-1">
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    <span>جاهز للانتقال والتحميل الفوري</span>
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 pt-1">
                                {fileLink ? (
                                  <a
                                    href={fileLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs md:text-sm shadow-lg shadow-emerald-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                                  >
                                    <FileText className="w-4 h-4" />
                                    <span>الانتقال للملف وفتحه 📁</span>
                                  </a>
                                ) : (
                                  <div className={`flex-1 py-3.5 px-4 rounded-2xl font-bold text-xs text-center ${
                                    isDarkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-700 border border-slate-200'
                                  }`}>
                                    الملف متوفر للمشاهدة
                                  </div>
                                )}

                                {fileLink && (
                                  <a
                                    href={fileLink}
                                    download={linkedFl.fileName || 'document.pdf'}
                                    className={`p-3.5 rounded-2xl border transition shrink-0 cursor-pointer shadow-md ${
                                      isDarkMode
                                        ? 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border-emerald-500/40'
                                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                                    }`}
                                    title="تحميل الملف للجهاز"
                                  >
                                    <Download className="w-4 h-4" />
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </main>

      {/* ================= FOOTER: 3 SENTENCES (RIGHT, CENTER, LEFT) ================= */}
      {/* "ثانيا اجعل الثلاث جمل واحدة عاليمين وواحدة عاليسار وواحدة فالنص" */}
      <footer
        className={`mt-auto py-6 px-6 md:px-12 border-t select-none transition-colors ${
          isDarkMode ? 'bg-slate-950 border-slate-800/80 text-slate-400' : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        <div className="max-w-[1700px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs md:text-sm font-bold">
          {/* Sentence 1: ON THE RIGHT (عاليمين) */}
          <div className={`text-right w-full md:w-1/3 ${isDarkMode ? 'text-slate-300' : 'text-slate-800 font-bold'}`}>
            المصمم مازن محمد محروس
          </div>

          {/* Sentence 2: IN THE CENTER (فالنص - 7 clicks triggers admin password!) */}
          <div
            onClick={handleFooterSentenceClick}
            className={`text-center w-full md:w-1/3 cursor-pointer hover:text-amber-500 transition-colors py-1 ${
              isDarkMode ? 'text-slate-300' : 'text-slate-900 font-black'
            }`}
          >
            جميع محتويات المنصة محفوظة لمنصة اقسام رعد
          </div>

          {/* Sentence 3: ON THE LEFT (عاليسار) */}
          <div className="text-left w-full md:w-1/3 text-amber-500 font-black">
            منصة اقسام رعد تضمن لك المئوية باذن الله
          </div>
        </div>
      </footer>

      {/* Timed vs Untimed Modal when clicking "بدأ اختبار" - Large & Prominent ("خلي واجهة ان الطالب يختار الاختبار بوقت او لا خليها كبيرة") */}
      {/* Timed vs Untimed Modal when clicking "بدأ اختبار" - Fullscreen & Mobile Thumb-Scrollable */}
      {examToStart && (
        <div className={`fixed inset-0 z-50 overflow-y-auto overscroll-y-contain -webkit-overflow-scrolling-touch backdrop-blur-xl animate-in fade-in duration-200 p-3 sm:p-6 md:p-8 ${
          isDarkMode ? 'bg-slate-950/95' : 'bg-black/60'
        }`}>
          <div className="min-h-full flex items-center justify-center py-6 sm:py-10">
            <div className={`border-2 rounded-3xl p-5 sm:p-8 md:p-10 max-w-4xl w-full shadow-2xl space-y-6 text-right relative pb-10 ${
              isDarkMode ? 'bg-slate-900 border-slate-700/80 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}>
              {/* Top decorative glow */}
            <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-amber-500 via-blue-500 to-emerald-500 rounded-t-3xl" />

            <div className={`flex items-start justify-between gap-4 pb-4 border-b ${
              isDarkMode ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <div className="flex items-center gap-3">
                <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-2xl shrink-0">
                  <Award className="w-8 h-8" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-500 font-black border border-amber-500/30">
                      تجهيز وبدء الاختبار ⚡
                    </span>
                    <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500 font-bold'}`}>
                      منصة أقسام رعد
                    </span>
                  </div>
                  <h3 className={`text-xl md:text-2xl font-black mt-1 ${
                    isDarkMode ? 'text-white' : 'text-slate-950'
                  }`}>
                    {examToStart.title}
                  </h3>
                </div>
              </div>

              {/* Close Button on Top */}
              <button
                type="button"
                onClick={() => setExamToStart(null)}
                className={`p-2.5 rounded-2xl transition cursor-pointer shrink-0 ${
                  isDarkMode
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-black border border-slate-200'
                }`}
                title="إغلاق والعودة"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Badges Info */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 ${
                isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-800'
              }`}>
                <HelpCircle className="w-3.5 h-3.5 text-blue-500" />
                <span>{examToStart.questions?.length || 0} أسئلة</span>
              </span>
              <span className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 ${
                isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-800'
              }`}>
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <span>{examToStart.durationMinutes || 15} دقيقة</span>
              </span>
              <span className={`px-3 py-1.5 rounded-xl border font-black flex items-center gap-1.5 ${
                isDarkMode
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  : 'bg-amber-50 border-amber-300 text-amber-900'
              }`}>
                <Target className="w-3.5 h-3.5 text-amber-500" />
                <span>الهدف: %{examToStart.targetPercentage || 90}</span>
              </span>
            </div>

            <div className="text-center md:text-right space-y-1">
              <h4 className={`text-base md:text-lg font-black ${
                isDarkMode ? 'text-slate-200' : 'text-slate-900'
              }`}>
                اختر نظام أداء الاختبار المناسب لهدفك اليوم:
              </h4>
              <p className={`text-xs md:text-sm ${
                isDarkMode ? 'text-slate-400' : 'text-slate-600 font-medium'
              }`}>
                يمكنك التبديل بين الاختبار بوقت محدد لمحاكاة الاختبار الحقيقي، أو التدريب الحر الهادئ بدون وقت للتركيز في خطوات الحل على السبورة.
              </p>
            </div>

            {/* 2 Big Option Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
              {/* Option 1: Timed Exam */}
              <div
                onClick={() => confirmStartExam(true)}
                className={`group relative rounded-3xl p-6 border-2 cursor-pointer transition-all duration-200 hover:shadow-2xl hover:shadow-blue-500/20 hover:-translate-y-1 flex flex-col justify-between space-y-4 ${
                  isDarkMode
                    ? 'bg-gradient-to-b from-blue-950/40 to-slate-900 border-blue-500/30 hover:border-blue-400'
                    : 'bg-gradient-to-b from-blue-50/60 to-white border-blue-300 hover:border-blue-500 shadow-sm'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-500 border border-blue-500/40 group-hover:scale-110 transition-transform">
                      <Clock className="w-7 h-7" />
                    </div>
                    <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-300 border border-blue-500/30">
                      مؤقت {examToStart.durationMinutes || 15} دقيقة
                    </span>
                  </div>

                  <h5 className={`text-lg md:text-xl font-black transition-colors ${
                    isDarkMode ? 'text-white group-hover:text-blue-300' : 'text-slate-950 group-hover:text-blue-700'
                  }`}>
                    اختبار بوقت محدد ⏱️
                  </h5>

                  <p className={`text-xs leading-relaxed ${
                    isDarkMode ? 'text-slate-300' : 'text-slate-700 font-medium'
                  }`}>
                    يبدأ بعد تنازلي فور دخولك للاختبار، لقياس سرعتك الحقيقية وتدريب عقلك على إدارة الوقت بدقة واحترافية.
                  </p>

                  <div className={`space-y-1.5 pt-2 text-[11px] font-bold ${
                    isDarkMode ? 'text-blue-200/80' : 'text-blue-900'
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-blue-500" />
                      <span>محاكاة أجواء الاختبارات القياسية وقاعات الاختبار</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-blue-500" />
                      <span>تنبيه لوني باللون الأحمر عند اقتراب نهاية الدقائق</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs md:text-sm shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2 group-hover:bg-blue-500 cursor-pointer"
                >
                  <Clock className="w-4 h-4" />
                  <span>بدأ الاختبار بوقت الآن</span>
                </button>
              </div>

              {/* Option 2: Untimed Free Training */}
              <div
                onClick={() => confirmStartExam(false)}
                className={`group relative rounded-3xl p-6 border-2 cursor-pointer transition-all duration-200 hover:shadow-2xl hover:shadow-emerald-500/20 hover:-translate-y-1 flex flex-col justify-between space-y-4 ${
                  isDarkMode
                    ? 'bg-gradient-to-b from-emerald-950/40 to-slate-900 border-emerald-500/30 hover:border-emerald-400'
                    : 'bg-gradient-to-b from-emerald-50/60 to-white border-emerald-300 hover:border-emerald-500 shadow-sm'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-500 border border-emerald-500/40 group-hover:scale-110 transition-transform">
                      <Sparkles className="w-7 h-7" />
                    </div>
                    <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30">
                      تدريب مفتوح حر
                    </span>
                  </div>

                  <h5 className={`text-lg md:text-xl font-black transition-colors ${
                    isDarkMode ? 'text-white group-hover:text-emerald-300' : 'text-slate-950 group-hover:text-emerald-700'
                  }`}>
                    تدريب هادئ بدون وقت 🎯
                  </h5>

                  <p className={`text-xs leading-relaxed ${
                    isDarkMode ? 'text-slate-300' : 'text-slate-700 font-medium'
                  }`}>
                    بدون أي ضغوط زمنية! خذ كامل وقتك في تحليل السؤال وكتابة خطوات الحل والمسودة على السبورة الذكية بهدوء.
                  </p>

                  <div className={`space-y-1.5 pt-2 text-[11px] font-bold ${
                    isDarkMode ? 'text-emerald-200/80' : 'text-emerald-900'
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                      <span>استيعاب عميق للقوانين وطرق الحل المبتكرة</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                      <span>مساحة حرة للرسم والتجريب على السبورة الذكية</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs md:text-sm shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-2 group-hover:bg-emerald-500 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>بدأ التدريب بدون وقت الآن</span>
                </button>
              </div>
            </div>

            <div className={`flex items-center justify-between pt-2 border-t text-xs ${
              isDarkMode ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-600 font-bold'
            }`}>
              <span>💡 يمكنك حفظ أي سؤال يواجهك في "مجلد الأخطاء" أو مجلداتك في أي وقت</span>
              <button
                type="button"
                onClick={() => setExamToStart(null)}
                className={`px-5 py-2.5 rounded-xl transition font-black cursor-pointer ${
                  isDarkMode
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200'
                }`}
              >
                إلغاء والعودة
              </button>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* احصائياتي Modal */}
      <StatsModal
        isOpen={showStatsModal}
        onClose={() => setShowStatsModal(false)}
        currentUser={currentUser}
        isDarkMode={isDarkMode}
      />

      {/* مجلداتي Modal */}
      <FoldersModal
        isOpen={showFoldersModal}
        onClose={() => setShowFoldersModal(false)}
        currentUser={currentUser}
        onStartFolderExam={handleStartFolderExam}
        isDarkMode={isDarkMode}
      />
    </div>
  );
};
