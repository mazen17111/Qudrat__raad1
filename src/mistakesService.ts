import { collection, query, where, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { ExamQuestion } from './types';

// In-memory cache for course-specific mistakes folder IDs
// Key: `${userId}:::${courseId}`
const cachedCourseMistakesFolderId: Record<string, string> = {};

/**
 * Ensures that EACH COURSE has its OWN completely separate "مجلد الأخطاء".
 * Course 1's mistakes folder NEVER overlaps with Course 2's mistakes folder!
 */
export async function getOrCreateMistakesFolderId(userId: string, courseId?: string): Promise<string | null> {
  if (!userId) return null;
  const effectiveCourseId = courseId || 'course_default_1';
  const cacheKey = `${userId}:::${effectiveCourseId}`;

  if (cachedCourseMistakesFolderId[cacheKey]) {
    return cachedCourseMistakesFolderId[cacheKey];
  }

  try {
    // Look up folders for this user strictly in this course
    const q = query(
      collection(db, 'folders'),
      where('userId', '==', userId)
    );
    const snap = await getDocs(q);

    let foundId: string | null = null;
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      const folderCourse = d.courseId || 'course_default_1';
      // Match course strictly so Course 1 and Course 2 never mix!
      if (folderCourse === effectiveCourseId) {
        const isMistakes = Boolean(
          d.isDefaultMistakesFolder ||
          d.title === 'مجلد الاخطاء' ||
          d.title === 'مجلد الأخطاء' ||
          d.title === 'دفتر الاخطاء' ||
          d.title === 'دفتر الأخطاء'
        );
        if (isMistakes && !foundId) {
          foundId = docSnap.id;
        }
      }
    });

    if (foundId) {
      cachedCourseMistakesFolderId[cacheKey] = foundId;
      return foundId;
    }

    // Create a brand new dedicated Mistakes Folder specifically for THIS course
    const newDoc = await addDoc(collection(db, 'folders'), {
      userId,
      courseId: effectiveCourseId,
      title: 'مجلد الأخطاء',
      isDefaultMistakesFolder: true,
      createdAt: new Date().toISOString(),
    });

    cachedCourseMistakesFolderId[cacheKey] = newDoc.id;
    return newDoc.id;
  } catch (err) {
    console.error('Error in getOrCreateMistakesFolderId for course:', effectiveCourseId, err);
    return null;
  }
}

/**
 * Marks a question as permanently deleted by the student from a folder.
 */
