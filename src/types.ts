export interface StudentUser {
  id: string;
  name: string;
  email: string;
  password: string;
  daysAllowed: number;
  isUnlimited?: boolean;
  subscriptionStartDate?: string;
  subscriptionEndDate?: string;
  isIndividuallyBlocked?: boolean;
  blockedReason?: 'maintenance' | 'subscription' | 'supervisor';
  blockedCustomMessage?: string;
  isIndividuallyWhitelisted?: boolean;
  watchedVideoIds?: string[];
  totalExamsTaken?: number;
  averageScore?: number;
  createdAt: string;
  lastLoginAt?: string;
}

export interface BannedEmail {
  id: string;
  email: string;
  bannedAt: string;
  reason?: string;
}

export interface ExamQuestion {
  id: string;
  questionText: string;
  imageUrl?: string;
  options: string[];
  correctOptionIndex: number;
  explanation?: string;
}

export interface SectionItem {
  id: string;
  title: string;
  description?: string;
  order: number;
  createdAt?: string;
}

export interface ResourceItem {
  id: string;
  sectionId: string;
  title: string;
  description?: string;
  order: number;
  createdAt?: string;
}

export interface ContentItem {
  id: string;
  resourceId: string;
  type: 'video' | 'file' | 'exam';
  title: string;
  description?: string;
  url?: string;
  fileData?: string; // base64 or upload data
  fileName?: string;
  fileSize?: string;
  isExternal?: boolean;
  questions?: ExamQuestion[];
  durationMinutes?: number;
  targetPercentage?: number;
  linkedExamIds?: string[];
  linkedFileIds?: string[];
  createdAt: string;
}

export interface FolderItem {
  id: string;
  userId: string;
  title: string;
  isDefaultMistakesFolder?: boolean;
  createdAt: string;
}

export interface FolderQuestionItem {
  id: string;
  folderId: string;
  userId: string;
  questionText: string;
  imageUrl?: string;
  options: string[];
  correctOptionIndex: number;
  explanation?: string;
  sourceExamTitle?: string;
  createdAt: string;
}

export interface ExamAttempt {
  id: string;
  userId: string;
  studentName: string;
  examId: string;
  examTitle: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  isTimed: boolean;
  durationSeconds: number;
  createdAt: string;
}

export interface ThemeConfig {
  id: string;
  name: string;
  primary: string; // Tailwind hex or class
  secondary: string;
  accent: string;
  bgGradient: string;
  cardBg: string;
  headerBg: string;
  accentBorder: string;
  badgeBg: string;
  buttonGradient: string;
}

export interface SystemAnnouncement {
  isActive: boolean;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'urgent';
  updatedAt?: string;
}

export interface SystemLiveStream {
  isActive: boolean;
  title: string;
  streamUrl: string;
  hostName: string;
  notes?: string;
  updatedAt?: string;
}

export interface IntroLessonConfig {
  isActive: boolean;
  title: string;
  videoUrl: string;
  description?: string;
  updatedAt?: string;
}

export interface FeaturesConfig {
  telegramMainGroupUrl: string;
  telegramDiscussionGroupUrl: string;
  isDiagnosticEnabled?: boolean;
  isFriendsChallengeEnabled?: boolean;
  updatedAt?: string;
}

export interface FriendChallengeParticipant {
  userId: string;
  name: string;
  score: number;
  correctAnswers: number;
  wrongAnswers: number;
  answers: Record<number, number>;
  isFinished: boolean;
  finishedAt?: string;
}

export interface FriendChallengeQuestionRef {
  examId: string;
  questionIndex: number;
  questionId?: string;
}

export interface FriendChallengeDoc {
  id: string;
  code: string;
  hostId: string;
  hostName: string;
  guestId?: string;
  guestName?: string;
  status: 'waiting' | 'active' | 'finished';
  examCount: number;
  selectedExamIds: string[];
  questionRefs?: FriendChallengeQuestionRef[];
  questions?: ExamQuestion[];
  participants: {
    [userId: string]: FriendChallengeParticipant;
  };
  winnerId?: string | 'tie';
  winnerName?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SystemSettings {
  isPlatformLocked: boolean;
  lockReason: 'maintenance' | 'subscription' | 'none';
  lockMessage: string;
  maintenanceMessage?: string;
  subscriptionMessage?: string;
  whatsappNumber?: string;
  telegramUsername?: string;
  announcement: SystemAnnouncement;
  liveStream: SystemLiveStream;
  activeTheme: ThemeConfig;
  introLesson?: IntroLessonConfig;
  features?: FeaturesConfig;
  logoUrl?: string;
  updatedAt?: string;
}
