import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowRight,
  ArrowLeft,
  Award,
  BookmarkPlus,
  RefreshCw,
  Home,
  Check,
  Zap,
  FolderPlus,
  AlertCircle,
  Target,
  PenTool,
  PanelLeftClose,
  Layers,
  X,
  Folder,
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
  User,
  FileText,
  Calculator,
  BookOpen,
  Star,
  Trophy,
  Medal,
  Sparkles,
  Hourglass,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { StudentUser, ExamQuestion, FolderItem, ExamSystemType } from '../types';
import { Whiteboard } from './Whiteboard';
import { NimrExamSystem } from './systems/NimrExamSystem';
import { DefaultExamSystem } from './systems/DefaultExamSystem';
import { BlueExamSystem } from './systems/BlueExamSystem';
import { db, OperationType, reportFirestoreListenerError } from '../firebase';
import {
  saveLocalExamAttempt,
  replaceLocalAttemptId,
  hasSyncedExamAttemptsRecently,
} from '../utils/examAttemptsCache';
import {
  addLocalFolder,
  addLocalFolderQuestion,
  ensureStudentFoldersLoaded,
  getStudentFoldersSnapshot,
  removeLocalFolderQuestions,
  subscribeStudentFolders,
} from '../utils/studentFoldersStore';
import {
  transferMistakeImmediately,
  getOrCreateMistakesFolderId,
  markQuestionAsPermanentlyDeleted,
  deleteCorrectQuestionsFromFolderPermanently,
} from '../mistakesService';
import {
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';

interface FolderQuestionDoc {
  id: string; // Document ID in folder_questions collection
  folderId: string;
  originalQuestionId?: string;
  questionText: string;
}

interface ExamRunnerProps {
  examTitle: string;
  examId: string;
  questions?: ExamQuestion[];
  currentUser: StudentUser;
  defaultFolders: FolderItem[];
  onFinishExam: () => void;
  onExit: () => void;
  isTimedInitial?: boolean;
  examSystem?: ExamSystemType;
  durationMinutes?: number;
  targetPercentage?: number;
  isDarkMode?: boolean;
  isFolderExam?: boolean;
  folderId?: string;
  folderTitle?: string;
  courseId?: string;
  courseTitle?: string;
}

export type StudentLevelKey = 'excellent' | 'very_good' | 'good' | 'acceptable' | 'weak';

export interface StudentLevelData {
  key: StudentLevelKey;
  title: string; // ممتاز / جيد جداً / جيد / مقبول / ضعيف
  statusTitle: string; // مجتاز بالاختبار / غير مجتاز بالاختبار
  isPassed: boolean;
  stars: number;
  badgeGradient: string;
  badgeTextColor: string;
  badgeBorderColor: string;
  glowColor: string;
  quote: string;
}

export const getStudentLevelData = (percentage: number): StudentLevelData => {
  if (percentage >= 90) {
    return {
      key: 'excellent',
      title: 'ممتاز',
      statusTitle: 'مجتاز بالاختبار بتفوق',
      isPassed: true,
      stars: 5,
      badgeGradient: 'from-amber-400 via-yellow-500 to-amber-600',
      badgeTextColor: 'text-amber-500',
      badgeBorderColor: 'border-amber-400/50',
      glowColor: 'from-amber-500/20 via-yellow-500/10 to-transparent',
      quote: 'أداء استثنائي وتفوق باهر! حققت مرتبة الشرف والامتياز بكل جدارة 🌟',
    };
  } else if (percentage >= 80) {
    return {
      key: 'very_good',
      title: 'جيد جداً',
      statusTitle: 'مجتاز بالاختبار بتميز',
      isPassed: true,
      stars: 4,
      badgeGradient: 'from-blue-500 via-indigo-600 to-sky-500',
      badgeTextColor: 'text-blue-500',
      badgeBorderColor: 'border-blue-400/50',
      glowColor: 'from-blue-500/20 via-indigo-500/10 to-transparent',
      quote: 'مستوى رائع ومتقن! واصل الإبداع، أنت على بُعد خطوات بسيطة جداً من الدرجة الكاملة 🥈',
    };
  } else if (percentage >= 70) {
    return {
      key: 'good',
      title: 'جيد',
      statusTitle: 'مجتاز بالاختبار بنجاح',
      isPassed: true,
      stars: 3,
      badgeGradient: 'from-emerald-500 via-teal-600 to-green-500',
      badgeTextColor: 'text-emerald-500',
      badgeBorderColor: 'border-emerald-400/50',
      glowColor: 'from-emerald-500/20 via-teal-500/10 to-transparent',
      quote: 'أداء طيب وناجح! استمر في حل التمارين لتصل إلى أعلى مراتب التميز والامتياز 🥉',
    };
  } else if (percentage >= 60) {
    return {
      key: 'acceptable',
      title: 'مقبول',
      statusTitle: 'مجتاز بالاختبار',
      isPassed: true,
      stars: 2,
      badgeGradient: 'from-amber-600 via-orange-500 to-yellow-600',
      badgeTextColor: 'text-amber-600',
      badgeBorderColor: 'border-amber-400/50',
      glowColor: 'from-amber-500/20 via-orange-500/10 to-transparent',
      quote: 'تم اجتياز الاختبار بنجاح! راجع أخطاءك في مجلد الأخطاء لترتقي بمستواك نحو الامتياز 🎯',
    };
  } else {
    return {
      key: 'weak',
      title: 'ضعيف',
      statusTitle: 'غير مجتاز بالاختبار',
      isPassed: false,
      stars: 1,
      badgeGradient: 'from-rose-500 via-red-600 to-rose-700',
      badgeTextColor: 'text-rose-500',
      badgeBorderColor: 'border-rose-400/50',
      glowColor: 'from-rose-500/20 via-red-500/10 to-transparent',
      quote: 'فرصة للتعلم والتطوير! تم حفظ جميع أخطائك في مجلد الأخطاء لتتدرب عليها وتعاود المحاولة بقوة 🚀',
    };
  }
};

export const formatDigitalTime = (secs: number) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export const formatArabicTime = (secs: number) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m === 0) {
    return `${s} ثانية`;
  }
  if (s === 0) {
    if (m === 1) return 'دقيقة واحدة';
    if (m === 2) return 'دقيقتان';
    if (m >= 3 && m <= 10) return `${m} دقائق`;
    return `${m} دقيقة`;
  }
  let mStr = `${m} دقيقة`;
  if (m === 1) mStr = 'دقيقة واحدة';
  else if (m === 2) mStr = 'دقيقتان';
  else if (m >= 3 && m <= 10) mStr = `${m} دقائق`;

  return `${mStr} و ${s} ثانية`;
};

