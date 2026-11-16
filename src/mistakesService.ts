import { collection, query, where, getDocs, addDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import {
  db,
  handleFirestoreError,
  isQuotaExceededActive,
  isQuotaExceededError,
  isTransientFirestoreError,
  OperationType,
} from './firebase';
import { ExamQuestion, FolderItem, FolderQuestionItem } from './types';
import {
  addLocalFolder,
  addLocalFolderQuestion,
  ensureStudentFoldersLoaded,
  getStudentFoldersSnapshot,
  removeLocalFolderQuestions,
} from './utils/studentFoldersStore';
import { trackLocalRead, trackLocalWrite, trackLocalDelete } from './utils/localUsageTracker';

// In-memory + localStorage cache for course-specific mistakes folder IDs
const cachedCourseMistakesFolderId: Record<string, string> = {};
const getMistakesFolderMapKey = (userId: string) => `raad_mistakes_folder_map_${userId}`;

function getPersistedMistakesFolderId(userId: string, courseId: string): string | null {
  const cacheKey = `${userId}:::${courseId}`;
  if (cachedCourseMistakesFolderId[cacheKey]) {
    return cachedCourseMistakesFolderId[cacheKey];
  }
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(getMistakesFolderMapKey(userId));
      if (raw) {
        const map = JSON.parse(raw) as Record<string, string>;
        if (map[courseId]) {
          cachedCourseMistakesFolderId[cacheKey] = map[courseId];
          return map[courseId];
        }
      }
    } catch {}
  }
  return null;
}

function persistMistakesFolderId(userId: string, courseId: string, folderId: string): void {
  const cacheKey = `${userId}:::${courseId}`;
  cachedCourseMistakesFolderId[cacheKey] = folderId;
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(getMistakesFolderMapKey(userId));
      const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      map[courseId] = folderId;
      localStorage.setItem(getMistakesFolderMapKey(userId), JSON.stringify(map));
    } catch {}
  }
}

function isMistakesFolderDoc(d: { isDefaultMistakesFolder?: boolean; title?: string }): boolean {
  return Boolean(
    d.isDefaultMistakesFolder ||
      d.title === 'مجلد الاخطاء' ||
      d.title === 'مجلد الأخطاء' ||
      d.title === 'دفتر الاخطاء' ||
      d.title === 'دفتر الأخطاء'
  );
}

/**
 * Ensures that EACH COURSE has its OWN completely separate "مجلد الأخطاء".
 * Uses shared studentFoldersStore + localStorage cache so repeated calls cost 0 extra Firestore reads.
 */
export async function getOrCreateMistakesFolderId(userId: string, courseId?: string): Promise<string | null> {
  if (!userId) return null;
  const effectiveCourseId = courseId || 'course_default_1';

  const cachedId = getPersistedMistakesFolderId(userId, effectiveCourseId);
  if (cachedId) {
    return cachedId;
  }

  try {
    // Use unified cached store (loads from Firestore at most once per session/TTL)
    const { folders } = await ensureStudentFoldersLoaded(userId);

    const existingMatch = folders.find((f) => {
      const folderCourse = f.courseId || 'course_default_1';
      return folderCourse === effectiveCourseId && isMistakesFolderDoc(f);
    });

    if (existingMatch?.id) {
      persistMistakesFolderId(userId, effectiveCourseId, existingMatch.id);
      return existingMatch.id;
    }

    // Create a brand new dedicated Mistakes Folder specifically for THIS course
    const createdAt = new Date().toISOString();
    const newFolderPayload = {
      userId,
      courseId: effectiveCourseId,
      title: 'مجلد الأخطاء',
      isDefaultMistakesFolder: true,
      createdAt,
    };
    const newDoc = await addDoc(collection(db, 'folders'), newFolderPayload);
    trackLocalWrite(1, 'إنشاء مجلد الأخطاء للكورس');
    const createdFolder: FolderItem = { id: newDoc.id, ...newFolderPayload };
    addLocalFolder(userId, createdFolder);

    persistMistakesFolderId(userId, effectiveCourseId, newDoc.id);
    return newDoc.id;
  } catch (err) {
    console.error('Error in getOrCreateMistakesFolderId for course:', effectiveCourseId, err);
    return null;
  }
}

/**
 * Legacy helper retained for API compatibility: deleted questions stay removed
 * from the folder and are NOT restored unless the student makes a new mistake on them.
 */
