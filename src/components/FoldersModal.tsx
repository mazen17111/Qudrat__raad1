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
  Sparkles
} from 'lucide-react';
import { StudentUser, FolderItem, FolderQuestionItem, ExamQuestion } from '../types';
import { db } from '../firebase';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot
} from 'firebase/firestore';

interface FoldersModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: StudentUser;
  onStartFolderExam: (folderTitle: string, questions: ExamQuestion[], isTimed: boolean) => void;
  isDarkMode?: boolean;
}

export const FoldersModal: React.FC<FoldersModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onStartFolderExam,
  isDarkMode = true,
}) => {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<FolderItem | null>(null);
  const [folderQuestions, setFolderQuestions] = useState<FolderQuestionItem[]>([]);
  const [newFolderTitle, setNewFolderTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [showTimedPrompt, setShowTimedPrompt] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<FolderItem | null>(null);
  const [folderNotice, setFolderNotice] = useState<string | null>(null);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);

  // Load folders in real-time
  useEffect(() => {
    if (!isOpen || !currentUser) return;
    const q = query(
      collection(db, 'folders'),
      where('userId', '==', currentUser.id)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const list: FolderItem[] = [];
      let hasMistakes = false;
      snapshot.forEach((d) => {
        const item = { id: d.id, ...d.data() } as FolderItem;
        if (item.isDefaultMistakesFolder || item.title === 'مجلد الاخطاء') {
          hasMistakes = true;
          item.isDefaultMistakesFolder = true;
        }
        list.push(item);
      });

      // Ensure "مجلد الاخطاء" always exists
      if (!hasMistakes) {
        addDoc(collection(db, 'folders'), {
          userId: currentUser.id,
          title: 'مجلد الاخطاء',
          isDefaultMistakesFolder: true,
          createdAt: new Date().toISOString(),
        });
      }

      // Sort with mistakes folder first
      list.sort((a, b) => {
        if (a.isDefaultMistakesFolder) return -1;
        if (b.isDefaultMistakesFolder) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      setFolders(list);
      if (!selectedFolder && list.length > 0) {
        setSelectedFolder(list[0]);
      }
    });

    return () => unsub();
  }, [isOpen, currentUser]);

  // Load questions for selected folder
  useEffect(() => {
    if (!selectedFolder) {
      setFolderQuestions([]);
      return;
    }
    setLoadingQuestions(true);
    const q = query(
      collection(db, 'folder_questions'),
      where('folderId', '==', selectedFolder.id)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: FolderQuestionItem[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as FolderQuestionItem);
      });
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setFolderQuestions(list);
      setLoadingQuestions(false);
    });

    return () => unsub();
  }, [selectedFolder]);

  if (!isOpen) return null;

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderTitle.trim()) return;
    try {
      await addDoc(collection(db, 'folders'), {
        userId: currentUser.id,
        title: newFolderTitle.trim(),
        isDefaultMistakesFolder: false,
        createdAt: new Date().toISOString(),
      });
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
      // 1. Delete all questions inside this folder
      try {
        const qRef = query(collection(db, 'folder_questions'), where('folderId', '==', folderToDelete.id));
        const qSnap = await getDocs(qRef);
        await Promise.all(qSnap.docs.map((d) => deleteDoc(doc(db, 'folder_questions', d.id))));
      } catch (qErr) {
        console.warn('Error clearing folder questions:', qErr);
      }

      // 2. Delete the folder document itself
      await deleteDoc(doc(db, 'folders', folderToDelete.id));
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

  const handleDeleteQuestion = async (questionId: string) => {
    try {
      await deleteDoc(doc(db, 'folder_questions', questionId));
    } catch (err) {
      console.error('Error deleting question:', err);
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
    onStartFolderExam(selectedFolder.title, examQuestions, isTimed);
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
              <h2 className={`text-xl md:text-2xl font-black ${isDarkMode ? 'text-white' : 'text-black'}`}>مجلداتي</h2>
              <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-700 font-medium'}`}>
                مجلدات التمارين وحفظ الأسئلة الصعبة واختبار المجلدات
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
                          {isMistakes && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              ثابت
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {isMistakes ? 'يمنع حذفه • أسئلتك غير الموفقة' : 'مجلد خاص بك'}
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

                  <div className="flex items-center gap-2">
                    {/* Delete folder button if user created it */}
                    {!selectedFolder.isDefaultMistakesFolder && selectedFolder.title !== 'مجلد الاخطاء' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteFolder(selectedFolder)}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition cursor-pointer"
                        title="حذف هذا المجلد ومحتوياته بالكامل"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف المجلد</span>
                      </button>
                    )}

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
                        عندما تحل أي اختبار، يمكنك الضغط على "حفظ في مجلد الأخطاء" أو المجلدات الخاصة بك لحفظها هنا والتدرب عليها في أي وقت.
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
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-600 flex items-center justify-center text-xs font-black">
                                {idx + 1}
                              </span>
                              <span className={`text-sm md:text-base font-black ${
                                isDarkMode ? 'text-white' : 'text-black'
                              }`}>
                                {q.questionText}
                              </span>
                            </div>

                            {q.imageUrl && (
                              <div className="my-2 max-w-xs rounded-lg overflow-hidden border border-slate-700">
                                <img src={q.imageUrl} alt="سؤال" className="max-h-36 object-contain" />
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
                            onClick={() => handleDeleteQuestion(q.id)}
                            className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                            title="حذف السؤال من هذا المجلد"
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
    </div>
  );
};
