import React from 'react';
import { StudentUser, ExamQuestion, ExamSystemType } from '../../types';

export interface BaseExamSystemProps {
  safeQuestions: ExamQuestion[];
  currentIdx: number;
  setCurrentIdx: React.Dispatch<React.SetStateAction<number>>;
  selectedAnswers: Record<number, number>;
  handleSelectOption: (questionIdx: number, optionIdx: number) => void;
  visitedIndices: Record<number, boolean>;
  markedForReview: Record<number, boolean>;
  setMarkedForReview: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  isTimed: boolean;
  timeLeft: number;
  formatTime: (sec: number) => string;
  currentUser: StudentUser;
  nationalId: string;
  examTitle: string;
  currentDateStr: string;
  handleRequestExit: () => void;
  finishTest: () => void;
  setShowFolderModalForQ: (q: ExamQuestion | null) => void;
  currentQCustomFolders: Array<{ id: string; title: string }>;
  setZoomedImageUrl: (url: string | null) => void;
  setImageZoomScale: React.Dispatch<React.SetStateAction<number>>;
  setShowExamInstructionsModal: (show: boolean) => void;
  setShowSectionModal: (show: boolean) => void;
  setShowEquationsModal: (show: boolean) => void;
  isDarkMode?: boolean;
  systemMode: ExamSystemType;
}

export interface DefaultExamSystemProps extends BaseExamSystemProps {
  isWhiteboardOpen: boolean;
  setIsWhiteboardOpen: React.Dispatch<React.SetStateAction<boolean>>;
  mobileViewMode: 'question' | 'whiteboard';
  setMobileViewMode: React.Dispatch<React.SetStateAction<'question' | 'whiteboard'>>;
  setShowMobileQuestionsList: (show: boolean) => void;
  showMobileQuestionsList: boolean;
  progressPercent: number;
  courseTitle?: string;
}