export async function markQuestionAsPermanentlyDeleted({
  userId,
  courseId,
  folderId,
  originalQuestionId,
  questionText,
  imageUrl,
}: {
  userId: string;
  courseId?: string;
  folderId?: string;
  originalQuestionId?: string;
  questionText?: string;
  imageUrl?: string;
}): Promise<void> {
  if (!userId) return;
  const effectiveCourseId = courseId || 'course_default_1';
  try {
    await addDoc(collection(db, 'deleted_folder_questions'), {
      userId,
      courseId: effectiveCourseId,
      folderId: folderId || '',
      originalQuestionId: originalQuestionId || '',
      questionText: (questionText || '').trim(),
      imageUrl: (imageUrl || '').trim(),
      deletedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'deleted_folder_questions');
    console.warn('Note saving deletion audit record:', err);
  }
}

/**
 * Permanently deletes a list of correctly answered questions from a specific folder
 * and records them in `deleted_folder_questions` so they NEVER come back automatically.
 */
export async function deleteCorrectQuestionsFromFolderPermanently({
  userId,
  courseId,
  folderId,
  questions,
}: {
  userId: string;
  courseId?: string;
  folderId?: string;
  questions: ExamQuestion[];
}): Promise<string[]> {
  if (!userId || !Array.isArray(questions) || questions.length === 0) return [];
  const effectiveCourseId = courseId || 'course_default_1';
  const deletedDocIds: string[] = [];

  try {
    // Load existing folder_questions for this user (and folder if provided) to match all copies & retrieve originalQuestionId
    const folderQuery = folderId
      ? query(
          collection(db, 'folder_questions'),
          where('userId', '==', userId),
          where('folderId', '==', folderId)
        )
      : query(
          collection(db, 'folder_questions'),
          where('userId', '==', userId)
        );

    const snap = await getDocs(folderQuery);

    const targetIds = new Set(
      questions
        .map((q) => (q.id || '').trim())
        .filter((id) => id && !id.startsWith('fq_') && !id.startsWith('q_default_') && !id.startsWith('temp_'))
    );

    const targetSignatures = questions.map((q) => ({
      id: (q.id || '').trim(),
      text: (q.questionText || '').trim(),
      imageUrl: (q.imageUrl || '').trim(),
    }));

    const matchedDocsToDelete: Array<{
      ref: ReturnType<typeof doc>;
      docId: string;
      folderId: string;
      originalQuestionId: string;
      questionText: string;
      imageUrl: string;
    }> = [];

    const matchedQuestionKeys = new Set<string>();

    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const docFolderId = String(data.folderId || '');
      if (folderId && docFolderId !== folderId) return;

      const docText = String(data.questionText || '').trim();
      const docImage = String(data.imageUrl || '').trim();
      const docOrigId = String(data.originalQuestionId || '').trim();

      const matchesById = targetIds.has(docSnap.id) || (docOrigId && targetIds.has(docOrigId));
      const matchesByContent = targetSignatures.some(
        (sig) => sig.text !== '' && sig.text === docText && sig.imageUrl === docImage
      );

      // If folderId wasn't passed, only match by exact doc ID so we never delete from unrelated folders
      const isMatch = folderId ? (matchesById || matchesByContent) : matchesById;

      if (isMatch) {
        matchedDocsToDelete.push({
          ref: docSnap.ref,
          docId: docSnap.id,
          folderId: docFolderId || folderId || '',
          originalQuestionId: docOrigId || docSnap.id,
          questionText: docText,
          imageUrl: docImage,
        });
        matchedQuestionKeys.add(docSnap.id);
        if (docOrigId) matchedQuestionKeys.add(docOrigId);
        matchedQuestionKeys.add(`${docText}|||${docImage}`);
      }
    });

    // Delete matched Firestore documents & record each in deleted_folder_questions
    for (const item of matchedDocsToDelete) {
      await deleteDoc(item.ref);
      deletedDocIds.push(item.docId);

      await markQuestionAsPermanentlyDeleted({
        userId,
        courseId: effectiveCourseId,
        folderId: item.folderId,
        originalQuestionId: item.originalQuestionId,
        questionText: item.questionText,
        imageUrl: item.imageUrl,
      });
    }

    // Fallback: for any target question whose direct doc ID wasn't returned by the query (e.g., missing userId on legacy record)
    for (const q of questions) {
      const qId = (q.id || '').trim();
      const qText = (q.questionText || '').trim();
      const qImage = (q.imageUrl || '').trim();
      const sigKey = `${qText}|||${qImage}`;

      const alreadyHandled =
        (qId && matchedQuestionKeys.has(qId)) ||
        (qText && matchedQuestionKeys.has(sigKey));

      if (!alreadyHandled) {
        if (qId && !qId.startsWith('fq_') && !qId.startsWith('q_default_') && !qId.startsWith('temp_')) {
          try {
            await deleteDoc(doc(db, 'folder_questions', qId));
            deletedDocIds.push(qId);
          } catch (delErr) {
            handleFirestoreError(delErr, OperationType.DELETE, `folder_questions/${qId}`);
          }
        }

        await markQuestionAsPermanentlyDeleted({
          userId,
          courseId: effectiveCourseId,
          folderId: folderId || '',
          originalQuestionId: qId,
          questionText: qText,
          imageUrl: qImage,
        });
      }
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
  deletedDocs: Array<Record<string, unknown>>,
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
    const dCourse = String(d.courseId || 'course_default_1');
    if (dCourse !== effectiveCourseId) return false;

    const dFolder = String(d.folderId || '');
    // Match the target mistakes folder (or legacy records without folderId)
    if (dFolder && dFolder !== folderId) return false;

    const dOrigId = String(d.originalQuestionId || '').trim();
    const dText = String(d.questionText || '').trim();
    const dImg = String(d.imageUrl || '').trim();

    if (qId && dOrigId && qId === dOrigId) {
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
 * Respects `deleted_folder_questions` so permanently deleted questions NEVER return automatically.
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

    // Check permanent deletion blocklist so permanently deleted questions NEVER return automatically
    const deletedQ = query(
      collection(db, 'deleted_folder_questions'),
      where('userId', '==', userId)
    );
    const deletedSnap = await getDocs(deletedQ);
    const deletedDocs = deletedSnap.docs.map((d) => d.data() as Record<string, unknown>);
    if (isQuestionInDeletedList(deletedDocs, { effectiveCourseId, folderId, question })) {
      return false;
    }

    // Guard against instant double-submission within 3 seconds for the exact same exam and question
    const existingQ = query(
      collection(db, 'folder_questions'),
      where('folderId', '==', folderId),
      where('userId', '==', userId)
    );
    const existingSnap = await getDocs(existingQ);

    const isDuplicateWithinSeconds = existingSnap.docs.some((d) => {
      const data = d.data();
      const sameExam = (data.sourceExamTitle || '') === (examTitle || '');
      const sameImg = (data.imageUrl || '') === (question.imageUrl || '');
      const sameText = (data.questionText || '').trim() === (question.questionText || '').trim();
      const isVeryRecent = data.createdAt && (Date.now() - new Date(data.createdAt).getTime() < 3000);
      return sameExam && sameImg && sameText && isVeryRecent;
    });

    if (isDuplicateWithinSeconds) {
      return false;
    }

    await addDoc(collection(db, 'folder_questions'), {
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
      createdAt: new Date().toISOString(),
    });

    return true;
  } catch (err) {
    console.error('Error transferring mistake immediately to folder_questions:', err);
    return false;
  }
}
