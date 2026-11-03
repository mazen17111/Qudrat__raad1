import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { db } from './firebase';
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
 * Marks a question as deleted by the student from a folder.
 */
export async function markQuestionAsPermanentlyDeleted({
  userId,
  courseId,
  folderId,
  originalQuestionId,
  questionText,
}: {
  userId: string;
  courseId?: string;
  folderId?: string;
  originalQuestionId?: string;
  questionText?: string;
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
      deletedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Note saving deletion audit record:', err);
  }
}

/**
 * Transfers any mistaken question immediately into the student's separate mistakes folder for that course.
 * Automatically saves all mistakes in any test uploaded on the platform!
 * Every mistake the student makes in any test is reliably transferred.
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
