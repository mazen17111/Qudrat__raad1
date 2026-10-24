import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDocFromServer,
  getDoc,
  setDoc,
  collection,
  onSnapshot,
  query,
  where,
  getDocs,
  deleteDoc,
  updateDoc
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { SystemSettings, ThemeConfig, SectionItem, ResourceItem, ContentItem, CourseItem } from './types';

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

export const THEME_PRESETS: ThemeConfig[] = [
  {
    id: 'blue-electric',
    name: 'رعد الأزرق الملكي والنيلي',
    primary: '#2563eb',
    secondary: '#4f46e5',
    accent: '#38bdf8',
    bgGradient: 'from-slate-900 via-blue-950 to-slate-900',
    cardBg: 'bg-slate-900/90 border-blue-500/20',
    headerBg: 'bg-slate-900/95 border-blue-500/30',
    accentBorder: 'border-blue-500/40',
    badgeBg: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    buttonGradient: 'from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white'
  },
  {
    id: 'violet-gold',
    name: 'رعد الإمبراطوري الذهبي والبنفسجي',
    primary: '#7c3aed',
    secondary: '#d97706',
    accent: '#fbbf24',
    bgGradient: 'from-slate-950 via-purple-950 to-zinc-950',
    cardBg: 'bg-zinc-900/90 border-purple-500/20',
    headerBg: 'bg-zinc-900/95 border-purple-500/30',
    accentBorder: 'border-amber-500/40',
    badgeBg: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    buttonGradient: 'from-purple-600 via-violet-600 to-amber-600 hover:from-purple-500 hover:to-amber-500 text-white'
  },
  {
    id: 'emerald-teal',
    name: 'رعد الأخضر الزمردي الأكاديمي',
    primary: '#059669',
    secondary: '#0d9488',
    accent: '#34d399',
    bgGradient: 'from-slate-950 via-emerald-950 to-slate-900',
    cardBg: 'bg-slate-900/90 border-emerald-500/20',
    headerBg: 'bg-slate-900/95 border-emerald-500/30',
    accentBorder: 'border-emerald-500/40',
    badgeBg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    buttonGradient: 'from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white'
  },
  {
    id: 'crimson-amber',
    name: 'رعد الناري القرمزي المتوهج',
    primary: '#dc2626',
    secondary: '#ea580c',
    accent: '#f59e0b',
    bgGradient: 'from-zinc-950 via-red-950 to-stone-950',
    cardBg: 'bg-stone-900/90 border-red-500/20',
    headerBg: 'bg-stone-900/95 border-red-500/30',
    accentBorder: 'border-orange-500/40',
    badgeBg: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    buttonGradient: 'from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white'
  },
  {
    id: 'cyber-dark',
    name: 'رعد السيبراني النيون الفخم',
    primary: '#06b6d4',
    secondary: '#3b82f6',
    accent: '#22d3ee',
    bgGradient: 'from-black via-zinc-950 to-black',
    cardBg: 'bg-zinc-900/90 border-cyan-500/20',
    headerBg: 'bg-black/95 border-cyan-500/30',
    accentBorder: 'border-cyan-500/40',
    badgeBg: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    buttonGradient: 'from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white'
  }
];

export const DEFAULT_SETTINGS: SystemSettings = {
  isPlatformLocked: false,
  lockReason: 'none',
  lockMessage: 'المنصة مغلقة مؤقتاً لأعمال الصيانة والتطوير، يرجى المحاولة لاحقاً.',
  maintenanceMessage: 'يوجد صيانة حالياً في المنصة لتطوير السيرفرات وتحديث المحتوى، سنعود قريباً بإذن الله.',
  subscriptionMessage: 'تم قفل المنصة بداعي تفعيل وانتهاء الاشتراك، يرجى التواصل مع المشرف لتجديد وتفعيل الاشتراك.',
  whatsappNumber: '966500000000',
  telegramUsername: '@raad_aksam',
  announcement: {
    isActive: true,
    title: 'أهلاً بكم في منصة أقسام رعد ⚡',
    message: 'منصة أقسام رعد تضمن لك المئوية بإذن الله! شاهد المحاضرات وابدأ التدرب على الاختبارات الآن.',
    type: 'info'
  },
  liveStream: {
    isActive: false,
    title: 'مراجعة ليلة الامتحان الشاملة - بث مباشر للقدرات',
    streamUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    hostName: 'أ. رعد & فريق منصة أقسام رعد'
  },
  activeTheme: THEME_PRESETS[0],
  introLesson: {
    isActive: true,
    title: 'الحصة التعريفية لشرح المنصة وطريقة الاستفادة منها',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    description: 'شاهد هذا الفيديو للتعرف على طريقة التدرب واستخدام السبورة الذكية ومجلدات الأخطاء لتحقيق نسبة 100% بإذن الله'
  },
  features: {
    telegramMainGroupUrl: 'https://t.me/raad_qiyas_main',
    telegramDiscussionGroupUrl: 'https://t.me/raad_qiyas_discussion',
    isDiagnosticEnabled: true,
    isFriendsChallengeEnabled: true
  }
};