export async function markQuestionAsPermanentlyDeleted(_params: {
  userId: string;
  courseId?: string;
  folderId?: string;
  originalQuestionId?: string;
  alternateOriginalQuestionId?: string;
  questionText?: string;
  imageUrl?: string;
}): Promise<void> {
  // No blocklist write needed: questions stay deleted from `folder_questions`
  // until/unless the student answers them incorrectly again in a future attempt.
}

/**
 * Deletes ONLY the correctly answered questions from a specific folder so they stay removed
 * unless the student later answers them incorrectly again.
 */
export async function deleteCorrectQuestionsFromFolderPermanently({
  userId,
  courseId,
  folderId,
  questions,
  excludeIds = [],
}: {
  userId: string;
  courseId?: string;
  folderId?: string;
  questions: ExamQuestion[];
  excludeIds?: string[];
}): Promise<string[]> {
  if (!userId || !Array.isArray(questions) || questions.length === 0) return [];
  const effectiveCourseId = courseId || 'course_default_1';
  const deletedDocIds: string[] = [];
  const excludedIdSet = new Set(excludeIds.map((id) => (id || '').trim()).filter(Boolean));

  try {
    // Load from cached store (hits Firestore only if not loaded yet this session)
    const { folderQuestions } = await ensureStudentFoldersLoaded(userId);
    let candidateDocs = folderQuestions.filter((fq) =>
      folderId ? fq.folderId === folderId : true
    );

    // Fallback query only if store has never synced yet
    if (candidateDocs.length === 0 && !getStudentFoldersSnapshot(userId).hasLoadedOnce) {
      const folderQuery = folderId
        ? query(
            collection(db, 'folder_questions'),
            where('userId', '==', userId),
            where('folderId', '==', folderId)
          )
        : query(collection(db, 'folder_questions'), where('userId', '==', userId));
      const snap = await getDocs(folderQuery);
      trackLocalRead(Math.max(1, snap.size), 'قراءة أسئلة مجلد للحذف');
      candidateDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FolderQuestionItem));
    }

    const realTargetIds = new Set(
      questions
        .map((q) => (q.id || '').trim())
        .filter(
          (id) =>
            id &&
            !id.startsWith('fq_') &&
            !id.startsWith('q_default_') &&
            !id.startsWith('temp_') &&
            !excludedIdSet.has(id)
        )
    );

    const syntheticQuestions = questions.filter((q) => {
      const id = (q.id || '').trim();
      return !id || id.startsWith('fq_') || id.startsWith('q_default_') || id.startsWith('temp_');
    });

    const syntheticSignatures = syntheticQuestions.map((q) => ({
      text: (q.questionText || '').trim(),
      imageUrl: (q.imageUrl || '').trim(),
    }));

    const matchedDocsToDelete: Array<{
      docId: string;
      folderId: string;
      originalQuestionId: string;
      questionText: string;
      imageUrl: string;
    }> = [];

    const matchedDocIdSet = new Set<string>();

    candidateDocs.forEach((data) => {
      if (excludedIdSet.has(data.id)) return;

      const docFolderId = String(data.folderId || '');
      if (folderId && docFolderId !== folderId) return;

      const docText = String(data.questionText || '').trim();
      const docImage = String(data.imageUrl || '').trim();
      const docOrigId = String(data.originalQuestionId || '').trim();

      const matchesById = realTargetIds.has(data.id);
      const matchesSynthetic =
        folderId &&
        syntheticSignatures.length > 0 &&
        syntheticSignatures.some(
          (sig) => sig.text !== '' && sig.text === docText && sig.imageUrl === docImage
        );

      if (matchesById || matchesSynthetic) {
        matchedDocsToDelete.push({
          docId: data.id,
          folderId: docFolderId || folderId || '',
          originalQuestionId: docOrigId || data.id,
          questionText: docText,
          imageUrl: docImage,
        });
        matchedDocIdSet.add(data.id);
      }
    });

    const deleteTasks: Array<Promise<void>> = [];

    for (const item of matchedDocsToDelete) {
      deletedDocIds.push(item.docId);
      deleteTasks.push(
        (async () => {
          await deleteDoc(doc(db, 'folder_questions', item.docId));
          trackLocalDelete(1, 'حذف سؤال متقن من المجلد');
          await markQuestionAsPermanentlyDeleted({
            userId,
            courseId: effectiveCourseId,
            folderId: item.folderId,
            originalQuestionId: item.originalQuestionId,
            alternateOriginalQuestionId:
              item.originalQuestionId !== item.docId ? item.docId : undefined,
            questionText: item.questionText,
            imageUrl: item.imageUrl,
          });
        })()
      );
    }

    // Fallback for any target question with a real doc ID not yet matched
    for (const q of questions) {
      const qId = (q.id || '').trim();
      if (!qId || excludedIdSet.has(qId) || matchedDocIdSet.has(qId)) continue;
      if (qId.startsWith('fq_') || qId.startsWith('q_default_') || qId.startsWith('temp_')) continue;

      deletedDocIds.push(qId);
      deleteTasks.push(
        (async () => {
          try {
            await deleteDoc(doc(db, 'folder_questions', qId));
            trackLocalDelete(1, 'حذف سؤال متقن من المجلد');
          } catch (delErr) {
            handleFirestoreError(delErr, OperationType.DELETE, `folder_questions/${qId}`);
          }
          await markQuestionAsPermanentlyDeleted({
            userId,
            courseId: effectiveCourseId,
            folderId: folderId || '',
            originalQuestionId: qId,
            questionText: (q.questionText || '').trim(),
            imageUrl: (q.imageUrl || '').trim(),
          });
        })()
      );
    }

    await Promise.all(deleteTasks);

    if (deletedDocIds.length > 0) {
      removeLocalFolderQuestions(userId, deletedDocIds);
    }

    return deletedDocIds;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, 'folder_questions');
    throw err;
  }
}