const StudentLevelIllustration: React.FC<{
  levelKey: StudentLevelKey;
  isDarkMode: boolean;
}> = ({ levelKey }) => {
  if (levelKey === 'excellent') {
    return (
      <svg className="w-32 h-32 md:w-40 md:h-40 drop-shadow-2xl" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FEF08A" />
            <stop offset="50%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>
          <linearGradient id="glowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FDE68A" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <circle cx="80" cy="80" r="68" fill="url(#glowGrad)" />
        <circle cx="80" cy="80" r="54" fill="#FEF3C7" fillOpacity="0.25" stroke="#F59E0B" strokeWidth="2" strokeDasharray="4 3" />
        
        {/* Base */}
        <rect x="56" y="118" width="48" height="10" rx="3" fill="#92400E" />
        <path d="M62 118 L68 98 L92 98 L98 118 Z" fill="url(#goldGrad)" />
        <rect x="73" y="94" width="14" height="6" fill="#F59E0B" />
        
        {/* Trophy Cup */}
        <path d="M50 48 Q50 94 80 94 Q110 94 110 48 Z" fill="url(#goldGrad)" />
        <path d="M54 52 Q54 88 80 88 Q106 88 106 52 Z" fill="#FBBF24" fillOpacity="0.4" />
        
        {/* Handles */}
        <path d="M50 54 C34 54 34 76 52 78" stroke="url(#goldGrad)" strokeWidth="6" strokeLinecap="round" fill="none" />
        <path d="M110 54 C126 54 126 76 108 78" stroke="url(#goldGrad)" strokeWidth="6" strokeLinecap="round" fill="none" />
        
        {/* Crown on top */}
        <path d="M64 42 L68 28 L80 36 L92 28 L96 42 Z" fill="#F59E0B" stroke="#B45309" strokeWidth="1.5" />
        <circle cx="68" cy="27" r="2.5" fill="#EF4444" />
        <circle cx="80" cy="35" r="3" fill="#3B82F6" />
        <circle cx="92" cy="27" r="2.5" fill="#10B981" />
        
        {/* Star in Cup */}
        <path d="M80 58 L82.5 64 L89 65 L84 69.5 L85.5 76 L80 72.5 L74.5 76 L76 69.5 L71 65 L77.5 64 Z" fill="#FEF08A" stroke="#B45309" strokeWidth="1" />
        
        {/* Laurels */}
        <path d="M40 106 Q36 84 46 68" stroke="#D97706" strokeWidth="3" strokeLinecap="round" />
        <path d="M120 106 Q124 84 114 68" stroke="#D97706" strokeWidth="3" strokeLinecap="round" />
        
        {/* 5 Stars */}
        <g fill="#F59E0B">
          <circle cx="34" cy="46" r="3" />
          <circle cx="54" cy="22" r="3" />
          <circle cx="80" cy="14" r="3.5" fill="#EF4444" stroke="#F59E0B" strokeWidth="1.5" />
          <circle cx="106" cy="22" r="3" />
          <circle cx="126" cy="46" r="3" />
        </g>
      </svg>
    );
  }

  if (levelKey === 'very_good') {
    return (
      <svg className="w-32 h-32 md:w-40 md:h-40 drop-shadow-2xl" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="blueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#93C5FD" />
            <stop offset="50%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#1E40AF" />
          </linearGradient>
          <linearGradient id="silverGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F8FAFC" />
            <stop offset="50%" stopColor="#CBD5E1" />
            <stop offset="100%" stopColor="#64748B" />
          </linearGradient>
          <linearGradient id="blueGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#BFDBFE" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <circle cx="80" cy="80" r="68" fill="url(#blueGlow)" />
        
        {/* Ribbon */}
        <path d="M62 40 L50 96 L66 88 L80 102 L70 40 Z" fill="#2563EB" />
        <path d="M98 40 L110 96 L94 88 L80 102 L90 40 Z" fill="#1D4ED8" />
        <path d="M66 40 L58 84 L70 78 Z" fill="#60A5FA" />
        <path d="M94 40 L102 84 L90 78 Z" fill="#3B82F6" />
        
        {/* Medallion Outer */}
        <circle cx="80" cy="74" r="38" fill="url(#silverGrad)" stroke="#475569" strokeWidth="2" />
        <circle cx="80" cy="74" r="32" fill="url(#blueGrad)" />
        <circle cx="80" cy="74" r="28" stroke="#93C5FD" strokeWidth="1.5" strokeDasharray="3 3" />
        
        {/* Central Star */}
        <path d="M80 54 L84 66 L96 68 L86 76 L89 88 L80 81 L71 88 L74 76 L64 68 L76 66 Z" fill="#FFFFFF" />
        
        {/* Laurels */}
        <path d="M42 98 Q36 76 46 60" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M118 98 Q124 76 114 60" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" />
        
        {/* 4 Stars banner */}
        <g fill="#F59E0B">
          <circle cx="52" cy="120" r="3" />
          <circle cx="70" cy="124" r="3.5" />
          <circle cx="90" cy="124" r="3.5" />
          <circle cx="108" cy="120" r="3" />
        </g>
      </svg>
    );
  }

  if (levelKey === 'good') {
    return (
      <svg className="w-32 h-32 md:w-40 md:h-40 drop-shadow-2xl" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="emeraldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6EE7B7" />
            <stop offset="50%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#047857" />
          </linearGradient>
          <linearGradient id="emeraldGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#A7F3D0" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <circle cx="80" cy="80" r="68" fill="url(#emeraldGlow)" />
        
        {/* Shield */}
        <path d="M80 32 L116 46 C116 82 98 108 80 122 C62 108 44 82 44 46 Z" fill="url(#emeraldGrad)" stroke="#065F46" strokeWidth="2.5" />
        <path d="M80 40 L108 51 C108 80 94 100 80 112 C66 100 52 80 52 51 Z" fill="#34D399" fillOpacity="0.25" stroke="#A7F3D0" strokeWidth="1.5" />
        
        {/* Checkmark in shield */}
        <path d="M68 76 L76 84 L94 64" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        
        {/* Top ribbon / crown */}
        <path d="M62 30 L80 20 L98 30 Z" fill="#F59E0B" />
        <circle cx="80" cy="20" r="2.5" fill="#EF4444" />
        
        {/* 3 Stars */}
        <g fill="#F59E0B">
          <circle cx="64" cy="132" r="3" />
          <circle cx="80" cy="134" r="3.5" />
          <circle cx="96" cy="132" r="3" />
        </g>
      </svg>
    );
  }

  if (levelKey === 'acceptable') {
    return (
      <svg className="w-32 h-32 md:w-40 md:h-40 drop-shadow-2xl" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="amberGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FCD34D" />
            <stop offset="50%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>
          <linearGradient id="amberGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FDE68A" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <circle cx="80" cy="80" r="68" fill="url(#amberGlow)" />
        
        {/* Target Rings */}
        <circle cx="80" cy="80" r="46" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="3" />
        <circle cx="80" cy="80" r="34" fill="#FDE68A" stroke="#D97706" strokeWidth="2.5" />
        <circle cx="80" cy="80" r="22" fill="url(#amberGrad)" stroke="#B45309" strokeWidth="2" />
        
        {/* Bullseye check */}
        <path d="M72 80 L78 86 L90 74" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        
        {/* Compass Crosshairs */}
        <line x1="80" y1="26" x2="80" y2="38" stroke="#D97706" strokeWidth="3" strokeLinecap="round" />
        <line x1="80" y1="122" x2="80" y2="134" stroke="#D97706" strokeWidth="3" strokeLinecap="round" />
        <line x1="26" y1="80" x2="38" y2="80" stroke="#D97706" strokeWidth="3" strokeLinecap="round" />
        <line x1="122" y1="80" x2="134" y2="80" stroke="#D97706" strokeWidth="3" strokeLinecap="round" />
        
        {/* 2 Stars */}
        <g fill="#F59E0B">
          <circle cx="70" cy="138" r="3.5" />
          <circle cx="90" cy="138" r="3.5" />
        </g>
      </svg>
    );
  }

  // weak (ضعيف / غير مجتاز)
  return (
    <svg className="w-32 h-32 md:w-40 md:h-40 drop-shadow-2xl" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="roseGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FDA4AF" />
          <stop offset="50%" stopColor="#F43F5E" />
          <stop offset="100%" stopColor="#BE123C" />
        </linearGradient>
        <linearGradient id="roseGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FECDD3" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#F43F5E" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <circle cx="80" cy="80" r="68" fill="url(#roseGlow)" />
      
      {/* Target Base / Launchpad */}
      <circle cx="80" cy="80" r="48" fill="#FFF1F2" stroke="#F43F5E" strokeWidth="2" strokeDasharray="4 3" />
      
      {/* Training Rocket Preparing to launch */}
      <path d="M80 34 C88 44 94 62 94 84 L66 84 C66 62 72 44 80 34 Z" fill="url(#roseGrad)" stroke="#9F1239" strokeWidth="1.5" />
      <circle cx="80" cy="58" r="6" fill="#FFFFFF" stroke="#BE123C" strokeWidth="1.5" />
      <circle cx="80" cy="58" r="3" fill="#38BDF8" />
      
      {/* Fins */}
      <path d="M66 74 L52 88 L66 88 Z" fill="#E11D48" />
      <path d="M94 74 L108 88 L94 88 Z" fill="#E11D48" />
      
      {/* Launch Thruster Flames */}
      <path d="M72 86 L80 102 L88 86 Z" fill="#F59E0B" />
      <path d="M75 86 L80 96 L85 86 Z" fill="#FEF08A" />
      
      {/* Alert badge at bottom */}
      <rect x="46" y="112" width="68" height="20" rx="10" fill="#FFE4E6" stroke="#F43F5E" strokeWidth="1.5" />
      <text x="80" y="126" textAnchor="middle" fill="#E11D48" fontSize="10" fontWeight="900" fontFamily="sans-serif">
        فرصة للتعلم 🚀
      </text>
    </svg>
  );
};