// Default initial courses
export const INITIAL_COURSES: CourseItem[] = [
  {
    id: 'course_default_1',
    title: 'كورس القدرات العامة الشامل (تأسيس وتدريب ومحاكيات)',
    description: 'الكورس الشامل الأساسي: دورة متكاملة في التأسيس اللفظي والكمي، حل التجميعات الحديثة، واختبارات محاكية بنظام نمر ونظام المنصة.',
    imageUrl: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&auto=format&fit=crop&q=80',
    isLocked: false,
    order: 1,
    createdAt: new Date().toISOString()
  },
  {
    id: 'course_default_2',
    title: 'كورس التسريبات والنماذج الذهبية المقفلة (VIP)',
    description: 'كورس مكثف وخاص بالنماذج الحديثة المتوقعة وتجميعات الـ 120 نموذج المنقحة مع حصص سرية ومتابعة فردية.',
    imageUrl: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=800&auto=format&fit=crop&q=80',
    isLocked: true,
    price: '199 ريال سعودي',
    bankAccountImage1: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=800&auto=format&fit=crop&q=80',
    bankAccountImage2: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=800&auto=format&fit=crop&q=80',
    paymentMessage: 'الرجاء التحويل إلى أحد الحسابين الموضحين في الصورتين أعلاه، ثم إرسال إشعار التحويل عبر الواتساب لتفعيل الكورس فوراً.',
    order: 2,
    createdAt: new Date().toISOString()
  }
];

// Default initial datasets for instantaneous zero-latency display upon entry
export const INITIAL_SECTIONS: SectionItem[] = [
  {
    id: 'sec_verbal',
    courseId: 'course_default_1',
    title: 'القسم اللفظي الشامل',
    description: 'التناظر اللفظي، إكمال الجمل، الخطأ السياقي، واستيعاب المقروء',
    order: 1,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec_quant',
    courseId: 'course_default_1',
    title: 'القسم الكمي الشامل',
    description: 'الحساب، الهندسة، الجبر، والإحصاء والاحتمالات',
    order: 2,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec_hamada',
    courseId: 'course_default_1',
    title: 'حمادة',
    description: 'قسم حمادة التعليمي الخاص',
    order: 3,
    createdAt: new Date().toISOString()
  }
];

export const INITIAL_RESOURCES: ResourceItem[] = [
  {
    id: 'res_analogy',
    sectionId: 'sec_verbal',
    title: 'التناظر اللفظي الذهبي',
    description: 'علاقات التناظر اللفظي وكيفية حلها في ثوان معدودة',
    order: 1,
    createdAt: new Date().toISOString()
  },
  {
    id: 'res_context_error',
    sectionId: 'sec_verbal',
    title: 'الخطأ السياقي وإكمال الجمل',
    description: 'استراتيجيات اكتشاف الكلمة الشاذة وتكملة الفراغات',
    order: 2,
    createdAt: new Date().toISOString()
  },
  {
    id: 'res_quant_geometry',
    sectionId: 'sec_quant',
    title: 'الهندسة والزوايا والأشكال',
    description: 'قوانين المثلثات، الدائرة، والمضلعات وحيل الحل السريع',
    order: 1,
    createdAt: new Date().toISOString()
  },
  {
    id: 'res_hamada_main',
    sectionId: 'sec_hamada',
    title: 'المحاضرات والتدريبات الأساسية',
    description: 'الملفات والفيديوهات والاختبارات التابعة لقسم حمادة',
    order: 1,
    createdAt: new Date().toISOString()
  }
];

