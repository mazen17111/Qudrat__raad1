import React, { useState, useEffect } from 'react';
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
  durationMinutes?: number;
  targetPercentage?: number;
  isDarkMode?: boolean;
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
  durationMinutes,
  targetPercentage = 90,
  isDarkMode = true,
}) => {
  // Normalize and guard questions to completely eliminate any possibility of an empty or broken screen
  const safeQuestions: ExamQuestion[] = (Array.isArray(questions) && questions.length > 0)
    ? questions.map((q, idx) => ({
        id: q?.id || `q_${idx}`,
        questionText: q?.questionText || `سؤال ${idx + 1}`,
        imageUrl: q?.imageUrl || '',
        options: (Array.isArray(q?.options) && q.options.length > 0)
          ? q.options
          : ['الخيار أ', 'الخيار ب', 'الخيار ج', 'الخيار د'],
        correctOptionIndex: typeof q?.correctOptionIndex === 'number' ? q.correctOptionIndex : 0,
        explanation: q?.explanation || '',
      }))
    : [];

  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [isFinished, setIsFinished] = useState(false);
  const [isTimed] = useState(isTimedInitial);

  // 1. Whiteboard visibility toggle: allows the student to collapse/expand whiteboard anytime
  const [isWhiteboardOpen, setIsWhiteboardOpen] = useState(true);

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

  // 4. Zoom Question Image Lightbox
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);
  const [imageZoomScale, setImageZoomScale] = useState<number>(1);

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
    const unsub = onSnapshot(q, (snapshot) => {
      const list: FolderItem[] = [];
      snapshot.forEach((d) => {
        const item = { id: d.id, ...d.data() } as FolderItem;
        if (item.isDefaultMistakesFolder || item.title === 'مجلد الاخطاء') {
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
    });

    return () => unsub();
  }, [currentUser?.id]);

  // Subscribe to all questions the user has in folders in real-time
  useEffect(() => {
    if (!currentUser?.id) return;
    const qFQ = query(
      collection(db, 'folder_questions'),
      where('userId', '==', currentUser.id)
    );
    const unsubFQ = onSnapshot(qFQ, (snapshot) => {
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
    });

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

  // Ensure default Mistakes Folder exists for this student
  const ensureMistakesFolderExists = async (): Promise<string | null> => {
    if (!currentUser?.id) return null;

    const existing = userFolders.find(
      (f) => f.isDefaultMistakesFolder || f.title === 'مجلد الاخطاء'
    );
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
        if (d.isDefaultMistakesFolder || d.title === 'مجلد الاخطاء') {
          foundId = docSnap.id;
        }
      });

      if (foundId) return foundId;

      const newRef = await addDoc(collection(db, 'folders'), {
        userId: currentUser.id,
        title: 'مجلد الاخطاء',
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
    if (!currentUser?.id) return;
    if (autoSavedMistakeIds[question.id]) return; // Avoid duplicate saves

    setAutoSavedMistakeIds((prev) => ({ ...prev, [question.id]: true }));

    try {
      const folderId = await ensureMistakesFolderExists();
      if (!folderId) return;

      const dupQuery = query(
        collection(db, 'folder_questions'),
        where('folderId', '==', folderId),
        where('userId', '==', currentUser.id)
      );
      const dupSnap = await getDocs(dupQuery);
      let alreadySaved = false;
      dupSnap.forEach((d) => {
        const data = d.data();
        if (
          data.originalQuestionId === question.id ||
          data.questionText === question.questionText
        ) {
          alreadySaved = true;
        }
      });

      if (!alreadySaved) {
        await addDoc(collection(db, 'folder_questions'), {
          folderId: folderId,
          userId: currentUser.id,
          originalQuestionId: question.id,
          questionText: question.questionText,
          imageUrl: question.imageUrl || '',
          options: question.options,
          correctOptionIndex: question.correctOptionIndex,
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

  // Option select handler: records answer and transfers mistakes SILENTLY
  const handleSelectOption = (qIdx: number, optionIdx: number) => {
    if (isFinished) return;
    setSelectedAnswers((prev) => ({
      ...prev,
      [qIdx]: optionIdx,
    }));

    const question = safeQuestions[qIdx];
    if (question && optionIdx !== question.correctOptionIndex) {
      // Transfer silently in background without student knowing during test!
      autoTransferMistakeSilently(question, optionIdx);
    }
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
        title: trimmed,
        isDefaultMistakesFolder: false,
        createdAt: new Date().toISOString(),
      });

      const newFolderItem: FolderItem = {
        id: newRef.id,
        userId: currentUser.id,
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

    // Also ensure all mistakes or unanswered questions are transferred silently to Mistakes folder
    safeQuestions.forEach((q, idx) => {
      const ans = selectedAnswers[idx];
      if (ans !== q.correctOptionIndex && !autoSavedMistakeIds[q.id]) {
        autoTransferMistakeSilently(q, typeof ans === 'number' ? ans : -1);
      }
    });

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

  // Helper to find existing record for a given question in a given folder
  const findFolderQuestionMatch = (question: ExamQuestion, folderId: string) => {
    return userFolderQuestions.find(
      (fq) => fq.folderId === folderId && (fq.originalQuestionId === question.id || fq.questionText === question.questionText)
    );
  };

  // Helper to get all non-mistakes folders that currently contain this question
  const getCustomFoldersForQuestion = (question: ExamQuestion) => {
    const mistakeFolder = userFolders.find((f) => f.isDefaultMistakesFolder || f.title === 'مجلد الاخطاء');
    return userFolders.filter((f) => {
      if (f.id === mistakeFolder?.id) return false;
      return userFolderQuestions.some(
        (fq) => fq.folderId === f.id && (fq.originalQuestionId === question.id || fq.questionText === question.questionText)
      );
    });
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
          onClick={onExit}
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
                onClick={onExit}
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
      </div>
    );
  }

  // Safe active question
  const currentQ = safeQuestions[currentIdx] || safeQuestions[0];
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
                <h3 className={`text-base font-black ${isDarkMode ? 'text-white' : 'text-black'}`}>إدارة مجلدات السؤال</h3>
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

  // Calculate progress percent
  const progressPercent = Math.round(((currentIdx + 1) / safeQuestions.length) * 100);

  return (
    <div className={`flex flex-col min-h-screen lg:h-screen p-2 md:p-4 gap-3 max-w-[1900px] mx-auto w-full pb-6 ${
      isDarkMode ? 'text-white' : 'text-black'
    }`}>
      {/* Top Exam Header with Whiteboard Toggle & Timer */}
      <div className={`border rounded-2xl p-3 md:px-6 flex items-center justify-between shadow-xl shrink-0 gap-3 ${
        isDarkMode ? 'bg-slate-900/95 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className={`p-2 rounded-xl transition ${
              isDarkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-black hover:bg-slate-200 font-bold'
            }`}
            title="خروج من الاختبار"
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

        {/* Center/Right Controls: Whiteboard Toggle + Timer + Finish */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* WHITEBOARD TOGGLE: قفل السبورة وفتحها */}
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

          {/* Timer or Untimed indicator */}
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
            <div className="hidden sm:flex px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-xs font-black">
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

      {/* Main split view:
          - When whiteboard is open: QUESTION ON RIGHT (lg:col-span-5), WHITEBOARD ON LEFT (lg:col-span-7)
          - When whiteboard is closed: QUESTION FULL-WIDTH (lg:col-span-12 max-w-4xl mx-auto) for focused reading!
      */}
      <div className={`flex-1 grid grid-cols-1 ${isWhiteboardOpen ? 'lg:grid-cols-12' : 'lg:grid-cols-1 max-w-4xl mx-auto w-full'} gap-3 min-h-0`}>
        {/* ================= RIGHT SIDE (اليمين): QUESTION, IMAGE, CHOICES & FOLDER ACTIONS ================= */}
        <div className={`${isWhiteboardOpen ? 'lg:col-span-5 xl:col-span-5' : 'w-full'} h-full flex flex-col border rounded-2xl p-4 md:p-6 shadow-xl overflow-y-auto ${
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
                  onClick={() => setIsWhiteboardOpen(true)}
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

          {/* Numbers pagination strip */}
          <div className="flex items-center gap-1 flex-wrap pb-3 mb-3 border-b border-slate-200 dark:border-slate-800/60">
            {safeQuestions.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIdx(i)}
                className={`w-6 h-6 rounded-lg text-xs font-black transition ${
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
                {currentQ.options.map((option, optIdx) => {
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
          <div className={`lg:col-span-7 xl:col-span-7 h-[500px] lg:h-full border rounded-2xl shadow-xl overflow-hidden flex flex-col transition-all ${
            isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <Whiteboard isDark={isDarkMode} />
          </div>
        )}
      </div>

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

      {/* Render Folder Picker Modal */}
      {renderFolderModal()}
    </div>
  );
};
