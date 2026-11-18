import React, { useState, useEffect } from 'react';
import {
  X,
  Folder,
  FolderPlus,
  Trash2,
  Lock,
  Play,
  HelpCircle,
  AlertCircle,
  FileQuestion,
  ChevronLeft,
  Clock,
  Sparkles,
  Download,
  Loader2,
  CheckCircle2,
  FileText
} from 'lucide-react';
import { StudentUser, FolderItem, FolderQuestionItem, ExamQuestion } from '../types';
import { exportFolderQuestionsToPdf } from '../utils/folderPdfExport';
import { db } from '../firebase';
import { markQuestionAsPermanentlyDeleted } from '../mistakesService';
import {
  addLocalFolder,
  ensureStudentFoldersLoaded,
  getStudentFoldersSnapshot,
  removeLocalFolder,
  removeLocalFolderQuestions,
  removeLocalFolderQuestionsByFolder,
  subscribeStudentFolders,
} from '../utils/studentFoldersStore';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  doc
} from 'firebase/firestore';
import { trackLocalRead, trackLocalWrite, trackLocalDelete } from '../utils/localUsageTracker';

interface FoldersModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: StudentUser;
  courseId?: string;
  courseTitle?: string;
  onStartFolderExam: (folderTitle: string, questions: ExamQuestion[], isTimed: boolean, folderId?: string) => void;
  isDarkMode?: boolean;
}