export const INITIAL_CONTENT_ITEMS: ContentItem[] = [
  {
    id: 'item_video_1',
    resourceId: 'res_analogy',
    type: 'video',
    title: 'شرح أساسيات التناظر اللفظي مع مستر رعد',
    description: 'الفيديو التأسيسي الأول لضبط جميع علاقات التناظر والوصول للـ 100%',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    durationMinutes: 15,
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString()
  },
  {
    id: 'item_exam_1',
    resourceId: 'res_analogy',
    type: 'exam',
    title: 'اختبار التناظر اللفظي المحاكي (10 أسئلة)',
    description: 'اختبار دقيق يقيس سرعتك ودقتك في علاقات التناظر اللفظي',
    isExternal: false,
    durationMinutes: 10,
    questions: [
      {
        id: 'q1',
        questionText: 'كتاب : ورقة',
        options: ['شجرة : غصن', 'بحر : سفينة', 'بيت : شارع', 'سيارة : طريق'],
        correctOptionIndex: 0,
        explanation: 'العلاقة: كل وجزء (الكتاب يتكون من أوراق، والشجرة تتكون من أغصان).'
      },
      {
        id: 'q2',
        questionText: 'شمس : ضياء',
        options: ['نار : دفء', 'قمر : ليل', 'ثلج : شتاء', 'مطر : سحاب'],
        correctOptionIndex: 0,
        explanation: 'العلاقة: مصدرية أو نتيجة، الشمس تمدنا بالضياء والنار تمدنا بالدفء.'
      },
      {
        id: 'q3',
        questionText: 'منشار : خشب',
        options: ['مقص : قماش', 'سكين : يد', 'قلم : حبر', 'فرشاة : لوحة'],
        correctOptionIndex: 0,
        explanation: 'العلاقة: أداة واستخدامها في القطع والتفصيل.'
      },
      {
        id: 'q4',
        questionText: 'رئة : تنفس',
        options: ['عين : بصر', 'قدم : حذاء', 'أذن : صوت', 'يد : خاتم'],
        correctOptionIndex: 0,
        explanation: 'العلاقة: عضو ووظيفته الأساسية.'
      },
      {
        id: 'q5',
        questionText: 'غمد : سيف',
        options: ['عرين : أسد', 'ماء : كأس', 'قلم : مقلمة', 'ثوب : خزانة'],
        correctOptionIndex: 0,
        explanation: 'العلاقة: مكان الاستقرار والوعاء المخصص (السيف موضعه الغمد والأسد موضعه العرين).'
      }
    ],
    createdAt: new Date(Date.now() - 3600000 * 24 + 600000).toISOString()
  },
  {
    id: 'item_file_1',
    resourceId: 'res_analogy',
    type: 'file',
    title: 'ملف بنك علاقات التناظر اللفظي الذهبية PDF',
    description: 'ملخص شامل لجميع العلاقات المتكررة في الاختبارات المحوسبة والورقية',
    url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    fileName: 'relations_guide_raad.pdf',
    fileSize: '2.4 MB',
    createdAt: new Date(Date.now() - 3600000 * 24 + 1200000).toISOString()
  },
  {
    id: 'item_exam_2',
    resourceId: 'res_quant_geometry',
    type: 'exam',
    title: 'اختبار الزوايا والمثلثات الحسابي',
    description: 'اختبار هندسي يقيس قدراتك الرياضية مع السبورة للمسودات',
    isExternal: false,
    durationMinutes: 12,
    questions: [
      {
        id: 'qg1',
        questionText: 'مثلث قياس زاويتين فيه 50° و 60°، ما قياس الزاوية الثالثة؟',
        options: ['70°', '60°', '80°', '90°'],
        correctOptionIndex: 0,
        explanation: 'مجموع زوايا المثلث = 180°، إذن الزاوية الثالثة = 180 - (50 + 60) = 70°'
      },
      {
        id: 'qg2',
        questionText: 'مستطيل طوله ضعف عرضه ومحيطه 36 سم، فما هي مساحته؟',
        options: ['72 سم²', '36 سم²', '54 سم²', '64 سم²'],
        correctOptionIndex: 0,
        explanation: 'المحيط = 2 × (الطول + العرض) = 36، إذن الطول + العرض = 18. إذا كان العرض س والطول 2س => 3س = 18 => س = 6 (العرض)، والطول = 12. المساحة = 12 × 6 = 72 سم²'
      }
    ],
    createdAt: new Date(Date.now() - 3600000 * 24 + 1800000).toISOString()
  },
  {
    id: 'item_video_2',
    resourceId: 'res_quant_geometry',
    type: 'video',
    title: 'أسرار المثلثات ومبرهنة فيثاغورس في خطوة واحدة',
    description: 'شرح مبسط لقوانين الهندسة وحساب المساحات المعقدة',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    durationMinutes: 20,
    createdAt: new Date(Date.now() - 3600000 * 24 + 2400000).toISOString()
  }
];