function getQuestionDedupeSignature(question: ExamQuestion): string {
  const qId = (question.id || '').trim();
  const qText = (question.questionText || '').trim();
  const qImg = (question.imageUrl || '').trim();
  if (qId) return `id::${qId}`;
  return `txt::${qText}|||${qImg}`;
}

function isQuestionAlreadyInFolder(
  folderQuestions: FolderQuestionItem[],
  folderId: string,
  question: ExamQuestion
): boolean {
  const qId = (question.id || '').trim();
  const qText = (question.questionText || '').trim();
  const qImg = (question.imageUrl || '').trim();

  return folderQuestions.some((data) => {
    if (data.folderId !== folderId) return false;
    const dOrigId = String(data.originalQuestionId || '').trim();
    if (qId && dOrigId && qId === dOrigId) return true;

    const dText = String(data.questionText || '').trim();
    const dImg = String(data.imageUrl || '').trim();
    return Boolean(qText && dText && qText === dText && dImg === qImg);
  });
}

/**
 * Transfers multiple mistaken questions from an exam in a SINGLE atomic writeBatch,
 * deduplicating strictly against permanent deletions and existing folder items
 * so retaking an exam triggers zero duplicate Firestore writes or reads.
 */
export async function transferMistakesBatch({
  userId,
  courseId,
  examTitle,
  items,
}: {
  userId: string;
  courseId?: string;
  examTitle?: string;
  items: Array<{ question: ExamQuestion; studentAnswerIndex?: number }>;
}): Promise<number> {
  if (!userId || !Array.isArray(items) || items.length === 0) return 0;
  if (isQuotaExceededActive()) return 0;

  const effectiveCourseId = courseId || 'course_default_1';

  try {
    const folderId = await getOrCreateMistakesFolderId(userId, effectiveCourseId);
    if (!folderId) return 0;

    const folderSnapshot = await ensureStudentFoldersLoaded(userId);

    type MistakeFolderPayload = Omit<FolderQuestionItem, 'id'> & {
      studentChoiceIndex?: number | null;
      isAutoTransferredMistake?: boolean;
    };

    const seenInBatch = new Set<string>();
    const pendingDocs: Array<{
      ref: ReturnType<typeof doc>;
      payload: MistakeFolderPayload;
    }> = [];

    const baseTime = Date.now();
    items.forEach(({ question, studentAnswerIndex }, idx) => {
      if (!question) return;
      const sig = getQuestionDedupeSignature(question);
      if (seenInBatch.has(sig)) return;
      seenInBatch.add(sig);

      if (isQuestionAlreadyInFolder(folderSnapshot.folderQuestions, folderId, question)) {
        return;
      }

      const ref = doc(collection(db, 'folder_questions'));
      const payload: MistakeFolderPayload = {
        folderId,
        courseId: effectiveCourseId,
        userId,
        originalQuestionId: question.id || '',
        questionText: question.questionText || '',
        imageUrl: question.imageUrl || '',
        options: Array.isArray(question.options) ? question.options : [],
        correctOptionIndex:
          typeof question.correctOptionIndex === 'number' ? question.correctOptionIndex : 0,
        explanation: question.explanation || '',
        sourceExamTitle: examTitle || 'اختبار في المنصة',
        studentChoiceIndex: typeof studentAnswerIndex === 'number' ? studentAnswerIndex : null,
        isAutoTransferredMistake: true,
        createdAt: new Date(baseTime + idx).toISOString(),
      };

      pendingDocs.push({ ref, payload });
    });

    if (pendingDocs.length === 0) return 0;

    const committedRecords: FolderQuestionItem[] = [];
    for (let i = 0; i < pendingDocs.length; i += 450) {
      const chunk = pendingDocs.slice(i, i + 450);
      const batch = writeBatch(db);
      chunk.forEach(({ ref, payload }) => {
        batch.set(ref, payload);
      });
      await batch.commit();
      chunk.forEach(({ ref, payload }) => {
        committedRecords.push({ id: ref.id, ...payload });
      });
    }

    committedRecords.forEach((record) => addLocalFolderQuestion(userId, record));
    if (committedRecords.length > 0) {
      trackLocalWrite(committedRecords.length, 'نقل الأخطاء تلقائياً لمجلد الأخطاء');
    }

    return committedRecords.length;
  } catch (err) {
    if (isQuotaExceededError(err)) {
      handleFirestoreError(err, OperationType.WRITE, 'folder_questions');
    } else if (!isTransientFirestoreError(err)) {
      console.warn('Note saving batch mistakes to folder_questions:', err);
    }
    return 0;
  }
}

