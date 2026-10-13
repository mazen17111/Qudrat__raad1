import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import {
  StudentUser,
  SystemSettings,
  ThemeConfig,
  SectionItem,
  ResourceItem,
  ContentItem,
  ExamQuestion
} from '../types';
import { db, THEME_PRESETS, DEFAULT_SETTINGS } from '../firebase';
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
  const [activeTab, setActiveTab] = useState<'students' | 'platform_lock' | 'announcement' | 'live_stream' | 'content' | 'designs'>('students');

  // Students list from Firestore
  const [students, setStudents] = useState<StudentUser[]>([]);
  
  // Student Days Modal state
  const [studentForDaysModal, setStudentForDaysModal] = useState<StudentUser | null>(null);
  const [selectedDaysAmount, setSelectedDaysAmount] = useState<number>(30);

  // Student Individual Block Modal state
  const [studentForBlockModal, setStudentForBlockModal] = useState<StudentUser | null>(null);
  const [blockReasonType, setBlockReasonType] = useState<'maintenance' | 'subscription' | 'supervisor'>('supervisor');
  const [blockCustomMessage, setBlockCustomMessage] = useState<string>('');

  // Deletion modal for students
  const [deletingStudent, setDeletingStudent] = useState<StudentUser | null>(null);

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

  // Content Management: Sections, Resources, Items
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [selectedResourceId, setSelectedResourceId] = useState<string>('');

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

  // Item Add & Edit Modals
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<ContentItem | null>(null);
  const [itemType, setItemType] = useState<'video' | 'file' | 'exam'>('video');
  const [itemTitle, setItemTitle] = useState('');
  const [itemDesc, setItemDesc] = useState('');
  const [itemUrl, setItemUrl] = useState('');
  const [itemFileData, setItemFileData] = useState('');
  const [itemFileName, setItemFileName] = useState('');
  const [itemFileSize, setItemFileSize] = useState('');
  const [isExternalExam, setIsExternalExam] = useState(false);
  const [examDurationMinutes, setExamDurationMinutes] = useState<number>(15);
  const [examTargetPercentage, setExamTargetPercentage] = useState<number>(90);

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

  // Listen to students in real-time
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      const list: StudentUser[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as StudentUser);
      });
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setStudents(list);
    });
    return () => unsub();
  }, []);

  // Listen to sections, resources, items in real-time
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
      setItems(list);
    });

    return () => {
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
  }, [systemSettings]);

  const notifySave = (msg = 'تم الحفظ بنجاح!') => {
    setSaveStatus(msg);
    setTimeout(() => setSaveStatus(null), 3000);
  };

  // 1. Set Subscription Days for student (with Quick buttons & Open Unlimited)
  const handleSaveStudentDays = async (isUnlimited = false) => {
    if (!studentForDaysModal) return;
    try {
      if (isUnlimited) {
        await updateDoc(doc(db, 'users', studentForDaysModal.id), {
          isUnlimited: true,
          daysAllowed: 0,
          subscriptionStartDate: new Date().toISOString(),
          subscriptionEndDate: null,
        });
        notifySave(`تم إلغاء الاشتراك وفتح المنصة للطالب "${studentForDaysModal.name}" بشكل مفتوح دائم ⚡`);
      } else {
        const days = Number(selectedDaysAmount);
        const startDate = new Date().toISOString();
        const endDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

        await updateDoc(doc(db, 'users', studentForDaysModal.id), {
          isUnlimited: false,
          daysAllowed: days,
          subscriptionStartDate: startDate,
          subscriptionEndDate: endDate,
        });
        notifySave(`تم تحديد ${days} يوماً للاشتراك للطالب "${studentForDaysModal.name}" بنجاح!`);
      }

      setStudentForDaysModal(null);
    } catch (err) {
      console.error('Error updating days:', err);
      notifySave('حدث خطأ أثناء حفظ الأيام');
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

      await deleteDoc(doc(db, 'users', deletingStudent.id));
      setStudents((prev) => prev.filter((st) => st.id !== deletingStudent.id));
      setDeletingStudent(null);
      notifySave(isPermanent ? 'تم الحذف الدائم وحظر البريد بنجاح 🗑️' : 'تم الحذف العادي للحساب بنجاح 🗑️');
    } catch (err) {
      console.error('Error deleting student:', err);
      notifySave('حدث خطأ أثناء حذف الحساب');
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

  // ================= CONTENT CRUD =================
  // 9. Section CRUD
  const handleCreateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSectionTitle.trim()) return;
    try {
      const newRef = doc(collection(db, 'sections'));
      await setDoc(newRef, {
        id: newRef.id,
        title: newSectionTitle.trim(),
        description: newSectionDesc.trim(),
        order: Number(newSectionOrder) || sections.length + 1,
        createdAt: new Date().toISOString(),
      });
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
      });
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
    if (!newResourceTitle.trim() || !selectedSectionId) return;
    try {
      const newRef = doc(collection(db, 'resources'));
      const secResources = resources.filter((r) => r.sectionId === selectedSectionId);
      await setDoc(newRef, {
        id: newRef.id,
        sectionId: selectedSectionId,
        title: newResourceTitle.trim(),
        description: newResourceDesc.trim(),
        order: Number(newResourceOrder) || secResources.length + 1,
        createdAt: new Date().toISOString(),
      });
      setNewResourceTitle('');
      setNewResourceDesc('');
      setNewResourceOrder(secResources.length + 2);
      setIsAddingResource(false);
      setSelectedResourceId(newRef.id);
      notifySave('تم إضافة المصدر بنجاح');
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

  // 11. Content Item CRUD
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setItemFileName(file.name);
    setItemFileSize(`${(file.size / (1024 * 1024)).toFixed(2)} MB`);

    const reader = new FileReader();
    reader.onload = (event) => {
      setItemFileData(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleQuestionImageUpload = (qIdx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
            next[qIdx].imageUrl = compressedUri;
            return next;
          });
        }
      };
      img.src = rawData;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveContentItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemTitle.trim() || !selectedResourceId) {
      notifySave('يرجى تحديد المصدر وكتابة عنوان العنصر');
      return;
    }

    try {
      const targetId = editingItem ? editingItem.id : doc(collection(db, 'content_items')).id;
      const basePayload: any = {
        id: targetId,
        resourceId: selectedResourceId,
        type: itemType,
        title: itemTitle.trim(),
        description: itemDesc.trim(),
        createdAt: editingItem ? editingItem.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (itemType === 'video') {
        basePayload.url = itemUrl || itemFileData || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
        basePayload.linkedExamIds = linkedExamIds;
        basePayload.linkedFileIds = linkedFileIds;
      } else if (itemType === 'file') {
        basePayload.url = itemUrl || itemFileData;
        basePayload.fileName = itemFileName || 'document.pdf';
        basePayload.fileSize = itemFileSize || '1.5 MB';
      } else if (itemType === 'exam') {
        basePayload.isExternal = isExternalExam;
        if (isExternalExam) {
          basePayload.url = itemUrl;
        } else {
          // Process ALL questions: ensure questions are preserved even if only image or choices were added
          const cleanQuestions: ExamQuestion[] = examQuestions.map((q, idx) => {
            const text = (q.questionText || '').trim();
            const image = (q.imageUrl || '').trim();
            const opts = (Array.isArray(q.options) && q.options.length > 0)
              ? q.options.map((opt, oIdx) => (opt || '').trim() || `الخيار ${['أ', 'ب', 'ج', 'د'][oIdx] || oIdx + 1}`)
              : ['الخيار أ', 'الخيار ب', 'الخيار ج', 'الخيار د'];

            return {
              id: q.id || `q_${idx + 1}`,
              questionText: text || (image ? `سؤال رقم ${idx + 1} (انظر الصورة المرفقة)` : `سؤال رقم ${idx + 1}`),
              imageUrl: image,
              options: opts,
              correctOptionIndex: typeof q.correctOptionIndex === 'number' ? q.correctOptionIndex : 0,
              explanation: (q.explanation || '').trim(),
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

      await setDoc(doc(db, 'content_items', targetId), basePayload);
      setIsAddingItem(false);
      setEditingItem(null);
      setItemTitle('');
      setItemDesc('');
      setItemUrl('');
      setItemFileData('');
      setItemFileName('');
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
      notifySave(editingItem ? 'تم تعديل المحتوى وحفظ الأسئلة بنجاح!' : 'تمت إضافة المحتوى وحفظ جميع الأسئلة بنجاح!');
    } catch (err) {
      console.error(err);
      notifySave('حدث خطأ أثناء حفظ المحتوى');
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

  const handleOpenEditItem = (it: ContentItem) => {
    setEditingItem(it);
    setItemType(it.type);
    setItemTitle(it.title);
    setItemDesc(it.description || '');
    setItemUrl(it.url || '');
    setItemFileName(it.fileName || '');
    setItemFileSize(it.fileSize || '');
    setIsExternalExam(it.isExternal || false);
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

  const currentResources = resources.filter((r) => r.sectionId === selectedSectionId);
  const currentItems = items.filter((i) => i.resourceId === selectedResourceId);

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

        {/* Status notification toast */}
        {saveStatus && (
          <div className="px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-bounce">
            <CheckCircle2 className="w-4 h-4" />
            <span>{saveStatus}</span>
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
        </div>
      </div>

      {/* Main Tab Content */}
      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
        {/* ================= TAB 1: STUDENTS ================= */}
        {activeTab === 'students' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl md:text-2xl font-black text-white">الطلاب المسجلين وإدارة الاشتراكات</h2>
                <p className="text-xs text-slate-400 mt-1">
                  تحديد الأيام مع وصول سريع (شهر، شهرين، 6 شهور، سنة)، إلغاء الاشتراك وفتح دائم، وقفل مخصص لكل طالب بصيانة أو واتساب أو إشعار مشرف.
                </p>
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
                      <th className="p-4">حالة الاشتراك والشريط</th>
                      <th className="p-4">تحديد الأيام</th>
                      <th className="p-4">قفل المنصة على الطالب</th>
                      <th className="p-4 text-center">إجراءات الحساب</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {students.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-500">
                          لا يوجد طلاب مسجلين حتى الآن.
                        </td>
                      </tr>
                    ) : (
                      students.map((st) => {
                        let daysLeft = 0;
                        let elapsedDays = 0;
                        if (st.subscriptionEndDate) {
                          const diffMs = new Date(st.subscriptionEndDate).getTime() - Date.now();
                          daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
                          elapsedDays = Math.max(0, (st.daysAllowed || 30) - daysLeft);
                        }

                        return (
                          <tr key={st.id} className="hover:bg-slate-800/40 transition">
                            {/* Name & status badges */}
                            <td className="p-4">
                              <div className="font-bold text-white flex items-center gap-2">
                                <span>{st.name}</span>
                                {st.isUnlimited && (
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
                              <span className="text-[11px] text-slate-400">
                                انضم: {new Date(st.createdAt).toLocaleDateString('ar-SA')}
                              </span>
                            </td>

                            {/* Email */}
                            <td className="p-4 text-slate-300 font-mono text-xs">{st.email}</td>

                            {/* Subscription Days Status */}
                            <td className="p-4">
                              {st.isUnlimited ? (
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
                                  غير محدد (العداد لا يظهر حتى التحديد)
                                </span>
                              )}
                            </td>

                            {/* Open Days Picker Modal */}
                            <td className="p-4">
                              <button
                                onClick={() => {
                                  setStudentForDaysModal(st);
                                  setSelectedDaysAmount(st.daysAllowed || 30);
                                }}
                                className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 transition flex items-center gap-1"
                              >
                                <Calendar className="w-3.5 h-3.5" />
                                <span>تحديد الأيام</span>
                              </button>
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
                                className="p-2 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition"
                                title="حذف حساب الطالب"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

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

            {/* Content Structure Navigator */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Sections Column */}
              <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs font-bold text-slate-400">
                  <span>الأقسام الرئيسية ({sections.length})</span>
                </div>

                <div className="space-y-2">
                  {sections.map((sec, sIdx) => (
                    <div
                      key={sec.id}
                      className={`w-full p-3 rounded-2xl border text-xs font-bold transition flex items-center justify-between gap-2 group ${
                        selectedSectionId === sec.id
                          ? 'text-white shadow-md'
                          : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                      }`}
                      style={
                        selectedSectionId === sec.id
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
                          {sections.map((_, i) => (
                            <option key={i + 1} value={i + 1}>
                              {i + 1}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={() => {
                          setSelectedSectionId(sec.id);
                          const firstRes = resources.find((r) => r.sectionId === sec.id);
                          if (firstRes) setSelectedResourceId(firstRes.id);
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
                  ))}
                </div>
              </div>

              {/* Resources Column */}
              <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs font-bold text-slate-400">
                  <span>المصادر التابعة للقسم</span>
                  {selectedSectionId && (
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
                  {currentResources.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500">لا توجد مصادر في هذا القسم</div>
                  ) : (
                    currentResources.map((res, rIdx) => (
                      <div
                        key={res.id}
                        className={`w-full p-3 rounded-2xl border text-xs font-bold transition flex items-center justify-between gap-2 group ${
                          selectedResourceId === res.id
                            ? 'text-white shadow-md'
                            : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                        }`}
                        style={
                          selectedResourceId === res.id
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
                    ))
                  )}
                </div>
              </div>

              {/* Items Column (Videos, Files, Exams with Edit & Delete) */}
              <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800 text-xs font-bold text-slate-400">
                  <span>العناصر التعليمية (فيديوهات واختبارات وملفات)</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const firstVid = currentItems.find((i) => i.type === 'video') || items.find((i) => i.type === 'video');
                        if (firstVid) {
                          handleSelectQuickLinkVideo(firstVid.id);
                        }
                        setIsQuickLinkModalOpen(true);
                      }}
                      className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-[11px] shadow-sm flex items-center gap-1.5 transition cursor-pointer"
                      title="ربط اختبار أو ملف باسم الفيديو ليظهر تحته للطلاب"
                    >
                      <LinkIcon className="w-3.5 h-3.5" />
                      <span>ربط اختبار وملف بفيديو 🔗</span>
                    </button>
                    {selectedResourceId && (
                      <button
                        onClick={() => {
                          setEditingItem(null);
                          setItemType('video');
                          setItemTitle('');
                          setItemDesc('');
                          setItemUrl('');
                          setItemFileData('');
                          setItemFileName('');
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
                          setIsAddingItem(true);
                        }}
                        className="text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 text-xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>إضافة عنصر</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {currentItems.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-500">
                      لا توجد عناصر تعليمية بعد في هذا المصدر. اضغط "إضافة عنصر" لإضافة فيديو أو اختبار أو ملف!
                    </div>
                  ) : (
                    currentItems.map((it) => (
                      <div
                        key={it.id}
                        className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between gap-3 text-xs group"
                      >
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          {it.type === 'video' ? (
                            <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 shrink-0">
                              <Video className="w-4 h-4" />
                            </div>
                          ) : it.type === 'exam' ? (
                            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
                              <Award className="w-4 h-4" />
                            </div>
                          ) : (
                            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0">
                              <FileText className="w-4 h-4" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-white truncate">{it.title}</div>
                            <div className="text-[10px] text-slate-400">
                              {it.type === 'video'
                                ? 'فيديو'
                                : it.type === 'exam'
                                ? `اختبار (${it.questions?.length || 0} أسئلة)`
                                : `ملف (${it.fileSize || 'PDF'})`}
                            </div>
                            {it.type === 'video' && ((it.linkedExamIds?.length || 0) > 0 || (it.linkedFileIds?.length || 0) > 0) && (
                              <div className="flex flex-wrap items-center gap-1 mt-1">
                                {it.linkedExamIds && it.linkedExamIds.length > 0 && (
                                  <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded font-bold">
                                    📝 اختبار مربوط ({it.linkedExamIds.length})
                                  </span>
                                )}
                                {it.linkedFileIds && it.linkedFileIds.length > 0 && (
                                  <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded font-bold">
                                    📁 ملف مربوط ({it.linkedFileIds.length})
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Edit & Delete & Link Item Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {it.type === 'video' && (
                            <button
                              type="button"
                              onClick={() => {
                                handleSelectQuickLinkVideo(it.id);
                                setIsQuickLinkModalOpen(true);
                              }}
                              className="px-2 py-1 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 border border-amber-500/30 transition flex items-center gap-1 text-[10px] font-bold"
                              title="ربط اختبار أو ملف بهذا الفيديو"
                            >
                              <LinkIcon className="w-3 h-3" />
                              <span>ربط</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenEditItem(it)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-700 transition"
                            title="تعديل هذا العنصر"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteItem(it.id, it.title, it.type);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                            title="حذف هذا العنصر"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
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
                  onClick={() => setSelectedDaysAmount(30)}
                  className={`p-3 rounded-2xl border text-xs font-bold text-center transition ${
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
                  className={`p-3 rounded-2xl border text-xs font-bold text-center transition ${
                    selectedDaysAmount === 60
                      ? 'bg-blue-600 border-blue-400 text-white shadow-md'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  🗓️ شهرين (60 يوم)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDaysAmount(180)}
                  className={`p-3 rounded-2xl border text-xs font-bold text-center transition ${
                    selectedDaysAmount === 180
                      ? 'bg-blue-600 border-blue-400 text-white shadow-md'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  🗓️ ستة شهور (180)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDaysAmount(365)}
                  className={`p-3 rounded-2xl border text-xs font-bold text-center transition ${
                    selectedDaysAmount === 365
                      ? 'bg-blue-600 border-blue-400 text-white shadow-md'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  🗓️ سنة (365 يوم)
                </button>
              </div>
            </div>

            {/* Custom Input */}
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">أو أدخل عدد الأيام يدويًا:</label>
              <input
                type="number"
                min="1"
                max="1000"
                value={selectedDaysAmount}
                onChange={(e) => setSelectedDaysAmount(Math.max(1, Number(e.target.value)))}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Open Unlimited Button (إلغاء الاشتراك وفتح المنصة) */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/40 to-blue-950/40 border border-emerald-500/30 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-emerald-300 block">إلغاء تقييد الاشتراك (فتح دائم ⚡):</span>
                <span className="text-[10px] text-slate-400">يجعل المنصة مفتوحة عنده بشكل دائم بدون أي شريط تقييد</span>
              </div>
              <button
                type="button"
                onClick={() => handleSaveStudentDays(true)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-sm"
              >
                فتح دائم للآن
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStudentForDaysModal(null)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => handleSaveStudentDays(false)}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-lg shadow-blue-600/25"
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
          <form onSubmit={handleSaveContentItem} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-2xl w-full my-auto space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-black text-white">
                {editingItem ? 'تعديل المحتوى التعليمي' : 'إضافة محتوى تعليمي جديد'}
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
              <label className="text-xs font-bold text-slate-400 block mb-1">العنوان:</label>
              <input
                type="text"
                required
                placeholder="عنوان المحتوى..."
                value={itemTitle}
                onChange={(e) => setItemTitle(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-400 block mb-1">الوصف:</label>
              <input
                type="text"
                placeholder="وصف مختصر..."
                value={itemDesc}
                onChange={(e) => setItemDesc(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Video or File options */}
            {(itemType === 'video' || itemType === 'file') && (
              <div className="space-y-3 p-4 bg-slate-800/60 rounded-2xl border border-slate-700">
                <span className="text-xs font-bold text-slate-300 block">طريقة إضافة الملف / الفيديو:</span>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">رابط مباشر (URL):</label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={itemUrl}
                    onChange={(e) => setItemUrl(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-700 text-white font-mono"
                  />
                </div>
                <div className="text-center text-xs text-slate-500">— أو رفع من الجهاز —</div>
                <div>
                  <input
                    type="file"
                    onChange={handleFileUpload}
                    className="w-full text-xs text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-500"
                  />
                  {itemFileName && (
                    <div className="flex items-center justify-between mt-2 p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400">
                      <span>تم اختيار: {itemFileName} ({itemFileSize})</span>
                      <button
                        type="button"
                        onClick={() => {
                          setItemFileData('');
                          setItemFileName('');
                          setItemFileSize('');
                        }}
                        className="text-rose-400 hover:text-rose-300 font-bold underline text-[10px]"
                      >
                        إلغاء الملف
                      </button>
                    </div>
                  )}
                </div>
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
                      type="url"
                      placeholder="https://forms.gle/..."
                      value={itemUrl}
                      onChange={(e) => setItemUrl(e.target.value)}
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
                  type="submit"
                  className="px-6 py-2 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl"
                >
                  {editingItem ? 'حفظ التعديلات' : 'حفظ ونشر المحتوى'}
                </button>
              </div>
            </div>
          </form>
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
    </div>
  );
};