// Test Firestore connection on boot as requested by skill
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'system_settings', 'global'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Client is offline or network error:", error);
    }
  }
}

// Initial seeder so the platform isn't empty upon first boot, with permanent lock
export async function seedInitialPlatformData() {
  try {
    // Fast path: if already initialized on this browser/session, exit immediately in 0ms!
    if (typeof window !== 'undefined' && localStorage.getItem('raad_platform_seeder_initialized') === 'true') {
      return;
    }

    const settingsRef = doc(db, 'system_settings', 'global');
    const settingsSnap = await getDoc(settingsRef);
    if (!settingsSnap.exists()) {
      await setDoc(settingsRef, DEFAULT_SETTINGS);
    }

    // 1. Strict Permanent Seeder Lock: Once the platform is initialized, NEVER re-seed or resurrect anything
    const lockRef = doc(db, 'system_settings', 'seeder_lock');
    const lockSnap = await getDoc(lockRef);
    if (lockSnap.exists() && lockSnap.data()?.isInitialized) {
      // Platform already initialized! Whatever is deleted stays deleted permanently.
      try {
        if (typeof window !== 'undefined') localStorage.setItem('raad_platform_seeder_initialized', 'true');
      } catch (e) {}
      return;
    }

    const sectionsSnap = await getDocs(collection(db, 'sections'));
    // If sections already exist in the database, lock immediately so deleted sections/items never return
    if (!sectionsSnap.empty) {
      await setDoc(lockRef, { isInitialized: true, initializedAt: new Date().toISOString() }, { merge: true });
      try {
        if (typeof window !== 'undefined') localStorage.setItem('raad_platform_seeder_initialized', 'true');
      } catch (e) {}
      return;
    }

    if (sectionsSnap.empty) {
      // Seed initial Sections & Resources only on brand new, fresh database
      const sec1Ref = doc(db, 'sections', 'sec_verbal');
      await setDoc(sec1Ref, {
        id: 'sec_verbal',
        title: 'القسم اللفظي الشامل',
        description: 'التناظر اللفظي، إكمال الجمل، الخطأ السياقي، واستيعاب المقروء',
        order: 1,
        createdAt: new Date().toISOString()
      });

      const sec2Ref = doc(db, 'sections', 'sec_quant');
      await setDoc(sec2Ref, {
        id: 'sec_quant',
        title: 'القسم الكمي الشامل',
        description: 'الحساب، الهندسة، الجبر، والإحصاء والاحتمالات',
        order: 2,
        createdAt: new Date().toISOString()
      });

      // Seed verbal resources
      const res1Ref = doc(db, 'resources', 'res_analogy');
      await setDoc(res1Ref, {
        id: 'res_analogy',
        sectionId: 'sec_verbal',
        title: 'التناظر اللفظي الذهبي',
        description: 'علاقات التناظر اللفظي وكيفية حلها في ثوان معدودة',
        order: 1,
        createdAt: new Date().toISOString()
      });

      const res2Ref = doc(db, 'resources', 'res_context_error');
      await setDoc(res2Ref, {
        id: 'res_context_error',
        sectionId: 'sec_verbal',
        title: 'الخطأ السياقي وإكمال الجمل',
        description: 'استراتيجيات اكتشاف الكلمة الشاذة وتكملة الفراغات',
        order: 2,
        createdAt: new Date().toISOString()
      });

      // Seed quant resources
      const res3Ref = doc(db, 'resources', 'res_quant_geometry');
      await setDoc(res3Ref, {
        id: 'res_quant_geometry',
        sectionId: 'sec_quant',
        title: 'الهندسة والزوايا والأشكال',
        description: 'قوانين المثلثات، الدائرة، والمضلعات وحيل الحل السريع',
        order: 1,
        createdAt: new Date().toISOString()
      });

      const baseTime = Date.now() - 3600000 * 24; // 24 hours ago

      // Seed items under res_analogy: video, quiz, file
      const item1Ref = doc(db, 'content_items', 'item_video_1');
      await setDoc(item1Ref, {
        id: 'item_video_1',
        resourceId: 'res_analogy',
        type: 'video',
        title: 'شرح أساسيات التناظر اللفظي مع مستر رعد',
        description: 'الفيديو التأسيسي الأول لضبط جميع علاقات التناظر والوصول للـ 100%',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        durationMinutes: 15,
        createdAt: new Date(baseTime).toISOString()
      });

      const item2Ref = doc(db, 'content_items', 'item_exam_1');
      await setDoc(item2Ref, {
        id: 'item_exam_1',
        resourceId: 'res_analogy',
        type: 'exam',
        title: 'اختبار التناظر اللفظي المحاكي (10 أسئلة)',
        description: 'اختبار دقيق يقيس سرعتك ودقتك في علاقات التناظر اللفظي',
        isExternal: false,
        durationMinutes: 10,
        questions: [
          {
            id: 'q1',
            questionText: 'كتاب : ورقة',
            options: ['شجرة : غصن', 'بحر : سفينة', 'بيت : شارع', 'سيارة : طريق'],
            correctOptionIndex: 0,
            explanation: 'العلاقة: كل وجزء (الكتاب يتكون من أوراق، والشجرة تتكون من أغصان).'
          },
          {
            id: 'q2',
            questionText: 'شمس : ضياء',
            options: ['نار : دفء', 'قمر : ليل', 'ثلج : شتاء', 'مطر : سحاب'],
            correctOptionIndex: 0,
            explanation: 'العلاقة: مصدرية أو نتيجة، الشمس تمدنا بالضياء والنار تمدنا بالدفء.'
          },
          {
            id: 'q3',
            questionText: 'منشار : خشب',
            options: ['مقص : قماش', 'سكين : يد', 'قلم : حبر', 'فرشاة : لوحة'],
            correctOptionIndex: 0,
            explanation: 'العلاقة: أداة واستخدامها في القطع والتفصيل.'
          },
          {
            id: 'q4',
            questionText: 'رئة : تنفس',
            options: ['عين : بصر', 'قدم : حذاء', 'أذن : صوت', 'يد : خاتم'],
            correctOptionIndex: 0,
            explanation: 'العلاقة: عضو ووظيفته الأساسية.'
          },
          {
            id: 'q5',
            questionText: 'غمد : سيف',
            options: ['عرين : أسد', 'ماء : كأس', 'قلم : مقلمة', 'ثوب : خزانة'],
            correctOptionIndex: 0,
            explanation: 'العلاقة: مكان الاستقرار والوعاء المخصص (السيف موضعه الغمد والأسد موضعه العرين).'
          }
        ],
        createdAt: new Date(baseTime + 60000 * 10).toISOString()
      });

      const item3Ref = doc(db, 'content_items', 'item_file_1');
      await setDoc(item3Ref, {
        id: 'item_file_1',
        resourceId: 'res_analogy',
        type: 'file',
        title: 'ملف بنك علاقات التناظر اللفظي الذهبية PDF',
        description: 'ملخص شامل لجميع العلاقات المتكررة في الاختبارات المحوسبة والورقية',
        url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        fileName: 'relations_guide_raad.pdf',
        fileSize: '2.4 MB',
        createdAt: new Date(baseTime + 60000 * 20).toISOString()
      });

      // Quant item
      const item4Ref = doc(db, 'content_items', 'item_exam_2');
      await setDoc(item4Ref, {
        id: 'item_exam_2',
        resourceId: 'res_quant_geometry',
        type: 'exam',
        title: 'اختبار الزوايا والمثلثات الحسابي',
        description: 'اختبار هندسي يقيس قدراتك الرياضية مع السبورة للمسودات',
        isExternal: false,
        durationMinutes: 12,
        questions: [
          {
            id: 'qg1',
            questionText: 'مثلث قياس زاويتين فيه 50° و 60°، ما قياس الزاوية الثالثة؟',
            options: ['70°', '60°', '80°', '90°'],
            correctOptionIndex: 0,
            explanation: 'مجموع زوايا المثلث = 180°، إذن الزاوية الثالثة = 180 - (50 + 60) = 70°'
          },
          {
            id: 'qg2',
            questionText: 'مستطيل طوله ضعف عرضه ومحيطه 36 سم، فما هي مساحته؟',
            options: ['72 سم²', '36 سم²', '54 سم²', '64 سم²'],
            correctOptionIndex: 0,
            explanation: 'المحيط = 2 × (الطول + العرض) = 36، إذن الطول + العرض = 18. إذا كان العرض س والطول 2س => 3س = 18 => س = 6 (العرض)، والطول = 12. المساحة = 12 × 6 = 72 سم²'
          }
        ],
        createdAt: new Date(baseTime + 60000 * 30).toISOString()
      });

      const item5Ref = doc(db, 'content_items', 'item_video_2');
      await setDoc(item5Ref, {
        id: 'item_video_2',
        resourceId: 'res_quant_geometry',
        type: 'video',
        title: 'أسرار المثلثات ومبرهنة فيثاغورس في خطوة واحدة',
        description: 'شرح مبسط لقوانين الهندسة وحساب المساحات المعقدة',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
        durationMinutes: 20,
        createdAt: new Date(baseTime + 60000 * 40).toISOString()
      });
    }

    // Ensure section "حمادة" is created as requested by the user
    try {
      const hamadaDocRef = doc(db, 'sections', 'sec_hamada');
      const hamadaSnap = await getDoc(hamadaDocRef);
      if (!hamadaSnap.exists()) {
        const allSec = await getDocs(collection(db, 'sections'));
        const nextOrder = allSec.size + 1;
        await setDoc(hamadaDocRef, {
          id: 'sec_hamada',
          title: 'حمادة',
          description: 'قسم حمادة التعليمي الخاص',
          order: nextOrder,
          createdAt: new Date().toISOString()
        }, { merge: true });

        // Add a default resource under "حمادة" so the user can immediately add content
        const resHamadaRef = doc(db, 'resources', 'res_hamada_main');
        const resHamadaSnap = await getDoc(resHamadaRef);
        if (!resHamadaSnap.exists()) {
          await setDoc(resHamadaRef, {
            id: 'res_hamada_main',
            sectionId: 'sec_hamada',
            title: 'المحاضرات والتدريبات الأساسية',
            description: 'الملفات والفيديوهات والاختبارات التابعة لقسم حمادة',
            order: 1,
            createdAt: new Date().toISOString()
          }, { merge: true });
        }
      }
    } catch (e) {
      console.warn("Could not seed Hamada section:", e);
    }

    // Ensure both initial courses exist, restoring course_default_2 and its contents if missing
    await restoreDefaultCoursesAndContent();

    // Mark permanent seeder lock so deleted items/sections NEVER return
    await setDoc(lockRef, { isInitialized: true, initializedAt: new Date().toISOString() }, { merge: true });
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('raad_platform_seeder_initialized', 'true');
      }
    } catch (e) {}
  } catch (err) {
    console.warn("Seeding notice (might already exist):", err);
  }
}