/**
 * Transfers any mistaken question immediately into the student's separate mistakes folder for that course.
 * Uses cached deleted_folder_questions and cached folder_questions so repeated calls
 * trigger ZERO repeated Firestore read queries or duplicate writes!
 */
export async function transferMistakeImmediately({
  userId,
  courseId,
  examTitle,
  question,
  studentAnswerIndex,
}: {
  userId: string;
  courseId?: string;
  examTitle?: string;
  question: ExamQuestion;
  studentAnswerIndex?: number;
}): Promise<boolean> {
  if (!userId || !question || isQuotaExceededActive()) return false;
  const effectiveCourseId = courseId || 'course_default_1';

  try {
    const folderId = await getOrCreateMistakesFolderId(userId, effectiveCourseId);
    if (!folderId) {
      return false;
    }

    // Guard against duplicates currently inside the folder using cached folderQuestions
    const { folderQuestions } = await ensureStudentFoldersLoaded(userId);
    if (isQuestionAlreadyInFolder(folderQuestions, folderId, question)) {
      return false;
    }

    const createdAt = new Date().toISOString();
    const payload = {
      folderId,
      courseId: effectiveCourseId,
      userId,
      originalQuestionId: question.id || '',
      questionText: question.questionText || '',
      imageUrl: question.imageUrl || '',
      options: Array.isArray(question.options) ? question.options : [],
      correctOptionIndex: typeof question.correctOptionIndex === 'number' ? question.correctOptionIndex : 0,
      explanation: question.explanation || '',
      sourceExamTitle: examTitle || 'اختبار في المنصة',
      studentChoiceIndex: typeof studentAnswerIndex === 'number' ? studentAnswerIndex : null,
      isAutoTransferredMistake: true,
      createdAt,
    };

    const addedRef = await addDoc(collection(db, 'folder_questions'), payload);
    trackLocalWrite(1, 'نقل خطأ تلقائياً لمجلد الأخطاء');
    addLocalFolderQuestion(userId, {
      id: addedRef.id,
      ...(payload as Omit<FolderQuestionItem, 'id'>),
    });

    return true;
  } catch (err) {
    if (isQuotaExceededError(err)) {
      handleFirestoreError(err, OperationType.WRITE, 'folder_questions');
    } else if (!isTransientFirestoreError(err)) {
      console.warn('Error transferring mistake immediately to folder_questions:', err);
    }
    return false;
  }
}
