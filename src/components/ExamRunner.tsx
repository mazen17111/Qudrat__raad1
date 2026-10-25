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
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { StudentUser, ExamQuestion, FolderItem } from '../types';
import { Whiteboard } from './Whiteboard';
import { db } from '../firebase';
import {
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  getDocs,
  query,
  where,
  onSnapshot
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
  examSystem?: 'nimr' | 'standard';
  durationMinutes?: number;
  targetPercentage?: number;
  isDarkMode?: boolean;
  isFolderExam?: boolean;
  folderId?: string;
  folderTitle?: string;
  courseId?: string;
  courseTitle?: string;
}

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
  const [isTimed] = useState(isTimedInitial);
  const [showMobileQuestionsList, setShowMobileQuestionsList] = useState(false);

  // Exam system mode: 'nimr' (Tiger Qiyas layout) or 'standard' (Platform layout)
  const [systemMode, setSystemMode] = useState<'nimr' | 'standard'>(examSystem || 'nimr');

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

  // 5. Zoom Question Image Lightbox
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);
  const [imageZoomScale, setImageZoomScale] = useState<number>(1);

  // 6. Section Instructions, Exam Instructions, and Equations Modals (المستطيلات الأربعة تحت الأسئلة)
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [showExamInstructionsModal, setShowExamInstructionsModal] = useState(false);
  const [showEquationsModal, setShowEquationsModal] = useState(false);

  // Student National ID & Random Reference Code (رقم الهوية وجنبيه أرقام عشوائية)
  const nationalId = useMemo(() => {
    if (currentUser?.nationalId) return currentUser.nationalId;
    if (currentUser?.phone && currentUser.phone.length >= 9) return `10${currentUser.phone.slice(-8)}`;
    const hash = Math.abs((currentUser?.id || 'std').split('').reduce((acc, c) => acc * 31 + c.charCodeAt(0), 10842918));
    return `10${String(hash % 90000000 + 10000000)}`;
  }, [currentUser]);

  const randomSessionDigits = useMemo(() => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }, []);

  // Calculate timer in seconds
  const totalSeconds = (durationMinutes && durationMinutes > 0)
    ? durationMinutes * 60
    : Math.max(60, safeQuestions.length * 75);

  const [timeLeft, setTimeLeft] = useState(totalSeconds);

  // Subscribe to live folders from Firestore so newly created folders appear immediately
  useEffect(() => {
    if (!currentUser?.id) return;
    const q = query(
      collection(db, 'folders'),
      where('userId', '==', currentUser.id)
    );
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: FolderItem[] = [];
        snapshot.forEach((d) => {
          const item = { id: d.id, ...d.data() } as FolderItem;
          // Scope folders strictly to current course (course_default_1 handles legacy records without courseId)
          const matchesCourse = item.courseId
            ? item.courseId === currentCourseId
            : currentCourseId === 'course_default_1';
          if (!matchesCourse) return;

          if (item.isDefaultMistakesFolder || item.title === 'مجلد الاخطاء' || item.title === 'مجلد الأخطاء') {
            item.isDefaultMistakesFolder = true;
          }
          list.push(item);
        });

        // Sort with mistakes folder always first
        list.sort((a, b) => {
          if (a.isDefaultMistakesFolder) return -1;
          if (b.isDefaultMistakesFolder) return 1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        setUserFolders(list);
      },
      (err) => {
        console.warn('Live folders listener note:', err);
      }
    );

    return () => unsub();
  }, [currentUser?.id, currentCourseId]);

  // Subscribe to all questions the user has in folders in real-time
  useEffect(() => {
    if (!currentUser?.id) return;
    const qFQ = query(
      collection(db, 'folder_questions'),
      where('userId', '==', currentUser.id)
    );
    const unsubFQ = onSnapshot(
      qFQ,
      (snapshot) => {
        const records: FolderQuestionDoc[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          records.push({
            id: d.id,
            folderId: data.folderId,
            originalQuestionId: data.originalQuestionId,
            questionText: data.questionText || '',
          });
        });
        setUserFolderQuestions(records);
      },
      (err) => {
        console.warn('Live folder_questions listener note:', err);
      }
    );

    return () => unsubFQ();
  }, [currentUser?.id]);

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

    const isMistakes = (f: { title?: string; isDefaultMistakesFolder?: boolean; courseId?: string }) => {
      const isName = Boolean(f.isDefaultMistakesFolder || f.title === 'مجلد الاخطاء' || f.title === 'مجلد الأخطاء' || f.title === 'دفتر الاخطاء' || f.title === 'دفتر الأخطاء');
      const matchesCourse = f.courseId ? f.courseId === currentCourseId : currentCourseId === 'course_default_1';
      return isName && matchesCourse;
    };

    const existing = userFolders.find(isMistakes);
    if (existing) return existing.id;

    try {
      const q = query(
        collection(db, 'folders'),
        where('userId', '==', currentUser.id)
      );
      const snap = await getDocs(q);
      let foundId: string | null = null;
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        if (isMistakes(d as FolderItem)) {
          foundId = docSnap.id;
        }
      });

      if (foundId) return foundId;

      const newRef = await addDoc(collection(db, 'folders'), {
        userId: currentUser.id,
        courseId: currentCourseId,
        title: 'مجلد الأخطاء',
        isDefaultMistakesFolder: true,
        createdAt: new Date().toISOString(),
      });
      return newRef.id;
    } catch (err) {
      console.error('Error ensuring mistakes folder:', err);
      return null;
    }
  };

  // SILENT auto-transfer: saves mistakes to "مجلد الأخطاء" WITHOUT notifying the student during exam
  const autoTransferMistakeSilently = async (question: ExamQuestion, studentAnswerIndex: number) => {
    if (!currentUser?.id || !question) return;
    const qKey = (question.id && !question.id.startsWith('q_')) ? question.id : (question.questionText || question.id);
    if (autoSavedMistakeIds[qKey]) return; // Avoid duplicate saves in memory

    setAutoSavedMistakeIds((prev) => ({ ...prev, [qKey]: true }));

    try {
      const folderId = await ensureMistakesFolderExists();
      if (!folderId) return;

      const dupQuery = query(
        collection(db, 'folder_questions'),
        where('folderId', '==', folderId)
      );
      const dupSnap = await getDocs(dupQuery);
      let alreadySaved = false;
      dupSnap.forEach((d) => {
        const data = d.data();
        if (
          (question.id && data.originalQuestionId === question.id) ||
          (data.questionText && question.questionText && data.questionText.trim() === question.questionText.trim())
        ) {
          alreadySaved = true;
        }
      });

      if (!alreadySaved) {
        await addDoc(collection(db, 'folder_questions'), {
          folderId: folderId,
          courseId: currentCourseId,
          userId: currentUser.id,
          originalQuestionId: question.id || '',
          questionText: question.questionText || '',
          imageUrl: question.imageUrl || '',
          options: Array.isArray(question.options) ? question.options : [],
          correctOptionIndex: typeof question.correctOptionIndex === 'number' ? question.correctOptionIndex : 0,
          explanation: question.explanation || '',
          sourceExamTitle: examTitle,
          studentChoiceIndex: studentAnswerIndex,
          isAutoTransferredMistake: true,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error('Error auto-transferring mistake silently to folder:', err);
    }
  };

  // Option select handler: records answer (mistakes are transferred ONLY upon exam finish)
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
      const addedDocRef = await addDoc(collection(db, 'folder_questions'), {
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
        createdAt: new Date().toISOString(),
      });

      // Update optimistic record with real Firestore id
      setUserFolderQuestions((prev) =>
        prev.map((rec) => (rec.id === optimisticId ? { ...rec, id: addedDocRef.id } : rec))
      );

      setFolderActionToast({ message: 'تم اضافة السؤال الى هذا المجلد' });
      setTimeout(() => setFolderActionToast(null), 2500);
    } catch (err) {
      console.error('Error adding question to folder:', err);
      // Revert optimistic addition on error
      setUserFolderQuestions((prev) => prev.filter((rec) => rec.id !== optimisticId));
      setFolderActionToast({ message: 'حدث خطأ أثناء حفظ السؤال في المجلد', isError: true });
      setTimeout(() => setFolderActionToast(null), 3000);
    } finally {
      setProcessingFolderIds((prev) => ({ ...prev, [folder.id]: false }));
    }
  };

  // Student clicks again to DELETE / REMOVE question from a folder:
  // Hides checkmark, deletes doc from Firestore, and shows toast: "تم حذف السؤال من هذا المجلد"
  const handleDeleteQuestionFromFolder = async (folderQuestionDocId: string, folderTitle: string, folderId: string) => {
    if (!folderId) return;
    setProcessingFolderIds((prev) => ({ ...prev, [folderId]: true }));

    // Capture previous state for rollback if error
    const prevFolderQuestions = [...userFolderQuestions];

    // Optimistic UI deletion so checkmark disappears immediately
    setUserFolderQuestions((prev) =>
      prev.filter((fq) => fq.id !== folderQuestionDocId && fq.folderId !== folderId)
    );

    try {
      if (folderQuestionDocId && !folderQuestionDocId.startsWith('temp_')) {
        await deleteDoc(doc(db, 'folder_questions', folderQuestionDocId));
      } else {
        // Query to find and delete matching records
        const qSnap = await getDocs(
          query(
            collection(db, 'folder_questions'),
            where('userId', '==', currentUser.id),
            where('folderId', '==', folderId),
            where('questionText', '==', showFolderModalForQ?.questionText || '')
          )
        );
        for (const docD of qSnap.docs) {
          await deleteDoc(docD.ref);
        }
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
      const newRef = await addDoc(collection(db, 'folders'), {
        userId: currentUser.id,
        courseId: currentCourseId,
        title: trimmed,
        isDefaultMistakesFolder: false,
        createdAt: new Date().toISOString(),
      });

      const newFolderItem: FolderItem = {
        id: newRef.id,
        userId: currentUser.id,
        courseId: currentCourseId,
        title: trimmed,
        isDefaultMistakesFolder: false,
        createdAt: new Date().toISOString(),
      };

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
    const score = calculateScore();
    const total = Math.max(1, safeQuestions.length);
    const percentage = Math.round((score / total) * 100);

    // Transfer ONLY the questions the student actually answered AND got wrong
    // (لا ينتقل إلا الأسئلة التي أجاب عليها الطالب وكان اختياره خاطئاً فقط فقط)
    if (!isFolderExam) {
      safeQuestions.forEach((q, idx) => {
        const ans = selectedAnswers[idx];
        if (typeof ans === 'number' && ans !== q.correctOptionIndex && !autoSavedMistakeIds[q.id]) {
          autoTransferMistakeSilently(q, ans);
        }
      });
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
        await addDoc(collection(db, 'exam_attempts'), {
          userId: currentUser.id,
          studentName: currentUser.name || 'طالب',
          examId: examId,
          examTitle: examTitle,
          score,
          totalQuestions: total,
          percentage,
          isTimed,
          durationSeconds: isTimed ? (totalSeconds - timeLeft) : 0,
          targetPercentage: targetPercentage || 90,
          createdAt: new Date().toISOString(),
        });

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

        const updatedCount = count || 1;
        const updatedAvg = Math.round(totalPerc / updatedCount);

        const userRef = doc(db, 'users', currentUser.id);
        await updateDoc(userRef, {
          totalExamsTaken: updatedCount,
          averageScore: updatedAvg,
        });
      }

      onFinishExam();
    } catch (err) {
      console.error('Error saving exam attempt:', err);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Exit request handler: If testing mistakes/folder and answered questions correctly, asks student if they want to delete correct questions
  const handleRequestExit = () => {
    const isFromFolder = Boolean(isFolderExam || folderId || (examId && examId.startsWith('folder_')));
    const correctCount = safeQuestions.filter((q, idx) => selectedAnswers[idx] === q.correctOptionIndex).length;

    if (isFromFolder && correctCount > 0) {
      setShowDeleteCorrectPrompt(true);
    } else {
      onExit();
    }
  };

  // Student clicks "نعم" -> permanently delete correct questions from folder and mistakes folder so they never return
  const handleConfirmDeleteCorrectQuestions = async () => {
    setIsDeletingCorrectQuestions(true);
    try {
      const correctQuestions = safeQuestions.filter((q, idx) => selectedAnswers[idx] === q.correctOptionIndex);

      // Identify the student's mistakes folder
      const mistakesFolder = userFolders.find(
        (f) => f.isDefaultMistakesFolder || f.title === 'مجلد الاخطاء' || f.title === 'مجلد الأخطاء' || f.title === 'دفتر الاخطاء'
      );
      const mistakesFolderId = mistakesFolder?.id;

      for (const q of correctQuestions) {
        // 1. Direct doc deletion if id is a Firestore document ID in folder_questions
        if (q.id && !q.id.startsWith('q_') && !q.id.startsWith('temp_')) {
          try {
            await deleteDoc(doc(db, 'folder_questions', q.id));
          } catch (e) {
            console.warn('Direct delete by id attempt:', e);
          }
        }

        const qText = (q.questionText || '').trim();
        if (currentUser?.id && qText) {
          // 2. Query and delete from current tested folder
          if (folderId) {
            try {
              const snap = await getDocs(
                query(
                  collection(db, 'folder_questions'),
                  where('userId', '==', currentUser.id),
                  where('folderId', '==', folderId)
                )
              );
              for (const d of snap.docs) {
                const data = d.data();
                if (
                  d.id === q.id ||
                  (data.questionText && data.questionText.trim() === qText) ||
                  (data.originalQuestionId && data.originalQuestionId === q.id)
                ) {
                  await deleteDoc(d.ref).catch(() => {});
                }
              }
            } catch (err) {
              console.error('Error deleting from folderId:', err);
            }
          }

          // 3. ALSO delete from student's Mistakes Folder (مجلد الأخطاء)
          if (mistakesFolderId && mistakesFolderId !== folderId) {
            try {
              const snapM = await getDocs(
                query(
                  collection(db, 'folder_questions'),
                  where('userId', '==', currentUser.id),
                  where('folderId', '==', mistakesFolderId)
                )
              );
              for (const d of snapM.docs) {
                const data = d.data();
                if (
                  d.id === q.id ||
                  (data.questionText && data.questionText.trim() === qText) ||
                  (data.originalQuestionId && data.originalQuestionId === q.id)
                ) {
                  await deleteDoc(d.ref).catch(() => {});
                }
              }
            } catch (err) {
              console.error('Error deleting from mistakes folder:', err);
            }
          }
        }
      }
    } catch (err) {
      console.error('Error deleting correct questions on exit:', err);
    } finally {
      setIsDeletingCorrectQuestions(false);
      setShowDeleteCorrectPrompt(false);
      onExit();
    }
  };

  // Student clicks "لا" -> keep questions in mistakes folder and exit to platform
  const handleKeepCorrectQuestions = () => {
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

    return (
      <div className={`p-4 md:p-8 max-w-4xl mx-auto space-y-6 ${isDarkMode ? 'text-white' : 'text-black'}`}>
        <div className={`border rounded-3xl p-6 md:p-10 shadow-2xl backdrop-blur-xl ${
          isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="text-center space-y-4">
            <div className={`inline-flex p-4 rounded-3xl border ${
              passedTarget ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-amber-500/10 border-amber-500/20 text-amber-500'
            }`}>
              <Award className="w-16 h-16 animate-bounce" />
            </div>

            <h2 className={`text-2xl md:text-4xl font-black ${isDarkMode ? 'text-white' : 'text-black'}`}>
              نتيجة الاختبار: {examTitle}
            </h2>

            {/* Target percentage feedback badge */}
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

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto pt-4">
              <div className={`p-4 rounded-2xl border ${
                isDarkMode ? 'bg-slate-800/80 border-slate-700/60' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className={`text-xs block ${isDarkMode ? 'text-slate-400' : 'text-black font-bold'}`}>النسبة المئوية</span>
                <span className={`text-2xl md:text-3xl font-black ${
                  percentage >= (targetPercentage || 90)
                    ? 'text-emerald-500'
                    : percentage >= 60
                    ? 'text-amber-500'
                    : 'text-rose-500'
                }`}>
                  %{percentage}
                </span>
              </div>
              <div className={`p-4 rounded-2xl border ${
                isDarkMode ? 'bg-slate-800/80 border-slate-700/60' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className={`text-xs block ${isDarkMode ? 'text-slate-400' : 'text-black font-bold'}`}>الإجابات الصحيحة</span>
                <span className="text-2xl md:text-3xl font-black text-emerald-500">
                  {score} / {total}
                </span>
              </div>
              <div className={`p-4 rounded-2xl border ${
                isDarkMode ? 'bg-slate-800/80 border-slate-700/60' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className={`text-xs block ${isDarkMode ? 'text-slate-400' : 'text-black font-bold'}`}>الإجابات الخاطئة</span>
                <span className="text-2xl md:text-3xl font-black text-rose-500">
                  {wrongCount}
                </span>
              </div>
              <div className={`p-4 rounded-2xl border ${
                isDarkMode ? 'bg-slate-800/80 border-slate-700/60' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className={`text-xs block ${isDarkMode ? 'text-slate-400' : 'text-black font-bold'}`}>نوع الاختبار</span>
                <span className="text-base font-black text-blue-600 mt-1 block">
                  {isTimed ? 'اختبار مؤقت ⏱️' : 'تدريب حر 🎯'}
                </span>
              </div>
            </div>

            {/* Prominent Mistake Transfer Announcement at end of exam */}
            {wrongCount > 0 ? (
              <div className={`mt-5 p-5 border-2 rounded-3xl text-right shadow-2xl ${
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
              <div className="mt-5 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-600 text-xs md:text-sm font-black">
                ✨ أداء أسطوري! لا توجد أخطاء في هذا الاختبار، درجتك كاملة 100%!
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-6">
              <button
                onClick={() => {
                  setSelectedAnswers({});
                  setCurrentIdx(0);
                  setIsFinished(false);
                  setTimeLeft(totalSeconds);
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

  // ================= Modal: هل تود حذف الأسئلة الصحيحة أم لا؟ =================
  function renderDeleteCorrectPromptModal() {
    if (!showDeleteCorrectPrompt) return null;
    const correctCount = safeQuestions.filter((q, idx) => selectedAnswers[idx] === q.correctOptionIndex).length;

    return (
      <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
        <div className="bg-slate-900 border-2 border-slate-700/80 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl text-right space-y-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-amber-500 via-blue-500 to-emerald-500" />

          <div className="flex items-start gap-4">
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl shrink-0">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1 flex-1">
              <h3 className="text-xl font-black text-white">
                هل تود حذف الأسئلة الصحيحة أم لا؟
              </h3>
              <p className="text-xs text-slate-400 font-bold">
                {folderTitle ? `المجلد: ${folderTitle}` : 'اختبار المجلد والأخطاء'}
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700 text-slate-200 text-xs md:text-sm leading-relaxed space-y-3">
            <p>
              لقد أجبت بشكل صحيح على <strong className="text-emerald-400 font-black">{correctCount}</strong> من الأسئلة في هذا الاختبار.
            </p>
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700/60 space-y-2 text-xs">
              <div className="flex items-start gap-2">
                <span className="text-emerald-400 font-black shrink-0">✓ إذا ضغطت نعم:</span>
                <span className="text-slate-300">تُحذف الأسئلة الصحيحة نهائياً من مجلد الأخطاء ولن تعود لك أبداً، لتركز فقط على أخطائك.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-amber-400 font-black shrink-0">✕ إذا ضغطت لا:</span>
                <span className="text-slate-300">لا تُحذف وتبقى محفوظة في مجلد الأخطاء كما هي لمراجعتها في أي وقت.</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
            <button
              type="button"
              onClick={handleConfirmDeleteCorrectQuestions}
              disabled={isDeletingCorrectQuestions}
              className="flex-1 py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs md:text-sm transition shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isDeletingCorrectQuestions ? (
                <span>جاري الحذف...</span>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>نعم، احذف الأسئلة الصحيحة نهائياً</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleKeepCorrectQuestions}
              disabled={isDeletingCorrectQuestions}
              className="flex-1 py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-black text-xs md:text-sm border border-slate-700 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <span>لا، أبقِها في مجلد الأخطاء</span>
            </button>
          </div>

          <div className="text-center pt-1">
            <button
              type="button"
              disabled={isDeletingCorrectQuestions}
              onClick={() => setShowDeleteCorrectPrompt(false)}
              className="text-xs font-bold text-slate-500 hover:text-slate-300 transition cursor-pointer"
            >
              إلغاء والتراجع لمتابعة الاختبار
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Calculate progress percent
  const progressPercent = Math.round(((currentIdx + 1) / safeQuestions.length) * 100);

  // ================= 5. NIKR (TIGER) EXAM SYSTEM VIEW (نظام نمر) =================
  // المواصفات المطلوبة لنظام نمر:
  // - اللون الأخضر فوق (شريط علوي متدرج بالأخضر الزمردي الفخم)
  // - المعلومات فوق على اليسار (بيانات الطالب + المؤقت + الهدف + عداد الأسئلة + السبورة + إنهاء)
  // - صورة السؤال والاختيارات على اليمين (أول عنصر في تخطيط RTL)
  // - عدد وقائمة الأسئلة على اليسار (ثاني عنصر في تخطيط RTL)
  function renderNimrView() {
    return (
      <div className="flex flex-col gap-3 flex-1 min-h-0">
        {/* ================= 1. الشريط العلوي الأخضر الفخم (مع اللون الاخضر فوق والمعلومات فوق عاليسار) ================= */}
        <div className="rounded-2xl overflow-hidden shadow-2xl border border-emerald-500/50 shrink-0">
          {/* خط إضاءة علوي باللون الأخضر المميز */}
          <div className="h-1.5 w-full bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500" />

          <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-950 p-2 sm:p-2.5 md:px-6 flex items-center justify-between gap-2 text-white">
            {/* الجانب الأيمن (في RTL): زر الخروج + شعار نظام نمر + عنوان الاختبار */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
              <button
                onClick={handleRequestExit}
                className="p-1.5 sm:p-2 rounded-xl bg-emerald-900/80 hover:bg-emerald-800 text-emerald-100 hover:text-white border border-emerald-600/50 transition cursor-pointer shrink-0 shadow-sm"
                title="الخروج من الاختبار والعودة للمنصة"
              >
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1.5 min-w-0">
                <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-xl bg-emerald-500/25 border border-emerald-400/50 font-black text-[11px] sm:text-xs text-emerald-200 flex items-center gap-1 shrink-0 shadow-sm">
                  <span>🐅</span>
                  <span className="hidden sm:inline">نظام نمر</span>
                </span>
                <h2 className="text-xs sm:text-base font-black truncate max-w-[110px] sm:max-w-xs md:max-w-md">
                  {examTitle}
                </h2>
              </div>
            </div>

            {/* الجانب الأيسر (والمعلومات فوق عاليسار): اسم الطالب + الوقت + الهدف + عداد الأسئلة + إنهاء الاختبار */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* اسم الطالب */}
              <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-900/70 border border-emerald-500/40 text-xs font-black text-emerald-100 shadow-sm">
                <User className="w-3.5 h-3.5 text-emerald-300" />
                <span>الطالب: {currentUser?.name || 'طالب'}</span>
              </div>

              {/* مؤقت الاختبار أو تدريب حر */}
              <div>
                {isTimed ? (
                  <div className={`flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-xl border font-mono font-black text-xs sm:text-sm shadow-sm ${
                    timeLeft < 60
                      ? 'bg-rose-500/30 border-rose-400 text-rose-200 animate-pulse'
                      : 'bg-emerald-800/80 border-emerald-400/60 text-emerald-100'
                  }`}>
                    <Clock className="w-3.5 h-3.5 text-emerald-300" />
                    <span>{formatTime(timeLeft)}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl bg-emerald-800/60 border border-emerald-500/40 text-[10px] sm:text-[11px] font-black text-emerald-200">
                    <span>تدريب حر</span>
                  </div>
                )}
              </div>

              {/* عداد الأسئلة */}
              <div className="text-[11px] sm:text-xs font-black px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl bg-emerald-900/70 border border-emerald-500/40 text-emerald-100 shrink-0">
                <span>{currentIdx + 1}/{safeQuestions.length}</span>
              </div>

              {/* زر إنهاء الاختبار وتسليم الإجابات */}
              <button
                type="button"
                onClick={finishTest}
                className="px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs sm:text-sm transition shadow-lg shadow-rose-600/30 cursor-pointer shrink-0"
              >
                إنهاء
              </button>
            </div>
          </div>
        </div>

        {/* ================= 2. جسم الاختبار في نظام نمر =================
            في تخطيط RTL:
            - العنصر الأول يظهر على اليمين: صورة السؤال والاختيارات
            - العنصر الثاني يظهر على اليسار: عدد وقائمة الأسئلة
        */}
        <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0 overflow-y-auto lg:overflow-hidden">
          {/* ================= أ. صورة السؤال والاختيارات عاليمين (Right Column in RTL) ================= */}
          <div className={`flex-1 min-w-0 flex flex-col justify-between border-2 border-emerald-500/40 rounded-3xl p-4 sm:p-6 md:p-7 shadow-2xl backdrop-blur-xl overflow-y-auto ${
            isDarkMode ? 'bg-slate-900/90 text-white' : 'bg-white text-slate-900'
          }`}>
            {/* Question Header */}
            <div>
              <div className="flex items-center justify-between pb-3.5 border-b border-emerald-500/20 mb-4 gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-black text-xs md:text-sm">
                    سؤال رقم {currentIdx + 1}
                  </span>
                  {currentQCustomFolders.map((cf) => (
                    <span
                      key={cf.id}
                      className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold"
                    >
                      📁 {cf.title}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowFolderModalForQ(currentQ)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-black transition shadow-sm cursor-pointer ${
                      isDarkMode
                        ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-amber-500/30'
                        : 'bg-amber-50 hover:bg-amber-100 text-amber-950 border-amber-400'
                    }`}
                    title="إضافة السؤال إلى مجلد أو حذفه منه"
                  >
                    <FolderPlus className="w-4 h-4 text-amber-500" />
                    <span>إدارة مجلدات السؤال</span>
                  </button>
                </div>
              </div>

              {/* Question Text */}
              <h3 className={`text-base sm:text-lg md:text-xl font-black leading-relaxed ${
                isDarkMode ? 'text-white' : 'text-slate-950'
              }`}>
                {currentQ.questionText}
              </h3>

              {/* Question Image (صورة السؤال عاليمين) */}
              {currentQ.imageUrl && (
                <div className="relative group max-w-xl mx-auto w-full my-4">
                  <div
                    onClick={() => {
                      setZoomedImageUrl(currentQ.imageUrl || null);
                      setImageZoomScale(1);
                    }}
                    className="rounded-2xl overflow-hidden border-2 border-emerald-500/40 hover:border-emerald-400 bg-black/40 max-h-72 flex items-center justify-center p-2 cursor-pointer transition shadow-xl"
                    title="انقر لتكبير صورة السؤال"
                  >
                    <img
                      src={currentQ.imageUrl}
                      alt="صورة السؤال"
                      className="max-h-64 max-w-full object-contain rounded-xl transition-transform duration-200 group-hover:scale-[1.01]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setZoomedImageUrl(currentQ.imageUrl || null);
                      setImageZoomScale(1);
                    }}
                    className="absolute top-2 left-2 px-3 py-1.5 rounded-xl bg-black/80 hover:bg-black text-amber-300 text-xs font-bold border border-amber-500/40 flex items-center gap-1.5 shadow-lg backdrop-blur-md transition cursor-pointer"
                  >
                    <ZoomIn className="w-3.5 h-3.5 text-amber-400" />
                    <span>تكبير الصورة 🔍</span>
                  </button>
                </div>
              )}

              {/* 4 Choices / Options (الاختيارات عاليمين) */}
              <div className="space-y-3 pt-4">
                {safeOptions.map((option, optIdx) => {
                  const isSelected = selectedAnswers[currentIdx] === optIdx;
                  const letter = optIdx === 0 ? 'أ' : optIdx === 1 ? 'ب' : optIdx === 2 ? 'ج' : 'د';

                  return (
                    <button
                      key={optIdx}
                      type="button"
                      onClick={() => handleSelectOption(currentIdx, optIdx)}
                      className={`w-full text-right p-4 rounded-2xl border-2 transition-all duration-150 flex items-center justify-between text-xs sm:text-sm md:text-base font-black cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-600/25 border-emerald-400 text-white ring-2 ring-emerald-400 shadow-lg shadow-emerald-500/10'
                          : isDarkMode
                          ? 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/80 hover:border-emerald-500/50 text-slate-200'
                          : 'bg-white hover:bg-emerald-50/50 border-slate-300 hover:border-emerald-400 text-slate-900 shadow-sm'
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs md:text-sm font-black transition-all ${
                          isSelected
                            ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                            : isDarkMode
                            ? 'bg-slate-700 text-slate-200'
                            : 'bg-slate-100 text-slate-800 border border-slate-300'
                        }`}>
                          {letter}
                        </span>
                        <span className={isSelected ? 'font-black text-white' : ''}>{option}</span>
                      </div>

                      {isSelected && (
                        <div className="w-6 h-6 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0">
                          <Check className="w-4 h-4 stroke-[3]" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom Question Navigation Toolbar */}
            <div className="pt-4 mt-4 border-t border-emerald-500/20 flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={currentIdx === 0}
                onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                className="flex items-center gap-1.5 px-3.5 py-2 sm:px-5 sm:py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs sm:text-sm border border-slate-700 transition cursor-pointer shrink-0"
              >
                <ArrowRight className="w-4 h-4" />
                <span>السابق</span>
              </button>

              {/* Mobile Questions List Toggle Button */}
              <button
                type="button"
                onClick={() => setShowMobileQuestionsList(true)}
                className="lg:hidden flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-emerald-950/90 hover:bg-emerald-900 border border-emerald-500/50 text-emerald-300 font-black text-xs shadow-md transition cursor-pointer"
                title="عرض قائمة جميع الأسئلة"
              >
                <HelpCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>الأسئلة ({currentIdx + 1}/{safeQuestions.length})</span>
              </button>

              {currentIdx < safeQuestions.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setCurrentIdx((i) => Math.min(safeQuestions.length - 1, i + 1))}
                  className="flex items-center gap-1.5 px-4 py-2 sm:px-6 sm:py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm shadow-lg shadow-emerald-600/30 transition cursor-pointer shrink-0"
                >
                  <span>التالي</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={finishTest}
                  className="flex items-center gap-1.5 px-4 py-2 sm:px-6 sm:py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs sm:text-sm shadow-xl shadow-emerald-500/30 transition cursor-pointer shrink-0"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>إنهاء الإجابات</span>
                </button>
              )}
            </div>

            {/* Quick Actions Strip on Mobile */}
            <div className="grid grid-cols-4 gap-1.5 pt-2.5 border-t border-emerald-500/20 lg:hidden mt-2.5">
              <button
                type="button"
                onClick={() => setShowSectionModal(true)}
                className="py-1.5 px-1 rounded-xl bg-slate-800/90 text-slate-200 border border-slate-700 text-[10px] font-black flex flex-col items-center justify-center gap-1 hover:border-emerald-500/40 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                <span className="truncate">تعليمات القسم</span>
              </button>
              <button
                type="button"
                onClick={() => setShowExamInstructionsModal(true)}
                className="py-1.5 px-1 rounded-xl bg-slate-800/90 text-slate-200 border border-slate-700 text-[10px] font-black flex flex-col items-center justify-center gap-1 hover:border-emerald-500/40 cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5 text-blue-400" />
                <span className="truncate">تعليمات الاختبار</span>
              </button>
              <button
                type="button"
                onClick={() => setShowEquationsModal(true)}
                className="py-1.5 px-1 rounded-xl bg-slate-800/90 text-slate-200 border border-slate-700 text-[10px] font-black flex flex-col items-center justify-center gap-1 hover:border-emerald-500/40 cursor-pointer"
              >
                <Calculator className="w-3.5 h-3.5 text-amber-400" />
                <span className="truncate">المعادلات</span>
              </button>
              <button
                type="button"
                onClick={finishTest}
                className="py-1.5 px-1 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white border border-rose-500 text-[10px] font-black flex flex-col items-center justify-center gap-1 shadow-sm cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="truncate">إنهاء</span>
              </button>
            </div>

          </div>

          {/* ================= ب. عدد الاسئلة عاليسار (Left Column in RTL) ================= */}
          <div className={`hidden lg:flex w-72 xl:w-80 shrink-0 flex-col justify-between border-2 border-emerald-500/40 rounded-3xl p-3.5 sm:p-4 shadow-2xl backdrop-blur-xl ${
            isDarkMode ? 'bg-slate-900/90 text-white' : 'bg-white text-slate-900'
          }`}>
            {/* 1. فوق الأسئلة: صورة شخص مجهول + اسم الطالب + رقم الهوية + أرقام عشوائية */}
            <div className="p-3 rounded-2xl bg-slate-800/80 border border-emerald-500/30 flex flex-col items-center text-center shadow-md mb-2.5">
              {/* صورة شخص مجهول */}
              <div className="w-16 h-20 sm:w-20 sm:h-24 rounded-2xl bg-gradient-to-b from-slate-700 via-slate-800 to-slate-900 border-2 border-emerald-500/50 flex flex-col items-center justify-center shadow-inner relative overflow-hidden mb-2">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-500/80 flex items-center justify-center mt-1 mb-1">
                  <User className="w-5 h-5 sm:w-6 sm:h-6 text-slate-300" />
                </div>
                <div className="w-12 sm:w-14 h-6 sm:h-7 rounded-t-full bg-slate-500/80" />
                <span className="absolute bottom-0.5 inset-x-0 text-[8px] font-black bg-black/60 text-emerald-300 py-0.5">
                  صورة المرشح
                </span>
              </div>

              {/* وتحتيه اسم الطالب في المنصة */}
              <h4 className="text-xs sm:text-sm font-black text-white truncate max-w-full">
                {currentUser?.name || 'طالب المنصة'}
              </h4>

              {/* وتحتيه رقم الهوية وجنبيه ارقام عشوائية */}
              <div className="mt-1.5 flex items-center justify-center gap-1.5 flex-wrap text-[10px] sm:text-[11px] font-mono">
                <span className="px-2 py-0.5 rounded-lg bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 font-bold">
                  الهوية: {nationalId}
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-slate-900/90 border border-slate-700 text-amber-300 font-bold" title="رقم الجلسة المرجعي العشوائي">
                  #{randomSessionDigits}
                </span>
              </div>
            </div>

            {/* Header: عداد وقائمة الأسئلة */}
            <div className="pb-2 border-b border-emerald-500/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="p-1.5 rounded-xl bg-emerald-500/20 text-emerald-400">
                    <HelpCircle className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h3 className="font-black text-xs sm:text-sm text-emerald-400">
                      قائمة الأسئلة
                    </h3>
                    <span className="text-[10px] text-slate-400 font-bold block">
                      إجمالي {safeQuestions.length} سؤال
                    </span>
                  </div>
                </div>
                <span className="text-xs font-mono font-black px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  %{progressPercent}
                </span>
              </div>

              {/* Status Legend */}
              <div className="flex items-center justify-between text-[11px] pt-1.5 text-slate-400 font-bold">
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                  <span>تم: {answeredCount}</span>
                </span>
                <span className="flex items-center gap-1 text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-slate-600 inline-block" />
                  <span>متبقي: {safeQuestions.length - answeredCount}</span>
                </span>
              </div>
            </div>

            {/* Scrollable Questions Grid */}
            <div className="py-2 flex-1 overflow-y-auto max-h-[28vh] lg:max-h-[32vh] pr-1">
              <div className="grid grid-cols-5 gap-1.5">
                {safeQuestions.map((_, i) => {
                  const isCurrent = i === currentIdx;
                  const isAnswered = selectedAnswers[i] !== undefined;

                  let btnClass = 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700';
                  if (isCurrent) {
                    btnClass = 'bg-emerald-500 text-slate-950 font-black ring-2 ring-emerald-300 shadow-md scale-105';
                  } else if (isAnswered) {
                    btnClass = 'bg-emerald-600/30 text-emerald-300 border-emerald-500/60 font-black';
                  }

                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setCurrentIdx(i)}
                      className={`h-8 rounded-xl text-xs font-bold border transition-all flex items-center justify-center relative cursor-pointer ${btnClass}`}
                      title={`الانتقال للسؤال رقم ${i + 1}`}
                    >
                      <span>{i + 1}</span>
                      {isAnswered && !isCurrent && (
                        <span className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* وتحت الاسئلة عاليسار ضيف 4 مستطيلات: تعليمات القسم وتعليمات الاختبار والمعادلات وانهاء الاختبار باللون الاحمر */}
            <div className="pt-2.5 border-t border-emerald-500/20 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {/* مستطيل 1: تعليمات القسم */}
                <button
                  type="button"
                  onClick={() => setShowSectionModal(true)}
                  className="h-10 px-2 rounded-xl bg-slate-800/90 hover:bg-slate-750 text-slate-200 hover:text-white border border-slate-700 hover:border-emerald-500/50 text-[11px] font-black transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  title="عرض تعليمات القسم الحالي"
                >
                  <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate">تعليمات القسم</span>
                </button>

                {/* مستطيل 2: تعليمات الاختبار */}
                <button
                  type="button"
                  onClick={() => setShowExamInstructionsModal(true)}
                  className="h-10 px-2 rounded-xl bg-slate-800/90 hover:bg-slate-750 text-slate-200 hover:text-white border border-slate-700 hover:border-emerald-500/50 text-[11px] font-black transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  title="عرض تعليمات وضوابط الاختبار العامة"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="truncate">تعليمات الاختبار</span>
                </button>

                {/* مستطيل 3: المعادلات */}
                <button
                  type="button"
                  onClick={() => setShowEquationsModal(true)}
                  className="h-10 px-2 rounded-xl bg-slate-800/90 hover:bg-slate-750 text-slate-200 hover:text-white border border-slate-700 hover:border-emerald-500/50 text-[11px] font-black transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  title="عرض ورقة القوانين والمعادلات الرياضية"
                >
                  <Calculator className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="truncate">المعادلات</span>
                </button>

                {/* مستطيل 4: انهاء الاختبار باللون الاحمر */}
                <button
                  type="button"
                  onClick={finishTest}
                  className="h-10 px-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black border border-rose-500 text-[11px] transition flex items-center justify-center gap-1.5 shadow-lg shadow-rose-600/30 cursor-pointer"
                  title="إنهاء وتسليم إجابات الاختبار"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">إنهاء الاختبار</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ================= Mobile Questions List Modal / Sheet ================= */}
        {showMobileQuestionsList && (
          <div
            onClick={() => setShowMobileQuestionsList(false)}
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-sm lg:hidden animate-in fade-in duration-150"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg max-h-[85vh] rounded-t-3xl sm:rounded-3xl border-2 border-emerald-500/50 bg-slate-900 text-white shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="p-3.5 border-b border-emerald-500/20 flex items-center justify-between bg-emerald-950/70">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-xl bg-emerald-500/20 text-emerald-400">
                    <HelpCircle className="w-4 h-4" />
                  </span>
                  <div>
                    <h3 className="font-black text-sm text-emerald-300">قائمة الأسئلة ومعلومات الطالب</h3>
                    <span className="text-[10px] text-emerald-400 font-bold">
                      تمت الإجابة: {answeredCount} من {safeQuestions.length} ({progressPercent}%)
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMobileQuestionsList(false)}
                  className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Candidate Info Snippet */}
              <div className="p-3 bg-slate-800/60 border-b border-emerald-500/20 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-emerald-600/30 text-emerald-300 flex items-center justify-center font-bold text-xs shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                  <span className="font-bold truncate">{currentUser?.name || 'طالب المنصة'}</span>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                  <span className="text-emerald-300 bg-black/40 px-2 py-0.5 rounded-lg border border-slate-700">
                    {nationalId}
                  </span>
                  <span className="text-amber-300 bg-black/40 px-2 py-0.5 rounded-lg border border-slate-700">
                    #{randomSessionDigits}
                  </span>
                </div>
              </div>

              {/* Questions Grid */}
              <div className="p-3.5 overflow-y-auto flex-1 max-h-[50vh]">
                <div className="grid grid-cols-5 gap-2">
                  {safeQuestions.map((_, i) => {
                    const isCurrent = i === currentIdx;
                    const isAnswered = selectedAnswers[i] !== undefined;

                    let btnClass = 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700';
                    if (isCurrent) {
                      btnClass = 'bg-emerald-500 text-slate-950 font-black ring-2 ring-emerald-300 shadow-md scale-105';
                    } else if (isAnswered) {
                      btnClass = 'bg-emerald-600/30 text-emerald-300 border-emerald-500/60 font-black';
                    }

                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setCurrentIdx(i);
                          setShowMobileQuestionsList(false);
                        }}
                        className={`h-9 rounded-xl text-xs font-bold border transition-all flex items-center justify-center relative cursor-pointer ${btnClass}`}
                      >
                        <span>{i + 1}</span>
                        {isAnswered && !isCurrent && (
                          <span className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="p-3 border-t border-emerald-500/20 bg-slate-900/90 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowMobileQuestionsList(false)}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition text-center cursor-pointer"
                >
                  إغلاق ومتابعة الاختبار ✓
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen lg:h-screen p-2 sm:p-3 md:p-4 gap-2 sm:gap-3 max-w-[1900px] mx-auto w-full pb-4 sm:pb-6 overflow-x-hidden ${
      isDarkMode ? 'text-white' : 'text-black'
    }`}>
      {systemMode === 'nimr' ? (
        renderNimrView()
      ) : (
        <>
          {/* Top Exam Header: Perfectly responsive on Mobile and Desktop */}
          <div className={`border rounded-2xl p-2.5 sm:p-3 md:px-6 shadow-xl shrink-0 ${
            isDarkMode ? 'bg-slate-900/95 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            {/* Mobile View: 2 neat rows */}
            <div className="flex flex-col gap-2 md:hidden">
          {/* Row 1: Back + Title + Timer */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={handleRequestExit}
                className={`p-2 rounded-xl transition shrink-0 ${
                  isDarkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-black hover:bg-slate-200 font-bold'
                }`}
                title="خروج من الاختبار والعودة للمنصة"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
              <div className="min-w-0">
                <h2 className={`text-xs sm:text-sm font-black flex items-center gap-1.5 truncate ${
                  isDarkMode ? 'text-white' : 'text-black'
                }`}>
                  <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="truncate">{examTitle}</span>
                </h2>
              </div>
            </div>

            {/* Timer Badge */}
            <div className="shrink-0">
              {isTimed ? (
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border font-mono font-bold text-xs ${
                  timeLeft < 60
                    ? 'bg-rose-500/20 border-rose-500 text-rose-600 animate-pulse'
                    : isDarkMode
                    ? 'bg-slate-800 border-slate-700 text-blue-300'
                    : 'bg-slate-100 border-slate-300 text-black'
                }`}>
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                  <span>{formatTime(timeLeft)}</span>
                </div>
              ) : (
                <div className="px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-[10px] font-black">
                  تدريب حر
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Progress Counter + Whiteboard Button + Finish Button */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/40">
            <span className={`text-[11px] font-bold shrink-0 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>
              سؤال {currentIdx + 1} من {safeQuestions.length} ({answeredCount} تم)
            </span>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Whiteboard button */}
              <button
                type="button"
                onClick={() => {
                  setIsWhiteboardOpen((prev) => {
                    const next = !prev;
                    setMobileViewMode(next ? 'whiteboard' : 'question');
                    return next;
                  });
                }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-[11px] font-black transition shadow-sm ${
                  isWhiteboardOpen
                    ? 'bg-rose-500/15 text-rose-500 border-rose-500/40'
                    : 'bg-indigo-600/20 text-indigo-500 border-indigo-500/40'
                }`}
              >
                {isWhiteboardOpen ? (
                  <>
                    <PanelLeftClose className="w-3.5 h-3.5" />
                    <span>قفل السبورة</span>
                  </>
                ) : (
                  <>
                    <PenTool className="w-3.5 h-3.5" />
                    <span>السبورة 📝</span>
                  </>
                )}
              </button>

              {/* Finish Button */}
              <button
                onClick={finishTest}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] transition shadow-md shadow-emerald-600/20"
              >
                إنهاء والنتيجة
              </button>
            </div>
          </div>
        </div>

        {/* Desktop View: Single Line */}
        <div className="hidden md:flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={handleRequestExit}
              className={`p-2 rounded-xl transition ${
                isDarkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-black hover:bg-slate-200 font-bold'
              }`}
              title="خروج من الاختبار والعودة للمنصة"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
            <div>
              <h2 className={`text-base md:text-lg font-black flex items-center gap-2 ${
                isDarkMode ? 'text-white' : 'text-black'
              }`}>
                <Zap className="w-5 h-5 text-amber-500" />
                <span>{examTitle}</span>
                {targetPercentage && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 border border-amber-500/30 font-black">
                    الهدف: %{targetPercentage}
                  </span>
                )}
              </h2>
              <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-black font-semibold'}`}>
                السؤال {currentIdx + 1} من {safeQuestions.length} • تم الإجابة على {answeredCount}
              </span>
            </div>
          </div>

          {/* Center/Right Controls */}
          <div className="flex items-center gap-2 md:gap-3">
            <button
              type="button"
              onClick={() => setIsWhiteboardOpen((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-xl border text-xs md:text-sm font-black transition shadow-md ${
                isWhiteboardOpen
                  ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-500 border-rose-500/40'
                  : 'bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-600 border-indigo-500/50'
              }`}
              title={isWhiteboardOpen ? 'قفل وإخفاء السبورة لتوسيع السؤال' : 'فتح وإظهار السبورة للرسم وحل المسائل'}
            >
              {isWhiteboardOpen ? (
                <>
                  <PanelLeftClose className="w-4 h-4 text-rose-500" />
                  <span>قفل السبورة</span>
                </>
              ) : (
                <>
                  <PenTool className="w-4 h-4 text-indigo-500" />
                  <span>فتح السبورة 📝</span>
                </>
              )}
            </button>

            {isTimed ? (
              <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border font-mono font-bold text-sm ${
                timeLeft < 60
                  ? 'bg-rose-500/20 border-rose-500 text-rose-600 animate-pulse'
                  : isDarkMode
                  ? 'bg-slate-800 border-slate-700 text-blue-300'
                  : 'bg-slate-100 border-slate-300 text-black'
              }`}>
                <Clock className="w-4 h-4 text-blue-500" />
                <span>{formatTime(timeLeft)}</span>
              </div>
            ) : (
              <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-xs font-black">
                تدريب حر مفتوح
              </div>
            )}

            <button
              onClick={finishTest}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs md:text-sm transition shadow-lg shadow-emerald-600/25"
            >
              إنهاء والنتيجة
            </button>
          </div>
        </div>
      </div>

      {/* Mobile view segmented tabs when whiteboard is toggled on ("بمنظور الهاتف داخل الاختبار كل شيء مرتب وموجود في اطار الهاتف") */}
      {isWhiteboardOpen && (
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/90 border border-slate-800 lg:hidden shrink-0">
          <button
            type="button"
            onClick={() => setMobileViewMode('question')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-black transition flex items-center justify-center gap-1.5 ${
              mobileViewMode === 'question'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>السؤال والخيارات</span>
            <span className="text-[10px] opacity-80 font-mono">({currentIdx + 1}/{safeQuestions.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileViewMode('whiteboard')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-black transition flex items-center justify-center gap-1.5 ${
              mobileViewMode === 'whiteboard'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>مسودة السبورة الذكية 🎨</span>
          </button>
        </div>
      )}

      {/* Main split view:
          - When whiteboard is open: QUESTION ON RIGHT (lg:col-span-5), WHITEBOARD ON LEFT (lg:col-span-7)
          - When whiteboard is closed: QUESTION FULL-WIDTH (lg:col-span-12 max-w-4xl mx-auto) for focused reading!
      */}
      <div className={`flex-1 grid grid-cols-1 ${isWhiteboardOpen ? 'lg:grid-cols-12' : 'lg:grid-cols-1 max-w-4xl mx-auto w-full'} gap-3 min-h-0`}>
        {/* ================= RIGHT SIDE (اليمين): QUESTION, IMAGE, CHOICES & FOLDER ACTIONS ================= */}
        <div className={`${isWhiteboardOpen ? 'lg:col-span-5 xl:col-span-5' : 'w-full'} ${isWhiteboardOpen && mobileViewMode === 'whiteboard' ? 'hidden lg:flex' : 'flex'} h-full flex-col border rounded-2xl p-3 sm:p-4 md:p-6 shadow-xl overflow-y-auto ${
          isDarkMode ? 'bg-slate-900/90 border-slate-800 text-white' : 'bg-white border-slate-200 text-black'
        }`}>
          {/* Question Index Bar & Action Toolbar */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-3 gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-blue-600 dark:text-blue-400">
                سؤال رقم {currentIdx + 1}
              </span>

              {/* Display custom user folders this question was saved to */}
              {currentQCustomFolders.map((cf) => (
                <span
                  key={cf.id}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-bold"
                >
                  📁 {cf.title}
                </span>
              ))}
            </div>

            {/* FOLDER ADD / REMOVE BUTTON ON QUESTION */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFolderModalForQ(currentQ)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-black transition shadow-sm ${
                  isDarkMode
                    ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-amber-500/30'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-950 border-amber-400'
                }`}
                title="إضافة السؤال إلى مجلد أو حذفه منه"
              >
                <FolderPlus className="w-4 h-4 text-amber-500" />
                <span>إضافة / حذف من مجلد</span>
              </button>

              {!isWhiteboardOpen && (
                <button
                  type="button"
                  onClick={() => {
                    setIsWhiteboardOpen(true);
                    setMobileViewMode('whiteboard');
                  }}
                  className={`hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition ${
                    isDarkMode
                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/30'
                      : 'bg-indigo-50 text-indigo-900 border-indigo-200 hover:bg-indigo-100'
                  }`}
                  title="فتح السبورة"
                >
                  <PenTool className="w-3.5 h-3.5 text-indigo-500" />
                  <span>فتح السبورة</span>
                </button>
              )}
            </div>
          </div>

          {/* Numbers pagination strip: neat horizontal scroll on mobile */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2.5 mb-2.5 border-b border-slate-200 dark:border-slate-800/60 max-w-full">
            {safeQuestions.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIdx(i)}
                className={`w-7 h-7 sm:w-6 sm:h-6 shrink-0 rounded-lg text-xs font-black transition ${
                  i === currentIdx
                    ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                    : selectedAnswers[i] !== undefined
                    ? isDarkMode
                      ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                      : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                    : isDarkMode
                    ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    : 'bg-slate-100 text-black border border-slate-200 hover:bg-slate-200'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          {/* Question Text */}
          <div className="space-y-4 flex-1 flex flex-col justify-between">
            <div className="space-y-4">
              <h3 className={`text-base md:text-lg font-black leading-relaxed ${
                isDarkMode ? 'text-white' : 'text-black'
              }`}>
                {currentQ.questionText}
              </h3>

              {/* Optional Question Image with Click to Zoom ("اجعل الطالب داخل الاختبار يمكنه تكبير صورة السؤال") */}
              {currentQ.imageUrl && (
                <div className="relative group max-w-xl mx-auto w-full">
                  <div
                    onClick={() => {
                      setZoomedImageUrl(currentQ.imageUrl || null);
                      setImageZoomScale(1);
                    }}
                    className="rounded-2xl overflow-hidden border-2 border-slate-300 dark:border-slate-700 hover:border-amber-400 dark:hover:border-amber-400 bg-black/40 max-h-72 flex items-center justify-center p-2 cursor-pointer transition shadow-md"
                    title="انقر لتكبير صورة السؤال"
                  >
                    <img
                      src={currentQ.imageUrl}
                      alt="صورة توضيحية للسؤال"
                      className="max-h-64 max-w-full object-contain rounded-xl transition-transform duration-200 group-hover:scale-[1.02]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setZoomedImageUrl(currentQ.imageUrl || null);
                      setImageZoomScale(1);
                    }}
                    className="absolute top-2 left-2 px-3 py-1.5 rounded-xl bg-black/80 hover:bg-black text-amber-300 text-xs font-bold border border-amber-500/40 flex items-center gap-1.5 shadow-lg backdrop-blur-md transition cursor-pointer"
                  >
                    <ZoomIn className="w-3.5 h-3.5 text-amber-400" />
                    <span>تكبير الصورة 🔍</span>
                  </button>
                </div>
              )}

              {/* 4 Answer Options */}
              <div className="space-y-2.5 pt-2">
                {safeOptions.map((option, optIdx) => {
                  const isSelected = selectedAnswers[currentIdx] === optIdx;
                  return (
                    <button
                      key={optIdx}
                      type="button"
                      onClick={() => handleSelectOption(currentIdx, optIdx)}
                      className={`w-full text-right p-3.5 rounded-2xl border transition-all duration-150 flex items-center justify-between text-xs md:text-sm font-black ${
                        isSelected
                          ? isDarkMode
                            ? 'bg-blue-600/25 border-blue-400 text-white ring-1 ring-blue-400 shadow-md'
                            : 'bg-blue-50 border-blue-600 text-black ring-2 ring-blue-500 shadow-sm'
                          : isDarkMode
                          ? 'bg-slate-800/50 hover:bg-slate-800 border-slate-700/80 hover:border-slate-600 text-slate-200'
                          : 'bg-white hover:bg-slate-50 border-slate-300 hover:border-blue-400 text-black font-black'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : isDarkMode
                            ? 'bg-slate-700 text-slate-300'
                            : 'bg-slate-100 text-black border border-slate-300'
                        }`}>
                          {optIdx === 0 ? 'أ' : optIdx === 1 ? 'ب' : optIdx === 2 ? 'ج' : 'د'}
                        </span>
                        <span className={isSelected ? 'font-black' : ''}>{option}</span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-blue-600" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Next / Prev Navigation */}
            <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setCurrentIdx((prev) => Math.max(0, prev - 1))}
                disabled={currentIdx === 0}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition disabled:opacity-30 border ${
                  isDarkMode
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    : 'bg-slate-100 hover:bg-slate-200 text-black border-slate-300'
                }`}
              >
                <ArrowRight className="w-4 h-4" />
                <span>السابق</span>
              </button>

              <span className={`text-xs font-black ${isDarkMode ? 'text-slate-400' : 'text-black'}`}>
                {currentIdx + 1} / {safeQuestions.length}
              </span>

              {currentIdx < safeQuestions.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setCurrentIdx((prev) => Math.min(safeQuestions.length - 1, prev + 1))}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black transition shadow-md shadow-blue-600/20"
                >
                  <span>التالي</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={finishTest}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition shadow-md shadow-emerald-600/20"
                >
                  <Award className="w-4 h-4" />
                  <span>إنهاء الاختبار</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ================= LEFT SIDE (اليسار): INTERACTIVE WHITEBOARD ================= */}
        {isWhiteboardOpen && (
          <div className={`lg:col-span-7 xl:col-span-7 ${mobileViewMode === 'question' ? 'hidden lg:flex' : 'flex'} min-h-[380px] h-[65vh] sm:h-[500px] lg:h-full border rounded-2xl shadow-xl overflow-hidden flex-col transition-all ${
            isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <Whiteboard isDark={isDarkMode} />
          </div>
        )}
      </div>
        </>
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
                    القوانين المعتمدة للاختبارات الكمية للقدرات والتحصيلي
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
