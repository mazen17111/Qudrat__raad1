import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Send,
  MessageCircle,
  Target,
  Users,
  Trophy,
  Play,
  Check,
  Copy,
  Share2,
  Shuffle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Award,
  Clock,
  Layers,
  FileCheck,
  Flame,
  ChevronLeft
} from 'lucide-react';
import {
  StudentUser,
  SystemSettings,
  FeaturesConfig,
  SectionItem,
  ResourceItem,
  ContentItem,
  ExamQuestion,
  FriendChallengeDoc,
  FriendChallengeParticipant,
  FriendChallengeQuestionRef
} from '../types';
import { db } from '../firebase';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  onSnapshot,
  query,
  where
} from 'firebase/firestore';

interface FeaturesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: StudentUser;
  systemSettings: SystemSettings;
  courseTitle?: string;
  courseId?: string;
  featuresConfig?: FeaturesConfig;
  isDarkMode: boolean;
  sections: SectionItem[];
  resources: ResourceItem[];
  contentItems: ContentItem[];
  onStartDiagnosticExam: (examData: {
    title: string;
    questions: ExamQuestion[];
    durationMinutes?: number;
    isTimed: boolean;
    targetPercentage?: number;
  }) => void;
}

export const FeaturesModal: React.FC<FeaturesModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  systemSettings,
  courseTitle,
  courseId,
  featuresConfig,
  isDarkMode,
  sections,
  resources,
  contentItems,
  onStartDiagnosticExam,
}) => {
  // Navigation inside the features modal
  const [activeView, setActiveView] = useState<'main' | 'diagnostic' | 'challenge'>('main');

  // ================= 1. DIAGNOSTIC EXAM STATE =================
  const [selectedDiagnosticResource, setSelectedDiagnosticResource] = useState<string>('all');
  const [diagnosticMode, setDiagnosticMode] = useState<'random' | 'manual'>('random');
  const [diagnosticRandomCount, setDiagnosticRandomCount] = useState<number>(3);
  const [diagnosticManualSelectedIds, setDiagnosticManualSelectedIds] = useState<string[]>([]);
  const [diagnosticIsTimed, setDiagnosticIsTimed] = useState<boolean>(true);
  const [diagnosticShuffleCounter, setDiagnosticShuffleCounter] = useState<number>(0);
  const [diagnosticShuffleNotice, setDiagnosticShuffleNotice] = useState<string>('');

  // ================= 2. FRIEND CHALLENGE STATE =================
  const [challengeTab, setChallengeTab] = useState<'create' | 'join'>('create');
  const [challengeExamCount, setChallengeExamCount] = useState<number>(3);
  const [challengeExamSelectionMode, setChallengeExamSelectionMode] = useState<'random' | 'manual'>('random');
  const [challengeManualExamIds, setChallengeManualExamIds] = useState<string[]>([]);
  const [createdChallenge, setCreatedChallenge] = useState<FriendChallengeDoc | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [joinError, setJoinError] = useState<string>('');
  const [isJoining, setIsJoining] = useState<boolean>(false);
  const [activeChallengeRoom, setActiveChallengeRoom] = useState<FriendChallengeDoc | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [isRegeneratingCode, setIsRegeneratingCode] = useState<boolean>(false);
  const [codeRegeneratedNotice, setCodeRegeneratedNotice] = useState<string>('');
  const [challengeShuffleCounter, setChallengeShuffleCounter] = useState<number>(0);
  const [challengeShuffleNotice, setChallengeShuffleNotice] = useState<string>('');

  // In-game state for active challenge
  const [challengeCurrentQIdx, setChallengeCurrentQIdx] = useState<number>(0);
  const [challengeAnswers, setChallengeAnswers] = useState<Record<number, number>>({});
  const [isSubmittingChallengeAnswer, setIsSubmittingChallengeAnswer] = useState<boolean>(false);

  // Reset to main view whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveView('main');
      setJoinError('');
    }
  }, [isOpen]);

  // Extract all available internal exams from contentItems
  const allPlatformExams = contentItems.filter(
    (item) => item.type === 'exam' && !item.isExternal && Array.isArray(item.questions) && item.questions.length > 0
  );

  // Filtered exams according to selected diagnostic resource
  const filteredDiagnosticExams = selectedDiagnosticResource === 'all'
    ? allPlatformExams
    : allPlatformExams.filter((item) => item.resourceId === selectedDiagnosticResource);

  // Real-time listener when inside an active challenge room or waiting room
  useEffect(() => {
    const targetRoomId = activeChallengeRoom?.id || createdChallenge?.id;
    if (!targetRoomId) return;

    const unsub = onSnapshot(doc(db, 'challenges', targetRoomId), (docSnap) => {
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() } as FriendChallengeDoc;
        if (createdChallenge && !activeChallengeRoom) {
          setCreatedChallenge(data);
          // If a guest just joined and status is active, enter arena!
          if (data.status === 'active' || (data.guestId && data.status !== 'waiting')) {
            setActiveChallengeRoom(data);
          }
        } else if (activeChallengeRoom) {
          setActiveChallengeRoom(data);
        }
      }
    });

    return () => unsub();
  }, [activeChallengeRoom?.id, createdChallenge?.id]);

  // ================= IN-GAME: Hydrated Challenge Questions Hook (Always called unconditionally at top level) =================
  const activeQuestions: ExamQuestion[] = React.useMemo(() => {
    if (!activeChallengeRoom) return [];

    // Priority 1: Hydrate from questionRefs using contentItems (preserves original full images without Firestore bloat!)
    if (activeChallengeRoom.questionRefs && activeChallengeRoom.questionRefs.length > 0) {
      const hydrated: ExamQuestion[] = [];
      activeChallengeRoom.questionRefs.forEach((ref, idx) => {
        const exam = contentItems.find((item) => item.id === ref.examId);
        if (exam && Array.isArray(exam.questions)) {
          const originalQ = exam.questions[ref.questionIndex] || exam.questions.find((q) => q.id === ref.questionId);
          if (originalQ) {
            hydrated.push({
              ...originalQ,
              id: ref.questionId || `chal_q_${idx}`,
            });
            return;
          }
        }
        // Fallback to lightweight question if original not found
        if (activeChallengeRoom.questions?.[idx]) {
          hydrated.push(activeChallengeRoom.questions[idx]);
        }
      });
      if (hydrated.length > 0) return hydrated;
    }

    return activeChallengeRoom.questions || [];
  }, [activeChallengeRoom, contentItems]);

  // ================= HELPER: True Fisher-Yates (Knuth) Shuffle =================
  function shuffleArray<T>(items: T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      // Cryptographically or pseudo-random high entropy index
      const j = Math.floor(Math.random() * (i + 1));
      const temp = arr[i];
      arr[i] = arr[j];
      arr[j] = temp;
    }
    return arr;
  }

  // ================= HELPER: Clean Readable 6-Character Challenge Code =================
  function generateCleanCode(): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let res = '';
    for (let i = 0; i < 6; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
  }

  // ================= HELPER: Recursively clean undefined values for Firestore =================
  function cleanFirestoreObject<T>(obj: T): T {
    if (obj === null || obj === undefined) {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj
        .filter((item) => item !== undefined)
        .map((item) => cleanFirestoreObject(item)) as unknown as T;
    }
    if (typeof obj === 'object') {
      const clean: Record<string, any> = {};
      for (const [key, val] of Object.entries(obj)) {
        if (val !== undefined) {
          clean[key] = cleanFirestoreObject(val);
        }
      }
      return clean as T;
    }
    return obj;
  }

  // ================= HANDLER: Start Diagnostic Exam =================
  const handleLaunchDiagnosticExam = () => {
    let chosenExams: ContentItem[] = [];

    if (diagnosticMode === 'random') {
      // Real random shuffle on the pool of exams
      const pool = shuffleArray(filteredDiagnosticExams);
      const count = Math.min(diagnosticRandomCount, pool.length);
      chosenExams = pool.slice(0, Math.max(1, count));
    } else {
      chosenExams = filteredDiagnosticExams.filter((e) => diagnosticManualSelectedIds.includes(e.id));
    }

    if (chosenExams.length === 0) {
      chosenExams = shuffleArray(filteredDiagnosticExams).slice(0, 1);
    }

    // Merge questions from chosen exams and thoroughly shuffle questions
    const mergedQuestions: ExamQuestion[] = [];
    chosenExams.forEach((exam) => {
      if (Array.isArray(exam.questions)) {
        exam.questions.forEach((q, qIdx) => {
          mergedQuestions.push({
            ...q,
            id: `diag_${exam.id}_${q.id || qIdx}_${Math.random().toString(36).substring(2, 6)}`,
          });
        });
      }
    });

    if (mergedQuestions.length === 0) {
      alert('لا توجد أسئلة كافية في الاختبارات المحددة للبدء!');
      return;
    }

    // Always shuffle the final questions list for complete unpredictability and fresh questions order!
    const randomizedQuestions = shuffleArray(mergedQuestions);

    // Calculate approximate duration: 1.5 mins per question
    const totalMinutes = Math.max(10, Math.round(randomizedQuestions.length * 1.5));

    onClose();
    onStartDiagnosticExam({
      title: `اختبار تحديد مستوى الطالب (${chosenExams.length} اختبارات - ${randomizedQuestions.length} سؤال عشوائي)`,
      questions: randomizedQuestions,
      durationMinutes: totalMinutes,
      isTimed: diagnosticIsTimed,
      targetPercentage: 85,
    });
  };

  // ================= HANDLER: Create Challenge Room =================
  const handleCreateChallenge = async () => {
    let chosenExams: ContentItem[] = [];

    if (challengeExamSelectionMode === 'random') {
      // True random shuffle on platform exams
      const pool = shuffleArray(allPlatformExams);
      const count = Math.min(challengeExamCount, pool.length);
      chosenExams = pool.slice(0, Math.max(1, count));
    } else {
      chosenExams = allPlatformExams.filter((e) => challengeManualExamIds.includes(e.id));
    }

    if (chosenExams.length === 0) {
      chosenExams = shuffleArray(allPlatformExams).slice(0, Math.min(challengeExamCount, allPlatformExams.length));
    }

    // Helper: clean text strictly removing base64 data to never exceed Firestore 1MB document limit
    const sanitizeText = (txt: unknown, maxLen = 350): string => {
      if (typeof txt !== 'string') return '';
      let clean = txt.replace(/<img[^>]*src=["']?data:[^"'>]+["']?[^>]*>/gi, '[صورة]');
      clean = clean.replace(/!\[.*?\]\(data:[^)]+\)/gi, '[صورة]');
      clean = clean.replace(/data:[a-zA-Z0-9/+.-]+;base64,[A-Za-z0-9+/=]+/gi, '[صورة]');
      clean = clean.replace(/[A-Za-z0-9+/=]{60,}/g, '');
      return clean.substring(0, maxLen).trim();
    };

    const sanitizeUrl = (url: unknown): string | undefined => {
      if (typeof url !== 'string') return undefined;
      const trimmed = url.trim();
      if (trimmed.startsWith('data:') || trimmed.includes('base64,') || trimmed.length > 300) {
        return undefined;
      }
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed;
      }
      return undefined;
    };

    // Merge questions with reference entries
    interface ChallengeQuestionEntry {
      ref: FriendChallengeQuestionRef;
      lightweightQuestion: ExamQuestion;
    }

    const questionEntries: ChallengeQuestionEntry[] = [];
    chosenExams.forEach((exam) => {
      if (Array.isArray(exam.questions)) {
        exam.questions.forEach((q, qIdx) => {
          const safeUrl = sanitizeUrl(q.imageUrl);
          const lq: ExamQuestion = {
            id: `chal_${exam.id}_${q.id || qIdx}_${Math.random().toString(36).substring(2, 6)}`,
            questionText: sanitizeText(q.questionText, 350),
            options: Array.isArray(q.options) ? q.options.map((opt) => sanitizeText(opt, 120)) : [],
            correctOptionIndex: typeof q.correctOptionIndex === 'number' ? q.correctOptionIndex : 0,
            explanation: sanitizeText(q.explanation, 150),
          };
          if (safeUrl) {
            lq.imageUrl = safeUrl;
          }

          questionEntries.push({
            ref: {
              examId: exam.id,
              questionIndex: qIdx,
              questionId: q.id || `q_${exam.id}_${qIdx}`,
            },
            lightweightQuestion: lq,
          });
        });
      }
    });

    if (questionEntries.length === 0) {
      alert('لا توجد أسئلة كافية لإنشاء التحدي!');
      return;
    }

    // True shuffle for challenge question entries
    const randomizedEntries = shuffleArray(questionEntries);
    // Limit challenge to at most 30 questions for optimal friend battle pacing and ultra-safe Firestore size (<15KB)
    const selectedEntries = randomizedEntries.slice(0, Math.min(30, randomizedEntries.length));
    const questionRefs = selectedEntries.map((e) => e.ref);
    const lightweightQuestions = selectedEntries.map((e) => e.lightweightQuestion);

    // Generate 6-digit clean random code
    const randomCode = generateCleanCode();
    const challengeRef = doc(collection(db, 'challenges'));

    const initialDoc: FriendChallengeDoc = {
      id: challengeRef.id,
      code: randomCode,
      hostId: currentUser.id,
      hostName: currentUser.name || 'طالب رعد',
      status: 'waiting',
      examCount: challengeExamCount,
      selectedExamIds: chosenExams.map((e) => e.id),
      questionRefs: questionRefs,
      questions: lightweightQuestions,
      participants: {
        [currentUser.id]: {
          userId: currentUser.id,
          name: currentUser.name || 'طالب رعد',
          score: 0,
          correctAnswers: 0,
          wrongAnswers: 0,
          answers: {},
          isFinished: false,
        },
      },
      createdAt: new Date().toISOString(),
    };

    try {
      const cleanDoc = cleanFirestoreObject(initialDoc);
      await setDoc(challengeRef, cleanDoc);
      setCreatedChallenge(initialDoc);
      setCodeRegeneratedNotice('');
    } catch (e) {
      console.error('Error creating challenge:', e);
      alert('حدث خطأ أثناء إنشاء التحدي، يرجى المحاولة ثانية.');
    }
  };

  // ================= HANDLER: Regenerate New Challenge Code on Demand =================
  const handleRegenerateChallengeCode = async () => {
    if (!createdChallenge) return;
    setIsRegeneratingCode(true);
    setCodeRegeneratedNotice('');

    try {
      const newCode = generateCleanCode();
      const roomRef = doc(db, 'challenges', createdChallenge.id);

      await updateDoc(roomRef, cleanFirestoreObject({
        code: newCode,
        updatedAt: new Date().toISOString(),
      }));

      setCreatedChallenge((prev) => (prev ? { ...prev, code: newCode } : null));

      // Auto copy
      try {
        await navigator.clipboard.writeText(newCode);
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2500);
      } catch (err) {}

      setCodeRegeneratedNotice(`تم توليد كود جديد بنجاح: ${newCode} وتم نسخه تلقائياً! ⚡`);
      setTimeout(() => setCodeRegeneratedNotice(''), 4000);
    } catch (e) {
      console.error('Error regenerating code:', e);
      alert('حدث خطأ أثناء توليد الكود الجديد، يرجى المحاولة ثانية.');
    } finally {
      setIsRegeneratingCode(false);
    }
  };

  // ================= HANDLER: Join Challenge Room =================
  const handleJoinChallenge = async () => {
    const trimmed = joinCodeInput.trim().toUpperCase();
    if (!trimmed) {
      setJoinError('يرجى إدخال رمز كود التحدي المكون من 6 خانات');
      return;
    }

    setIsJoining(true);
    setJoinError('');

    try {
      const q = query(collection(db, 'challenges'), where('code', '==', trimmed));
      const snap = await getDocs(q);

      if (snap.empty) {
        setJoinError('لم يتم العثور على تحدي بهذا الكود! تأكد من صحة الرمز.');
        setIsJoining(false);
        return;
      }

      const targetDoc = snap.docs[0];
      const data = { id: targetDoc.id, ...targetDoc.data() } as FriendChallengeDoc;

      if (data.hostId === currentUser.id) {
        // Host joining own room
        setActiveChallengeRoom(data);
        setIsJoining(false);
        return;
      }

      if (data.status === 'finished') {
        setJoinError('هذا التحدي انتهى بالفعل!');
        setIsJoining(false);
        return;
      }

      // Add guest to participants and update status to active
      const updatedParticipants = {
        ...(data.participants || {}),
        [currentUser.id]: {
          userId: currentUser.id,
          name: currentUser.name || 'المتحدي الثاني',
          score: 0,
          correctAnswers: 0,
          wrongAnswers: 0,
          answers: {},
          isFinished: false,
        },
      };

      await updateDoc(doc(db, 'challenges', targetDoc.id), cleanFirestoreObject({
        guestId: currentUser.id,
        guestName: currentUser.name || 'المتحدي الثاني',
        status: 'active',
        participants: updatedParticipants,
        updatedAt: new Date().toISOString(),
      }));

      const updatedRoom: FriendChallengeDoc = {
        ...data,
        guestId: currentUser.id,
        guestName: currentUser.name || 'المتحدي الثاني',
        status: 'active',
        participants: updatedParticipants,
      };

      setActiveChallengeRoom(updatedRoom);
    } catch (e) {
      console.error('Error joining challenge:', e);
      setJoinError('حدث خطأ أثناء الانضمام للتحدي.');
    } finally {
      setIsJoining(false);
    }
  };

  // Copy code helper
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // ================= IN-GAME: Submit Answer in Live Challenge =================
  const handleAnswerChallengeQuestion = async (optIdx: number) => {
    if (!activeChallengeRoom || isSubmittingChallengeAnswer) return;

    const currentQ = activeQuestions[challengeCurrentQIdx];
    if (!currentQ) return;

    setIsSubmittingChallengeAnswer(true);

    const isCorrect = optIdx === currentQ.correctOptionIndex;
    const newAnswers = { ...challengeAnswers, [challengeCurrentQIdx]: optIdx };
    setChallengeAnswers(newAnswers);

    // Calculate updated participant state
    const currentParticipant = activeChallengeRoom.participants[currentUser.id] || {
      userId: currentUser.id,
      name: currentUser.name,
      score: 0,
      correctAnswers: 0,
      wrongAnswers: 0,
      answers: {},
      isFinished: false,
    };

    const newCorrect = (currentParticipant.correctAnswers || 0) + (isCorrect ? 1 : 0);
    const newWrong = (currentParticipant.wrongAnswers || 0) + (isCorrect ? 0 : 1);
    const isLastQuestion = challengeCurrentQIdx >= activeQuestions.length - 1;

    try {
      const roomRef = doc(db, 'challenges', activeChallengeRoom.id);
      const participantUpdate: Record<string, any> = {
        ...currentParticipant,
        score: newCorrect,
        correctAnswers: newCorrect,
        wrongAnswers: newWrong,
        answers: newAnswers,
        isFinished: isLastQuestion,
      };
      if (isLastQuestion) {
        participantUpdate.finishedAt = new Date().toISOString();
      }

      const updatedParticipants = {
        ...activeChallengeRoom.participants,
        [currentUser.id]: participantUpdate,
      };

      // Check if both participants are finished to declare winner
      let winnerId: string | undefined = undefined;
      let winnerName: string | undefined = undefined;
      let newStatus = activeChallengeRoom.status;

      const otherParticipantId = Object.keys(updatedParticipants).find((id) => id !== currentUser.id);
      const otherP = otherParticipantId ? updatedParticipants[otherParticipantId] : null;

      if (isLastQuestion && (!otherP || otherP?.isFinished)) {
        newStatus = 'finished';
        const myScore = newCorrect;
        const otherScore = otherP ? (otherP.correctAnswers || 0) : -1;

        if (myScore > otherScore) {
          winnerId = currentUser.id;
          winnerName = currentUser.name || 'طالب رعد';
        } else if (otherScore > myScore && otherP) {
          winnerId = otherP.userId;
          winnerName = otherP.name || 'المتحدي الثاني';
        } else {
          winnerId = 'tie';
          winnerName = 'تعادل أبطال!';
        }
      }

      await updateDoc(roomRef, cleanFirestoreObject({
        participants: updatedParticipants,
        status: newStatus,
        ...(winnerId ? { winnerId, winnerName } : {}),
        updatedAt: new Date().toISOString(),
      }));

      if (!isLastQuestion) {
        setTimeout(() => {
          setChallengeCurrentQIdx((prev) => prev + 1);
        }, 500);
      }
    } catch (e) {
      console.error('Error updating challenge answer:', e);
    } finally {
      setIsSubmittingChallengeAnswer(false);
    }
  };

  // Force finish challenge helper (if player is waiting and wishes to wrap up)
  const handleForceFinishChallenge = async () => {
    if (!activeChallengeRoom) return;
    try {
      const parts = activeChallengeRoom.participants || {};
      const pList = Object.values(parts);
      let winnerId: string | 'tie' = 'tie';
      let winnerName: string = 'تعادل أبطال!';

      if (pList.length === 1) {
        winnerId = pList[0].userId;
        winnerName = pList[0].name;
      } else if (pList.length >= 2) {
        const p1 = pList[0];
        const p2 = pList[1];
        if ((p1.correctAnswers || 0) > (p2.correctAnswers || 0)) {
          winnerId = p1.userId;
          winnerName = p1.name;
        } else if ((p2.correctAnswers || 0) > (p1.correctAnswers || 0)) {
          winnerId = p2.userId;
          winnerName = p2.name;
        }
      }

      await updateDoc(doc(db, 'challenges', activeChallengeRoom.id), cleanFirestoreObject({
        status: 'finished',
        winnerId,
        winnerName,
        updatedAt: new Date().toISOString(),
      }));
    } catch (e) {
      console.error('Error force finishing challenge:', e);
    }
  };

  // Telegram Group URLs from course featuresConfig or systemSettings with fallback
  const effectiveConfig = featuresConfig || systemSettings.features;
  const mainTelegramUrl = effectiveConfig?.telegramMainGroupUrl || systemSettings.features?.telegramMainGroupUrl || 'https://t.me/raad_qiyas_main';
  const discussionTelegramUrl = effectiveConfig?.telegramDiscussionGroupUrl || systemSettings.features?.telegramDiscussionGroupUrl || 'https://t.me/raad_qiyas_discussion';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`relative w-full max-w-4xl rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh] ${
          isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* ================= MODAL HEADER ================= */}
        <div
          className={`p-4 sm:p-5 border-b flex items-center justify-between gap-3 ${
            isDarkMode ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-slate-50/80'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 sm:p-3 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-yellow-500/20 border border-amber-400/40 text-amber-400 shadow-sm">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 fill-amber-400/30" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-500 font-black border border-amber-500/30">
                  المميزات الذهبية ⭐
                </span>
                {courseTitle && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-bold border border-blue-500/30 truncate max-w-[220px]">
                    {courseTitle}
                  </span>
                )}
              </div>
              <h3 className={`text-base sm:text-lg font-black mt-0.5 ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>
                {activeView === 'main'
                  ? `المميزات الإضافية ${courseTitle ? `- ${courseTitle}` : 'لمنصة أقسام رعد'}`
                  : activeView === 'diagnostic'
                  ? 'اختبار تحديد مستوى الطالب 🎯'
                  : 'تحدي الأصدقاء المباشر ⚔️'}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeView !== 'main' && (
              <button
                type="button"
                onClick={() => {
                  setActiveView('main');
                  setCreatedChallenge(null);
                  setActiveChallengeRoom(null);
                }}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black transition border cursor-pointer ${
                  isDarkMode
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                }`}
              >
                <ArrowRight className="w-4 h-4" />
                <span>رجوع للمميزات</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className={`p-2 rounded-xl transition cursor-pointer ${
                isDarkMode
                  ? 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ================= MODAL BODY ================= */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* ================= 1. MAIN VIEW: 4 RECTANGULAR CARDS ================= */}
          {activeView === 'main' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* المستطيل 1: جروب أقسام رعد الأساسي */}
              <div
                className={`p-5 rounded-3xl border-2 transition-all duration-200 flex flex-col justify-between space-y-4 group hover:shadow-xl hover:-translate-y-0.5 ${
                  isDarkMode
                    ? 'bg-gradient-to-br from-slate-900 via-slate-900/90 to-sky-950/40 border-sky-500/30 hover:border-sky-400'
                    : 'bg-gradient-to-br from-sky-50/70 via-white to-sky-100/40 border-sky-200 hover:border-sky-400 shadow-sm'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20 group-hover:scale-105 transition-transform">
                      {/* Telegram Icon SVG */}
                      <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .37z" />
                      </svg>
                    </div>
                    <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-sky-500/20 text-sky-600 dark:text-sky-300 border border-sky-500/30">
                      قناة وتليجرام رسمي
                    </span>
                  </div>

                  <div>
                    <h4 className={`text-base md:text-lg font-black ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>
                      جروب أقسام رعد الأساسي
                    </h4>
                    <p className={`text-xs mt-1 leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      القناة والجروب الرسمي للحصول على التنبيهات الفورية، الجداول الدراسية، الشروحات، وأحدث تجميعات القدرات المنقحة أولاً بأول.
                    </p>
                  </div>
                </div>

                <a
                  href={mainTelegramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-black text-xs md:text-sm flex items-center justify-center gap-2 shadow-lg shadow-sky-500/25 transition cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>انضمام لجروب الأساسي تليجرام ✈️</span>
                </a>
              </div>

              {/* المستطيل 2: جروب أقسام رعد المناقشة */}
              <div
                className={`p-5 rounded-3xl border-2 transition-all duration-200 flex flex-col justify-between space-y-4 group hover:shadow-xl hover:-translate-y-0.5 ${
                  isDarkMode
                    ? 'bg-gradient-to-br from-slate-900 via-slate-900/90 to-indigo-950/40 border-indigo-500/30 hover:border-indigo-400'
                    : 'bg-gradient-to-br from-indigo-50/70 via-white to-indigo-100/40 border-indigo-200 hover:border-indigo-400 shadow-sm'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                      {/* Telegram Icon SVG */}
                      <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .37z" />
                      </svg>
                    </div>
                    <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30">
                      مجتمع المناقشات
                    </span>
                  </div>

                  <div>
                    <h4 className={`text-base md:text-lg font-black ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>
                      جروب أقسام رعد المناقشة
                    </h4>
                    <p className={`text-xs mt-1 leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      مساحة حوارية وتفاعلية لجميع طلاب المنصة لتبادل حلول الأسئلة المعقدة، شرح الأفكار الرياضية واللفظية، والتحفيز المستمر.
                    </p>
                  </div>
                </div>

                <a
                  href={discussionTelegramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-black text-xs md:text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 transition cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>انضمام لجروب المناقشة تليجرام 💬</span>
                </a>
              </div>

              {/* المستطيل 3: اختبار تحديد مستوى الطالب */}
              <div
                onClick={() => setActiveView('diagnostic')}
                className={`p-5 rounded-3xl border-2 transition-all duration-200 flex flex-col justify-between space-y-4 group hover:shadow-xl hover:-translate-y-0.5 cursor-pointer ${
                  isDarkMode
                    ? 'bg-gradient-to-br from-slate-900 via-slate-900/90 to-emerald-950/40 border-emerald-500/30 hover:border-emerald-400'
                    : 'bg-gradient-to-br from-emerald-50/70 via-white to-emerald-100/40 border-emerald-200 hover:border-emerald-400 shadow-sm'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform">
                      <Target className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30">
                      تشخيص ذكي شامل
                    </span>
                  </div>

                  <div>
                    <h4 className={`text-base md:text-lg font-black ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>
                      اختبار تحديد مستوى الطالب
                    </h4>
                    <p className={`text-xs mt-1 leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      اختبر قدراتك الحقيقية عبر اختيار أي مصدر واختيار عدد الاختبارات التي تريدها عشوائياً أو يدوياً لمعرفة نقاط ضعفك وقوتك بدقة.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs md:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition cursor-pointer"
                >
                  <Target className="w-4 h-4" />
                  <span>بدء تحديد المستوى الآن 🎯</span>
                </button>
              </div>

              {/* المستطيل 4: تحدي الأصدقاء */}
              <div
                onClick={() => setActiveView('challenge')}
                className={`p-5 rounded-3xl border-2 transition-all duration-200 flex flex-col justify-between space-y-4 group hover:shadow-xl hover:-translate-y-0.5 cursor-pointer ${
                  isDarkMode
                    ? 'bg-gradient-to-br from-slate-900 via-slate-900/90 to-amber-950/40 border-amber-500/30 hover:border-amber-400'
                    : 'bg-gradient-to-br from-amber-50/70 via-white to-amber-100/40 border-amber-200 hover:border-amber-400 shadow-sm'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-slate-950 shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform">
                      <Trophy className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-500 border border-amber-500/30">
                      منافسة حية ومباشرة
                    </span>
                  </div>

                  <div>
                    <h4 className={`text-base md:text-lg font-black ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>
                      تحدي الأصدقاء
                    </h4>
                    <p className={`text-xs mt-1 leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      أنشئ غرفة تحدي وشارك الكود مع صديقك، نافسه على 1 أو 3 أو 5 أو 7 أو 10 اختبارات مباشرة واكتشف الفائز وعدد الإجابات الصحيحة والخاطئة!
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs md:text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition cursor-pointer"
                >
                  <Users className="w-4 h-4" />
                  <span>دخول تحدي الأصدقاء ⚔️</span>
                </button>
              </div>
            </div>
          )}

          {/* ================= 2. SUB-VIEW: اختبار تحديد مستوى الطالب ================= */}
          {activeView === 'diagnostic' && (
            <div className="space-y-6 max-w-2xl mx-auto">
              <div className={`p-5 rounded-3xl border ${
                isDarkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200'
              } space-y-4`}>
                <div>
                  <h4 className="text-base font-black text-emerald-500 flex items-center gap-2">
                    <Target className="w-5 h-5" />
                    <span>تخصيص اختبار تحديد المستوى</span>
                  </h4>
                  <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    اختر المصدر الذي تود اختباره، ثم حدد ما إذا كنت تفضل اختباراً عشوائياً بالعدد الذي تريده أو اختيار اختبارات محددة بنفسك.
                  </p>
                </div>

                {/* Step 1: Select Resource */}
                <div className="space-y-2">
                  <label className="text-xs font-black block">1. اختر المصدر المراد الاختبار فيه:</label>
                  <select
                    value={selectedDiagnosticResource}
                    onChange={(e) => {
                      setSelectedDiagnosticResource(e.target.value);
                      setDiagnosticManualSelectedIds([]);
                    }}
                    className={`w-full p-3 rounded-2xl border text-xs font-bold outline-none cursor-pointer ${
                      isDarkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="all">🌟 جميع المصادر والأقسام (اختبار تشخيصي شامل لكامل المنصة)</option>
                    {resources.map((res) => {
                      const sec = sections.find((s) => s.id === res.sectionId);
                      return (
                        <option key={res.id} value={res.id}>
                          {sec ? `[${sec.title}] ` : ''}{res.title}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Step 2: Choose Mode (Random vs Manual) */}
                <div className="space-y-2 pt-2 border-t border-slate-700/50">
                  <label className="text-xs font-black block">2. طريقة اختيار الاختبارات:</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setDiagnosticMode('random')}
                      className={`p-3 rounded-2xl border text-xs font-black flex items-center justify-center gap-2 transition cursor-pointer ${
                        diagnosticMode === 'random'
                          ? 'bg-emerald-500 text-white border-emerald-400 shadow-md shadow-emerald-500/20'
                          : isDarkMode ? 'bg-slate-900 text-slate-300 border-slate-700' : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      <Shuffle className="w-4 h-4" />
                      <span>اختيار عشوائي ذكي 🎲</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDiagnosticMode('manual')}
                      className={`p-3 rounded-2xl border text-xs font-black flex items-center justify-center gap-2 transition cursor-pointer ${
                        diagnosticMode === 'manual'
                          ? 'bg-emerald-500 text-white border-emerald-400 shadow-md shadow-emerald-500/20'
                          : isDarkMode ? 'bg-slate-900 text-slate-300 border-slate-700' : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      <FileCheck className="w-4 h-4" />
                      <span>اختيار يدوي محدد ✍️</span>
                    </button>
                  </div>
                </div>

                {/* Sub-view for Random Mode */}
                {diagnosticMode === 'random' && (
                  <div className="space-y-3 pt-2">
                    <label className="text-xs font-black block">3. عدد الاختبارات المراد دمجها في الاختبار:</label>
                    <div className="flex items-center gap-2 flex-wrap">
                      {[1, 2, 3, 5, 10, filteredDiagnosticExams.length].map((num, nIdx) => {
                        const isAll = nIdx === 5;
                        const label = isAll ? `الكل (${filteredDiagnosticExams.length})` : `${num} اختبارات`;
                        return (
                          <button
                            key={nIdx}
                            type="button"
                            onClick={() => setDiagnosticRandomCount(num)}
                            className={`px-4 py-2 rounded-xl text-xs font-black border transition cursor-pointer ${
                              diagnosticRandomCount === num
                                ? 'bg-emerald-600 text-white border-emerald-400 shadow-sm'
                                : isDarkMode ? 'bg-slate-900 text-slate-300 border-slate-700' : 'bg-white text-slate-700 border-slate-200'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-slate-400">أو اكتب رقماً مخصصاً:</span>
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, filteredDiagnosticExams.length)}
                        value={diagnosticRandomCount}
                        onChange={(e) => setDiagnosticRandomCount(Math.max(1, parseInt(e.target.value) || 1))}
                        className={`w-24 p-2 rounded-xl border text-xs font-black text-center outline-none ${
                          isDarkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      />
                      <span className="text-xs text-slate-500 font-bold">
                        (المتاح: {filteredDiagnosticExams.length} اختبار)
                      </span>
                    </div>

                    {/* Dynamic Random Notice & Reshuffle Button */}
                    <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-3 mt-3">
                      <div className="flex items-center gap-2.5">
                        <Shuffle className="w-5 h-5 text-emerald-400 shrink-0" />
                        <div>
                          <span className="text-xs text-emerald-300 font-bold block">
                            سحب عشوائي فائق التنوع في كل مرة 🎲
                          </span>
                          <span className="text-[11px] text-slate-300">
                            في كل اختبار يتم سحب اختبارات مختلفة تماماً وخلط ترتيب الأسئلة عشوائياً لضمان عدم التكرار.
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setDiagnosticShuffleCounter((c) => c + 1);
                          setDiagnosticShuffleNotice('تم تجديد وسحب باقة اختبارات عشوائية جديدة ومختلفة تماماً! 🎲✨');
                          setTimeout(() => setDiagnosticShuffleNotice(''), 3000);
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                        title="إعادة خلط وسحب اختبارات عشوائية جديدة"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>إعادة السحب العشوائي 🎲</span>
                      </button>
                    </div>

                    {diagnosticShuffleNotice && (
                      <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-center gap-2 animate-bounce">
                        <Check className="w-4 h-4" />
                        <span>{diagnosticShuffleNotice}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Sub-view for Manual Mode */}
                {diagnosticMode === 'manual' && (
                  <div className="space-y-2 pt-2">
                    <label className="text-xs font-black block">3. حدد الاختبارات المرغوبة من القائمة:</label>
                    <div className="max-h-52 overflow-y-auto space-y-1.5 p-1">
                      {filteredDiagnosticExams.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-500 font-bold">
                          لا توجد اختبارات مضافة في هذا المصدر بعد
                        </div>
                      ) : (
                        filteredDiagnosticExams.map((ex) => {
                          const isChecked = diagnosticManualSelectedIds.includes(ex.id);
                          return (
                            <label
                              key={ex.id}
                              className={`p-3 rounded-2xl border flex items-center justify-between text-xs font-bold cursor-pointer transition ${
                                isChecked
                                  ? 'bg-emerald-500/15 border-emerald-500 text-emerald-500'
                                  : isDarkMode ? 'bg-slate-900/80 border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    if (isChecked) {
                                      setDiagnosticManualSelectedIds(diagnosticManualSelectedIds.filter((id) => id !== ex.id));
                                    } else {
                                      setDiagnosticManualSelectedIds([...diagnosticManualSelectedIds, ex.id]);
                                    }
                                  }}
                                  className="w-4 h-4 accent-emerald-500 rounded"
                                />
                                <span>{ex.title}</span>
                              </div>
                              <span className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 font-mono">
                                {ex.questions?.length || 0} أسئلة
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* Timer Toggle */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-700/50 text-xs">
                  <span className="font-bold">تفعيل المؤقت التنازلي للاختبار التشخيصي:</span>
                  <button
                    type="button"
                    onClick={() => setDiagnosticIsTimed(!diagnosticIsTimed)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition border cursor-pointer ${
                      diagnosticIsTimed
                        ? 'bg-blue-600 text-white border-blue-400'
                        : isDarkMode ? 'bg-slate-900 text-slate-400 border-slate-700' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {diagnosticIsTimed ? 'مؤقت تنازلي دقيق ⏱️' : 'تدريب حر بدون وقت 🎯'}
                  </button>
                </div>
              </div>

              {/* Start Button */}
              <button
                type="button"
                onClick={handleLaunchDiagnosticExam}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm flex items-center justify-center gap-2 shadow-xl shadow-emerald-600/30 transition cursor-pointer"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>انطلاق لبدء اختبار تحديد المستوى الآن 🚀</span>
              </button>
            </div>
          )}

          {/* ================= 3. SUB-VIEW: تحدي الأصدقاء ================= */}
          {activeView === 'challenge' && (
            <div className="max-w-2xl mx-auto space-y-6">
              {/* Active Room Arena Mode */}
              {activeChallengeRoom ? (
                <div className="space-y-6">
                  {/* Status header comparing both students */}
                  <div className={`p-4 rounded-3xl border ${
                    isDarkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-100 border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between text-xs font-black pb-3 border-b border-slate-700/60 mb-3">
                      <span className="text-amber-500 flex items-center gap-1.5">
                        <Flame className="w-4 h-4 fill-amber-500" />
                        <span>تحدي مباشر ومشتعل الآن!</span>
                      </span>
                      <span className="font-mono text-slate-400">
                        كود التحدي: {activeChallengeRoom.code}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {/* Host */}
                      <div className={`p-3 rounded-2xl border text-center ${
                        activeChallengeRoom.hostId === currentUser.id
                          ? 'bg-blue-500/10 border-blue-500/40 text-blue-400'
                          : isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
                      }`}>
                        <div className="text-xs font-bold truncate">👑 {activeChallengeRoom.hostName}</div>
                        <div className="text-lg font-black text-emerald-500 mt-1">
                          {activeChallengeRoom.participants[activeChallengeRoom.hostId]?.score || 0} نقطة
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {activeChallengeRoom.participants[activeChallengeRoom.hostId]?.isFinished ? 'أنهى الاختبار ✓' : 'جاري الحل...'}
                        </div>
                      </div>

                      {/* Guest */}
                      <div className={`p-3 rounded-2xl border text-center ${
                        activeChallengeRoom.guestId === currentUser.id
                          ? 'bg-purple-500/10 border-purple-500/40 text-purple-400'
                          : isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
                      }`}>
                        <div className="text-xs font-bold truncate">⚔️ {activeChallengeRoom.guestName || 'في الانتظار...'}</div>
                        <div className="text-lg font-black text-emerald-500 mt-1">
                          {activeChallengeRoom.guestId ? (activeChallengeRoom.participants[activeChallengeRoom.guestId]?.score || 0) : 0} نقطة
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {activeChallengeRoom.guestId && activeChallengeRoom.participants[activeChallengeRoom.guestId]?.isFinished ? 'أنهى الاختبار ✓' : 'جاري الحل...'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* If Finished: Grand Results Screen with Winner Announcement! */}
                  {activeChallengeRoom.status === 'finished' ? (
                    <div className={`p-6 rounded-3xl border-2 text-center space-y-5 ${
                      isDarkMode
                        ? 'bg-gradient-to-b from-amber-950/40 via-slate-900 to-slate-900 border-amber-500/40'
                        : 'bg-gradient-to-b from-amber-50 via-white to-amber-50 border-amber-300'
                    }`}>
                      <div className="w-16 h-16 rounded-3xl bg-amber-500/20 text-amber-500 border border-amber-500/40 flex items-center justify-center mx-auto">
                        <Trophy className="w-8 h-8 animate-bounce" />
                      </div>

                      <div className="space-y-2">
                        <h3 className="text-xl md:text-2xl font-black text-amber-500">
                          {activeChallengeRoom.winnerId === 'tie'
                            ? '🤝 تعادل مشرف بين الأبطال!'
                            : `🏆 الفائز بالمركز الأول: ${activeChallengeRoom.winnerName || 'البطل'}`}
                        </h3>
                        <p className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          {activeChallengeRoom.winnerId === currentUser.id
                            ? 'ألف مبروك! حققت انتصاراً ساحقاً وتفوقت في سرعة ودقة الإجابات ⚡🎉'
                            : activeChallengeRoom.winnerId === 'tie'
                            ? 'كلاكما قدم أداءً أسطورياً متقارباً، واصلوا التدريب للوصول للـ 100%!'
                            : 'حظاً أوفر في التحدي القادم، راجع أخطاءك وتدرب جيداً للانتقام والتفوق!'}
                        </p>
                      </div>

                      {/* Results Comparison Table */}
                      <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
                        {Object.values(activeChallengeRoom.participants).map((p) => (
                          <div
                            key={p.userId}
                            className={`p-4 rounded-2xl border text-right space-y-2 ${
                              activeChallengeRoom.winnerId === p.userId
                                ? 'bg-amber-500/15 border-amber-500/40'
                                : isDarkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200'
                            }`}
                          >
                            <div className="font-black text-sm flex items-center justify-between">
                              <span className="truncate">{p.name}</span>
                              {activeChallengeRoom.winnerId === p.userId && (
                                <span className="text-amber-500 text-xs">👑 الفائز</span>
                              )}
                            </div>
                            <div className="text-xs flex items-center justify-between text-emerald-500 font-bold">
                              <span>إجابات صحيحة:</span>
                              <span>{p.correctAnswers || 0} ✓</span>
                            </div>
                            <div className="text-xs flex items-center justify-between text-rose-500 font-bold">
                              <span>إجابات خاطئة:</span>
                              <span>{p.wrongAnswers || 0} ✕</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveChallengeRoom(null);
                          setCreatedChallenge(null);
                          setActiveView('main');
                        }}
                        className="px-8 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs md:text-sm transition cursor-pointer shadow-lg shadow-amber-500/25"
                      >
                        العودة للمنصة الرئيسية
                      </button>
                    </div>
                  ) : activeChallengeRoom.participants[currentUser.id]?.isFinished ? (
                    /* Waiting Screen for Partner to Finish */
                    <div className={`p-6 rounded-3xl border-2 text-center space-y-5 ${
                      isDarkMode
                        ? 'bg-slate-900 border-amber-500/40'
                        : 'bg-amber-50/70 border-amber-300'
                    }`}>
                      <div className="w-16 h-16 rounded-3xl bg-amber-500/20 text-amber-500 border border-amber-500/40 flex items-center justify-center mx-auto animate-pulse">
                        <Clock className="w-8 h-8" />
                      </div>

                      <div className="space-y-2">
                        <h3 className="text-xl font-black text-amber-500">
                          أحسنت! لقد أنهيت جميع أسئلة التحدي بنجاح 👏
                        </h3>
                        <p className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          نتيجتك المسجلة حتى الآن: {activeChallengeRoom.participants[currentUser.id]?.correctAnswers || 0} إجابات صحيحة ✓ و {activeChallengeRoom.participants[currentUser.id]?.wrongAnswers || 0} إجابات خاطئة ✕
                        </p>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 max-w-md mx-auto text-xs text-slate-300 space-y-2">
                        <div className="flex items-center justify-center gap-2 text-amber-400 font-bold">
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                          <span>في انتظار إنهاء صديقك لأسئلته...</span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          سيتم إعلان الفائز والنتيجة التفصيلية لكلاكما فور تسليم صديقك لآخر سؤال!
                        </p>
                      </div>

                      <div className="pt-2 flex items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={handleForceFinishChallenge}
                          className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition cursor-pointer shadow-md"
                        >
                          إعلان الفائز وعرض النتيجة الآن 🏆
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* In-progress Active Question Box */
                    <div className={`p-6 rounded-3xl border space-y-5 ${
                      isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                    }`}>
                      {/* Question Index */}
                      <div className="flex items-center justify-between text-xs pb-3 border-b border-slate-800">
                        <span className="font-black text-blue-500">
                          سؤال {challengeCurrentQIdx + 1} من {activeQuestions.length}
                        </span>
                        <span className="text-slate-400 font-bold">
                          السؤال مشترك لكلا اللاعبين
                        </span>
                      </div>

                      {/* Question Text */}
                      <div className="text-sm md:text-base font-black leading-relaxed">
                        {activeQuestions[challengeCurrentQIdx]?.questionText}
                      </div>

                      {/* Optional Question Image */}
                      {activeQuestions[challengeCurrentQIdx]?.imageUrl && (
                        <div className="max-h-64 overflow-hidden rounded-2xl border border-slate-700/60 flex items-center justify-center bg-black/20 p-2">
                          <img
                            src={activeQuestions[challengeCurrentQIdx]?.imageUrl}
                            alt="صورة السؤال"
                            className="max-h-56 object-contain rounded-xl"
                          />
                        </div>
                      )}

                      {/* Question Choices */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                        {activeQuestions[challengeCurrentQIdx]?.options?.map((opt, optIdx) => {
                          const isAnswered = challengeAnswers[challengeCurrentQIdx] !== undefined;
                          const isSelected = challengeAnswers[challengeCurrentQIdx] === optIdx;
                          const isCorrectChoice = activeQuestions[challengeCurrentQIdx]?.correctOptionIndex === optIdx;

                          let buttonStyle = '';
                          if (isAnswered) {
                            if (isSelected && isCorrectChoice) {
                              buttonStyle = 'bg-emerald-600 text-white border-emerald-400 shadow-md scale-[1.01]';
                            } else if (isSelected && !isCorrectChoice) {
                              buttonStyle = 'bg-rose-600 text-white border-rose-400 shadow-md';
                            } else if (isCorrectChoice) {
                              buttonStyle = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/60';
                            } else {
                              buttonStyle = isDarkMode ? 'bg-slate-900/60 border-slate-800 text-slate-500 opacity-60' : 'bg-slate-100 border-slate-200 text-slate-400 opacity-60';
                            }
                          } else {
                            buttonStyle = isDarkMode
                              ? 'bg-slate-800/80 hover:bg-slate-800 hover:border-amber-400 border-slate-700 text-slate-200'
                              : 'bg-slate-50 hover:bg-slate-100 hover:border-amber-400 border-slate-200 text-slate-800';
                          }

                          return (
                            <button
                              key={optIdx}
                              type="button"
                              disabled={isAnswered || isSubmittingChallengeAnswer}
                              onClick={() => handleAnswerChallengeQuestion(optIdx)}
                              className={`p-3.5 rounded-2xl border text-right text-xs md:text-sm font-bold transition-all flex items-center justify-between cursor-pointer disabled:cursor-not-allowed ${buttonStyle}`}
                            >
                              <div className="flex items-center gap-2">
                                <span className={`w-6 h-6 rounded-lg text-xs flex items-center justify-center font-bold ${
                                  isSelected ? 'bg-white/20 text-white' : 'bg-slate-700/40 text-slate-400'
                                }`}>
                                  {optIdx === 0 ? 'أ' : optIdx === 1 ? 'ب' : optIdx === 2 ? 'ج' : 'د'}
                                </span>
                                <span>{opt}</span>
                              </div>
                              {isAnswered && (
                                <span>
                                  {isCorrectChoice ? '✓' : isSelected ? '✕' : ''}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Explanation if answered */}
                      {challengeAnswers[challengeCurrentQIdx] !== undefined && activeQuestions[challengeCurrentQIdx]?.explanation && (
                        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                          <strong>💡 التوضيح: </strong>{activeQuestions[challengeCurrentQIdx]?.explanation}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : createdChallenge ? (
                /* Waiting Room for Host */
                <div className={`p-6 rounded-3xl border-2 text-center space-y-6 ${
                  isDarkMode ? 'bg-slate-900 border-amber-500/40' : 'bg-amber-50/50 border-amber-300'
                }`}>
                  <div className="p-4 rounded-3xl bg-amber-500/10 text-amber-500 w-16 h-16 mx-auto flex items-center justify-center animate-pulse">
                    <Clock className="w-8 h-8" />
                  </div>

                  <div className="space-y-1">
                    <h4 className="text-lg font-black text-amber-500">تم إنشاء غرفة التحدي بنجاح! ⚔️</h4>
                    <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      شارك هذا الرمز مع صديقك، وعندما يقوم بإدخال الكود سيبدأ التحدي بينكما فوراً:
                    </p>
                  </div>

                  {/* Big Room Code Box with Regenerate Code Button */}
                  <div className={`p-5 rounded-3xl border-2 max-w-md mx-auto space-y-4 ${
                    isDarkMode ? 'bg-slate-800 border-amber-400/60' : 'bg-white border-amber-400 shadow-md'
                  }`}>
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="text-center sm:text-right">
                        <span className="text-[10px] text-amber-500/80 font-bold block">كود التحدي الحالي:</span>
                        <span className="text-3xl sm:text-4xl font-black font-mono tracking-widest text-amber-400">
                          {createdChallenge.code}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-center">
                        <button
                          type="button"
                          onClick={() => handleCopyCode(createdChallenge.code)}
                          className="px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95"
                        >
                          {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          <span>{copiedCode ? 'تم النسخ ✓' : 'نسخ الكود'}</span>
                        </button>

                        {/* زر توليد اكواد اخرى */}
                        <button
                          type="button"
                          disabled={isRegeneratingCode}
                          onClick={handleRegenerateChallengeCode}
                          className="px-3.5 py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-900 text-amber-300 border border-amber-500/50 hover:border-amber-400 font-black text-xs transition flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                          title="توليد كود تحدي جديد ومختلف وإلغاء الكود السابق"
                        >
                          <RefreshCw className={`w-4 h-4 ${isRegeneratingCode ? 'animate-spin' : ''}`} />
                          <span>{isRegeneratingCode ? 'جاري التوليد...' : 'توليد كود آخر 🔄'}</span>
                        </button>
                      </div>
                    </div>

                    {codeRegeneratedNotice && (
                      <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-center gap-2 animate-bounce">
                        <Check className="w-4 h-4" />
                        <span>{codeRegeneratedNotice}</span>
                      </div>
                    )}
                  </div>

                  {/* Share Links */}
                  <div className="flex items-center justify-center gap-3">
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(`تعال نتحدا بعض على منصة أقسام رعد! كود التحدي الخاص بي هو: ${createdChallenge.code}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>مشاركة واتساب</span>
                    </a>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-800/40 text-xs text-slate-400 animate-pulse">
                    ⏳ في انتظار انضمام صديقك ودخوله للغرفة...
                  </div>
                </div>
              ) : (
                /* Tab Switcher: Create vs Join */
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-3 p-1 rounded-2xl bg-slate-800/60 border border-slate-700/60">
                    <button
                      type="button"
                      onClick={() => setChallengeTab('create')}
                      className={`py-2.5 px-4 rounded-xl text-xs font-black transition cursor-pointer ${
                        challengeTab === 'create'
                          ? 'bg-amber-500 text-slate-950 shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      👑 إنشاء غرفة تحدي جديدة
                    </button>

                    <button
                      type="button"
                      onClick={() => setChallengeTab('join')}
                      className={`py-2.5 px-4 rounded-xl text-xs font-black transition cursor-pointer ${
                        challengeTab === 'join'
                          ? 'bg-amber-500 text-slate-950 shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      🎮 الانضمام إلى تحدي بالكود
                    </button>
                  </div>

                  {/* Tab 1: Create Challenge */}
                  {challengeTab === 'create' && (
                    <div className={`p-5 rounded-3xl border space-y-5 ${
                      isDarkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <div>
                        <h4 className="text-base font-black text-amber-500">إعدادات إنشاء التحدي</h4>
                        <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          حدد عدد الاختبارات التي ترغب بخوض التحدي عليها (1، 3، 5، 7، 10 اختبارات) كما طلبت:
                        </p>
                      </div>

                      {/* Number of exams pills */}
                      <div className="space-y-2">
                        <label className="text-xs font-black block">عدد الاختبارات بالتحدي:</label>
                        <div className="grid grid-cols-5 gap-2">
                          {[1, 3, 5, 7, 10].map((num) => (
                            <button
                              key={num}
                              type="button"
                              onClick={() => setChallengeExamCount(num)}
                              className={`py-3 rounded-2xl border text-xs font-black transition cursor-pointer ${
                                challengeExamCount === num
                                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                                  : isDarkMode ? 'bg-slate-900 text-slate-300 border-slate-700' : 'bg-white text-slate-700 border-slate-300'
                              }`}
                            >
                              {num} {num === 1 ? 'اختبار' : 'اختبارات'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Selection Mode */}
                      <div className="space-y-2 pt-2 border-t border-slate-700/50">
                        <label className="text-xs font-black block">طريقة اختيار الاختبارات:</label>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setChallengeExamSelectionMode('random')}
                            className={`p-3 rounded-2xl border text-xs font-black flex items-center justify-center gap-2 transition cursor-pointer ${
                              challengeExamSelectionMode === 'random'
                                ? 'bg-amber-500 text-slate-950 border-amber-400'
                                : isDarkMode ? 'bg-slate-900 text-slate-300 border-slate-700' : 'bg-white text-slate-700 border-slate-300'
                            }`}
                          >
                            <Shuffle className="w-4 h-4" />
                            <span>عشوائياً من المنصة 🎲</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setChallengeExamSelectionMode('manual')}
                            className={`p-3 rounded-2xl border text-xs font-black flex items-center justify-center gap-2 transition cursor-pointer ${
                              challengeExamSelectionMode === 'manual'
                                ? 'bg-amber-500 text-slate-950 border-amber-400'
                                : isDarkMode ? 'bg-slate-900 text-slate-300 border-slate-700' : 'bg-white text-slate-700 border-slate-300'
                            }`}
                          >
                            <FileCheck className="w-4 h-4" />
                            <span>اختيار الاختبارات بنفسي ✍️</span>
                          </button>
                        </div>
                      </div>

                      {/* Random Mode Dynamic Notice and Reshuffle Button */}
                      {challengeExamSelectionMode === 'random' && (
                        <div className="space-y-3">
                          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
                              <div>
                                <span className="text-xs text-amber-300 font-bold block">
                                  سحب عشوائي فائق التنوع ({challengeExamCount} {challengeExamCount === 1 ? 'اختبار' : 'اختبارات'}) 🎲
                                </span>
                                <span className="text-[11px] text-slate-300">
                                  في كل مرة يتم خلط كامل بنك الاختبارات والأسئلة وبعثرة ترتيبها لضمان اختبار عشوائي مختلف وجديد كلياً في كل تحدٍ!
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setChallengeShuffleCounter((c) => c + 1);
                                setChallengeShuffleNotice('تم تجديد وسحب باقة اختبارات وتحديات عشوائية جديدة كلياً! 🎲⚡');
                                setTimeout(() => setChallengeShuffleNotice(''), 3000);
                              }}
                              className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                              title="إعادة خلط وسحب اختبارات عشوائية جديدة"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>إعادة السحب العشوائي 🎲</span>
                            </button>
                          </div>

                          {challengeShuffleNotice && (
                            <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center justify-center gap-2 animate-bounce">
                              <Check className="w-4 h-4" />
                              <span>{challengeShuffleNotice}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Manual exam selection */}
                      {challengeExamSelectionMode === 'manual' && (
                        <div className="space-y-2 pt-2">
                          <label className="text-xs font-black block">
                            اختر {challengeExamCount} اختبارات من القائمة:
                          </label>
                          <div className="max-h-48 overflow-y-auto space-y-1.5 p-1">
                            {allPlatformExams.map((ex) => {
                              const isChecked = challengeManualExamIds.includes(ex.id);
                              return (
                                <label
                                  key={ex.id}
                                  className={`p-3 rounded-2xl border flex items-center justify-between text-xs font-bold cursor-pointer transition ${
                                    isChecked
                                      ? 'bg-amber-500/15 border-amber-500 text-amber-500'
                                      : isDarkMode ? 'bg-slate-900/80 border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-700'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        if (isChecked) {
                                          setChallengeManualExamIds(challengeManualExamIds.filter((id) => id !== ex.id));
                                        } else {
                                          if (challengeManualExamIds.length < challengeExamCount) {
                                            setChallengeManualExamIds([...challengeManualExamIds, ex.id]);
                                          } else {
                                            alert(`لقد حددت بالفعل ${challengeExamCount} اختبارات!`);
                                          }
                                        }
                                      }}
                                      className="w-4 h-4 accent-amber-500 rounded"
                                    />
                                    <span>{ex.title}</span>
                                  </div>
                                  <span className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 font-mono">
                                    {ex.questions?.length || 0} أسئلة
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={handleCreateChallenge}
                        className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-xl shadow-amber-500/25 transition cursor-pointer"
                      >
                        <Trophy className="w-5 h-5 fill-current" />
                        <span>إنشاء التحدي واستخراج الكود 👑</span>
                      </button>
                    </div>
                  )}

                  {/* Tab 2: Join Challenge */}
                  {challengeTab === 'join' && (
                    <div className={`p-6 rounded-3xl border text-center space-y-5 ${
                      isDarkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <div className="space-y-1">
                        <h4 className="text-base font-black text-amber-500">الانضمام إلى تحدي برمز الكود</h4>
                        <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          اكتب كود التحدي المكون من 6 خانات الذي أرسله لك صديقك للدخول معه في التحدي مباشرة:
                        </p>
                      </div>

                      <div className="max-w-xs mx-auto space-y-2">
                        <input
                          type="text"
                          maxLength={8}
                          value={joinCodeInput}
                          onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                          placeholder="مثال: RAAD78"
                          className={`w-full p-4 rounded-2xl border text-xl font-black font-mono text-center tracking-widest outline-none uppercase transition ${
                            isDarkMode
                              ? 'bg-slate-900 border-slate-700 text-amber-400 focus:border-amber-400'
                              : 'bg-white border-slate-300 text-amber-600 focus:border-amber-500'
                          }`}
                        />

                        {joinError && (
                          <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-500 text-xs font-bold">
                            {joinError}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={isJoining}
                        onClick={handleJoinChallenge}
                        className="w-full max-w-xs mx-auto py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition cursor-pointer disabled:opacity-50"
                      >
                        {isJoining ? (
                          <span>جاري البحث والدخول...</span>
                        ) : (
                          <>
                            <Play className="w-4 h-4 fill-current" />
                            <span>دخول التحدي ومنافسة الصديق ⚔️</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ================= MODAL FOOTER ================= */}
        <div
          className={`p-4 border-t flex items-center justify-between text-xs ${
            isDarkMode ? 'border-slate-800 bg-slate-900/60 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-600'
          }`}
        >
          <span>منصة أقسام رعد تضمن لك المئوية بإذن الله ⚡</span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
