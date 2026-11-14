import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  Settings,
  Bell,
  Tv,
  Palette,
  FolderTree,
  Plus,
  Trash2,
  Edit,
  Save,
  CheckCircle2,
  Check,
  XCircle,
  AlertTriangle,
  Lock,
  Unlock,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  Upload,
  Link as LinkIcon,
  HelpCircle,
  Layers,
  Sparkles,
  Calendar,
  Clock,
  Radio,
  FileText,
  Video,
  Award,
  Wrench,
  MessageCircle,
  Infinity as InfinityIcon,
  X,
  Target,
  Send,
  RefreshCw,
  Download,
  ShieldCheck,
  Maximize2,
  Minimize2,
  Film,
  Trophy,
  Zap,
  BookOpen,
  DollarSign,
  Image as ImageIcon,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Printer,
  Pause,
  Play,
  Crown,
  Search,
} from 'lucide-react';
import {
  StudentUser,
  SystemSettings,
  ThemeConfig,
  SectionItem,
  ResourceItem,
  ContentItem,
  ExamQuestion,
  IntroLessonConfig,
  FeaturesConfig,
  CourseItem,
  CertificateData,
  ExamAttempt,
} from '../types';
import { BrandLogo } from './BrandLogo';
import { CertificateModal } from './CertificateModal';
import { SmartVideoPlayer } from './SmartVideoPlayer';
import {
  db,
  THEME_PRESETS,
  DEFAULT_SETTINGS,
  INITIAL_COURSES,
  restoreDefaultCoursesAndContent,
  resolveVideoUrl,
  OperationType,
  reportFirestoreListenerError,
} from '../firebase';
import { bumpCatalogVersion } from '../utils/firestoreCache';
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  addDoc,
  getDocs,
  query,
  where
} from 'firebase/firestore';

