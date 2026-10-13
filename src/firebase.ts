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
import { SystemSettings, ThemeConfig } from './types';

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
  activeTheme: THEME_PRESETS[0]
};

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

// Initial seeder so the platform isn't empty upon first boot
export async function seedInitialPlatformData() {
  try {
    const settingsRef = doc(db, 'system_settings', 'global');
    const settingsSnap = await getDoc(settingsRef);
    if (!settingsSnap.exists()) {
      await setDoc(settingsRef, DEFAULT_SETTINGS);
    }

    const sectionsSnap = await getDocs(collection(db, 'sections'));
    if (sectionsSnap.empty) {
      // Seed initial Sections & Resources
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
        createdAt: new Date().toISOString()
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
        createdAt: new Date().toISOString()
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
        createdAt: new Date().toISOString()
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
        createdAt: new Date().toISOString()
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
        createdAt: new Date().toISOString()
      });
    }
  } catch (err) {
    console.warn("Seeding notice (might already exist):", err);
  }
}
