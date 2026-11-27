import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Award,
  Check,
  CloudUpload,
  Copy,
  Download,
  Edit3,
  FileDown,
  FileSpreadsheet,
  Laptop,
  Loader2,
  Medal,
  MessageSquare,
  Plus,
  Search,
  Send,
  Smartphone,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import { NumericStepperInput } from './NumericStepperInput';
import {
  CoverConfig,
  GradeProfile,
  Institution,
  ParentMessageTemplateMode,
  PenaltyDivisor,
  PersistedExamRecord,
  PrizeExamDefinition,
  StudentRecord,
  WeeklyBulkFilterMode,
  WeeklyComparisonRow,
  WeeklyExamMeta,
  WeeklyQuestionPreset,
  WeeklySortKey,
  WeeklyStatusFilter,
  WeeklyStudentScore,
} from '../types/academy';
import {
  buildWeeklyComparisonWorkbookBlob,
  defaultClassroomForGrade,
  exportWeeklyComparisonToXlsx,
} from '../utils/excelExport';
import { generate8DigitStudentNumber } from '../utils/institutionCodes';
import {
  normalizeTurkishSlug,
  uint8ArrayToPdfBlob,
} from '../utils/downloadHelpers';
import {
  buildWeeklyPcStandaloneHtml,
  generateAchievementBadgePng,
  generateWeeklyFullPcZip,
  generateWeeklyRankingPdf,
  triggerDownload,
} from '../utils/pdfAndZip';
import {
  buildParentMessage,
  buildSampleWeeklyCohort,
  buildSmsHref,
  buildWhatsAppHref,
  computeWeeklyCohortInsights,
  computeWeeklyComparison,
  filterAndSortWeeklyRows,
  filterRowsForBulkMessages,
  normalizeClassroomForGrade,
} from '../utils/weeklyAnalysis';
import { getLogoPreset } from '../data/logos';
import { DriveUploadPayload } from './GoogleDrivePanel';
import { DynamicAchievementBadge } from './DynamicAchievementBadge';
import { FurkanDigitalSignature } from './FurkanDigitalSignature';
import { InstitutionRankingsBoard } from './InstitutionRankingsBoard';

const QUESTION_PRESETS: WeeklyQuestionPreset[] = [20, 40, 50, 60, 80, 90, 120];

interface WeeklyComparisonViewProps {
  activeInstitution: Institution;
  institutions?: Institution[];
  gradeProfile: GradeProfile;
  penaltyDivisor?: PenaltyDivisor;
  onChangePenaltyDivisor?: (divisor: PenaltyDivisor) => void;
  students: StudentRecord[];
  cover: CoverConfig;
  driveConnected: boolean;
  onSaveWeeklyToDrive: (payloads: DriveUploadPayload[]) => Promise<void>;
  onOpenDriveTab: () => void;
  onToast: (msg: string) => void;
  onSyncWeeklyExportsRef?: (builder: () => Promise<DriveUploadPayload[]>) => void;
  externalEntries?: WeeklyStudentScore[];
  onExternalEntriesChange?: (next: WeeklyStudentScore[]) => void;
  externalQuestionCount?: WeeklyQuestionPreset;
  onExternalQuestionCountChange?: (next: WeeklyQuestionPreset) => void;
  examHistory?: PersistedExamRecord[];
  examHistoryByInst?: Record<string, PersistedExamRecord[]>;
  weeklyEntriesByInst?: Record<string, WeeklyStudentScore[]>;
  prizeExams?: PrizeExamDefinition[];
  prizeExamsByInst?: Record<string, PrizeExamDefinition[]>;
  activePrizeExamId?: string | null;
  isPrivateAdminMode?: boolean;
  onSelectInstitution?: (inst: Institution) => void;
  onCreatePrizeExam?: (exam: PrizeExamDefinition) => void;
  onDeletePrizeExam?: (id: string) => void;
  onActivatePrizeExamForOmr?: (prizeExamId: string | null) => void;
  onOpenOmr?: () => void;
}