export const ExamRunner: React.FC<ExamRunnerProps> = ({
  examTitle,
  examId,
  questions = [],
  currentUser,
  defaultFolders = [],
  onFinishExam,
  onExit,
  isTimedInitial = false,
  examSystem = 'nimr',
  durationMinutes,
  targetPercentage = 90,
  isDarkMode = true,
  isFolderExam = false,
  folderId,
  folderTitle,
  courseId,
  courseTitle,
}) => {
  const currentCourseId = courseId || 'course_default_1';
  // Normalize and guard questions to completely eliminate any possibility of an empty or broken screen
  const safeQuestions: ExamQuestion[] = useMemo(() => {
    if (Array.isArray(questions) && questions.length > 0) {
      return questions.map((q, idx) => ({
        id: q?.id || `q_${idx}`,
        questionText: q?.questionText || `سؤال ${idx + 1}`,
        imageUrl: q?.imageUrl || '',
        options: (Array.isArray(q?.options) && q.options.length > 0)
          ? q.options.map((o) => (typeof o === 'string' ? o : String(o ?? '')))
          : ['الخيار أ', 'الخيار ب', 'الخيار ج', 'الخيار د'],
        correctOptionIndex: typeof q?.correctOptionIndex === 'number' ? q.correctOptionIndex : 0,
        explanation: q?.explanation || '',
      }));
    }
    return [
      {
        id: 'q_default_1',
        questionText: 'سؤال تدريبي: ما ناتج قسمة 120 على 4؟',
        imageUrl: '',
        options: ['30', '25', '40', '35'],
        correctOptionIndex: 0,
        explanation: '120 ÷ 4 = 30.',
      },
      {
        id: 'q_default_2',
        questionText: 'سماء : نجوم (تناظر لفظي)',
        imageUrl: '',
        options: ['حديقة : أشجار', 'بحر : سمك', 'غابة : حيوانات', 'مدينة : سيارات'],
        correctOptionIndex: 0,
        explanation: 'العلاقة: مكانية وتكوينية (السماء تزينها النجوم والحديقة تزينها الأشجار).',
      },
      {
        id: 'q_default_3',
        questionText: 'إذا كان س + ص = 10 و س - ص = 4 ، فما قيمة س؟',
        imageUrl: '',
        options: ['7', '6', '8', '5'],
        correctOptionIndex: 0,
        explanation: 'بجمع المعادلتين: 2س = 14 => س = 7.',
      }
    ];
  }, [questions]);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [isFinished, setIsFinished] = useState(false);
  const [examStartTime, setExamStartTime] = useState<number>(() => Date.now());
  const [timeSpentSeconds, setTimeSpentSeconds] = useState<number>(0);
  const [isTimed] = useState(isTimedInitial);
  const [showMobileQuestionsList, setShowMobileQuestionsList] = useState(false);

  // Exam system mode: 'nimr' | 'standard' | 'blue'
  const [systemMode, setSystemMode] = useState<ExamSystemType>(examSystem || 'nimr');

  useEffect(() => {
    if (examSystem) {
      setSystemMode(examSystem);
    }
  }, [examSystem]);

  // 1. Whiteboard visibility toggle: on desktop (>=1024px) start open, on mobile (<1024px) default closed so question is neatly framed in phone
  const [isWhiteboardOpen, setIsWhiteboardOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return false;
  });
  const [mobileViewMode, setMobileViewMode] = useState<'question' | 'whiteboard'>('question');

  // 2. Real-time user folders and folder questions
  const [userFolders, setUserFolders] = useState<FolderItem[]>(defaultFolders || []);
  const [userFolderQuestions, setUserFolderQuestions] = useState<FolderQuestionDoc[]>([]);
  const [showFolderModalForQ, setShowFolderModalForQ] = useState<ExamQuestion | null>(null);
  const [newFolderNameInput, setNewFolderNameInput] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [folderActionToast, setFolderActionToast] = useState<{ message: string; isError?: boolean } | null>(null);
  const [processingFolderIds, setProcessingFolderIds] = useState<Record<string, boolean>>({});

  // 3. Silent automatic transfer of mistakes in the background
  const [autoSavedMistakeIds, setAutoSavedMistakeIds] = useState<Record<string, boolean>>({});

  // 4. Prompt to delete correctly answered questions upon returning to platform from folder exam
  const [showDeleteCorrectPrompt, setShowDeleteCorrectPrompt] = useState(false);
  const [isDeletingCorrectQuestions, setIsDeletingCorrectQuestions] = useState(false);
  const [deleteCorrectError, setDeleteCorrectError] = useState<string | null>(null);

  // 5. Zoom Question Image Lightbox
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);
  const [imageZoomScale, setImageZoomScale] = useState<number>(1);

  // 6. Section Instructions, Exam Instructions, and Equations Modals (المستطيلات الأربعة تحت الأسئلة)
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [showExamInstructionsModal, setShowExamInstructionsModal] = useState(false);
  const [showEquationsModal, setShowEquationsModal] = useState(false);

  // Student National ID: توليد رقم هوية مختلف وعشوائي لكل مستخدم (10 أرقام تبدأ بـ 10)
  const nationalId = useMemo(() => {
    if (currentUser?.nationalId && currentUser.nationalId.trim() !== '') {
      return currentUser.nationalId;
    }
    const seed = (currentUser?.id || currentUser?.email || currentUser?.name || 'std_guest');
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash = hash & hash;
    }
    const absHash = Math.abs(hash);
    const suffix = String(absHash % 90000000 + 10000000);
    return `10${suffix}`;
  }, [currentUser]);

  // حالة زيارة الأسئلة وتمييز السؤال للمراجعة في نظام نمر
  const [visitedIndices, setVisitedIndices] = useState<Record<number, boolean>>({ 0: true });
  const [markedForReview, setMarkedForReview] = useState<Record<number, boolean>>({});

  useEffect(() => {
    setVisitedIndices((prev) => ({ ...prev, [currentIdx]: true }));
  }, [currentIdx]);

  // تاريخ اليوم المعروض في هيدر نظام نمر
  const currentDateStr = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const randomSessionDigits = useMemo(() => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }, []);

  // Calculate timer in seconds
  const totalSeconds = (durationMinutes && durationMinutes > 0)
    ? durationMinutes * 60
    : Math.max(60, safeQuestions.length * 75);

  const [timeLeft, setTimeLeft] = useState(totalSeconds);

  // Sync folders & folder_questions from unified studentFoldersStore (zero duplicate onSnapshot reads!)
  useEffect(() => {
    if (!currentUser?.id) return;

    const applyStoreSnapshot = () => {
      const snap = getStudentFoldersSnapshot(currentUser.id);
      const list: FolderItem[] = [];
      snap.folders.forEach((orig) => {
        const item = { ...orig };
        const matchesCourse = item.courseId
          ? item.courseId === currentCourseId
          : currentCourseId === 'course_default_1';
        if (!matchesCourse) return;
        if (item.isDefaultMistakesFolder || item.title === 'مجلد الاخطاء' || item.title === 'مجلد الأخطاء') {
          item.isDefaultMistakesFolder = true;
        }
        list.push(item);
      });

      list.sort((a, b) => {
        if (a.isDefaultMistakesFolder) return -1;
        if (b.isDefaultMistakesFolder) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      const records: FolderQuestionDoc[] = snap.folderQuestions.map((fq) => ({
        id: fq.id,
        folderId: fq.folderId,
        originalQuestionId: fq.originalQuestionId,
        questionText: fq.questionText || '',
      }));

      setUserFolders(list);
      setUserFolderQuestions(records);
    };

    applyStoreSnapshot();
    const unsub = subscribeStudentFolders(currentUser.id, applyStoreSnapshot);
    ensureStudentFoldersLoaded(currentUser.id);

    return () => unsub();
  }, [currentUser?.id, currentCourseId]);

  // Timer effect
  useEffect(() => {
    if (!isTimed || isFinished || safeQuestions.length === 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          finishTest();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isTimed, isFinished, safeQuestions.length]);

  // Ensure default Mistakes Folder exists for this student in the current course
  const ensureMistakesFolderExists = async (): Promise<string | null> => {
    if (!currentUser?.id) return null;
    return getOrCreateMistakesFolderId(currentUser.id, currentCourseId);
  };

  // Option select handler: purely records the student's selected answer during test
  const handleSelectOption = (qIdx: number, optionIdx: number) => {
    if (isFinished) return;
    setSelectedAnswers((prev) => ({
      ...prev,
      [qIdx]: optionIdx,
    }));
  };

  // Student manually ADDS question to a specific folder:
  // Shows checkmark and toast: "تم اضافة السؤال الى هذا المجلد"
  const handleAddQuestionToFolder = async (question: ExamQuestion, folder: FolderItem) => {
    if (!currentUser?.id || !folder?.id) return;
    setProcessingFolderIds((prev) => ({ ...prev, [folder.id]: true }));

    // Optimistic UI addition so the checkmark appears immediately
    const optimisticId = `temp_${Date.now()}`;
    setUserFolderQuestions((prev) => [
      ...prev,
      {
        id: optimisticId,
        folderId: folder.id,
        originalQuestionId: question.id,
        questionText: question.questionText,
      },
    ]);

    try {
      const createdAt = new Date().toISOString();
      const payload = {
        folderId: folder.id,
        courseId: currentCourseId,
        userId: currentUser.id,
        originalQuestionId: question.id,
        questionText: question.questionText,
        imageUrl: question.imageUrl || '',
        options: question.options,
        correctOptionIndex: question.correctOptionIndex,
        explanation: question.explanation || '',
        sourceExamTitle: examTitle,
        createdAt,
      };
      const addedDocRef = await addDoc(collection(db, 'folder_questions'), payload);

      addLocalFolderQuestion(currentUser.id, { id: addedDocRef.id, ...payload });
      setUserFolderQuestions((prev) =>
        prev.map((rec) => (rec.id === optimisticId ? { ...rec, id: addedDocRef.id } : rec))
      );

      setFolderActionToast({ message: 'تم اضافة السؤال الى هذا المجلد' });
      setTimeout(() => setFolderActionToast(null), 2500);
    } catch (err) {
      console.error('Error adding question to folder:', err);
      setUserFolderQuestions((prev) => prev.filter((rec) => rec.id !== optimisticId));
      setFolderActionToast({ message: 'حدث خطأ أثناء حفظ السؤال في المجلد', isError: true });
      setTimeout(() => setFolderActionToast(null), 3000);
    } finally {
      setProcessingFolderIds((prev) => ({ ...prev, [folder.id]: false }));
    }
  };

  // Student clicks again to DELETE / REMOVE question from a folder:
  // Hides checkmark, deletes doc from Firestore, and shows toast: "تم حذف السؤال من هذا المجلد"
  const handleDeleteQuestionFromFolder = async (folderQuestionDocId: string, _folderTitle: string, folderId: string) => {
    if (!folderId) return;
    setProcessingFolderIds((prev) => ({ ...prev, [folderId]: true }));

    const prevFolderQuestions = [...userFolderQuestions];

    setUserFolderQuestions((prev) =>
      prev.filter((fq) => fq.id !== folderQuestionDocId)
    );

    try {
      if (folderQuestionDocId && !folderQuestionDocId.startsWith('temp_')) {
        await deleteDoc(doc(db, 'folder_questions', folderQuestionDocId));
        removeLocalFolderQuestions(currentUser.id, [folderQuestionDocId]);
      } else {
        const qSnap = await getDocs(
          query(
            collection(db, 'folder_questions'),
            where('userId', '==', currentUser.id),
            where('folderId', '==', folderId),
            where('questionText', '==', showFolderModalForQ?.questionText || '')
          )
        );
        const deletedIds: string[] = [];
        for (const docD of qSnap.docs) {
          await deleteDoc(docD.ref);
          deletedIds.push(docD.id);
        }
        removeLocalFolderQuestions(currentUser.id, deletedIds);
      }

      if (showFolderModalForQ && currentUser?.id) {
        await markQuestionAsPermanentlyDeleted({
          userId: currentUser.id,
          courseId: currentCourseId,
          folderId,
          originalQuestionId: showFolderModalForQ.id,
          alternateOriginalQuestionId:
            folderQuestionDocId && folderQuestionDocId !== showFolderModalForQ.id
              ? folderQuestionDocId
              : undefined,
          questionText: showFolderModalForQ.questionText,
          imageUrl: showFolderModalForQ.imageUrl,
        });
      }

      setFolderActionToast({ message: 'تم حذف السؤال من هذا المجلد' });
      setTimeout(() => setFolderActionToast(null), 2500);
    } catch (err) {
      console.error('Error removing question from folder:', err);
      setUserFolderQuestions(prevFolderQuestions);
      setFolderActionToast({ message: 'حدث خطأ أثناء حذف السؤال من المجلد', isError: true });
      setTimeout(() => setFolderActionToast(null), 3000);
    } finally {
      setProcessingFolderIds((prev) => ({ ...prev, [folderId]: false }));
    }
  };

  // Create new folder directly from inside exam and save question into it
  const handleCreateNewFolderAndAdd = async (question: ExamQuestion) => {
    const trimmed = newFolderNameInput.trim();
    if (!trimmed || !currentUser?.id) return;
    setIsCreatingFolder(true);

    try {
      const createdAt = new Date().toISOString();
      const folderPayload = {
        userId: currentUser.id,
        courseId: currentCourseId,
        title: trimmed,
        isDefaultMistakesFolder: false,
        createdAt,
      };
      const newRef = await addDoc(collection(db, 'folders'), folderPayload);

      const newFolderItem: FolderItem = {
        id: newRef.id,
        ...folderPayload,
      };

      addLocalFolder(currentUser.id, newFolderItem);
      setNewFolderNameInput('');
      await handleAddQuestionToFolder(question, newFolderItem);
    } catch (err) {
      console.error('Error creating folder in exam:', err);
      setFolderActionToast({ message: 'حدث خطأ أثناء إنشاء المجلد', isError: true });
      setTimeout(() => setFolderActionToast(null), 3000);
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const calculateScore = () => {
    let correct = 0;
    safeQuestions.forEach((q, idx) => {
      if (selectedAnswers[idx] === q.correctOptionIndex) {
        correct++;
      }
    });
    return correct;
  };

  const finishTest = async () => {
    setIsFinished(true);
    const elapsed = Math.max(1, Math.round((Date.now() - examStartTime) / 1000));
    setTimeSpentSeconds(elapsed);
    const score = calculateScore();
    const total = Math.max(1, safeQuestions.length);
    const percentage = Math.round((score / total) * 100);

    // Transfer ONLY and strictly the questions the student got wrong in this exam:
    // If the student made 3 errors in Test 1, exactly and only those 3 questions transfer.
    // If they made 10 errors in Test 2, exactly and only those 10 transfer.
    // Correctly answered questions are NEVER transferred!
    if (!isFolderExam && currentUser?.id) {
      const wrongItems: { question: ExamQuestion; studentAnswerIndex: number }[] = [];
      safeQuestions.forEach((q, idx) => {
        const studentAns = selectedAnswers[idx];
        if (studentAns === undefined || studentAns !== q.correctOptionIndex) {
          wrongItems.push({
            question: q,
            studentAnswerIndex: typeof studentAns === 'number' ? studentAns : -1,
          });
        }
      });

      const wrongQuestionsPromises = wrongItems.map((item) =>
        transferMistakeImmediately({
          userId: currentUser.id,
          courseId: currentCourseId,
          examTitle,
          question: item.question,
          studentAnswerIndex: item.studentAnswerIndex,
        })
      );

      try {
        await Promise.allSettled(wrongQuestionsPromises);
      } catch (transferErr) {
        console.error('Error transferring mistakes in finishTest:', transferErr);
      }
    }

    if (percentage >= (targetPercentage || 80)) {
      confetti({
        particleCount: 120,
        spread: 90,
        origin: { y: 0.6 }
      });
    }

    try {
      if (currentUser?.id) {
        const nowIso = new Date().toISOString();
        const tempAttemptId = `local_att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const attemptPayload = {
          userId: currentUser.id,
          studentName: currentUser.name || 'طالب',
          studentNationalId: nationalId,
          examId: examId,
          examTitle: examTitle,
          examSystem: systemMode,
          score,
          totalQuestions: total,
          percentage,
          isTimed,
          durationSeconds: elapsed,
          targetPercentage: targetPercentage || 90,
          createdAt: nowIso,
        };

        // Save immediately to local cache so it always appears in "قائمة الاختبارات المحلولة" immediately
        const cachedList = saveLocalExamAttempt(currentUser.id, {
          id: tempAttemptId,
          ...attemptPayload,
        });

        const addedAttemptRef = await addDoc(collection(db, 'exam_attempts'), attemptPayload);
        replaceLocalAttemptId(currentUser.id, tempAttemptId, addedAttemptRef.id);

        let updatedCount = cachedList.length;
        let updatedAvg =
          cachedList.length > 0
            ? Math.round(cachedList.reduce((sum, a) => sum + (a.percentage || 0), 0) / cachedList.length)
            : percentage;

        // Only query historical exam_attempts once if cache wasn't already synced recently
        if (!hasSyncedExamAttemptsRecently(currentUser.id)) {
          try {
            const attemptsQuery = query(
              collection(db, 'exam_attempts'),
              where('userId', '==', currentUser.id)
            );
            const attemptsSnap = await getDocs(attemptsQuery);
            let totalPerc = 0;
            let count = 0;
            attemptsSnap.forEach((docSnap) => {
              const d = docSnap.data();
              if (typeof d.percentage === 'number') {
                totalPerc += d.percentage;
                count++;
              }
            });
            if (count > 0) {
              updatedCount = count;
              updatedAvg = Math.round(totalPerc / count);
            }
          } catch {}
        }

        const userRef = doc(db, 'users', currentUser.id);
        await updateDoc(userRef, {
          totalExamsTaken: updatedCount,
          averageScore: updatedAvg,
        });
      }

      onFinishExam();
    } catch (err) {
      reportFirestoreListenerError(err, OperationType.WRITE, 'exam_attempts');
      console.error('Error saving exam attempt:', err);
      onFinishExam();
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const correctFolderQuestions = useMemo(() => {
    if (!isFolderExam) return [];
    return safeQuestions.filter((q, idx) => selectedAnswers[idx] === q.correctOptionIndex);
  }, [isFolderExam, safeQuestions, selectedAnswers]);

  const wrongOrUnansweredFolderQuestionIds = useMemo(() => {
    if (!isFolderExam) return [];
    return safeQuestions
      .filter((_q, idx) => selectedAnswers[idx] !== safeQuestions[idx].correctOptionIndex)
      .map((q) => q.id)
      .filter(Boolean);
  }, [isFolderExam, safeQuestions, selectedAnswers]);

  // Exit request handler: on finished folder exams with at least 1 correct answer,
  // ask the student whether to permanently delete correctly answered questions or keep them.
  const handleRequestExit = () => {
    if (isFolderExam && isFinished && correctFolderQuestions.length > 0) {
      setDeleteCorrectError(null);
      setShowDeleteCorrectPrompt(true);
      return;
    }
    onExit();
  };

  // Student chose "نعم" — permanently delete ONLY correctly answered questions so they never return
  const handleConfirmDeleteCorrectAndExit = async () => {
    if (isDeletingCorrectQuestions) return;
    if (!currentUser?.id || correctFolderQuestions.length === 0) {
      setShowDeleteCorrectPrompt(false);
      onExit();
      return;
    }

    setIsDeletingCorrectQuestions(true);
    setDeleteCorrectError(null);

    try {
      const effectiveFolderId =
        folderId ||
        userFolderQuestions.find((fq) => correctFolderQuestions.some((cq) => cq.id === fq.id))?.folderId ||
        '';

      const deletedIds = await deleteCorrectQuestionsFromFolderPermanently({
        userId: currentUser.id,
        courseId: currentCourseId,
        folderId: effectiveFolderId || undefined,
        questions: correctFolderQuestions,
        excludeIds: wrongOrUnansweredFolderQuestionIds,
      });

      const deletedIdSet = new Set(deletedIds);
      const excludedIdSet = new Set(wrongOrUnansweredFolderQuestionIds);

      // Remove strictly the deleted doc IDs from local state, never touching wrongly answered questions
      setUserFolderQuestions((prev) =>
        prev.filter((fq) => {
          if (excludedIdSet.has(fq.id)) return true;
          if (deletedIdSet.has(fq.id)) return false;
          return true;
        })
      );

      setShowDeleteCorrectPrompt(false);
      onExit();
    } catch (err) {
      console.error('Error permanently deleting correct folder questions:', err);
      setDeleteCorrectError('حدث خطأ أثناء حذف الأسئلة من المجلد. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsDeletingCorrectQuestions(false);
    }
  };

  // Student chose "لا" — keep all questions in the folder permanently until deleted manually
  const handleKeepQuestionsAndExit = () => {
    if (isDeletingCorrectQuestions) return;
    setShowDeleteCorrectPrompt(false);
    onExit();
  };

  // Helper to find existing record for a given question in a given folder
  const findFolderQuestionMatch = (question?: ExamQuestion | null, folderId?: string) => {
    if (!question || !folderId || !Array.isArray(userFolderQuestions)) return undefined;
    try {
      return userFolderQuestions.find(
        (fq) => fq && fq.folderId === folderId && ((question.id && fq.originalQuestionId === question.id) || (question.questionText && fq.questionText === question.questionText))
      );
    } catch (e) {
      return undefined;
    }
  };

  // Helper to get all non-mistakes folders that currently contain this question
  const getCustomFoldersForQuestion = (question?: ExamQuestion | null) => {
    if (!question || !Array.isArray(userFolders) || !Array.isArray(userFolderQuestions)) return [];
    try {
      const mistakeFolder = userFolders.find((f) => f && (f.isDefaultMistakesFolder || f.title === 'مجلد الاخطاء'));
      return userFolders.filter((f) => {
        if (!f || f.id === mistakeFolder?.id) return false;
        return userFolderQuestions.some(
          (fq) => fq && fq.folderId === f.id && ((question.id && fq.originalQuestionId === question.id) || (question.questionText && fq.questionText === question.questionText))
        );
      });
    } catch (e) {
      return [];
    }
  };

  // If exam has no questions at all
  if (safeQuestions.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center min-h-[500px] p-8 text-center space-y-5 rounded-3xl border shadow-xl ${
        isDarkMode ? 'bg-slate-900/90 border-slate-800 text-white' : 'bg-white border-slate-200 text-black'
      }`}>
        <div className="p-4 rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
          <AlertCircle className="w-12 h-12" />
        </div>
        <div className="space-y-1">
          <h3 className={`text-xl font-black ${isDarkMode ? 'text-white' : 'text-black'}`}>لا توجد أسئلة مضافة لهذا الاختبار بعد</h3>
          <p className={`text-xs max-w-md ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>
            لم يقم المشرف بإضافة أسئلة إلى هذا الاختبار حتى الآن، أو جارٍ تحديث المحتوى.
          </p>
        </div>
        <button
          onClick={handleRequestExit}
          className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition shadow-lg shadow-blue-600/25"
        >
          العودة للرئيسية
        </button>
      </div>
    );
  }

  // ================= 4. RESULTS / FINISHED SCREEN =================
  if (isFinished) {
    const score = calculateScore();
    const total = Math.max(1, safeQuestions.length);
    const percentage = Math.round((score / total) * 100);
    const passedTarget = percentage >= (targetPercentage || 90);
    const wrongCount = safeQuestions.length - score;
    const finalDuration = timeSpentSeconds > 0 ? timeSpentSeconds : Math.max(1, Math.round((Date.now() - examStartTime) / 1000));
    const levelData = getStudentLevelData(percentage);

    return (
      <div className={`p-4 md:p-8 max-w-5xl mx-auto space-y-6 ${isDarkMode ? 'text-white' : 'text-black'}`}>
        <div className={`border rounded-3xl p-6 md:p-8 shadow-2xl backdrop-blur-xl ${
          isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          {/* Header Title & Target Feedback */}
          <div className="text-center pb-6 border-b border-slate-200 dark:border-slate-800/80 mb-6 space-y-2">
            <h2 className={`text-2xl md:text-3xl font-black ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              نتيجة الاختبار: {examTitle}
            </h2>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs md:text-sm font-bold mx-auto">
              {passedTarget ? (
                <span className="text-emerald-500 flex items-center gap-1.5 font-black">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>تهانينا! حققت نسبة الامتياز والهدف المحدد (%{targetPercentage || 90} فأعلى) ⚡🎉</span>
                </span>
              ) : (
                <span className="text-amber-600 flex items-center gap-1.5 font-black">
                  <Target className="w-4 h-4" />
                  <span>الحد المستهدف للتميز: %{targetPercentage || 90} — واصل التدريب لتحقيق هدفك!</span>
                </span>
              )}
            </div>
          </div>

          {/* Main 2-Column Result Layout:
              RIGHT SIDE (على اليمين): صورة لمستوى الطالب (ممتاز أو ضعيف أو جيد جداً أو مقبول أو مجتاز أو غير مجتاز بالاختبار)
              LEFT SIDE (على اليسار): 4 قوائم بالترتيب الدقيق: أول قائمة الدرجة، ثاني قائمة الأسئلة الصحيحة، ثالث قائمة الأسئلة الخاطئة، رابع قائمة الوقت المستغرق */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* RIGHT SIDE (على اليمين): صورة لمستوى الطالب وتقييمه */}
            <div className={`lg:col-span-5 p-6 rounded-3xl border flex flex-col items-center justify-between text-center relative overflow-hidden shadow-lg ${
              isDarkMode ? 'bg-slate-800/80 border-slate-700/80' : 'bg-slate-50/95 border-slate-200'
            }`}>
              {/* Background ambient glow */}
              <div className={`absolute -top-16 -right-16 w-52 h-52 rounded-full blur-3xl opacity-35 bg-gradient-to-br ${levelData.glowColor} pointer-events-none`} />

              <div className="w-full space-y-4 relative z-10">
                {/* Header tag showing pass/fail status */}
                <div className="flex items-center justify-between w-full pb-3 border-b border-slate-200 dark:border-slate-700/70">
                  <span className="text-xs font-bold text-slate-400">تقييم مستوى الطالب</span>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border shadow-sm ${
                    levelData.isPassed
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                  }`}>
                    {levelData.isPassed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                    <span>{levelData.statusTitle}</span>
                  </span>
                </div>

                {/* صورة لمستوى الطالب (SVG Illustration) */}
                <div className="py-2 flex justify-center transform hover:scale-105 transition-transform duration-300">
                  <StudentLevelIllustration levelKey={levelData.key} isDarkMode={isDarkMode} />
                </div>

                {/* Level Title, Stars, and Pass/Fail Explicit Label */}
                <div className="space-y-2">
                  <div className="inline-block">
                    <span className={`text-2xl md:text-3xl font-black bg-gradient-to-r ${levelData.badgeGradient} bg-clip-text text-transparent`}>
                      المستوى: {levelData.title}
                    </span>
                  </div>

                  <div className="flex items-center justify-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-5 h-5 ${
                          s <= levelData.stars
                            ? 'fill-amber-400 text-amber-400 filter drop-shadow'
                            : isDarkMode
                            ? 'text-slate-700'
                            : 'text-slate-300'
                        }`}
                      />
                    ))}
                  </div>

                  {/* Pass / Fail Explicit Label */}
                  <div className="pt-1">
                    <span className={`text-sm font-black px-4 py-1 rounded-xl inline-block ${
                      levelData.isPassed
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                    }`}>
                      {levelData.isPassed ? '✓ مجتاز بالاختبار' : '⚠️ غير مجتاز بالاختبار'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Motivational feedback quote */}
              <div className={`mt-5 pt-4 border-t border-slate-200 dark:border-slate-700/70 w-full relative z-10 text-xs md:text-sm font-semibold leading-relaxed ${
                isDarkMode ? 'text-slate-300' : 'text-slate-700'
              }`}>
                {levelData.quote}
              </div>
            </div>

            {/* LEFT SIDE (على اليسار): البطاقات الإحصائية للنتيجة */}
            <div className="lg:col-span-7 flex flex-col gap-3.5 justify-between">
              {/* الدرجة */}
              <div className={`p-4 md:p-5 rounded-2xl border transition shadow-sm ${
                isDarkMode ? 'bg-slate-800/80 border-slate-700/80 hover:border-slate-600' : 'bg-slate-50/95 border-slate-200 hover:border-slate-300'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center border border-blue-500/20 shrink-0">
                      <Award className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className={`text-base md:text-lg font-black ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                        الدرجة
                      </h4>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                        النسبة المئوية والنقاط المحققة
                      </span>
                    </div>
                  </div>
                  <span className={`text-2xl md:text-3xl font-black ${
                    percentage >= 90
                      ? 'text-amber-500'
                      : percentage >= 60
                      ? 'text-emerald-500'
                      : 'text-rose-500'
                  }`}>
                    %{percentage}
                  </span>
                </div>
                
                <div className="flex items-center justify-between text-xs font-semibold mb-2 text-slate-500 dark:text-slate-400">
                  <span>الدرجة: {score} من إجمالي {total}</span>
                  <span>{passedTarget ? '🎯 حققت الهدف المحدد' : `الهدف المستهدف: %${targetPercentage || 90}`}</span>
                </div>

                <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${
                      percentage >= 90
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                        : percentage >= 60
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                        : 'bg-gradient-to-r from-rose-500 to-red-400'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(4, percentage))}%` }}
                  />
                </div>
              </div>

              {/* الأسئلة الصحيحة */}
              <div className={`p-4 md:p-5 rounded-2xl border transition shadow-sm ${
                isDarkMode ? 'bg-slate-800/80 border-slate-700/80 hover:border-slate-600' : 'bg-slate-50/95 border-slate-200 hover:border-slate-300'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20 shrink-0">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className={`text-base md:text-lg font-black ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                        الأسئلة الصحيحة
                      </h4>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                        إجابات نموذجية تمت الإجابة عليها بنجاح
                      </span>
                    </div>
                  </div>
                  <span className="text-xl md:text-2xl font-black text-emerald-500">
                    {score} <span className="text-xs font-bold text-slate-500 dark:text-slate-400">سؤالاً</span>
                  </span>
                </div>
              </div>

              {/* الأسئلة الخاطئة */}
              <div className={`p-4 md:p-5 rounded-2xl border transition shadow-sm ${
                isDarkMode ? 'bg-slate-800/80 border-slate-700/80 hover:border-slate-600' : 'bg-slate-50/95 border-slate-200 hover:border-slate-300'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${
                      wrongCount > 0
                        ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                        : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    }`}>
                      {wrongCount > 0 ? <XCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                    </div>
                    <div>
                      <h4 className={`text-base md:text-lg font-black ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                        الأسئلة الخاطئة
                      </h4>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                        {wrongCount > 0
                          ? 'نُقلت تلقائياً إلى مجلد الأخطاء للمراجعة والتدريب'
                          : 'لا توجد أخطاء — أداء متكامل 100%'}
                      </span>
                    </div>
                  </div>
                  <span className={`text-xl md:text-2xl font-black ${wrongCount > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                    {wrongCount} <span className="text-xs font-bold text-slate-500 dark:text-slate-400">أسئلة</span>
                  </span>
                </div>
              </div>

              {/* الوقت المستغرق */}
              <div className={`p-4 md:p-5 rounded-2xl border transition shadow-sm ${
                isDarkMode ? 'bg-slate-800/80 border-slate-700/80 hover:border-slate-600' : 'bg-slate-50/95 border-slate-200 hover:border-slate-300'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center border border-indigo-500/20 shrink-0">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className={`text-base md:text-lg font-black ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                        الوقت المستغرق
                      </h4>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                        {formatArabicTime(finalDuration)} ({isTimed ? 'اختبار مؤقت' : 'تدريب حر'})
                      </span>
                    </div>
                  </div>
                  <span className="text-xl md:text-2xl font-mono font-black text-indigo-500" dir="ltr">
                    {formatDigitalTime(finalDuration)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Prominent Mistake Transfer Announcement at end of exam */}
          {wrongCount > 0 ? (
            <div className={`mt-6 p-5 border-2 rounded-3xl text-right shadow-2xl ${
              isDarkMode
                ? 'bg-gradient-to-r from-indigo-950/90 via-purple-950/70 to-slate-900 border-indigo-500/50'
                : 'bg-indigo-50/80 border-indigo-400 text-black'
            }`}>
              <div className="flex items-start gap-3.5">
                <div className="p-3 rounded-2xl bg-indigo-500/20 text-indigo-500 border border-indigo-500/40 shrink-0">
                  <BookmarkPlus className="w-6 h-6 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h4 className={`text-base font-black flex items-center gap-2 ${
                    isDarkMode ? 'text-white' : 'text-indigo-950'
                  }`}>
                    <span>📌 تنبيه تعليمي هام: تم نقل أخطائك إلى مجلد الأخطاء</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-600 border border-indigo-400/30 font-black">
                      {wrongCount} أسئلة
                    </span>
                  </h4>
                  <p className={`text-xs md:text-sm leading-relaxed font-semibold ${
                    isDarkMode ? 'text-indigo-200' : 'text-slate-900'
                  }`}>
                    تم نقل جميع الأسئلة التي حدث بها خطأ تلقائياً إلى <strong>"مجلد الأخطاء"</strong> الثابت في حسابك، لتتمكن من مراجعتها لاحقاً والتدرّب عليها لضمان عدم تكرار الخطأ والوصول للمئوية بإذن الله!
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-600 text-xs md:text-sm font-black text-center">
              ✨ أداء أسطوري! لا توجد أخطاء في هذا الاختبار، درجتك كاملة 100%!
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-6 border-t border-slate-200 dark:border-slate-800/80 mt-6">
            <button
              onClick={() => {
                setSelectedAnswers({});
                setCurrentIdx(0);
                setIsFinished(false);
                setTimeLeft(totalSeconds);
                setExamStartTime(Date.now());
                setTimeSpentSeconds(0);
              }}
              className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-xs md:text-sm transition border ${
                isDarkMode
                  ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
                  : 'bg-slate-100 hover:bg-slate-200 text-black border-slate-300'
              }`}
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة الاختبار</span>
            </button>

            <button
              onClick={handleRequestExit}
              className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs md:text-sm transition shadow-lg shadow-blue-600/30"
            >
              <Home className="w-4 h-4" />
              <span>العودة للمنصة</span>
            </button>
          </div>
        </div>

        {/* Detailed Question Review List */}
        <div className={`border rounded-3xl p-6 md:p-8 shadow-xl space-y-6 ${
          isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className={`text-lg font-black ${isDarkMode ? 'text-white' : 'text-black'}`}>
                مراجعة تفصيلية لجميع الأسئلة
              </h3>
              <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-black font-semibold'}`}>
                راجع إجاباتك وقارنها بالحل الصحيح والتوضيحات المرفقة
              </p>
            </div>
            <span className={`text-xs font-black px-3 py-1 rounded-full border ${
              isDarkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-black border-slate-300'
            }`}>
              إجمالي {safeQuestions.length} سؤال
            </span>
          </div>

          <div className="space-y-4">
            {safeQuestions.map((q, idx) => {
              const userAns = selectedAnswers[idx];
              const isCorrect = userAns === q.correctOptionIndex;
              const isUnanswered = userAns === undefined;
              const customFolders = getCustomFoldersForQuestion(q);

              return (
                <div
                  key={q.id || idx}
                  className={`p-5 rounded-2xl border transition-all ${
                    isCorrect
                      ? isDarkMode ? 'bg-emerald-950/15 border-emerald-500/30' : 'bg-emerald-50/50 border-emerald-200'
                      : isDarkMode ? 'bg-rose-950/15 border-rose-500/30' : 'bg-rose-50/50 border-rose-200'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="space-y-3 flex-1">
                      {/* Status Badges */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black px-2.5 py-0.5 rounded-lg bg-blue-500/20 text-blue-600 border border-blue-500/30">
                          سؤال {idx + 1}
                        </span>

                        {isCorrect ? (
                          <span className="text-xs font-black px-2.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-600 border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>إجابة صحيحة ✓</span>
                          </span>
                        ) : (
                          <span className="text-xs font-black px-2.5 py-0.5 rounded-lg bg-rose-500/20 text-rose-600 border border-rose-500/30 flex items-center gap-1">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>{isUnanswered ? 'لم يتم الحل' : 'إجابة خاطئة'}</span>
                          </span>
                        )}

                        {/* Automatic Mistakes folder badge on wrong questions */}
                        {!isCorrect && (
                          <span className="text-[11px] font-black px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1">
                            <BookmarkPlus className="w-3.5 h-3.5" />
                            <span>تم الحفظ في مجلد الأخطاء تلقائياً 📌</span>
                          </span>
                        )}

                        {/* Custom user folders badges */}
                        {customFolders.map((f) => (
                          <span
                            key={f.id}
                            className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 flex items-center gap-1"
                          >
                            📁 {f.title}
                          </span>
                        ))}
                      </div>

                      {/* Question Text */}
                      <h4 className={`text-sm md:text-base font-black leading-relaxed ${
                        isDarkMode ? 'text-white' : 'text-black'
                      }`}>
                        {q.questionText}
                      </h4>

                      {/* Optional Image */}
                      {q.imageUrl && (
                        <div className="relative group max-w-md">
                          <div
                            onClick={() => {
                              setZoomedImageUrl(q.imageUrl || null);
                              setImageZoomScale(1);
                            }}
                            className="rounded-xl overflow-hidden border border-slate-700 p-1 bg-black/40 cursor-pointer hover:border-amber-400 transition"
                            title="انقر لتكبير صورة السؤال"
                          >
                            <img
                              src={q.imageUrl}
                              alt="صورة السؤال"
                              className="max-h-48 object-contain rounded-lg mx-auto"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setZoomedImageUrl(q.imageUrl || null);
                              setImageZoomScale(1);
                            }}
                            className="absolute top-2 left-2 px-2.5 py-1 rounded-lg bg-black/80 hover:bg-black text-amber-300 text-[11px] font-bold border border-amber-500/40 flex items-center gap-1 shadow backdrop-blur-md transition cursor-pointer"
                          >
                            <ZoomIn className="w-3 h-3 text-amber-400" />
                            <span>تكبير الصورة 🔍</span>
                          </button>
                        </div>
                      )}

                      {/* Options Review */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {q.options.map((opt, optIdx) => {
                          const isCorrectChoice = optIdx === q.correctOptionIndex;
                          const isUserChoice = optIdx === userAns;

                          let optStyle = isDarkMode
                            ? 'bg-slate-800/40 border-slate-700/60 text-slate-300'
                            : 'bg-white border-slate-200 text-black font-medium';

                          if (isCorrectChoice) {
                            optStyle = isDarkMode
                              ? 'bg-emerald-600/25 border-emerald-500/80 text-emerald-200 font-black'
                              : 'bg-emerald-100 border-emerald-500 text-emerald-950 font-black';
                          } else if (isUserChoice && !isCorrectChoice) {
                            optStyle = isDarkMode
                              ? 'bg-rose-600/20 border-rose-500/60 text-rose-300 font-bold line-through'
                              : 'bg-rose-100 border-rose-500 text-rose-950 font-bold line-through';
                          }

                          return (
                            <div
                              key={optIdx}
                              className={`p-3 rounded-xl border text-xs md:text-sm flex items-center justify-between ${optStyle}`}
                            >
                              <span>{opt}</span>
                              {isCorrectChoice && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                              {isUserChoice && !isCorrectChoice && <XCircle className="w-4 h-4 text-rose-500" />}
                            </div>
                          );
                        })}
                      </div>

                      {q.explanation && (
                        <div className={`p-3 rounded-xl border text-xs leading-relaxed ${
                          isDarkMode
                            ? 'bg-slate-800/60 border-slate-700/80 text-slate-300'
                            : 'bg-slate-50 border-slate-300 text-black font-semibold'
                        }`}>
                          <span className="font-black text-amber-600 block mb-1">💡 التوضيح وطريقة الحل:</span>
                          {q.explanation}
                        </div>
                      )}
                    </div>

                    {/* Manage Folders Button */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <button
                        onClick={() => setShowFolderModalForQ(q)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition whitespace-nowrap shadow-sm border ${
                          isDarkMode
                            ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-amber-500/40 hover:border-amber-400'
                            : 'bg-amber-50 hover:bg-amber-100 text-amber-950 border-amber-400 font-black'
                        }`}
                        title="إضافة أو حذف السؤال من مجلداتك"
                      >
                        <FolderPlus className="w-4 h-4 text-amber-500" />
                        <span>إدارة مجلدات السؤال</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Folder Picker Modal (in review screen) */}
        {renderFolderModal()}

        {/* Delete Correct Questions Prompt Modal (in review screen) */}
        {renderDeleteCorrectPromptModal()}
      </div>
    );
  }

  // Safe active question
  const currentQ: ExamQuestion = safeQuestions[currentIdx] || safeQuestions[0] || {
    id: 'q_default',
    questionText: 'سؤال الاختبار',
    imageUrl: '',
    options: ['الخيار أ', 'الخيار ب', 'الخيار ج', 'الخيار د'],
    correctOptionIndex: 0,
    explanation: '',
  };
  const safeOptions: string[] = (Array.isArray(currentQ?.options) && currentQ.options.length > 0)
    ? currentQ.options.map((opt) => (typeof opt === 'string' ? opt : String(opt ?? '')))
    : ['الخيار أ', 'الخيار ب', 'الخيار ج', 'الخيار د'];
  const answeredCount = Object.keys(selectedAnswers).length;
  const currentQCustomFolders = getCustomFoldersForQuestion(currentQ);

  // ================= Folder Selector, Add & Delete Modal =================
  function renderFolderModal() {
    if (!showFolderModalForQ) return null;

    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
        <div className={`border rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative ${
          isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-black'
        }`}>
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className={`text-base font-black ${isDarkMode ? 'text-white' : 'text-black'}`}>إدارة مجلدات السؤال</h3>
                  {courseTitle && (
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30">
                      {courseTitle}
                    </span>
                  )}
                </div>
                <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-800 font-medium'}`}>
                  اضغط على أي مجلد للإضافة وتظهر علامة صح ✓ أو اضغط ثانية للحذف
                </span>
              </div>
            </div>
            <button
              onClick={() => setShowFolderModalForQ(null)}
              className={`p-1.5 rounded-lg transition ${
                isDarkMode ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:text-black'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Question preview snippet */}
          <div className={`p-3 rounded-xl border text-xs font-bold line-clamp-2 ${
            isDarkMode ? 'bg-slate-800/60 border-slate-700 text-slate-300' : 'bg-slate-50 border-slate-200 text-black'
          }`}>
            "{showFolderModalForQ.questionText}"
          </div>

          {/* Action toast feedback */}
          {folderActionToast && (
            <div className={`p-3 rounded-xl border text-xs font-black flex items-center gap-2 ${
              folderActionToast.isError
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-600'
                : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
            }`}>
              {folderActionToast.isError ? (
                <AlertCircle className="w-4 h-4 text-rose-500" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              )}
              <span>{folderActionToast.message}</span>
            </div>
          )}

          {/* Existing folders list with 1-click ADD and DELETE toggle */}
          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
            <span className={`text-xs font-black block mb-1 ${isDarkMode ? 'text-slate-400' : 'text-black'}`}>
              المجلدات المتاحة (اضغط على المجلد للتبديل):
            </span>
            {userFolders.length === 0 ? (
              <div className={`p-4 rounded-xl text-center text-xs ${
                isDarkMode ? 'bg-slate-800/40 text-slate-400' : 'bg-slate-100 text-black'
              }`}>
                لا توجد مجلدات بعد. اكتب اسم مجلد بالأسفل لإنشائه فوراً!
              </div>
            ) : (
              userFolders.map((folder) => {
                const isMistakes = folder.isDefaultMistakesFolder || folder.title === 'مجلد الاخطاء';
                const match = findFolderQuestionMatch(showFolderModalForQ, folder.id);
                const isInFolder = !!match;
                const isProcessing = processingFolderIds[folder.id];

                return (
                  <div
                    key={folder.id}
                    onClick={async () => {
                      if (isProcessing) return;
                      if (isInFolder) {
                        const targetId = match ? match.id : '';
                        await handleDeleteQuestionFromFolder(targetId, folder.title, folder.id);
                      } else {
                        await handleAddQuestionToFolder(showFolderModalForQ, folder);
                      }
                    }}
                    className={`cursor-pointer flex items-center justify-between p-3.5 rounded-2xl border transition-all duration-150 select-none ${
                      isInFolder
                        ? isDarkMode
                          ? 'bg-emerald-950/40 border-emerald-500/60 shadow-md ring-1 ring-emerald-500/40'
                          : 'bg-emerald-50 border-emerald-500 shadow-sm ring-1 ring-emerald-400'
                        : isDarkMode
                        ? 'bg-slate-800/60 border-slate-700/80 hover:bg-slate-800 hover:border-slate-600'
                        : 'bg-white border-slate-300 hover:bg-slate-50 hover:border-blue-400'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Folder className={`w-5 h-5 shrink-0 ${
                        isInFolder ? 'text-emerald-500' : isMistakes ? 'text-rose-500' : 'text-blue-500'
                      }`} />
                      <div className="flex flex-col min-w-0">
                        <span className={`text-sm font-black truncate ${
                          isInFolder
                            ? isDarkMode ? 'text-emerald-300' : 'text-emerald-900'
                            : isDarkMode ? 'text-white' : 'text-black'
                        }`}>
                          {folder.title}
                        </span>
                        {isMistakes && (
                          <span className="text-[10px] text-rose-500 font-bold">مجلد الأخطاء الدائم</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isInFolder ? (
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-black ${
                            isDarkMode ? 'text-emerald-400' : 'text-emerald-700'
                          }`}>
                            مضاف ✓
                          </span>
                          <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md animate-in zoom-in-75">
                            <Check className="w-5 h-5 stroke-[3]" />
                          </div>
                        </div>
                      ) : (
                        <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition ${
                          isDarkMode
                            ? 'border-slate-600 text-slate-500 hover:border-blue-400 hover:text-blue-400'
                            : 'border-slate-300 text-slate-400 hover:border-blue-500 hover:text-blue-600'
                        }`}>
                          <Plus className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Create new folder inline */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <span className={`text-xs font-black block ${isDarkMode ? 'text-slate-400' : 'text-black'}`}>
              إنشاء مجلد جديد وإضافة السؤال إليه:
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="اسم المجلد الجديد (مثال: مسائل هندسية)..."
                value={newFolderNameInput}
                onChange={(e) => setNewFolderNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateNewFolderAndAdd(showFolderModalForQ);
                  }
                }}
                className={`flex-1 px-3.5 py-2.5 rounded-xl border text-xs focus:outline-none focus:border-amber-400 ${
                  isDarkMode
                    ? 'bg-slate-950 border-slate-700 text-white placeholder:text-slate-500'
                    : 'bg-white border-slate-300 text-black placeholder:text-slate-500 font-bold'
                }`}
              />
              <button
                type="button"
                onClick={() => handleCreateNewFolderAndAdd(showFolderModalForQ)}
                disabled={!newFolderNameInput.trim() || isCreatingFolder}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-black text-xs transition flex items-center gap-1 shrink-0 shadow-md"
              >
                <Plus className="w-4 h-4" />
                <span>إنشاء وإضافة</span>
              </button>
            </div>
          </div>

          {/* Close button at bottom */}
          <div className="pt-2 flex justify-end">
            <button
              onClick={() => setShowFolderModalForQ(null)}
              className={`px-5 py-2 rounded-xl font-bold text-xs transition ${
                isDarkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-black'
              }`}
            >
              تم وإغلاق
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ================= Modal: هل تود حذف الأسئلة الصحيحة نهائياً أم لا؟ =================
  function renderDeleteCorrectPromptModal() {
    if (!showDeleteCorrectPrompt) return null;

    const targetFolderLabel = folderTitle || examTitle.replace(/^اختبار\s+/, '') || 'المجلد';
    const correctCount = correctFolderQuestions.length;

    return (
      <div
        dir="rtl"
        className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className={`w-full max-w-md rounded-3xl border-2 p-6 sm:p-7 space-y-5 shadow-2xl relative text-right ${
            isDarkMode
              ? 'bg-slate-900 border-amber-500/40 text-white'
              : 'bg-white border-slate-300 text-slate-900'
          }`}
        >
          {/* Dismiss button to stay on score screen */}
          <button
            type="button"
            disabled={isDeletingCorrectQuestions}
            onClick={() => setShowDeleteCorrectPrompt(false)}
            className={`absolute top-4 left-4 p-1.5 rounded-xl transition cursor-pointer disabled:opacity-40 ${
              isDarkMode
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-black'
            }`}
            title="إغلاق والبقاء في صفحة النتيجة"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Icon + Title */}
          <div className="flex flex-col items-center text-center space-y-3 pt-1">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-500 flex items-center justify-center shadow-lg">
              <Trash2 className="w-8 h-8" />
            </div>
            <div className="space-y-1.5">
              <h3 className={`text-lg sm:text-xl font-black ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>
                هل تود حذف الأسئلة الصحيحة نهائياً؟
              </h3>
              <p className={`text-xs sm:text-sm font-bold ${isDarkMode ? 'text-amber-300' : 'text-amber-700'}`}>
                أجبت بشكل صحيح على {correctCount} {correctCount === 1 ? 'سؤال' : correctCount === 2 ? 'سؤالين' : correctCount <= 10 ? 'أسئلة' : 'سؤالاً'} في مجلد &quot;{targetFolderLabel}&quot;
              </p>
            </div>
          </div>

          {/* Explanation box */}
          <div
            className={`p-4 rounded-2xl border text-xs leading-relaxed space-y-2 ${
              isDarkMode
                ? 'bg-slate-800/70 border-slate-700 text-slate-300'
                : 'bg-slate-50 border-slate-200 text-slate-700 font-medium'
            }`}
          >
            <div className="flex items-start gap-2">
              <Trash2 className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>
                <strong className={isDarkMode ? 'text-rose-400' : 'text-rose-700'}>نعم:</strong>{' '}
                تُحذف الأسئلة التي أجبتها بشكل صحيح من هذا المجلد نهائياً ولا تعود أبداً مهما كان.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>
                <strong className={isDarkMode ? 'text-emerald-400' : 'text-emerald-700'}>لا:</strong>{' '}
                تبقى جميع الأسئلة محفوظة في المجلد ولن تُحذف أبداً إلا إذا قمت بحذفها يدوياً بنفسك.
              </span>
            </div>
          </div>

          {/* Error message if deletion fails */}
          {deleteCorrectError && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-400 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{deleteCorrectError}</span>
            </div>
          )}

          {/* Action Buttons: نعم / لا */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              disabled={isDeletingCorrectQuestions}
              onClick={handleConfirmDeleteCorrectAndExit}
              className="w-full py-3 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-black text-xs sm:text-sm transition shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isDeletingCorrectQuestions ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جارٍ الحذف النهائي...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>نعم، احذفها نهائياً</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isDeletingCorrectQuestions}
              onClick={handleKeepQuestionsAndExit}
              className={`w-full py-3 px-4 rounded-2xl font-black text-xs sm:text-sm transition border flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
                isDarkMode
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500/50 shadow-lg shadow-emerald-600/25'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 shadow-md'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>لا، احتفظ بها في المجلد</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Calculate progress percent
  const progressPercent = Math.round(((currentIdx + 1) / safeQuestions.length) * 100);

  return (
    <div className="min-h-screen w-full flex flex-col" dir="rtl">
      {systemMode === 'nimr' && (
        <NimrExamSystem
          safeQuestions={safeQuestions}
          currentIdx={currentIdx}
          setCurrentIdx={setCurrentIdx}
          selectedAnswers={selectedAnswers}
          handleSelectOption={handleSelectOption}
          visitedIndices={visitedIndices}
          markedForReview={markedForReview}
          setMarkedForReview={setMarkedForReview}
          isTimed={isTimed}
          timeLeft={timeLeft}
          formatTime={formatTime}
          currentUser={currentUser}
          nationalId={nationalId}
          examTitle={examTitle}
          currentDateStr={currentDateStr}
          handleRequestExit={handleRequestExit}
          finishTest={finishTest}
          setShowFolderModalForQ={setShowFolderModalForQ}
          currentQCustomFolders={currentQCustomFolders}
          setZoomedImageUrl={setZoomedImageUrl}
          setImageZoomScale={setImageZoomScale}
          setShowExamInstructionsModal={setShowExamInstructionsModal}
          setShowSectionModal={setShowSectionModal}
          setShowEquationsModal={setShowEquationsModal}
          isDarkMode={isDarkMode}
          systemMode={systemMode}
        />
      )}

      {systemMode === 'standard' && (
        <DefaultExamSystem
          safeQuestions={safeQuestions}
          currentIdx={currentIdx}
          setCurrentIdx={setCurrentIdx}
          selectedAnswers={selectedAnswers}
          handleSelectOption={handleSelectOption}
          visitedIndices={visitedIndices}
          markedForReview={markedForReview}
          setMarkedForReview={setMarkedForReview}
          isTimed={isTimed}
          timeLeft={timeLeft}
          formatTime={formatTime}
          currentUser={currentUser}
          nationalId={nationalId}
          examTitle={examTitle}
          currentDateStr={currentDateStr}
          handleRequestExit={handleRequestExit}
          finishTest={finishTest}
          setShowFolderModalForQ={setShowFolderModalForQ}
          currentQCustomFolders={currentQCustomFolders}
          setZoomedImageUrl={setZoomedImageUrl}
          setImageZoomScale={setImageZoomScale}
          setShowExamInstructionsModal={setShowExamInstructionsModal}
          setShowSectionModal={setShowSectionModal}
          setShowEquationsModal={setShowEquationsModal}
          isDarkMode={isDarkMode}
          systemMode={systemMode}
          isWhiteboardOpen={isWhiteboardOpen}
          setIsWhiteboardOpen={setIsWhiteboardOpen}
          mobileViewMode={mobileViewMode}
          setMobileViewMode={setMobileViewMode}
          setShowMobileQuestionsList={setShowMobileQuestionsList}
          showMobileQuestionsList={showMobileQuestionsList}
          progressPercent={progressPercent}
        />
      )}

      {systemMode === 'blue' && (
        <BlueExamSystem
          safeQuestions={safeQuestions}
          currentIdx={currentIdx}
          setCurrentIdx={setCurrentIdx}
          selectedAnswers={selectedAnswers}
          handleSelectOption={handleSelectOption}
          visitedIndices={visitedIndices}
          markedForReview={markedForReview}
          setMarkedForReview={setMarkedForReview}
          isTimed={isTimed}
          timeLeft={timeLeft}
          formatTime={formatTime}
          currentUser={currentUser}
          nationalId={nationalId}
          examTitle={examTitle}
          currentDateStr={currentDateStr}
          handleRequestExit={handleRequestExit}
          finishTest={finishTest}
          setShowFolderModalForQ={setShowFolderModalForQ}
          currentQCustomFolders={currentQCustomFolders}
          setZoomedImageUrl={setZoomedImageUrl}
          setImageZoomScale={setImageZoomScale}
          setShowExamInstructionsModal={setShowExamInstructionsModal}
          setShowSectionModal={setShowSectionModal}
          setShowEquationsModal={setShowEquationsModal}
          isDarkMode={isDarkMode}
          systemMode={systemMode}
        />
      )}
      {/* ================= MODAL: ZOOMED QUESTION IMAGE LIGHTBOX ("تكبير صورة السؤال") ================= */}
      {zoomedImageUrl && (
        <div
          onClick={() => setZoomedImageUrl(null)}
          className="fixed inset-0 z-[99999] flex flex-col items-center justify-center p-3 sm:p-6 bg-black/95 backdrop-blur-md animate-in fade-in duration-200"
        >
          {/* Controls Bar */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center justify-between gap-3 w-full max-w-3xl mb-3 px-4 py-2.5 rounded-2xl bg-slate-900/90 border border-slate-800 backdrop-blur-md text-white shadow-xl"
          >
            <div className="flex items-center gap-2">
              <ZoomIn className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-black">معاينة صورة السؤال المكبرة</span>
              <span className="text-[10px] text-slate-400 font-mono">({Math.round(imageZoomScale * 100)}%)</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setImageZoomScale((s) => Math.min(s + 0.25, 3))}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition cursor-pointer"
                title="تكبير أكثر (+)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setImageZoomScale((s) => Math.max(s - 0.25, 0.75))}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition cursor-pointer"
                title="تصغير (-)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setImageZoomScale(1)}
                className="px-2.5 py-1 text-[11px] rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold transition cursor-pointer"
                title="الحجم الأصلي (100%)"
              >
                100%
              </button>
              <button
                type="button"
                onClick={() => setZoomedImageUrl(null)}
                className="p-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition cursor-pointer mr-2"
                title="إغلاق (X)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Image Display Area with Pan/Scroll */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl max-h-[80vh] overflow-auto rounded-3xl border border-slate-800 bg-slate-950/80 p-2 sm:p-4 flex items-center justify-center shadow-2xl"
          >
            <img
              src={zoomedImageUrl}
              alt="صورة مكبرة"
              style={{ transform: `scale(${imageZoomScale})`, transformOrigin: 'center' }}
              className="max-w-full max-h-[75vh] object-contain transition-transform duration-150 rounded-2xl select-none"
            />
          </div>

          <span className="text-[11px] text-slate-400 mt-2">
            انقر في أي مكان خارج الصورة أو اضغط على زر الإغلاق للعودة للسؤال
          </span>
        </div>
      )}

      {/* ================= MODAL: هل تود حذف الأسئلة الصحيحة أم لا؟ ================= */}
      {renderDeleteCorrectPromptModal()}

      {/* ================= MODAL 1: تعليمات القسم ================= */}
      {showSectionModal && (
        <div
          onClick={() => setShowSectionModal(false)}
          className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-3xl border-2 border-emerald-500/40 p-5 sm:p-6 shadow-2xl flex flex-col justify-between space-y-4 text-right ${
              isDarkMode ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-emerald-500/20">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-emerald-400">
                    تعليمات القسم الحالي
                  </h3>
                  <span className="text-xs text-slate-400">
                    {examTitle}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSectionModal(false)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm leading-relaxed">
              <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between">
                <span className="font-bold text-emerald-200">عدد أسئلة هذا القسم:</span>
                <span className="font-black text-emerald-400 font-mono text-sm">{safeQuestions.length} سؤال</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-800/60 border border-slate-700 space-y-2">
                <h4 className="font-black text-emerald-300 flex items-center gap-1.5">
                  <span>📌</span>
                  <span>إرشادات الإجابة في القسم:</span>
                </h4>
                <ul className="list-disc list-inside space-y-1.5 text-slate-300 text-xs sm:text-sm">
                  <li>أجب عن جميع الأسئلة؛ لا يوجد خصم أو درجات سالبة للإجابات الخاطئة.</li>
                  <li>يمكنك التنقل بحرية بين جميع أسئلة القسم باستخدام شريط أرقام الأسئلة على اليسار.</li>
                  <li>السؤال الذي تم اختياره يظهر باللون الأخضر المميز مع تحديد خيارك فوراً.</li>
                  <li>يمكنك مراجعة وتعديل أي إجابة في أي وقت طالما لم يتم الضغط على "إنهاء الاختبار".</li>
                  <li>ينصح بتخصيص حوالي دقيقة واحدة لكل سؤال لضمان استغلال الوقت على أكمل وجه.</li>
                </ul>
              </div>
            </div>

            <div className="pt-3 border-t border-emerald-500/20 flex justify-end">
              <button
                type="button"
                onClick={() => setShowSectionModal(false)}
                className="px-6 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm shadow-lg shadow-emerald-600/30 transition cursor-pointer"
              >
                فهمت، متابعة الاختبار ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL 2: تعليمات الاختبار ================= */}
      {showExamInstructionsModal && (
        <div
          onClick={() => setShowExamInstructionsModal(false)}
          className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-3xl border-2 border-blue-500/40 p-5 sm:p-6 shadow-2xl flex flex-col justify-between space-y-4 text-right ${
              isDarkMode ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-blue-500/20">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-2xl bg-blue-500/20 text-blue-400">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-blue-400">
                    تعليمات وضوابط الاختبار المحوسب
                  </h3>
                  <span className="text-xs text-slate-400">
                    نظام نمر (محاكي قياس الفعلي)
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExamInstructionsModal(false)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm leading-relaxed">
              <div className="p-3.5 rounded-2xl bg-blue-950/40 border border-blue-500/30 space-y-2">
                <h4 className="font-black text-blue-300 flex items-center gap-1.5">
                  <span>🎯</span>
                  <span>الضوابط العامة للاختبار:</span>
                </h4>
                <ul className="list-disc list-inside space-y-1.5 text-slate-300 text-xs sm:text-sm">
                  <li>صمم هذا المحاكي لمحاكاة شاشات ونظام قياس المحوسب بدقة تامة.</li>
                  <li>تتضمن الشاشة صورة وبيانات الطالب ورقم الهوية والرقم المرجعي للجلسة.</li>
                  <li>الخيارات الأربعة (أ، ب، ج، د) تختار بنقرة واحدة وتُحفظ تلقائياً دون تأخير.</li>
                  <li>زر "تكبير الصورة 🔍" يتيح لك فحص الرسوم البيانية والأشكال الهندسية بوضوح كامل.</li>
                  <li>زر "المعادلات" يعرض لك القوانين الرياضية الشائعة للاستعانة بها أثناء الحل.</li>
                  <li>يمكنك إضافة السؤال للمجلدات وحفظه بالضغط على زر "إدارة مجلدات السؤال".</li>
                  <li>عند الضغط على "إنهاء الاختبار" يتم تسليم إجاباتك وعرض التقرير وتحليل المستوى.</li>
                </ul>
              </div>
            </div>

            <div className="pt-3 border-t border-blue-500/20 flex justify-end">
              <button
                type="button"
                onClick={() => setShowExamInstructionsModal(false)}
                className="px-6 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs sm:text-sm shadow-lg shadow-blue-600/30 transition cursor-pointer"
              >
                إغلاق والعودة للحل ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL 3: ورقة المعادلات والقوانين ================= */}
      {showEquationsModal && (
        <div
          onClick={() => setShowEquationsModal(false)}
          className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-3xl border-2 border-amber-500/40 p-5 sm:p-7 shadow-2xl flex flex-col justify-between space-y-4 text-right ${
              isDarkMode ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between pb-3.5 border-b border-amber-500/20">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400">
                  <Calculator className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-amber-400">
                    ورقة القوانين والمعادلات الرياضية (قياس)
                  </h3>
                  <span className="text-xs text-slate-400">
                    القوانين المعتمدة للاختبارات الكمية للقدرات
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEquationsModal(false)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs sm:text-sm leading-relaxed overflow-y-auto max-h-[60vh] pr-1">
              {/* قسم 1: الهندسة والمساحات */}
              <div className="p-4 rounded-2xl bg-slate-800/70 border border-emerald-500/30 space-y-2.5">
                <h4 className="font-black text-emerald-400 text-sm flex items-center gap-2">
                  <span>📐</span>
                  <span>الهندسة والمساحات والأشكال:</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-slate-200">
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/60">
                    <span className="font-bold text-amber-300">مساحة المثلث:</span> ½ × القاعدة × الارتفاع
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/60">
                    <span className="font-bold text-amber-300">مساحة المربع:</span> (الضلع)² = ½ × (القطر)²
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/60">
                    <span className="font-bold text-amber-300">مساحة المستطيل:</span> الطول × العرض
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/60">
                    <span className="font-bold text-amber-300">مساحة الدائرة:</span> ط × نق² | <span className="font-bold text-amber-300">محيطها:</span> 2 × ط × نق
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/60 md:col-span-2">
                    <span className="font-bold text-emerald-300">نظرية فيثاغورس:</span> (الوتر)² = (الضلع الأول)² + (الضلع الثاني)²
                    <div className="text-[11px] text-slate-400 mt-1">مثلثات شهيرة: (3، 4، 5) ومضاعفاتها، (5، 12، 13)، (8، 15، 17)</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/60 md:col-span-2">
                    <span className="font-bold text-amber-300">مجموع زوايا المثلث:</span> 180° | <span className="font-bold text-amber-300">الرباعي:</span> 360° | <span className="font-bold text-amber-300">المضلع:</span> (ن - 2) × 180°
                  </div>
                </div>
              </div>

              {/* قسم 2: السرعة والحركة */}
              <div className="p-4 rounded-2xl bg-slate-800/70 border border-blue-500/30 space-y-2.5">
                <h4 className="font-black text-blue-400 text-sm flex items-center gap-2">
                  <span>⚡</span>
                  <span>السرعة والمسافة والزمن:</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-slate-200">
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/60">
                    <span className="font-bold text-blue-300">قانون الحركة:</span> المسافة = السرعة × الزمن
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/60">
                    <span className="font-bold text-blue-300">السرعة:</span> المسافة ÷ الزمن | <span className="font-bold text-blue-300">الزمن:</span> المسافة ÷ السرعة
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/60 md:col-span-2">
                    <span className="font-bold text-blue-300">السرعة المتوسطة لذهاب وإياب بنفس المسافة:</span> (2 × ع1 × ع2) ÷ (ع1 + ع2)
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/60 md:col-span-2">
                    <span className="font-bold text-blue-300">زمن اللحاق:</span> فارق المسافة بين الجسمين ÷ فارق السرعتين
                  </div>
                </div>
              </div>

              {/* قسم 3: النسب المئوية والإحصاء والجبر */}
              <div className="p-4 rounded-2xl bg-slate-800/70 border border-amber-500/30 space-y-2.5">
                <h4 className="font-black text-amber-400 text-sm flex items-center gap-2">
                  <span>📊</span>
                  <span>النسب المئوية والمتوسطات والجبر:</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-slate-200">
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/60">
                    <span className="font-bold text-amber-300">النسبة المئوية:</span> (الجزء ÷ الكل) × 100
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/60">
                    <span className="font-bold text-amber-300">المتوسط الحسابي:</span> مجموع القيم ÷ عددها
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/60">
                    <span className="font-bold text-amber-300">فرق بين مربعين:</span> س² - ص² = (س - ص)(س + ص)
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/60">
                    <span className="font-bold text-amber-300">المربع الكامل:</span> (س ± ص)² = س² ± 2س ص + ص²
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-amber-500/20 flex justify-end">
              <button
                type="button"
                onClick={() => setShowEquationsModal(false)}
                className="px-6 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-amber-500/30 transition cursor-pointer"
              >
                إغلاق ومتابعة الاختبار ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Render Folder Picker Modal */}
      {renderFolderModal()}

    </div>
  );
};