// Dedicated function to restore both courses and full contents (especially course_default_2 if deleted by mistake)
export async function restoreDefaultCoursesAndContent(): Promise<{ restored: boolean; message: string }> {
  try {
    // 1. Check Course 1
    const c1Ref = doc(db, 'courses', 'course_default_1');
    const c1Snap = await getDoc(c1Ref);
    if (!c1Snap.exists()) {
      await setDoc(c1Ref, {
        id: 'course_default_1',
        title: 'كورس القدرات العامة الشامل (تأسيس وتدريب ومحاكيات)',
        description: 'الكورس الشامل الأساسي: دورة متكاملة في التأسيس اللفظي والكمي، حل التجميعات الحديثة، واختبارات محاكية بنظام نمر ونظام المنصة.',
        imageUrl: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&auto=format&fit=crop&q=80',
        isLocked: false,
        price: 'مجاني / متاح',
        bankAccountImage1: '',
        bankAccountImage2: '',
        paymentMessage: '',
        order: 1,
        createdAt: new Date().toISOString(),
      }, { merge: true });
    }

    // 2. Check Course 2 (VIP course requested by user)
    const c2Ref = doc(db, 'courses', 'course_default_2');
    const c2Snap = await getDoc(c2Ref);
    if (!c2Snap.exists()) {
      await setDoc(c2Ref, {
        id: 'course_default_2',
        title: 'كورس التسريبات والنماذج الذهبية المقفلة (VIP)',
        description: 'كورس مكثف وخاص بالنماذج الحديثة المتوقعة وتجميعات الـ 120 نموذج المنقحة مع حصص سرية ومتابعة فردية.',
        imageUrl: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=800&auto=format&fit=crop&q=80',
        isLocked: true,
        price: '199 ريال سعودي',
        bankAccountImage1: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=800&auto=format&fit=crop&q=80',
        bankAccountImage2: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=800&auto=format&fit=crop&q=80',
        paymentMessage: 'الرجاء التحويل إلى أحد الحسابين الموضحين في الصورتين أعلاه، ثم إرسال إشعار التحويل عبر الواتساب لتفعيل الكورس فوراً.',
        order: 2,
        createdAt: new Date().toISOString(),
      }, { merge: true });
    }

    // 3. Restore Section 1 for Course 2
    const secVip1Ref = doc(db, 'sections', 'sec_vip_120');
    const secVip1Snap = await getDoc(secVip1Ref);
    if (!secVip1Snap.exists()) {
      await setDoc(secVip1Ref, {
        id: 'sec_vip_120',
        courseId: 'course_default_2',
        title: 'قسم تجميعات الـ 120 نموذج الذهبية المنقحة',
        description: 'شروحات ونماذج وتجميعات الـ 120 نموذج المحوسبة الأكثر تكراراً',
        order: 1,
        createdAt: new Date().toISOString(),
      }, { merge: true });
    }

    // 4. Restore Resource 1 for Course 2
    const resVip1Ref = doc(db, 'resources', 'res_vip_models');
    const resVip1Snap = await getDoc(resVip1Ref);
    if (!resVip1Snap.exists()) {
      await setDoc(resVip1Ref, {
        id: 'res_vip_models',
        courseId: 'course_default_2',
        sectionId: 'sec_vip_120',
        title: 'نماذج وتجميعات التسريبات الذهبية VIP',
        description: 'فيديوهات حل النماذج واختبارات وتجميعات محوسبة',
        order: 1,
        createdAt: new Date().toISOString(),
      }, { merge: true });
    }

    // 5. Restore Video Item for Course 2
    const itemVipVid1 = doc(db, 'content_items', 'item_vip_video_1');
    const itemVipVid1Snap = await getDoc(itemVipVid1);
    if (!itemVipVid1Snap.exists()) {
      await setDoc(itemVipVid1, {
        id: 'item_vip_video_1',
        resourceId: 'res_vip_models',
        type: 'video',
        title: 'شرح تجميعات وتسريبات الـ 120 نموذج المتوقعة 2025',
        description: 'المحاضرة الشاملة لحل وتفكيك أصعب نماذج التسريبات',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        durationMinutes: 25,
        createdAt: new Date().toISOString(),
      }, { merge: true });
    }

    // 6. Restore Exam Item for Course 2
    const itemVipExam1 = doc(db, 'content_items', 'item_vip_exam_1');
    const itemVipExam1Snap = await getDoc(itemVipExam1);
    if (!itemVipExam1Snap.exists()) {
      await setDoc(itemVipExam1, {
        id: 'item_vip_exam_1',
        resourceId: 'res_vip_models',
        type: 'exam',
        title: 'اختبار التسريبات والنماذج الذهبية المحاكي',
        description: 'اختبار دقيق يقيس سرعتك في أسئلة التسريبات المتكررة',
        isExternal: false,
        durationMinutes: 15,
        targetPercentage: 90,
        questions: [
          {
            id: 'qv1',
            questionText: 'ما الحد التالي في المتتابعة: 3 ، 7 ، 15 ، 31 ، ...؟',
            imageUrl: '',
            options: ['63', '60', '58', '65'],
            correctOptionIndex: 0,
            explanation: 'النمط: مضاعفة وإضافة 1 (3×2+1=7 ، 7×2+1=15 ، 15×2+1=31 ، 31×2+1=63).',
          },
          {
            id: 'qv2',
            questionText: 'إذا كان ثمن 3 أقلام ودفترين 28 ريالاً، وثمن قلم ودفترين 16 ريالاً، فما ثمن القلم؟',
            imageUrl: '',
            options: ['6 ريالات', '5 ريالات', '7 ريالات', '4 ريالات'],
            correctOptionIndex: 0,
            explanation: 'بطرح المعادلتين: 2 قلم = 12 => القلم الواحد = 6 ريالات.',
          },
          {
            id: 'qv3',
            questionText: 'قطار يسير بسرعة 120 كم/س، كم المسافة التي يقطعها في 20 دقيقة؟',
            imageUrl: '',
            options: ['40 كم', '30 كم', '50 كم', '60 كم'],
            correctOptionIndex: 0,
            explanation: '20 دقيقة = ثلث ساعة، المسافة = 120 ÷ 3 = 40 كم.',
          },
          {
            id: 'qv4',
            questionText: 'سماء : نجوم (تناظر لفظي)',
            imageUrl: '',
            options: ['حديقة : أشجار', 'بحر : سفينة', 'غابة : أسد', 'مدينة : سيارات'],
            correctOptionIndex: 0,
            explanation: 'العلاقة: تكوينية ومكانية (النجوم تزين السماء والأشجار تزين الحديقة).',
          },
        ],
        createdAt: new Date().toISOString(),
      }, { merge: true });
    }

    // 7. Restore File Item for Course 2
    const itemVipFile1 = doc(db, 'content_items', 'item_vip_file_1');
    const itemVipFile1Snap = await getDoc(itemVipFile1);
    if (!itemVipFile1Snap.exists()) {
      await setDoc(itemVipFile1, {
        id: 'item_vip_file_1',
        resourceId: 'res_vip_models',
        type: 'file',
        title: 'ملف بنك تسريبات الـ 120 نموذج المنقحة PDF',
        description: 'ملف PDF يحتوي على جميع أسئلة وتجميعات الـ 120 نموذج المحوسبة مع الشرح والحل',
        fileName: 'vip_120_models_raad.pdf',
        fileSize: '3.8 MB',
        url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        createdAt: new Date().toISOString(),
      }, { merge: true });
    }

    // 8. Restore Section 2 for Course 2
    const secVip2Ref = doc(db, 'sections', 'sec_vip_intensive');
    const secVip2Snap = await getDoc(secVip2Ref);
    if (!secVip2Snap.exists()) {
      await setDoc(secVip2Ref, {
        id: 'sec_vip_intensive',
        courseId: 'course_default_2',
        title: 'قسم الحصص المكثفة والتكنيكات السريعة',
        description: 'حصص مكثفة وتكنيكات الحل في 30 ثانية لكل سؤال',
        order: 2,
        createdAt: new Date().toISOString(),
      }, { merge: true });
    }

    // 9. Restore Resource 2 for Course 2
    const resVip2Ref = doc(db, 'resources', 'res_vip_intensive_res');
    const resVip2Snap = await getDoc(resVip2Ref);
    if (!resVip2Snap.exists()) {
      await setDoc(resVip2Ref, {
        id: 'res_vip_intensive_res',
        courseId: 'course_default_2',
        sectionId: 'sec_vip_intensive',
        title: 'محاضرات الشرح المركز وتكنيكات الحل السريع',
        description: 'شروحات استراتيجيات الحل الذكي وتوفير الوقت في الاختبار',
        order: 1,
        createdAt: new Date().toISOString(),
      }, { merge: true });
    }

    // 10. Restore Video & Exam for Section 2
    const itemVipVid2 = doc(db, 'content_items', 'item_vip_video_2');
    const itemVipVid2Snap = await getDoc(itemVipVid2);
    if (!itemVipVid2Snap.exists()) {
      await setDoc(itemVipVid2, {
        id: 'item_vip_video_2',
        resourceId: 'res_vip_intensive_res',
        type: 'video',
        title: 'تكنيك حل مسائل الهندسة والجبر في أقل من نصف دقيقة',
        description: 'استراتيجيات الحل الذكي وتجنب المعادلات الطويلة',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
        durationMinutes: 18,
        createdAt: new Date().toISOString(),
      }, { merge: true });
    }

    return { restored: true, message: 'تم استرجاع الكورس المحذوف ومحتوياته بالكامل بنجاح ⚡' };
  } catch (err) {
    console.error('Error in restoreDefaultCoursesAndContent:', err);
    return { restored: false, message: 'حدث خطأ أثناء استرجاع الكورس' };
  }
}