export function WeeklyComparisonView({
  activeInstitution,
  institutions,
  gradeProfile,
  penaltyDivisor,
  onChangePenaltyDivisor,
  students,
  cover,
  driveConnected,
  onSaveWeeklyToDrive,
  onOpenDriveTab,
  onToast,
  onSyncWeeklyExportsRef,
  externalEntries,
  onExternalEntriesChange,
  externalQuestionCount,
  onExternalQuestionCountChange,
  examHistory = [],
  examHistoryByInst,
  weeklyEntriesByInst,
  prizeExams = [],
  prizeExamsByInst,
  activePrizeExamId = null,
  isPrivateAdminMode = false,
  onSelectInstitution,
  onCreatePrizeExam,
  onDeletePrizeExam,
  onActivatePrizeExamForOmr,
  onOpenOmr,
}: WeeklyComparisonViewProps) {
  const [internalQuestionCount, setInternalQuestionCount] = useState<WeeklyQuestionPreset>(50);
  const questionCount = externalQuestionCount ?? internalQuestionCount;
  const setQuestionCount = (next: WeeklyQuestionPreset) => {
    setInternalQuestionCount(next);
    if (onExternalQuestionCountChange) {
      onExternalQuestionCountChange(next);
    }
  };

  const [kts1Meta, setKts1Meta] = useState<WeeklyExamMeta>(() => ({
    id: 'kts-1',
    name: 'Haftalık 1 (KTS-1)',
    date: new Date(Date.now() - 7 * 86400000).toLocaleDateString('tr-TR'),
    questionCount,
    gradeId: gradeProfile.id,
  }));
  const [kts2Meta, setKts2Meta] = useState<WeeklyExamMeta>(() => ({
    id: 'kts-2',
    name: 'Haftalık 2 (KTS-2)',
    date: new Date().toLocaleDateString('tr-TR'),
    questionCount,
    gradeId: gradeProfile.id,
  }));

  const [internalEntries, setInternalEntries] = useState<WeeklyStudentScore[]>([]);
  const entries = externalEntries ?? internalEntries;
  const setEntries = (
    updater: WeeklyStudentScore[] | ((prev: WeeklyStudentScore[]) => WeeklyStudentScore[])
  ) => {
    const next = typeof updater === 'function' ? updater(entries) : updater;
    if (onExternalEntriesChange) {
      onExternalEntriesChange(next);
    } else {
      setInternalEntries(next);
    }
  };
  const [newName, setNewName] = useState('');
  const [newClassroom, setNewClassroom] = useState(() =>
    defaultClassroomForGrade(gradeProfile.id)
  );
  const [newPhone, setNewPhone] = useState('');
  const [newK1Correct, setNewK1Correct] = useState(32);
  const [newK1Wrong, setNewK1Wrong] = useState(8);
  const [newK2Correct, setNewK2Correct] = useState(38);
  const [newK2Wrong, setNewK2Wrong] = useState(5);
  const [newWeakNote, setNewWeakNote] = useState('');

  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [customMessages, setCustomMessages] = useState<Record<string, string>>({});
  const [messageMode, setMessageMode] = useState<ParentMessageTemplateMode>('auto');
  const [bulkFilterMode, setBulkFilterMode] = useState<WeeklyBulkFilterMode>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<WeeklyStatusFilter>('all');
  const [sortKey, setSortKey] = useState<WeeklySortKey>('rank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyExport, setBusyExport] = useState(false);

  useEffect(() => {
    setNewClassroom(defaultClassroomForGrade(gradeProfile.id));
    setKts1Meta((p) => ({ ...p, gradeId: gradeProfile.id, questionCount }));
    setKts2Meta((p) => ({ ...p, gradeId: gradeProfile.id, questionCount }));
    if (entries.length > 0) {
      const normalized = entries.map((e) => ({
        ...e,
        classroom: normalizeClassroomForGrade(e.classroom, gradeProfile),
      }));
      const changed = normalized.some((e, idx) => e.classroom !== entries[idx]?.classroom);
      if (changed) {
        setEntries(normalized);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gradeProfile, questionCount]);

  const handleQuestionPresetChange = (count: WeeklyQuestionPreset) => {
    setQuestionCount(count);
    setKts1Meta((p) => ({ ...p, questionCount: count }));
    setKts2Meta((p) => ({ ...p, questionCount: count }));
    const nextK1C = Math.round(count * 0.7);
    const nextK1W = Math.min(count - nextK1C, Math.round(count * 0.15));
    const nextK2C = Math.round(count * 0.8);
    const nextK2W = Math.min(count - nextK2C, Math.round(count * 0.1));
    setNewK1Correct(nextK1C);
    setNewK1Wrong(nextK1W);
    setNewK2Correct(nextK2C);
    setNewK2Wrong(nextK2W);
    if (entries.length > 0) {
      setEntries((prev) =>
        prev.map((e) => {
          const k1c = Math.min(count, e.kts1Correct);
          const k1w = Math.min(count - k1c, e.kts1Wrong);
          const k2c = Math.min(count, e.kts2Correct);
          const k2w = Math.min(count - k2c, e.kts2Wrong);
          return {
            ...e,
            kts1Correct: k1c,
            kts1Wrong: k1w,
            kts1Blank: Math.max(0, count - k1c - k1w),
            kts2Correct: k2c,
            kts2Wrong: k2w,
            kts2Blank: Math.max(0, count - k2c - k2w),
          };
        })
      );
    }
    onToast(`Haftalık deneme soru sayısı ${count} soru olarak ayarlandı.`);
  };

  const effectivePenaltyDivisor = penaltyDivisor ?? gradeProfile.penaltyDivisor;

  const rows: WeeklyComparisonRow[] = useMemo(
    () =>
      computeWeeklyComparison({
        entries,
        kts1TotalQuestions: kts1Meta.questionCount,
        kts2TotalQuestions: kts2Meta.questionCount,
        gradeProfile,
        penaltyDivisorOverride: effectivePenaltyDivisor,
      }),
    [entries, kts1Meta.questionCount, kts2Meta.questionCount, gradeProfile, effectivePenaltyDivisor]
  );

  const insights = useMemo(() => computeWeeklyCohortInsights(rows), [rows]);

  const displayedRows = useMemo(
    () =>
      filterAndSortWeeklyRows(rows, {
        search: searchQuery,
        statusFilter,
        sortKey,
        sortDir,
      }),
    [rows, searchQuery, statusFilter, sortKey, sortDir]
  );

  const selectedRow =
    rows.find((r) => r.studentId === selectedRowId) ?? rows[0] ?? null;

  const getMessageForRow = (row: WeeklyComparisonRow, overrideMode?: ParentMessageTemplateMode) => {
    const activeMode = overrideMode ?? messageMode;
    const customKey = `${row.studentId}::${activeMode}`;
    if (customMessages[customKey] !== undefined) {
      return customMessages[customKey];
    }
    return buildParentMessage({
      row,
      academyName: activeInstitution.name,
      kts1Name: kts1Meta.name,
      kts2Name: kts2Meta.name,
      gradeLabel: gradeProfile.shortLabel,
      gradeProfile,
      mode: activeMode,
    });
  };

  const allParentMessagesText = useMemo(() => {
    const targetRows = filterRowsForBulkMessages(rows, bulkFilterMode);
    return targetRows
      .map(
        (r) =>
          `[${r.rank}. SIRA — ${r.studentName} (${r.studentNumber8})]\n${getMessageForRow(r)}\n`
      )
      .join('\n--------------------------------------------------\n\n');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, bulkFilterMode, messageMode, customMessages, activeInstitution.name, kts1Meta.name, kts2Meta.name, gradeProfile.shortLabel]);

  const buildDrivePayloadFiles = async (): Promise<DriveUploadPayload[]> => {
    const activeRows =
      rows.length > 0
        ? rows
        : computeWeeklyComparison({
            entries: buildSampleWeeklyCohort({
              institution: activeInstitution,
              gradeId: gradeProfile.id,
              questionCount,
              existingStudents: students,
            }),
            kts1TotalQuestions: kts1Meta.questionCount,
            kts2TotalQuestions: kts2Meta.questionCount,
            gradeProfile,
          });

    const pdfBytes = await generateWeeklyRankingPdf({
      rows: activeRows,
      academyName: activeInstitution.name,
      institutionCode8: activeInstitution.code8,
      kts1Name: kts1Meta.name,
      kts2Name: kts2Meta.name,
      kts1QuestionCount: kts1Meta.questionCount,
      kts2QuestionCount: kts2Meta.questionCount,
      gradeProfile,
      cover,
    });
    const pdfBlob = uint8ArrayToPdfBlob(pdfBytes);

    const excelBlob = buildWeeklyComparisonWorkbookBlob({
      rows: activeRows,
      academyName: activeInstitution.name,
      kts1Name: kts1Meta.name,
      kts2Name: kts2Meta.name,
      gradeLabel: gradeProfile.shortLabel,
    });

    const pcHtml = buildWeeklyPcStandaloneHtml({
      rows: activeRows,
      academyName: activeInstitution.name,
      institutionCode8: activeInstitution.code8,
      kts1Name: kts1Meta.name,
      kts2Name: kts2Meta.name,
      kts1QuestionCount: kts1Meta.questionCount,
      kts2QuestionCount: kts2Meta.questionCount,
      gradeLabel: gradeProfile.shortLabel,
      signatureName: cover.signatureName,
    });
    const htmlBlob = new Blob([pcHtml], { type: 'text/html;charset=utf-8' });

    const safeTag = `${gradeProfile.id}-${kts2Meta.questionCount}soru`;
    return [
      {
        fileName: `Pano-Asma-Sirali-Liste-${safeTag}.pdf`,
        mimeType: 'application/pdf',
        blob: pdfBlob,
      },
      {
        fileName: `Haftalik-Karsilastirma-${safeTag}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        blob: excelBlob,
      },
      {
        fileName: `Bilgisayarda-Ac-Haftalik-Liste-${safeTag}.html`,
        mimeType: 'text/html',
        blob: htmlBlob,
      },
    ];
  };

  useEffect(() => {
    if (onSyncWeeklyExportsRef) {
      onSyncWeeklyExportsRef(buildDrivePayloadFiles);
    }
  });

  const handleLoad15StudentSimulation = () => {
    const sample = buildSampleWeeklyCohort({
      institution: activeInstitution,
      gradeId: gradeProfile.id,
      questionCount,
      existingStudents: students,
    });
    setEntries(sample);
    setSelectedRowId(sample[0]?.studentId ?? null);
    onToast(
      `15 öğrencilik ${gradeProfile.shortLabel} (${questionCount} soru) ${kts1Meta.name} vs ${kts2Meta.name} karşılaştırma kohortu yüklendi.`
    );
  };

  const handleImportRegisteredStudents = () => {
    const instStudents = students.filter((s) => s.institutionId === activeInstitution.id);
    if (instStudents.length === 0) {
      onToast('Bu kurumda henüz manuel kayıtlı öğrenci yok; 15 öğrenci simülasyonunu kullanabilir veya aşağıdan ekleyebilirsiniz.');
      return;
    }
    const existingIds = new Set(entries.map((e) => e.studentNumber8));
    const added: WeeklyStudentScore[] = instStudents
      .filter((s) => !existingIds.has(s.studentNumber8))
      .map((s) => {
        const k1c = Math.round(questionCount * 0.68);
        const k1w = Math.round(questionCount * 0.14);
        const k2c = Math.round(questionCount * 0.76);
        const k2w = Math.round(questionCount * 0.1);
        return {
          studentId: s.id,
          studentName: s.fullName,
          studentNumber8: s.studentNumber8,
          classroom: normalizeClassroomForGrade(s.classroom, gradeProfile),
          parentPhone: s.parentPhone,
          kts1Correct: k1c,
          kts1Wrong: k1w,
          kts1Blank: Math.max(0, questionCount - k1c - k1w),
          kts2Correct: k2c,
          kts2Wrong: k2w,
          kts2Blank: Math.max(0, questionCount - k2c - k2w),
          weakTopicNote: 'Kazanım tekrar takibi',
        };
      });
    setEntries((prev) => [...added, ...prev]);
    onToast(`${added.length} kayıtlı kurum öğrencisi listeye eklendi.`);
  };

  const handleAddStudentEntry = (e: FormEvent) => {
    e.preventDefault();
    const clean = newName.trim();
    if (!clean) return;
    const usedNums = new Set(entries.map((item) => item.studentNumber8));
    const matched = students.find(
      (s) => s.fullName.toLowerCase() === clean.toLowerCase()
    );
    const num8 =
      matched?.studentNumber8 ||
      generate8DigitStudentNumber(clean, activeInstitution.code8, usedNums);

    const k1c = Math.max(0, Math.min(kts1Meta.questionCount, newK1Correct));
    const k1w = Math.max(0, Math.min(kts1Meta.questionCount - k1c, newK1Wrong));
    const k2c = Math.max(0, Math.min(kts2Meta.questionCount, newK2Correct));
    const k2w = Math.max(0, Math.min(kts2Meta.questionCount - k2c, newK2Wrong));

    const entry: WeeklyStudentScore = {
      studentId: `wk-${Date.now()}`,
      studentName: clean,
      studentNumber8: num8,
      classroom: normalizeClassroomForGrade(
        newClassroom.trim() || defaultClassroomForGrade(gradeProfile.id),
        gradeProfile
      ),
      parentPhone: newPhone.trim() || matched?.parentPhone || undefined,
      kts1Correct: k1c,
      kts1Wrong: k1w,
      kts1Blank: Math.max(0, kts1Meta.questionCount - k1c - k1w),
      kts2Correct: k2c,
      kts2Wrong: k2w,
      kts2Blank: Math.max(0, kts2Meta.questionCount - k2c - k2w),
      weakTopicNote: newWeakNote.trim() || undefined,
    };
    setEntries((prev) => [entry, ...prev]);
    setSelectedRowId(entry.studentId);
    setNewName('');
    setNewPhone('');
    setNewWeakNote('');
    onToast(`${clean} (${num8}) haftalık karşılaştırma listesine eklendi.`);
  };

  const handleDownloadBoardPdf = async () => {
    if (rows.length === 0) return;
    setBusyExport(true);
    try {
      const bytes = await generateWeeklyRankingPdf({
        rows,
        academyName: activeInstitution.name,
        institutionCode8: activeInstitution.code8,
        kts1Name: kts1Meta.name,
        kts2Name: kts2Meta.name,
        kts1QuestionCount: kts1Meta.questionCount,
        kts2QuestionCount: kts2Meta.questionCount,
        gradeProfile,
        cover,
      });
      const blob = uint8ArrayToPdfBlob(bytes);
      triggerDownload(blob, `Pano-Asma-Sirali-Liste-${activeInstitution.code8}.pdf`);
      onToast('İlk 3 başarı rozetli Pano Asma Sıralı Liste PDF indirildi.');
    } catch (err) {
      onToast(
        err instanceof Error
          ? `Pano Asma Sıralı Liste PDF indirilemedi: ${err.message}`
          : 'Pano Asma Sıralı Liste PDF hazırlanırken bir hata oluştu.'
      );
    } finally {
      setBusyExport(false);
    }
  };

  const handleDownloadPcHtml = () => {
    if (rows.length === 0) return;
    try {
      const html = buildWeeklyPcStandaloneHtml({
        rows,
        academyName: activeInstitution.name,
        institutionCode8: activeInstitution.code8,
        kts1Name: kts1Meta.name,
        kts2Name: kts2Meta.name,
        kts1QuestionCount: kts1Meta.questionCount,
        kts2QuestionCount: kts2Meta.questionCount,
        gradeLabel: gradeProfile.shortLabel,
        signatureName: cover.signatureName,
      });
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      triggerDownload(blob, `Bilgisayarda-Ac-Haftalik-Liste-${activeInstitution.code8}.html`);
      onToast('Herhangi bir bilgisayarda doğrudan açılabilen interaktif HTML raporu indirildi.');
    } catch {
      onToast('PC HTML raporu hazırlanırken bir hata oluştu.');
    }
  };

  const handleDownloadWeeklyZip = async () => {
    if (rows.length === 0) return;
    setBusyExport(true);
    try {
      const zipBlob = await generateWeeklyFullPcZip({
        rows,
        academyName: activeInstitution.name,
        institutionCode8: activeInstitution.code8,
        kts1Name: kts1Meta.name,
        kts2Name: kts2Meta.name,
        kts1QuestionCount: kts1Meta.questionCount,
        kts2QuestionCount: kts2Meta.questionCount,
        gradeProfile,
        cover,
        parentMessagesText: allParentMessagesText,
      });
      triggerDownload(zipBlob, `Haftalik-Tam-Bilgisayar-Paketi-${activeInstitution.code8}.zip`);
      onToast('Pano PDF + Excel + PC HTML + Toplu Veli Mesajları ZIP paketi indirildi.');
    } catch (err) {
      onToast(
        err instanceof Error
          ? `Haftalık Tam PC ZIP hazırlanamadı: ${err.message}`
          : 'Haftalık Tam PC ZIP hazırlanırken bir hata oluştu.'
      );
    } finally {
      setBusyExport(false);
    }
  };

  const handleCopyMessage = async (row: WeeklyComparisonRow) => {
    const txt = getMessageForRow(row);
    try {
      await navigator.clipboard.writeText(txt);
      setCopiedId(row.studentId);
      setTimeout(() => setCopiedId(null), 2000);
      onToast(`${row.studentName} için veli bilgilendirme mesajı panoya kopyalandı.`);
    } catch {
      onToast('Mesaj kutusundan kopyalayabilirsiniz.');
    }
  };

  const formatWaHref = buildWhatsAppHref;

  const handleParentPhoneChange = (studentId: string, phone: string) => {
    setEntries((prev) =>
      prev.map((item) => (item.studentId === studentId ? { ...item, parentPhone: phone } : item))
    );
  };

  const handleInlineEntryUpdate = (
    studentId: string,
    patch: Partial<Pick<WeeklyStudentScore, 'kts1Correct' | 'kts1Wrong' | 'kts2Correct' | 'kts2Wrong' | 'weakTopicNote'>>
  ) => {
    setEntries((prev) =>
      prev.map((item) => {
        if (item.studentId !== studentId) return item;
        const k1c = Math.max(0, Math.min(kts1Meta.questionCount, patch.kts1Correct ?? item.kts1Correct));
        const k1w = Math.max(0, Math.min(kts1Meta.questionCount - k1c, patch.kts1Wrong ?? item.kts1Wrong));
        const k2c = Math.max(0, Math.min(kts2Meta.questionCount, patch.kts2Correct ?? item.kts2Correct));
        const k2w = Math.max(0, Math.min(kts2Meta.questionCount - k2c, patch.kts2Wrong ?? item.kts2Wrong));
        return {
          ...item,
          kts1Correct: k1c,
          kts1Wrong: k1w,
          kts1Blank: Math.max(0, kts1Meta.questionCount - k1c - k1w),
          kts2Correct: k2c,
          kts2Wrong: k2w,
          kts2Blank: Math.max(0, kts2Meta.questionCount - k2c - k2w),
          weakTopicNote: patch.weakTopicNote !== undefined ? patch.weakTopicNote : item.weakTopicNote,
        };
      })
    );
  };

  const handleDownloadBadgeCard = async (row: WeeklyComparisonRow) => {
    setBusyExport(true);
    try {
      const blob = await generateAchievementBadgePng({
        row,
        academyName: activeInstitution.name,
        institutionCode8: activeInstitution.code8,
        kts1Name: kts1Meta.name,
        kts2Name: kts2Meta.name,
        gradeLabel: gradeProfile.shortLabel,
        cover,
        isRisingStar: insights.risingStar?.studentId === row.studentId,
      });
      const safeName = normalizeTurkishSlug(row.studentName, 'ogrenci');
      triggerDownload(blob, `Basari-Rozeti-${safeName}-${row.studentNumber8}.png`);
      onToast(`${row.studentName} için 3D Başarı Rozeti & Onur Kartı PNG indirildi.`);
    } catch (err) {
      onToast(
        err instanceof Error
          ? `Başarı rozeti PNG indirilemedi: ${err.message}`
          : 'Başarı rozeti PNG hazırlanırken bir hata oluştu.'
      );
    } finally {
      setBusyExport(false);
    }
  };

  const formatSmsHref = buildSmsHref;

  const top3 = rows.slice(0, 3);
  const preset = getLogoPreset(cover.logoStyleId);

  return (
    <div className="space-y-6">
      {/* Header & Exports Bar */}
      <section className="surface-card rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold">
              Haftalık Deneme Karşılaştırma, İlk 3 Başarı Rozeti & Veli Mesaj Merkezi
            </h2>
            <span
              className="px-2.5 py-0.5 rounded-lg text-xs font-bold"
              style={{
                backgroundColor: 'var(--accent-soft, rgba(29,78,216,0.12))',
                color: 'var(--accent-primary)',
              }}
            >
              {gradeProfile.shortLabel} ({gradeProfile.optionCount} Şık ·{' '}
              {effectivePenaltyDivisor === 0 ? 'Götürmesiz' : `${effectivePenaltyDivisor}Y = 1D`})
            </span>
            {onChangePenaltyDivisor && (
              <select
                aria-label="Haftalık Doğru-Yanlış Götürme Kuralı"
                data-testid="weekly-penalty-select"
                value={effectivePenaltyDivisor}
                onChange={(e) =>
                  onChangePenaltyDivisor(Number(e.target.value) as PenaltyDivisor)
                }
                className="rounded-lg px-2.5 py-1 text-xs font-bold surface-alt"
              >
                <option value={0}>Götürmesiz (Net = Doğru · 3–5. Sınıf)</option>
                <option value={3}>3 Yanlış = 1 Doğru</option>
                <option value={4}>4 Yanlış = 1 Doğru</option>
              </select>
            )}
          </div>
          <p className="text-xs sm:text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            20 veya 50 soruluk haftalık denemeler oluşturun; {kts1Meta.name} ve {kts2Meta.name} sonuçlarını karşılaştırıp pano asma PDF, Excel, PC HTML ve Google Drive çıktısı alın.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={rows.length === 0 || busyExport}
            onClick={handleDownloadBoardPdf}
            className="btn-3d px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {busyExport ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>Pano Asma Sıralı Liste (PDF)</span>
          </button>

          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() =>
              exportWeeklyComparisonToXlsx({
                rows,
                academyName: activeInstitution.name,
                kts1Name: kts1Meta.name,
                kts2Name: kts2Meta.name,
                gradeLabel: gradeProfile.shortLabel,
              })
            }
            className="btn-3d-secondary px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
            <span>Excel (.xlsx)</span>
          </button>

          <button
            type="button"
            disabled={rows.length === 0}
            onClick={handleDownloadPcHtml}
            className="btn-3d-secondary px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Laptop className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
            <span>PC HTML Aç</span>
          </button>

          <button
            type="button"
            disabled={rows.length === 0 || busyExport}
            onClick={handleDownloadWeeklyZip}
            className="btn-3d-secondary px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Archive className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Tam PC ZIP</span>
          </button>

          <button
            type="button"
            data-testid="weekly-jump-rankings-btn"
            onClick={() => {
              const el = document.getElementById('weekly-institution-rankings-board');
              el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="btn-3d-secondary px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Trophy className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
            <span>Kurum &amp; Sınıf Başarısı</span>
          </button>

          <button
            type="button"
            disabled={busyExport}
            onClick={async () => {
              if (!driveConnected) {
                onOpenDriveTab();
                return;
              }
              setBusyExport(true);
              try {
                const payloads = await buildDrivePayloadFiles();
                await onSaveWeeklyToDrive(payloads);
              } finally {
                setBusyExport(false);
              }
            }}
            className="btn-3d-secondary px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <CloudUpload className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
            <span>{driveConnected ? 'Google Drive’a Kaydet' : 'Drive Bağla & Kaydet'}</span>
          </button>
        </div>
      </section>

      {/* Weekly Exam Setup & Question Count Presets (20 / 50 / ...) */}
      <section className="surface-card rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Sparkles className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
            <span>Haftalık Sınav Ayarları & Soru Sayısı Seçimi</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {QUESTION_PRESETS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => handleQuestionPresetChange(q)}
                aria-pressed={questionCount === q}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono-num cursor-pointer ${
                  questionCount === q ? 'btn-3d' : 'btn-3d-secondary'
                }`}
              >
                {q} Soru
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="block text-xs font-semibold">
            <span style={{ color: 'var(--text-secondary)' }}>1. Deneme Adı</span>
            <input
              type="text"
              value={kts1Meta.name}
              onChange={(e) => setKts1Meta((p) => ({ ...p, name: e.target.value }))}
              className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt"
            />
          </label>
          <label className="block text-xs font-semibold">
            <span style={{ color: 'var(--text-secondary)' }}>1. Deneme Tarih</span>
            <input
              type="text"
              value={kts1Meta.date}
              onChange={(e) => setKts1Meta((p) => ({ ...p, date: e.target.value }))}
              className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt font-mono-num"
            />
          </label>
          <label className="block text-xs font-semibold">
            <span style={{ color: 'var(--text-secondary)' }}>2. Deneme Adı</span>
            <input
              type="text"
              value={kts2Meta.name}
              onChange={(e) => setKts2Meta((p) => ({ ...p, name: e.target.value }))}
              className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt"
            />
          </label>
          <label className="block text-xs font-semibold">
            <span style={{ color: 'var(--text-secondary)' }}>2. Deneme Tarih</span>
            <input
              type="text"
              value={kts2Meta.date}
              onChange={(e) => setKts2Meta((p) => ({ ...p, date: e.target.value }))}
              className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt font-mono-num"
            />
          </label>
        </div>

        {/* Add manual student score OR load 15-student test cohort */}
        <form
          onSubmit={handleAddStudentEntry}
          className="surface-alt rounded-xl p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold inline-flex items-center gap-1.5">
              <Plus className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
              <span>Listeye Öğrenci Puanı / Doğru-Yanlış Ekle ({questionCount} Soru)</span>
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleImportRegisteredStudents}
                className="btn-3d-secondary px-3 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Kayıtlı Öğrencileri Çek</span>
              </button>
              <button
                type="button"
                onClick={handleLoad15StudentSimulation}
                className="btn-3d px-3 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Trophy className="w-3.5 h-3.5" aria-hidden="true" />
                <span>15 Öğrencilik Sınıf Simülasyonu Yükle</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-8 gap-2.5">
            <label className="lg:col-span-2 block text-[11px] font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Öğrenci Adı Soyadı</span>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Örn: Alihan Sarı"
                className="mt-1 w-full rounded-lg px-2.5 py-2 text-xs surface-card"
              />
            </label>
            <label className="block text-[11px] font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Şube</span>
              <input
                type="text"
                value={newClassroom}
                onChange={(e) => setNewClassroom(e.target.value)}
                className="mt-1 w-full rounded-lg px-2.5 py-2 text-xs surface-card"
              />
            </label>
            <label className="block text-[11px] font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Veli Tel (Ops.)</span>
              <input
                type="text"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="05XX..."
                className="mt-1 w-full rounded-lg px-2.5 py-2 text-xs surface-card font-mono-num"
              />
            </label>
            <div className="block text-[11px] font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>KTS-1 D / Y</span>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                <NumericStepperInput
                  compact
                  min={0}
                  max={questionCount}
                  step={1}
                  value={newK1Correct}
                  onChange={(val) => setNewK1Correct(val)}
                  ariaLabel="KTS 1 Doğru"
                  surfaceClass="surface-card"
                />
                <NumericStepperInput
                  compact
                  min={0}
                  max={questionCount}
                  step={1}
                  value={newK1Wrong}
                  onChange={(val) => setNewK1Wrong(val)}
                  ariaLabel="KTS 1 Yanlış"
                  surfaceClass="surface-card"
                />
              </div>
            </div>
            <div className="block text-[11px] font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>KTS-2 D / Y</span>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                <NumericStepperInput
                  compact
                  min={0}
                  max={questionCount}
                  step={1}
                  value={newK2Correct}
                  onChange={(val) => setNewK2Correct(val)}
                  ariaLabel="KTS 2 Doğru"
                  surfaceClass="surface-card"
                />
                <NumericStepperInput
                  compact
                  min={0}
                  max={questionCount}
                  step={1}
                  value={newK2Wrong}
                  onChange={(val) => setNewK2Wrong(val)}
                  ariaLabel="KTS 2 Yanlış"
                  surfaceClass="surface-card"
                />
              </div>
            </div>
            <label className="block text-[11px] font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Zayıf Konu Notu</span>
              <input
                type="text"
                value={newWeakNote}
                onChange={(e) => setNewWeakNote(e.target.value)}
                placeholder="Örn: Kesirler"
                className="mt-1 w-full rounded-lg px-2.5 py-2 text-xs surface-card"
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={!newName.trim()}
                className="btn-3d w-full py-2 px-3 rounded-lg text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                Listeye Ekle
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* Dynamic Cohort Insights + Top 3 Podium Circular Badges + Live SVG Chart */}
      {rows.length > 0 && (
        <>
          <section aria-label="Dinamik Karşılaştırma Özeti" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="surface-card rounded-xl p-4 space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                Sınıf KTS-2 Ortalaması
              </div>
              <div className="text-2xl font-extrabold font-mono-num" style={{ color: 'var(--accent-primary)' }}>
                {insights.avgKts2Score.toFixed(1)} Puan
              </div>
              <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Ortalama Değişim: {insights.avgScoreDelta >= 0 ? '+' : ''}
                {insights.avgScoreDelta.toFixed(1)} Puan
              </div>
            </div>

            <div className="surface-card rounded-xl p-4 space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                Haftanın Yükseliş Yıldızı
              </div>
              <div className="text-base font-extrabold truncate flex items-center gap-1.5">
                <Star className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
                <span>{insights.risingStar ? insights.risingStar.studentName : '—'}</span>
              </div>
              <div className="text-xs font-mono-num font-bold text-emerald-600 dark:text-emerald-400">
                {insights.risingStar
                  ? `+${insights.risingStar.scoreDelta.toFixed(1)} Puan (+${insights.risingStar.netDelta.toFixed(1)} Net)`
                  : 'Pozitif gelişim bekleniyor'}
              </div>
            </div>

            <div className="surface-card rounded-xl p-4 space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                Başarı & Etüt Dağılımı
              </div>
              <div className="text-2xl font-extrabold font-mono-num">
                %{insights.avgSuccessPct} Ort.
              </div>
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {insights.highAchieverCount} Üstün · {insights.needsSupportCount} Destek Gerekiyor
              </div>
            </div>

            <div className="surface-card rounded-xl p-4 space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                Kurum 1.si Rozet Sahibi
              </div>
              <div className="text-base font-extrabold truncate flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
                <span>{insights.topPerformer?.studentName ?? '—'}</span>
              </div>
              <div className="text-xs font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                {insights.topPerformer
                  ? `${insights.topPerformer.kts2Score.toFixed(1)} Puan · %${insights.topPerformer.successPct}`
                  : ''}
              </div>
            </div>
          </section>

          {/* Top 3 Podium Circular Badges with Downloadable Rozet Kartı PNG */}
          <section aria-label="İlk 3 Derece Podyumu" className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {top3.map((row, idx) => {
              const rank = (idx + 1) as 1 | 2 | 3;
              const ringStyle =
                rank === 1
                  ? 'bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-600 text-amber-950 border-amber-500'
                  : rank === 2
                    ? 'bg-gradient-to-br from-slate-100 via-slate-300 to-slate-400 text-slate-900 border-slate-400'
                    : 'bg-gradient-to-br from-orange-300 via-amber-500 to-orange-700 text-white border-orange-500';
              return (
                <div
                  key={row.studentId}
                  className="surface-card rounded-xl p-4 flex items-center gap-3.5 border-2"
                  style={{
                    borderColor:
                      rank === 1 ? '#f59e0b' : rank === 2 ? '#94a3b8' : '#ea580c',
                  }}
                >
                  <div
                    className={`w-14 h-14 rounded-full border-2 flex flex-col items-center justify-center shrink-0 shadow-md ${ringStyle}`}
                  >
                    <Medal className="w-5 h-5" aria-hidden="true" />
                    <span className="text-xs font-extrabold leading-none">{rank}.</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--accent-primary)' }}>
                      {rank}. Sıra · Başarı Rozeti
                    </div>
                    <div className="text-base font-extrabold truncate">{row.studentName}</div>
                    <div className="text-xs font-mono-num mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {row.kts2Score.toFixed(1)} Puan · {row.kts2Net.toFixed(2)} Net (%
                      {row.successPct})
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownloadBadgeCard(row)}
                      className="mt-2 btn-3d-secondary px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Award className="w-3 h-3 text-amber-500" aria-hidden="true" />
                      <span>Rozet Kartı (PNG)</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </section>

          {/* Dynamic SVG KTS-1 vs KTS-2 Bar Chart */}
          <section className="surface-card rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
                <h3 className="text-sm font-bold">
                  Dinamik KTS-1 vs KTS-2 Puan Karşılaştırma Grafiği (İlk {Math.min(10, displayedRows.length || rows.length)} Öğrenci)
                </h3>
              </div>
              <div className="flex items-center gap-4 text-xs font-semibold">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-slate-400 inline-block" />
                  <span>{kts1Meta.name}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: 'var(--accent-primary)' }} />
                  <span>{kts2Meta.name}</span>
                </span>
              </div>
            </div>

            <div className="w-full overflow-x-auto">
              <svg
                viewBox="0 0 860 190"
                className="w-full min-w-[600px] h-44"
                role="img"
                aria-label="KTS-1 ve KTS-2 öğrenci puan karşılaştırma grafiği"
              >
                <line x1="36" y1="20" x2="840" y2="20" stroke="#e2e8f0" strokeDasharray="3 3" />
                <line x1="36" y1="85" x2="840" y2="85" stroke="#e2e8f0" strokeDasharray="3 3" />
                <line x1="36" y1="150" x2="840" y2="150" stroke="#94a3b8" strokeWidth="1.5" />
                {(displayedRows.length > 0 ? displayedRows : rows).slice(0, 10).map((r, idx) => {
                  const maxScore = Math.max(gradeProfile.maxScore, 100);
                  const groupX = 48 + idx * 78;
                  const h1 = Math.max(6, Math.round((r.kts1Score / maxScore) * 125));
                  const h2 = Math.max(6, Math.round((r.kts2Score / maxScore) * 125));
                  const firstName = r.studentName.split(' ')[0].slice(0, 9);
                  return (
                    <g key={r.studentId}>
                      <rect
                        x={groupX}
                        y={150 - h1}
                        width="22"
                        height={h1}
                        rx="3"
                        fill="#94a3b8"
                      />
                      <rect
                        x={groupX + 25}
                        y={150 - h2}
                        width="22"
                        height={h2}
                        rx="3"
                        fill={r.scoreDelta >= 0 ? '#1d4ed8' : '#e11d48'}
                      />
                      <text
                        x={groupX + 23}
                        y={168}
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="700"
                        fill="currentColor"
                      >
                        {firstName}
                      </text>
                      <text
                        x={groupX + 36}
                        y={Math.max(12, 145 - h2)}
                        textAnchor="middle"
                        fontSize="9.5"
                        fontWeight="700"
                        fill="#1d4ed8"
                      >
                        {r.kts2Score.toFixed(0)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </section>
        </>
      )}

      {/* Haftalık Kurum Sıra Başarısı, Kurum Sınıf Başarısı & Ödüllü Deneme Sıralamaları */}
      <InstitutionRankingsBoard
        activeInstitution={activeInstitution}
        institutions={institutions}
        examHistory={examHistory}
        examHistoryByInst={examHistoryByInst}
        weeklyEntriesByInst={{
          ...(weeklyEntriesByInst ?? {}),
          [activeInstitution.id]: entries,
        }}
        prizeExams={prizeExams}
        prizeExamsByInst={prizeExamsByInst}
        activePrizeExamId={activePrizeExamId}
        students={students}
        gradeProfile={gradeProfile}
        penaltyDivisor={effectivePenaltyDivisor}
        weeklyQuestionCount={kts2Meta.questionCount}
        weeklyExamTitle={kts2Meta.name}
        weeklyExamDate={kts2Meta.date}
        isPrivateAdminMode={isPrivateAdminMode}
        onSelectInstitution={onSelectInstitution}
        onCreatePrizeExam={(exam) => onCreatePrizeExam?.(exam)}
        onDeletePrizeExam={(id) => onDeletePrizeExam?.(id)}
        onActivatePrizeExamForOmr={(id) => onActivatePrizeExamForOmr?.(id)}
        onOpenOmr={onOpenOmr}
      />

      {/* Ranked Table + Parent Messaging Workbench */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <section className="xl:col-span-8 surface-card rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold">
                Dinamik Sıralı Karşılaştırma Listesi ({displayedRows.length} / {rows.length} Öğrenci)
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                İlk 3 sıradaki öğrenciler daire içine alınmış altın/gümüş/bronz rozetle gösterilir; kalem simgesine tıklayarak satır içinde anlık KTS-1 / KTS-2 puanı güncelleyebilirsiniz.
              </p>
            </div>
            {entries.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setEntries([]);
                  setSelectedRowId(null);
                  setEditingRowId(null);
                }}
                className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
              >
                Listeyi Temizle
              </button>
            )}
          </div>

          {rows.length > 0 && (
            <div className="surface-alt rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 opacity-60" aria-hidden="true" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Öğrenci adı, 8 haneli no veya konu ara..."
                  aria-label="Haftalık listede öğrenci ara"
                  className="w-full rounded-lg pl-8 pr-3 py-1.5 text-xs surface-card"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'all' as const, label: 'Tümü' },
                  { id: 'top3' as const, label: 'İlk 3 Rozet' },
                  { id: 'Üstün Başarı' as const, label: 'Üstün' },
                  { id: 'İyi Gelişim' as const, label: 'Gelişim' },
                  { id: 'needs-support' as const, label: 'Destek / Çalışmalı' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setStatusFilter(f.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                      statusFilter === f.id ? 'btn-3d' : 'btn-3d-secondary'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <select
                  value={`${sortKey}:${sortDir}`}
                  onChange={(e) => {
                    const [k, d] = e.target.value.split(':') as [WeeklySortKey, 'asc' | 'desc'];
                    setSortKey(k);
                    setSortDir(d);
                  }}
                  aria-label="Sıralama ölçütü"
                  className="rounded-lg px-2.5 py-1.5 text-xs font-semibold surface-card"
                >
                  <option value="rank:asc">Sıralama (1 → N)</option>
                  <option value="kts2:desc">KTS-2 En Yüksek</option>
                  <option value="kts1:desc">KTS-1 En Yüksek</option>
                  <option value="delta:desc">Gelişim Artışı En Çok</option>
                  <option value="delta:asc">Gelişim Düşüşü Önce</option>
                </select>
              </div>
            </div>
          )}

          {rows.length === 0 ? (
            <div className="surface-alt rounded-xl p-8 text-center space-y-3">
              <p className="text-sm font-bold">Henüz haftalık deneme karşılaştırma listesi boş.</p>
              <p className="text-xs max-w-lg mx-auto" style={{ color: 'var(--text-secondary)' }}>
                Yukarıdaki formdan manuel öğrenci ekleyebilir veya tek tıkla 15 öğrencilik KTS-1 vs KTS-2 sınıf simülasyonunu yükleyerek ilk 3 rozetleri, dinamik grafiği ve veli mesajlarını test edebilirsiniz.
              </p>
              <button
                type="button"
                onClick={handleLoad15StudentSimulation}
                className="btn-3d px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
              >
                <Trophy className="w-4 h-4" aria-hidden="true" />
                <span>15 Öğrencilik Sınıf Simülasyonu Yükle</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                    <th className="text-left py-2 px-1 font-semibold">Sıra</th>
                    <th className="text-left py-2 px-1 font-semibold">Öğrenci</th>
                    <th className="text-right py-2 px-1 font-semibold">KTS-1</th>
                    <th className="text-right py-2 px-1 font-semibold">KTS-2</th>
                    <th className="text-right py-2 px-1 font-semibold">Fark / %</th>
                    <th className="text-left py-2 px-1 font-semibold">Durum & Tavsiye</th>
                    <th className="text-right py-2 px-1 font-semibold">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.map((row) => {
                    const isSelected = selectedRow?.studentId === row.studentId;
                    const isEditing = editingRowId === row.studentId;
                    const sourceEntry = entries.find((e) => e.studentId === row.studentId);
                    const isRising = insights.risingStar?.studentId === row.studentId;
                    const circleClass =
                      row.top3Badge === 1
                        ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950 border-amber-600'
                        : row.top3Badge === 2
                          ? 'bg-gradient-to-br from-slate-100 to-slate-300 text-slate-900 border-slate-500'
                          : 'bg-gradient-to-br from-orange-300 to-orange-600 text-white border-orange-700';

                    return (
                      <tr
                        key={row.studentId}
                        onClick={() => setSelectedRowId(row.studentId)}
                        className={`border-b last:border-b-0 cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50/70 dark:bg-blue-950/30' : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.03]'
                        }`}
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        <td className="py-2 px-1">
                          <div className="flex items-center gap-1">
                            <DynamicAchievementBadge
                              rank={row.top3Badge}
                              successPct={row.successPct}
                              scoreDelta={row.scoreDelta}
                              netDelta={row.netDelta}
                              isRisingStar={isRising}
                              size="sm"
                              showLabel={false}
                            />
                            {!row.top3Badge && (
                              <span className="font-mono-num font-bold text-[11px]">{row.rank}.</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-1 max-w-[108px]">
                          <div className="font-bold truncate">{row.studentName}</div>
                          <div className="font-mono-num text-[10.5px] truncate" style={{ color: 'var(--text-secondary)' }}>
                            {row.studentNumber8} · {row.classroom}
                          </div>
                        </td>
                        <td className="py-2 px-1 text-right font-mono-num whitespace-nowrap">
                          {isEditing && sourceEntry ? (
                            <div className="inline-flex items-center gap-1" onClick={(ev) => ev.stopPropagation()}>
                              <NumericStepperInput
                                compact
                                min={0}
                                max={kts1Meta.questionCount}
                                step={1}
                                value={sourceEntry.kts1Correct}
                                onChange={(val) =>
                                  handleInlineEntryUpdate(row.studentId, { kts1Correct: val })
                                }
                                ariaLabel={`${row.studentName} KTS-1 Doğru`}
                                className="w-[82px]"
                              />
                              <NumericStepperInput
                                compact
                                min={0}
                                max={kts1Meta.questionCount}
                                step={1}
                                value={sourceEntry.kts1Wrong}
                                onChange={(val) =>
                                  handleInlineEntryUpdate(row.studentId, { kts1Wrong: val })
                                }
                                ariaLabel={`${row.studentName} KTS-1 Yanlış`}
                                className="w-[82px]"
                              />
                            </div>
                          ) : (
                            <>
                              <div>{row.kts1Score.toFixed(1)} p</div>
                              <div className="text-[10.5px]" style={{ color: 'var(--text-secondary)' }}>
                                {row.kts1Net.toFixed(1)} n
                              </div>
                            </>
                          )}
                        </td>
                        <td className="py-2 px-1 text-right font-mono-num font-bold whitespace-nowrap" style={{ color: 'var(--accent-primary)' }}>
                          {isEditing && sourceEntry ? (
                            <div className="inline-flex items-center gap-1" onClick={(ev) => ev.stopPropagation()}>
                              <NumericStepperInput
                                compact
                                min={0}
                                max={kts2Meta.questionCount}
                                step={1}
                                value={sourceEntry.kts2Correct}
                                onChange={(val) =>
                                  handleInlineEntryUpdate(row.studentId, { kts2Correct: val })
                                }
                                ariaLabel={`${row.studentName} KTS-2 Doğru`}
                                className="w-[82px]"
                              />
                              <NumericStepperInput
                                compact
                                min={0}
                                max={kts2Meta.questionCount}
                                step={1}
                                value={sourceEntry.kts2Wrong}
                                onChange={(val) =>
                                  handleInlineEntryUpdate(row.studentId, { kts2Wrong: val })
                                }
                                ariaLabel={`${row.studentName} KTS-2 Yanlış`}
                                className="w-[82px]"
                              />
                            </div>
                          ) : (
                            <>
                              <div>{row.kts2Score.toFixed(1)} p</div>
                              <div className="text-[10.5px]">{row.kts2Net.toFixed(1)} n</div>
                            </>
                          )}
                        </td>
                        <td className="py-2 px-1 text-right font-mono-num whitespace-nowrap">
                          <div
                            className={`font-bold ${
                              row.scoreDelta >= 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {row.scoreDelta >= 0 ? '+' : ''}
                            {row.scoreDelta.toFixed(1)} p
                          </div>
                          <div className="text-[10.5px] font-bold">%{row.successPct}</div>
                        </td>
                        <td className="py-2 px-1 max-w-[122px]">
                          <div
                            className={`font-bold truncate ${
                              row.status === 'Üstün Başarı'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : row.status === 'İyi Gelişim'
                                  ? 'text-blue-600 dark:text-blue-400'
                                  : row.status === 'Destek Gerekiyor'
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {row.status}
                          </div>
                          {isEditing && sourceEntry ? (
                            <input
                              type="text"
                              value={sourceEntry.weakTopicNote ?? ''}
                              onClick={(ev) => ev.stopPropagation()}
                              onChange={(ev) =>
                                handleInlineEntryUpdate(row.studentId, { weakTopicNote: ev.target.value })
                              }
                              placeholder="Zayıf konu notu..."
                              aria-label={`${row.studentName} zayıf konu`}
                              className="mt-0.5 w-full rounded px-1 py-0.5 text-[11px] surface-alt"
                            />
                          ) : (
                            <div className="text-[10.5px] truncate" title={row.focusAdvice} style={{ color: 'var(--text-secondary)' }}>
                              {row.focusAdvice}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-1 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-0.5">
                            <button
                              type="button"
                              aria-label={`${row.studentName} puanını düzenle`}
                              title="Puanı satırda düzenle"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setEditingRowId(isEditing ? null : row.studentId);
                              }}
                              className={`p-1 rounded-lg text-[11px] font-bold inline-flex items-center cursor-pointer ${
                                isEditing ? 'btn-3d' : 'btn-3d-secondary'
                              }`}
                            >
                              {isEditing ? <Check className="w-3 h-3" aria-hidden="true" /> : <Edit3 className="w-3 h-3" aria-hidden="true" />}
                            </button>
                            <a
                              href={formatWaHref(row.parentPhone, getMessageForRow(row))}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`${row.studentName} velisine WhatsApp gönder`}
                              title="Doğrudan WhatsApp ile Veli Mesajı Gönder"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setSelectedRowId(row.studentId);
                              }}
                              className="p-1 rounded-lg text-[11px] font-bold inline-flex items-center bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                            >
                              <Send className="w-3 h-3" aria-hidden="true" />
                            </a>
                            <button
                              type="button"
                              aria-label={`${row.studentName} kaydını sil`}
                              title="Kaydı sil"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setEntries((prev) =>
                                  prev.filter((item) => item.studentId !== row.studentId)
                                );
                              }}
                              className="p-1 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Right: Editable Veli Mesajı Panel & Başarı Rozeti İndirme */}
        <section className="xl:col-span-4 surface-card rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
              <h3 className="text-base font-bold">Veli Mesaj Sistemi</h3>
            </div>
            {rows.length > 0 && (
              <div className="flex items-center gap-1.5">
                <select
                  value={bulkFilterMode}
                  onChange={(e) => setBulkFilterMode(e.target.value as WeeklyBulkFilterMode)}
                  aria-label="Toplu mesaj filtresi"
                  className="rounded-lg px-2 py-1 text-[11px] font-semibold surface-alt"
                >
                  <option value="all">Tüm Veliler ({rows.length})</option>
                  <option value="top3">İlk 3 Rozet ({top3.length})</option>
                  <option value="needs-support">Destek Gerekenler ({insights.needsSupportCount})</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const blob = new Blob(['\uFEFF' + allParentMessagesText], {
                      type: 'text/plain;charset=utf-8',
                    });
                    triggerDownload(blob, `Toplu-Veli-Mesajlari-${bulkFilterMode}-${activeInstitution.code8}.txt`);
                    onToast('Seçili veli mesajları .txt olarak indirildi.');
                  }}
                  className="btn-3d-secondary px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer inline-flex items-center gap-1"
                >
                  <Download className="w-3 h-3" aria-hidden="true" />
                  <span>İndir</span>
                </button>
              </div>
            )}
          </div>

          {!selectedRow ? (
            <div className="surface-alt rounded-xl p-6 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
              Veli mesajı oluşturmak için listeye öğrenci ekleyin veya 15 öğrencilik sınıf simülasyonunu yükleyin.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="surface-alt rounded-xl p-3 text-xs space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <DynamicAchievementBadge
                    rank={selectedRow.top3Badge}
                    successPct={selectedRow.successPct}
                    scoreDelta={selectedRow.scoreDelta}
                    netDelta={selectedRow.netDelta}
                    isRisingStar={insights.risingStar?.studentId === selectedRow.studentId}
                    size="md"
                    showLabel
                  />
                  <span className="font-mono-num font-bold text-xs" style={{ color: 'var(--accent-primary)' }}>
                    {selectedRow.rank}. Sıra
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1 border-t" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                  <span className="truncate font-semibold">
                    {selectedRow.studentName} · {selectedRow.classroom}
                  </span>
                  <button
                    type="button"
                    disabled={busyExport}
                    onClick={() => handleDownloadBadgeCard(selectedRow)}
                    className="text-[11px] font-bold inline-flex items-center gap-1 underline cursor-pointer shrink-0"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    <Award className="w-3 h-3" aria-hidden="true" />
                    <span>Rozet PNG</span>
                  </button>
                </div>
              </div>

              {/* Editable Veli WhatsApp Telefonu */}
              <label className="block text-[11px] font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>
                  Veli WhatsApp Numarası (Otomatik Gönderim İçin)
                </span>
                <input
                  type="tel"
                  value={selectedRow.parentPhone ?? ''}
                  onChange={(e) => handleParentPhoneChange(selectedRow.studentId, e.target.value)}
                  placeholder="Örn: 0505 226 92 58"
                  aria-label="Seçili öğrenci veli WhatsApp numarası"
                  className="mt-1 w-full rounded-lg px-3 py-1.5 text-xs surface-alt font-mono-num"
                />
              </label>

              {/* 5 Template Modes */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold" style={{ color: 'var(--text-secondary)' }}>
                  Mesaj Şablonu Seçin
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'auto' as const, label: 'Akıllı Otomatik' },
                    { id: 'top3-celebration' as const, label: 'İlk 3 Tebrik' },
                    { id: 'progress-update' as const, label: 'Gelişim Takip' },
                    { id: 'study-alert' as const, label: 'Etüt Daveti' },
                    { id: 'short-sms' as const, label: 'Kısa SMS' },
                  ].map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setMessageMode(tpl.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                        messageMode === tpl.id ? 'btn-3d' : 'btn-3d-secondary'
                      }`}
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>
                  Otomatik Oluşturulan & Düzenlenebilir Mesaj
                </span>
                <textarea
                  rows={8}
                  value={getMessageForRow(selectedRow)}
                  onChange={(e) => {
                    const customKey = `${selectedRow.studentId}::${messageMode}`;
                    setCustomMessages((prev) => ({
                      ...prev,
                      [customKey]: e.target.value,
                    }));
                  }}
                  className="mt-1.5 w-full rounded-xl p-3 text-xs leading-relaxed surface-alt"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyMessage(selectedRow)}
                  className="btn-3d-secondary py-2 px-2.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer"
                >
                  {copiedId === selectedRow.studentId ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>{copiedId === selectedRow.studentId ? 'Kopyalandı' : 'Kopyala'}</span>
                </button>

                <a
                  href={formatSmsHref(selectedRow.parentPhone, getMessageForRow(selectedRow))}
                  className="btn-3d-secondary py-2 px-2.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1"
                >
                  <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>SMS</span>
                </a>

                <a
                  href={formatWaHref(selectedRow.parentPhone, getMessageForRow(selectedRow))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2 px-2.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md transition-colors"
                >
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>WhatsApp Gönder</span>
                </a>
              </div>

              {customMessages[`${selectedRow.studentId}::${messageMode}`] !== undefined && (
                <button
                  type="button"
                  onClick={() =>
                    setCustomMessages((prev) => {
                      const next = { ...prev };
                      delete next[`${selectedRow.studentId}::${messageMode}`];
                      return next;
                    })
                  }
                  className="w-full text-[11px] font-semibold underline cursor-pointer"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Otomatik Mesaj Şablonuna Sıfırla
                </button>
              )}

              <div className="pt-3 border-t flex justify-center" style={{ borderColor: 'var(--border-subtle)' }}>
                <FurkanDigitalSignature
                  signatureName={cover.signatureName}
                  signatureTitle={cover.signatureTitle}
                  institutionCode8={activeInstitution.code8}
                  primaryColor={preset.primaryColor}
                  secondaryColor={preset.secondaryColor}
                  goldColor={preset.goldColor}
                  size="sm"
                />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