export const FoldersModal: React.FC<FoldersModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  courseId,
  courseTitle,
  onStartFolderExam,
  isDarkMode = true,
}) => {
  const currentCourseId = courseId || 'course_default_1';
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<FolderItem | null>(null);
  const [folderQuestions, setFolderQuestions] = useState<FolderQuestionItem[]>([]);
  const [newFolderTitle, setNewFolderTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [showTimedPrompt, setShowTimedPrompt] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<FolderItem | null>(null);
  const [showDeleteAllQuestionsModal, setShowDeleteAllQuestionsModal] = useState(false);
  const [isClearingQuestions, setIsClearingQuestions] = useState(false);
  const [folderNotice, setFolderNotice] = useState<string | null>(null);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({});
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [showPdfModePrompt, setShowPdfModePrompt] = useState(false);

  // Sync folders, per-folder counts, and selected folder questions from unified studentFoldersStore (zero duplicate listeners!)
  useEffect(() => {
    if (!isOpen || !currentUser?.id) return;
    let isCreatingDefault = false;

    const applyStoreSnapshot = () => {
      const snap = getStudentFoldersSnapshot(currentUser.id);
      const list: FolderItem[] = [];
      let hasMistakes = false;

      snap.folders.forEach((orig) => {
        const item = { ...orig };
        const isMistakes = Boolean(
          item.isDefaultMistakesFolder ||
            item.title === 'مجلد الاخطاء' ||
            item.title === 'مجلد الأخطاء' ||
            item.title === 'مجلد كل الأخطاء' ||
            item.title === 'دفتر الاخطاء' ||
            item.title === 'دفتر الأخطاء'
        );
        const folderCourse = item.courseId || 'course_default_1';
        if (folderCourse === currentCourseId) {
          if (isMistakes) {
            hasMistakes = true;
            item.isDefaultMistakesFolder = true;
            item.title = 'مجلد الأخطاء';
          }
          list.push(item);
        }
      });

      // Only provision default mistakes folder once store has finished initial load
      if (snap.hasLoadedOnce && !hasMistakes && !isCreatingDefault) {
        isCreatingDefault = true;
        const createdAt = new Date().toISOString();
        const payload = {
          userId: currentUser.id,
          courseId: currentCourseId,
          title: 'مجلد الأخطاء',
          isDefaultMistakesFolder: true,
          createdAt,
        };
        addDoc(collection(db, 'folders'), payload)
          .then((ref) => {
            trackLocalWrite(1, 'إنشاء مجلد الأخطاء الافتراضي');
            addLocalFolder(currentUser.id, { id: ref.id, ...payload });
          })
          .catch(() => {
            isCreatingDefault = false;
          });
      }

      list.sort((a, b) => {
        if (a.isDefaultMistakesFolder) return -1;
        if (b.isDefaultMistakesFolder) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      const counts: Record<string, number> = {};
      snap.folderQuestions.forEach((qItem) => {
        if (qItem.folderId) {
          counts[qItem.folderId] = (counts[qItem.folderId] || 0) + 1;
        }
      });

      setFolders(list);
      setFolderCounts(counts);
      setSelectedFolder((prev) => {
        if (prev && list.some((f) => f.id === prev.id)) {
          return list.find((f) => f.id === prev.id) || list[0];
        }
        return list[0] || null;
      });
    };

    applyStoreSnapshot();
    const unsub = subscribeStudentFolders(currentUser.id, applyStoreSnapshot);

    if (!getStudentFoldersSnapshot(currentUser.id).hasLoadedOnce) {
      setLoadingQuestions(true);
    }
    ensureStudentFoldersLoaded(currentUser.id).finally(() => {
      setLoadingQuestions(false);
    });

    return () => unsub();
  }, [isOpen, currentUser?.id, currentCourseId]);

  // Derive selected folder's questions directly from unified store (0 extra Firestore queries!)
  useEffect(() => {
    if (!isOpen || !currentUser?.id || !selectedFolder?.id) {
      setFolderQuestions([]);
      return;
    }

    const syncSelectedQuestions = () => {
      const { folderQuestions: allQ } = getStudentFoldersSnapshot(currentUser.id);
      const list = allQ
        .filter((qItem) => qItem.folderId === selectedFolder.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setFolderQuestions(list);
      setLoadingQuestions(false);
    };

    syncSelectedQuestions();
    const unsub = subscribeStudentFolders(currentUser.id, syncSelectedQuestions);
    return () => unsub();
  }, [isOpen, currentUser?.id, selectedFolder?.id]);

  if (!isOpen) return null;

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderTitle.trim()) return;
    try {
      const payload = {
        userId: currentUser.id,
        courseId: currentCourseId,
        title: newFolderTitle.trim(),
        isDefaultMistakesFolder: false,
        createdAt: new Date().toISOString(),
      };
      const newRef = await addDoc(collection(db, 'folders'), payload);
      trackLocalWrite(1, 'إنشاء مجلد خاص');
      addLocalFolder(currentUser.id, { id: newRef.id, ...payload });
      setNewFolderTitle('');
      setIsCreating(false);
    } catch (err) {
      console.error('Error creating folder:', err);
    }
  };

  const handleDeleteFolder = (folder: FolderItem) => {
    if (folder.isDefaultMistakesFolder || folder.title === 'مجلد الاخطاء') {
      setFolderNotice('يمنع حذف مجلد الاخطاء، فهو مخصص لتوثيق نقاط الضعف والمراجعة دائماً.');
      setTimeout(() => setFolderNotice(null), 4000);
      return;
    }
    setFolderToDelete(folder);
  };

  const confirmDeleteFolder = async () => {
    if (!folderToDelete) return;
    setIsDeletingFolder(true);
    try {
      // 1. Delete all questions inside this folder (using cached questions list first to avoid unnecessary query)
      try {
        const storeSnap = getStudentFoldersSnapshot(currentUser.id);
        const cachedInFolder = storeSnap.folderQuestions.filter(
          (fq) => fq.folderId === folderToDelete.id
        );
        if (cachedInFolder.length > 0) {
          await Promise.all(cachedInFolder.map((fq) => deleteDoc(doc(db, 'folder_questions', fq.id)).catch(() => {})));
          trackLocalDelete(cachedInFolder.length, 'حذف أسئلة مجلد');
        } else if (!storeSnap.hasLoadedOnce) {
          const qRef = query(collection(db, 'folder_questions'), where('folderId', '==', folderToDelete.id));
          const qSnap = await getDocs(qRef);
          trackLocalRead(Math.max(1, qSnap.size), 'قراءة أسئلة مجلد للحذف');
          await Promise.all(qSnap.docs.map((d) => deleteDoc(doc(db, 'folder_questions', d.id))));
          if (qSnap.size > 0) trackLocalDelete(qSnap.size, 'حذف أسئلة مجلد');
        }
      } catch (qErr) {
        console.warn('Error clearing folder questions:', qErr);
      }

      // 2. Delete the folder document itself & update unified store
      await deleteDoc(doc(db, 'folders', folderToDelete.id));
      trackLocalDelete(1, 'حذف مجلد');
      removeLocalFolder(currentUser.id, folderToDelete.id);
      if (selectedFolder?.id === folderToDelete.id) {
        const remaining = folders.filter((f) => f.id !== folderToDelete.id);
        setSelectedFolder(remaining[0] || null);
      }
      setFolderToDelete(null);
    } catch (err) {
      console.error('Error deleting folder:', err);
    } finally {
      setIsDeletingFolder(false);
    }
  };

  const handleDeleteQuestion = async (qItem: FolderQuestionItem) => {
    try {
      // 1. Delete by direct document ID
      await deleteDoc(doc(db, 'folder_questions', qItem.id));
      const removedIds = [qItem.id];

      // 2. Clear any lingering duplicates in this folder using cached list (0 extra reads!)
      if (selectedFolder?.id && qItem.questionText) {
        const duplicates = getStudentFoldersSnapshot(currentUser.id).folderQuestions.filter(
          (fq) => fq.folderId === selectedFolder.id && fq.questionText === qItem.questionText && fq.id !== qItem.id
        );
        await Promise.all(
          duplicates.map(async (dup) => {
            removedIds.push(dup.id);
            await deleteDoc(doc(db, 'folder_questions', dup.id)).catch(() => {});
          })
        );
      }
      trackLocalDelete(removedIds.length, 'حذف سؤال من المجلد');

      removeLocalFolderQuestions(currentUser.id, removedIds);

      // 3. Mark permanently deleted so it NEVER returns to this course!
      if (currentUser?.id) {
        await markQuestionAsPermanentlyDeleted({
          userId: currentUser.id,
          courseId: currentCourseId,
          folderId: selectedFolder?.id,
          originalQuestionId: qItem.originalQuestionId,
          alternateOriginalQuestionId: qItem.originalQuestionId !== qItem.id ? qItem.id : undefined,
          questionText: qItem.questionText,
        });
      }

      setFolderQuestions((prev) => prev.filter((item) => !removedIds.includes(item.id)));
    } catch (err) {
      console.error('Error deleting question:', err);
    }
  };

  const confirmDeleteAllQuestionsInFolder = async () => {
    if (!selectedFolder) return;
    setIsClearingQuestions(true);
    try {
      const storeSnap = getStudentFoldersSnapshot(currentUser.id);
      const cachedForFolder = storeSnap.folderQuestions.filter((fq) => fq.folderId === selectedFolder.id);
      let targetQuestions: FolderQuestionItem[];
      if (folderQuestions.length > 0) {
        targetQuestions = folderQuestions;
      } else if (cachedForFolder.length > 0 || storeSnap.hasLoadedOnce) {
        targetQuestions = cachedForFolder;
      } else {
        const snap = await getDocs(query(collection(db, 'folder_questions'), where('folderId', '==', selectedFolder.id)));
        trackLocalRead(Math.max(1, snap.size), 'قراءة أسئلة مجلد لمسحها');
        targetQuestions = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FolderQuestionItem));
      }

      await Promise.all(
        targetQuestions.map(async (data) => {
          if (currentUser?.id) {
            await markQuestionAsPermanentlyDeleted({
              userId: currentUser.id,
              courseId: currentCourseId,
              folderId: selectedFolder.id,
              originalQuestionId: data.originalQuestionId,
              alternateOriginalQuestionId: data.originalQuestionId !== data.id ? data.id : undefined,
              questionText: data.questionText,
            });
          }
          await deleteDoc(doc(db, 'folder_questions', data.id));
        })
      );
      if (targetQuestions.length > 0) {
        trackLocalDelete(targetQuestions.length, 'مسح أسئلة المجلد بالكامل');
      }
      removeLocalFolderQuestionsByFolder(currentUser.id, selectedFolder.id);
      setFolderQuestions([]);
      setShowDeleteAllQuestionsModal(false);
      setFolderNotice(`تم حذف جميع الأسئلة من مجلد "${selectedFolder.title}" ولن تعود طالما لم تخطئ فيها مجدداً ✓`);
      setTimeout(() => setFolderNotice(null), 4000);
    } catch (err) {
      console.error('Error deleting all questions in folder:', err);
      setFolderNotice('حدث خطأ أثناء حذف الأسئلة، يرجى المحاولة ثانية');
      setTimeout(() => setFolderNotice(null), 4000);
    } finally {
      setIsClearingQuestions(false);
    }
  };

  const startExamWithMode = (isTimed: boolean) => {
    if (!selectedFolder || folderQuestions.length === 0) return;
    const examQuestions: ExamQuestion[] = folderQuestions.map((fq, idx) => ({
      id: fq.id || `fq_${idx}`,
      questionText: fq.questionText,
      imageUrl: fq.imageUrl,
      options: fq.options,
      correctOptionIndex: fq.correctOptionIndex,
      explanation: fq.explanation,
    }));
    setShowTimedPrompt(false);
    onClose();
    onStartFolderExam(selectedFolder.title, examQuestions, isTimed, selectedFolder.id);
  };

  // Reads the live current questions inside the selected folder directly from local memory/cache at click time
  // and generates a genuine PDF purely in the browser (ZERO Firestore reads or writes!).
  const handleExportFolderPdf = async (includeSolutions: boolean) => {
    if (!selectedFolder || isExportingPdf) return;
    setShowPdfModePrompt(false);

    const storeSnap = getStudentFoldersSnapshot(currentUser.id);
    const liveQuestions = storeSnap.folderQuestions
      .filter((qItem) => qItem.folderId === selectedFolder.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const questionsToExport =
      liveQuestions.length > 0 || storeSnap.hasLoadedOnce ? liveQuestions : folderQuestions;

    if (questionsToExport.length === 0) {
      setFolderNotice('لا توجد أسئلة حالياً في هذا المجلد لتصديرها كملف PDF.');
      setTimeout(() => setFolderNotice(null), 3500);
      return;
    }

    setIsExportingPdf(true);
    try {
      await exportFolderQuestionsToPdf({
        folderTitle: selectedFolder.title,
        courseTitle,
        studentName: currentUser.name,
        questions: questionsToExport,
        includeSolutions,
      });
      const countText =
        questionsToExport.length === 1
          ? 'سؤال واحد'
          : questionsToExport.length === 2
          ? 'سؤالين'
          : questionsToExport.length <= 10
          ? `${questionsToExport.length} أسئلة`
          : `${questionsToExport.length} سؤالاً`;
      const modeText = includeSolutions ? 'محلول بالإجابات' : 'غير محلول (أسئلة فقط)';
      setFolderNotice(`تم تحميل ملف PDF (${modeText}) يحتوي على ${countText} من "${selectedFolder.title}" بنجاح ✓`);
      setTimeout(() => setFolderNotice(null), 4000);
    } catch (err) {
      console.error('Error exporting folder PDF locally:', err);
      setFolderNotice('حدث خطأ أثناء إنشاء ملف الـ PDF محلياً، يرجى المحاولة مرة أخرى.');
      setTimeout(() => setFolderNotice(null), 4000);
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className={`relative w-full max-w-5xl h-[88vh] border rounded-3xl shadow-2xl flex flex-col overflow-hidden text-right ${
        isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-black'
      }`}>
        {/* Header */}
        <div className={`p-4 md:p-6 border-b flex items-center justify-between ${
          isDarkMode ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-white'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
              <Folder className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className={`text-xl md:text-2xl font-black ${isDarkMode ? 'text-white' : 'text-black'}`}>مجلداتي</h2>
                {courseTitle && (
                  <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30">
                    {courseTitle}
                  </span>
                )}
              </div>
              <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-700 font-medium'}`}>
                مجلدات التمارين ومجلد الأخطاء التلقائي مخصصة لكورس {courseTitle ? `"${courseTitle}"` : 'الحالي'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition ${
              isDarkMode ? 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700' : 'bg-slate-100 text-black hover:bg-slate-200'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body: Folders list on right, questions inside selected folder on left */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-0 overflow-hidden">
          {/* Folders List (Right Column) */}
          <div className={`md:col-span-4 border-l p-4 flex flex-col overflow-y-auto ${
            isDarkMode ? 'border-slate-800 bg-slate-900/50' : 'border-slate-200 bg-slate-50'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <span className={`text-xs font-black ${isDarkMode ? 'text-slate-300' : 'text-black'}`}>قائمة المجلدات</span>
              <button
                onClick={() => setIsCreating(!isCreating)}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-500 font-black"
              >
                <FolderPlus className="w-4 h-4" />
                <span>مجلد جديد</span>
              </button>
            </div>

            {/* New folder form */}
            {isCreating && (
              <form onSubmit={handleCreateFolder} className="mb-4 p-3 bg-slate-800/80 rounded-xl border border-slate-700 space-y-2">
                <input
                  type="text"
                  placeholder="اسم المجلد (مثال: مسائل الهندسة)..."
                  value={newFolderTitle}
                  onChange={(e) => setNewFolderTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  autoFocus
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="px-2.5 py-1 text-xs text-slate-400 hover:text-white"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg"
                  >
                    إنشاء
                  </button>
                </div>
              </form>
            )}

            {/* List of folders */}
            <div className="space-y-2 flex-1">
              {folders.map((f) => {
                const isMistakes = f.isDefaultMistakesFolder || f.title === 'مجلد الاخطاء';
                const isSelected = selectedFolder?.id === f.id;

                return (
                  <div
                    key={f.id}
                    onClick={() => setSelectedFolder(f)}
                    className={`p-3 rounded-2xl border cursor-pointer transition flex items-center justify-between group ${
                      isSelected
                        ? isMistakes
                          ? 'bg-rose-950/40 border-rose-500/60 text-white shadow-lg shadow-rose-950/20'
                          : 'bg-blue-950/40 border-blue-500/60 text-white shadow-lg shadow-blue-950/20'
                        : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/80 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {isMistakes ? (
                        <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400">
                          <AlertCircle className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400">
                          <Folder className="w-4 h-4" />
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-bold flex items-center gap-1.5">
                          <span>{f.title}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                            isMistakes
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                          }`}>
                            {folderCounts[f.id] || 0} {isMistakes ? 'خطأ' : 'سؤال'}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {isMistakes ? 'مجلد الأخطاء الدائم والتلقائي' : 'مجلد خاص بك'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {isMistakes ? (
                        <div className="p-1 text-slate-500" title="يمنع حذفه">
                          <Lock className="w-3.5 h-3.5" />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFolder(f);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition opacity-90 md:opacity-0 md:group-hover:opacity-100 cursor-pointer"
                          title="حذف هذا المجلد"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Folder Questions (Left Column) */}
          <div className="md:col-span-8 p-4 md:p-6 flex flex-col overflow-y-auto">
            {selectedFolder ? (
              <div className="flex flex-col h-full">
                {/* Active Folder Subheader */}
                <div className={`flex flex-wrap items-center justify-between gap-3 pb-4 border-b mb-4 ${
                  isDarkMode ? 'border-slate-800' : 'border-slate-200'
                }`}>
                  <div>
                    <h3 className={`text-lg md:text-xl font-black flex items-center gap-2 ${
                      isDarkMode ? 'text-white' : 'text-black'
                    }`}>
                      <span>{selectedFolder.title}</span>
                      <span className={`text-xs px-2.5 py-0.5 rounded-full border font-bold ${
                        isDarkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-black border-slate-300'
                      }`}>
                        {folderQuestions.length} سؤال
                      </span>
                    </h3>
                    <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-700 font-medium'}`}>
                      {selectedFolder.isDefaultMistakesFolder
                        ? 'تجمع هنا تلقائياً كل الأسئلة التي تحتاج مراجعة للوصول للمئوية'
                        : 'أسئلة قمت بحفظها وتنظيمها بنفسك'}
                    </p>
                  </div>

                  <div className="flex items-center flex-wrap gap-2">
                    {/* Delete ALL questions in this folder button */}
                    <button
                      type="button"
                      onClick={() => setShowDeleteAllQuestionsModal(true)}
                      disabled={folderQuestions.length === 0 || isClearingQuestions}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 text-xs font-black transition disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                      title="حذف جميع الأسئلة في هذا المجلد (لن تعود طالما لم تخطئ فيها مجدداً)"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                      <span>حذف الأسئلة كاملة</span>
                    </button>

                    {/* Delete folder button if user created it */}
                    {!selectedFolder.isDefaultMistakesFolder && selectedFolder.title !== 'مجلد الاخطاء' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteFolder(selectedFolder)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold transition cursor-pointer"
                        title="حذف هذا المجلد ومحتوياته بالكامل"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف المجلد</span>
                      </button>
                    )}

                    {/* Download Current Questions as PDF (100% Local - Zero Firebase) */}
                    <button
                      type="button"
                      onClick={() => setShowPdfModePrompt(true)}
                      disabled={folderQuestions.length === 0 || isExportingPdf}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-black transition disabled:opacity-40 disabled:pointer-events-none cursor-pointer ${
                        isDarkMode
                          ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/35'
                          : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300'
                      }`}
                      title="تحميل الأسئلة الموجودة حالياً في المجلد كملف PDF (محلول أو غير محلول - محلياً بدون أي استهلاك لفايربيس)"
                    >
                      {isExportingPdf ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      <span>
                        {isExportingPdf
                          ? 'جاري تجهيز الـ PDF...'
                          : `تحميل PDF (${folderQuestions.length})`}
                      </span>
                    </button>

                    {/* Start Exam on This Folder Button! */}
                    <button
                      onClick={() => setShowTimedPrompt(true)}
                      disabled={folderQuestions.length === 0}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-40 disabled:pointer-events-none text-slate-950 font-black text-xs md:text-sm shadow-lg shadow-amber-500/20 transition cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>بدأ اختبار على هذا المجلد</span>
                    </button>
                  </div>
                </div>

                {/* Questions List */}
                <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                  {loadingQuestions ? (
                    <div className="py-12 text-center text-sm text-slate-500">جاري تحميل الأسئلة...</div>
                  ) : folderQuestions.length === 0 ? (
                    <div className={`py-16 text-center rounded-3xl border space-y-3 ${
                      isDarkMode ? 'bg-slate-800/30 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <FileQuestion className="w-12 h-12 text-slate-400 mx-auto" />
                      <div className={`text-sm font-black ${isDarkMode ? 'text-slate-300' : 'text-black'}`}>هذا المجلد لا يحتوي على أسئلة بعد</div>
                      <p className={`text-xs max-w-sm mx-auto ${isDarkMode ? 'text-slate-500' : 'text-slate-700'}`}>
                        عندما تخطئ في أي اختبار مرفوع على المنصة، ينتقل الخطأ فورياً إلى مجلد الأخطاء حتى لو كان لديك آلاف الأخطاء، ويمكنك أيضاً حفظ أي سؤال يدوياً في مجلداتك الخاصة للتدرب عليها في أي وقت.
                      </p>
                    </div>
                  ) : (
                    folderQuestions.map((q, idx) => (
                      <div
                        key={q.id || idx}
                        className={`p-4 rounded-2xl border space-y-3 ${
                          isDarkMode ? 'bg-slate-800/50 border-slate-700/60' : 'bg-slate-50 border-slate-200 text-black'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-600 flex items-center justify-center text-xs font-black shrink-0">
                                {idx + 1}
                              </span>
                              <span className={`text-sm md:text-base font-black ${
                                isDarkMode ? 'text-white' : 'text-black'
                              }`}>
                                {q.questionText}
                              </span>
                              {q.sourceExamTitle && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                  من: {q.sourceExamTitle}
                                </span>
                              )}
                            </div>

                            {q.imageUrl && (
                              <div
                                onClick={() => setZoomedImage(q.imageUrl || null)}
                                className="my-2.5 max-w-xl rounded-xl overflow-hidden border border-emerald-500/30 bg-white dark:bg-slate-950/60 p-2 shadow-sm cursor-pointer hover:border-emerald-400 transition"
                                title="انقر لتكبير صورة السؤال"
                              >
                                <img
                                  src={q.imageUrl}
                                  alt="صورة السؤال"
                                  loading="eager"
                                  className="max-h-64 sm:max-h-72 w-auto max-w-full object-contain mx-auto"
                                />
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-1.5 mt-2">
                              {q.options.map((opt, oIdx) => (
                                <div
                                  key={oIdx}
                                  className={`p-2 rounded-lg text-xs border ${
                                    oIdx === q.correctOptionIndex
                                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 font-bold'
                                      : 'bg-slate-900/40 border-slate-700/50 text-slate-400'
                                  }`}
                                >
                                  {opt}
                                </div>
                              ))}
                            </div>

                            {q.explanation && (
                              <div className="text-[11px] text-blue-300 bg-blue-950/30 p-2 rounded-lg mt-2 border border-blue-500/20">
                                <strong>توضيح الحل: </strong>
                                {q.explanation}
                              </div>
                            )}
                          </div>

                          <button
                            onClick={() => handleDeleteQuestion(q)}
                            className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                            title="حذف السؤال من هذا المجلد (لن يعود طالما لم تخطئ فيه مجدداً)"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="py-20 text-center text-slate-500">اختر مجلداً لعرض الأسئلة المحفوظة فيه</div>
            )}
          </div>
        </div>
      </div>

      {/* In-app Notice / Alert Toast */}
      {folderNotice && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] max-w-md w-full px-4 animate-in slide-in-from-top-4 duration-200">
          <div className="bg-amber-950/95 border-2 border-amber-500/80 text-amber-200 px-5 py-3.5 rounded-2xl shadow-2xl flex items-center justify-between gap-3 text-xs md:text-sm font-bold text-right backdrop-blur-md">
            <span>{folderNotice}</span>
            <button
              onClick={() => setFolderNotice(null)}
              className="p-1 rounded-lg hover:bg-amber-900/60 text-amber-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* In-app Folder Deletion Modal */}
      {folderToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl text-right space-y-6">
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl w-fit mx-auto">
              <Trash2 className="w-8 h-8" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-xl font-black text-white">
                حذف المجلد: "{folderToDelete.title}"؟
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed px-2">
                هل أنت متأكد من رغبتك في حذف هذا المجلد؟ سيتم إزالة المجلد ومحتوياته المحفوظة.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <button
                type="button"
                disabled={isDeletingFolder}
                onClick={confirmDeleteFolder}
                className="w-full py-3.5 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-black text-xs md:text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-rose-600/30 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeletingFolder ? 'جاري الحذف...' : 'نعم، حذف المجلد نهائياً 🗑️'}</span>
              </button>

              <button
                type="button"
                disabled={isDeletingFolder}
                onClick={() => setFolderToDelete(null)}
                className="w-full py-3 rounded-2xl text-xs font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
              >
                إلغاء التراجع
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete ALL Questions in Folder Modal */}
      {showDeleteAllQuestionsModal && selectedFolder && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="max-w-md w-full bg-slate-900 border-2 border-rose-500/30 rounded-3xl p-6 text-right space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-lg font-black text-white">حذف كافة الأسئلة في المجلد</h4>
                <p className="text-xs text-slate-400 font-bold">مجلد: {selectedFolder.title}</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-200 text-xs leading-relaxed font-bold">
              هل أنت متأكد من رغبتك في حذف جميع الأسئلة ({folderQuestions.length} سؤال) من مجلد "{selectedFolder.title}" نهائياً؟
              <br />
              <span className="text-rose-400 font-black">ملاحظة:</span> سيتم حذف الأسئلة بالكامل من المجلد، ولن تعود مجدداً طالما لم تخطئ فيها مرة أخرى.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteAllQuestionsModal(false)}
                disabled={isClearingQuestions}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
              >
                إلغاء التراجع
              </button>
              <button
                type="button"
                onClick={confirmDeleteAllQuestionsInFolder}
                disabled={isClearingQuestions}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black transition shadow-lg shadow-rose-600/30 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isClearingQuestions ? 'جاري الحذف...' : 'نعم، احذف كافة الأسئلة نهائياً 🗑️'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Timed vs Untimed Dialog Prompt - Fullscreen & Mobile Thumb-Scrollable */}
      {showTimedPrompt && selectedFolder && (
        <div className="fixed inset-0 z-[70] overflow-y-auto overscroll-y-contain -webkit-overflow-scrolling-touch bg-slate-950/95 backdrop-blur-xl animate-in fade-in duration-200 p-3 sm:p-6 md:p-8">
          <div className="min-h-full flex items-center justify-center py-6 sm:py-10">
            <div className="bg-slate-900 border-2 border-slate-700/80 rounded-3xl p-6 sm:p-8 md:p-10 max-w-2xl w-full shadow-2xl space-y-6 text-right overflow-hidden relative pb-10">
              <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-amber-500 via-blue-500 to-emerald-500" />

              <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl shrink-0">
                    <Folder className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                        اختبار المجلد 📁
                      </span>
                      <span className="text-xs text-slate-400">{folderQuestions.length} سؤال محفوظ</span>
                    </div>
                    <h3 className="text-lg md:text-xl font-black text-white mt-1">
                      {selectedFolder.title}
                    </h3>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowTimedPrompt(false)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="text-center md:text-right space-y-1">
                <h4 className="text-sm md:text-base font-bold text-slate-200">
                  اختر أسلوب الاختبار المناسب للمراجعة:
                </h4>
                <p className="text-xs text-slate-400">
                  اختبار الأسئلة التي قمت بحفظها يساعدك على سد الثغرات وتثبيت القوانين للوصول للمئوية بإذن الله.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <button
                  type="button"
                  onClick={() => startExamWithMode(true)}
                  className="group p-5 rounded-2xl bg-gradient-to-b from-blue-950/40 to-slate-900 border-2 border-blue-500/40 hover:border-blue-400 text-right space-y-3 transition hover:shadow-xl hover:shadow-blue-500/20 cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400 group-hover:scale-110 transition-transform">
                      <Clock className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      مؤقت تنازلي
                    </span>
                  </div>
                  <div>
                    <h5 className="text-base font-black text-white group-hover:text-blue-300 transition-colors">
                      اختبار بوقت محدد ⏱️
                    </h5>
                    <p className="text-xs text-slate-300 mt-1">
                      لقياس سرعتك ومحاكاة ضغط الوقت في الاختبار الفعلي بدقة.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => startExamWithMode(false)}
                  className="group p-5 rounded-2xl bg-gradient-to-b from-emerald-950/40 to-slate-900 border-2 border-emerald-500/40 hover:border-emerald-400 text-right space-y-3 transition hover:shadow-xl hover:shadow-emerald-500/20 cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 group-hover:scale-110 transition-transform">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      تدريب حر
                    </span>
                  </div>
                  <div>
                    <h5 className="text-base font-black text-white group-hover:text-emerald-300 transition-colors">
                      تدريب هادئ بدون وقت 🎯
                    </h5>
                    <p className="text-xs text-slate-300 mt-1">
                      للتركيز واستيعاب الأفكار والحل على السبورة الذكية بهدوء تام.
                    </p>
                  </div>
                </button>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTimedPrompt(false)}
                  className="px-5 py-2.5 text-xs font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition cursor-pointer"
                >
                  إلغاء والعودة
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PDF Export Mode Chooser (Solved vs Unsolved) */}
      {showPdfModePrompt && selectedFolder && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-200">
          <div className={`border-2 rounded-3xl p-6 sm:p-8 max-w-xl w-full shadow-2xl space-y-6 text-right overflow-hidden relative ${
            isDarkMode ? 'bg-slate-900 border-slate-700/80 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-emerald-500 via-blue-500 to-amber-500" />

            <div className={`flex items-center justify-between gap-4 pb-4 border-b ${
              isDarkMode ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-2xl shrink-0">
                  <Download className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 font-bold border border-emerald-500/30">
                      تصدير PDF محلي
                    </span>
                    <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      {folderQuestions.length} سؤال حالياً
                    </span>
                  </div>
                  <h3 className="text-lg font-black mt-1">
                    اختر نوع ملف الـ PDF: {selectedFolder.title}
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowPdfModePrompt(false)}
                className={`p-2 rounded-xl transition cursor-pointer shrink-0 ${
                  isDarkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => handleExportFolderPdf(true)}
                className={`group p-5 rounded-2xl border-2 text-right space-y-3 transition cursor-pointer ${
                  isDarkMode
                    ? 'bg-gradient-to-b from-emerald-950/40 to-slate-900 border-emerald-500/40 hover:border-emerald-400 hover:shadow-xl hover:shadow-emerald-500/15'
                    : 'bg-emerald-50/70 border-emerald-300 hover:border-emerald-500 hover:shadow-lg'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-500 group-hover:scale-110 transition-transform">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500 border border-emerald-500/30">
                    مع الحلول
                  </span>
                </div>
                <div>
                  <h5 className={`text-base font-black transition-colors ${
                    isDarkMode ? 'text-white group-hover:text-emerald-300' : 'text-slate-900 group-hover:text-emerald-700'
                  }`}>
                    ملف PDF محلول
                  </h5>
                  <p className={`text-xs mt-1 leading-relaxed ${
                    isDarkMode ? 'text-slate-300' : 'text-slate-600'
                  }`}>
                    يتضمن الأسئلة مع تحديد الإجابات الصحيحة وتوضيح الحل للمراجعة السريعة.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleExportFolderPdf(false)}
                className={`group p-5 rounded-2xl border-2 text-right space-y-3 transition cursor-pointer ${
                  isDarkMode
                    ? 'bg-gradient-to-b from-blue-950/40 to-slate-900 border-blue-500/40 hover:border-blue-400 hover:shadow-xl hover:shadow-blue-500/15'
                    : 'bg-blue-50/70 border-blue-300 hover:border-blue-500 hover:shadow-lg'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-500 group-hover:scale-110 transition-transform">
                    <FileText className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-500 border border-blue-500/30">
                    أسئلة فقط
                  </span>
                </div>
                <div>
                  <h5 className={`text-base font-black transition-colors ${
                    isDarkMode ? 'text-white group-hover:text-blue-300' : 'text-slate-900 group-hover:text-blue-700'
                  }`}>
                    ملف PDF غير محلول
                  </h5>
                  <p className={`text-xs mt-1 leading-relaxed ${
                    isDarkMode ? 'text-slate-300' : 'text-slate-600'
                  }`}>
                    يحتوي على الأسئلة والصور والخيارات فقط بدون إظهار الإجابات للتدرب الذاتي.
                  </p>
                </div>
              </button>
            </div>

            <div className={`flex justify-end pt-2 border-t ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
              <button
                type="button"
                onClick={() => setShowPdfModePrompt(false)}
                className={`px-5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  isDarkMode ? 'text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700' : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
                }`}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox for zooming question image in Folders */}
      {zoomedImage && (
        <div
          onClick={() => setZoomedImage(null)}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md animate-in fade-in duration-200 cursor-zoom-out"
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
            <img
              src={zoomedImage}
              alt="صورة السؤال مكبرة"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl border-2 border-emerald-500 shadow-2xl bg-white"
            />
            <button
              type="button"
              onClick={() => setZoomedImage(null)}
              className="mt-3 px-5 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold border border-slate-700 hover:bg-slate-700 transition cursor-pointer"
            >
              إغلاق العرض المكبر ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