interface AdminPanelProps {
  onExit: () => void;
  systemSettings: SystemSettings;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onExit, systemSettings }) => {
  const [activeTab, setActiveTab] = useState<'courses' | 'students' | 'platform_lock' | 'announcement' | 'live_stream' | 'content' | 'designs' | 'intro_lesson' | 'features'>('courses');

  // Courses management state
  const [courses, setCourses] = useState<CourseItem[]>(INITIAL_COURSES);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('course_default_1');

  // Course Add/Edit Modal
  const [isAddingCourse, setIsAddingCourse] = useState(false);
  const [editingCourse, setEditingCourse] = useState<CourseItem | null>(null);
  const [courseFormTitle, setCourseFormTitle] = useState('');
  const [courseFormDesc, setCourseFormDesc] = useState('');
  const [courseFormImage, setCourseFormImage] = useState('');
  const [courseFormIsLocked, setCourseFormIsLocked] = useState(false);
  const [courseFormPrice, setCourseFormPrice] = useState('199 ريال');
  const [courseFormBank1, setCourseFormBank1] = useState('');
  const [courseFormBank2, setCourseFormBank2] = useState('');
  const [courseFormPaymentMessage, setCourseFormPaymentMessage] = useState('الرجاء تحويل المبلغ على أحد الحسابين أعلاه ثم إرسال الإشعار لتفعيل الكورس فوراً.');
  const [courseFormOrder, setCourseFormOrder] = useState<number>(1);
  const [deletingCourse, setDeletingCourse] = useState<CourseItem | null>(null);
  const [isDeletingCourseInProgress, setIsDeletingCourseInProgress] = useState(false);
  const [isUploadingCourseCover, setIsUploadingCourseCover] = useState(false);
  const [isUploadingBank1, setIsUploadingBank1] = useState(false);
  const [isUploadingBank2, setIsUploadingBank2] = useState(false);
  const [isSavingCourse, setIsSavingCourse] = useState(false);
  const [isRestoringCourses, setIsRestoringCourses] = useState(false);

  // Students list from Firestore with instant cached rendering
  const [students, setStudents] = useState<StudentUser[]>(() => {
    try {
      const cached = localStorage.getItem('raad_cached_admin_students');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return [];
  });
  const [studentFilter, setStudentFilter] = useState<'all' | 'unspecified' | 'active' | 'vip' | 'paused' | 'blocked'>('all');
  const [studentSearchQuery, setStudentSearchQuery] = useState<string>('');
  const [isRefreshingData, setIsRefreshingData] = useState<boolean>(false);
  
  // Student Password View State
  const [showAllPasswords, setShowAllPasswords] = useState<boolean>(false);
  const [visiblePasswords, setVisiblePasswords] = useState<{ [id: string]: boolean }>({});

  // Student Course Activation Modal State ("وبجانب حساب كل طالب كلمة اسمها تفعيل اضغط تفعيل واختار له كورس")
  const [studentForCourseActivation, setStudentForCourseActivation] = useState<StudentUser | null>(null);
  const [selectedCoursesForStudent, setSelectedCoursesForStudent] = useState<string[]>([]);
  const [isSavingStudentActivation, setIsSavingStudentActivation] = useState<boolean>(false);

  // Student Days Modal state
  const [studentForDaysModal, setStudentForDaysModal] = useState<StudentUser | null>(null);
  const [selectedDaysAmount, setSelectedDaysAmount] = useState<number>(30);

  // Student Individual Block Modal state
  const [studentForBlockModal, setStudentForBlockModal] = useState<StudentUser | null>(null);
  const [blockReasonType, setBlockReasonType] = useState<'maintenance' | 'subscription' | 'supervisor'>('supervisor');
  const [blockCustomMessage, setBlockCustomMessage] = useState<string>('');

  // Deletion modal for students
  const [deletingStudent, setDeletingStudent] = useState<StudentUser | null>(null);

  // Student Expanded Dossier (Watched videos, solved exams, red message, certificate issuance)
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [examAttempts, setExamAttempts] = useState<ExamAttempt[]>([]);
  const [studentRedMessageInput, setStudentRedMessageInput] = useState<{ [id: string]: string }>({});
  const [isSavingRedMessage, setIsSavingRedMessage] = useState<{ [id: string]: boolean }>({});
  const [issuingCertStudent, setIssuingCertStudent] = useState<StudentUser | null>(null);
  const [previewCertModalData, setPreviewCertModalData] = useState<CertificateData | null>(null);
  const [certFormCourse, setCertFormCourse] = useState<string>('');
  const [certFormGrade, setCertFormGrade] = useState<string>('ممتاز مرتفع بنسبة 100%');
  const [certFormDirector, setCertFormDirector] = useState<string>('أ. رعد / المشرف العام');
  const [certFormPlatform, setCertFormPlatform] = useState<string>('منصة أقسام رعد للقدرات');
  const [certFormNotes, setCertFormNotes] = useState<string>('تقديراً لاجتيازه كافة الاختبارات والمحاضرات بتفوق واقتدار نتمنى له دوام التوفيق والنجاح.');
  const [isIssuingCert, setIsIssuingCert] = useState<boolean>(false);

  // Unified Delete Confirmation Modal State (Sections, Resources, Items)
  interface DeleteTarget {
    type: 'section' | 'resource' | 'item';
    id: string;
    title: string;
    itemType?: 'video' | 'exam' | 'file';
    subtitle?: string;
  }
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [isDeletingTarget, setIsDeletingTarget] = useState(false);

  // Platform Lock State
  const [lockSettings, setLockSettings] = useState({
    isPlatformLocked: systemSettings.isPlatformLocked,
    lockReason: systemSettings.lockReason,
    lockMessage: systemSettings.lockMessage || 'المنصة مغلقة حالياً، يرجى المحاولة لاحقاً.',
    maintenanceMessage: systemSettings.maintenanceMessage || 'يوجد صيانة حالياً في المنصة لتطوير السيرفرات وتحديث المحتوى، سنعود قريباً بإذن الله.',
    subscriptionMessage: systemSettings.subscriptionMessage || 'تم قفل المنصة بداعي تفعيل وانتهاء الاشتراك، يرجى التواصل مع المشرف لتجديد وتفعيل الاشتراك.',
    whatsappNumber: systemSettings.whatsappNumber || '966500000000',
    telegramUsername: systemSettings.telegramUsername || '@raad_aksam',
  });

  // Announcement State
  const [announcementState, setAnnouncementState] = useState(systemSettings.announcement);

  // Live Stream State
  const [liveStreamState, setLiveStreamState] = useState(systemSettings.liveStream);

  // Active theme selection
  const [selectedThemeId, setSelectedThemeId] = useState(systemSettings.activeTheme?.id || THEME_PRESETS[0].id);

  // Platform Custom Logo State
  const [platformLogoUrl, setPlatformLogoUrl] = useState<string>(systemSettings.logoUrl || '');
  const [isUploadingLogo, setIsUploadingLogo] = useState<boolean>(false);

  // Selected Course for Per-Course Intro Lesson and Features
  const [selectedIntroCourseId, setSelectedIntroCourseId] = useState<string>('course_default_1');
  const [selectedFeaturesCourseId, setSelectedFeaturesCourseId] = useState<string>('course_default_1');
  const [isSavingIntroLesson, setIsSavingIntroLesson] = useState<boolean>(false);

  // Intro Lesson State ("الحصة التعريفية")
  const [introLessonState, setIntroLessonState] = useState<IntroLessonConfig>(
    systemSettings.introLesson || {
      isActive: true,
      title: 'الحصة التعريفية لشرح المنصة وطريقة الاستفادة منها',
      videoUrl: '',
      description: 'شاهد هذا الفيديو للتعرف على طريقة التدرب واستخدام السبورة الذكية ومجلدات الأخطاء لتحقيق نسبة 100% بإذن الله'
    }
  );
  const [isUploadingIntroVideo, setIsUploadingIntroVideo] = useState(false);

  // Features State ("المميزات")
  const [featuresState, setFeaturesState] = useState<FeaturesConfig>(
    systemSettings.features || {
      telegramMainGroupUrl: 'https://t.me/raad_qiyas_main',
      telegramDiscussionGroupUrl: 'https://t.me/raad_qiyas_discussion',
      isDiagnosticEnabled: true,
      isFriendsChallengeEnabled: true
    }
  );
  const [isSavingFeatures, setIsSavingFeatures] = useState(false);

  // Content Management: Sections, Resources, Items with instant cached rendering
  const [sections, setSections] = useState<SectionItem[]>(() => {
    try {
      const cached = localStorage.getItem('raad_cached_admin_sections');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return [];
  });
  const [resources, setResources] = useState<ResourceItem[]>(() => {
    try {
      const cached = localStorage.getItem('raad_cached_admin_resources');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return [];
  });
  const [items, setItems] = useState<ContentItem[]>(() => {
    try {
      const cached = localStorage.getItem('raad_cached_admin_items');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return [];
  });
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [selectedResourceId, setSelectedResourceId] = useState<string>('');
  const [showAllPlatformContent, setShowAllPlatformContent] = useState<boolean>(false);

  // Section Add & Edit Modals
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [editingSection, setEditingSection] = useState<SectionItem | null>(null);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSectionDesc, setNewSectionDesc] = useState('');
  const [newSectionOrder, setNewSectionOrder] = useState<number>(1);

  // Resource Add & Edit Modals
  const [isAddingResource, setIsAddingResource] = useState(false);
  const [editingResource, setEditingResource] = useState<ResourceItem | null>(null);
  const [newResourceTitle, setNewResourceTitle] = useState('');
  const [newResourceDesc, setNewResourceDesc] = useState('');
  const [newResourceOrder, setNewResourceOrder] = useState<number>(1);

  // Linked items for Video
  const [linkedExamIds, setLinkedExamIds] = useState<string[]>([]);
  const [linkedFileIds, setLinkedFileIds] = useState<string[]>([]);

  // Dedicated Quick-Link Modal State ("اجعلني اثناء الربط اختار الملف او الاختبار واربطه باسم الفيديو")
  const [isQuickLinkModalOpen, setIsQuickLinkModalOpen] = useState(false);
  const [quickLinkVideoId, setQuickLinkVideoId] = useState('');
  const [quickLinkExamId, setQuickLinkExamId] = useState('');
  const [quickLinkFileId, setQuickLinkFileId] = useState('');
  const [isSavingQuickLink, setIsSavingQuickLink] = useState(false);

  // Link to video from within exam or file modal
  const [attachToVideoId, setAttachToVideoId] = useState('');

  // Dedicated Sub-Tab for separating Videos, Exams, and Files in Admin Panel
  const [adminContentSubTab, setAdminContentSubTab] = useState<'all' | 'video' | 'exam' | 'file'>('all');
  const [isExpandedFullWidth, setIsExpandedFullWidth] = useState<boolean>(false);
  const [modalSectionId, setModalSectionId] = useState<string>('');
  const [modalResourceId, setModalResourceId] = useState<string>('');

  // Item Add & Edit Modals
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<ContentItem | null>(null);
  const [itemType, setItemType] = useState<'video' | 'file' | 'exam'>('video');
  const [itemTitle, setItemTitle] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('admin_draft_item_title') || '';
    }
    return '';
  });
  const [itemDesc, setItemDesc] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('admin_draft_item_desc') || '';
    }
    return '';
  });
  const [itemUrl, setItemUrl] = useState('');
  const [itemBackupUrl, setItemBackupUrl] = useState('');
  const [itemFileData, setItemFileData] = useState('');
  const [itemFileName, setItemFileName] = useState('');
  const [itemFileSize, setItemFileSize] = useState('');
  const [isExternalExam, setIsExternalExam] = useState(false);
  const [examDurationMinutes, setExamDurationMinutes] = useState<number>(15);
  const [examTargetPercentage, setExamTargetPercentage] = useState<number>(90);
  const [isUploadingServerFile, setIsUploadingServerFile] = useState<boolean>(false);
  const [serverUploadProgress, setServerUploadProgress] = useState<number>(0);
  const [isSavingItem, setIsSavingItem] = useState<boolean>(false);
  const [isConfirmSaveOpen, setIsConfirmSaveOpen] = useState<boolean>(false);
  const [itemDurationMinutes, setItemDurationMinutes] = useState<number>(15);
  const [showAsEducationalVideo, setShowAsEducationalVideo] = useState<boolean>(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const userClearedTitleRef = useRef<boolean>(false);
  const itemTitleRef = useRef<string>(
    typeof window !== 'undefined' ? (localStorage.getItem('admin_draft_item_title') || sessionStorage.getItem('admin_active_item_title') || '') : ''
  );
  const pinnedTitleRef = useRef<string>(
    typeof window !== 'undefined' ? (localStorage.getItem('admin_draft_item_title') || sessionStorage.getItem('admin_active_item_title') || '') : ''
  );

  // Sync draft to localStorage, sessionStorage, and refs so title is permanently protected
  const updateItemTitle = (val: string, isDirectUserInput = true) => {
    // Guard against browser autofill or stray non-focused synthetic clears
    if (
      isDirectUserInput &&
      val === '' &&
      titleInputRef.current &&
      document.activeElement !== titleInputRef.current &&
      pinnedTitleRef.current
    ) {
      setItemTitle(pinnedTitleRef.current);
      return;
    }

    if (isDirectUserInput) {
      userClearedTitleRef.current = val.length === 0;
    } else if (val) {
      userClearedTitleRef.current = false;
    }

    itemTitleRef.current = val;
    pinnedTitleRef.current = val;
    setItemTitle(val);
    try {
      localStorage.setItem('admin_draft_item_title', val);
      sessionStorage.setItem('admin_active_item_title', val);
    } catch (e) {}
  };

  // Automatic restoration guard: while the upload modal is open, never allow itemTitle to be lost unless user cleared it
  useEffect(() => {
    if (!isAddingItem) return;
    if (!userClearedTitleRef.current && !itemTitle && pinnedTitleRef.current) {
      setItemTitle(pinnedTitleRef.current);
    }
  }, [isAddingItem, itemTitle, itemType, modalSectionId, modalResourceId, itemUrl, itemFileName, showAsEducationalVideo, itemDurationMinutes]);

  const updateItemDesc = (val: string) => {
    setItemDesc(val);
    try {
      if (!editingItem) {
        localStorage.setItem('admin_draft_item_desc', val);
      }
    } catch (e) {}
  };

  // Interactive Question Builder for internal exam
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([
    {
      id: 'q_1',
      questionText: '',
      imageUrl: '',
      options: ['', '', '', ''],
      correctOptionIndex: 0,
      explanation: '',
    },
  ]);

  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [saveToastDetails, setSaveToastDetails] = useState<{ title: string; subtitle?: string; variant?: 'success' | 'error' } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  // Manual Full Data Refresh with instant feedback
  const handleManualRefreshAllData = async () => {
    setIsRefreshingData(true);
    try {
      const [uSnap, sSnap, rSnap, iSnap, cSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'sections')),
        getDocs(collection(db, 'resources')),
        getDocs(collection(db, 'content_items')),
        getDocs(collection(db, 'courses')),
      ]);

      const userList: StudentUser[] = [];
      uSnap.forEach((d) => userList.push({ id: d.id, ...d.data() } as StudentUser));
      userList.sort((a, b) => {
        const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tB - tA;
      });
      setStudents(userList);
      try { localStorage.setItem('raad_cached_admin_students', JSON.stringify(userList)); } catch (e) {}

      const secList: SectionItem[] = [];
      sSnap.forEach((d) => secList.push({ id: d.id, ...d.data() } as SectionItem));
      secList.sort((a, b) => (a.order || 0) - (b.order || 0));
      setSections(secList);
      try { localStorage.setItem('raad_cached_admin_sections', JSON.stringify(secList)); } catch (e) {}

      const resList: ResourceItem[] = [];
      rSnap.forEach((d) => resList.push({ id: d.id, ...d.data() } as ResourceItem));
      resList.sort((a, b) => (a.order || 0) - (b.order || 0));
      setResources(resList);
      try { localStorage.setItem('raad_cached_admin_resources', JSON.stringify(resList)); } catch (e) {}

      const itmList: ContentItem[] = [];
      iSnap.forEach((d) => itmList.push({ id: d.id, ...d.data() } as ContentItem));
      itmList.sort((a, b) => {
        const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (tA !== tB) return tA - tB;
        return (a.id || '').localeCompare(b.id || '');
      });
      setItems(itmList);
      try { localStorage.setItem('raad_cached_admin_items', JSON.stringify(itmList)); } catch (e) {}

      const crsList: CourseItem[] = [];
      cSnap.forEach((d) => crsList.push({ id: d.id, ...d.data() } as CourseItem));
      crsList.sort((a, b) => (a.order || 0) - (b.order || 0));
      if (crsList.length > 0) {
        setCourses(crsList);
      }

      notifySave(`تم التحديث بنجاح! متصل بـ ${userList.length} طالب و ${itmList.length} عنصر.`);
    } catch (err: any) {
      console.warn('Manual refresh error:', err);
      notifySave('حدث خطأ أثناء جلب التحديثات');
    } finally {
      setIsRefreshingData(false);
    }
  };

  // Listen to students in real-time
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const list: StudentUser[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as StudentUser);
        });
        list.sort((a, b) => {
          const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tB - tA;
        });
        setStudents(list);
        try { localStorage.setItem('raad_cached_admin_students', JSON.stringify(list)); } catch (e) {}
      },
      (error) => {
        reportFirestoreListenerError(error, OperationType.LIST, 'users');
      }
    );
    return () => unsub();
  }, []);

  // Listen to student exam attempts in real-time
  useEffect(() => {
    const unsubAttempts = onSnapshot(
      collection(db, 'exam_attempts'),
      (snapshot) => {
        const list: ExamAttempt[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as ExamAttempt);
        });
        list.sort((a, b) => {
          const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tB - tA;
        });
        setExamAttempts(list);
      },
      (error) => {
        reportFirestoreListenerError(error, OperationType.LIST, 'exam_attempts');
      }
    );
    return () => unsubAttempts();
  }, []);

  // Listen to sections, resources, items in real-time
  useEffect(() => {
    const unsubSections = onSnapshot(
      collection(db, 'sections'),
      (snap) => {
        const list: SectionItem[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as SectionItem));
        list.sort((a, b) => (a.order || 0) - (b.order || 0));
        setSections(list);
        try { localStorage.setItem('raad_cached_admin_sections', JSON.stringify(list)); } catch (e) {}
        if (list.length > 0 && !selectedSectionId) {
          setSelectedSectionId(list[0].id);
        }
      },
      (error) => {
        reportFirestoreListenerError(error, OperationType.LIST, 'sections');
      }
    );

    const unsubResources = onSnapshot(
      collection(db, 'resources'),
      (snap) => {
        const list: ResourceItem[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as ResourceItem));
        list.sort((a, b) => (a.order || 0) - (b.order || 0));
        setResources(list);
        try { localStorage.setItem('raad_cached_admin_resources', JSON.stringify(list)); } catch (e) {}
      },
      (error) => {
        reportFirestoreListenerError(error, OperationType.LIST, 'resources');
      }
    );

    const unsubItems = onSnapshot(
      collection(db, 'content_items'),
      (snap) => {
        const list: ContentItem[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as ContentItem));
        // Sort strictly from oldest to newest (من الأقدم للأحدث)
        list.sort((a, b) => {
          const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          if (tA !== tB) return tA - tB;
          return (a.id || '').localeCompare(b.id || '');
        });
        setItems(list);
        try { localStorage.setItem('raad_cached_admin_items', JSON.stringify(list)); } catch (e) {}
      },
      (error) => {
        reportFirestoreListenerError(error, OperationType.LIST, 'content_items');
      }
    );

    const unsubCourses = onSnapshot(
      collection(db, 'courses'),
      (snap) => {
        const list: CourseItem[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as CourseItem));
        list.sort((a, b) => (a.order || 0) - (b.order || 0));
        setCourses(list);
        try {
          localStorage.setItem('raad_cached_courses', JSON.stringify(list));
        } catch (e) {}

        if (list.length > 0) {
          setSelectedIntroCourseId((prev) => {
            const valid = list.some((c) => c.id === prev) ? prev : list[0].id;
            const target = list.find((c) => c.id === valid);
            if (target?.introLesson) {
              setIntroLessonState(target.introLesson);
            }
            return valid;
          });
          setSelectedFeaturesCourseId((prev) => {
            const valid = list.some((c) => c.id === prev) ? prev : list[0].id;
            const target = list.find((c) => c.id === valid);
            if (target?.features) {
              setFeaturesState(target.features);
            }
            return valid;
          });
        }
      },
      (error) => {
        reportFirestoreListenerError(error, OperationType.LIST, 'courses');
      }
    );

    return () => {
      unsubCourses();
      unsubSections();
      unsubResources();
      unsubItems();
    };
  }, []);

  // Sync settings when props change
  useEffect(() => {
    setLockSettings({
      isPlatformLocked: systemSettings.isPlatformLocked,
      lockReason: systemSettings.lockReason,
      lockMessage: systemSettings.lockMessage || 'المنصة مغلقة حالياً، يرجى المحاولة لاحقاً.',
      maintenanceMessage: systemSettings.maintenanceMessage || 'يوجد صيانة حالياً في المنصة لتطوير السيرفرات وتحديث المحتوى، سنعود قريباً بإذن الله.',
      subscriptionMessage: systemSettings.subscriptionMessage || 'تم قفل المنصة بداعي تفعيل وانتهاء الاشتراك، يرجى التواصل مع المشرف لتجديد وتفعيل الاشتراك.',
      whatsappNumber: systemSettings.whatsappNumber || '966500000000',
      telegramUsername: systemSettings.telegramUsername || '@raad_aksam',
    });
    setAnnouncementState(systemSettings.announcement);
    setLiveStreamState(systemSettings.liveStream);
    setSelectedThemeId(systemSettings.activeTheme?.id || THEME_PRESETS[0].id);
    if (systemSettings.introLesson) {
      const activeIntroCourse = courses.find((c) => c.id === selectedIntroCourseId);
      if (activeIntroCourse?.introLesson) {
        setIntroLessonState(activeIntroCourse.introLesson);
      } else {
        setIntroLessonState(systemSettings.introLesson);
      }
    }
    if (systemSettings.features) {
      const activeFeaturesCourse = courses.find((c) => c.id === selectedFeaturesCourseId);
      if (activeFeaturesCourse?.features) {
        setFeaturesState(activeFeaturesCourse.features);
      } else {
        setFeaturesState(systemSettings.features);
      }
    }
  }, [systemSettings]);

  const notifySave = (
    msg = 'تم الحفظ بنجاح!',
    details?: { subtitle?: string; variant?: 'success' | 'error'; durationMs?: number }
  ) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    const isError =
      details?.variant === 'error' ||
      msg.includes('خطأ') ||
      msg.includes('تعذر') ||
      msg.includes('يرجى');
    setSaveStatus(msg);
    setSaveToastDetails({
      title: msg,
      subtitle: details?.subtitle,
      variant: isError ? 'error' : 'success',
    });
    const timeoutMs = details?.durationMs ?? (details?.subtitle ? 5500 : 3500);
    toastTimerRef.current = window.setTimeout(() => {
      setSaveStatus(null);
      setSaveToastDetails(null);
      toastTimerRef.current = null;
    }, timeoutMs);
  };

  // Helper to check if student subscription is unspecified
  const isStudentUnspecified = (st: StudentUser) => {
    if (st.isVip || st.isUnlimited) return false;
    if (st.isCounterPaused) return false;
    if (!st.daysAllowed || st.daysAllowed <= 0) return true;
    if (!st.subscriptionEndDate) return true;
    return false;
  };

  // 1. Set Subscription Days, VIP, or Unlimited for student
  const handleSaveStudentDays = async (isUnlimited = false, isVip = false) => {
    if (!studentForDaysModal) return;
    try {
      if (isVip) {
        await updateDoc(doc(db, 'users', studentForDaysModal.id), {
          isVip: true,
          isUnlimited: true,
          daysAllowed: 0,
          subscriptionStatus: 'vip',
          subscriptionStartDate: new Date().toISOString(),
          subscriptionEndDate: null,
          isCounterPaused: false,
          pausedRemainingDays: 0,
        });
        notifySave(`تمت ترقية حساب الطالب "${studentForDaysModal.name}" إلى VIP ماسي بنجاح 👑!`);
      } else if (isUnlimited) {
        await updateDoc(doc(db, 'users', studentForDaysModal.id), {
          isUnlimited: true,
          isVip: false,
          daysAllowed: 0,
          subscriptionStatus: 'active',
          subscriptionStartDate: new Date().toISOString(),
          subscriptionEndDate: null,
          isCounterPaused: false,
          pausedRemainingDays: 0,
        });
        notifySave(`تم إلغاء الاشتراك وفتح المنصة للطالب "${studentForDaysModal.name}" بشكل مفتوح دائم ⚡`);
      } else {
        const days = Number(selectedDaysAmount);
        const startDate = new Date().toISOString();
        const endDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

        await updateDoc(doc(db, 'users', studentForDaysModal.id), {
          isUnlimited: false,
          isVip: false,
          daysAllowed: days,
          subscriptionStatus: 'active',
          subscriptionStartDate: startDate,
          subscriptionEndDate: endDate,
          isCounterPaused: false,
          pausedRemainingDays: 0,
        });
        notifySave(`تم تحديد ${days} يوماً للاشتراك للطالب "${studentForDaysModal.name}" بنجاح!`);
      }

      setStudentForDaysModal(null);
    } catch (err) {
      console.error('Error updating days:', err);
      notifySave('حدث خطأ أثناء حفظ الأيام');
    }
  };

  // Reset student back to "غير محدد"
  const handleResetToUnspecified = async (studentId: string, studentName: string) => {
    try {
      await updateDoc(doc(db, 'users', studentId), {
        daysAllowed: 0,
        isUnlimited: false,
        isVip: false,
        subscriptionStatus: 'unspecified',
        subscriptionStartDate: '',
        subscriptionEndDate: '',
        isCounterPaused: false,
        pausedRemainingDays: 0,
      });
      notifySave(`تم إعادة حساب الطالب "${studentName}" لحالة "غير محدد" بنجاح ⏳`);
      setStudentForDaysModal(null);
    } catch (err) {
      console.error(err);
      notifySave('حدث خطأ أثناء تعديل الحساب');
    }
  };

  // Toggle VIP directly
  const handleToggleVip = async (student: StudentUser) => {
    try {
      const willBeVip = !student.isVip;
      await updateDoc(doc(db, 'users', student.id), {
        isVip: willBeVip,
        isUnlimited: willBeVip,
        subscriptionStatus: willBeVip ? 'vip' : 'unspecified',
      });
      notifySave(
        willBeVip
          ? `تمت ترقية الطالب "${student.name}" إلى VIP ماسي 👑!`
          : `تم إلغاء وضع VIP للطالب "${student.name}" بنجاح.`
      );
    } catch (err) {
      console.error(err);
      notifySave('حدث خطأ أثناء تعديل وضع VIP');
    }
  };

  // Freeze / Pause Counter & Resume Counter ("قفل العداد ويمكنني إرجاعه مرة أخرى")
  const handleTogglePauseCounter = async (student: StudentUser) => {
    try {
      if (!student.isCounterPaused) {
        // قفل وتجميد العداد وحفظ الأيام المتبقية
        let remainingDays = 0;
        if (student.subscriptionEndDate) {
          const diff = new Date(student.subscriptionEndDate).getTime() - Date.now();
          remainingDays = Math.max(0, Number((diff / (1000 * 60 * 60 * 24)).toFixed(2)));
        } else if (student.daysAllowed) {
          remainingDays = student.daysAllowed;
        }

        await updateDoc(doc(db, 'users', student.id), {
          isCounterPaused: true,
          pausedRemainingDays: remainingDays,
          pausedAt: new Date().toISOString(),
          subscriptionStatus: 'paused',
        });
        notifySave(`تم قفل وتجميد العداد للطالب "${student.name}" بنجاح ⏸️ (تبقى له ${remainingDays} يوم محفوظة)`);
      } else {
        // استئناف وإرجاع العداد
        const daysToRestore = student.pausedRemainingDays || student.daysAllowed || 30;
        const newEndDate = new Date(Date.now() + daysToRestore * 24 * 60 * 60 * 1000).toISOString();

        await updateDoc(doc(db, 'users', student.id), {
          isCounterPaused: false,
          subscriptionEndDate: newEndDate,
          subscriptionStatus: 'active',
        });
        notifySave(`تم استئناف وتشغيل العداد للطالب "${student.name}" بنجاح ▶️`);
      }
    } catch (err) {
      console.error('Error toggling pause counter:', err);
      notifySave('حدث خطأ أثناء تعديل العداد');
    }
  };

  // 2. Individual Student Block Modal Handlers
  const handleSaveIndividualBlock = async () => {
    if (!studentForBlockModal) return;
    try {
      await updateDoc(doc(db, 'users', studentForBlockModal.id), {
        isIndividuallyBlocked: true,
        blockedReason: blockReasonType,
        blockedCustomMessage: blockCustomMessage.trim(),
      });
      notifySave(`تم قفل المنصة على الطالب "${studentForBlockModal.name}" بنجاح.`);
      setStudentForBlockModal(null);
    } catch (err) {
      console.error(err);
      notifySave('حدث خطأ أثناء قفل الحساب');
    }
  };

  const handleUnblockStudent = async (studentId: string) => {
    try {
      await updateDoc(doc(db, 'users', studentId), {
        isIndividuallyBlocked: false,
        blockedReason: null,
        blockedCustomMessage: '',
      });
      notifySave('تم فك القفل وفتح المنصة للطالب بنجاح');
      if (studentForBlockModal?.id === studentId) {
        setStudentForBlockModal(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Handler for activating student course from Admin Panel ("وبجانب حساب كل طالب كلمة اسمها تفعيل اضغط تفعيل واختار له كورس")
  const handleOpenCourseActivationModal = (student: StudentUser) => {
    setStudentForCourseActivation(student);
    setSelectedCoursesForStudent(student.enrolledCourseIds || []);
  };

  const handleConfirmStudentCourseActivation = async () => {
    if (!studentForCourseActivation) return;
    setIsSavingStudentActivation(true);
    try {
      const userRef = doc(db, 'users', studentForCourseActivation.id);
      await updateDoc(userRef, {
        enrolledCourseIds: selectedCoursesForStudent,
        isIndividuallyBlocked: false, // Opens the platform until admin locks it again: "تفتح له المنصة الى ان اقفلها عليه مرة ثانية"
        blockedReason: null,
        blockedCustomMessage: '',
      });
      setStudents((prev) =>
        prev.map((s) =>
          s.id === studentForCourseActivation.id
            ? { ...s, enrolledCourseIds: selectedCoursesForStudent, isIndividuallyBlocked: false }
            : s
        )
      );
      notifySave(`تم تفعيل الكورسات للطالب "${studentForCourseActivation.name}" وفتح المنصة له بنجاح ⚡`);
      setStudentForCourseActivation(null);
    } catch (err) {
      console.error('Error activating course for student:', err);
      notifySave('حدث خطأ أثناء تفعيل الكورس للطالب');
    } finally {
      setIsSavingStudentActivation(false);
    }
  };

  // 3. Toggle Whitelist (when platform is globally locked)
  const handleToggleStudentWhitelist = async (student: StudentUser) => {
    try {
      await updateDoc(doc(db, 'users', student.id), {
        isIndividuallyWhitelisted: !student.isIndividuallyWhitelisted,
      });
      notifySave('تم تحديث حالة استثناء الطالب بنجاح');
    } catch (err) {
      console.error(err);
    }
  };

  // 4. Delete Student: Permanent vs Normal
  const handleConfirmDelete = async (isPermanent: boolean) => {
    if (!deletingStudent) return;
    try {
      if (isPermanent) {
        const cleanEmailId = deletingStudent.email.replace(/[@.]/g, '_');
        await setDoc(doc(db, 'banned_emails', cleanEmailId), {
          email: deletingStudent.email.toLowerCase(),
          bannedAt: new Date().toISOString(),
          reason: 'حذف دائم وحظر من لوحة الإدارة',
        });
      }

      // 1. Immediately signal active student session to log out with 0ms delay
      await updateDoc(doc(db, 'users', deletingStudent.id), {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
      }).catch(() => {});

      // 2. Permanently remove the user document from Firestore
      await deleteDoc(doc(db, 'users', deletingStudent.id));
      setStudents((prev) => prev.filter((st) => st.id !== deletingStudent.id));
      setDeletingStudent(null);
      notifySave(isPermanent ? 'تم الحذف الدائم وحظر البريد وإخراج الطالب فورياً 🗑️' : 'تم الحذف العادي للحساب وإخراج الطالب فورياً 🗑️');
    } catch (err) {
      console.error('Error deleting student:', err);
      notifySave('حدث خطأ أثناء حذف الحساب');
    }
  };

  // 4.1. Save / Update Custom Red Message for specific student
  const handleSaveCustomRedMessage = async (studentId: string, message: string) => {
    setIsSavingRedMessage((prev) => ({ ...prev, [studentId]: true }));
    try {
      const cleanMsg = message.trim();
      await updateDoc(doc(db, 'users', studentId), {
        customRedMessage: cleanMsg,
        isRedMessageActive: cleanMsg ? true : false,
      });
      setStudents((prev) =>
        prev.map((s) =>
          s.id === studentId
            ? { ...s, customRedMessage: cleanMsg, isRedMessageActive: cleanMsg ? true : false }
            : s
        )
      );
      notifySave(cleanMsg ? 'تم حفظ وإرسال التنبيه الأحمر للطالب وتشغيله بنجاح! 🚨' : 'تم مسح التنبيه بنجاح');
    } catch (err) {
      console.error('Error saving red message:', err);
      notifySave('حدث خطأ أثناء حفظ التنبيه');
    } finally {
      setIsSavingRedMessage((prev) => ({ ...prev, [studentId]: false }));
    }
  };

  // 4.1.1. Toggle pause / play of custom red message
  const handleToggleRedMessageActive = async (studentId: string, currentActive?: boolean) => {
    const nextStatus = currentActive === false ? true : false;
    try {
      await updateDoc(doc(db, 'users', studentId), {
        isRedMessageActive: nextStatus,
      });
      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, isRedMessageActive: nextStatus } : s))
      );
      notifySave(nextStatus ? 'تم تشغيل وتفعيل التنبيه للطالب 🟢' : 'تم إيقاف التنبيه مؤقتاً ⏸️');
    } catch (err) {
      console.error('Error toggling red message active state:', err);
      notifySave('حدث خطأ أثناء تعديل حالة التنبيه');
    }
  };

  // 4.1.2. Delete custom red message permanently
  const handleDeleteCustomRedMessage = async (studentId: string) => {
    setIsSavingRedMessage((prev) => ({ ...prev, [studentId]: true }));
    try {
      await updateDoc(doc(db, 'users', studentId), {
        customRedMessage: '',
        isRedMessageActive: false,
      });
      setStudents((prev) =>
        prev.map((s) =>
          s.id === studentId ? { ...s, customRedMessage: '', isRedMessageActive: false } : s
        )
      );
      setStudentRedMessageInput((prev) => ({ ...prev, [studentId]: '' }));
      notifySave('تم حذف التنبيه الأحمر نهائياً من حساب الطالب 🗑️');
    } catch (err) {
      console.error('Error deleting red message:', err);
      notifySave('حدث خطأ أثناء حذف التنبيه');
    } finally {
      setIsSavingRedMessage((prev) => ({ ...prev, [studentId]: false }));
    }
  };

  // 4.1.3. Delete / Revoke student certificate permanently
  const handleDeleteStudentCertificate = async (student: StudentUser) => {
    try {
      await updateDoc(doc(db, 'users', student.id), {
        certificateIssued: null,
      });
      setStudents((prev) =>
        prev.map((s) => (s.id === student.id ? { ...s, certificateIssued: null } : s))
      );
      notifySave(`تم حذف وإلغاء الشهادة من حساب الطالب "${student.name}" بنجاح 🗑️`);
    } catch (err) {
      console.error('Error deleting student certificate:', err);
      notifySave('حدث خطأ أثناء حذف الشهادة');
    }
  };

  // 4.2. Open Certificate issuance modal
  const handleOpenIssueCertModal = (student: StudentUser) => {
    setIssuingCertStudent(student);
    const firstCourseTitle = courses[0]?.title || 'دورة القدرات العامة الشاملة';
    setCertFormCourse(student.certificateIssued?.courseTitle || firstCourseTitle);
    setCertFormGrade(student.certificateIssued?.gradeText || 'ممتاز مرتفع بنسبة 100%');
    setCertFormDirector(student.certificateIssued?.directorName || 'أ. رعد / المشرف العام');
    setCertFormPlatform(student.certificateIssued?.platformName || 'منصة أقسام رعد للقدرات');
    setCertFormNotes(
      student.certificateIssued?.notes ||
        'تقديراً لاجتيازه كافة الاختبارات والمحاضرات بتفوق واقتدار نتمنى له دوام التوفيق والنجاح.'
    );
  };

  // 4.3. Confirm issuance of certificate
  const handleConfirmIssueCertificate = async () => {
    if (!issuingCertStudent) return;
    setIsIssuingCert(true);
    try {
      const serialNum =
        issuingCertStudent.certificateIssued?.serialNumber ||
        `RAAD-CERT-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

      const certData: CertificateData = {
        certificateId: `cert_${issuingCertStudent.id}_${Date.now()}`,
        studentName: issuingCertStudent.name,
        courseTitle: certFormCourse.trim() || 'دورة القدرات العامة الشاملة',
        issueDate: new Date().toLocaleDateString('ar-SA', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        gradeText: certFormGrade.trim() || 'ممتاز مرتفع بنسبة 100%',
        directorName: certFormDirector.trim() || 'أ. رعد / المشرف العام',
        platformName: certFormPlatform.trim() || 'منصة أقسام رعد للقدرات',
        serialNumber: serialNum,
        logoUrl: systemSettings.logoUrl || '',
        notes: certFormNotes.trim(),
      };

      await updateDoc(doc(db, 'users', issuingCertStudent.id), {
        certificateIssued: certData,
      });

      setStudents((prev) =>
        prev.map((s) => (s.id === issuingCertStudent.id ? { ...s, certificateIssued: certData } : s))
      );

      notifySave(`تم إصدار الشهادة الرسمية للطالب "${issuingCertStudent.name}" بنجاح! 🎓`);
      setIssuingCertStudent(null);
    } catch (err) {
      console.error('Error issuing certificate:', err);
      notifySave('حدث خطأ أثناء إصدار الشهادة');
    } finally {
      setIsIssuingCert(false);
    }
  };

  // 5. Save Platform Lock (Global)
  const handleSaveLock = async () => {
    try {
      await setDoc(doc(db, 'system_settings', 'global'), {
        isPlatformLocked: lockSettings.isPlatformLocked,
        lockReason: lockSettings.lockReason,
        lockMessage: lockSettings.lockMessage,
        maintenanceMessage: lockSettings.maintenanceMessage,
        subscriptionMessage: lockSettings.subscriptionMessage,
        whatsappNumber: lockSettings.whatsappNumber,
        telegramUsername: lockSettings.telegramUsername,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      notifySave('تم تحديث وحفظ إعدادات قفل المنصة بنجاح!');
    } catch (err) {
      console.error(err);
      notifySave('حدث خطأ أثناء حفظ القفل');
    }
  };

  // 6. Save Announcement
  const handleSaveAnnouncement = async () => {
    try {
      await setDoc(doc(db, 'system_settings', 'global'), {
        announcement: {
          ...announcementState,
          updatedAt: new Date().toISOString(),
        },
      }, { merge: true });
      notifySave('تم حفظ التنبيه العام لجميع الطلاب!');
    } catch (err) {
      console.error(err);
    }
  };

  // 7. Save Live Stream
  const handleSaveLiveStream = async () => {
    try {
      await setDoc(doc(db, 'system_settings', 'global'), {
        liveStream: {
          ...liveStreamState,
          updatedAt: new Date().toISOString(),
        },
      }, { merge: true });
      notifySave('تم تحديث بيانات البث المباشر بنجاح!');
    } catch (err) {
      console.error(err);
    }
  };

  // 8. Save Theme ("تصاميمي") — FIXED WITH setDoc merge: true
  const handleSaveTheme = async () => {
    const themeObj = THEME_PRESETS.find((t) => t.id === selectedThemeId) || THEME_PRESETS[0];
    try {
      await setDoc(doc(db, 'system_settings', 'global'), {
        activeTheme: themeObj,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      notifySave(`تم تطبيق وحفظ تصميم "${themeObj.name}" لجميع طلاب المنصة فورياً!`);
    } catch (err) {
      console.error('Error saving theme:', err);
      notifySave('حدث خطأ أثناء حفظ التصميم');
    }
  };

  // 8.1. Save Platform Custom Logo & Favicon
  const handleSaveLogo = async () => {
    try {
      await setDoc(doc(db, 'system_settings', 'global'), {
        logoUrl: platformLogoUrl.trim(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      if (typeof window !== 'undefined' && platformLogoUrl.trim()) {
        try {
          localStorage.setItem('raad_platform_logo_url', platformLogoUrl.trim());
          const iconLinks = document.querySelectorAll<HTMLLinkElement>("link[rel*='icon'], link[rel*='apple-touch-icon']");
          iconLinks.forEach((link) => {
            link.href = platformLogoUrl.trim();
          });
        } catch (e) {}
      }
      notifySave('تم حفظ وتحديث شعار المنصة بنجاح وسيظهر لجميع المتصفحات فورياً! ⚡');
    } catch (err) {
      console.error('Error saving logo:', err);
      notifySave('حدث خطأ أثناء حفظ الشعار');
    }
  };

  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingLogo(true);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setPlatformLogoUrl(result);
      setIsUploadingLogo(false);
      notifySave(`تم تحميل صورة الشعار "${file.name}"، لا تنس الضغط على حفظ!`);
    };
    reader.onerror = () => {
      setIsUploadingLogo(false);
      notifySave('حدث خطأ أثناء قراءة ملف الصورة');
    };
    reader.readAsDataURL(file);
  };

  // Select Course for Intro Lesson Tab
  const handleSelectIntroCourse = (courseId: string) => {
    setSelectedIntroCourseId(courseId);
    const target = courses.find((c) => c.id === courseId);
    if (target?.introLesson) {
      setIntroLessonState(target.introLesson);
    } else {
      setIntroLessonState({
        isActive: true,
        title: `الحصة التعريفية - ${target?.title || 'الكورس'}`,
        videoUrl: '',
        description: `شاهد هذا الفيديو للتعرف على طريقة دراسة ${target?.title || ''} وتحقيق المئوية بإذن الله`,
      });
    }
  };

  // Select Course for Features Tab
  const handleSelectFeaturesCourse = (courseId: string) => {
    setSelectedFeaturesCourseId(courseId);
    const target = courses.find((c) => c.id === courseId);
    if (target?.features) {
      setFeaturesState({
        telegramMainGroupUrl: target.features.telegramMainGroupUrl || '',
        telegramDiscussionGroupUrl: target.features.telegramDiscussionGroupUrl || '',
        telegramMainGroupTitle: target.features.telegramMainGroupTitle || 'جروب أقسام رعد الأساسي',
        telegramDiscussionGroupTitle: target.features.telegramDiscussionGroupTitle || 'جروب أقسام رعد المناقشة',
        isDiagnosticEnabled: target.features.isDiagnosticEnabled !== false,
        isFriendsChallengeEnabled: target.features.isFriendsChallengeEnabled !== false,
      });
    } else {
      setFeaturesState({
        telegramMainGroupUrl: systemSettings.features?.telegramMainGroupUrl || 'https://t.me/raad_qiyas_main',
        telegramDiscussionGroupUrl: systemSettings.features?.telegramDiscussionGroupUrl || 'https://t.me/raad_qiyas_discussion',
        telegramMainGroupTitle: systemSettings.features?.telegramMainGroupTitle || 'جروب أقسام رعد الأساسي',
        telegramDiscussionGroupTitle: systemSettings.features?.telegramDiscussionGroupTitle || 'جروب أقسام رعد المناقشة',
        isDiagnosticEnabled: true,
        isFriendsChallengeEnabled: true,
      });
    }
  };

  // 8.5. Save Intro Lesson ("الحصة التعريفية") per course
  const handleSaveIntroLesson = async () => {
    const targetCourse = courses.find((c) => c.id === selectedIntroCourseId) || courses[0];
    if (!targetCourse) {
      notifySave('يرجى اختيار الكورس أولاً');
      return;
    }

    setIsSavingIntroLesson(true);
    try {
      let resolvedIntroUrl = resolveVideoUrl(introLessonState.videoUrl?.trim() || '');
      let introBackupUrl = introLessonState.backupUrl || '';
      if (resolvedIntroUrl && (resolvedIntroUrl.startsWith('http://') || resolvedIntroUrl.startsWith('https://'))) {
        try {
          const mirrorResp = await fetch('/api/mirror-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: resolvedIntroUrl }),
          });
          const mirrorData = await mirrorResp.json();
          if (mirrorData?.success && mirrorData.savedInFirebase && mirrorData.playUrl) {
            introBackupUrl = resolvedIntroUrl;
            resolvedIntroUrl = mirrorData.playUrl;
          }
        } catch {}
      }

      const cleanIntro: IntroLessonConfig = {
        isActive: introLessonState.isActive !== false,
        title: introLessonState.title?.trim() || `الحصة التعريفية - ${targetCourse.title}`,
        videoUrl: resolvedIntroUrl,
        ...(introBackupUrl ? { backupUrl: introBackupUrl } : {}),
        description: introLessonState.description?.trim() || '',
        updatedAt: new Date().toISOString(),
      };

      // 1. Save strictly to the chosen course doc in Firestore
      await setDoc(
        doc(db, 'courses', targetCourse.id),
        {
          introLesson: cleanIntro,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      // 2. Immediate local state update
      setCourses((prev) =>
        prev.map((c) => (c.id === targetCourse.id ? { ...c, introLesson: cleanIntro } : c))
      );

      // 3. Keep global fallback updated for primary course
      if (targetCourse.id === 'course_default_1') {
        await setDoc(
          doc(db, 'system_settings', 'global'),
          {
            introLesson: cleanIntro,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        ).catch(() => {});
      }

      void bumpCatalogVersion();
      notifySave(`تم حفظ وتحديث الحصة التعريفية الخاصة بكورس "${targetCourse.title}" بنجاح 🎬`);
    } catch (err) {
      console.error('Error saving intro lesson:', err);
      notifySave('حدث خطأ أثناء حفظ الحصة التعريفية');
    } finally {
      setIsSavingIntroLesson(false);
    }
  };

  const handleIntroVideoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingIntroVideo(true);

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');

    xhr.onload = () => {
      setIsUploadingIntroVideo(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.success && res.url) {
            const fallbackUrl =
              res.localUrl && res.localUrl !== res.url
                ? res.localUrl
                : res.mediaId && `/api/media/${res.mediaId}` !== res.url
                ? `/api/media/${res.mediaId}`
                : '';
            setIntroLessonState((prev) => ({
              ...prev,
              videoUrl: res.url,
              ...(fallbackUrl ? { backupUrl: fallbackUrl } : {}),
            }));
            notifySave(
              res.savedInFirebase
                ? `تم رفع وحفظ فيديو الحصة التعريفية "${file.name}" في Firebase بنجاح! لا تنس الضغط على حفظ ⚡`
                : `تم رفع وحفظ فيديو الحصة التعريفية "${file.name}" على الخادم بنجاح! لا تنس الضغط على حفظ ⚡`
            );
            return;
          }
        } catch (e) {}
      }
      notifySave(`تعذر رفع الفيديو "${file.name}" إلى الخادم. حاول مرة أخرى أو أضف رابط فيديو مباشر.`);
    };

    xhr.onerror = () => {
      setIsUploadingIntroVideo(false);
      notifySave(`تعذر الاتصال بالخادم لرفع الفيديو "${file.name}". يرجى المحاولة مرة أخرى.`);
    };

    xhr.send(formData);
  };

  // ================= COURSES CRUD =================
  const handleOpenAddCourse = () => {
    setEditingCourse(null);
    setCourseFormTitle('');
    setCourseFormDesc('');
    setCourseFormImage('');
    setCourseFormIsLocked(false);
    setCourseFormPrice('199 ريال');
    setCourseFormBank1('');
    setCourseFormBank2('');
    setCourseFormPaymentMessage('الرجاء تحويل المبلغ على أحد الحسابين أعلاه ثم إرسال الإشعار لتفعيل الكورس فوراً.');
    setCourseFormOrder(courses.length + 1);
    setIsAddingCourse(true);
  };

  const handleOpenEditCourse = (course: CourseItem) => {
    setEditingCourse(course);
    setCourseFormTitle(course.title);
    setCourseFormDesc(course.description || '');
    setCourseFormImage(course.imageUrl || '');
    setCourseFormIsLocked(Boolean(course.isLocked));
    setCourseFormPrice(course.price || '199 ريال');
    setCourseFormBank1(course.bankAccountImage1 || '');
    setCourseFormBank2(course.bankAccountImage2 || '');
    setCourseFormPaymentMessage(course.paymentMessage || 'الرجاء تحويل المبلغ على أحد الحسابين أعلاه ثم إرسال الإشعار لتفعيل الكورس فوراً.');
    setCourseFormOrder(course.order || 1);
    setIsAddingCourse(true);
  };

  const handleCourseFileUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'cover' | 'bank1' | 'bank2') => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (target === 'cover') setIsUploadingCourseCover(true);
    if (target === 'bank1') setIsUploadingBank1(true);
    if (target === 'bank2') setIsUploadingBank2(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawData = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 800;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.75);
          if (target === 'cover') {
            setCourseFormImage(compressed);
            setIsUploadingCourseCover(false);
          } else if (target === 'bank1') {
            setCourseFormBank1(compressed);
            setIsUploadingBank1(false);
          } else if (target === 'bank2') {
            setCourseFormBank2(compressed);
            setIsUploadingBank2(false);
          }
        } else {
          if (target === 'cover') { setCourseFormImage(rawData); setIsUploadingCourseCover(false); }
          else if (target === 'bank1') { setCourseFormBank1(rawData); setIsUploadingBank1(false); }
          else if (target === 'bank2') { setCourseFormBank2(rawData); setIsUploadingBank2(false); }
        }
        notifySave(`تم تحميل وضغط الصورة "${file.name}" بنجاح 🖼️`);
      };
      img.onerror = () => {
        if (target === 'cover') setIsUploadingCourseCover(false);
        if (target === 'bank1') setIsUploadingBank1(false);
        if (target === 'bank2') setIsUploadingBank2(false);
        notifySave('حدث خطأ أثناء معالجة الصورة');
      };
      img.src = rawData;
    };
    reader.onerror = () => {
      if (target === 'cover') setIsUploadingCourseCover(false);
      if (target === 'bank1') setIsUploadingBank1(false);
      if (target === 'bank2') setIsUploadingBank2(false);
      notifySave('حدث خطأ أثناء قراءة ملف الصورة');
    };
    reader.readAsDataURL(file);
  };

  const handleRestoreCourses = async () => {
    setIsRestoringCourses(true);
    try {
      const res = await restoreDefaultCoursesAndContent();
      await bumpCatalogVersion();
      notifySave(res.message);
    } catch (e) {
      console.error(e);
      notifySave('حدث خطأ أثناء استرجاع الكورس');
    } finally {
      setIsRestoringCourses(false);
    }
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseFormTitle.trim()) {
      notifySave('يرجى كتابة اسم الكورس أولاً');
      return;
    }
    setIsSavingCourse(true);
    try {
      const courseId = editingCourse ? editingCourse.id : `course_${Date.now()}`;
      const courseRef = doc(db, 'courses', courseId);
      
      // CRITICAL: NEVER pass undefined values to setDoc in Firestore
      const cleanData: Record<string, any> = {
        id: courseId,
        title: courseFormTitle.trim(),
        description: courseFormDesc.trim(),
        imageUrl: courseFormImage.trim() || 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&auto=format&fit=crop&q=80',
        isLocked: Boolean(courseFormIsLocked),
        price: courseFormPrice.trim() || '199 ريال',
        order: Number(courseFormOrder) || (courses.length + 1),
        bankAccountImage1: courseFormBank1.trim() || '',
        bankAccountImage2: courseFormBank2.trim() || '',
        paymentMessage: courseFormPaymentMessage.trim() || '',
        createdAt: editingCourse?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(courseRef, cleanData, { merge: true });
      void bumpCatalogVersion();

      // Immediate local state update for instant UI feedback
      setCourses((prev) => {
        const exists = prev.some((c) => c.id === courseId);
        if (exists) {
          return prev.map((c) => (c.id === courseId ? ({ ...c, ...cleanData } as CourseItem) : c));
        }
        return [...prev, cleanData as CourseItem].sort((a, b) => (a.order || 0) - (b.order || 0));
      });
      setSelectedCourseId(courseId);

      setIsAddingCourse(false);
      setEditingCourse(null);
      notifySave(editingCourse ? 'تم تعديل وحفظ بيانات الكورس بنجاح 📚' : 'تم إضافة الكورس الجديد بنجاح 📚');
    } catch (err) {
      console.error('Error saving course:', err);
      notifySave('حدث خطأ أثناء حفظ الكورس');
    } finally {
      setIsSavingCourse(false);
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    setIsDeletingCourseInProgress(true);
    try {
      // 1. Identify sections belonging to this course
      const matchedSections = sections.filter(
        (s) => s.courseId === courseId || (courseId === 'course_default_1' && !s.courseId)
      );
      const sectionIds = new Set(matchedSections.map((s) => s.id));

      // 2. Identify resources belonging to these sections or directly matching courseId
      const matchedResources = resources.filter(
        (r) => sectionIds.has(r.sectionId) || (r as any).courseId === courseId
      );
      const resourceIds = new Set(matchedResources.map((r) => r.id));

      // 3. Identify content items (videos, files, exams) belonging to these resources or courseId
      const matchedItems = items.filter(
        (item) => resourceIds.has(item.resourceId) || (item as any).courseId === courseId
      );
      const itemIds = new Set(matchedItems.map((i) => i.id));

      // 4. Cascade delete content items from Firestore
      const itemsDeletePromises: Promise<any>[] = [];
      itemIds.forEach((itemId) => {
        itemsDeletePromises.push(deleteDoc(doc(db, 'content_items', itemId)).catch(() => {}));
      });

      // Query any items by resourceId in Firestore to guarantee complete purge
      for (const resId of Array.from(resourceIds)) {
        try {
          const snap = await getDocs(query(collection(db, 'content_items'), where('resourceId', '==', resId)));
          snap.forEach((d) => {
            if (!itemIds.has(d.id)) {
              itemsDeletePromises.push(deleteDoc(d.ref).catch(() => {}));
            }
          });
        } catch (e) {}
      }

      // 5. Cascade delete resources from Firestore
      const resourcesDeletePromises: Promise<any>[] = [];
      resourceIds.forEach((resId) => {
        resourcesDeletePromises.push(deleteDoc(doc(db, 'resources', resId)).catch(() => {}));
      });

      for (const secId of Array.from(sectionIds)) {
        try {
          const snap = await getDocs(query(collection(db, 'resources'), where('sectionId', '==', secId)));
          snap.forEach((d) => {
            if (!resourceIds.has(d.id)) {
              resourcesDeletePromises.push(deleteDoc(d.ref).catch(() => {}));
            }
          });
        } catch (e) {}
      }

      // 6. Cascade delete sections from Firestore
      const sectionsDeletePromises: Promise<any>[] = [];
      sectionIds.forEach((secId) => {
        sectionsDeletePromises.push(deleteDoc(doc(db, 'sections', secId)).catch(() => {}));
      });

      try {
        const snap = await getDocs(query(collection(db, 'sections'), where('courseId', '==', courseId)));
        snap.forEach((d) => {
          sectionsDeletePromises.push(deleteDoc(d.ref).catch(() => {}));
        });
      } catch (e) {}

      // 7. Cascade delete folders and folder questions associated with this course
      const folderDeletePromises: Promise<any>[] = [];
      try {
        const foldersSnap = await getDocs(query(collection(db, 'folders'), where('courseId', '==', courseId)));
        for (const fDoc of foldersSnap.docs) {
          folderDeletePromises.push(deleteDoc(fDoc.ref).catch(() => {}));
          const fqSnap = await getDocs(query(collection(db, 'folder_questions'), where('folderId', '==', fDoc.id)));
          fqSnap.forEach((fqDoc) => {
            folderDeletePromises.push(deleteDoc(fqDoc.ref).catch(() => {}));
          });
        }

        const fqCourseSnap = await getDocs(query(collection(db, 'folder_questions'), where('courseId', '==', courseId)));
        fqCourseSnap.forEach((fqDoc) => {
          folderDeletePromises.push(deleteDoc(fqDoc.ref).catch(() => {}));
        });
      } catch (e) {}

      // 8. Delete the Course document itself
      const courseDocPromise = deleteDoc(doc(db, 'courses', courseId));

      await Promise.all([
        ...itemsDeletePromises,
        ...resourcesDeletePromises,
        ...sectionsDeletePromises,
        ...folderDeletePromises,
        courseDocPromise,
      ]);
      void bumpCatalogVersion();

      // 9. Update local state immediately for zero-delay UI feedback
      const updatedCourses = courses.filter((c) => c.id !== courseId);
      setCourses(updatedCourses);
      try {
        localStorage.setItem('raad_cached_courses', JSON.stringify(updatedCourses));
      } catch (e) {}

      setSections((prev) => prev.filter((s) => !sectionIds.has(s.id) && s.courseId !== courseId));
      setResources((prev) => prev.filter((r) => !resourceIds.has(r.id)));
      setItems((prev) => prev.filter((i) => !itemIds.has(i.id) && !resourceIds.has(i.resourceId)));

      if (selectedCourseId === courseId) {
        setSelectedCourseId(updatedCourses.length > 0 ? updatedCourses[0].id : '');
      }

      setDeletingCourse(null);
      notifySave('تم حذف الكورس وجميع أقسامه ومصادره وفيديوهاته وملفاته واختباراته بنجاح 🗑️');
    } catch (err) {
      console.error('Error cascade deleting course:', err);
      notifySave('حدث خطأ أثناء حذف الكورس ومحتوياته');
    } finally {
      setIsDeletingCourseInProgress(false);
    }
  };

  // ================= CONTENT CRUD =================
  // 9. Section CRUD
  const handleCreateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSectionTitle.trim()) return;
    try {
      const newRef = doc(collection(db, 'sections'));
      await setDoc(newRef, {
        id: newRef.id,
        courseId: selectedCourseId || 'course_default_1',
        title: newSectionTitle.trim(),
        description: newSectionDesc.trim(),
        order: Number(newSectionOrder) || sections.length + 1,
        createdAt: new Date().toISOString(),
      });
      void bumpCatalogVersion();
      setNewSectionTitle('');
      setNewSectionDesc('');
      setNewSectionOrder(sections.length + 2);
      setIsAddingSection(false);
      setSelectedSectionId(newRef.id);
      notifySave('تم إضافة القسم بنجاح');
    } catch (err) {
      console.error(err);
      notifySave('حدث خطأ أثناء إضافة القسم');
    }
  };

  const handleUpdateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSection || !newSectionTitle.trim()) return;
    try {
      await updateDoc(doc(db, 'sections', editingSection.id), {
        title: newSectionTitle.trim(),
        description: newSectionDesc.trim(),
        order: Number(newSectionOrder) || editingSection.order || 1,
        courseId: editingSection.courseId || selectedCourseId || 'course_default_1',
      });
      void bumpCatalogVersion();
      setEditingSection(null);
      setNewSectionTitle('');
      setNewSectionDesc('');
      notifySave('تم تعديل بيانات القسم وترتيبه بنجاح');
    } catch (err) {
      console.error(err);
      notifySave('حدث خطأ أثناء تعديل القسم');
    }
  };

  const handleReorderSection = async (secId: string, newOrder: number) => {
    try {
      await updateDoc(doc(db, 'sections', secId), { order: Number(newOrder) });
      void bumpCatalogVersion();
      notifySave(`تم تعديل ترتيب القسم إلى (${newOrder}) بنجاح`);
    } catch (err) {
      console.error(err);
      notifySave('حدث خطأ أثناء تحديث الترتيب');
    }
  };

  const handleDeleteSection = (secId: string, secTitle?: string) => {
    const sec = sections.find((s) => s.id === secId);
    setDeleteTarget({
      type: 'section',
      id: secId,
      title: secTitle || sec?.title || 'هذا القسم',
      subtitle: 'سيتم حذف هذا القسم وكافة المصادر والعناصر (الفيديوهات والاختبارات والملفات) التابعة له نهائياً من قاعدة البيانات.',
    });
  };

  // 10. Resource CRUD
  const handleCreateResource = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetSecId = selectedSectionId || effectiveSectionId;
    if (!newResourceTitle.trim() || !targetSecId) return;
    try {
      const newRef = doc(collection(db, 'resources'));
      const secResources = resources.filter((r) => r.sectionId === targetSecId);
      await setDoc(newRef, {
        id: newRef.id,
        courseId: selectedCourseId || 'course_default_1',
        sectionId: targetSecId,
        title: newResourceTitle.trim(),
        description: newResourceDesc.trim(),
        order: Number(newResourceOrder) || secResources.length + 1,
        createdAt: new Date().toISOString(),
      });
      void bumpCatalogVersion();
      setNewResourceTitle('');
      setNewResourceDesc('');
      setNewResourceOrder(secResources.length + 2);
      setIsAddingResource(false);
      setSelectedResourceId(newRef.id);
      notifySave('تم إضافة المصدر بنجاح لهذا الكورس 📚');
    } catch (err) {
      console.error(err);
      notifySave('حدث خطأ أثناء إضافة المصدر');
    }
  };

  const handleUpdateResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingResource || !newResourceTitle.trim()) return;
    try {
      await updateDoc(doc(db, 'resources', editingResource.id), {
        title: newResourceTitle.trim(),
        description: newResourceDesc.trim(),
        order: Number(newResourceOrder) || editingResource.order || 1,
      });
      void bumpCatalogVersion();
      setEditingResource(null);
      setNewResourceTitle('');
      setNewResourceDesc('');
      notifySave('تم تعديل بيانات المصدر وترتيبه بنجاح');
    } catch (err) {
      console.error(err);
      notifySave('حدث خطأ أثناء تعديل المصدر');
    }
  };

  const handleReorderResource = async (resId: string, newOrder: number) => {
    try {
      await updateDoc(doc(db, 'resources', resId), { order: Number(newOrder) });
      void bumpCatalogVersion();
      notifySave(`تم تعديل ترتيب المصدر إلى (${newOrder}) بنجاح`);
    } catch (err) {
      console.error(err);
      notifySave('حدث خطأ أثناء تحديث الترتيب');
    }
  };

  const handleDeleteResource = (resId: string, resTitle?: string) => {
    const res = resources.find((r) => r.id === resId);
    setDeleteTarget({
      type: 'resource',
      id: resId,
      title: resTitle || res?.title || 'هذا المصدر',
      subtitle: 'سيتم حذف هذا المصدر وجميع العناصر التعليمية (الفيديوهات والاختبارات والملفات) المرتبطة به نهائياً.',
    });
  };

  // 11. Content Item CRUD & Direct File Upload (Video, PDF, Exam files)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setItemFileName(file.name);
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    setItemFileSize(`${sizeMb} MB`);

    // Upload to server / Firebase directly via /api/upload (do NOT inject temporary blob: URL into itemUrl)
    const formData = new FormData();
    formData.append('file', file);

    setIsUploadingServerFile(true);
    setServerUploadProgress(0);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setServerUploadProgress(percent);
      }
    };

    xhr.onload = () => {
      setIsUploadingServerFile(false);
      if (pinnedTitleRef.current) {
        setItemTitle((prev) => prev || pinnedTitleRef.current || itemTitleRef.current);
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.success && res.url) {
            const fallbackUrl =
              res.localUrl && res.localUrl !== res.url
                ? res.localUrl
                : res.mediaId && `/api/media/${res.mediaId}` !== res.url
                ? `/api/media/${res.mediaId}`
                : '';
            setItemUrl(res.url);
            setItemBackupUrl(fallbackUrl);
            setItemFileName(res.fileName || file.name);
            setItemFileSize(res.fileSize || `${sizeMb} MB`);
            notifySave(
              res.savedInFirebase
                ? `تم رفع ومعالجة ${itemType === 'video' ? 'الفيديو' : 'الملف'} (${file.name}) وحفظه في Firebase بنجاح ✓⚡`
                : `تم رفع ومعالجة ${itemType === 'video' ? 'الفيديو' : 'المستند'} (${file.name}) وحفظه على خادم المنصة بنجاح ⚡`
            );
            return;
          }
        } catch (e) {}
      }
      notifySave(`تعذر رفع الملف (${file.name}) على الخادم. يرجى المحاولة مرة أخرى أو وضع رابط مباشر.`);
    };

    xhr.onerror = () => {
      setIsUploadingServerFile(false);
      notifySave(`حدث خطأ في الشبكة أثناء رفع (${file.name}). يرجى المحاولة مرة أخرى.`);
    };

    xhr.send(formData);
  };

  // Dedicated Exam File Upload & Parser (JSON, CSV, Excel/Text)
  const handleExamFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setItemFileName(file.name);
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    setItemFileSize(`${sizeMb} MB`);

    try {
      const fileText = await file.text();
      let importedQuestions: ExamQuestion[] = [];

      // 1. Try parsing as JSON
      const isJson = file.name.endsWith('.json') || file.type.includes('json') || fileText.trim().startsWith('[') || fileText.trim().startsWith('{');
      if (isJson) {
        try {
          const parsed = JSON.parse(fileText);
          const rawList = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.questions) ? parsed.questions : []);
          if (parsed.title && !itemTitleRef.current.trim() && !pinnedTitleRef.current.trim()) {
            updateItemTitle(parsed.title, false);
          }
          if (rawList.length > 0) {
            importedQuestions = rawList.map((item: any, idx: number) => {
              const qText = item.questionText || item.question || item.text || item.title || `سؤال ${idx + 1}`;
              const rawOpts = item.options || item.choices || item.answers || [];
              const opts = Array.isArray(rawOpts) && rawOpts.length > 0
                ? rawOpts.map((o: any, oIdx: number) => String(o || `الخيار ${oIdx + 1}`).trim())
                : ['الخيار أ', 'الخيار ب', 'الخيار ج', 'الخيار د'];
              let correctIdx = 0;
              if (typeof item.correctOptionIndex === 'number') {
                correctIdx = item.correctOptionIndex;
              } else if (typeof item.correctAnswer === 'number') {
                correctIdx = item.correctAnswer;
              } else if (typeof item.answer === 'number') {
                correctIdx = item.answer;
              } else if (typeof item.correctAnswer === 'string') {
                const foundIdx = opts.findIndex((o: string) => o.trim() === item.correctAnswer.trim());
                if (foundIdx >= 0) correctIdx = foundIdx;
              }

              return {
                id: item.id || `q_${Date.now()}_${idx}`,
                questionText: qText,
                imageUrl: item.imageUrl || item.image || '',
                options: opts.length >= 4 ? opts.slice(0, 4) : [...opts, ...['أ', 'ب', 'ج', 'د'].slice(opts.length)],
                correctOptionIndex: correctIdx,
                explanation: item.explanation || item.notes || '',
              };
            });
          }
        } catch (jsonErr) {
          console.warn('Could not parse as standard JSON:', jsonErr);
        }
      }

      // 2. If not JSON or JSON was empty, try parsing as CSV / Delimited lines
      if (importedQuestions.length === 0) {
        const lines = fileText.split(/\r?\n/).filter((l) => l.trim().length > 0);
        lines.forEach((line, idx) => {
          const parts = line.split(/[,\t;|]/).map((p) => p.trim());
          if (parts.length >= 3) {
            const qText = parts[0];
            const opts = parts.slice(1, 5);
            while (opts.length < 4) {
              opts.push(`الخيار ${opts.length + 1}`);
            }
            const correctNum = parts[5] ? parseInt(parts[5], 10) : 0;
            const explanation = parts[6] || '';
            importedQuestions.push({
              id: `q_csv_${Date.now()}_${idx}`,
              questionText: qText,
              imageUrl: '',
              options: opts,
              correctOptionIndex: isNaN(correctNum) ? 0 : Math.max(0, Math.min(3, correctNum)),
              explanation,
            });
          }
        });
      }

      if (importedQuestions.length > 0) {
        setExamQuestions(importedQuestions);
        if (!itemTitle.trim() && !pinnedTitleRef.current.trim()) {
          updateItemTitle(file.name.replace(/\.[^/.]+$/, ''));
        } else if (pinnedTitleRef.current.trim() && !itemTitle.trim()) {
          setItemTitle(pinnedTitleRef.current.trim());
        }
        notifySave(`تم استيراد ${importedQuestions.length} سؤال من ملف الاختبار (${file.name}) بنجاح ✓`);
      } else {
        notifySave(`تم قراءة ملف الاختبار (${file.name}). تأكد من احتواء الملف على أسئلة وخيارات.`);
      }
    } catch (readErr) {
      console.error('Error reading exam file:', readErr);
      notifySave('حدث خطأ أثناء قراءة ملف الاختبار');
    }
  };

  const handleQuestionImageUpload = async (qIdx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. Permanently protect current title so it NEVER gets deleted
    const currentTitle = itemTitle.trim() || pinnedTitleRef.current.trim();
    if (currentTitle) {
      pinnedTitleRef.current = currentTitle;
      setItemTitle(currentTitle);
      try {
        localStorage.setItem('admin_draft_item_title', currentTitle);
      } catch (err) {}
    }

    // 2. Upload to server first for a small permanent URL
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.url) {
        setExamQuestions((prev) => {
          const next = [...prev];
          next[qIdx] = { ...next[qIdx], imageUrl: data.url };
          return next;
        });
        if (currentTitle) {
          setItemTitle(currentTitle);
          pinnedTitleRef.current = currentTitle;
        }
        notifySave('تم رفع صورة السؤال وحفظها على الخادم بنجاح ✓');
        return;
      }
    } catch (uploadErr) {
      console.warn('Server upload fallback to canvas', uploadErr);
    }

    // Fallback: local compressed canvas image
    const reader = new FileReader();
    reader.onload = (event) => {
      const rawData = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 800;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedUri = canvas.toDataURL('image/jpeg', 0.7);
          setExamQuestions((prev) => {
            const next = [...prev];
            next[qIdx] = { ...next[qIdx], imageUrl: compressedUri };
            return next;
          });
          if (currentTitle) {
            setItemTitle(currentTitle);
            pinnedTitleRef.current = currentTitle;
          }
        }
      };
      img.src = rawData;
    };
    reader.readAsDataURL(file);
  };

  // Request to Save: opens confirmation modal "هل فعلاً تريد حفظ التعديلات؟"
  const handleRequestSaveItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const resolvedTitle = (
      itemTitle.trim() ||
      itemTitleRef.current.trim() ||
      pinnedTitleRef.current.trim() ||
      (editingItem ? editingItem.title : '') ||
      (typeof window !== 'undefined' ? (localStorage.getItem('admin_draft_item_title') || '') : '')
    ).trim();

    if (!resolvedTitle) {
      notifySave('يرجى كتابة عنوان العنصر أولاً');
      return;
    }

    setIsConfirmSaveOpen(true);
  };

  const handleSaveContentItem = handleRequestSaveItem;

  // Execute Save: persists to Firestore and updates all state
  const executeSaveContentItem = async () => {
    let targetResId = modalResourceId || (editingItem ? editingItem.resourceId : '') || selectedResourceId || effectiveResourceId;
    if (!targetResId) {
      const secId = modalSectionId || selectedSectionId || effectiveSectionId;
      if (secId) {
        const existingRes = resources.find((r) => r.sectionId === secId);
        if (existingRes) {
          targetResId = existingRes.id;
        } else {
          const secObj = sections.find((s) => s.id === secId);
          const newResRef = doc(collection(db, 'resources'));
          await setDoc(newResRef, {
            id: newResRef.id,
            courseId: selectedCourseId || 'course_default_1',
            sectionId: secId,
            title: `المحتوى العام (${secObj?.title || 'قسم جديد'})`,
            description: 'تم إنشاؤه تلقائياً لتضمين المحتوى المنفصل لهذا الكورس',
            order: 1,
            createdAt: new Date().toISOString(),
          });
          targetResId = newResRef.id;
          setSelectedResourceId(targetResId);
        }
      }
    }

    const resolvedTitle = (
      itemTitle.trim() ||
      itemTitleRef.current.trim() ||
      pinnedTitleRef.current.trim() ||
      (editingItem ? editingItem.title : '') ||
      (typeof window !== 'undefined' ? (localStorage.getItem('admin_draft_item_title') || '') : '')
    ).trim();

    if (!resolvedTitle || !targetResId) {
      notifySave('يرجى كتابة عنوان العنصر وتحديد المصدر');
      setIsConfirmSaveOpen(false);
      return;
    }

    setIsSavingItem(true);
    try {
      const targetId = editingItem ? editingItem.id : doc(collection(db, 'content_items')).id;
      const basePayload: any = {
        id: targetId,
        resourceId: targetResId,
        type: itemType,
        title: resolvedTitle,
        description: itemDesc.trim(),
        createdAt: editingItem ? (editingItem.createdAt || new Date().toISOString()) : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (itemType === 'video') {
        let finalUrl = resolveVideoUrl(itemUrl.trim() || itemFileData || (editingItem ? editingItem.url : '') || '');
        if (finalUrl.startsWith('blob:')) {
          finalUrl = editingItem?.url ? resolveVideoUrl(editingItem.url) : '';
        }
        if (finalUrl.startsWith('data:') && finalUrl.length > 750000) {
          finalUrl = editingItem?.url ? resolveVideoUrl(editingItem.url) : '';
        }
        if (!finalUrl) {
          notifySave('يرجى إدخال رابط الفيديو المباشر أو انتظار اكتمال رفع الفيديو قبل الحفظ');
          setIsSavingItem(false);
          setIsConfirmSaveOpen(false);
          return;
        }

        // Preserve full original external URL and mirror +faststart on server / Firebase Firestore
        if (finalUrl.startsWith('http://') || finalUrl.startsWith('https://')) {
          basePayload.backupUrl = finalUrl;
          try {
            const mirrorResp = await fetch('/api/mirror-video', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: finalUrl }),
            });
            const mirrorData = await mirrorResp.json();
            if (mirrorData?.success && mirrorData.savedInFirebase && mirrorData.playUrl) {
              basePayload.backupUrl = finalUrl;
              finalUrl = mirrorData.playUrl;
            }
          } catch {}
        } else if (itemBackupUrl) {
          basePayload.backupUrl = resolveVideoUrl(itemBackupUrl);
        } else if (editingItem?.backupUrl) {
          basePayload.backupUrl = resolveVideoUrl(editingItem.backupUrl);
        }

        basePayload.url = finalUrl;
        const finalFileData = itemFileData || (editingItem ? (editingItem.fileData || '') : '');
        if (finalFileData && !finalFileData.startsWith('blob:') && finalFileData.length < 750000) {
          basePayload.fileData = finalFileData;
        }
        basePayload.fileName = itemFileName || (editingItem ? editingItem.fileName : '') || 'video.mp4';
        basePayload.durationMinutes = Number(itemDurationMinutes) || editingItem?.durationMinutes || 15;
        basePayload.showAsEducationalVideo = Boolean(showAsEducationalVideo);
        basePayload.linkedExamIds = linkedExamIds;
        basePayload.linkedFileIds = linkedFileIds;
      } else if (itemType === 'file') {
        let finalUrl: string = (itemUrl.trim() || itemFileData || (editingItem ? editingItem.url : '') || '') as string;
        if (finalUrl && finalUrl.startsWith('blob:')) {
          finalUrl = editingItem?.url || '';
        }
        if (finalUrl && finalUrl.startsWith('data:') && finalUrl.length > 750000) {
          finalUrl = editingItem?.url || '';
        }
        basePayload.url = finalUrl;
        const finalFileData = itemFileData || (editingItem ? (editingItem.fileData || '') : '');
        if (finalFileData && !finalFileData.startsWith('blob:') && finalFileData.length < 750000) {
          basePayload.fileData = finalFileData;
        }
        basePayload.fileName = itemFileName || (editingItem ? editingItem.fileName : '') || 'document.pdf';
        basePayload.fileSize = itemFileSize || (editingItem ? editingItem.fileSize : '') || '1.5 MB';
      } else if (itemType === 'exam') {
        basePayload.isExternal = Boolean(isExternalExam);
        if (isExternalExam) {
          basePayload.url = itemUrl.trim();
        } else {
          // Process ALL questions: ensure questions are preserved even if only image or choices were added
          const cleanQuestions: ExamQuestion[] = examQuestions.map((q, idx) => {
            const text = (q.questionText || '').trim();
            const image = (q.imageUrl || '').trim();
            const opts = (Array.isArray(q.options) && q.options.length > 0)
              ? q.options.map((opt, oIdx) => (opt || '').trim() || `الخيار ${['أ', 'ب', 'ج', 'د'][oIdx] || oIdx + 1}`)
              : ['الخيار أ', 'الخيار ب', 'الخيار ج', 'الخيار د'];

            return {
              id: String(q.id || `q_${idx + 1}`),
              questionText: String(text || (image ? `سؤال رقم ${idx + 1} (انظر الصورة المرفقة)` : `سؤال رقم ${idx + 1}`)),
              imageUrl: String(image || ''),
              options: opts.map((o) => String(o || '')),
              correctOptionIndex: typeof q.correctOptionIndex === 'number' ? q.correctOptionIndex : 0,
              explanation: String(q.explanation || ''),
            };
          });

          basePayload.questions = cleanQuestions.length > 0 ? cleanQuestions : [
            {
              id: 'q_1',
              questionText: 'سؤال رقم 1',
              imageUrl: '',
              options: ['الخيار أ', 'الخيار ب', 'الخيار ج', 'الخيار د'],
              correctOptionIndex: 0,
              explanation: '',
            }
          ];
          basePayload.durationMinutes = Number(examDurationMinutes) || 15;
          basePayload.targetPercentage = Number(examTargetPercentage) || 90;
        }
      }

      if (attachToVideoId && (itemType === 'exam' || itemType === 'file')) {
        const vid = items.find((i) => i.id === attachToVideoId);
        if (vid) {
          const currentExamIds = vid.linkedExamIds || [];
          const currentFileIds = vid.linkedFileIds || [];
          const newExamIds = itemType === 'exam' && !currentExamIds.includes(targetId)
            ? [...currentExamIds, targetId]
            : currentExamIds;
          const newFileIds = itemType === 'file' && !currentFileIds.includes(targetId)
            ? [...currentFileIds, targetId]
            : currentFileIds;

          await updateDoc(doc(db, 'content_items', attachToVideoId), {
            linkedExamIds: newExamIds,
            linkedFileIds: newFileIds,
            updatedAt: new Date().toISOString(),
          }).catch(() => {});
        }
      }

      // Sanitize all undefined fields so Firestore never rejects the write
      const sanitizedPayload: any = {};
      for (const [k, v] of Object.entries(basePayload)) {
        if (v !== undefined) {
          sanitizedPayload[k] = v;
        }
      }

      // 1. Immediately switch active selectedResourceId and section so user views the saved item right away
      setSelectedResourceId(targetResId);
      const parentRes = resources.find((r) => r.id === targetResId);
      if (parentRes?.sectionId) {
        setSelectedSectionId(parentRes.sectionId);
        const parentSec = sections.find((s) => s.id === parentRes.sectionId);
        if (parentSec?.courseId) {
          setSelectedCourseId(parentSec.courseId);
        }
      }

      // 2. Instant optimistic local state update for zero-delay UI feedback
      setItems((prev) => {
        const index = prev.findIndex((i) => i.id === targetId);
        let updatedList: ContentItem[];
        if (index >= 0) {
          const next = [...prev];
          next[index] = { ...prev[index], ...sanitizedPayload };
          updatedList = next;
        } else {
          updatedList = [sanitizedPayload, ...prev];
        }
        try {
          localStorage.setItem('raad_cached_content_items', JSON.stringify(updatedList));
        } catch (e) {}
        return updatedList;
      });

      // 3. Persist to Firestore with single merge write + notify student caches
      await setDoc(doc(db, 'content_items', targetId), sanitizedPayload, { merge: true });
      void bumpCatalogVersion();

      try {
        localStorage.removeItem('admin_draft_item_title');
        localStorage.removeItem('admin_draft_item_desc');
        sessionStorage.removeItem('admin_active_item_title');
      } catch (e) {}

      userClearedTitleRef.current = false;
      itemTitleRef.current = '';
      pinnedTitleRef.current = '';
      setIsConfirmSaveOpen(false);
      setIsAddingItem(false);
      setEditingItem(null);
      setItemTitle('');
      setItemDesc('');
      setItemUrl('');
      setItemBackupUrl('');
      setItemFileData('');
      setItemFileName('');
      setItemDurationMinutes(15);
      setShowAsEducationalVideo(false);
      setExamDurationMinutes(15);
      setExamTargetPercentage(90);
      setLinkedExamIds([]);
      setLinkedFileIds([]);
      setAttachToVideoId('');
      setExamQuestions([
        {
          id: 'q_1',
          questionText: '',
          imageUrl: '',
          options: ['', '', '', ''],
          correctOptionIndex: 0,
          explanation: '',
        },
      ]);
      const typeAr = itemType === 'video' ? 'الفيديو التعليمي' : itemType === 'exam' ? 'الاختبار التفاعلي' : 'الملف والمستند';
      notifySave(
        editingItem
          ? `تم تحديث وحفظ ${typeAr} "${resolvedTitle}" في قاعدة البيانات بنجاح ✓`
          : `تمت إضافة ورفع ${typeAr} "${resolvedTitle}" إلى قاعدة البيانات بنجاح ✓`,
        {
          subtitle: 'تم تثبيت العنصر في قاعدة البيانات (Firebase) وأصبح متاحاً للطلاب فوراً.',
          variant: 'success',
          durationMs: 6000,
        }
      );
    } catch (err) {
      console.error('Error saving to Firebase:', err);
      notifySave('حدث خطأ أثناء حفظ المحتوى في Firebase، يرجى المحاولة مرة أخرى');
    } finally {
      setIsSavingItem(false);
    }
  };

  // Quick Link handler functions
  const handleSelectQuickLinkVideo = (vidId: string) => {
    setQuickLinkVideoId(vidId);
    const vid = items.find((i) => i.id === vidId);
    if (vid) {
      setQuickLinkExamId(vid.linkedExamIds?.[0] || '');
      setQuickLinkFileId(vid.linkedFileIds?.[0] || '');
    } else {
      setQuickLinkExamId('');
      setQuickLinkFileId('');
    }
  };

  const handleSaveQuickLink = async () => {
    if (!quickLinkVideoId) {
      notifySave('يرجى اختيار اسم الفيديو أولاً');
      return;
    }
    setIsSavingQuickLink(true);
    try {
      const vid = items.find((i) => i.id === quickLinkVideoId);
      if (!vid) return;

      const updatedLinkedExams = quickLinkExamId ? [quickLinkExamId] : [];
      const updatedLinkedFiles = quickLinkFileId ? [quickLinkFileId] : [];

      await updateDoc(doc(db, 'content_items', quickLinkVideoId), {
        linkedExamIds: updatedLinkedExams,
        linkedFileIds: updatedLinkedFiles,
        updatedAt: new Date().toISOString(),
      });
      void bumpCatalogVersion();

      setItems((prev) =>
        prev.map((it) =>
          it.id === quickLinkVideoId
            ? { ...it, linkedExamIds: updatedLinkedExams, linkedFileIds: updatedLinkedFiles }
            : it
        )
      );

      notifySave(`تم ربط الاختبار والملف باسم الفيديو "${vid.title}" بنجاح! ⚡`);
      setIsQuickLinkModalOpen(false);
    } catch (err) {
      console.error('Error saving quick link:', err);
      notifySave('حدث خطأ أثناء حفظ الربط');
    } finally {
      setIsSavingQuickLink(false);
    }
  };

  const handleOpenAddItem = (type: 'video' | 'exam' | 'file', targetResId?: string) => {
    setEditingItem(null);
    setItemType(type);
    userClearedTitleRef.current = false;
    const chosenResId = targetResId || selectedResourceId || effectiveResourceId || '';
    setModalResourceId(chosenResId);
    const chosenRes = resources.find((r) => r.id === chosenResId);
    setModalSectionId(chosenRes?.sectionId || selectedSectionId || effectiveSectionId || '');
    const savedDraftTitle = (typeof window !== 'undefined' ? (localStorage.getItem('admin_draft_item_title') || sessionStorage.getItem('admin_active_item_title') || '') : '') || '';
    const savedDraftDesc = (typeof window !== 'undefined' ? localStorage.getItem('admin_draft_item_desc') : '') || '';
    if (savedDraftTitle) {
      itemTitleRef.current = savedDraftTitle;
      pinnedTitleRef.current = savedDraftTitle;
      setItemTitle(savedDraftTitle);
    } else {
      itemTitleRef.current = '';
      pinnedTitleRef.current = '';
      setItemTitle('');
    }
    if (savedDraftDesc) {
      setItemDesc(savedDraftDesc);
    } else {
      setItemDesc('');
    }
    setItemUrl('');
    setItemBackupUrl('');
    setItemFileData('');
    setItemFileName('');
    setItemFileSize('');
    setIsExternalExam(false);
    setItemDurationMinutes(15);
    setShowAsEducationalVideo(false);
    setExamDurationMinutes(15);
    setExamTargetPercentage(90);
    setLinkedExamIds([]);
    setLinkedFileIds([]);
    setAttachToVideoId('');
    setExamQuestions([
      {
        id: 'q_1',
        questionText: '',
        imageUrl: '',
        options: ['', '', '', ''],
        correctOptionIndex: 0,
        explanation: '',
      },
    ]);
    setIsConfirmSaveOpen(false);
    setIsAddingItem(true);
  };

  const handleOpenEditItem = (it: ContentItem) => {
    setEditingItem(it);
    userClearedTitleRef.current = false;
    itemTitleRef.current = it.title;
    pinnedTitleRef.current = it.title;
    setItemType(it.type);
    setModalResourceId(it.resourceId);
    const chosenRes = resources.find((r) => r.id === it.resourceId);
    setModalSectionId(chosenRes?.sectionId || selectedSectionId);
    setItemTitle(it.title);
    setItemDesc(it.description || '');
    setItemUrl(it.url || '');
    setItemBackupUrl(it.backupUrl || '');
    setItemFileData(it.fileData || '');
    setItemFileName(it.fileName || '');
    setItemFileSize(it.fileSize || '');
    setIsExternalExam(it.isExternal || false);
    setItemDurationMinutes(it.durationMinutes || 15);
    setShowAsEducationalVideo(Boolean(it.showAsEducationalVideo));
    setExamDurationMinutes(it.durationMinutes || 15);
    setExamTargetPercentage(it.targetPercentage || 90);
    setLinkedExamIds(it.linkedExamIds || []);
    setLinkedFileIds(it.linkedFileIds || []);
    if (it.type === 'exam') {
      const parentVid = items.find((v) => v.type === 'video' && v.linkedExamIds?.includes(it.id));
      setAttachToVideoId(parentVid?.id || '');
    } else if (it.type === 'file') {
      const parentVid = items.find((v) => v.type === 'video' && v.linkedFileIds?.includes(it.id));
      setAttachToVideoId(parentVid?.id || '');
    } else {
      setAttachToVideoId('');
    }
    if (it.questions && it.questions.length > 0) {
      setExamQuestions(it.questions);
    } else {
      setExamQuestions([
        {
          id: 'q_1',
          questionText: '',
          imageUrl: '',
          options: ['', '', '', ''],
          correctOptionIndex: 0,
          explanation: '',
        },
      ]);
    }
    setIsAddingItem(true);
  };

  const handleDeleteItem = (itemId: string, itemTitle?: string, type?: 'video' | 'exam' | 'file') => {
    const it = items.find((i) => i.id === itemId);
    const resolvedType = type || it?.type || 'exam';
    const typeLabel = resolvedType === 'video' ? 'فيديو' : resolvedType === 'exam' ? 'اختبار' : 'ملف';
    setDeleteTarget({
      type: 'item',
      id: itemId,
      title: itemTitle || it?.title || 'هذا العنصر',
      itemType: resolvedType,
      subtitle: `سيتم حذف هذا الـ (${typeLabel}) نهائياً من المنصة والطلاب.`,
    });
  };

  // Unified execution for Deleting Sections, Resources, or Content Items
  const executeDeleteTarget = async () => {
    if (!deleteTarget) return;
    setIsDeletingTarget(true);
    try {
      if (deleteTarget.type === 'section') {
        const secId = deleteTarget.id;
        // 1. Delete Section doc
        await deleteDoc(doc(db, 'sections', secId));
        // 2. Cascade delete child resources & items
        const resToDelete = resources.filter((r) => r.sectionId === secId);
        for (const r of resToDelete) {
          await deleteDoc(doc(db, 'resources', r.id)).catch(() => {});
        }
        const itemsToDelete = items.filter(
          (it) => resToDelete.some((r) => r.id === it.resourceId)
        );
        for (const it of itemsToDelete) {
          await deleteDoc(doc(db, 'content_items', it.id)).catch(() => {});
        }
        setSections((prev) => prev.filter((s) => s.id !== secId));
        setResources((prev) => prev.filter((r) => r.sectionId !== secId));
        setItems((prev) => prev.filter((it) => !resToDelete.some((r) => r.id === it.resourceId)));
        if (selectedSectionId === secId) {
          const remainingSec = sections.filter((s) => s.id !== secId);
          setSelectedSectionId(remainingSec.length > 0 ? remainingSec[0].id : '');
          setSelectedResourceId('');
        }
        notifySave(`تم حذف القسم "${deleteTarget.title}" وكافة محتوياته بنجاح 🗑️`);
      } else if (deleteTarget.type === 'resource') {
        const resId = deleteTarget.id;
        // 1. Delete Resource doc
        await deleteDoc(doc(db, 'resources', resId));
        // 2. Cascade delete child content items
        const itemsToDelete = items.filter((it) => it.resourceId === resId);
        for (const it of itemsToDelete) {
          await deleteDoc(doc(db, 'content_items', it.id)).catch(() => {});
        }
        setResources((prev) => prev.filter((r) => r.id !== resId));
        setItems((prev) => prev.filter((it) => it.resourceId !== resId));
        if (selectedResourceId === resId) {
          setSelectedResourceId('');
        }
        notifySave(`تم حذف المصدر "${deleteTarget.title}" وكافة عناصره بنجاح 🗑️`);
      } else if (deleteTarget.type === 'item') {
        const itemId = deleteTarget.id;
        await deleteDoc(doc(db, 'content_items', itemId));
        setItems((prev) => prev.filter((it) => it.id !== itemId));
        if (editingItem?.id === itemId) {
          setIsAddingItem(false);
          setEditingItem(null);
        }
        notifySave(`تم حذف "${deleteTarget.title}" بنجاح 🗑️`);
      }
      void bumpCatalogVersion();
      setDeleteTarget(null);
    } catch (err) {
      console.error('Error during deletion:', err);
      notifySave('حدث خطأ أثناء تنفيذ الحذف، يرجى المحاولة ثانية');
    } finally {
      setIsDeletingTarget(false);
    }
  };

  // Instantly apply theme when selected: "اجعل عندما اختار اللون من داخل قسم التحكم اللون ينطبق حتى الضغط على المصادر والفيديوهات"
  const handleSelectAndApplyTheme = async (theme: ThemeConfig) => {
    setSelectedThemeId(theme.id);
    try {
      await setDoc(
        doc(db, 'system_settings', 'global'),
        {
          activeTheme: theme,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      notifySave(`تم تطبيق وتفعيل تصميم "${theme.name}" على المنصة فورياً 🎨`);
    } catch (err) {
      console.error('Error applying theme:', err);
    }
  };

  const [isGlobalSaving, setIsGlobalSaving] = useState(false);

  // Save all global changes (settings, lock, theme, announcements, live stream) immediately to Firebase
  const handleSaveAllGlobalChanges = async () => {
    setIsGlobalSaving(true);
    try {
      const chosenTheme = THEME_PRESETS.find((t) => t.id === selectedThemeId) || systemSettings.activeTheme;

      await setDoc(doc(db, 'system_settings', 'global'), {
        isPlatformLocked: lockSettings.isPlatformLocked,
        lockReason: lockSettings.lockReason,
        lockMessage: lockSettings.lockMessage,
        maintenanceMessage: lockSettings.maintenanceMessage,
        subscriptionMessage: lockSettings.subscriptionMessage,
        whatsappNumber: lockSettings.whatsappNumber,
        telegramUsername: lockSettings.telegramUsername,
        announcement: {
          ...announcementState,
          updatedAt: new Date().toISOString(),
        },
        liveStream: {
          ...liveStreamState,
          updatedAt: new Date().toISOString(),
        },
        introLesson: {
          ...introLessonState,
          updatedAt: new Date().toISOString(),
        },
        features: {
          ...featuresState,
          updatedAt: new Date().toISOString(),
        },
        activeTheme: chosenTheme,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      notifySave('تم حفظ وتثبيت جميع التغييرات والإعدادات في السيرفر بنجاح الآن! ⚡');
    } catch (err) {
      console.error('Error saving global changes:', err);
      notifySave('حدث خطأ أثناء حفظ التغييرات');
    } finally {
      setIsGlobalSaving(false);
    }
  };

  // Dedicated save for Features tab per course
  const handleSaveFeatures = async () => {
    const targetCourse = courses.find((c) => c.id === selectedFeaturesCourseId) || courses[0];
    if (!targetCourse) {
      notifySave('يرجى اختيار الكورس أولاً');
      return;
    }

    setIsSavingFeatures(true);
    try {
      const cleanFeatures: FeaturesConfig = {
        telegramMainGroupUrl: featuresState.telegramMainGroupUrl?.trim() || '',
        telegramDiscussionGroupUrl: featuresState.telegramDiscussionGroupUrl?.trim() || '',
        telegramMainGroupTitle: featuresState.telegramMainGroupTitle?.trim() || 'جروب أقسام رعد الأساسي',
        telegramDiscussionGroupTitle: featuresState.telegramDiscussionGroupTitle?.trim() || 'جروب أقسام رعد المناقشة',
        isDiagnosticEnabled: featuresState.isDiagnosticEnabled !== false,
        isFriendsChallengeEnabled: featuresState.isFriendsChallengeEnabled !== false,
        updatedAt: new Date().toISOString(),
      };

      // 1. Save strictly to the chosen course doc in Firestore
      await setDoc(
        doc(db, 'courses', targetCourse.id),
        {
          features: cleanFeatures,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      // 2. Immediate local state update
      setCourses((prev) =>
        prev.map((c) => (c.id === targetCourse.id ? { ...c, features: cleanFeatures } : c))
      );

      // 3. Keep global fallback updated for primary course
      if (targetCourse.id === 'course_default_1') {
        await setDoc(
          doc(db, 'system_settings', 'global'),
          {
            features: cleanFeatures,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        ).catch(() => {});
      }

      void bumpCatalogVersion();
      notifySave(`تم حفظ روابط التليجرام والمميزات الخاصة بكورس "${targetCourse.title}" بنجاح ⚡`);
    } catch (err) {
      console.error('Error saving features in admin:', err);
      notifySave('حدث خطأ أثناء حفظ المميزات');
    } finally {
      setIsSavingFeatures(false);
    }
  };

  const currentCourse = courses.find((c) => c.id === selectedCourseId) || courses[0] || null;
  const filteredCourseSections = sections.filter((s) => {
    if (s.courseId) return s.courseId === selectedCourseId;
    const defaultId = courses[0]?.id || 'course_default_1';
    return selectedCourseId === 'course_default_1' || selectedCourseId === defaultId;
  });
  // If filtered is empty or user wants all, fall back to sections so no content is ever hidden!
  const courseSections = (filteredCourseSections.length > 0 ? filteredCourseSections : sections)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  // Active section strictly within current course or fallback to first section
  const effectiveSection = courseSections.find((s) => s.id === selectedSectionId) || courseSections[0] || sections[0] || null;
  const effectiveSectionId = effectiveSection ? effectiveSection.id : '';

  const filteredResources = effectiveSectionId
    ? resources.filter((r) => r.sectionId === effectiveSectionId)
    : [];
  const currentResources = (filteredResources.length > 0 ? filteredResources : resources)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const effectiveResource = currentResources.find((r) => r.id === selectedResourceId) || currentResources[0] || resources[0] || null;
  const effectiveResourceId = effectiveResource ? effectiveResource.id : '';

  // If showAllPlatformContent is enabled, show all items from all sections/resources!
  const filteredItems = effectiveResourceId
    ? items.filter((i) => i.resourceId === effectiveResourceId)
    : [];
  const currentItems = (showAllPlatformContent ? items : (filteredItems.length > 0 ? filteredItems : items))
    .sort((a, b) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (tA !== tB) return tA - tB;
      return (a.id || '').localeCompare(b.id || '');
    });

  const currentVideos = currentItems.filter((i) => i.type === 'video');
  const currentExams = currentItems.filter((i) => i.type === 'exam');
  const currentFiles = currentItems.filter((i) => i.type === 'file');

  const displayedAdminItems = adminContentSubTab === 'all'
    ? currentItems
    : adminContentSubTab === 'video'
    ? currentVideos
    : adminContentSubTab === 'exam'
    ? currentExams
    : currentFiles;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col text-right">
      {/* Top Admin Header */}
      <header className="p-4 md:px-8 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-40 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Settings className="w-6 h-6 animate-spin-slow" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-white flex items-center gap-2">
              <span>قسم التحكم الإداري الشامل</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                منصة أقسام رعد
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              إدارة المشتركين، أشرطة التقدم، الصيانة، البث المباشر، التعديل والحذف، وتصاميم المنصة
            </p>
          </div>
        </div>

        {/* Floating Top Toast Notification (always visible above modals & scroll) */}
        {saveStatus && (
          <div
            role="status"
            aria-live="polite"
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[120] w-[92%] max-w-lg pointer-events-auto animate-in fade-in slide-in-from-top-3 duration-200"
          >
            <div
              className={`rounded-2xl px-4 py-3.5 shadow-2xl backdrop-blur-xl border-2 flex items-start gap-3 ${
                saveToastDetails?.variant === 'error'
                  ? 'bg-rose-950/95 border-rose-500/70 text-rose-100 shadow-rose-900/40'
                  : 'bg-slate-900/95 border-emerald-500/80 text-white shadow-emerald-500/25'
              }`}
            >
              <div
                className={`p-2 rounded-xl shrink-0 ${
                  saveToastDetails?.variant === 'error'
                    ? 'bg-rose-500/20 text-rose-300'
                    : 'bg-emerald-500/20 text-emerald-400'
                }`}
              >
                {saveToastDetails?.variant === 'error' ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-0.5 text-right">
                <p className="text-xs md:text-sm font-black leading-snug">
                  {saveToastDetails?.title || saveStatus}
                </p>
                {saveToastDetails?.subtitle && (
                  <p className="text-[11px] font-bold text-emerald-300/90 leading-relaxed">
                    {saveToastDetails.subtitle}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (toastTimerRef.current) {
                    window.clearTimeout(toastTimerRef.current);
                    toastTimerRef.current = null;
                  }
                  setSaveStatus(null);
                  setSaveToastDetails(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition shrink-0 cursor-pointer"
                aria-label="إغلاق الإشعار"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          {/* Main Global Save Button ("وداخل قسم التحكم ضيف زر حفظ التغييرات الان لما اضغط عليه يحفظ كل شيء") */}
          <button
            onClick={handleSaveAllGlobalChanges}
            disabled={isGlobalSaving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs md:text-sm shadow-xl shadow-emerald-600/30 transition transform active:scale-95 hover:scale-105 cursor-pointer disabled:opacity-50"
            title="حفظ كافة الإعدادات والخيارات والتصاميم والتنبيهات فوراً في Firebase"
          >
            <Save className="w-4 h-4" />
            <span>{isGlobalSaving ? 'جاري حفظ كل شيء...' : 'حفظ التغييرات الآن'}</span>
          </button>

          <button
            onClick={onExit}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs md:text-sm font-bold border border-slate-700 transition"
          >
            <span>الخروج إلى واجهة الطلاب</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Admin Tabs */}
      <div className="bg-slate-900/60 border-b border-slate-800 px-4 md:px-8 py-2 overflow-x-auto">
        <div className="flex items-center gap-2 min-w-max">
          <button
            onClick={() => setActiveTab('courses')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold transition ${
              activeTab === 'courses'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'text-indigo-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>الكورسات ({courses.length}) 📚</span>
          </button>

          <button
            onClick={() => setActiveTab('students')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold transition ${
              activeTab === 'students'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>الطلاب المشتركين ({students.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('platform_lock')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold transition ${
              activeTab === 'platform_lock'
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>قفل المنصة والصيانة والواتساب</span>
          </button>

          <button
            onClick={() => setActiveTab('announcement')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold transition ${
              activeTab === 'announcement'
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>التنبيه العام</span>
          </button>

          <button
            onClick={() => setActiveTab('live_stream')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold transition ${
              activeTab === 'live_stream'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Tv className="w-4 h-4" />
            <span>البث المباشر</span>
          </button>

          <button
            onClick={() => setActiveTab('content')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold transition ${
              activeTab === 'content'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FolderTree className="w-4 h-4" />
            <span>إدارة المحتوى (تعديل وحذف وإضافة)</span>
          </button>

          <button
            onClick={() => setActiveTab('designs')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs md:text-sm font-black transition ${
              activeTab === 'designs'
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-lg shadow-amber-500/25'
                : 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
            }`}
          >
            <Palette className="w-4 h-4" />
            <span>تصاميمي 🎨</span>
          </button>

          <button
            onClick={() => setActiveTab('intro_lesson')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-black transition ${
              activeTab === 'intro_lesson'
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20'
                : 'text-amber-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Film className="w-4 h-4 text-amber-400" />
            <span>الحصة التعريفية 🎬</span>
          </button>

          <button
            onClick={() => setActiveTab('features')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-black transition ${
              activeTab === 'features'
                ? 'bg-amber-500 text-slate-950 font-black shadow-lg shadow-amber-500/20'
                : 'text-amber-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>المميزات ⭐</span>
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
        {/* ================= TAB 0: COURSES MANAGEMENT ================= */}
        {activeTab === 'courses' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl md:text-2xl font-black text-white flex items-center gap-2">
                  <BookOpen className="w-6 h-6 text-indigo-400" />
                  <span>إدارة الكورسات التعليمية ({courses.length})</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  إضافة وتعديل وحذف الكورسات، تغيير الغلاف والوصف، قفل الكورس وتحديد الأسعار، ورفع صورتين لرقم الحساب ورسالة التحويل.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleRestoreCourses}
                  disabled={isRestoringCourses}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs sm:text-sm font-black shadow-md transition cursor-pointer"
                  title="استرجاع كورس التسريبات VIP ومحتوياته بالكامل"
                >
                  <RefreshCw className={`w-4 h-4 ${isRestoringCourses ? 'animate-spin' : ''}`} />
                  <span>{isRestoringCourses ? 'جاري الاسترجاع...' : 'استرجاع الكورس المحذوف ومحتوياته ⚡'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenAddCourse}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs sm:text-sm font-black shadow-lg shadow-indigo-600/30 transition transform hover:scale-105 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة كورس جديد 📚</span>
                </button>
              </div>
            </div>

            {/* Courses Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {courses.map((course, idx) => {
                const courseSectionsCount = sections.filter(
                  (s) => s.courseId === course.id || (!s.courseId && course.id === 'course_default_1')
                ).length;

                return (
                  <div
                    key={course.id}
                    className="rounded-3xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl flex flex-col justify-between group hover:border-slate-700 transition"
                  >
                    <div>
                      {/* Course Cover Image */}
                      <div className="relative h-44 w-full bg-slate-800 overflow-hidden">
                        {course.imageUrl ? (
                          <img
                            src={course.imageUrl}
                            alt={course.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-500">
                            <BookOpen className="w-12 h-12" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />
                        
                        {/* Lock / Free badge */}
                        <div className="absolute top-3 right-3">
                          {course.isLocked ? (
                            <span className="px-3 py-1 rounded-full text-xs font-black bg-rose-600/90 text-white backdrop-blur-md shadow-md flex items-center gap-1">
                              <Lock className="w-3.5 h-3.5" />
                              <span>مقفول ({course.price || '199 ريال'})</span>
                            </span>
                          ) : (
                            <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-600/90 text-white backdrop-blur-md shadow-md flex items-center gap-1">
                              <Unlock className="w-3.5 h-3.5" />
                              <span>مفتوح مجاناً 🔓</span>
                            </span>
                          )}
                        </div>

                        {/* Order badge */}
                        <span className="absolute bottom-3 left-3 px-2 py-0.5 rounded-lg bg-black/70 text-[11px] font-bold text-amber-300">
                          ترتيب: #{course.order || idx + 1}
                        </span>
                      </div>

                      {/* Course Info */}
                      <div className="p-5 space-y-3">
                        <div>
                          <h3 className="text-base sm:text-lg font-black text-white">{course.title}</h3>
                          <p className="text-xs text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                            {course.description || 'لا يوجد وصف مضاف لهذا الكورس'}
                          </p>
                        </div>

                        {/* If locked: Preview of Bank Account Images and Message */}
                        {course.isLocked && (
                          <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                            <span className="text-[11px] font-black text-amber-400 block">
                              بيانات وصور التحويل لهذا الكورس:
                            </span>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-900 border border-slate-700 flex items-center justify-center">
                                {course.bankAccountImage1 ? (
                                  <img src={course.bankAccountImage1} alt="حساب 1" className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-[10px] text-slate-500">لا توجد صورة 1</span>
                                )}
                              </div>
                              <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-900 border border-slate-700 flex items-center justify-center">
                                {course.bankAccountImage2 ? (
                                  <img src={course.bankAccountImage2} alt="حساب 2" className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-[10px] text-slate-500">لا توجد صورة 2</span>
                                )}
                              </div>
                            </div>
                            {course.paymentMessage && (
                              <p className="text-[10px] text-slate-300 truncate">
                                💬 {course.paymentMessage}
                              </p>
                            )}
                          </div>
                        )}

                        <div className="text-xs font-bold text-indigo-400 flex items-center gap-1">
                          <FolderTree className="w-3.5 h-3.5" />
                          <span>{courseSectionsCount} أقسام مخصصة لهذا الكورس</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCourseId(course.id);
                          setActiveTab('content');
                        }}
                        className="px-3 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                        title="إدارة محتويات هذا الكورس وأقسامه ومصادره"
                      >
                        <FolderTree className="w-3.5 h-3.5" />
                        <span>إدارة المحتوى 📂</span>
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditCourse(course)}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                          title="تعديل بيانات الكورس"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingCourse(course)}
                          className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition cursor-pointer"
                          title="حذف هذا الكورس"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= TAB 1: STUDENTS ================= */}
        {activeTab === 'students' && (() => {
          const unspecifiedCount = students.filter((st) => isStudentUnspecified(st)).length;
          const vipCount = students.filter((st) => st.isVip).length;
          const pausedCount = students.filter((st) => st.isCounterPaused).length;
          const activeCount = students.filter((st) => !isStudentUnspecified(st) && !st.isCounterPaused && !st.isIndividuallyBlocked && !st.isVip).length;
          const blockedCount = students.filter((st) => st.isIndividuallyBlocked).length;

          const filteredStudents = students.filter((st) => {
            if (studentSearchQuery.trim()) {
              const q = studentSearchQuery.toLowerCase().trim();
              const matchName = st.name?.toLowerCase().includes(q);
              const matchEmail = st.email?.toLowerCase().includes(q);
              const matchId = st.id?.toLowerCase().includes(q);
              if (!matchName && !matchEmail && !matchId) return false;
            }
            if (studentFilter === 'unspecified') return isStudentUnspecified(st);
            if (studentFilter === 'active') return !isStudentUnspecified(st) && !st.isCounterPaused && !st.isIndividuallyBlocked && !st.isVip;
            if (studentFilter === 'vip') return st.isVip;
            if (studentFilter === 'paused') return st.isCounterPaused;
            if (studentFilter === 'blocked') return st.isIndividuallyBlocked;
            return true;
          });

          return (
            <div className="space-y-5">
              {/* Top Controls Header */}
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl">
                <div>
                  <h2 className="text-xl md:text-2xl font-black text-white flex items-center gap-2.5">
                    <Users className="w-6 h-6 text-indigo-400" />
                    <span>إدارة الطلاب والاشتراكات</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold">
                      {students.length} طالب
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    تعيين الأيام، تفعيل وضع VIP، قفل العداد واستئنافه، وحالة (غير محدد) للتحكم الدقيق في صلاحيات الطلاب.
                  </p>
                </div>

                {/* Instant Live Refresh Button */}
                <button
                  type="button"
                  onClick={handleManualRefreshAllData}
                  disabled={isRefreshingData}
                  className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-lg shadow-indigo-600/30 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  title="تحديث فوري لجميع بيانات الطلاب والمحتوى من الخادم مباشرة"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshingData ? 'animate-spin' : ''}`} />
                  <span>{isRefreshingData ? 'جارٍ التحديث الفوري...' : '🔄 تحديث فوري وسريع للطلاب'}</span>
                </button>
              </div>

              {/* Search Bar + Filter Tabs */}
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                {/* Search Input */}
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={studentSearchQuery}
                    onChange={(e) => setStudentSearchQuery(e.target.value)}
                    placeholder="ابحث باسم الطالب أو البريد الإلكتروني..."
                    className="w-full pl-4 pr-10 py-2.5 rounded-2xl bg-slate-900 border border-slate-800 text-white placeholder-slate-500 text-xs font-bold focus:outline-none focus:border-indigo-500 transition"
                  />
                  {studentSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setStudentSearchQuery('')}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Filter Tabs */}
                <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-900/90 border border-slate-800 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setStudentFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                      studentFilter === 'all'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    الكل ({students.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setStudentFilter('unspecified')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                      studentFilter === 'unspecified'
                        ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                        : 'text-amber-400/90 hover:text-amber-300'
                    }`}
                  >
                    <span>غير محدد</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-950/40 border border-amber-500/30">
                      {unspecifiedCount}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStudentFilter('active')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                      studentFilter === 'active'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'text-emerald-400 hover:text-emerald-300'
                    }`}
                  >
                    <span>نشط ومحدد</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-950/40 border border-emerald-500/30">
                      {activeCount}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStudentFilter('vip')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                      studentFilter === 'vip'
                        ? 'bg-yellow-500 text-slate-950 shadow-md font-black'
                        : 'text-yellow-400 hover:text-yellow-300'
                    }`}
                  >
                    <Crown className="w-3.5 h-3.5 fill-current" />
                    <span>VIP ({vipCount})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStudentFilter('paused')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                      studentFilter === 'paused'
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'text-purple-400 hover:text-purple-300'
                    }`}
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>العداد موقوف ({pausedCount})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStudentFilter('blocked')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                      studentFilter === 'blocked'
                        ? 'bg-rose-600 text-white shadow-md'
                        : 'text-rose-400 hover:text-rose-300'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>محظور ({blockedCount})</span>
                  </button>
                </div>
              </div>

              {/* Students Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs md:text-sm">
                    <thead className="bg-slate-800/80 text-slate-400 font-bold border-b border-slate-700/60">
                      <tr>
                        <th className="p-4">الطالب</th>
                        <th className="p-4">البريد الإلكتروني</th>
                        <th className="p-4">
                          <div className="flex items-center gap-1.5">
                            <span>كلمة المرور</span>
                            <button
                              type="button"
                              onClick={() => setShowAllPasswords(!showAllPasswords)}
                              className="text-[10px] px-2 py-0.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-amber-300 font-bold transition cursor-pointer"
                              title="إظهار / إخفاء كلمات المرور للجميع"
                            >
                              {showAllPasswords ? 'إخفاء الكل' : 'إظهار الكل'}
                            </button>
                          </div>
                        </th>
                        <th className="p-4">الكورسات المفعلة</th>
                        <th className="p-4 text-center">تفعيل كورس</th>
                        <th className="p-4">حالة الاشتراك والشريط</th>
                        <th className="p-4">التحكم بالاشتراك والعداد</th>
                        <th className="p-4">قفل المنصة على الطالب</th>
                        <th className="p-4 text-center">إجراءات الحساب</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {filteredStudents.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-slate-500 font-bold">
                            {students.length === 0
                              ? 'لا يوجد طلاب مسجلين حتى الآن.'
                              : 'لا يوجد طلاب يطابقون الفلتر أو البحث المحدد.'}
                          </td>
                        </tr>
                      ) : (
                        filteredStudents.map((st) => {
                          let daysLeft = 0;
                        let elapsedDays = 0;
                        if (st.subscriptionEndDate) {
                          const diffMs = new Date(st.subscriptionEndDate).getTime() - Date.now();
                          daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
                          elapsedDays = Math.max(0, (st.daysAllowed || 30) - daysLeft);
                        }

                        const isExpanded = expandedStudentId === st.id;
                        const studentWatchedIds = st.watchedVideoIds || [];
                        const studentAttempts = examAttempts.filter((a) => a.userId === st.id);
                        const currentRedInput =
                          studentRedMessageInput[st.id] !== undefined
                            ? studentRedMessageInput[st.id]
                            : st.customRedMessage || '';

                        return (
                          <React.Fragment key={st.id}>
                            <tr className={`hover:bg-slate-800/40 transition ${isExpanded ? 'bg-slate-800/60 border-l-4 border-amber-500' : ''}`}>
                              {/* Name & status badges with Expand Arrow ("سهم بجانب اسم كل طالب") */}
                              <td className="p-4">
                                <div className="font-bold text-white flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setExpandedStudentId(isExpanded ? null : st.id);
                                      if (studentRedMessageInput[st.id] === undefined && st.customRedMessage) {
                                        setStudentRedMessageInput((prev) => ({
                                          ...prev,
                                          [st.id]: st.customRedMessage || '',
                                        }));
                                      }
                                    }}
                                    className={`p-1.5 rounded-xl border transition cursor-pointer flex items-center justify-center shrink-0 ${
                                      isExpanded
                                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/30'
                                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-amber-400 hover:border-amber-500/50'
                                    }`}
                                    title={isExpanded ? 'إغلاق ملف الطالب' : 'فتح ملف إنجازات الطالب (الفيديوهات المشاهدة، الاختبارات والدرجات، التنبيه الأحمر، الشهادة)'}
                                  >
                                    {isExpanded ? (
                                      <ChevronUp className="w-4 h-4 stroke-[2.5]" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4 stroke-[2.5]" />
                                    )}
                                  </button>
                                  <span className="text-sm">{st.name}</span>
                                  {st.customRedMessage && (
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold flex items-center gap-1 ${
                                      st.isRedMessageActive !== false
                                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                        : 'bg-slate-800 text-slate-400 border-slate-700'
                                    }`}>
                                      <AlertTriangle className={`w-3 h-3 ${st.isRedMessageActive !== false ? 'text-rose-400' : 'text-slate-400'}`} />
                                      <span>{st.isRedMessageActive !== false ? 'تنبيه أحمر (شغال 🟢)' : 'تنبيه أحمر (موقوف ⏸️)'}</span>
                                    </span>
                                  )}
                                  {st.isVip && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 font-black flex items-center gap-1 shadow-sm shadow-yellow-500/20">
                                      <Crown className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                      VIP ماسي 👑
                                    </span>
                                  )}
                                  {st.isCounterPaused && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 font-black flex items-center gap-1">
                                      <Pause className="w-3 h-3 text-purple-400" />
                                      العداد موقوف ({st.pausedRemainingDays || 0} يوم)
                                    </span>
                                  )}
                                  {isStudentUnspecified(st) && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-black flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping shrink-0" />
                                      غير محدد ⏳
                                    </span>
                                  )}
                                  {st.certificateIssued && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold flex items-center gap-1">
                                      <Award className="w-3 h-3 text-amber-400" />
                                      شهادة صادرة
                                    </span>
                                  )}
                                  {st.isUnlimited && !st.isVip && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                                      <InfinityIcon className="w-3 h-3" />
                                      مفتوح دائم
                                    </span>
                                  )}
                                  {st.isIndividuallyWhitelisted && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                      مستثنى
                                    </span>
                                  )}
                                  {st.isIndividuallyBlocked && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                      محظور ({st.blockedReason === 'maintenance' ? 'صيانة' : st.blockedReason === 'subscription' ? 'اشتراك' : 'مشرف'})
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-slate-400 block mt-0.5 mr-7">
                                  انضم: {new Date(st.createdAt).toLocaleDateString('ar-SA')}
                                </span>
                              </td>

                              {/* Email */}
                              <td className="p-4 text-slate-300 font-mono text-xs">{st.email}</td>

                              {/* Password with View Toggle: "مشاهدة كلمة مرور حساب كل طالب" */}
                              <td className="p-4">
                                <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-amber-300 bg-slate-800/80 px-2.5 py-1 rounded-xl border border-slate-700/60 w-fit">
                                  <span>
                                    {visiblePasswords[st.id] || showAllPasswords
                                      ? st.password || 'لا توجد'
                                      : '••••••••'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setVisiblePasswords((prev) => ({
                                        ...prev,
                                        [st.id]: !prev[st.id],
                                      }))
                                    }
                                    className="p-1 hover:text-white text-slate-400 transition cursor-pointer"
                                    title="إظهار / إخفاء كلمة المرور"
                                  >
                                    {visiblePasswords[st.id] || showAllPasswords ? (
                                      <EyeOff className="w-3.5 h-3.5" />
                                    ) : (
                                      <Eye className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                              </td>

                              {/* Enrolled Courses Badges */}
                              <td className="p-4">
                                <div className="flex flex-wrap gap-1 max-w-[180px]">
                                  {st.enrolledCourseIds && st.enrolledCourseIds.length > 0 ? (
                                    st.enrolledCourseIds.map((cId) => {
                                      const cObj = courses.find((c) => c.id === cId);
                                      return (
                                        <span
                                          key={cId}
                                          className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
                                        >
                                          {cObj ? cObj.title : cId}
                                        </span>
                                      );
                                    })
                                  ) : (
                                    <span className="text-[11px] text-slate-500 font-bold">لا يوجد</span>
                                  )}
                                </div>
                              </td>

                              {/* Course Activation Button */}
                              <td className="p-4 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleOpenCourseActivationModal(st)}
                                  className="px-3.5 py-1.5 text-xs font-black rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-600/30 transition flex items-center justify-center gap-1.5 cursor-pointer transform hover:scale-105 mx-auto"
                                  title="تفعيل كورس لهذا الطالب وفتح المنصة له"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>تفعيل</span>
                                </button>
                              </td>

                              {/* Subscription Days Status */}
                              <td className="p-4">
                                {st.isVip ? (
                                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-yellow-500/15 border border-yellow-500/30 text-yellow-300 font-black text-xs w-fit">
                                    <Crown className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                                    <span>حساب VIP ماسي (وصول دائم)</span>
                                  </div>
                                ) : st.isCounterPaused ? (
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-300 font-bold text-xs w-fit">
                                      <Pause className="w-3.5 h-3.5" />
                                      <span>العداد موقوف مؤقتاً</span>
                                    </div>
                                    <span className="text-[11px] text-purple-200 block font-bold">
                                      الأيام المحفوظة: {st.pausedRemainingDays || 0} يوم
                                    </span>
                                  </div>
                                ) : isStudentUnspecified(st) ? (
                                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold text-xs w-fit">
                                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
                                    <span>غير محدد (بانتظار تحديد الأيام)</span>
                                  </div>
                                ) : st.isUnlimited ? (
                                  <span className="text-emerald-400 font-bold text-xs flex items-center gap-1">
                                    <Sparkles className="w-3.5 h-3.5" />
                                    المنصة مفتوحة بدون قيود (إلغاء اشتراك)
                                  </span>
                                ) : st.daysAllowed ? (
                                  <div className="space-y-1 max-w-xs">
                                    <div className="flex items-center justify-between text-[11px]">
                                      <span className="font-bold text-white">اليوم {elapsedDays} من {st.daysAllowed} يوم</span>
                                      <span className="text-slate-400">{daysLeft} يوم متبقي</span>
                                    </div>
                                    <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all ${
                                          elapsedDays / st.daysAllowed < 0.35
                                            ? 'bg-blue-500 shadow-sm shadow-blue-500/50'
                                            : elapsedDays / st.daysAllowed < 0.65
                                            ? 'bg-indigo-500'
                                            : elapsedDays / st.daysAllowed < 0.85
                                            ? 'bg-amber-500'
                                            : 'bg-rose-500 animate-pulse'
                                        }`}
                                        style={{ width: `${Math.min(100, Math.max(5, (elapsedDays / st.daysAllowed) * 100))}%` }}
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-amber-400/90 text-xs font-bold bg-amber-500/10 px-2 py-1 rounded-lg border border-amber-500/20">
                                    غير محدد ⏳
                                  </span>
                                )}
                              </td>

                              {/* Controls: Days picker, Pause counter, VIP toggle, Reset */}
                              <td className="p-4">
                                <div className="flex flex-col gap-1.5 min-w-[170px]">
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setStudentForDaysModal(st);
                                        setSelectedDaysAmount(st.daysAllowed || 30);
                                      }}
                                      className="px-2.5 py-1 text-xs font-bold rounded-xl bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 transition flex items-center gap-1 cursor-pointer"
                                      title="تحديد أيام الاشتراك (7، 15، شهر، شهرين، سنة، مخصص)"
                                    >
                                      <Calendar className="w-3.5 h-3.5" />
                                      <span>تحديد الأيام</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleTogglePauseCounter(st)}
                                      className={`px-2.5 py-1 text-xs font-bold rounded-xl border transition flex items-center gap-1 cursor-pointer ${
                                        st.isCounterPaused
                                          ? 'bg-purple-600 hover:bg-purple-500 text-white border-purple-400 shadow-sm shadow-purple-600/30'
                                          : 'bg-slate-800 hover:bg-purple-600/20 text-slate-300 hover:text-purple-300 border-slate-700'
                                      }`}
                                      title={st.isCounterPaused ? 'استئناف تشغيل العداد وإرجاعه' : 'قفل وتجميد العداد وحفظ الأيام المتبقية'}
                                    >
                                      {st.isCounterPaused ? (
                                        <>
                                          <Play className="w-3 h-3 fill-current" />
                                          <span>استئناف</span>
                                        </>
                                      ) : (
                                        <>
                                          <Pause className="w-3 h-3" />
                                          <span>قفل العداد</span>
                                        </>
                                      )}
                                    </button>
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleVip(st)}
                                      className={`px-2 py-0.5 text-[11px] font-black rounded-lg border transition flex items-center gap-1 cursor-pointer ${
                                        st.isVip
                                          ? 'bg-yellow-500 text-slate-950 border-yellow-400 shadow-xs'
                                          : 'bg-slate-800 hover:bg-yellow-500/20 text-yellow-400 border-slate-700'
                                      }`}
                                      title={st.isVip ? 'إلغاء وضع VIP' : 'ترقية سريعة لحساب VIP ماسي'}
                                    >
                                      <Crown className="w-3 h-3" />
                                      <span>{st.isVip ? 'إلغاء VIP' : 'ترقية VIP 👑'}</span>
                                    </button>

                                    {!isStudentUnspecified(st) && (
                                      <button
                                        type="button"
                                        onClick={() => handleResetToUnspecified(st.id, st.name)}
                                        className="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-700 transition cursor-pointer"
                                        title="إعادة الحساب لحالة غير محدد"
                                      >
                                        إعادة لغير محدد ⏳
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* Selective Individual Lock Button */}
                              <td className="p-4">
                                <div className="flex items-center gap-2">
                                  {st.isIndividuallyBlocked ? (
                                    <button
                                      onClick={() => handleUnblockStudent(st.id)}
                                      className="px-3 py-1 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-sm transition flex items-center gap-1"
                                    >
                                      <Unlock className="w-3 h-3" />
                                      <span>فك القفل</span>
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        setStudentForBlockModal(st);
                                        setBlockReasonType(st.blockedReason || 'supervisor');
                                        setBlockCustomMessage(st.blockedCustomMessage || '');
                                      }}
                                      className="px-3 py-1 text-xs font-bold rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 border border-slate-700 hover:border-rose-500/40 transition flex items-center gap-1"
                                    >
                                      <Lock className="w-3 h-3" />
                                      <span>قفل المنصة عليه</span>
                                    </button>
                                  )}

                                  <button
                                    onClick={() => handleToggleStudentWhitelist(st)}
                                    className={`px-2 py-1 text-[11px] font-bold rounded-lg border transition ${
                                      st.isIndividuallyWhitelisted
                                        ? 'bg-emerald-600 text-white border-emerald-500'
                                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-emerald-400'
                                    }`}
                                    title="فتح المنصة لهذا الطالب أثناء القفل العام"
                                  >
                                    استثناء
                                  </button>
                                </div>
                              </td>

                              {/* Deletion */}
                              <td className="p-4 text-center">
                                <button
                                  onClick={() => setDeletingStudent(st)}
                                  className="p-2 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition cursor-pointer"
                                  title="حذف حساب الطالب"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>

                            {/* ================= EXPANDED STUDENT DOSSIER ================= */}
                            {isExpanded && (
                              <tr className="bg-slate-950/90 border-b-2 border-amber-500/40 animate-in fade-in duration-150">
                                <td colSpan={9} className="p-4 sm:p-6 md:p-8">
                                  <div className="space-y-6">
                                    {/* Dossier Header */}
                                    <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900 border border-slate-800">
                                      <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-black text-xl">
                                          🎓
                                        </div>
                                        <div>
                                          <h4 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                                            <span>ملف إنجازات وتفاصيل الطالب:</span>
                                            <span className="text-amber-400">{st.name}</span>
                                          </h4>
                                          <p className="text-xs text-slate-400 mt-0.5">
                                            البريد: {st.email} | الفيديوهات المشاهدة: ({studentWatchedIds.length}) | الاختبارات المحلولة: ({studentAttempts.length})
                                          </p>
                                        </div>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => setExpandedStudentId(null)}
                                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition cursor-pointer"
                                      >
                                        <span>إغلاق الملف</span>
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>

                                    {/* 4 Cards Grid */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                      {/* Panel 1: Watched Videos */}
                                      <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-2 text-white font-black text-sm">
                                            <Video className="w-4 h-4 text-blue-400" />
                                            <span>الفيديوهات التي شاهدها الطالب</span>
                                          </div>
                                          <span className="text-xs font-black px-2.5 py-1 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                            {studentWatchedIds.length} فيديو مؤكد
                                          </span>
                                        </div>

                                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                          {studentWatchedIds.length === 0 ? (
                                            <div className="p-6 text-center text-xs text-slate-500 bg-slate-950/50 rounded-2xl border border-slate-800">
                                              لم يقم الطالب بتأكيد مشاهدة أي فيديو حتى الآن.
                                            </div>
                                          ) : (
                                            studentWatchedIds.map((vId, idx) => {
                                              const itemObj = items.find((i) => i.id === vId);
                                              const vidTitle = itemObj?.title || `فيديو تعليمي #${vId.slice(0, 8)}`;
                                              return (
                                                <div
                                                  key={`${vId}-${idx}`}
                                                  className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-3 text-xs"
                                                >
                                                  <div className="flex items-center gap-2.5 truncate">
                                                    <span className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-300 text-[11px] font-mono font-bold flex items-center justify-center shrink-0">
                                                      {idx + 1}
                                                    </span>
                                                    <span className="font-bold text-white truncate">{vidTitle}</span>
                                                  </div>
                                                  <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-black shrink-0 flex items-center gap-1">
                                                    <CheckCircle2 className="w-3 h-3" />
                                                    تمت المشاهدة
                                                  </span>
                                                </div>
                                              );
                                            })
                                          )}
                                        </div>
                                      </div>

                                      {/* Panel 2: Solved Exams & Scores & Correct/Wrong Counts */}
                                      <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-2 text-white font-black text-sm">
                                            <Award className="w-4 h-4 text-amber-400" />
                                            <span>الاختبارات التي حلها ودرجاته والأسئلة</span>
                                          </div>
                                          <span className="text-xs font-black px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                            {studentAttempts.length} اختبار محلول
                                          </span>
                                        </div>

                                        <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                                          {studentAttempts.length === 0 ? (
                                            <div className="p-6 text-center text-xs text-slate-500 bg-slate-950/50 rounded-2xl border border-slate-800">
                                              لم يقم هذا الطالب بحل أي اختبار حتى الآن.
                                            </div>
                                          ) : (
                                            studentAttempts.map((attempt, aIdx) => {
                                              const wrongCount = Math.max(0, attempt.totalQuestions - attempt.score);
                                              const isPass = attempt.percentage >= (attempt.targetPercentage || 80);

                                              return (
                                                <div
                                                  key={attempt.id || `att-${aIdx}`}
                                                  className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-2 text-xs"
                                                >
                                                  <div className="flex items-center justify-between gap-2">
                                                    <div className="font-bold text-white text-xs truncate">
                                                      {attempt.examTitle || 'اختبار تقييمي'}
                                                    </div>
                                                    <div
                                                      className={`px-2.5 py-0.5 rounded-lg font-black text-xs shrink-0 ${
                                                        isPass
                                                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                                      }`}
                                                    >
                                                      %{attempt.percentage}
                                                    </div>
                                                  </div>

                                                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] pt-1 border-t border-slate-800/60">
                                                    <div className="flex items-center gap-3">
                                                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                                                        <CheckCircle2 className="w-3 h-3" />
                                                        صح: {attempt.score}
                                                      </span>
                                                      <span className="text-rose-400 font-bold flex items-center gap-1">
                                                        <XCircle className="w-3 h-3" />
                                                        خطأ: {wrongCount}
                                                      </span>
                                                      <span className="text-slate-400">
                                                        الإجمالي: {attempt.totalQuestions}
                                                      </span>
                                                    </div>
                                                    <span className="text-slate-500 text-[10px]">
                                                      {attempt.createdAt ? new Date(attempt.createdAt).toLocaleDateString('ar-SA') : ''}
                                                    </span>
                                                  </div>
                                                </div>
                                              );
                                            })
                                          )}
                                        </div>
                                      </div>

                                      {/* Panel 3: Custom Red Message for this Student */}
                                      <div className="p-5 rounded-3xl bg-slate-900/90 border border-rose-500/30 space-y-4">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-2 text-rose-400 font-black text-sm">
                                            <AlertTriangle className="w-4 h-4" />
                                            <span>رسالة مخصصة تظهر للطالب باللون الأحمر 🚨</span>
                                          </div>
                                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold">
                                            تنبيه فردي للطالب
                                          </span>
                                        </div>

                                        <p className="text-xs text-slate-400 leading-relaxed">
                                          اكتب تنبيهاً مخصصاً لهذا الطالب وسيظهر له فورياً بشريط أحمر بارز وتحذيري أعلى منصته وبداية حسابه:
                                        </p>

                                        <textarea
                                          rows={3}
                                          value={currentRedInput}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setStudentRedMessageInput((prev) => ({
                                              ...prev,
                                              [st.id]: val,
                                            }));
                                          }}
                                          placeholder="مثال: عزيزي الطالب، يرجى استكمال حل اختبار قسم التناظر قبل نهاية الأسبوع للاستمرار بالدورة..."
                                          className="w-full p-3.5 rounded-2xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                                        />

                                        {/* Live Preview Box if message exists */}
                                        {currentRedInput.trim() && (
                                          <div className="p-3 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2.5">
                                            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                                            <div>
                                              <span className="font-black text-rose-300 block mb-0.5">معاينة الرسالة كما ستظهر للطالب باللون الأحمر:</span>
                                              <p className="text-rose-100 font-semibold">{currentRedInput}</p>
                                            </div>
                                          </div>
                                        )}

                                        {/* Status Badge & Indicator */}
                                        {st.customRedMessage && (
                                          <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                                            <span className="text-slate-400 font-bold">حالة التنبيه في حساب الطالب:</span>
                                            {st.isRedMessageActive !== false ? (
                                              <span className="px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                                <span>شغال ونشط حالياً في حسابه 🟢</span>
                                              </span>
                                            ) : (
                                              <span className="px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                                                <span>موقوف مؤقتاً ومخفي عن الطالب ⏸️</span>
                                              </span>
                                            )}
                                          </div>
                                        )}

                                        <div className="flex flex-wrap items-center gap-2 pt-1">
                                          <button
                                            type="button"
                                            disabled={isSavingRedMessage[st.id]}
                                            onClick={() => handleSaveCustomRedMessage(st.id, currentRedInput)}
                                            className="flex-1 min-w-[160px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-black text-xs shadow-lg shadow-rose-600/30 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                                          >
                                            {isSavingRedMessage[st.id] ? (
                                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                              <Send className="w-3.5 h-3.5" />
                                            )}
                                            <span>حفظ وتفعيل التنبيه الأحمر 🚨</span>
                                          </button>

                                          {st.customRedMessage && (
                                            <>
                                              {/* Pause or Resume Toggle */}
                                              <button
                                                type="button"
                                                disabled={isSavingRedMessage[st.id]}
                                                onClick={() => handleToggleRedMessageActive(st.id, st.isRedMessageActive !== false)}
                                                className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                                                  st.isRedMessageActive !== false
                                                    ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40'
                                                    : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40'
                                                }`}
                                                title={st.isRedMessageActive !== false ? 'إيقاف عرض التنبيه مؤقتاً عند الطالب' : 'إعادة تشغيل وعرض التنبيه عند الطالب'}
                                              >
                                                {st.isRedMessageActive !== false ? (
                                                  <>
                                                   <Pause className="w-3.5 h-3.5 text-amber-400" />
                                                   <span>إيقاف التنبيه ⏸️</span>
                                                  </>
                                                ) : (
                                                  <>
                                                   <Play className="w-3.5 h-3.5 text-emerald-400 fill-current" />
                                                   <span>تشغيل التنبيه 🟢</span>
                                                  </>
                                                )}
                                              </button>

                                              {/* Delete Red Message Permanently */}
                                              <button
                                                type="button"
                                                disabled={isSavingRedMessage[st.id]}
                                                onClick={() => {
                                                  if (window.confirm(`هل أنت متأكد من حذف التنبيه الأحمر نهائياً للطالب (${st.name})؟`)) {
                                                    handleDeleteCustomRedMessage(st.id);
                                                  }
                                                }}
                                                className="py-2.5 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
                                                title="حذف التنبيه نهائياً من حساب الطالب"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                                <span>حذف الرسالة 🗑️</span>
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      </div>

                                      {/* Panel 4: Certificate Issuance */}
                                      <div className="p-5 rounded-3xl bg-slate-900/90 border border-amber-500/30 space-y-4">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-2 text-amber-400 font-black text-sm">
                                            <Award className="w-4 h-4" />
                                            <span>إصدار شهادة إتمام وتفوق رسمية 📜</span>
                                          </div>
                                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                                            تصميم ملكي شيك
                                          </span>
                                        </div>

                                        <p className="text-xs text-slate-400 leading-relaxed">
                                          يمكنك إصدار شهادة شيك وموثقة للطالب باسمه المسجل في المنصة (<strong className="text-white">{st.name}</strong>) متضمنة شعار المنصة وتوقيع المشرف مع إمكانية الطباعة والحفظ PDF.
                                        </p>

                                        {st.certificateIssued ? (
                                          <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-950/40 to-slate-950 border border-amber-500/40 space-y-3">
                                            <div className="flex items-center justify-between">
                                              <span className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                                                <Award className="w-4 h-4 text-amber-400" />
                                                شهادة صادرة ومثبتة بحساب الطالب ✓
                                              </span>
                                              <span className="text-[10px] text-slate-400 font-mono">
                                                {st.certificateIssued.serialNumber}
                                              </span>
                                            </div>

                                            <div className="text-xs text-slate-300 space-y-1">
                                              <div>الكورس: <strong className="text-white">{st.certificateIssued.courseTitle}</strong></div>
                                              <div>التقدير: <span className="text-emerald-400 font-bold">{st.certificateIssued.gradeText}</span></div>
                                              <div>تاريخ الإصدار: {st.certificateIssued.issueDate}</div>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                              <button
                                                type="button"
                                                onClick={() => setPreviewCertModalData(st.certificateIssued || null)}
                                                className="flex-1 min-w-[150px] py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs shadow-md shadow-amber-500/20 transition flex items-center justify-center gap-1.5 cursor-pointer"
                                              >
                                                <Printer className="w-3.5 h-3.5" />
                                                <span>معاينة وطباعة الشهادة 📜</span>
                                              </button>

                                              <button
                                                type="button"
                                                onClick={() => handleOpenIssueCertModal(st)}
                                                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition cursor-pointer"
                                                title="تعديل بيانات الشهادة"
                                              >
                                                تعديل
                                              </button>

                                              <button
                                                type="button"
                                                onClick={() => {
                                                  if (window.confirm(`هل أنت متأكد من حذف وإلغاء شهادة الطالب (${st.name}) نهائياً؟ ستختفي الشهادة من حسابه فوراً.`)) {
                                                    handleDeleteStudentCertificate(st);
                                                  }
                                                }}
                                                className="py-2.5 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
                                                title="حذف وإلغاء الشهادة من عند الطالب"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                                <span>حذف الشهادة 🗑️</span>
                                              </button>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
                                            <p className="text-xs text-slate-400">
                                              لم يتم إصدار شهادة لهذا الطالب بعد. اضغط الزر أدناه لتعبئة وإصدار الشهادة فوراً:
                                            </p>
                                            <button
                                              type="button"
                                              onClick={() => handleOpenIssueCertModal(st)}
                                              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/25 transition flex items-center justify-center gap-2 cursor-pointer transform hover:scale-[1.02]"
                                            >
                                              <Award className="w-4 h-4" />
                                              <span>إصدار شهادة تفوق معتمدة للطالب ({st.name}) 🎓</span>
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              </div>
            </div>
          );
        })()}

        {/* ================= TAB 2: PLATFORM LOCK ================= */}
        {activeTab === 'platform_lock' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div>
              <h2 className="text-xl md:text-2xl font-black text-white">قفل المنصة العام والصيانة والتواصل</h2>
              <p className="text-xs text-slate-400 mt-1">
                عند قفل المنصة بداعي الصيانة تظهر صورة المفك 🛠️، وعند قفلها بداعي الاشتراك تظهر علامة الواتساب مع كتابة الرسائل المخصصة
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl">
              {/* Lock Toggle */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-800/60 border border-slate-700">
                <div className="flex items-center gap-3">
                  {lockSettings.isPlatformLocked ? (
                    <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400">
                      <Lock className="w-6 h-6" />
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400">
                      <Unlock className="w-6 h-6" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-base font-bold text-white">
                      حالة المنصة: {lockSettings.isPlatformLocked ? 'مقفلة حالياً' : 'مفتوحة للجميع'}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {lockSettings.isPlatformLocked
                        ? 'المنصة مغلقة أمام الطلاب (باستثناء الطلاب المحددين في الاستثناءات)'
                        : 'المنصة متاحة لجميع الطلاب المشتركين'}
                    </p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={lockSettings.isPlatformLocked}
                    onChange={(e) => setLockSettings({ ...lockSettings, isPlatformLocked: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-14 h-7 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-rose-600"></div>
                </label>
              </div>

              {/* Lock Reason Selection */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300">داعي قفل المنصة:</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setLockSettings({ ...lockSettings, lockReason: 'maintenance' })}
                    className={`p-4 rounded-2xl border text-xs md:text-sm font-bold text-center transition flex flex-col items-center gap-2 ${
                      lockSettings.lockReason === 'maintenance'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-md'
                        : 'bg-slate-800/40 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Wrench className="w-6 h-6 text-amber-400" />
                    <span>🛠️ بداعي الصيانة والتحديث (مع صورة المفك)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLockSettings({ ...lockSettings, lockReason: 'subscription' })}
                    className={`p-4 rounded-2xl border text-xs md:text-sm font-bold text-center transition flex flex-col items-center gap-2 ${
                      lockSettings.lockReason === 'subscription'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-md'
                        : 'bg-slate-800/40 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    <MessageCircle className="w-6 h-6 text-emerald-400" />
                    <span>💬 بداعي تفعيل وانتهاء الاشتراك (مع علامة واتساب)</span>
                  </button>
                </div>
              </div>

              {/* Conditional Content based on lock reason */}
              {lockSettings.lockReason === 'maintenance' ? (
                <div className="space-y-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                    <Wrench className="w-4 h-4" />
                    <span>رسالة الصيانة التي ستظهر للطالب مع صورة المفك والمعدات:</span>
                  </div>
                  <textarea
                    rows={3}
                    value={lockSettings.maintenanceMessage}
                    onChange={(e) => setLockSettings({ ...lockSettings, maintenanceMessage: e.target.value })}
                    className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs md:text-sm focus:outline-none focus:border-amber-500"
                    placeholder="اكتب رسالة الصيانة هنا..."
                  />
                </div>
              ) : (
                <div className="space-y-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                    <MessageCircle className="w-4 h-4" />
                    <span>رسالة تفعيل وانتهاء الاشتراك:</span>
                  </div>
                  <textarea
                    rows={3}
                    value={lockSettings.subscriptionMessage}
                    onChange={(e) => setLockSettings({ ...lockSettings, subscriptionMessage: e.target.value })}
                    className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs md:text-sm focus:outline-none focus:border-emerald-500"
                    placeholder="رسالة انتهاء وتفعيل الاشتراك..."
                  />
                </div>
              )}

              {/* Dedicated Card for WhatsApp & Telegram Supervisor Contacts (shows in ALL lock cases) */}
              <div className="space-y-4 p-5 rounded-2xl bg-slate-800/60 border border-slate-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-white font-bold text-xs md:text-sm">
                    <MessageCircle className="w-4 h-4 text-emerald-400" />
                    <span>بيانات التواصل مع المشرف (تظهر تلقائياً للطلاب في جميع حالات القفل والصيانة وانتهاء الاشتراك)</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                    واتساب + تليجرام ⚡
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-emerald-300 flex items-center gap-1.5">
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>رقم الواتساب للتواصل (مع الرمز الدولي مثل 966500000000 أو 2010...):</span>
                    </label>
                    <input
                      type="text"
                      value={lockSettings.whatsappNumber}
                      onChange={(e) => setLockSettings({ ...lockSettings, whatsappNumber: e.target.value })}
                      placeholder="966500000000"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-[10px] text-slate-400 block">
                      سيتم إنشاء رابط واتساب مباشر wa.me يتيح للطالب إرسال رسالة فورية للمشرف
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-sky-300 flex items-center gap-1.5">
                      <Send className="w-3.5 h-3.5" />
                      <span>يوزر التليجرام للتواصل (مثال: @raad_manager أو raad_manager):</span>
                    </label>
                    <input
                      type="text"
                      value={lockSettings.telegramUsername}
                      onChange={(e) => setLockSettings({ ...lockSettings, telegramUsername: e.target.value })}
                      placeholder="@raad_manager"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-sky-500"
                    />
                    <span className="text-[10px] text-slate-400 block">
                      سيتم إنشاء رابط تليجرام مباشر t.me يتيح للطالب فتح محادثة المشرف مباشرة
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleSaveLock}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs md:text-sm transition shadow-lg shadow-rose-600/25"
                >
                  <Save className="w-4 h-4" />
                  <span>حفظ إعدادات القفل</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 3: ANNOUNCEMENT ================= */}
        {activeTab === 'announcement' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div>
              <h2 className="text-xl md:text-2xl font-black text-white">التنبيه العام لكل الطلاب</h2>
              <p className="text-xs text-slate-400 mt-1">
                اكتب رسالة تنبيه تظهر فوراً لجميع الطلاب في الشريط العلوي للمنصة، ويمكنك قفلها في أي وقت
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-800/60 border border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
                    <Bell className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">تفعيل ظهور التنبيه للطلاب</h3>
                    <p className="text-xs text-slate-400">عند إلغاء التفعيل يختفي التنبيه فوراً من المنصة</p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={announcementState.isActive}
                    onChange={(e) => setAnnouncementState({ ...announcementState, isActive: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-14 h-7 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300">عنوان التنبيه:</label>
                <input
                  type="text"
                  value={announcementState.title}
                  onChange={(e) => setAnnouncementState({ ...announcementState, title: e.target.value })}
                  placeholder="مثال: تنبيه هام لجميع طلاب رعد ⚡"
                  className="w-full px-4 py-3 rounded-2xl bg-slate-800 border border-slate-700 text-white text-xs md:text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300">نص التنبيه:</label>
                <textarea
                  rows={3}
                  value={announcementState.message}
                  onChange={(e) => setAnnouncementState({ ...announcementState, message: e.target.value })}
                  placeholder="اكتب التنبيه هنا..."
                  className="w-full p-3 rounded-2xl bg-slate-800 border border-slate-700 text-white text-xs md:text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300">نوع التنبيه ولونه:</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['info', 'warning', 'urgent'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setAnnouncementState({ ...announcementState, type: t })}
                      className={`p-2.5 rounded-xl border text-xs font-bold transition ${
                        announcementState.type === t
                          ? t === 'info'
                            ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                            : t === 'warning'
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                            : 'bg-rose-500/20 border-rose-500 text-rose-300'
                          : 'bg-slate-800/40 border-slate-700 text-slate-400'
                      }`}
                    >
                      {t === 'info' ? 'معلومة عامة (أزرق)' : t === 'warning' ? 'تنبيه مهم (أصفر)' : 'عاجل جداً (أحمر)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    const cleared = {
                      isActive: false,
                      title: '',
                      message: '',
                      type: 'info' as const,
                      updatedAt: new Date().toISOString(),
                    };
                    setAnnouncementState(cleared);
                    await setDoc(doc(db, 'system_settings', 'global'), { announcement: cleared }, { merge: true });
                    notifySave('تم مسح وإلغاء التنبيه العام بنجاح 🗑️');
                  }}
                  className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 font-bold text-xs md:text-sm transition"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>حذف ومسح التنبيه</span>
                </button>

                <button
                  onClick={handleSaveAnnouncement}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-black text-xs md:text-sm transition shadow-lg shadow-amber-600/25"
                >
                  <Save className="w-4 h-4" />
                  <span>حفظ التنبيه ونشره للطلاب</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 4: LIVE STREAM ================= */}
        {activeTab === 'live_stream' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div>
              <h2 className="text-xl md:text-2xl font-black text-white">البث المباشر للطلاب</h2>
              <p className="text-xs text-slate-400 mt-1">
                عند تفعيل البث، يظهر مستطيل بارز وكبير لجميع الطلاب يحتوي على زر الانضمام المباشر
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-800/60 border border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400">
                    <Tv className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">تفعيل البث المباشر الآن</h3>
                    <p className="text-xs text-slate-400">يظهر مستطيل أحمر متوهج كبير لجميع الطلاب على الفور</p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={liveStreamState.isActive}
                    onChange={(e) => setLiveStreamState({ ...liveStreamState, isActive: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-14 h-7 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-rose-600"></div>
                </label>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300">عنوان البث المباشر:</label>
                <input
                  type="text"
                  value={liveStreamState.title}
                  onChange={(e) => setLiveStreamState({ ...liveStreamState, title: e.target.value })}
                  placeholder="مثال: مراجعة ليلة الامتحان الشاملة - بث مباشر للقدرات"
                  className="w-full px-4 py-3 rounded-2xl bg-slate-800 border border-slate-700 text-white text-xs md:text-sm focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300">رابط البث المباشر (YouTube / Zoom / Meet):</label>
                <input
                  type="url"
                  value={liveStreamState.streamUrl}
                  onChange={(e) => setLiveStreamState({ ...liveStreamState, streamUrl: e.target.value })}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full px-4 py-3 rounded-2xl bg-slate-800 border border-slate-700 text-white text-xs md:text-sm font-mono focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300">مقدم البث / المدرس:</label>
                <input
                  type="text"
                  value={liveStreamState.hostName}
                  onChange={(e) => setLiveStreamState({ ...liveStreamState, hostName: e.target.value })}
                  placeholder="مثال: أستاذ رعد & فريق منصة أقسام رعد"
                  className="w-full px-4 py-3 rounded-2xl bg-slate-800 border border-slate-700 text-white text-xs md:text-sm focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    const cleared = {
                      isActive: false,
                      title: '',
                      streamUrl: '',
                      hostName: '',
                      updatedAt: new Date().toISOString(),
                    };
                    setLiveStreamState(cleared);
                    await setDoc(doc(db, 'system_settings', 'global'), { liveStream: cleared }, { merge: true });
                    notifySave('تم إيقاف وحذف بيانات البث المباشر بنجاح 🗑️');
                  }}
                  className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 font-bold text-xs md:text-sm transition"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>إيقاف ومسح البث</span>
                </button>

                <button
                  onClick={handleSaveLiveStream}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs md:text-sm transition shadow-lg shadow-purple-600/25"
                >
                  <Save className="w-4 h-4" />
                  <span>حفظ وتفعيل البث المباشر</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 5: CONTENT MANAGEMENT (FULL CRUD) ================= */}
        {activeTab === 'content' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl md:text-2xl font-black text-white">إدارة المحتوى الكاملة (إضافة، تعديل، حذف)</h2>
                <p className="text-xs text-slate-400 mt-1">
                  يمكنك إضافة وتعديل وحذف أي قسم أو مصدر أو فيديو أو اختبار أو ملف بكل سهولة مع حفظ فوري في Firebase
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const firstVideo = items.find((i) => i.type === 'video');
                    if (firstVideo) {
                      handleSelectQuickLinkVideo(firstVideo.id);
                    }
                    setIsQuickLinkModalOpen(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 via-orange-600 to-amber-500 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-black transition shadow-lg shadow-amber-600/25 cursor-pointer"
                >
                  <LinkIcon className="w-4 h-4" />
                  <span>ربط اختبار أو ملف باسم الفيديو 🔗</span>
                </button>

                <button
                  onClick={() => {
                    setEditingSection(null);
                    setNewSectionTitle('');
                    setNewSectionDesc('');
                    setIsAddingSection(true);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-md"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة قسم جديد</span>
                </button>
              </div>
            </div>

            {/* Content Structure Navigator (Courses -> Sections -> Resources -> Items) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Courses Column (before الأقسام الرئيسية) */}
              <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs font-bold text-slate-400">
                  <span className="flex items-center gap-1.5 text-white font-black">
                    <BookOpen className="w-4 h-4 text-purple-400" />
                    <span>الكورسات ({courses.length})</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    {courses.length < 2 && (
                      <button
                        type="button"
                        onClick={handleRestoreCourses}
                        disabled={isRestoringCourses}
                        className="text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 text-[11px] cursor-pointer"
                        title="استرجاع كورس VIP المحذوف"
                      >
                        <RefreshCw className={`w-3 h-3 ${isRestoringCourses ? 'animate-spin' : ''}`} />
                        <span>استرجاع</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleOpenAddCourse}
                      className="text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1 text-xs cursor-pointer"
                      title="إضافة كورس جديد"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>كورس جديد</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {courses.map((crs) => {
                    const isSelected = selectedCourseId === crs.id;
                    const secCount = sections.filter((s) => {
                      if (s.courseId) return s.courseId === crs.id;
                      const defaultId = courses[0]?.id || 'course_default_1';
                      return crs.id === 'course_default_1' || crs.id === defaultId;
                    }).length;

                    return (
                      <div
                        key={crs.id}
                        onClick={() => {
                          setSelectedCourseId(crs.id);
                          const matchingSections = sections
                            .filter((s) => {
                              if (s.courseId) return s.courseId === crs.id;
                              const defaultId = courses[0]?.id || 'course_default_1';
                              return crs.id === 'course_default_1' || crs.id === defaultId;
                            })
                            .sort((a, b) => (a.order || 0) - (b.order || 0));
                          if (matchingSections.length > 0) {
                            setSelectedSectionId(matchingSections[0].id);
                            const firstRes = resources.filter((r) => r.sectionId === matchingSections[0].id);
                            if (firstRes.length > 0) setSelectedResourceId(firstRes[0].id);
                            else setSelectedResourceId('');
                          } else {
                            setSelectedSectionId('');
                            setSelectedResourceId('');
                          }
                        }}
                        className={`w-full p-2.5 rounded-2xl border text-xs font-bold transition flex items-center justify-between gap-2 cursor-pointer group ${
                          isSelected
                            ? 'bg-purple-600/20 border-purple-500 text-white shadow-lg shadow-purple-500/20'
                            : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                          {crs.imageUrl ? (
                            <img
                              src={crs.imageUrl}
                              alt={crs.title}
                              className="w-8 h-8 rounded-lg object-cover border border-slate-700 shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 text-slate-400">
                              <BookOpen className="w-4 h-4" />
                            </div>
                          )}
                          <div className="truncate text-right min-w-0 flex-1">
                            <div className="truncate flex items-center gap-1">
                              <span className="truncate">{crs.title}</span>
                              {crs.isLocked ? (
                                <span className="text-[9px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1 rounded shrink-0">مغلق</span>
                              ) : (
                                <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1 rounded shrink-0">مفتوح</span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 font-normal">
                              {secCount} أقسام
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditCourse(crs);
                            }}
                            className="p-1 text-slate-400 hover:text-purple-400 transition"
                            title="تعديل بيانات الكورس"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sections Column (الأقسام الرئيسية) */}
              <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs font-bold text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <span className="text-white font-bold">الأقسام الرئيسية</span>
                    <span className="text-slate-400 text-[11px]">({courseSections.length})</span>
                  </div>
                  {currentCourse && (
                    <span className="text-[10px] text-purple-300 font-normal truncate max-w-[100px]" title={currentCourse.title}>
                      {currentCourse.title}
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {courseSections.length === 0 ? (
                    <div className="py-10 px-4 rounded-2xl bg-purple-500/5 border border-dashed border-purple-500/30 text-center space-y-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 mx-auto flex items-center justify-center">
                        <BookOpen className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-black text-white">ابدأ بإضافة المحتوى المنفصل لهذا الكورس</p>
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                          محتويات هذا الكورس منفصلة ومستقلة، أضف قسماً لتبدأ برفع الفيديوهات والاختبارات والملفات.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSection(null);
                          setNewSectionTitle('');
                          setNewSectionDesc('');
                          setNewSectionOrder(1);
                          setIsAddingSection(true);
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 mx-auto shadow-md shadow-purple-600/30 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ إضافة أول قسم</span>
                      </button>
                    </div>
                  ) : (
                    courseSections.map((sec, sIdx) => {
                      const isSecSelected = effectiveSectionId === sec.id;
                      return (
                        <div
                          key={sec.id}
                          className={`w-full p-3 rounded-2xl border text-xs font-bold transition flex items-center justify-between gap-2 group ${
                            isSecSelected
                              ? 'text-white shadow-md'
                              : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                          }`}
                          style={
                            isSecSelected
                              ? {
                                  backgroundColor: `${systemSettings.activeTheme?.primary || '#2563eb'}25`,
                                  borderColor: systemSettings.activeTheme?.primary || '#2563eb',
                                  boxShadow: `0 4px 14px ${systemSettings.activeTheme?.primary || '#2563eb'}30`,
                                }
                              : {}
                          }
                        >
                          {/* Order select badge */}
                          <div className="shrink-0 flex items-center gap-1" title="ترتيب هذا القسم">
                            <span className="text-[10px] text-slate-500 font-normal">#</span>
                            <select
                              value={sec.order || sIdx + 1}
                              onChange={(e) => handleReorderSection(sec.id, Number(e.target.value))}
                              onClick={(e) => e.stopPropagation()}
                              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 font-mono font-black text-xs rounded-lg px-1.5 py-0.5 focus:outline-none focus:border-amber-400 cursor-pointer"
                            >
                              {courseSections.map((_, i) => (
                                <option key={i + 1} value={i + 1}>
                                  {i + 1}
                                </option>
                              ))}
                            </select>
                          </div>

                          <button
                            onClick={() => {
                              setSelectedSectionId(sec.id);
                              const firstRes = resources.filter((r) => r.sectionId === sec.id);
                              if (firstRes.length > 0) setSelectedResourceId(firstRes[0].id);
                              else setSelectedResourceId('');
                            }}
                            className="flex-1 text-right truncate"
                          >
                            <div className="truncate">{sec.title}</div>
                            <span className="text-[10px] text-slate-400 font-normal">
                              {resources.filter((r) => r.sectionId === sec.id).length} مصادر
                            </span>
                          </button>

                          {/* Edit & Delete Section Buttons */}
                          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 shrink-0">
                            <button
                              onClick={() => {
                                setEditingSection(sec);
                                setNewSectionTitle(sec.title);
                                setNewSectionDesc(sec.description || '');
                                setNewSectionOrder(sec.order || sIdx + 1);
                                setIsAddingSection(true);
                              }}
                              className="p-1 text-slate-400 hover:text-blue-400 transition"
                              title="تعديل القسم"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteSection(sec.id, sec.title);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                              title="حذف هذا القسم"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Resources Column */}
              <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs font-bold text-slate-400">
                  <span>المصادر</span>
                  {effectiveSectionId && (
                    <button
                      onClick={() => {
                        setEditingResource(null);
                        setNewResourceTitle('');
                        setNewResourceDesc('');
                        setNewResourceOrder(currentResources.length + 1);
                        setIsAddingResource(true);
                      }}
                      className="text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 text-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة مصدر</span>
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {courseSections.length === 0 ? (
                    <div className="py-8 px-2 text-center text-xs text-slate-500 font-bold">
                      ابدأ بإضافة المحتوى المنفصل لهذا الكورس
                    </div>
                  ) : currentResources.length === 0 ? (
                    <div className="py-8 px-2 text-center space-y-2">
                      <p className="text-xs text-slate-400 font-bold">لا توجد مصادر في هذا القسم بعد</p>
                      {effectiveSectionId && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingResource(null);
                            setNewResourceTitle('');
                            setNewResourceDesc('');
                            setNewResourceOrder(1);
                            setIsAddingResource(true);
                          }}
                          className="px-3 py-1 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>إضافة مصدر</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    currentResources.map((res, rIdx) => {
                      const isResSelected = effectiveResourceId === res.id;
                      return (
                        <div
                          key={res.id}
                          className={`w-full p-3 rounded-2xl border text-xs font-bold transition flex items-center justify-between gap-2 group ${
                            isResSelected
                              ? 'text-white shadow-md'
                              : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                          }`}
                          style={
                            isResSelected
                              ? {
                                  backgroundColor: `${systemSettings.activeTheme?.primary || '#059669'}25`,
                                  borderColor: systemSettings.activeTheme?.primary || '#059669',
                                  boxShadow: `0 4px 14px ${systemSettings.activeTheme?.primary || '#059669'}30`,
                                }
                              : {}
                          }
                        >
                          {/* Order select badge */}
                          <div className="shrink-0 flex items-center gap-1" title="ترتيب هذا المصدر">
                            <span className="text-[10px] text-slate-500 font-normal">#</span>
                            <select
                              value={res.order || rIdx + 1}
                              onChange={(e) => handleReorderResource(res.id, Number(e.target.value))}
                              onClick={(e) => e.stopPropagation()}
                              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-300 font-mono font-black text-xs rounded-lg px-1.5 py-0.5 focus:outline-none focus:border-emerald-400 cursor-pointer"
                            >
                              {currentResources.map((_, i) => (
                                <option key={i + 1} value={i + 1}>
                                  {i + 1}
                                </option>
                              ))}
                            </select>
                          </div>

                          <button
                            onClick={() => setSelectedResourceId(res.id)}
                            className="flex-1 text-right truncate"
                          >
                            <div className="truncate">{res.title}</div>
                            {res.description && (
                              <div className="text-[10px] text-slate-400 font-normal mt-0.5 truncate">{res.description}</div>
                            )}
                            <span className="text-[9px] text-slate-500 mt-1 block">
                              {items.filter((i) => i.resourceId === res.id).length} عناصر
                            </span>
                          </button>

                          {/* Edit & Delete Resource Buttons */}
                          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 shrink-0">
                            <button
                              onClick={() => {
                                setEditingResource(res);
                                setNewResourceTitle(res.title);
                                setNewResourceDesc(res.description || '');
                                setNewResourceOrder(res.order || rIdx + 1);
                                setIsAddingResource(true);
                              }}
                              className="p-1 text-slate-400 hover:text-emerald-400 transition"
                              title="تعديل المصدر"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteResource(res.id, res.title);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                              title="حذف هذا المصدر"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Items Column: Partitioned into Videos, Exams, and Files each part completely on its own */}
              <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-3xl p-4 md:p-5 space-y-4">
                {/* Column Top Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-white text-base">العناصر التعليمية</span>
                      <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
                        مرتبة من الأقدم للأحدث ⏳
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      كل جزء مقسم في قسم مخصص: فيديوهات 🎥 | اختبارات 📝 | ملفات ومستندات 📁
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {effectiveResourceId && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenAddItem('video', effectiveResourceId)}
                          className="px-2.5 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 text-[11px] font-black flex items-center gap-1 transition cursor-pointer"
                          title="رفع وإضافة فيديو تعليمي جديد لهذا المصدر"
                        >
                          <Video className="w-3.5 h-3.5" />
                          <span>+ فيديو</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenAddItem('exam', effectiveResourceId)}
                          className="px-2.5 py-1.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 text-[11px] font-black flex items-center gap-1 transition cursor-pointer"
                          title="إنشاء وإضافة اختبار تفاعلي جديد لهذا المصدر"
                        >
                          <Award className="w-3.5 h-3.5" />
                          <span>+ اختبار</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenAddItem('file', effectiveResourceId)}
                          className="px-2.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-black flex items-center gap-1 transition cursor-pointer"
                          title="رفع وإضافة ملف أو ملخص جديد لهذا المصدر"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>+ ملف</span>
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        const firstVid = currentItems.find((i) => i.type === 'video') || items.find((i) => i.type === 'video');
                        if (firstVid) {
                          handleSelectQuickLinkVideo(firstVid.id);
                        }
                        setIsQuickLinkModalOpen(true);
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-[11px] shadow-sm flex items-center gap-1 transition cursor-pointer"
                      title="ربط اختبار أو ملف باسم الفيديو ليظهر تحته للطلاب"
                    >
                      <LinkIcon className="w-3.5 h-3.5" />
                      <span>ربط 🔗</span>
                    </button>
                  </div>
                </div>

                {/* ================= CATEGORY SUB-TABS (فيديوهات، اختبارات، ملفات، أو الأجزاء الثلاثة معاً) ================= */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 rounded-2xl bg-slate-800/80 border border-slate-700/80 text-xs">
                  <button
                    type="button"
                    onClick={() => setAdminContentSubTab('all')}
                    className={`py-2 px-1.5 rounded-xl transition flex items-center justify-center gap-1 font-black text-[11px] ${
                      adminContentSubTab === 'all'
                        ? 'bg-slate-700 text-white shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>الأجزاء الثلاثة معاً ({currentItems.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAdminContentSubTab('video')}
                    className={`py-2 px-1.5 rounded-xl transition flex items-center justify-center gap-1 font-black text-[11px] ${
                      adminContentSubTab === 'video'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-blue-300 hover:bg-slate-800'
                    }`}
                  >
                    <Video className="w-3.5 h-3.5" />
                    <span>قسم الفيديوهات ({currentVideos.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAdminContentSubTab('exam')}
                    className={`py-2 px-1.5 rounded-xl transition flex items-center justify-center gap-1 font-black text-[11px] ${
                      adminContentSubTab === 'exam'
                        ? 'bg-amber-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-amber-300 hover:bg-slate-800'
                    }`}
                  >
                    <Award className="w-3.5 h-3.5" />
                    <span>قسم الاختبارات ({currentExams.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAdminContentSubTab('file')}
                    className={`py-2 px-1.5 rounded-xl transition flex items-center justify-center gap-1 font-black text-[11px] ${
                      adminContentSubTab === 'file'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-emerald-300 hover:bg-slate-800'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>قسم الملفات ({currentFiles.length})</span>
                  </button>
                </div>

                {/* Sub-tab Explanatory Banner */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-0.5">
                  <span className="font-bold text-slate-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>
                      {adminContentSubTab === 'all'
                        ? 'عرض الأقسام الثلاثة مقسمة كل جزء بمستطيله الخاص'
                        : adminContentSubTab === 'video'
                        ? `قسم الفيديوهات لوحده (${currentVideos.length} فيديو)`
                        : adminContentSubTab === 'exam'
                        ? `قسم الاختبارات لوحده (${currentExams.length} اختبار)`
                        : `قسم الملفات والمستندات لوحده (${currentFiles.length} ملف)`}
                    </span>
                  </span>
                  <span className="text-[10px] text-amber-400 font-mono">
                    ترتيب المحتوى: من الأقدم للأحدث ⏳
                  </span>
                </div>

                {/* ================= CONTENT SECTIONS RENDERER ================= */}
                <div className="space-y-4 max-h-[620px] overflow-y-auto pr-1">
                  {courseSections.length === 0 ? (
                    <div className="py-16 px-6 rounded-3xl bg-slate-900 border border-dashed border-purple-500/30 text-center space-y-4 my-auto">
                      <div className="w-16 h-16 rounded-3xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 mx-auto shadow-lg shadow-purple-500/10">
                        <BookOpen className="w-8 h-8" />
                      </div>
                      <div className="space-y-1.5 max-w-sm mx-auto">
                        <h3 className="text-base font-black text-white">ابدأ بإضافة المحتوى المنفصل لهذا الكورس</h3>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          محتويات هذا الكورس (فيديوهات، اختبارات، ملفات) ستكون مستقلة ومنفصلة تماماً عن محتوى باقي الكورسات. اضغط أدناه لإنشاء أول قسم والبدء برفع المحتوى.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSection(null);
                          setNewSectionTitle('');
                          setNewSectionDesc('');
                          setNewSectionOrder(1);
                          setIsAddingSection(true);
                        }}
                        className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs transition inline-flex items-center gap-2 shadow-lg shadow-purple-600/30 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>+ إضافة أول قسم لهذا الكورس الآن</span>
                      </button>
                    </div>
                  ) : currentResources.length === 0 ? (
                    <div className="py-14 px-6 rounded-2xl bg-slate-900 border border-dashed border-slate-700 text-center space-y-3 my-auto">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 mx-auto flex items-center justify-center">
                        <FolderTree className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-white">هذا القسم لا يحتوي على مصادر تعليمية بعد</p>
                        <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                          أضف مصدراً تعليمياً لتتمكن من رفع الفيديوهات والاختبارات والملفات المنفصلة التابعة له
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingResource(null);
                          setNewResourceTitle('');
                          setNewResourceDesc('');
                          setNewResourceOrder(1);
                          setIsAddingResource(true);
                        }}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>إضافة مصدر جديد لهذا القسم</span>
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* ================= 1. قسم الفيديوهات التعليمية (VIDEOS SECTION) ================= */}
                  {(adminContentSubTab === 'all' || adminContentSubTab === 'video') && (
                    <div className="rounded-2xl border-2 border-blue-500/30 bg-blue-950/20 p-4 space-y-3 shadow-lg shadow-blue-950/20">
                      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-blue-500/20">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-xl bg-blue-500/20 text-blue-400">
                            <Video className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                              <span>قسم الفيديوهات التعليمية</span>
                              <span className="text-[10px] px-2 py-0.2 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                {currentVideos.length} فيديو
                              </span>
                            </h4>
                            <span className="text-[10px] text-blue-300/70">
                              مرتبة من الأقدم للأحدث وفق تاريخ الإضافة
                            </span>
                          </div>
                        </div>

                        {selectedResourceId && (
                          <button
                            type="button"
                            onClick={() => handleOpenAddItem('video')}
                            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-[11px] flex items-center gap-1 shadow transition cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>رفع فيديو جديد</span>
                          </button>
                        )}
                      </div>

                      {currentVideos.length === 0 ? (
                        <div className="py-6 px-4 rounded-xl bg-slate-900/60 border border-dashed border-blue-500/30 text-center space-y-2">
                          <p className="text-xs text-slate-400 font-bold">لا توجد فيديوهات في هذا المصدر حتى الآن</p>
                          {selectedResourceId && (
                            <button
                              type="button"
                              onClick={() => handleOpenAddItem('video')}
                              className="px-3.5 py-1.5 rounded-xl bg-blue-600/30 hover:bg-blue-600/40 text-blue-300 border border-blue-500/40 text-[11px] font-black inline-flex items-center gap-1"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>إضافة أول فيديو لهذا المصدر</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {currentVideos.map((v, vIdx) => (
                            <div
                              key={v.id}
                              className="p-3 rounded-xl bg-slate-900/90 border border-blue-500/20 hover:border-blue-500/50 flex items-center justify-between gap-3 text-xs transition"
                            >
                              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                <span
                                  className="w-5 h-5 rounded-full text-[10px] font-black font-mono flex items-center justify-center shrink-0 bg-blue-500/20 text-blue-300 border border-blue-500/40"
                                  title={`الفيديو رقم ${vIdx + 1} وفق تاريخ الإضافة (من الأقدم للأحدث)`}
                                >
                                  {vIdx + 1}
                                </span>
                                <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 shrink-0">
                                  <Video className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-bold text-white truncate">{v.title}</div>
                                  <div className="text-[10px] text-slate-400 flex flex-wrap items-center gap-2 mt-0.5">
                                    <span className="font-bold text-blue-300">
                                      {v.showAsEducationalVideo ? '🎥 فيديو تعليمي' : `🎥 مدة الفيديو: ${v.durationMinutes || 15} دقيقة`}
                                    </span>
                                    {v.createdAt && (
                                      <span className="text-[9px] text-slate-500 font-mono">
                                        • أضيف: {new Date(v.createdAt).toLocaleDateString('ar-SA')}
                                      </span>
                                    )}
                                  </div>
                                  {((v.linkedExamIds?.length || 0) > 0 || (v.linkedFileIds?.length || 0) > 0) && (
                                    <div className="flex flex-wrap items-center gap-1 mt-1">
                                      {v.linkedExamIds && v.linkedExamIds.length > 0 && (
                                        <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded font-bold">
                                          📝 اختبار مربوط ({v.linkedExamIds.length})
                                        </span>
                                      )}
                                      {v.linkedFileIds && v.linkedFileIds.length > 0 && (
                                        <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded font-bold">
                                          📁 ملف مربوط ({v.linkedFileIds.length})
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleSelectQuickLinkVideo(v.id);
                                    setIsQuickLinkModalOpen(true);
                                  }}
                                  className="px-2 py-1 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 border border-amber-500/30 transition flex items-center gap-1 text-[10px] font-bold"
                                  title="ربط اختبار أو ملف بهذا الفيديو"
                                >
                                  <LinkIcon className="w-3 h-3" />
                                  <span>ربط</span>
                                </button>
                                <button
                                  onClick={() => handleOpenEditItem(v)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition"
                                  title="تعديل هذا الفيديو"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteItem(v.id, v.title, 'video');
                                  }}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                                  title="حذف هذا الفيديو"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ================= 2. قسم الاختبارات التفاعلية (EXAMS SECTION) ================= */}
                  {(adminContentSubTab === 'all' || adminContentSubTab === 'exam') && (
                    <div className="rounded-2xl border-2 border-amber-500/30 bg-amber-950/20 p-4 space-y-3 shadow-lg shadow-amber-950/20">
                      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-amber-500/20">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-xl bg-amber-500/20 text-amber-400">
                            <Award className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                              <span>قسم الاختبارات التفاعلية</span>
                              <span className="text-[10px] px-2 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                {currentExams.length} اختبار
                              </span>
                            </h4>
                            <span className="text-[10px] text-amber-300/70">
                              مرتبة من الأقدم للأحدث وفق تاريخ الإضافة
                            </span>
                          </div>
                        </div>

                        {selectedResourceId && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleOpenAddItem('exam')}
                              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-black text-[11px] flex items-center gap-1 shadow transition cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>إنشاء اختبار جديد</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                handleOpenAddItem('exam');
                                setTimeout(() => {
                                  const el = document.getElementById('exam-file-input');
                                  if (el) el.click();
                                }, 200);
                              }}
                              className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 font-black text-[11px] flex items-center gap-1 shadow transition cursor-pointer"
                              title="رفع واستيراد ملف أسئلة اختبار جاهز (JSON / CSV / Excel / TXT)"
                            >
                              <Upload className="w-3.5 h-3.5 text-amber-400" />
                              <span>رفع ملف اختبار 📁</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {currentExams.length === 0 ? (
                        <div className="py-6 px-4 rounded-xl bg-slate-900/60 border border-dashed border-amber-500/30 text-center space-y-2">
                          <p className="text-xs text-slate-400 font-bold">لا توجد اختبارات في هذا المصدر حتى الآن</p>
                          {selectedResourceId && (
                            <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
                              <button
                                type="button"
                                onClick={() => handleOpenAddItem('exam')}
                                className="px-3.5 py-1.5 rounded-xl bg-amber-600/30 hover:bg-amber-600/40 text-amber-300 border border-amber-500/40 text-[11px] font-black inline-flex items-center gap-1"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>إضافة أول اختبار لهذا المصدر</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleOpenAddItem('exam');
                                  setTimeout(() => {
                                    const el = document.getElementById('exam-file-input');
                                    if (el) el.click();
                                  }, 200);
                                }}
                                className="px-3.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-black inline-flex items-center gap-1"
                              >
                                <Upload className="w-3.5 h-3.5 text-amber-400" />
                                <span>رفع ملف اختبار لهذا المصدر 📁</span>
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {currentExams.map((ex, exIdx) => (
                            <div
                              key={ex.id}
                              className="p-3 rounded-xl bg-slate-900/90 border border-amber-500/20 hover:border-amber-500/50 flex items-center justify-between gap-3 text-xs transition"
                            >
                              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                <span
                                  className="w-5 h-5 rounded-full text-[10px] font-black font-mono flex items-center justify-center shrink-0 bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                  title={`الاختبار رقم ${exIdx + 1} وفق تاريخ الإضافة (من الأقدم للأحدث)`}
                                >
                                  {exIdx + 1}
                                </span>
                                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
                                  <Award className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-bold text-white truncate">{ex.title}</div>
                                  <div className="text-[10px] text-slate-400 flex flex-wrap items-center gap-2 mt-0.5">
                                    <span className="font-bold text-amber-300">
                                      📝 {ex.questions?.length || 0} أسئلة
                                    </span>
                                    <span className="text-[9px] text-amber-400/90 font-mono bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                                      الهدف: %{ex.targetPercentage || 90}
                                    </span>
                                    <span className="text-[9px] text-slate-400 font-mono">
                                      ⏱️ {ex.durationMinutes || 15} دقيقة
                                    </span>
                                    {ex.createdAt && (
                                      <span className="text-[9px] text-slate-500 font-mono">
                                        • أضيف: {new Date(ex.createdAt).toLocaleDateString('ar-SA')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  onClick={() => handleOpenEditItem(ex)}
                                  className="px-2.5 py-1 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 border border-amber-500/30 transition text-[10px] font-bold flex items-center gap-1"
                                  title="تعديل الاختبار والأسئلة"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                  <span>تعديل الأسئلة</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteItem(ex.id, ex.title, 'exam');
                                  }}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                                  title="حذف هذا الاختبار"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ================= 3. قسم الملفات والمستندات (FILES SECTION) ================= */}
                  {(adminContentSubTab === 'all' || adminContentSubTab === 'file') && (
                    <div className="rounded-2xl border-2 border-emerald-500/30 bg-emerald-950/20 p-4 space-y-3 shadow-lg shadow-emerald-950/20">
                      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-emerald-500/20">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-xl bg-emerald-500/20 text-emerald-400">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                              <span>قسم الملفات والمستندات</span>
                              <span className="text-[10px] px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                {currentFiles.length} ملف
                              </span>
                            </h4>
                            <span className="text-[10px] text-emerald-300/70">
                              مرتبة من الأقدم للأحدث مع الحفاظ التام على الملفات
                            </span>
                          </div>
                        </div>

                        {selectedResourceId && (
                          <button
                            type="button"
                            onClick={() => handleOpenAddItem('file')}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] flex items-center gap-1 shadow transition cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>رفع ملف جديد</span>
                          </button>
                        )}
                      </div>

                      {currentFiles.length === 0 ? (
                        <div className="py-6 px-4 rounded-xl bg-slate-900/60 border border-dashed border-emerald-500/30 text-center space-y-2">
                          <p className="text-xs text-slate-400 font-bold">لا توجد ملفات في هذا المصدر حتى الآن</p>
                          {selectedResourceId && (
                            <button
                              type="button"
                              onClick={() => handleOpenAddItem('file')}
                              className="px-3.5 py-1.5 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/40 text-[11px] font-black inline-flex items-center gap-1"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>رفع أول ملف لهذا المصدر</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {currentFiles.map((fl, fIdx) => {
                            const fileLink = fl.url || fl.fileData;
                            return (
                              <div
                                key={fl.id}
                                className="p-3 rounded-xl bg-slate-900/90 border border-emerald-500/20 hover:border-emerald-500/50 flex items-center justify-between gap-3 text-xs transition"
                              >
                                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                  <span
                                    className="w-5 h-5 rounded-full text-[10px] font-black font-mono flex items-center justify-center shrink-0 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                    title={`الملف رقم ${fIdx + 1} وفق تاريخ الإضافة (من الأقدم للأحدث)`}
                                  >
                                    {fIdx + 1}
                                  </span>
                                  <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0">
                                    <FileText className="w-4 h-4" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-bold text-white truncate">{fl.title}</div>
                                    <div className="text-[10px] text-slate-400 flex flex-wrap items-center gap-2 mt-0.5">
                                      <span className="font-bold text-emerald-300">
                                        📁 {fl.fileSize || 'PDF'}
                                      </span>
                                      {fl.fileName && (
                                        <span className="text-[9px] text-slate-400 truncate max-w-[150px]">
                                          ({fl.fileName})
                                        </span>
                                      )}
                                      <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded font-bold border border-emerald-500/20">
                                        محفوظ عالمنصة ✓
                                      </span>
                                      {fl.createdAt && (
                                        <span className="text-[9px] text-slate-500 font-mono">
                                          • أضيف: {new Date(fl.createdAt).toLocaleDateString('ar-SA')}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  {fileLink && (
                                    <a
                                      href={fileLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      download={fl.fileName || 'file'}
                                      className="px-2.5 py-1 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border border-emerald-500/30 transition flex items-center gap-1 text-[10px] font-bold"
                                      title="معاينة وتحميل الملف للتأكد من رفعه بنجاح"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                      <span>معاينة / تحميل</span>
                                    </a>
                                  )}
                                  <button
                                    onClick={() => handleOpenEditItem(fl)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition"
                                    title="تعديل هذا الملف مع الحفاظ التام على الملف الأصلي"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteItem(fl.id, fl.title, 'file');
                                    }}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                                    title="حذف هذا الملف"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 6: "تصاميمي" (MY DESIGNS) ================= */}
        {activeTab === 'designs' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white flex items-center gap-2">
                  <span>تصاميمي 🎨</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    أشكال وألوان المنصة
                  </span>
                </h2>
                <p className="text-xs md:text-sm text-slate-400 mt-1">
                  اختر الشكل واللون المطلوب، وبمجرد الضغط على حفظ يتم حفظ التصميم في Firebase ويتغير فورياً عند جميع طلاب المنصة!
                </p>
              </div>

              <button
                onClick={handleSaveTheme}
                className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/25 transition transform hover:scale-105"
              >
                <Save className="w-5 h-5" />
                <span>حفظ وتطبيق التصميم للجميع</span>
              </button>
            </div>

            {/* ================= PLATFORM LOGO & FAVICON MANAGER ================= */}
            <div className="p-5 md:p-6 rounded-3xl bg-slate-900/90 border-2 border-emerald-500/40 shadow-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-emerald-500/20">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400">
                    <Zap className="w-5 h-5 fill-current" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                      <span>شعار وهوية المنصة (اللوجو والأيقونة لجميع المتصفحات) ⚡</span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      يظهر هذا الشعار لجميع الطلاب عند فتح المنصة من أي متصفح وفي علامة التبويب وعند تشغيل الفيديو كصورة مصغرة
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSaveLogo}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm shadow-lg shadow-emerald-600/30 transition cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>حفظ الشعار وتطبيقه للجميع</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                {/* Logo Live Preview */}
                <div className="md:col-span-4 flex flex-col items-center justify-center p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-center space-y-2">
                  <span className="text-[11px] font-bold text-slate-400">معاينة الشعار الحالية:</span>
                  <div className="p-3 rounded-2xl bg-slate-900 border border-emerald-500/30 flex items-center justify-center shadow-lg">
                    <BrandLogo customLogoUrl={platformLogoUrl || systemSettings.logoUrl} size="xl" primaryColor="#059669" />
                  </div>
                  <span className="text-[10px] text-emerald-400 font-bold">
                    {platformLogoUrl ? 'شعار مخصص مفعل ✓' : 'الشعار الافتراضي لمنصة رعد'}
                  </span>
                </div>

                {/* Upload or URL input */}
                <div className="md:col-span-8 space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1.5">
                      رابط صورة الشعار (URL) أو تحميل من جهازك:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={platformLogoUrl}
                        onChange={(e) => setPlatformLogoUrl(e.target.value)}
                        placeholder="https://example.com/logo.png أو اختر ملف أدناه"
                        className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-emerald-400"
                        dir="ltr"
                      />
                      {platformLogoUrl && (
                        <button
                          type="button"
                          onClick={() => setPlatformLogoUrl('')}
                          className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 border border-slate-700 text-xs font-bold"
                          title="استعادة الشعار الافتراضي"
                        >
                          استعادة الافتراضي
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <label className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition cursor-pointer shadow-sm">
                      <Upload className="w-4 h-4 text-emerald-400" />
                      <span>{isUploadingLogo ? 'جاري قراءة الصورة...' : 'رفع صورة شعار من الجهاز (PNG / SVG / JPG)'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoFileUpload}
                        className="hidden"
                      />
                    </label>
                    <span className="text-[11px] text-slate-500 font-medium">
                      ملاحظة: يدعم جميع المقاسات ويفضل صورة مربعة أو شفافة
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Mini preview cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
              {THEME_PRESETS.map((theme) => {
                const isSelected = selectedThemeId === theme.id;

                return (
                  <div
                    key={theme.id}
                    onClick={() => handleSelectAndApplyTheme(theme)}
                    className={`relative rounded-3xl border-2 p-5 cursor-pointer transition-all flex flex-col justify-between overflow-hidden group ${
                      isSelected
                        ? 'border-amber-400 bg-slate-900 shadow-2xl ring-4 ring-amber-400/20 scale-[1.02]'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-4 left-4 z-10 px-3 py-1 rounded-full bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1 shadow-md">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>التصميم المختار</span>
                      </div>
                    )}

                    <div className="w-full h-44 rounded-2xl bg-slate-950 border border-slate-800/80 p-3 flex flex-col justify-between overflow-hidden shadow-inner relative mb-4">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: theme.primary }}
                          />
                          <span className="text-[10px] font-bold text-white">منصة أقسام رعد</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div
                            className="w-10 h-1.5 rounded-full"
                            style={{ backgroundColor: theme.accent }}
                          />
                          <div className="w-3 h-3 rounded bg-slate-800" />
                        </div>
                      </div>

                      <div className="grid grid-cols-12 gap-1.5 my-2 flex-1 items-center">
                        <div
                          className="col-span-7 h-20 rounded-xl border flex items-center justify-center relative overflow-hidden"
                          style={{
                            borderColor: `${theme.primary}60`,
                            backgroundColor: `${theme.primary}15`,
                          }}
                        >
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-white"
                            style={{ backgroundColor: theme.primary }}
                          >
                            <div className="w-0 h-0 border-t-4 border-b-4 border-l-6 border-transparent border-l-white ml-0.5" />
                          </div>
                          <div
                            className="absolute bottom-1 right-2 text-[8px] font-bold"
                            style={{ color: theme.accent }}
                          >
                            الفيديو عاليسار
                          </div>
                        </div>

                        <div className="col-span-5 flex flex-col gap-1 justify-center">
                          <div
                            className="h-4 rounded-md flex items-center px-1.5 text-[8px] font-bold text-white"
                            style={{ backgroundColor: `${theme.secondary}40` }}
                          >
                            الأقسام عاليمين
                          </div>
                          <div
                            className="h-4 rounded-md flex items-center px-1.5 text-[8px] font-bold text-white"
                            style={{ backgroundColor: `${theme.primary}40` }}
                          >
                            المصادر
                          </div>
                          <div
                            className="h-4 rounded-md flex items-center px-1.5 text-[8px] font-bold text-white"
                            style={{ backgroundColor: `${theme.accent}30` }}
                          >
                            الاختبارات
                          </div>
                        </div>
                      </div>

                      <div className="pt-1 border-t border-slate-800/60 flex items-center justify-between text-[7px] text-slate-400">
                        <span>المصمم مازن محروس</span>
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: theme.accent }}
                        />
                      </div>
                    </div>

                    <div>
                      <h3 className="text-base font-black text-white flex items-center justify-between">
                        <span>{theme.name}</span>
                      </h3>

                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-800">
                        <span className="text-[11px] text-slate-400">التدرج اللوني:</span>
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-6 h-6 rounded-lg border border-white/20 shadow-sm"
                            style={{ backgroundColor: theme.primary }}
                            title="اللون الأساسي"
                          />
                          <div
                            className="w-6 h-6 rounded-lg border border-white/20 shadow-sm"
                            style={{ backgroundColor: theme.secondary }}
                            title="اللون الثانوي"
                          />
                          <div
                            className="w-6 h-6 rounded-lg border border-white/20 shadow-sm"
                            style={{ backgroundColor: theme.accent }}
                            title="لون التمييز والتوهج"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= TAB 7: INTRO LESSON (الحصة التعريفية) ================= */}
        {activeTab === 'intro_lesson' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold">
                  الحصة التعريفية 🎬
                </span>
                <span className="text-xs text-slate-400">تظهر للطلاب في منتصف المصادر والأقسام</span>
              </div>
              <h2 className="text-xl md:text-2xl font-black text-white mt-1">
                إدارة ورفع فيديو الحصة التعريفية لكل كورس
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                اختر الكورس أولاً، ثم ارفع فيديو الحصة التعريفية الخاص به مباشرة أو ضع رابط فيديو مباشر
              </p>
            </div>

            {/* ================= اختيار الكورس للحصة التعريفية ================= */}
            <div className="bg-slate-900 border-2 border-amber-500/40 rounded-3xl p-5 md:p-6 shadow-2xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base md:text-lg font-black text-white">
                      اختر الكورس لتعديل الحصة التعريفية الخاصة به:
                    </h3>
                    <p className="text-xs text-slate-400">
                      كل كورس يمتلك حصة تعريفية وفيديو توضيحي منفصل تماماً خاص به
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">الكورس المحدد للتعديل:</span>
                  <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-black">
                    {courses.find((c) => c.id === selectedIntroCourseId)?.title || courses[0]?.title}
                  </span>
                </div>
              </div>

              {/* Horizontal Course Selector Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                {courses.map((course, cIdx) => {
                  const isSelected = (selectedIntroCourseId || courses[0]?.id) === course.id;
                  const hasVideo = Boolean(course.introLesson?.videoUrl);

                  return (
                    <button
                      key={course.id}
                      type="button"
                      onClick={() => handleSelectIntroCourse(course.id)}
                      className={`p-4 rounded-2xl border-2 text-right transition-all flex flex-col justify-between gap-2 cursor-pointer ${
                        isSelected
                          ? 'border-amber-400 bg-amber-500/15 text-white shadow-xl ring-2 ring-amber-400/30 scale-[1.02]'
                          : 'border-slate-800 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 truncate">
                          <span className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-amber-400 text-slate-950 font-black' : 'bg-slate-700 text-slate-300'
                          }`}>
                            {cIdx + 1}
                          </span>
                          <span className="font-black text-xs md:text-sm truncate">
                            {course.title}
                          </span>
                        </div>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
                      </div>

                      <div className="flex items-center justify-between text-[10px] pt-2 border-t border-slate-700/60">
                        <span className={hasVideo ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                          {hasVideo ? '🎬 فيديو خاص مرفوع' : '⚠️ افتراضي / لم يرفع'}
                        </span>
                        <span className="text-slate-400">
                          {course.introLesson?.isActive === false ? 'مخفي' : 'ظاهر للطلاب'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl">
              {/* Active Toggle */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-800/60 border border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
                    <Film className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">إظهار الحصة التعريفية لطلاب هذا الكورس</h3>
                    <p className="text-xs text-slate-400">تظهر في منتصف الصفحة تحت المصادر المتاحة وفوق الفيديوهات والملفات والاختبارات</p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={introLessonState.isActive !== false}
                    onChange={(e) => setIntroLessonState({ ...introLessonState, isActive: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-14 h-7 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>

              {/* Title Input */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300">عنوان الحصة التعريفية:</label>
                <input
                  type="text"
                  value={introLessonState.title || ''}
                  onChange={(e) => setIntroLessonState({ ...introLessonState, title: e.target.value })}
                  placeholder="مثال: الحصة التعريفية لشرح المنصة"
                  className="w-full px-4 py-3 rounded-2xl bg-slate-800 border border-slate-700 text-white text-xs md:text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Description Input */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300">وصف وتوجيهات الحصة التعريفية (اختياري):</label>
                <textarea
                  rows={2}
                  value={introLessonState.description || ''}
                  onChange={(e) => setIntroLessonState({ ...introLessonState, description: e.target.value })}
                  placeholder="مثال: فيديو توضيحي وشرح تفصيلي للمنصة وكيفية تحقيق المئوية بإذن الله"
                  className="w-full px-4 py-3 rounded-2xl bg-slate-800 border border-slate-700 text-white text-xs md:text-sm focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              {/* Video Upload Section (Direct File Upload & URL) */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-300">
                  رفع فيديو الحصة التعريفية من جهازك:
                </label>
                
                <div className="border-2 border-dashed border-amber-500/40 rounded-2xl p-6 text-center bg-slate-800/40 hover:bg-slate-800/70 transition flex flex-col items-center justify-center space-y-3">
                  <div className="p-3 bg-amber-500/10 rounded-2xl text-amber-400">
                    <Upload className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">اختر ملف الفيديو لرفعه مباشرة</p>
                    <p className="text-xs text-slate-400 mt-1">يدعم صيغ MP4, WebM, MOV وغيرها</p>
                  </div>

                  <label className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs cursor-pointer shadow-lg shadow-amber-500/25 transition">
                    <span>{isUploadingIntroVideo ? 'جاري قراءة ورفع الفيديو...' : 'تصفح واختيار ملف الفيديو من جهازك'}</span>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={handleIntroVideoFileUpload}
                      className="hidden"
                      disabled={isUploadingIntroVideo}
                    />
                  </label>
                </div>
              </div>

              {/* Or Direct URL Input */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300">أو رابط فيديو مباشر (URL / رابط استضافة):</label>
                <input
                  type="url"
                  value={introLessonState.videoUrl?.startsWith('data:') ? 'تم تحميل ملف فيديو محلي مشفر' : (introLessonState.videoUrl || '')}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val !== 'تم تحميل ملف فيديو محلي مشفر') {
                      setIntroLessonState({ ...introLessonState, videoUrl: val });
                    }
                  }}
                  placeholder="https://example.com/video.mp4 أو رابط فيديو مباشر"
                  className="w-full px-4 py-3 rounded-2xl bg-slate-800 border border-slate-700 text-white text-xs md:text-sm font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Video Preview if present */}
              {introLessonState.videoUrl && (
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                    <span className="flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>معاينة فيديو الحصة التعريفية المرفوع:</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setIntroLessonState({ ...introLessonState, videoUrl: '' })}
                      className="text-rose-400 hover:text-rose-300 flex items-center gap-1 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف الفيديو المرفوع</span>
                    </button>
                  </div>

                  <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black shadow-inner border border-slate-800">
                    <SmartVideoPlayer
                      key={`${introLessonState.videoUrl}-${introLessonState.backupUrl || ''}`}
                      url={introLessonState.videoUrl}
                      backupUrl={introLessonState.backupUrl}
                      title={introLessonState.title || 'معاينة الحصة التعريفية'}
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIntroLessonState({
                      isActive: true,
                      title: 'الحصة التعريفية لشرح المنصة وطريقة الاستفادة منها',
                      videoUrl: '',
                      description: 'شاهد هذا الفيديو للتعرف على طريقة التدرب واستخدام السبورة الذكية ومجلدات الأخطاء لتحقيق نسبة 100% بإذن الله'
                    });
                  }}
                  className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
                >
                  إعادة ضبط الحقول
                </button>

                <button
                  type="button"
                  onClick={handleSaveIntroLesson}
                  disabled={isSavingIntroLesson}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs md:text-sm shadow-xl shadow-amber-500/25 transition cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>
                    {isSavingIntroLesson
                      ? 'جاري الحفظ...'
                      : `حفظ فيديو الحصة التعريفية لكورس (${courses.find((c) => c.id === selectedIntroCourseId)?.title || 'الكورس المحدد'}) 🎬`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 8: المميزات وروابط مجموعات التليجرام ================= */}
        {activeTab === 'features' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl md:text-2xl font-black text-white flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-amber-400" />
                  <span>إدارة المميزات وروابط مجموعات التليجرام لكل كورس</span>
                </h2>
                <p className="text-xs text-slate-400">
                  اختر الكورس أولاً، ثم خصص روابط مجموعات التليجرام وإعدادات تحديد المستوى وتحدي الأصدقاء الخاصة به
                </p>
              </div>

              <button
                type="button"
                onClick={handleSaveFeatures}
                disabled={isSavingFeatures}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs md:text-sm shadow-xl shadow-amber-500/25 transition cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>
                  {isSavingFeatures
                    ? 'جاري الحفظ...'
                    : `حفظ روابط التليجرام والمميزات لكورس (${courses.find((c) => c.id === selectedFeaturesCourseId)?.title || 'الكورس المحدد'}) ⚡`}
                </span>
              </button>
            </div>

            {/* ================= اختيار الكورس للمميزات ================= */}
            <div className="bg-slate-900 border-2 border-amber-500/40 rounded-3xl p-5 md:p-6 shadow-2xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base md:text-lg font-black text-white">
                      اختر الكورس لتعديل المميزات وروابط التليجرام الخاصة به:
                    </h3>
                    <p className="text-xs text-slate-400">
                      لكل كورس روابط جروبات تليجرام منفصلة (الأساسي والمناقشة) ومميزات مستقلة تماماً
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">الكورس المحدد للتعديل:</span>
                  <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-black">
                    {courses.find((c) => c.id === selectedFeaturesCourseId)?.title || courses[0]?.title}
                  </span>
                </div>
              </div>

              {/* Horizontal Course Selector Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                {courses.map((course, cIdx) => {
                  const isSelected = (selectedFeaturesCourseId || courses[0]?.id) === course.id;
                  const hasCustomLinks = Boolean(course.features?.telegramMainGroupUrl || course.features?.telegramDiscussionGroupUrl);

                  return (
                    <button
                      key={course.id}
                      type="button"
                      onClick={() => handleSelectFeaturesCourse(course.id)}
                      className={`p-4 rounded-2xl border-2 text-right transition-all flex flex-col justify-between gap-2 cursor-pointer ${
                        isSelected
                          ? 'border-amber-400 bg-amber-500/15 text-white shadow-xl ring-2 ring-amber-400/30 scale-[1.02]'
                          : 'border-slate-800 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 truncate">
                          <span className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-amber-400 text-slate-950 font-black' : 'bg-slate-700 text-slate-300'
                          }`}>
                            {cIdx + 1}
                          </span>
                          <span className="font-black text-xs md:text-sm truncate">
                            {course.title}
                          </span>
                        </div>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
                      </div>

                      <div className="flex items-center justify-between text-[10px] pt-2 border-t border-slate-700/60">
                        <span className={hasCustomLinks ? 'text-sky-400 font-bold' : 'text-slate-400'}>
                          {hasCustomLinks ? '✈️ روابط خاصة بالكورس' : 'الروابط الافتراضية'}
                        </span>
                        <span className="text-slate-400">
                          {course.features?.isDiagnosticEnabled === false || course.features?.isFriendsChallengeEnabled === false
                            ? 'بعض الميزات معطلة'
                            : 'كافة الميزات مفعلة'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl">
              {/* Notice Banner */}
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-3">
                <Sparkles className="w-5 h-5 shrink-0 text-amber-400" />
                <div>
                  <span className="font-bold block">قسم المميزات الذهبية في واجهة الطلاب:</span>
                  <span className="text-[11px] text-slate-300">
                    تظهر كلمة المميزات بجانب كلمة &quot;احصائياتي&quot; باللون الذهبي للطلاب، وتحتوي بداخلها على 4 مستطيلات (جروب أقسام رعد الأساسي، جروب أقسام رعد المناقشة، اختبار تحديد مستوى الطالب، تحدي الأصدقاء).
                  </span>
                </div>
              </div>

              {/* المستطيل 1: رابط جروب أقسام رعد الأساسي */}
              <div className="p-5 rounded-2xl bg-slate-800/60 border border-sky-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-sky-500 flex items-center justify-center text-white shadow-md shadow-sky-500/25">
                      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .37z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white">رابط جروب أقسام رعد الأساسي (تليجرام)</h4>
                      <p className="text-[11px] text-slate-400">القناة والجروب الرسمي للتنبيهات والجداول والشروحات</p>
                    </div>
                  </div>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30 font-bold">
                    المستطيل الأول
                  </span>
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="text-[11px] font-bold text-sky-300 block mb-1">اسم / عنوان الجروب الظاهر للطلاب:</label>
                    <input
                      type="text"
                      value={featuresState.telegramMainGroupTitle || ''}
                      onChange={(e) => setFeaturesState({ ...featuresState, telegramMainGroupTitle: e.target.value })}
                      placeholder="جروب أقسام رعد الأساسي"
                      className="w-full px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-bold focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">رابط الجروب (تليجرام):</label>
                    <div className="flex flex-col sm:flex-row items-center gap-2">
                      <input
                        type="url"
                        value={featuresState.telegramMainGroupUrl || ''}
                        onChange={(e) => setFeaturesState({ ...featuresState, telegramMainGroupUrl: e.target.value })}
                        placeholder="https://t.me/your_main_group"
                        className="flex-1 w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-sky-500"
                      />
                      {featuresState.telegramMainGroupUrl && (
                        <a
                          href={featuresState.telegramMainGroupUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition flex items-center gap-1.5 shrink-0"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>تجربة الرابط 🔗</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* المستطيل 2: رابط جروب أقسام رعد المناقشة */}
              <div className="p-5 rounded-2xl bg-slate-800/60 border border-indigo-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/25">
                      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .37z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white">رابط ومسمى جروب المناقشة (تليجرام)</h4>
                      <p className="text-[11px] text-slate-400">مجموعة نقاش وتفاعل واستفسارات الطلاب وتبادل الشروحات</p>
                    </div>
                  </div>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 font-bold">
                    المستطيل الثاني
                  </span>
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="text-[11px] font-bold text-indigo-300 block mb-1">اسم / عنوان الجروب الظاهر للطلاب:</label>
                    <input
                      type="text"
                      value={featuresState.telegramDiscussionGroupTitle || ''}
                      onChange={(e) => setFeaturesState({ ...featuresState, telegramDiscussionGroupTitle: e.target.value })}
                      placeholder="جروب أقسام رعد المناقشة"
                      className="w-full px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-bold focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">رابط الجروب (تليجرام):</label>
                    <div className="flex flex-col sm:flex-row items-center gap-2">
                      <input
                        type="url"
                        value={featuresState.telegramDiscussionGroupUrl || ''}
                        onChange={(e) => setFeaturesState({ ...featuresState, telegramDiscussionGroupUrl: e.target.value })}
                        placeholder="https://t.me/your_discussion_group"
                        className="flex-1 w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                      />
                      {featuresState.telegramDiscussionGroupUrl && (
                        <a
                          href={featuresState.telegramDiscussionGroupUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center gap-1.5 shrink-0"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>تجربة الرابط 💬</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* المستطيل 3: اختبار تحديد مستوى الطالب */}
              <div className="p-5 rounded-2xl bg-slate-800/60 border border-emerald-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400">
                      <Target className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white">المستطيل الثالث: اختبار تحديد مستوى الطالب</h4>
                      <p className="text-[11px] text-slate-400">
                        يتيح للطالب اختيار أي مصدر والاختبار على أي عدد من الاختبارات (عشوائياً أو يدوياً)
                      </p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={featuresState.isDiagnosticEnabled !== false}
                      onChange={(e) => setFeaturesState({ ...featuresState, isDiagnosticEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-12 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>
              </div>

              {/* المستطيل 4: تحدي الأصدقاء */}
              <div className="p-5 rounded-2xl bg-slate-800/60 border border-amber-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
                      <Trophy className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white">المستطيل الرابع: تحدي الأصدقاء</h4>
                      <p className="text-[11px] text-slate-400">
                        إنشاء أو انضمام لتحدي، واختيار عدد الاختبارات (1، 3، 5، 7، 10)، واستخراج كود لمشاركته ومنافسة صديق
                      </p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={featuresState.isFriendsChallengeEnabled !== false}
                      onChange={(e) => setFeaturesState({ ...featuresState, isFriendsChallengeEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-12 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setFeaturesState({
                      telegramMainGroupUrl: 'https://t.me/raad_qiyas_main',
                      telegramDiscussionGroupUrl: 'https://t.me/raad_qiyas_discussion',
                      isDiagnosticEnabled: true,
                      isFriendsChallengeEnabled: true,
                    });
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
                >
                  إعادة ضبط الروابط الافتراضية
                </button>

                <button
                  type="button"
                  onClick={handleSaveFeatures}
                  disabled={isSavingFeatures}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs md:text-sm shadow-xl shadow-amber-500/25 transition cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>
                    {isSavingFeatures
                      ? 'جاري الحفظ...'
                      : `حفظ روابط التليجرام والمميزات لكورس (${courses.find((c) => c.id === selectedFeaturesCourseId)?.title || 'الكورس المحدد'}) ⚡`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ================= MODAL: SET STUDENT DAYS (WITH QUICK BUTTONS & UNLIMITED) ================= */}
      {studentForDaysModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl text-right space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  <Calendar className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">
                    تحديد اشتراك الطالب: {studentForDaysModal.name}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">{studentForDaysModal.email}</p>
                </div>
              </div>
              <button
                onClick={() => setStudentForDaysModal(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Access Buttons */}
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-2">وصول سريع لعدد الأيام:</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedDaysAmount(7)}
                  className={`p-2.5 rounded-2xl border text-xs font-bold text-center transition ${
                    selectedDaysAmount === 7
                      ? 'bg-blue-600 border-blue-400 text-white shadow-md'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  ⚡ أسبوع (7 أيام)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDaysAmount(15)}
                  className={`p-2.5 rounded-2xl border text-xs font-bold text-center transition ${
                    selectedDaysAmount === 15
                      ? 'bg-blue-600 border-blue-400 text-white shadow-md'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  ⚡ 15 يوم
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDaysAmount(30)}
                  className={`p-2.5 rounded-2xl border text-xs font-bold text-center transition ${
                    selectedDaysAmount === 30
                      ? 'bg-blue-600 border-blue-400 text-white shadow-md'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  🗓️ شهر (30 يوم)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDaysAmount(60)}
                  className={`p-2.5 rounded-2xl border text-xs font-bold text-center transition ${
                    selectedDaysAmount === 60
                      ? 'bg-blue-600 border-blue-400 text-white shadow-md'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  🗓️ شهرين (60 يوم)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDaysAmount(90)}
                  className={`p-2.5 rounded-2xl border text-xs font-bold text-center transition ${
                    selectedDaysAmount === 90
                      ? 'bg-blue-600 border-blue-400 text-white shadow-md'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  🗓️ 3 شهور (90 يوم)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDaysAmount(180)}
                  className={`p-2.5 rounded-2xl border text-xs font-bold text-center transition ${
                    selectedDaysAmount === 180
                      ? 'bg-blue-600 border-blue-400 text-white shadow-md'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  🗓️ 6 شهور (180 يوم)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDaysAmount(365)}
                  className={`p-2.5 rounded-2xl border text-xs font-bold text-center transition col-span-2 ${
                    selectedDaysAmount === 365
                      ? 'bg-blue-600 border-blue-400 text-white shadow-md'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  🗓️ سنة كاملة (365 يوم)
                </button>
              </div>
            </div>

            {/* Custom Input */}
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">أو أدخل عدد الأيام يدويًا لأي مدة تريدها:</label>
              <input
                type="number"
                min="1"
                max="2000"
                value={selectedDaysAmount}
                onChange={(e) => setSelectedDaysAmount(Math.max(1, Number(e.target.value)))}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* VIP Promotion Card */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-950/40 via-yellow-950/30 to-slate-900 border-2 border-amber-500/40 flex items-center justify-between gap-3 shadow-md">
              <div>
                <span className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                  <Crown className="w-4 h-4 text-amber-400" />
                  <span>ترقية الحساب إلى VIP ماسي 👑:</span>
                </span>
                <span className="text-[10px] text-slate-300 mt-0.5 block">
                  وصول كامل ومفتوح بدون تقييد مع شارة VIP الذهبية في حسابه
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleSaveStudentDays(false, true)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 text-xs font-black transition shadow-md shadow-amber-500/30 cursor-pointer shrink-0"
              >
                تفعيل VIP 👑
              </button>
            </div>

            {/* Freeze / Pause & Resume Counter */}
            <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-purple-500/30 flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-black text-purple-300 flex items-center gap-1.5">
                  <Pause className="w-4 h-4 text-purple-400" />
                  <span>قفل / استئناف العداد:</span>
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  {studentForDaysModal.isCounterPaused
                    ? `العداد موقوف حالياً (متبقي ${studentForDaysModal.pausedRemainingDays || 0} يوم محفوظة)`
                    : 'قفل العداد يوقف تناقص الأيام ويجمدها حتى تقوم باستئنافها'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  handleTogglePauseCounter(studentForDaysModal);
                  setStudentForDaysModal(null);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-black transition shadow-sm cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  studentForDaysModal.isCounterPaused
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-purple-600 hover:bg-purple-500 text-white'
                }`}
              >
                {studentForDaysModal.isCounterPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                <span>{studentForDaysModal.isCounterPaused ? 'استئناف العداد ▶️' : 'قفل العداد ⏸️'}</span>
              </button>
            </div>

            {/* Reset to Unspecified */}
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-amber-300 block">إعادة لـ "غير محدد" ⏳:</span>
                <span className="text-[10px] text-slate-400">تصفير الأيام وإقفال المنصة عليه حتى تعيد تحديد المدة</span>
              </div>
              <button
                type="button"
                onClick={() => handleResetToUnspecified(studentForDaysModal.id, studentForDaysModal.name)}
                className="px-3.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-bold transition cursor-pointer shrink-0"
              >
                تعيين غير محدد
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setStudentForDaysModal(null)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => handleSaveStudentDays(false, false)}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-lg shadow-blue-600/25 cursor-pointer"
              >
                حفظ عدد الأيام
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: INDIVIDUAL STUDENT BLOCK MODAL ================= */}
      {studentForBlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl text-right space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5 text-rose-400">
                <Lock className="w-6 h-6" />
                <h3 className="text-lg font-black text-white">
                  قفل المنصة على: {studentForBlockModal.name}
                </h3>
              </div>
              <button
                onClick={() => setStudentForBlockModal(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-300 block">اختر سبب ورسالة القفل لهذا الطالب:</label>
              
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setBlockReasonType('maintenance')}
                  className={`w-full text-right p-3 rounded-2xl border text-xs font-bold transition flex items-center gap-3 ${
                    blockReasonType === 'maintenance'
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400'
                  }`}
                >
                  <Wrench className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <div>بداعي الصيانة (مع صورة المفك والمعدات)</div>
                    <span className="text-[10px] text-slate-400 font-normal">تظهر له رسالة أن هناك أعمال صيانة تجري بالمنصة</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setBlockReasonType('subscription')}
                  className={`w-full text-right p-3 rounded-2xl border text-xs font-bold transition flex items-center gap-3 ${
                    blockReasonType === 'subscription'
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400'
                  }`}
                >
                  <MessageCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <div>انتهاء الاشتراك (مع زر الواتساب للتجديد)</div>
                    <span className="text-[10px] text-slate-400 font-normal">تظهر له رسالة انتهاء الاشتراك مع رابط واتساب المشرف</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setBlockReasonType('supervisor')}
                  className={`w-full text-right p-3 rounded-2xl border text-xs font-bold transition flex items-center gap-3 ${
                    blockReasonType === 'supervisor'
                      ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400'
                  }`}
                >
                  <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                  <div>
                    <div>قام المشرف بقفل المنصة عليك</div>
                    <span className="text-[10px] text-slate-400 font-normal">إشعار إداري مباشر بتعليق الحساب من قِبل المشرف</span>
                  </div>
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">رسالة مخصصة إضافية للطالب (اختياري):</label>
              <textarea
                rows={2}
                value={blockCustomMessage}
                onChange={(e) => setBlockCustomMessage(e.target.value)}
                placeholder="اكتب ملاحظة أو توجيه للطالب..."
                className="w-full p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStudentForBlockModal(null)}
                className="px-3 py-2 text-xs text-slate-400 hover:text-white"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveIndividualBlock}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition shadow-lg shadow-rose-600/25"
              >
                تأكيد القفل على الطالب
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: DELETE STUDENT (PERMANENT VS NORMAL) ================= */}
      {deletingStudent && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl text-right space-y-6">
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl w-fit mx-auto">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-xl font-black text-white text-center">
                خيارات حذف حساب: {deletingStudent.name}
              </h3>
              <p className="text-xs text-slate-400 text-center mt-2 font-mono">
                {deletingStudent.email}
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <button
                onClick={() => handleConfirmDelete(true)}
                className="w-full p-4 rounded-2xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/50 text-rose-300 font-bold text-right transition group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-black text-white">🚫 حذف دائم وحظر كامل</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500 text-white font-bold">نهائي</span>
                </div>
                <p className="text-xs text-rose-300/80">
                  لو ضغطته لا يمكنه تسجيل الدخول أو إنشاء حساب بهذا البريد أبداً في المنصة.
                </p>
              </button>

              <button
                onClick={() => handleConfirmDelete(false)}
                className="w-full p-4 rounded-2xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-200 font-bold text-right transition"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-black text-white">🔄 حذف عادي للحساب</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-700 text-slate-300">عادي</span>
                </div>
                <p className="text-xs text-slate-400">
                  يحذف حسابه الحالي، لكن يمكنه إنشاء حساب جديد بنفس الإيميل لاحقاً إذا رغب.
                </p>
              </button>
            </div>

            <button
              onClick={() => setDeletingStudent(null)}
              className="w-full py-2.5 rounded-xl text-xs text-slate-400 hover:text-white transition"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD / EDIT SECTION ================= */}
      {isAddingSection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <form
            onSubmit={editingSection ? handleUpdateSection : handleCreateSection}
            className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4"
          >
            <h3 className="text-lg font-bold text-white">
              {editingSection ? 'تعديل بيانات القسم' : 'إضافة قسم تعليمي جديد'}
            </h3>
            <div>
              <label className="text-xs font-bold text-slate-400 block mb-1">عنوان القسم:</label>
              <input
                type="text"
                required
                placeholder="مثال: قسم التناظر اللفظي المتقدم..."
                value={newSectionTitle}
                onChange={(e) => setNewSectionTitle(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 block mb-1">الوصف:</label>
              <textarea
                placeholder="شرح موجز للقسم..."
                value={newSectionDesc}
                onChange={(e) => setNewSectionDesc(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 block mb-1">
                رقم ترتيب القسم (يظهر للطالب وفق هذا الترتيب 1، 2، 3...):
              </label>
              <input
                type="number"
                min={1}
                value={newSectionOrder}
                onChange={(e) => setNewSectionOrder(Number(e.target.value) || 1)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-800 border border-slate-700 text-amber-300 font-bold focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsAddingSection(false);
                  setEditingSection(null);
                }}
                className="px-3 py-2 text-xs text-slate-400 hover:text-white"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl"
              >
                {editingSection ? 'حفظ التعديل' : 'إضافة القسم'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ================= MODAL: ADD / EDIT RESOURCE ================= */}
      {isAddingResource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <form
            onSubmit={editingResource ? handleUpdateResource : handleCreateResource}
            className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4"
          >
            <h3 className="text-lg font-bold text-white">
              {editingResource ? 'تعديل المصدر' : 'إضافة مصدر جديد للقسم'}
            </h3>
            <div>
              <label className="text-xs font-bold text-slate-400 block mb-1">عنوان المصدر:</label>
              <input
                type="text"
                required
                placeholder="مثال: بنك أسئلة الهندسة والزوايا..."
                value={newResourceTitle}
                onChange={(e) => setNewResourceTitle(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 block mb-1">الوصف:</label>
              <textarea
                placeholder="وصف للمصدر..."
                value={newResourceDesc}
                onChange={(e) => setNewResourceDesc(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 block mb-1">
                رقم ترتيب المصدر داخل القسم (1، 2، 3...):
              </label>
              <input
                type="number"
                min={1}
                value={newResourceOrder}
                onChange={(e) => setNewResourceOrder(Number(e.target.value) || 1)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-800 border border-slate-700 text-emerald-300 font-bold focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsAddingResource(false);
                  setEditingResource(null);
                }}
                className="px-3 py-2 text-xs text-slate-400 hover:text-white"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl"
              >
                {editingResource ? 'حفظ التعديل' : 'إضافة المصدر'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ================= MODAL: ADD / EDIT CONTENT ITEM ================= */}
      {isAddingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-md overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-2xl w-full my-auto space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                {itemType === 'video' ? (
                  <>
                    <Video className="w-5 h-5 text-blue-400" />
                    <span>{editingItem ? 'تعديل الفيديو التعليمي' : 'قسم رفع وإضافة فيديو تعليمي جديد'}</span>
                  </>
                ) : itemType === 'exam' ? (
                  <>
                    <Award className="w-5 h-5 text-amber-400" />
                    <span>{editingItem ? 'تعديل الاختبار التفاعلي والأسئلة' : 'قسم إنشاء وإضافة اختبار تفاعلي جديد'}</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-5 h-5 text-emerald-400" />
                    <span>{editingItem ? 'تعديل بيانات الملف والمستند' : 'قسم رفع وإضافة ملف أو ملخص جديد'}</span>
                  </>
                )}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsAddingItem(false);
                  setEditingItem(null);
                }}
                className="text-slate-400 hover:text-white text-xs"
              >
                إلغاء
              </button>
            </div>

            {/* Reassurance Banner: Upload safety & preservation */}
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-400" />
              <div>
                <span className="font-bold block">رفع آمن ومستقل بالكامل:</span>
                <span className="text-[11px] text-slate-300">
                  يتم رفع وحفظ هذا العنصر كملف جديد ومستقل بالكامل عالمنصة، مع بقاء كافة الملفات والمحتويات الموجودة سابقاً دون أي تغيير أو مساس بها ✓
                </span>
              </div>
            </div>

            {/* Section & Resource Target Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-800/60 rounded-2xl border border-slate-700/80">
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">القسم المستهدف:</label>
                <select
                  value={modalSectionId}
                  onChange={(e) => {
                    const secId = e.target.value;
                    setModalSectionId(secId);
                    const firstRes = resources.find((r) => r.sectionId === secId);
                    if (firstRes) setModalResourceId(firstRes.id);
                    else setModalResourceId('');
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-700 text-white font-bold focus:border-blue-500 focus:outline-none cursor-pointer"
                >
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">المصدر التابع له:</label>
                <select
                  value={modalResourceId}
                  onChange={(e) => setModalResourceId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-700 text-emerald-300 font-bold focus:border-emerald-500 focus:outline-none cursor-pointer"
                >
                  {resources.filter((r) => r.sectionId === modalSectionId).length === 0 ? (
                    <option value="">-- المحتوى العام التلقائي للقسم --</option>
                  ) : (
                    resources
                      .filter((r) => r.sectionId === modalSectionId)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title}
                        </option>
                      ))
                  )}
                </select>
              </div>
            </div>

            {/* Type selector */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setItemType('video')}
                className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 ${
                  itemType === 'video'
                    ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                <Video className="w-4 h-4" />
                <span>فيديو</span>
              </button>

              <button
                type="button"
                onClick={() => setItemType('exam')}
                className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 ${
                  itemType === 'exam'
                    ? 'bg-amber-600/20 border-amber-500 text-amber-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                <Award className="w-4 h-4" />
                <span>اختبار</span>
              </button>

              <button
                type="button"
                onClick={() => setItemType('file')}
                className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 ${
                  itemType === 'file'
                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>ملف / مستند</span>
              </button>
            </div>

            {/* Basic Info */}
            <div>
              <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                <label className="text-xs font-black text-slate-200 flex items-center gap-1.5">
                  <span>
                    {itemType === 'video' ? 'اسم / عنوان الفيديو:' : itemType === 'exam' ? 'اسم / عنوان الاختبار:' : 'اسم / عنوان الملف أو المستند:'}
                  </span>
                  <span className="text-rose-400">*</span>
                </label>
                {itemTitle.trim().length > 0 ? (
                  <span className="text-[11px] font-black text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-sm animate-in fade-in duration-150">
                    <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                    <span>الاسم مثبت ومحفوظ ✓ ({itemTitle.trim()})</span>
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500 font-bold">
                    (اكتب الاسم هنا وسيتم تثبيته تلقائياً ✓)
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  ref={titleInputRef}
                  type="text"
                  name="custom_content_title_protect"
                  id="item-title-field"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  required
                  placeholder={itemType === 'video' ? 'مثال: شرح درس التناظر اللفظي 1...' : itemType === 'exam' ? 'مثال: اختبار القدرات العام...' : 'مثال: ملخص ومذكرة القوانين...'}
                  value={itemTitle}
                  onChange={(e) => updateItemTitle(e.target.value, true)}
                  onBlur={() => {
                    if (itemTitle) {
                      itemTitleRef.current = itemTitle;
                      pinnedTitleRef.current = itemTitle;
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.preventDefault();
                  }}
                  className={`w-full py-2.5 px-3.5 text-xs rounded-xl bg-slate-800 border text-white focus:outline-none font-bold transition ${
                    itemTitle.trim().length > 0
                      ? 'border-emerald-500/60 focus:border-emerald-400 pl-9'
                      : 'border-slate-700 focus:border-blue-500'
                  }`}
                />
                {itemTitle.trim().length > 0 && (
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shadow-sm">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                )}
              </div>
              {itemTitle.trim().length > 0 && (
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400/90 mt-1">
                  <Check className="w-3 h-3 stroke-[3]" />
                  <span>هذا الاسم مثبت ومحمي ولن يتغير أو يختفي عند لصق الرابط أو رفع الملف وسيتم الحفظ والنشر به مباشرة ✓</span>
                </div>
              )}
            </div>

            {/* Video Duration & Quick Presets (كتابة المدة أو الضغط على زر فيديو تعليمي) */}
            {itemType === 'video' && (
              <div className="p-3.5 bg-slate-800/80 rounded-2xl border border-blue-500/40 space-y-2.5 shadow-md">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className="text-xs font-black text-blue-300 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-blue-400" />
                    <span>عرض مدة الفيديو أو عبارة "فيديو تعليمي" تحته:</span>
                  </label>
                  <div>
                    {showAsEducationalVideo ? (
                      <span className="text-xs font-mono font-black text-emerald-300 bg-emerald-500/20 px-2.5 py-1 rounded-xl border border-emerald-500/40 flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                        <span>سيظهر تحت الفيديو: <strong>"فيديو تعليمي"</strong> (تم الاختيار ✓)</span>
                      </span>
                    ) : (
                      <span className="text-xs font-mono font-black text-blue-300 bg-blue-500/20 px-2.5 py-1 rounded-xl border border-blue-500/40">
                        ⏱️ سيظهر تحت الفيديو: {itemDurationMinutes || 15} دقيقة
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  {/* كتابة عدد الدقائق */}
                  <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-blue-500/40">
                    <span className="text-xs text-slate-300 font-bold">عدد الدقائق:</span>
                    <input
                      type="number"
                      min={1}
                      max={600}
                      value={itemDurationMinutes}
                      onChange={(e) => {
                        setItemDurationMinutes(Math.max(1, Number(e.target.value) || 15));
                        setShowAsEducationalVideo(false);
                      }}
                      placeholder="15"
                      className="w-20 px-2 py-1 text-xs rounded-lg bg-slate-800 border border-slate-700 text-white font-mono text-center font-black focus:outline-none focus:border-blue-400"
                    />
                    <span className="text-xs text-slate-400 font-bold">دقيقة</span>
                  </div>

                  {/* كلمة "فيديو تعليمي" بجانب عدد دقائق الفيديو مباشرة */}
                  <button
                    type="button"
                    onClick={() => setShowAsEducationalVideo(!showAsEducationalVideo)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5 border cursor-pointer ${
                      showAsEducationalVideo
                        ? 'bg-emerald-600 text-white border-emerald-400 shadow-lg shadow-emerald-600/30 ring-2 ring-emerald-400/50 scale-[1.02]'
                        : 'bg-slate-900 hover:bg-slate-800 text-emerald-400 border-emerald-500/40 hover:border-emerald-400'
                    }`}
                    title="الضغط هنا يظهر عبارة 'فيديو تعليمي' تحت الفيديو بدلاً من عدد الدقائق"
                  >
                    <Video className="w-4 h-4 text-emerald-300" />
                    <span>فيديو تعليمي</span>
                    {showAsEducationalVideo ? (
                      <span className="bg-emerald-500 text-slate-950 rounded-full px-1.5 py-0.2 text-[10px] font-black">
                        ✓ مفعل للظهور
                      </span>
                    ) : (
                      <span className="text-[10px] text-emerald-400/80 font-bold">(اضغط هنا لاختيارها)</span>
                    )}
                  </button>

                  {/* Quick Preset Buttons (دقائق سريعة) */}
                  <button
                    type="button"
                    onClick={() => {
                      setItemDurationMinutes(15);
                      setShowAsEducationalVideo(false);
                    }}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1 border cursor-pointer ${
                      !showAsEducationalVideo && itemDurationMinutes === 15
                        ? 'bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-600/30 ring-2 ring-blue-400/50'
                        : 'bg-slate-900/90 hover:bg-slate-800 text-blue-300 border-blue-500/30'
                    }`}
                  >
                    <span>15 دقيقة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setItemDurationMinutes(30);
                      setShowAsEducationalVideo(false);
                    }}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1 border cursor-pointer ${
                      !showAsEducationalVideo && itemDurationMinutes === 30
                        ? 'bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-600/30 ring-2 ring-blue-400/50'
                        : 'bg-slate-900/90 hover:bg-slate-800 text-blue-300 border-blue-500/30'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>30 دقيقة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setItemDurationMinutes(45);
                      setShowAsEducationalVideo(false);
                    }}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1 border cursor-pointer ${
                      !showAsEducationalVideo && itemDurationMinutes === 45
                        ? 'bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-600/30 ring-2 ring-blue-400/50'
                        : 'bg-slate-900/90 hover:bg-slate-800 text-blue-300 border-blue-500/30'
                    }`}
                  >
                    <span>45 دقيقة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setItemDurationMinutes(60);
                      setShowAsEducationalVideo(false);
                    }}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1 border cursor-pointer ${
                      !showAsEducationalVideo && itemDurationMinutes === 60
                        ? 'bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-600/30 ring-2 ring-blue-400/50'
                        : 'bg-slate-900/90 hover:bg-slate-800 text-blue-300 border-blue-500/30'
                    }`}
                  >
                    <span>60 دقيقة</span>
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-400 block mb-1">الوصف والملاحظات:</label>
              <input
                type="text"
                autoComplete="off"
                placeholder="وصف مختصر اختياري..."
                value={itemDesc}
                onChange={(e) => updateItemDesc(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.preventDefault();
                }}
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Video or File options */}
            {(itemType === 'video' || itemType === 'file') && (
              <div className="space-y-3 p-4 bg-slate-800/60 rounded-2xl border border-slate-700">
                <span className="text-xs font-bold text-slate-300 block">طريقة إضافة الملف / الفيديو:</span>
                {editingItem && (itemFileName || itemUrl) && (
                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-center justify-between">
                    <span className="truncate">
                      <strong>الملف/الرابط الحالي المحفوظ:</strong> {itemFileName || itemUrl}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold shrink-0">
                      محفوظ بأمان ✓
                    </span>
                  </div>
                )}
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    رابط مباشر أو رابط Google Drive / Dropbox (URL):
                  </label>
                  <input
                    type="text"
                    name="custom_content_url_protect"
                    id="item-url-field"
                    autoComplete="off"
                    spellCheck={false}
                    data-lpignore="true"
                    data-1p-ignore="true"
                    placeholder="https://drive.google.com/... أو https://..."
                    value={itemUrl}
                    onChange={(e) => {
                      setItemUrl(e.target.value);
                      const preserved = itemTitleRef.current || pinnedTitleRef.current || (editingItem ? editingItem.title : '');
                      if (preserved) {
                        setItemTitle((prev) => prev || preserved);
                      }
                    }}
                    onPaste={(e) => {
                      const pasted = e.clipboardData?.getData('text')?.trim();
                      if (pasted) {
                        e.preventDefault();
                        setItemUrl(pasted);
                      }
                      const preserved = itemTitleRef.current || pinnedTitleRef.current || (editingItem ? editingItem.title : '');
                      if (preserved) {
                        setItemTitle((prev) => prev || preserved);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.preventDefault();
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-700 text-white font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    يمكنك لصق رابط Google Drive أو رابط خارجي مباشر لفتح وتحميل الملف بسرعة فائقة.
                  </p>
                </div>
                <div className="text-center text-xs text-slate-500 font-bold">— أو رفع ملف مباشر من جهازك —</div>
                <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-700 space-y-2.5">
                  <label className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs cursor-pointer shadow-lg shadow-blue-600/25 transition">
                    <Upload className="w-4 h-4" />
                    <span>
                      {itemType === 'video' ? 'اضغط لاختيار ورفع فيديو من جهازك 🎥' : 'اضغط لاختيار ورفع ملف / مستند من جهازك 📁'}
                    </span>
                    <input
                      type="file"
                      accept={itemType === 'video' ? 'video/*,.mp4,.webm,.mkv,.mov,.avi,.m4v,.wmv,.flv,.3gp' : '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.png,.jpg,.jpeg,.txt,*'}
                      onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  <p className="text-[10px] text-slate-400 text-center">
                    {itemType === 'video'
                      ? 'يدعم جميع صيغ الفيديو (MP4, MOV, WebM, MKV, AVI) ويحوّلها تلقائياً لتعمل بسلاسة على جميع الأجهزة ✓.'
                      : 'يدعم ملفات PDF، Word، مستندات، عروض وصور مع الحفظ الآمن في المنصة.'}
                  </p>

                  {/* Server Upload Progress Bar */}
                  {isUploadingServerFile && (
                    <div className="space-y-1.5 p-3 rounded-xl bg-blue-950/70 border border-blue-500/40 animate-pulse">
                      <div className="flex items-center justify-between text-xs text-blue-300 font-bold">
                        <span className="flex items-center gap-1.5">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                          <span>
                            {serverUploadProgress >= 100
                              ? 'جاري تجهيز وتهيئة الفيديو للتشغيل السريع على جميع الأجهزة...'
                              : 'جاري رفع وحفظ الملف على خادم المنصة...'}
                          </span>
                        </span>
                        <span className="font-mono">%{serverUploadProgress}</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 via-indigo-400 to-emerald-400 transition-all duration-150 rounded-full"
                          style={{ width: `${Math.max(5, serverUploadProgress)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {itemFileName && (
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-[11px] text-emerald-300">
                      <span className="flex items-center gap-1.5 font-bold">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>تم اختيار: {itemFileName} ({itemFileSize})</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setItemFileData('');
                          setItemFileName('');
                          setItemFileSize('');
                        }}
                        className="text-rose-400 hover:text-rose-300 font-bold underline text-[10px] cursor-pointer"
                      >
                        إلغاء الملف
                      </button>
                    </div>
                  )}
                </div>

                {/* Live Video Preview inside Content Item Modal */}
                {itemType === 'video' && itemUrl.trim() && !isUploadingServerFile && !itemUrl.trim().startsWith('blob:') && (
                  <div className="space-y-1.5 pt-2">
                    <div className="flex items-center justify-between text-[11px] font-bold text-emerald-300">
                      <span>معاينة سريعة للفيديو قبل الحفظ:</span>
                      {itemUrl.includes('/api/media/') && (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30 text-[10px] font-black">
                          محفوظ في Firebase ⚡
                        </span>
                      )}
                    </div>
                    <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black border border-slate-700">
                      <SmartVideoPlayer
                        url={itemUrl.trim()}
                        backupUrl={itemBackupUrl || editingItem?.backupUrl}
                        title={itemTitle || 'معاينة الفيديو'}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Link Exams and Files to Video */}
            {itemType === 'video' && (
              <div className="space-y-4 p-4 bg-slate-800/80 rounded-2xl border border-slate-700/80">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-700">
                  <LinkIcon className="w-4 h-4 text-amber-400" />
                  <div>
                    <span className="text-xs font-black text-amber-300 block">
                      ربط اختبارات وملفات بهذا الفيديو (تظهر أسفل مشغل الفيديو للطلاب 🔗):
                    </span>
                    <span className="text-[10px] text-slate-400">
                      يمكنك ربط أي اختبار وأي ملف مرفوعين عالمنصة بهذا الفيديو ليتمكن الطالب من خوض الاختبار وتحميل الملف مباشرة أسفل الفيديو
                    </span>
                  </div>
                </div>

                {/* Linked Exams */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5 text-amber-400" />
                      <span>حدد الاختبارات المرتبطة بهذا الفيديو:</span>
                    </label>
                    <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded">
                      تم تحديد ({linkedExamIds.length}) اختبار
                    </span>
                  </div>

                  {/* Quick Select Exam Dropdown */}
                  <select
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id && !linkedExamIds.includes(id)) {
                        setLinkedExamIds((prev) => [...prev, id]);
                      }
                    }}
                    value=""
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-700 text-amber-200 font-bold focus:border-amber-400 focus:outline-none cursor-pointer"
                  >
                    <option value="">-- اضغط لاختيار اسم الاختبار وإضافته للربط --</option>
                    {items
                      .filter((it) => it.type === 'exam')
                      .map((ex) => (
                        <option key={ex.id} value={ex.id}>
                          {ex.title} ({ex.questions?.length || 0} أسئلة)
                        </option>
                      ))}
                  </select>

                  <div className="max-h-36 overflow-y-auto space-y-1.5 bg-slate-900/60 p-2.5 rounded-xl border border-slate-700/60">
                    {items.filter((it) => it.type === 'exam').length === 0 ? (
                      <p className="text-[11px] text-slate-500 text-center py-2">لا توجد اختبارات مرفوعة بالمنصة حالياً</p>
                    ) : (
                      items
                        .filter((it) => it.type === 'exam')
                        .map((ex) => {
                          const isChecked = linkedExamIds.includes(ex.id);
                          return (
                            <label
                              key={ex.id}
                              className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition border ${
                                isChecked
                                  ? 'bg-amber-500/20 border-amber-500 text-amber-200'
                                  : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setLinkedExamIds((prev) => [...prev, ex.id]);
                                    } else {
                                      setLinkedExamIds((prev) => prev.filter((id) => id !== ex.id));
                                    }
                                  }}
                                  className="accent-amber-500 rounded"
                                />
                                <span className="font-bold truncate">{ex.title}</span>
                              </div>
                              <span className="text-[10px] text-slate-400 shrink-0">
                                {ex.questions?.length || 0} أسئلة
                              </span>
                            </label>
                          );
                        })
                    )}
                  </div>
                </div>

                {/* Linked Files */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-emerald-400" />
                      <span>حدد الملفات والملخصات المرتبطة بهذا الفيديو:</span>
                    </label>
                    <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">
                      تم تحديد ({linkedFileIds.length}) ملف
                    </span>
                  </div>

                  {/* Quick Select File Dropdown */}
                  <select
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id && !linkedFileIds.includes(id)) {
                        setLinkedFileIds((prev) => [...prev, id]);
                      }
                    }}
                    value=""
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-700 text-emerald-200 font-bold focus:border-emerald-400 focus:outline-none cursor-pointer"
                  >
                    <option value="">-- اضغط لاختيار اسم الملف وإضافته للربط --</option>
                    {items
                      .filter((it) => it.type === 'file')
                      .map((fl) => (
                        <option key={fl.id} value={fl.id}>
                          {fl.title} ({fl.fileSize || 'PDF'})
                        </option>
                      ))}
                  </select>

                  <div className="max-h-36 overflow-y-auto space-y-1.5 bg-slate-900/60 p-2.5 rounded-xl border border-slate-700/60">
                    {items.filter((it) => it.type === 'file').length === 0 ? (
                      <p className="text-[11px] text-slate-500 text-center py-2">لا توجد ملفات مرفوعة بالمنصة حالياً</p>
                    ) : (
                      items
                        .filter((it) => it.type === 'file')
                        .map((fl) => {
                          const isChecked = linkedFileIds.includes(fl.id);
                          return (
                            <label
                              key={fl.id}
                              className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition border ${
                                isChecked
                                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-200'
                                  : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setLinkedFileIds((prev) => [...prev, fl.id]);
                                    } else {
                                      setLinkedFileIds((prev) => prev.filter((id) => id !== fl.id));
                                    }
                                  }}
                                  className="accent-emerald-500 rounded"
                                />
                                <span className="font-bold truncate">{fl.title}</span>
                              </div>
                              <span className="text-[10px] text-slate-400 shrink-0">
                                {fl.fileSize || 'ملف'}
                              </span>
                            </label>
                          );
                        })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* If Item is Exam: Option to link this exam directly to a video */}
            {itemType === 'exam' && (
              <div className="p-3.5 bg-slate-800/80 rounded-2xl border border-slate-700 space-y-1.5">
                <label className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                  <LinkIcon className="w-3.5 h-3.5 text-amber-400" />
                  <span>ربط هذا الاختبار بفيديو محدد (يظهر كمستطيل أسفل الفيديو 🔗):</span>
                </label>
                <select
                  value={attachToVideoId}
                  onChange={(e) => setAttachToVideoId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-700 text-white font-bold focus:border-amber-400 focus:outline-none cursor-pointer"
                >
                  <option value="">-- بدون ربط بفيديو (اختبار مستقل) --</option>
                  {items
                    .filter((i) => i.type === 'video')
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.title}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* If Item is File: Option to link this file directly to a video */}
            {itemType === 'file' && (
              <div className="p-3.5 bg-slate-800/80 rounded-2xl border border-slate-700 space-y-1.5">
                <label className="text-xs font-black text-emerald-300 flex items-center gap-1.5">
                  <LinkIcon className="w-3.5 h-3.5 text-emerald-400" />
                  <span>ربط هذا الملف بفيديو محدد (يظهر كمستطيل أسفل الفيديو 🔗):</span>
                </label>
                <select
                  value={attachToVideoId}
                  onChange={(e) => setAttachToVideoId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-700 text-white font-bold focus:border-emerald-400 focus:outline-none cursor-pointer"
                >
                  <option value="">-- بدون ربط بفيديو (ملف مستقل) --</option>
                  {items
                    .filter((i) => i.type === 'video')
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.title}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Exam options */}
            {itemType === 'exam' && (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300">
                    <input
                      type="radio"
                      name="examType"
                      checked={!isExternalExam}
                      onChange={() => setIsExternalExam(false)}
                      className="accent-amber-500"
                    />
                    <span>اختبار داخلي تفاعلي في المنصة</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300">
                    <input
                      type="radio"
                      name="examType"
                      checked={isExternalExam}
                      onChange={() => setIsExternalExam(true)}
                      className="accent-amber-500"
                    />
                    <span>رابط اختبار خارجي (Google Forms / منصة خارجية)</span>
                  </label>
                </div>

                {isExternalExam ? (
                  <div>
                    <label className="text-xs font-bold text-slate-400 block mb-1">رابط الاختبار الخارجي:</label>
                    <input
                      type="text"
                      name="custom_external_exam_url_protect"
                      id="external-exam-url-field"
                      autoComplete="off"
                      spellCheck={false}
                      data-lpignore="true"
                      data-1p-ignore="true"
                      placeholder="https://forms.gle/..."
                      value={itemUrl}
                      onChange={(e) => {
                        setItemUrl(e.target.value);
                        const preserved = itemTitleRef.current || pinnedTitleRef.current || (editingItem ? editingItem.title : '');
                        if (preserved) {
                          setItemTitle((prev) => prev || preserved);
                        }
                      }}
                      onPaste={(e) => {
                        const pasted = e.clipboardData?.getData('text')?.trim();
                        if (pasted) {
                          e.preventDefault();
                          setItemUrl(pasted);
                        }
                        const preserved = itemTitleRef.current || pinnedTitleRef.current || (editingItem ? editingItem.title : '');
                        if (preserved) {
                          setItemTitle((prev) => prev || preserved);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.preventDefault();
                      }}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
                    />
                  </div>
                ) : (
                  <div className="space-y-4 p-4 bg-slate-800/40 rounded-2xl border border-slate-700">
                    {/* Exam Benchmark (Target Percentage) and Duration (Time in Minutes) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-900 border border-slate-700/80">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                            <Target className="w-4 h-4" />
                            <span>الحد الأقصى / النسبة المستهدفة للنجاح والامتياز (%):</span>
                          </label>
                          <span className="text-xs font-mono font-black text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                            %{examTargetPercentage || 90}
                          </span>
                        </div>
                        <input
                          type="number"
                          min={10}
                          max={100}
                          value={examTargetPercentage}
                          onChange={(e) => setExamTargetPercentage(Number(e.target.value) || 90)}
                          placeholder="90"
                          className="w-full px-3 py-2 text-xs rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
                        />
                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                          {[70, 80, 85, 90, 95, 100].map((perc) => (
                            <button
                              key={perc}
                              type="button"
                              onClick={() => setExamTargetPercentage(perc)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                                examTargetPercentage === perc
                                  ? 'bg-amber-500 text-slate-950 font-black shadow'
                                  : 'bg-slate-800 text-slate-400 hover:text-white'
                              }`}
                            >
                              %{perc}
                            </button>
                          ))}
                        </div>
                        <p className="text-[10px] text-slate-400">
                          النسبة التي يعتبر الطالب عندها حقق المئوية أو هدف الاختبار بنجاح (مثلاً 90%).
                        </p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                            <Clock className="w-4 h-4" />
                            <span>وقت الاختبار بالدقائق (عند اختيار اختبار بوقت):</span>
                          </label>
                          <span className="text-xs font-mono font-black text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                            {examDurationMinutes || 15} دقيقة
                          </span>
                        </div>
                        <input
                          type="number"
                          min={1}
                          max={300}
                          value={examDurationMinutes}
                          onChange={(e) => setExamDurationMinutes(Number(e.target.value) || 15)}
                          placeholder="15"
                          className="w-full px-3 py-2 text-xs rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
                        />
                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                          {[5, 10, 15, 20, 30, 45, 60].map((mins) => (
                            <button
                              key={mins}
                              type="button"
                              onClick={() => setExamDurationMinutes(mins)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                                examDurationMinutes === mins
                                  ? 'bg-blue-500 text-white font-black shadow'
                                  : 'bg-slate-800 text-slate-400 hover:text-white'
                              }`}
                            >
                              {mins} دقيقة
                            </button>
                          ))}
                        </div>
                        <p className="text-[10px] text-slate-400">
                          المدة الزمنية التي يبدأ بها المؤقت التنازلي في حال اختار الطالب اختباراً بوقت.
                        </p>
                      </div>
                    </div>

                    {/* Exam File Upload & Import Box (رفع ملف أسئلة الاختبار) */}
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-950/40 via-slate-900 to-amber-950/30 border-2 border-amber-500/40 space-y-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                            <Upload className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-xs font-black text-amber-300 block">
                              رفع واستيراد ملف أسئلة الاختبار 📁 (JSON أو Excel أو CSV أو نص)
                            </span>
                            <span className="text-[10px] text-slate-400">
                              ارفع ملف يحتوي على الأسئلة والخيارات ليتم استيرادها فوراً وتجهيز الاختبار بنقرة واحدة
                            </span>
                          </div>
                        </div>

                        {itemFileName && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                            الملف الحالي: {itemFileName} ({itemFileSize})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5 flex-wrap">
                        <label className="flex-1 min-w-[200px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-black text-xs cursor-pointer shadow-lg shadow-amber-600/25 transition">
                          <Upload className="w-4 h-4" />
                          <span>اختر ملف الاختبار لرفعه واستيراده الآن 📤</span>
                          <input
                            id="exam-file-input"
                            type="file"
                            accept=".json,.csv,.txt,.xlsx,.xls,application/json,text/csv,text/plain"
                            onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
                            onChange={handleExamFileUpload}
                            className="hidden"
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => {
                            const template = JSON.stringify(
                              [
                                {
                                  questionText: "ما ناتج 15 + 25؟",
                                  options: ["40", "35", "50", "45"],
                                  correctOptionIndex: 0,
                                  explanation: "15 + 25 = 40"
                                },
                                {
                                  questionText: "طائر : ريش",
                                  options: ["خروف : صوف", "سمك : ماء", "أسد : غابة", "جمل : صحراء"],
                                  correctOptionIndex: 0,
                                  explanation: "علاقة غطاء خارجي"
                                }
                              ],
                              null,
                              2
                            );
                            const blob = new Blob([template], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'exam_template.json';
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="px-3 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 transition"
                          title="تحميل نموذج JSON لتعبئة الأسئلة عليه"
                        >
                          <Download className="w-3.5 h-3.5 inline ml-1 text-amber-400" />
                          <span>تحميل نموذج ملف الأسئلة</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <span className="text-xs font-bold text-amber-400">
                        الأسئلة الداخلية ({examQuestions.length})
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setExamQuestions((prev) => [
                            ...prev,
                            {
                              id: `q_${prev.length + 1}`,
                              questionText: '',
                              imageUrl: '',
                              options: ['', '', '', ''],
                              correctOptionIndex: 0,
                              explanation: '',
                            },
                          ])
                        }
                        className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 font-bold"
                      >
                        <Plus className="w-4 h-4" />
                        <span>إضافة سؤال جديد</span>
                      </button>
                    </div>

                    {examQuestions.map((q, qIdx) => (
                      <div key={q.id} className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-3 text-xs">
                        <div className="flex items-center justify-between font-bold text-white">
                          <span>سؤال {qIdx + 1}</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (examQuestions.length > 1) {
                                setExamQuestions((prev) => prev.filter((_, i) => i !== qIdx));
                              } else {
                                setExamQuestions([
                                  {
                                    id: `q_${Date.now()}`,
                                    questionText: '',
                                    imageUrl: '',
                                    options: ['', '', '', ''],
                                    correctOptionIndex: 0,
                                    explanation: '',
                                  },
                                ]);
                              }
                            }}
                            className="text-rose-400 hover:text-rose-300 flex items-center gap-1 font-bold transition text-xs"
                            title="حذف هذا السؤال"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{examQuestions.length > 1 ? 'حذف' : 'مسح السؤال'}</span>
                          </button>
                        </div>

                        <input
                          type="text"
                          placeholder="نص السؤال..."
                          value={q.questionText}
                          onChange={(e) => {
                            const val = e.target.value;
                            setExamQuestions((prev) => {
                              const next = [...prev];
                              next[qIdx].questionText = val;
                              return next;
                            });
                          }}
                          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white"
                        />

                        <div>
                          <label className="text-[10px] text-slate-400 block mb-1">
                            صورة توضيحية للسؤال (حفظ دائم):
                          </label>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleQuestionImageUpload(qIdx, e)}
                            className="w-full text-[11px] text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-[10px] file:bg-slate-800 file:text-slate-200"
                          />
                          {q.imageUrl && (
                            <div className="mt-1.5 max-w-[130px] rounded-lg border border-slate-700 overflow-hidden bg-slate-950">
                              <img src={q.imageUrl} alt="سؤال" className="h-16 w-full object-contain" />
                              <button
                                type="button"
                                onClick={() => {
                                  setExamQuestions((prev) => {
                                    const next = [...prev];
                                    next[qIdx].imageUrl = '';
                                    return next;
                                  });
                                }}
                                className="w-full bg-rose-950/90 hover:bg-rose-900 text-rose-300 text-[10px] py-1 text-center flex items-center justify-center gap-1 transition font-bold"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>حذف الصورة</span>
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-400 block">الخيارات (حدد الخيار الصحيح):</span>
                          {q.options.map((opt, oIdx) => (
                            <div key={oIdx} className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`correct_${qIdx}`}
                                checked={q.correctOptionIndex === oIdx}
                                onChange={() => {
                                  setExamQuestions((prev) => {
                                    const next = [...prev];
                                    next[qIdx].correctOptionIndex = oIdx;
                                    return next;
                                  });
                                }}
                                className="accent-emerald-500"
                              />
                              <input
                                type="text"
                                placeholder={`الخيار ${oIdx + 1}...`}
                                value={opt}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setExamQuestions((prev) => {
                                    const next = [...prev];
                                    next[qIdx].options[oIdx] = val;
                                    return next;
                                  });
                                }}
                                className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs"
                              />
                            </div>
                          ))}
                        </div>

                        <input
                          type="text"
                          placeholder="شرح الحل والتوضيح (اختياري)..."
                          value={q.explanation || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setExamQuestions((prev) => {
                              const next = [...prev];
                              next[qIdx].explanation = val;
                              return next;
                            });
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-800">
              {editingItem ? (
                <button
                  type="button"
                  onClick={() => {
                    handleDeleteItem(editingItem.id, editingItem.title, editingItem.type);
                  }}
                  className="px-3.5 py-2 text-xs bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 rounded-xl font-bold flex items-center gap-1.5 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف هذا المحتوى نهائياً</span>
                </button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingItem(false);
                    setEditingItem(null);
                  }}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => handleRequestSaveItem()}
                  disabled={isSavingItem || isUploadingServerFile}
                  className="px-6 py-2.5 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-xl shadow-lg shadow-emerald-600/30 transition flex items-center gap-1.5 cursor-pointer"
                >
                  {isUploadingServerFile ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>انتظر اكتمال رفع الملف ({serverUploadProgress}%)...</span>
                    </>
                  ) : isSavingItem ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>جاري الحفظ فوراً...</span>
                    </>
                  ) : (
                    <span>{editingItem ? 'حفظ التعديلات فوراً ✓' : 'حفظ ونشر المحتوى'}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: CONFIRM SAVE CHANGES (تأكيد حفظ التعديلات) ================= */}
      {isConfirmSaveOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border-2 border-emerald-500/70 rounded-3xl p-6 max-w-md w-full space-y-5 shadow-2xl shadow-emerald-500/25">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400">
                <ShieldCheck className="w-6 h-6 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">
                  تأكيد حفظ التعديلات في Firebase ⚡
                </h3>
                <p className="text-xs text-emerald-400 font-bold">
                  {editingItem ? 'تحديث وتعديل المحتوى فورياً' : 'نشر وحفظ جديد'}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3">
              <p className="text-sm font-black text-slate-100 text-center leading-relaxed">
                هل فعلاً تريد حفظ التعديلات؟
              </p>
              <div className="text-xs space-y-2.5 pt-2 border-t border-slate-800/80">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-slate-400 font-bold">العنوان:</span>
                  <span className="text-white font-black truncate max-w-[210px]">
                    {itemTitle.trim() || itemTitleRef.current.trim() || pinnedTitleRef.current.trim() || (editingItem ? editingItem.title : '') || 'بدون عنوان'}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-slate-400 font-bold">نوع المحتوى:</span>
                  <span className="text-emerald-400 font-black">
                    {itemType === 'video' ? '🎥 فيديو تعليمي' : itemType === 'exam' ? '📝 اختبار تفاعلي' : '📁 ملف / مستند'}
                  </span>
                </div>
                {itemType === 'video' && (
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-400 font-bold">العرض تحت الفيديو:</span>
                    <span className="text-emerald-400 font-black">
                      {showAsEducationalVideo ? 'فيديو تعليمي ✓' : `${itemDurationMinutes || 15} دقيقة`}
                    </span>
                  </div>
                )}
                {(itemUrl || itemFileName) && (
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-400 font-bold">الرابط / الملف:</span>
                    <span className="text-blue-300 font-mono text-[10px] truncate max-w-[210px]" dir="ltr">
                      {itemFileName || itemUrl}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmSaveOpen(false)}
                disabled={isSavingItem}
                className="px-4 py-2.5 text-xs text-slate-400 hover:text-white font-bold rounded-xl transition cursor-pointer"
              >
                إلغاء وتراجع
              </button>
              <button
                type="button"
                onClick={executeSaveContentItem}
                disabled={isSavingItem}
                className="px-6 py-2.5 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black rounded-xl shadow-lg shadow-emerald-600/30 transition flex items-center gap-2 cursor-pointer"
              >
                {isSavingItem ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري الحفظ في Firebase...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>نعم، احفظ التعديلات فوراً ✓</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: QUICK LINK EXAM AND FILE TO VIDEO ================= */}
      {isQuickLinkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-md overflow-y-auto">
          <div className="bg-slate-900 border-2 border-amber-500/50 rounded-3xl p-5 md:p-6 max-w-2xl w-full my-auto space-y-5 max-h-[92vh] overflow-y-auto shadow-2xl shadow-amber-500/10">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                  <LinkIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base md:text-lg font-black text-white">
                    ربط الاختبار والملف باسم الفيديو 🔗
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    اختر اسم الفيديو، ثم حدد الاختبار والملف ليظهرا كمستطيلين واضحين وجذابين تحت مشغل الفيديو للطلاب
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsQuickLinkModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 1. Select Video by Name */}
            <div className="space-y-1.5 bg-slate-800/60 p-4 rounded-2xl border border-slate-700/80">
              <label className="text-xs font-black text-white flex items-center gap-1.5">
                <Video className="w-4 h-4 text-blue-400" />
                <span>1. اختر اسم الفيديو المراد الربط به 🎥:</span>
              </label>
              <select
                value={quickLinkVideoId}
                onChange={(e) => handleSelectQuickLinkVideo(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs md:text-sm rounded-xl bg-slate-900 border border-slate-700 text-white font-bold focus:border-amber-400 focus:outline-none cursor-pointer"
              >
                <option value="">-- اضغط هنا لاختيار اسم الفيديو --</option>
                {items
                  .filter((i) => i.type === 'video')
                  .map((v) => {
                    const res = resources.find((r) => r.id === v.resourceId);
                    return (
                      <option key={v.id} value={v.id}>
                        🎥 {v.title} {res ? `(${res.title})` : ''}
                      </option>
                    );
                  })}
              </select>
              {quickLinkVideoId && (
                <div className="text-[11px] text-blue-300 font-bold pt-1">
                  الفيديو المحدد حالياً: {items.find((i) => i.id === quickLinkVideoId)?.title}
                </div>
              )}
            </div>

            {/* 2. Select Exam by Name */}
            <div className="space-y-1.5 bg-slate-800/60 p-4 rounded-2xl border border-slate-700/80">
              <label className="text-xs font-black text-white flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-400" />
                <span>2. اختر اسم الاختبار المطلوب ربطه بهذا الفيديو 📝:</span>
              </label>
              <select
                value={quickLinkExamId}
                onChange={(e) => setQuickLinkExamId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs md:text-sm rounded-xl bg-slate-900 border border-slate-700 text-amber-300 font-bold focus:border-amber-400 focus:outline-none cursor-pointer"
              >
                <option value="">-- بدون اختبار (أو اختر اسم الاختبار للربط) --</option>
                {items
                  .filter((i) => i.type === 'exam')
                  .map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      📝 {ex.title} ({ex.questions?.length || 0} أسئلة)
                    </option>
                  ))}
              </select>
              {quickLinkExamId && (
                <div className="flex items-center justify-between text-[11px] text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/20 font-bold mt-1">
                  <span>الاختبار المختار للربط: {items.find((i) => i.id === quickLinkExamId)?.title}</span>
                  <button
                    type="button"
                    onClick={() => setQuickLinkExamId('')}
                    className="text-rose-400 hover:text-rose-300 text-[10px] underline cursor-pointer"
                  >
                    إلغاء الربط
                  </button>
                </div>
              )}
            </div>

            {/* 3. Select File by Name */}
            <div className="space-y-1.5 bg-slate-800/60 p-4 rounded-2xl border border-slate-700/80">
              <label className="text-xs font-black text-white flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-emerald-400" />
                <span>3. اختر اسم الملف المطلوب ربطه بهذا الفيديو 📁:</span>
              </label>
              <select
                value={quickLinkFileId}
                onChange={(e) => setQuickLinkFileId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs md:text-sm rounded-xl bg-slate-900 border border-slate-700 text-emerald-300 font-bold focus:border-emerald-400 focus:outline-none cursor-pointer"
              >
                <option value="">-- بدون ملف (أو اختر اسم الملف للربط) --</option>
                {items
                  .filter((i) => i.type === 'file')
                  .map((fl) => (
                    <option key={fl.id} value={fl.id}>
                      📁 {fl.title} ({fl.fileSize || 'PDF'})
                    </option>
                  ))}
              </select>
              {quickLinkFileId && (
                <div className="flex items-center justify-between text-[11px] text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20 font-bold mt-1">
                  <span>الملف المختار للربط: {items.find((i) => i.id === quickLinkFileId)?.title}</span>
                  <button
                    type="button"
                    onClick={() => setQuickLinkFileId('')}
                    className="text-rose-400 hover:text-rose-300 text-[10px] underline cursor-pointer"
                  >
                    إلغاء الربط
                  </button>
                </div>
              )}
            </div>

            {/* Live Preview of the 2 Rectangles */}
            {(quickLinkExamId || quickLinkFileId) && (
              <div className="p-4 rounded-2xl bg-black/50 border border-slate-800 space-y-2">
                <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>معاينة المستطيلين كما يظهران للطالب أسفل الفيديو:</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {quickLinkExamId && (
                    <div className="rounded-2xl p-4 bg-gradient-to-br from-amber-950/70 via-slate-900 to-amber-900/40 border-2 border-amber-500 text-amber-200 text-xs font-bold space-y-2 shadow-lg shadow-amber-500/10">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30">
                          اختبار تفاعلي مربوط 📝
                        </span>
                      </div>
                      <div>
                        <div className="text-[10px] text-amber-400/80">اسم الاختبار:</div>
                        <div className="text-white font-black text-sm truncate">
                          {items.find((i) => i.id === quickLinkExamId)?.title}
                        </div>
                      </div>
                      <div className="py-2 text-center rounded-xl bg-amber-500 text-slate-950 font-black text-xs shadow">
                        بدأ الاختبار ⚡
                      </div>
                    </div>
                  )}
                  {quickLinkFileId && (
                    <div className="rounded-2xl p-4 bg-gradient-to-br from-emerald-950/70 via-slate-900 to-teal-900/40 border-2 border-emerald-500 text-emerald-200 text-xs font-bold space-y-2 shadow-lg shadow-emerald-500/10">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
                          ملف ملخص مربوط 📁
                        </span>
                      </div>
                      <div>
                        <div className="text-[10px] text-emerald-400/80">اسم الملف:</div>
                        <div className="text-white font-black text-sm truncate">
                          {items.find((i) => i.id === quickLinkFileId)?.title}
                        </div>
                      </div>
                      <div className="py-2 text-center rounded-xl bg-emerald-500 text-slate-950 font-black text-xs shadow">
                        الانتقال للملف وفتحه 🔗
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsQuickLinkModalOpen(false)}
                className="px-4 py-2.5 text-xs text-slate-400 hover:text-white"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveQuickLink}
                disabled={!quickLinkVideoId || isSavingQuickLink}
                className="px-6 py-2.5 text-xs md:text-sm bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 text-slate-950 font-black rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center gap-2 cursor-pointer"
              >
                {isSavingQuickLink ? 'جاري حفظ الربط...' : 'حفظ وتطبيق الربط الآن ⚡'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: UNIFIED DELETE CONFIRMATION (SECTIONS, RESOURCES, CONTENT ITEMS) ================= */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl text-right space-y-6">
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl w-fit mx-auto">
              <Trash2 className="w-8 h-8" />
            </div>

            <div className="text-center space-y-2">
              <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 inline-block">
                {deleteTarget.type === 'section'
                  ? 'حذف قسم رئيسي'
                  : deleteTarget.type === 'resource'
                  ? 'حذف مصدر تعليمي'
                  : `حذف ${deleteTarget.itemType === 'video' ? 'فيديو' : deleteTarget.itemType === 'exam' ? 'اختبار' : 'ملف'}`}
              </span>
              <h3 className="text-xl font-black text-white">
                هل أنت متأكد من حذف: "{deleteTarget.title}"؟
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed px-2">
                {deleteTarget.subtitle || 'هذا الإجراء نهائي ولا يمكن التراجع عنه بعد تنفيذه.'}
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <button
                type="button"
                disabled={isDeletingTarget}
                onClick={executeDeleteTarget}
                className="w-full py-3.5 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-black text-xs md:text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-rose-600/30"
              >
                {isDeletingTarget ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري الحذف نهائياً...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>نعم، حذف نهائي الآن 🗑️</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={isDeletingTarget}
                onClick={() => setDeleteTarget(null)}
                className="w-full py-3 rounded-2xl text-xs font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition"
              >
                إلغاء التراجع
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD / EDIT COURSE ================= */}
      {isAddingCourse && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-2xl w-full shadow-2xl text-right my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                  <BookOpen className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg md:text-xl font-black text-white">
                    {editingCourse ? 'تعديل بيانات الكورس' : 'إضافة كورس تدريبي جديد'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    يمكنك تحديد صورة الكورس، حالته (مفتوح أو مقفل)، وسعره وصور الحسابات البنكية ورسالة الدفع
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddingCourse(false);
                  setEditingCourse(null);
                }}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCourse} className="space-y-5 pt-4">
              {/* Course Title */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">اسم الكورس التدريبي: *</label>
                <input
                  type="text"
                  required
                  value={courseFormTitle}
                  onChange={(e) => setCourseFormTitle(e.target.value)}
                  placeholder="مثال: دورة القدرات العامة المكثفة 2025"
                  className="w-full px-4 py-3 rounded-2xl bg-slate-800 border border-slate-700 text-white text-xs md:text-sm focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Course Description */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">وصف الكورس:</label>
                <textarea
                  rows={2}
                  value={courseFormDesc}
                  onChange={(e) => setCourseFormDesc(e.target.value)}
                  placeholder="وصف مختصر لمحتويات ومميزات الكورس..."
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-800 border border-slate-700 text-white text-xs md:text-sm focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Course Cover Image */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300">صورة غلاف الكورس:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={courseFormImage}
                    onChange={(e) => setCourseFormImage(e.target.value)}
                    placeholder="رابط الصورة (URL) أو ارفع من جهازك..."
                    className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-purple-500"
                  />
                  <label className="px-3 py-2.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0 transition">
                    <Upload className="w-4 h-4" />
                    <span>{isUploadingCourseCover ? 'جاري التحميل...' : 'رفع صورة'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleCourseFileUpload(e, 'cover')}
                    />
                  </label>
                </div>
                {courseFormImage && (
                  <div className="relative w-full h-32 rounded-xl overflow-hidden border border-slate-700 bg-slate-950 mt-2">
                    <img src={courseFormImage} alt="معاينة الغلاف" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>

              {/* Course Status: Free / Open vs Locked */}
              <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    {courseFormIsLocked ? (
                      <span className="text-rose-400 flex items-center gap-1">
                        <Lock className="w-4 h-4" /> كورس مقفول (مدفوع باشتراك)
                      </span>
                    ) : (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <Unlock className="w-4 h-4" /> كورس مفتوح (متاح ومجاني)
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {courseFormIsLocked
                      ? 'عند قفل الكورس، يظهر للطالب تفاصيل السعر وصور أرقام الحسابات البنكية ورسالة التحويل'
                      : 'عندما يكون الكورس مفتوحاً، يمكن للطالب تفعيله مباشرة والدخول للمحتوى'}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={courseFormIsLocked}
                    onChange={(e) => setCourseFormIsLocked(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-14 h-7 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-rose-600"></div>
                </label>
              </div>

              {/* Locked Course Details (Price, Bank 1, Bank 2, Payment Message) */}
              {courseFormIsLocked && (
                <div className="space-y-4 p-4 rounded-2xl bg-rose-500/5 border border-rose-500/20">
                  <div className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4" />
                    <span>إعدادات الدفع والحسابات البنكية للكورس المقفول</span>
                  </div>

                  {/* Price */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-300">سعر الكورس:</label>
                    <input
                      type="text"
                      value={courseFormPrice}
                      onChange={(e) => setCourseFormPrice(e.target.value)}
                      placeholder="مثال: 199 ريال سعودي"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs md:text-sm focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  {/* Bank Account Image 1 */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-300">صورة الحساب البنكي 1 (رقم الحساب / الآيبان):</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="url"
                        value={courseFormBank1}
                        onChange={(e) => setCourseFormBank1(e.target.value)}
                        placeholder="رابط صورة الحساب 1 أو ارفعها من جهازك..."
                        className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-purple-500"
                      />
                      <label className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0 transition">
                        <Upload className="w-4 h-4" />
                        <span>{isUploadingBank1 ? 'جاري التحميل...' : 'رفع صورة 1'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleCourseFileUpload(e, 'bank1')}
                        />
                      </label>
                    </div>
                    {courseFormBank1 && (
                      <div className="relative w-full max-h-40 rounded-xl overflow-hidden border border-slate-700 bg-slate-950 mt-1">
                        <img src={courseFormBank1} alt="صورة الحساب 1" className="w-full h-auto object-contain max-h-40" />
                      </div>
                    )}
                  </div>

                  {/* Bank Account Image 2 */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-300">صورة الحساب البنكي 2 (حساب إضافي أو بنك آخر):</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="url"
                        value={courseFormBank2}
                        onChange={(e) => setCourseFormBank2(e.target.value)}
                        placeholder="رابط صورة الحساب 2 أو ارفعها من جهازك..."
                        className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-purple-500"
                      />
                      <label className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0 transition">
                        <Upload className="w-4 h-4" />
                        <span>{isUploadingBank2 ? 'جاري التحميل...' : 'رفع صورة 2'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleCourseFileUpload(e, 'bank2')}
                        />
                      </label>
                    </div>
                    {courseFormBank2 && (
                      <div className="relative w-full max-h-40 rounded-xl overflow-hidden border border-slate-700 bg-slate-950 mt-1">
                        <img src={courseFormBank2} alt="صورة الحساب 2" className="w-full h-auto object-contain max-h-40" />
                      </div>
                    )}
                  </div>

                  {/* Payment Message */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-300">رسالة تظهر تحت صورتي الحساب:</label>
                    <textarea
                      rows={2}
                      value={courseFormPaymentMessage}
                      onChange={(e) => setCourseFormPaymentMessage(e.target.value)}
                      placeholder="اكتب التعليمات والرسالة التي تظهر للطالب أسفل صور الحساب..."
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              )}

              {/* Order */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">ترتيب الظهور:</label>
                <input
                  type="number"
                  min={1}
                  value={courseFormOrder}
                  onChange={(e) => setCourseFormOrder(Number(e.target.value))}
                  className="w-28 px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingCourse(false);
                    setEditingCourse(null);
                  }}
                  className="px-4 py-2.5 text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSavingCourse}
                  className="px-6 py-2.5 text-xs md:text-sm bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-purple-600/30 transition flex items-center gap-2 cursor-pointer"
                >
                  {isSavingCourse ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>جاري الحفظ...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>{editingCourse ? 'حفظ تعديلات الكورس' : 'إضافة الكورس الآن 📚'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: DELETE COURSE CONFIRMATION ================= */}
      {deletingCourse && (() => {
        const matchedSecs = sections.filter(
          (s) => s.courseId === deletingCourse.id || (deletingCourse.id === 'course_default_1' && !s.courseId)
        );
        const secIds = new Set(matchedSecs.map((s) => s.id));
        const matchedRes = resources.filter(
          (r) => secIds.has(r.sectionId) || (r as any).courseId === deletingCourse.id
        );
        const resIds = new Set(matchedRes.map((r) => r.id));
        const matchedItems = items.filter(
          (item) => resIds.has(item.resourceId) || (item as any).courseId === deletingCourse.id
        );
        const videosCount = matchedItems.filter((i) => i.type === 'video').length;
        const examsAndFilesCount = matchedItems.filter((i) => i.type !== 'video').length;

        return (
          <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl text-right space-y-5">
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl w-fit mx-auto">
                <Trash2 className="w-8 h-8" />
              </div>

              <div className="text-center space-y-2">
                <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 inline-block">
                  حذف كورس تعليمي نهائياً
                </span>
                <h3 className="text-xl font-black text-white">
                  هل أنت متأكد من حذف كورس "{deletingCourse.title}"؟
                </h3>
              </div>

              {/* Cascade Deletion Summary */}
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs space-y-2 text-right">
                <p className="font-black text-rose-400 flex items-center gap-1.5 justify-start">
                  <span>⚠️</span>
                  <span>تنبيه: الحذف الشامل والنهائي</span>
                </p>
                <p className="leading-relaxed text-[11px] text-slate-300">
                  سيتم حذف الكورس نهائياً ولن يعود أبداً، مع حذف جميع محتوياته التالية تلقائياً:
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1 font-bold text-[11px] text-slate-200">
                  <div className="p-2 rounded-xl bg-slate-800/90 border border-slate-700/80 flex items-center justify-between">
                    <span>الأقسام:</span>
                    <span className="text-amber-400 font-mono font-black">{matchedSecs.length}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-800/90 border border-slate-700/80 flex items-center justify-between">
                    <span>المصادر:</span>
                    <span className="text-amber-400 font-mono font-black">{matchedRes.length}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-800/90 border border-slate-700/80 flex items-center justify-between">
                    <span>الفيديوهات:</span>
                    <span className="text-blue-400 font-mono font-black">{videosCount}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-800/90 border border-slate-700/80 flex items-center justify-between">
                    <span>الاختبارات والملفات:</span>
                    <span className="text-emerald-400 font-mono font-black">{examsAndFilesCount}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-1">
                <button
                  type="button"
                  disabled={isDeletingCourseInProgress}
                  onClick={() => handleDeleteCourse(deletingCourse.id)}
                  className="w-full py-3.5 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-black text-xs md:text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-rose-600/30 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>
                    {isDeletingCourseInProgress
                      ? 'جارٍ حذف الكورس ومحتوياته نهائياً...'
                      : 'نعم، حذف الكورس ومحتوياته نهائياً 🗑️'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isDeletingCourseInProgress}
                  onClick={() => setDeletingCourse(null)}
                  className="w-full py-3 rounded-2xl text-xs font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
                >
                  إلغاء والتراجع
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ================= MODAL: STUDENT COURSE ACTIVATION ================= */}
      {studentForCourseActivation && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl text-right space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base md:text-lg font-black text-white">
                    تفعيل كورس للطالب: {studentForCourseActivation.name}
                  </h3>
                  <p className="text-xs text-slate-400">
                    اختر الكورسات المراد تفعيلها لهذا الطالب ثم اضغط "تم" لفتح المنصة له
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStudentForCourseActivation(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-300">
                حدد الكورسات المفتوحة والمصرح لهذا الطالب بدخولها:
              </label>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {courses.map((crs) => {
                  const isChecked = selectedCoursesForStudent.includes(crs.id);
                  return (
                    <label
                      key={crs.id}
                      className={`flex items-center justify-between p-3.5 rounded-2xl border transition cursor-pointer ${
                        isChecked
                          ? 'bg-emerald-500/15 border-emerald-500/50 text-white'
                          : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCoursesForStudent((prev) => [...prev, crs.id]);
                            } else {
                              setSelectedCoursesForStudent((prev) => prev.filter((id) => id !== crs.id));
                            }
                          }}
                          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 focus:ring-offset-slate-900 cursor-pointer"
                        />
                        <div>
                          <div className="font-bold text-xs md:text-sm flex items-center gap-2">
                            <span>{crs.title}</span>
                            {crs.isLocked ? (
                              <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.2 rounded">
                                مقفل ({crs.price || 'مدفوع'})
                              </span>
                            ) : (
                              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded">
                                مفتوح
                              </span>
                            )}
                          </div>
                          {crs.description && (
                            <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{crs.description}</p>
                          )}
                        </div>
                      </div>

                      {crs.imageUrl && (
                        <img
                          src={crs.imageUrl}
                          alt={crs.title}
                          className="w-10 h-10 rounded-xl object-cover border border-slate-700 shrink-0"
                        />
                      )}
                    </label>
                  );
                })}
              </div>

              <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px] leading-relaxed">
                💡 عند الضغط على <strong>"تم"</strong>، سيتم تفعيل الكورسات المحددة في حساب الطالب وإلغاء أي قفل فردي كان عليه، وتفتح له المنصة فوراً وتستمر مفتوحة له حتى تقوم بقفلها عليه مرة ثانية.
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                disabled={isSavingStudentActivation}
                onClick={handleConfirmStudentCourseActivation}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-black text-xs md:text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 cursor-pointer"
              >
                {isSavingStudentActivation ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري تفعيل الكورسات وفتح المنصة...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    <span>تم ✓ (تفعيل الكورس وفتح المنصة للطالب)</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={isSavingStudentActivation}
                onClick={() => setStudentForCourseActivation(null)}
                className="w-full py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: ISSUE OFFICIAL CERTIFICATE ================= */}
      {issuingCertStudent && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-amber-500/40 rounded-3xl p-6 md:p-8 max-w-xl w-full shadow-2xl text-right space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  <Award className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base md:text-lg font-black text-white flex items-center gap-2">
                    <span>إصدار شهادة تفوق معتمدة 📜</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      تصميم شيك
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    تثبيت شهادة رسمية بالاسم المسجل في المنصة مع الشعار والتوقيع
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIssuingCertStudent(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Registered Student Name (Strictly from the student account) */}
              <div className="space-y-1.5 p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-[11px] font-bold text-slate-400 block">
                  اسم الطالب المسجل في المنصة (يصدر في الشهادة بهذا الاسم):
                </span>
                <div className="text-base font-black text-amber-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{issuingCertStudent.name}</span>
                  <span className="text-xs text-slate-500 font-normal">({issuingCertStudent.email})</span>
                </div>
              </div>

              {/* Course Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">
                  اسم الدورة / الكورس الصادرة له الشهادة:
                </label>
                <input
                  type="text"
                  value={certFormCourse}
                  onChange={(e) => setCertFormCourse(e.target.value)}
                  placeholder="مثال: دورة القدرات العامة الشاملة (محوسب وورقي)"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs md:text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Grade / Appreciation */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">
                  التقدير أو النسبة:
                </label>
                <input
                  type="text"
                  value={certFormGrade}
                  onChange={(e) => setCertFormGrade(e.target.value)}
                  placeholder="مثال: ممتاز مرتفع بنسبة 100%"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs md:text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Platform Supervisor / Director Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 block">
                    توقيع باسم المشرف / المدير:
                  </label>
                  <input
                    type="text"
                    value={certFormDirector}
                    onChange={(e) => setCertFormDirector(e.target.value)}
                    placeholder="أ. رعد / المشرف العام"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 block">
                    اسم المنصة:
                  </label>
                  <input
                    type="text"
                    value={certFormPlatform}
                    onChange={(e) => setCertFormPlatform(e.target.value)}
                    placeholder="منصة أقسام رعد للقدرات"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Certificate Statement / Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">
                  عبارة التقدير والتكريم في الشهادة:
                </label>
                <textarea
                  rows={2}
                  value={certFormNotes}
                  onChange={(e) => setCertFormNotes(e.target.value)}
                  placeholder="اكتب عبارة التقدير..."
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
                <Sparkles className="w-5 h-5 shrink-0 text-amber-400" />
                <span>
                  الشهادة تشمل شعار المنصة المرفوع تلقائياً، والختم الملكي، وباركود التحقق وكود التسلسل الرسمي.
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                disabled={isIssuingCert}
                onClick={handleConfirmIssueCertificate}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 disabled:opacity-50 text-slate-950 font-black text-xs md:text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/30 cursor-pointer"
              >
                {isIssuingCert ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جارٍ إصدار وتثبيت الشهادة في حساب الطالب...</span>
                  </>
                ) : (
                  <>
                    <Award className="w-5 h-5" />
                    <span>اعتماد وإصدار الشهادة فورياً 🎓</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={isIssuingCert}
                onClick={() => setIssuingCertStudent(null)}
                className="w-full py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: PREVIEW & PRINT OFFICIAL CERTIFICATE ================= */}
      {previewCertModalData && (
        <CertificateModal
          isOpen={true}
          onClose={() => setPreviewCertModalData(null)}
          certificate={previewCertModalData}
          logoUrl={systemSettings.logoUrl}
          primaryColor={systemSettings.activeTheme?.primary || '#2563eb'}
        />
      )}
    </div>
  );
};

