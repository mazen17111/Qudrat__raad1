import React, { useEffect, useState } from 'react';
import { X, Award, PlayCircle, CheckCircle, BarChart3, TrendingUp, Calendar, Clock } from 'lucide-react';
import { StudentUser, ExamAttempt } from '../types';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: StudentUser;
  isDarkMode?: boolean;
}

export const StatsModal: React.FC<StatsModalProps> = ({ isOpen, onClose, currentUser, isDarkMode = true }) => {
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !currentUser) return;
    const fetchAttempts = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, 'exam_attempts'),
          where('userId', '==', currentUser.id)
        );
        const snap = await getDocs(q);
        const list: ExamAttempt[] = [];
        snap.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as ExamAttempt);
        });
        // Sort by createdAt descending
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setAttempts(list);
      } catch (err) {
        console.error('Error fetching attempts:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAttempts();
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const watchedCount = currentUser.watchedVideoIds?.length || 0;
  const examsCount = currentUser.totalExamsTaken || attempts.length;
  const avgScore = currentUser.averageScore ?? (
    attempts.length > 0
      ? Math.round(attempts.reduce((sum, a) => sum + (a.percentage || 0), 0) / attempts.length)
      : 0
  );

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200 ${
      isDarkMode ? 'bg-black/75' : 'bg-black/50'
    }`}>
      <div className={`relative w-full max-w-2xl rounded-3xl p-6 md:p-8 shadow-2xl overflow-hidden text-right border ${
        isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        {/* Header */}
        <div className={`flex items-center justify-between pb-4 border-b ${
          isDarkMode ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-500">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h2 className={`text-xl md:text-2xl font-black ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>احصائياتي</h2>
              <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600 font-bold'}`}>
                سجل إنجازاتك ومستوى أدائك في منصة أقسام رعد
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition ${
              isDarkMode
                ? 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800'
                : 'bg-slate-100 text-slate-700 hover:text-black hover:bg-slate-200 border border-slate-200'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3 Main Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
          {/* 1. Watched Videos */}
          <div className={`p-4 rounded-2xl border relative overflow-hidden group ${
            isDarkMode ? 'bg-slate-800/60 border-slate-700/60' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between text-blue-500 mb-2">
              <span className="text-xs font-bold">الفيديوهات التي شاهدتها</span>
              <PlayCircle className="w-5 h-5" />
            </div>
            <div className={`text-3xl font-black ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>{watchedCount}</div>
            <p className={`text-[11px] mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>محاضرات وشروحات مكتملة</p>
          </div>

          {/* 2. Solved Exams */}
          <div className={`p-4 rounded-2xl border relative overflow-hidden group ${
            isDarkMode ? 'bg-slate-800/60 border-slate-700/60' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between text-emerald-500 mb-2">
              <span className="text-xs font-bold">الاختبارات التي قمت بحلها</span>
              <CheckCircle className="w-5 h-5" />
            </div>
            <div className={`text-3xl font-black ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>{examsCount}</div>
            <p className={`text-[11px] mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>اختبارات محاكية ومجلدات</p>
          </div>

          {/* 3. Average Score */}
          <div className={`p-4 rounded-2xl border relative overflow-hidden group ${
            isDarkMode ? 'bg-slate-800/60 border-slate-700/60' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between text-amber-500 mb-2">
              <span className="text-xs font-bold">متوسط جميع اختباراتك</span>
              <Award className="w-5 h-5" />
            </div>
            <div className="text-3xl font-black text-amber-500">%{avgScore}</div>
            <p className={`text-[11px] mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
              {avgScore >= 85 ? 'ممتاز! في طريقك للـ 100%' : avgScore >= 65 ? 'جيد جداً، واصل التدريب' : 'تحتاج لمزيد من التركيز'}
            </p>
          </div>
        </div>

        {/* Recent Exams Log */}
        <div className="space-y-3">
          <h3 className={`text-sm font-bold flex items-center gap-1.5 ${
            isDarkMode ? 'text-slate-300' : 'text-slate-800'
          }`}>
            <TrendingUp className="w-4 h-4 text-blue-500" />
            <span>سجل آخر الاختبارات</span>
          </h3>

          {loading ? (
            <div className="py-8 text-center text-sm text-slate-500">جاري تحميل سجل الاختبارات...</div>
          ) : attempts.length === 0 ? (
            <div className={`py-8 text-center rounded-2xl border text-sm ${
              isDarkMode ? 'bg-slate-800/30 border-slate-800 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}>
              لم تقم بحل أي اختبارات بعد. ابدأ أول اختبار الآن لتحصل على إحصائياتك!
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {attempts.map((att) => (
                <div
                  key={att.id}
                  className={`p-3 rounded-xl border flex items-center justify-between text-xs md:text-sm ${
                    isDarkMode ? 'bg-slate-800/40 border-slate-700/40' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                >
                  <div className="space-y-1">
                    <div className={`font-bold ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>{att.examTitle}</div>
                    <div className={`text-[11px] flex items-center gap-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(att.createdAt).toLocaleDateString('ar-SA')}
                      </span>
                      <span>•</span>
                      <span>{att.score} من {att.totalQuestions} صحيحة</span>
                    </div>
                  </div>
                  <div className={`px-2.5 py-1 rounded-lg font-black text-xs ${
                    att.percentage >= 85
                      ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                      : att.percentage >= 60
                      ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                      : 'bg-rose-500/20 text-rose-500 border border-rose-500/30'
                  }`}>
                    %{att.percentage}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`mt-6 pt-4 border-t flex justify-end ${
          isDarkMode ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <button
            onClick={onClose}
            className={`px-5 py-2.5 rounded-xl text-xs md:text-sm font-bold transition ${
              isDarkMode
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200'
            }`}
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
