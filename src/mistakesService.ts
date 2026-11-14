import { collection, query, where, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { ExamQuestion, FolderItem, FolderQuestionItem } from './types';
import {
  addLocalDeletedSignature,
  addLocalFolder,
  addLocalFolderQuestion,
  ensureDeletedQuestionsLoaded,
  ensureStudentFoldersLoaded,
  getStudentFoldersSnapshot,
  LocalDeletedSignature,
  removeLocalFolderQuestions,
} from './utils/studentFoldersStore';

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
 * Marks a question as permanently deleted by the student from a folder.
 * Uses a single Firestore document (storing alternateOriginalQuestionId when present) to halve writes.
 */
export async function markQuestionAsPermanentlyDeleted({
  userId,
  courseId,
  folderId,
  originalQuestionId,
  alternateOriginalQuestionId,
  questionText,
  imageUrl,
}: {
  userId: string;
  courseId?: string;
  folderId?: string;
  originalQuestionId?: string;
  alternateOriginalQuestionId?: string;
  questionText?: string;
  imageUrl?: string;
}): Promise<void> {
  if (!userId) return;
  const effectiveCourseId = courseId || 'course_default_1';
  const normalizedEntry: LocalDeletedSignature = {
    courseId: effectiveCourseId,
    folderId: folderId || '',
    originalQuestionId: (originalQuestionId || '').trim(),
    ...(alternateOriginalQuestionId?.trim()
      ? { alternateOriginalQuestionId: alternateOriginalQuestionId.trim() }
      : {}),
    questionText: (questionText || '').trim(),
    imageUrl: (imageUrl || '').trim(),
  };

  addLocalDeletedSignature(userId, normalizedEntry);

  try {
    await addDoc(collection(db, 'deleted_folder_questions'), {
      userId,
      courseId: effectiveCourseId,
      folderId: normalizedEntry.folderId,
      originalQuestionId: normalizedEntry.originalQuestionId,
      ...(normalizedEntry.alternateOriginalQuestionId
        ? { alternateOriginalQuestionId: normalizedEntry.alternateOriginalQuestionId }
        : {}),
      questionText: normalizedEntry.questionText,
      imageUrl: normalizedEntry.imageUrl,
      deletedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'deleted_folder_questions');
    console.warn('Note saving deletion audit record:', err);
  }
}

/**
 * Permanently deletes ONLY the correctly answered questions from a specific folder
 * and records them in `deleted_folder_questions` so they NEVER come back.
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

/**
 * Checks whether a question was permanently deleted by the student from a specific folder (or mistakes folder).
 */
function isQuestionInDeletedList(
  deletedDocs: Array<LocalDeletedSignature | Record<string, unknown>>,
  {
    effectiveCourseId,
    folderId,
    question,
  }: {
    effectiveCourseId: string;
    folderId: string;
    question: ExamQuestion;
  }
): boolean {
  const qId = (question.id || '').trim();
  const qText = (question.questionText || '').trim();
  const qImg = (question.imageUrl || '').trim();

  return deletedDocs.some((d) => {
    const dCourse = String((d as any).courseId || 'course_default_1');
    if (dCourse !== effectiveCourseId) return false;

    const dFolder = String((d as any).folderId || '');
    if (dFolder && dFolder !== folderId) return false;

    const dOrigId = String((d as any).originalQuestionId || '').trim();
    const dAltOrigId = String((d as any).alternateOriginalQuestionId || '').trim();
    const dText = String((d as any).questionText || '').trim();
    const dImg = String((d as any).imageUrl || '').trim();

    if (qId && ((dOrigId && qId === dOrigId) || (dAltOrigId && qId === dAltOrigId))) {
      return true;
    }

    if (qText && dText && qText === dText) {
      return !dImg || !qImg || dImg === qImg;
    }

    return false;
  });
}

/**
 * Transfers any mistaken question immediately into the student's separate mistakes folder for that course.
 * Uses cached deleted_folder_questions and cached folder_questions so getting multiple mistakes in an exam
 * triggers ZERO repeated Firestore read queries!
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
  if (!userId || !question) return false;
  const effectiveCourseId = courseId || 'course_default_1';

  try {
    const folderId = await getOrCreateMistakesFolderId(userId, effectiveCourseId);
    if (!folderId) {
      console.warn('Could not obtain mistakes folderId for user', userId, effectiveCourseId);
      return false;
    }

    // 1. Check local + cached Firestore permanent deletion blocklist (at most 1 read query per session!)
    const localDeleted = getStudentFoldersSnapshot(userId).deletedSignatures;
    if (isQuestionInDeletedList(localDeleted, { effectiveCourseId, folderId, question })) {
      return false;
    }

    const remoteDeleted = await ensureDeletedQuestionsLoaded(userId);
    if (isQuestionInDeletedList(remoteDeleted, { effectiveCourseId, folderId, question })) {
      return false;
    }

    // 2. Guard against instant double-submission within 3 seconds using cached folderQuestions
    const { folderQuestions } = await ensureStudentFoldersLoaded(userId);
    const isDuplicateWithinSeconds = folderQuestions.some((data) => {
      if (data.folderId !== folderId) return false;
      const sameExam = (data.sourceExamTitle || '') === (examTitle || '');
      const sameImg = (data.imageUrl || '') === (question.imageUrl || '');
      const sameText = (data.questionText || '').trim() === (question.questionText || '').trim();
      const isVeryRecent = data.createdAt && Date.now() - new Date(data.createdAt).getTime() < 3000;
      return sameExam && sameImg && sameText && isVeryRecent;
    });

    if (isDuplicateWithinSeconds) {
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
    addLocalFolderQuestion(userId, {
      id: addedRef.id,
      ...(payload as Omit<FolderQuestionItem, 'id'>),
    });

    return true;
  } catch (err) {
    console.error('Error transferring mistake immediately to folder_questions:', err);
    return false;
  }
}
