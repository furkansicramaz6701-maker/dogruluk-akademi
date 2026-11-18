import { useEffect, useState } from 'react';
import {
  Award,
  BarChart3,
  Bot,
  Users,
  Clock,
  Target,
  AlertTriangle,
  TrendingUp,
  FileDown,
  Archive,
  Loader2,
  Search,
  ArrowUpDown,
  Grid3X3,
  CalendarPlus,
  Copy,
  Check,
  Send,
  Smartphone,
  MessageSquare,
  RotateCcw,
  FileText,
  SlidersHorizontal,
  Plus,
  Trash2,
} from 'lucide-react';
import { getLogoPreset } from '../data/logos';
import {
  CoverConfig,
  CustomParentMessageTemplate,
  DetailedAnalysisType,
  ExamAnalysisResult,
  GradeProfile,
  OpenEndedPaperAnalysis,
  ParentMessageTemplateMode,
  ReportCardType,
  TopicGapMetric,
} from '../types/academy';
import {
  buildStandaloneHtmlReport,
  generateStudentReportCardPdf,
  triggerDownload,
} from '../utils/pdfAndZip';
import { buildOpenEndedParentMessage } from '../utils/openEndedExam';
import {
  DEFAULT_CUSTOM_PARENT_TEMPLATES,
  REPORT_CARD_MESSAGE_TEMPLATES,
  applyCustomParentTemplate,
  buildReportCardParentMessage,
  buildSmsHref,
  buildWhatsAppHref,
  resolveReportCardDevelopmentStatus,
  sanitizeExamLabelForGrade,
} from '../utils/weeklyAnalysis';
import { DynamicAchievementBadge } from './DynamicAchievementBadge';
import { FurkanDigitalSignature } from './FurkanDigitalSignature';

interface ReportsAnalysisViewProps {
  analysis: ExamAnalysisResult;
  cover: CoverConfig;
  gradeProfile: GradeProfile;
  hasLiveAnalysis?: boolean;
  institutionName?: string;
  institutionCode8?: string;
  studentPhone?: string;
  openEndedAnalysis?: OpenEndedPaperAnalysis | null;
  onUpdateCoachSummary: (summary: string) => void;
  onDownloadZip: () => Promise<void>;
  onScheduleRemedial?: (topicGap: TopicGapMetric) => void;
  onOpenWeeklyList?: () => void;
  onOpenOmr?: () => void;
  onOpenOpenEndedTab?: () => void;
}

const REPORT_CARDS: Array<{ id: ReportCardType; label: string; icon: typeof Award }> = [
  { id: 'genel-basari', label: '1. Genel Başarı Karnesi', icon: Award },
  { id: 'ders-kazanim', label: '2. Ders & Kazanım Karnesi', icon: BarChart3 },
  { id: 'ai-koc', label: '3. AI Eğitim Koçu Karnesi', icon: Bot },
  { id: 'sinif-kurum', label: '4. Sınıf & Kurum Sıralama', icon: Users },
  { id: 'zaman-strateji', label: '5. Zaman & Zorluk Stratejisi', icon: Clock },
];

const DETAILED_ANALYSES: Array<{
  id: DetailedAnalysisType;
  label: string;
  icon: typeof Target;
}> = [
  { id: 'kazanim-eksikligi', label: '1. Kazanım Eksikliği Analizi', icon: Target },
  { id: 'celdirici-hata', label: '2. Çeldirici & Hata Tipi Analizi', icon: AlertTriangle },
  { id: 'gelisim-projeksiyon', label: '3. Gelişim Trendi & Projeksiyon', icon: TrendingUp },
];

const CUSTOM_TPL_STORAGE_KEY = 'da_custom_parent_templates_v1';

export function ReportsAnalysisView({
  analysis,
  cover,
  gradeProfile,
  hasLiveAnalysis = true,
  institutionName,
  institutionCode8,
  studentPhone,
  openEndedAnalysis = null,
  onUpdateCoachSummary,
  onDownloadZip,
  onScheduleRemedial,
  onOpenWeeklyList,
  onOpenOmr,
  onOpenOpenEndedTab,
}: ReportsAnalysisViewProps) {
  const [activeReport, setActiveReport] = useState<ReportCardType>('genel-basari');
  const [activeDetail, setActiveDetail] = useState<DetailedAnalysisType>('kazanim-eksikligi');
  const [topicFilter, setTopicFilter] = useState<string>('Tümü');
  const [matrixSearch, setMatrixSearch] = useState<string>('');
  const [matrixSubject, setMatrixSubject] = useState<string>('Tümü');
  const [matrixStatus, setMatrixStatus] = useState<string>('Tümü');
  const [matrixSort, setMatrixSort] = useState<'asc' | 'desc' | 'total'>('asc');
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [pdfDownloading, setPdfDownloading] = useState(false);

  const effectiveInstitutionName = institutionName || cover.academyName;
  const effectiveCode8 = institutionCode8 || cover.institutionCode8;
  const logoPreset = getLogoPreset(cover.logoStyleId);
  const safeExamTitle = sanitizeExamLabelForGrade(analysis.examTitle, gradeProfile);
  const successPct =
    analysis.totalQuestions > 0
      ? Math.max(0, Math.round((analysis.totalNet / analysis.totalQuestions) * 100))
      : 0;
  const prevTrendPoint =
    analysis.historicalTrend.length >= 2
      ? analysis.historicalTrend[analysis.historicalTrend.length - 2]
      : null;
  const scoreDelta = prevTrendPoint
    ? Number((analysis.estimatedScore - prevTrendPoint.score).toFixed(1))
    : 0;
  const netDelta = prevTrendPoint
    ? Number((analysis.totalNet - prevTrendPoint.net).toFixed(2))
    : 0;

  const developmentStatus = resolveReportCardDevelopmentStatus(analysis);

  const [parentPhoneInput, setParentPhoneInput] = useState<string>(studentPhone || '');
  const [templateMode, setTemplateMode] = useState<ParentMessageTemplateMode>(() =>
    !hasLiveAnalysis && openEndedAnalysis ? 'open-ended-10' : 'auto'
  );
  const [parentMessage, setParentMessage] = useState<string>(() => {
    if (!hasLiveAnalysis && openEndedAnalysis) {
      return buildOpenEndedParentMessage({
        paperAnalysis: openEndedAnalysis,
        academyName: effectiveInstitutionName,
        gradeProfile,
      });
    }
    return buildReportCardParentMessage({
      analysis,
      academyName: effectiveInstitutionName,
      gradeProfile,
      templateMode: 'auto',
    });
  });
  const [copiedMessage, setCopiedMessage] = useState<boolean>(false);

  const [showCustomTemplates, setShowCustomTemplates] = useState<boolean>(false);
  const [customTemplates, setCustomTemplates] = useState<CustomParentMessageTemplate[]>(() => {
    try {
      const raw = window.localStorage.getItem(CUSTOM_TPL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CustomParentMessageTemplate[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Ignore storage read error
    }
    return DEFAULT_CUSTOM_PARENT_TEMPLATES;
  });
  const [newTplName, setNewTplName] = useState<string>('');
  const [newTplCategory, setNewTplCategory] =
    useState<CustomParentMessageTemplate['category']>('genel');
  const [newTplBody, setNewTplBody] = useState<string>(
    DEFAULT_CUSTOM_PARENT_TEMPLATES[0].body
  );
  const [customTplStatus, setCustomTplStatus] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(CUSTOM_TPL_STORAGE_KEY, JSON.stringify(customTemplates));
    } catch {
      // Ignore storage quota error
    }
  }, [customTemplates]);

  useEffect(() => {
    setParentPhoneInput(studentPhone || '');
  }, [studentPhone, analysis.studentNumber]);

  useEffect(() => {
    if (!hasLiveAnalysis && openEndedAnalysis) {
      setParentMessage(
        buildOpenEndedParentMessage({
          paperAnalysis: openEndedAnalysis,
          academyName: effectiveInstitutionName,
          gradeProfile,
        })
      );
      return;
    }
    setParentMessage(
      buildReportCardParentMessage({
        analysis,
        academyName: effectiveInstitutionName,
        gradeProfile,
        templateMode,
      })
    );
  }, [analysis, effectiveInstitutionName, gradeProfile, templateMode, hasLiveAnalysis, openEndedAnalysis]);

  const effectiveAnalysisForTemplate: ExamAnalysisResult =
    !hasLiveAnalysis && openEndedAnalysis
      ? {
          ...analysis,
          studentName: openEndedAnalysis.studentName || analysis.studentName || 'Öğrenci',
          studentNumber: openEndedAnalysis.studentNumber || analysis.studentNumber,
          classroom: openEndedAnalysis.classroom || analysis.classroom,
          examTitle: openEndedAnalysis.examTitle,
          estimatedScore: openEndedAnalysis.totalScore,
          maxScore: openEndedAnalysis.maxTotalScore,
          totalNet: openEndedAnalysis.totalScore / 10,
          totalQuestions: openEndedAnalysis.questionGrades.length || 10,
        }
      : analysis;

  const handleApplyCustomTemplate = (tpl: CustomParentMessageTemplate) => {
    const rendered = applyCustomParentTemplate({
      templateBody: tpl.body,
      analysis: effectiveAnalysisForTemplate,
      academyName: effectiveInstitutionName,
      gradeProfile,
    });
    setParentMessage(rendered);
    setCustomTplStatus(`"${tpl.name}" şablonu mesaja uygulandı.`);
  };

  const handleSaveCustomTemplate = () => {
    const name = newTplName.trim() || `Özel Veli Şablonu (${customTemplates.length + 1})`;
    const body = newTplBody.trim();
    if (!body) return;
    const item: CustomParentMessageTemplate = {
      id: `custom-${Date.now()}`,
      name,
      category: newTplCategory,
      body,
    };
    setCustomTemplates((prev) => [item, ...prev]);
    setNewTplName('');
    handleApplyCustomTemplate(item);
  };

  const handleCopyParentMessage = async () => {
    try {
      await navigator.clipboard.writeText(parentMessage);
      setCopiedMessage(true);
      setTimeout(() => setCopiedMessage(false), 2200);
    } catch {
      setCopiedMessage(false);
    }
  };

  const handleGenerateAiCoach = async () => {
    setCoachLoading(true);
    setCoachError(null);
    try {
      const resp = await fetch('/api/analysis/ai-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'AI koç yorumu alınamadı');
      onUpdateCoachSummary(data.summary);
    } catch (err) {
      setCoachError(
        err instanceof Error
          ? err.message
          : 'AI servisi geçici olarak yanıt veremedi; yerel koç değerlendirmesi gösteriliyor.'
      );
    } finally {
      setCoachLoading(false);
    }
  };

  const handleDownloadHtmlReport = () => {
    const html = buildStandaloneHtmlReport(analysis, cover);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    triggerDownload(blob, `Dogruluk-Akademi-Karne-${analysis.studentNumber}.html`);
  };

  const handleDownloadPdfReport = async () => {
    setPdfDownloading(true);
    try {
      const pdfBytes = await generateStudentReportCardPdf(analysis, cover, gradeProfile);
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const safeName = analysis.studentName
        .toLocaleLowerCase('tr-TR')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      triggerDownload(blob, `Karne-Analizi-${safeName || 'ogrenci'}-${analysis.studentNumber}.pdf`);
    } finally {
      setPdfDownloading(false);
    }
  };

  const strongestSubject = [...analysis.subjectMetrics].sort(
    (a, b) => b.accuracyPct - a.accuracyPct
  )[0];
  const weakestSubject = [...analysis.subjectMetrics].sort(
    (a, b) => a.accuracyPct - b.accuracyPct
  )[0];
  const criticalTopics = analysis.topicGaps.filter((t) => t.status === 'Kritik Eksik');

  const filteredTopics =
    topicFilter === 'Tümü'
      ? analysis.topicGaps
      : analysis.topicGaps.filter((t) => t.status === topicFilter);

  const matrixSubjects = Array.from(new Set(analysis.topicGaps.map((t) => t.subject)));
  const matrixRows = analysis.topicGaps
    .filter((t) => {
      if (matrixSubject !== 'Tümü' && t.subject !== matrixSubject) return false;
      if (matrixStatus !== 'Tümü' && t.status !== matrixStatus) return false;
      if (matrixSearch.trim()) {
        const q = matrixSearch.trim().toLowerCase();
        return (
          t.topic.toLowerCase().includes(q) ||
          t.gainCode.toLowerCase().includes(q) ||
          t.subject.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (matrixSort === 'asc') return a.masteryPct - b.masteryPct;
      if (matrixSort === 'desc') return b.masteryPct - a.masteryPct;
      return b.total - a.total;
    });

  const handleDownloadMatrixCsv = () => {
    const rows = [
      'Ders,Konu,KazanimKodu,Soru,Dogru,Yanlis,Bos,BasariYuzdesi,Durum',
      ...matrixRows.map(
        (t) =>
          `"${t.subject}","${t.topic}","${t.gainCode}",${t.total},${t.correct},${t.wrong},${t.blank},${t.masteryPct},"${t.status}"`
      ),
    ].join('\n');
    const blob = new Blob(['\uFEFF' + rows], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, `Konu-Bazli-Kazanim-Matrisi-${analysis.studentNumber}.csv`);
  };

  const maxSubjectTotal = Math.max(1, ...analysis.subjectMetrics.map((s) => s.total));
  const maxTrendScore = Math.max(
    analysis.maxScore,
    ...analysis.historicalTrend.map((h) => h.score)
  );
  const minTrendScore = Math.max(
    0,
    Math.min(...analysis.historicalTrend.map((h) => h.score)) - 30
  );

  const fallbackCoachText = `Merhaba ${analysis.studentName}! ${safeExamTitle} değerlendirmende ${analysis.totalQuestions} soruda ${analysis.totalCorrect} doğru, ${analysis.totalWrong} yanlış ve ${analysis.totalBlank} boş ile ${analysis.totalNet.toFixed(2)} net (${analysis.estimatedScore.toFixed(1)} puan) elde ettin.

En güçlü performansın %${strongestSubject?.accuracyPct ?? 0} doğruluk oranı ile ${strongestSubject?.subject ?? 'Türkçe'} dersinde görülüyor. Buna karşın ${weakestSubject?.subject ?? 'Matematik'} dersinde (%${weakestSubject?.accuracyPct ?? 0}) özellikle ${criticalTopics.slice(0, 2).map((t) => t.topic).join(' ve ') || 'temel kazanım'} başlıklarında ek tekrar gerekiyor.

Haftalık Aksiyon Planı:
1. ${weakestSubject?.subject ?? 'Öncelikli ders'} için her gün 25 dakika kazanım temelli konu özeti ve 20 çözümlü soru çalış.
2. Dikkat hatasından kaçan ${analysis.errorBreakdown['Dikkat Hatası'] ?? 0} kolay soruyu sınav sonunda 5 dakikalık kontrol turuyla geri kazan.
3. Boş bırakılan ${analysis.totalBlank} soru için süre tutarak branş denemesi çöz.
4. Mevcut ivmenle bir sonraki denemede ${analysis.projectedNet.toFixed(1)} net (${analysis.projectedScore.toFixed(1)} puan) bandına ulaşabilirsin.`;

  const whatsappHref = buildWhatsAppHref(parentPhoneInput, parentMessage);
  const smsHref = buildSmsHref(parentPhoneInput, parentMessage);

  return (
    <div className="space-y-6">
      {/* Header + Export Actions */}
      <div className="surface-card rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 min-w-0">
          {hasLiveAnalysis ? (
            <DynamicAchievementBadge
              rank={analysis.academyRank <= 3 ? analysis.academyRank : null}
              successPct={successPct}
              scoreDelta={scoreDelta}
              netDelta={netDelta}
              size="md"
              showLabel
            />
          ) : (
            <div className="surface-alt rounded-xl px-3.5 py-2 text-xs font-bold shrink-0" style={{ color: 'var(--text-secondary)' }}>
              Deneme Bekleniyor
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-xl font-bold">
              5 Çeşit Analiz Karnesi & 3 Çeşit Detaylı Sınav Analizi
            </h2>
            <p className="text-sm mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
              {analysis.studentName
                ? `${analysis.studentName} (${analysis.studentNumber || '—'}) · ${gradeProfile.shortLabel} (${gradeProfile.optionCount} Şık) · ${analysis.classroom} · ${safeExamTitle}`
                : `${effectiveInstitutionName} · ${gradeProfile.shortLabel} (${gradeProfile.optionCount} Şık) · Henüz öğrenci seçilmedi`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {hasLiveAnalysis && (
            <>
              <button
                type="button"
                disabled={pdfDownloading}
                onClick={handleDownloadPdfReport}
                className="btn-3d px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {pdfDownloading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>PDF Hazırlanıyor...</span>
                  </>
                ) : (
                  <>
                    <FileDown className="w-4 h-4" aria-hidden="true" />
                    <span>Profesyonel Karne Analizi (PDF) İndir</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleDownloadHtmlReport}
                className="btn-3d-secondary px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <FileDown className="w-4 h-4" aria-hidden="true" />
                <span>Karneleri HTML İndir</span>
              </button>
              <button
                type="button"
                onClick={onDownloadZip}
                className="btn-3d-secondary px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Archive className="w-4 h-4" aria-hidden="true" />
                <span>Tam ZIP Paketi İndir</span>
              </button>
            </>
          )}
          {onOpenWeeklyList && (
            <button
              type="button"
              onClick={onOpenWeeklyList}
              className="btn-3d-secondary px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <TrendingUp className="w-4 h-4" aria-hidden="true" />
              <span>Haftalık Liste & Karşılaştırma</span>
            </button>
          )}
        </div>
      </div>

      {!hasLiveAnalysis && !openEndedAnalysis && (
        <div
          className="surface-card rounded-xl p-6 flex flex-wrap items-center justify-between gap-4 border-l-4"
          style={{ borderLeftColor: 'var(--accent-primary)' }}
          data-testid="reports-empty-exam-banner"
        >
          <div className="space-y-1.5 min-w-0 max-w-2xl">
            <div className="text-base font-extrabold">
              Henüz Deneme / Optik Okuma Yapılmadı
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {analysis.studentName
                ? `${analysis.studentName} için henüz optik okuma veya açık uçlu kağıt değerlendirmesi yapılmadı. Optik Okuma sekmesinden cevap kağıdı okutulduğunda net, puan, 5 çeşit karne ve otomatik veli mesajı burada oluşur.`
                : `${effectiveInstitutionName} kurumunda henüz deneme değerlendirmesi yapılmadı. Önce Genel Bakış’tan bir öğrenci seçip Optik Okuma veya 10 Soruluk Açık Uçlu Kağıt Analizini başlatabilirsiniz.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onOpenOpenEndedTab && (
              <button
                type="button"
                onClick={onOpenOpenEndedTab}
                className="btn-3d-secondary px-4 py-2.5 rounded-xl text-xs font-bold shrink-0 cursor-pointer"
              >
                10 Soruluk Açık Uçlu Kağıt Analizi
              </button>
            )}
            {onOpenOmr && (
              <button
                type="button"
                onClick={onOpenOmr}
                className="btn-3d px-4 py-2.5 rounded-xl text-xs font-bold shrink-0 cursor-pointer"
              >
                Optik Okumaya Git
              </button>
            )}
          </div>
        </div>
      )}

      {openEndedAnalysis && (
        <div
          className="surface-card rounded-xl p-5 flex flex-wrap items-center justify-between gap-4 border-l-4 border-emerald-500"
          data-testid="reports-open-ended-summary"
        >
          <div className="space-y-1 min-w-0 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" aria-hidden="true" />
              <span className="text-sm font-extrabold">
                10 Soruluk Açık Uçlu Kağıt Analizi Sonucu
              </span>
              <span className="text-xs font-mono-num font-bold px-2 py-0.5 rounded-lg bg-emerald-600 text-white">
                {openEndedAnalysis.totalScore} / {openEndedAnalysis.maxTotalScore} (%{openEndedAnalysis.successPct})
              </span>
              <span className="text-xs font-bold" style={{ color: 'var(--accent-primary)' }}>
                {openEndedAnalysis.developmentStatus}
              </span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {openEndedAnalysis.studentName} ({gradeProfile.shortLabel}) · {openEndedAnalysis.overallFeedback}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setParentMessage(
                  buildOpenEndedParentMessage({
                    paperAnalysis: openEndedAnalysis,
                    academyName: effectiveInstitutionName,
                    gradeProfile,
                  })
                )
              }
              className="btn-3d-secondary px-3 py-2 rounded-xl text-xs font-bold cursor-pointer"
            >
              Açık Uçlu Sonucunu Mesaja Çek
            </button>
            {onOpenOpenEndedTab && (
              <button
                type="button"
                onClick={onOpenOpenEndedTab}
                className="btn-3d px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
              >
                Kağıt Analiz Detayını Aç
              </button>
            )}
          </div>
        </div>
      )}

      {(hasLiveAnalysis || Boolean(openEndedAnalysis)) && (
      <section aria-labelledby="karne-veli-mesaj-title" className="surface-card rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h3 id="karne-veli-mesaj-title" className="text-base font-bold">
                Otomatik Veli Mesaj Sistemi (WhatsApp & SMS)
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {effectiveInstitutionName} · {effectiveAnalysisForTemplate.studentName || 'Öğrenci'} ({gradeProfile.shortLabel}) not ve gelişim özeti tek tıkla veliye gider
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Otomatik Veli Mesaj Şablonları">
            {REPORT_CARD_MESSAGE_TEMPLATES.map((tpl) => {
              const active = templateMode === tpl.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  aria-pressed={active}
                  data-testid={`whatsapp-template-btn-${tpl.id}`}
                  onClick={() => {
                    setTemplateMode(tpl.id);
                    if (tpl.id === 'open-ended-10' && openEndedAnalysis) {
                      setParentMessage(
                        buildOpenEndedParentMessage({
                          paperAnalysis: openEndedAnalysis,
                          academyName: effectiveInstitutionName,
                          gradeProfile,
                        })
                      );
                    }
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    active ? 'btn-3d' : 'btn-3d-secondary'
                  }`}
                >
                  {tpl.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setShowCustomTemplates((v) => !v)}
              data-testid="custom-parent-template-toggle"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer ${
                showCustomTemplates ? 'btn-3d' : 'btn-3d-secondary'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Özel Şablonlar ({customTemplates.length})</span>
            </button>
          </div>
        </div>

        {showCustomTemplates && (
          <div
            className="surface-alt rounded-xl p-4 space-y-3 border"
            style={{ borderColor: 'var(--border-subtle)' }}
            data-testid="custom-parent-template-panel"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-extrabold">
                  Kayıtlı & Özel Veli Mesaj Şablonları
                </div>
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  Hazır veya kendi kaydettiğiniz şablona tıklayın; öğrenci puanı, sınıf düzeyi ve gelişim durumu otomatik yerleşir.
                </p>
              </div>
              {customTplStatus && (
                <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                  {customTplStatus}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {customTemplates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="surface-card rounded-lg px-2.5 py-1.5 inline-flex items-center gap-2 border"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <button
                    type="button"
                    data-testid={`custom-tpl-apply-${tpl.id}`}
                    onClick={() => handleApplyCustomTemplate(tpl)}
                    className="text-xs font-bold hover:underline cursor-pointer"
                  >
                    {tpl.name}
                  </button>
                  {tpl.id.startsWith('custom-') && (
                    <button
                      type="button"
                      aria-label={`${tpl.name} şablonunu sil`}
                      onClick={() =>
                        setCustomTemplates((prev) => prev.filter((item) => item.id !== tpl.id))
                      }
                      className="text-rose-600 hover:text-rose-700 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="lg:col-span-4 space-y-2">
                <label className="block text-[11px] font-bold">
                  <span style={{ color: 'var(--text-secondary)' }}>Yeni Şablon Adı</span>
                  <input
                    type="text"
                    value={newTplName}
                    onChange={(e) => setNewTplName(e.target.value)}
                    placeholder="Örn: 5. Sınıf Matematik Yazılı Tebriği"
                    data-testid="custom-tpl-name-input"
                    className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-xs surface-card border"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  />
                </label>
                <label className="block text-[11px] font-bold">
                  <span style={{ color: 'var(--text-secondary)' }}>Kategori</span>
                  <select
                    value={newTplCategory}
                    onChange={(e) =>
                      setNewTplCategory(
                        e.target.value as CustomParentMessageTemplate['category']
                      )
                    }
                    className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-xs surface-card border"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <option value="genel">Genel Bilgilendirme</option>
                    <option value="yazili-20">20 Soruluk Yazılıya Hazırlık</option>
                    <option value="acik-uclu-10">10 Soruluk Açık Uçlu Kağıt</option>
                    <option value="etut">Etüt & Destek Planı</option>
                  </select>
                </label>
                <div className="flex flex-wrap gap-1 pt-1">
                  {['{ogrenci}', '{sinif}', '{net}', '{puan}', '{durum}', '{eksik}'].map(
                    (ph) => (
                      <button
                        key={ph}
                        type="button"
                        onClick={() => setNewTplBody((b) => `${b} ${ph}`)}
                        className="px-1.5 py-0.5 rounded surface-card text-[10px] font-mono-num font-bold cursor-pointer border"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        +{ph}
                      </button>
                    )
                  )}
                </div>
              </div>
              <div className="lg:col-span-8 space-y-2">
                <label className="block text-[11px] font-bold">
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Şablon Metni (Değişkenler: {'{ogrenci}'}, {'{kurum}'}, {'{sinif}'}, {'{sinav}'}, {'{net}'}, {'{puan}'}, {'{basari}'}, {'{durum}'}, {'{guclu}'}, {'{eksik}'})
                  </span>
                  <textarea
                    rows={4}
                    value={newTplBody}
                    onChange={(e) => setNewTplBody(e.target.value)}
                    data-testid="custom-tpl-body-input"
                    className="mt-1 w-full rounded-lg p-2.5 text-xs surface-card border"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  />
                </label>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveCustomTemplate}
                    data-testid="custom-tpl-save-btn"
                    className="btn-3d px-3.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Şablonu Kaydet ve Mesaja Uygula</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <div className="lg:col-span-4 space-y-3">
            <label className="block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Veli WhatsApp Numarası</span>
              <input
                type="tel"
                value={parentPhoneInput}
                onChange={(e) => setParentPhoneInput(e.target.value)}
                placeholder="05XX XXX XX XX"
                aria-label="Karne Veli WhatsApp Numarası"
                className="mt-1 w-full rounded-lg px-3 py-2 text-xs font-mono-num surface-alt border"
                style={{ borderColor: 'var(--border-subtle)' }}
              />
            </label>

            <div className="surface-alt rounded-lg p-3 text-[11px] space-y-1" style={{ color: 'var(--text-secondary)' }}>
              <div className="font-bold" style={{ color: 'var(--text-primary)' }}>
                Mesaja Çekilen Analiz Özeti:
              </div>
              <div>• Kurum: {effectiveInstitutionName}</div>
              <div>• Öğrenci & Sınıf: {effectiveAnalysisForTemplate.studentName || 'Öğrenci'} · {gradeProfile.shortLabel}</div>
              {hasLiveAnalysis ? (
                <>
                  <div>• Not: {analysis.totalNet.toFixed(2)} Net · {analysis.estimatedScore.toFixed(1)} Puan (%{successPct})</div>
                  <div>• Gelişim Durumu: <strong style={{ color: 'var(--accent-primary)' }}>{developmentStatus}</strong></div>
                </>
              ) : openEndedAnalysis ? (
                <>
                  <div>• Açık Uçlu Not: {openEndedAnalysis.totalScore} / {openEndedAnalysis.maxTotalScore} Puan (%{openEndedAnalysis.successPct})</div>
                  <div>• Gelişim Durumu: <strong style={{ color: 'var(--accent-primary)' }}>{openEndedAnalysis.developmentStatus}</strong></div>
                </>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!hasLiveAnalysis && openEndedAnalysis) {
                    setParentMessage(
                      buildOpenEndedParentMessage({
                        paperAnalysis: openEndedAnalysis,
                        academyName: effectiveInstitutionName,
                        gradeProfile,
                      })
                    );
                    return;
                  }
                  setParentMessage(
                    buildReportCardParentMessage({
                      analysis,
                      academyName: effectiveInstitutionName,
                      gradeProfile,
                      templateMode,
                    })
                  );
                }}
                className="btn-3d-secondary px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Yenile</span>
              </button>

              <button
                type="button"
                onClick={handleCopyParentMessage}
                className="btn-3d-secondary px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                {copiedMessage ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                    <span>Kopyalandı</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Kopyala</span>
                  </>
                )}
              </button>

              <a
                href={smsHref}
                className="btn-3d-secondary px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
                <span>SMS</span>
              </a>

              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="karne-send-to-parent-btn"
                className="px-4 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Veliye Gönder (WhatsApp)</span>
              </a>
            </div>
          </div>

          <div className="lg:col-span-8">
            <label className="block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Düzenlenebilir Veli Mesaj Metni</span>
              <textarea
                rows={7}
                value={parentMessage}
                onChange={(e) => setParentMessage(e.target.value)}
                aria-label="Karne Veli Mesaj Metni"
                className="mt-1 w-full rounded-xl p-3.5 text-xs leading-relaxed surface-alt border"
                style={{ borderColor: 'var(--border-subtle)' }}
              />
            </label>
          </div>
        </div>
      </section>
      )}

      {!hasLiveAnalysis ? null : (
      <>

      {/* 3 FARKLI DETAYLI ANALİZ KARTI (Ders Bazlı Başarı, Konu Analizi, Zaman Yönetimi) */}
      <section aria-label="3 Farklı Detaylı Analiz Kartı" className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Kart 1: Ders Bazlı Başarı */}
        <article className="surface-card rounded-xl p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" style={{ color: 'var(--chart-1)' }} aria-hidden="true" />
                <h3 className="text-sm font-bold">1. Ders Bazlı Başarı Kartı</h3>
              </div>
              <span className="text-xs font-mono-num font-bold" style={{ color: 'var(--accent-primary)' }}>
                {analysis.totalNet.toFixed(1)} Net
              </span>
            </div>

            <div className="space-y-2.5">
              {analysis.subjectMetrics.slice(0, 5).map((s) => (
                <div key={s.subject} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold truncate max-w-[150px]">{s.subject}</span>
                    <span className="font-mono-num">
                      <strong>{s.net.toFixed(1)}</strong>/{s.total} (%{s.accuracyPct})
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${s.accuracyPct}%`, backgroundColor: 'var(--chart-1)' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="surface-alt rounded-lg p-3 text-xs flex justify-between items-center">
            <span style={{ color: 'var(--text-secondary)' }}>En Güçlü / Öncelikli:</span>
            <span className="font-bold truncate max-w-[170px]">
              {strongestSubject?.subject} / {weakestSubject?.subject}
            </span>
          </div>
        </article>

        {/* Kart 2: Konu Analizi */}
        <article className="surface-card rounded-xl p-5 flex flex-col justify-between gap-4">
          {(() => {
            const mastered = analysis.topicGaps.filter((t) => t.status === 'Tam Hakimiyet').length;
            const developing = analysis.topicGaps.filter((t) => t.status === 'Geliştirilmeli').length;
            const critical = analysis.topicGaps.filter((t) => t.status === 'Kritik Eksik').length;
            const totalT = Math.max(1, analysis.topicGaps.length);
            const masteredPct = Math.round((mastered / totalT) * 100);
            const r = 28;
            const circ = 2 * Math.PI * r;
            const dash = (masteredPct / 100) * circ;

            return (
              <>
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4" style={{ color: 'var(--chart-3)' }} aria-hidden="true" />
                      <h3 className="text-sm font-bold">2. Konu Analizi Kartı</h3>
                    </div>
                    <span className="text-xs font-mono-num font-bold" style={{ color: 'var(--chart-3)' }}>
                      {totalT} Kazanım
                    </span>
                  </div>

                  <div className="flex items-center gap-4 mb-3">
                    <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0" aria-label="Konu hakimiyeti">
                      <circle cx="36" cy="36" r={r} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="8" />
                      <circle
                        cx="36"
                        cy="36"
                        r={r}
                        fill="none"
                        stroke="var(--chart-3)"
                        strokeWidth="8"
                        strokeDasharray={`${dash} ${circ}`}
                        strokeLinecap="round"
                        transform="rotate(-90 36 36)"
                      />
                      <text x="36" y="40" textAnchor="middle" fontSize="13" fontWeight="800" fill="currentColor">
                        %{masteredPct}
                      </text>
                    </svg>
                    <div className="space-y-1 text-xs">
                      <div>Tam Hakimiyet: <strong className="font-mono-num text-emerald-600 dark:text-emerald-400">{mastered} konu</strong></div>
                      <div>Geliştirilmeli: <strong className="font-mono-num text-amber-600 dark:text-amber-400">{developing} konu</strong></div>
                      <div>Kritik Eksik: <strong className="font-mono-num text-rose-600 dark:text-rose-400">{critical} konu</strong></div>
                    </div>
                  </div>
                </div>

                <div className="surface-alt rounded-lg p-3 text-xs">
                  <span style={{ color: 'var(--text-secondary)' }}>Öncelikli Tekrar: </span>
                  <strong className="truncate">
                    {criticalTopics[0]?.topic ?? analysis.topicGaps[0]?.topic ?? 'Tüm konular dengeli'}
                  </strong>
                </div>
              </>
            );
          })()}
        </article>

        {/* Kart 3: Zaman Yönetimi */}
        <article className="surface-card rounded-xl p-5 flex flex-col justify-between gap-4">
          {(() => {
            const answered = analysis.totalCorrect + analysis.totalWrong;
            const completionPct = Math.round((answered / Math.max(1, analysis.totalQuestions)) * 100);
            const avgSecPerQ = Math.round((cover.durationMinutes * 60) / Math.max(1, answered || 1));

            return (
              <>
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" style={{ color: 'var(--chart-4)' }} aria-hidden="true" />
                      <h3 className="text-sm font-bold">3. Zaman Yönetimi Kartı</h3>
                    </div>
                    <span className="text-xs font-mono-num font-bold" style={{ color: 'var(--chart-4)' }}>
                      ~{avgSecPerQ} sn/soru
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 mb-3">
                    <div className="surface-alt rounded-lg p-2.5">
                      <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Soru Yetiştirme</div>
                      <div className="text-lg font-display font-extrabold font-mono-num">%{completionPct}</div>
                    </div>
                    <div className="surface-alt rounded-lg p-2.5">
                      <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Boş Bırakılan</div>
                      <div className="text-lg font-display font-extrabold font-mono-num">{analysis.totalBlank} soru</div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {analysis.difficultyMetrics.map((d) => (
                      <div key={d.difficulty} className="flex items-center gap-2 text-xs">
                        <span className="w-12 font-semibold">{d.difficulty}</span>
                        <div className="flex-1 h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${d.successPct}%`, backgroundColor: 'var(--chart-4)' }}
                          />
                        </div>
                        <span className="w-10 text-right font-mono-num font-bold">%{d.successPct}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="surface-alt rounded-lg p-3 text-xs">
                  <span style={{ color: 'var(--text-secondary)' }}>Hız Önerisi: </span>
                  <strong>
                    {analysis.totalBlank > 8
                      ? 'Zor sorularda turlama tekniği ile süre kazanın'
                      : 'Süre dağılımı dengeli; son 5 dk kontrol turu yapın'}
                  </strong>
                </div>
              </>
            );
          })()}
        </article>
      </section>

      {/* SECTION A: 5 ÇEŞİT ANALİZ KARNESİ */}
      <section aria-labelledby="five-reports-title" className="surface-card rounded-xl p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="five-reports-title" className="text-base font-bold">
            Bölüm 1 — 5 Çeşit Analiz Karnesi
          </h3>
          <span className="text-xs font-mono-num" style={{ color: 'var(--text-secondary)' }}>
            {REPORT_CARDS.findIndex((r) => r.id === activeReport) + 1} / 5 Karne
          </span>
        </div>

        <div role="tablist" aria-label="5 Çeşit Analiz Karnesi" className="flex flex-wrap gap-2">
          {REPORT_CARDS.map((card) => {
            const Icon = card.icon;
            const active = activeReport === card.id;
            return (
              <button
                key={card.id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setActiveReport(card.id)}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer ${
                  active ? 'btn-3d' : 'btn-3d-secondary'
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{card.label}</span>
              </button>
            );
          })}
        </div>

        {/* 1. Genel Başarı & Net Karnesi */}
        {activeReport === 'genel-basari' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <div className="surface-alt rounded-lg p-3.5">
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Toplam Net</div>
                <div className="text-2xl font-display font-extrabold font-mono-num mt-1">
                  {analysis.totalNet.toFixed(2)}
                </div>
              </div>
              <div className="surface-alt rounded-lg p-3.5">
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Doğru / Yanlış / Boş</div>
                <div className="text-lg font-display font-bold font-mono-num mt-1">
                  {analysis.totalCorrect}D · {analysis.totalWrong}Y · {analysis.totalBlank}B
                </div>
              </div>
              <div className="surface-alt rounded-lg p-3.5">
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Tahmini Puan</div>
                <div className="text-2xl font-display font-extrabold font-mono-num mt-1">
                  {analysis.estimatedScore.toFixed(1)}
                </div>
              </div>
              <div className="surface-alt rounded-lg p-3.5">
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Akademi Sırası</div>
                <div className="text-2xl font-display font-extrabold font-mono-num mt-1">
                  {analysis.academyRank} / {analysis.academySize}
                </div>
              </div>
            </div>

            {/* SVG Bar Chart: Öğrenci Net vs Akademi Ort. */}
            <div className="surface-alt rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <span className="text-xs font-bold">Ders Bazlı Net Karşılaştırması (Öğrenci vs Akademi Ortalaması)</span>
                <div className="flex items-center gap-4 text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs inline-block" style={{ backgroundColor: 'var(--chart-1)' }} />
                    <span>Öğrenci Neti</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs inline-block" style={{ backgroundColor: 'var(--chart-3)' }} />
                    <span>Akademi Ort.</span>
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {analysis.subjectMetrics.map((s) => {
                  const stuW = Math.max(2, Math.round((s.net / maxSubjectTotal) * 100));
                  const avgW = Math.max(2, Math.round((s.academyAvgNet / maxSubjectTotal) * 100));
                  return (
                    <div key={s.subject} className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span>{s.subject} ({s.total} soru)</span>
                        <span className="font-mono-num">
                          <strong>{s.net.toFixed(2)}</strong> net · Ort: {s.academyAvgNet.toFixed(2)}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="h-2.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${stuW}%`, backgroundColor: 'var(--chart-1)' }}
                          />
                        </div>
                        <div className="h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${avgW}%`, backgroundColor: 'var(--chart-3)' }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 2. Ders & Kazanım Bazlı Karne */}
        {activeReport === 'ders-kazanim' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                  <th className="text-left py-2.5 px-2 font-semibold">Ders</th>
                  <th className="text-right py-2.5 px-2 font-semibold">Soru</th>
                  <th className="text-right py-2.5 px-2 font-semibold">Doğru</th>
                  <th className="text-right py-2.5 px-2 font-semibold">Yanlış</th>
                  <th className="text-right py-2.5 px-2 font-semibold">Boş</th>
                  <th className="text-right py-2.5 px-2 font-semibold">Net</th>
                  <th className="text-right py-2.5 px-2 font-semibold">Başarı %</th>
                  <th className="text-left py-2.5 px-2 font-semibold">Durum</th>
                </tr>
              </thead>
              <tbody>
                {analysis.subjectMetrics.map((s) => (
                  <tr key={s.subject} className="border-b last:border-b-0" style={{ borderColor: 'var(--border-subtle)' }}>
                    <td className="py-2.5 px-2 font-bold">{s.subject}</td>
                    <td className="py-2.5 px-2 text-right font-mono-num">{s.total}</td>
                    <td className="py-2.5 px-2 text-right font-mono-num text-emerald-600 dark:text-emerald-400 font-bold">{s.correct}</td>
                    <td className="py-2.5 px-2 text-right font-mono-num text-rose-600 dark:text-rose-400 font-bold">{s.wrong}</td>
                    <td className="py-2.5 px-2 text-right font-mono-num">{s.blank}</td>
                    <td className="py-2.5 px-2 text-right font-mono-num font-bold">{s.net.toFixed(2)}</td>
                    <td className="py-2.5 px-2 text-right font-mono-num">%{s.accuracyPct}</td>
                    <td className="py-2.5 px-2">
                      {s.accuracyPct >= 75 ? 'Hedef Üstü' : s.accuracyPct >= 50 ? 'Gelişmekte' : 'Öncelikli Destek'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 3. AI Eğitim Koçu Karnesi */}
        {activeReport === 'ai-koc' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Öğrencinin güncel net, yanlış ve konu eksikliklerine göre kişisel çalışma reçetesi
              </div>
              <button
                type="button"
                disabled={coachLoading}
                onClick={handleGenerateAiCoach}
                className="btn-3d px-4 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {coachLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    <span>AI Koç Hazırlıyor...</span>
                  </>
                ) : (
                  <>
                    <Bot className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Gemini AI Koç Yorumunu Yenile</span>
                  </>
                )}
              </button>
            </div>

            {coachError && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                {coachError}
              </div>
            )}

            <div className="surface-alt rounded-xl p-5 text-sm leading-relaxed whitespace-pre-line">
              {analysis.aiCoachSummary || fallbackCoachText}
            </div>
          </div>
        )}

        {/* 4. Sınıf & Kurum Karşılaştırmalı Sıralama Karnesi */}
        {activeReport === 'sinif-kurum' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="surface-alt rounded-lg p-4">
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Şube Sıralaması</div>
                <div className="text-2xl font-display font-extrabold font-mono-num mt-1">
                  {analysis.classRank} / {analysis.classSize}
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{analysis.classroom}</div>
              </div>
              <div className="surface-alt rounded-lg p-4">
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Kurum Geneli Sıra</div>
                <div className="text-2xl font-display font-extrabold font-mono-num mt-1">
                  {analysis.academyRank} / {analysis.academySize}
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Doğruluk Akademi Geneli</div>
              </div>
              <div className="surface-alt rounded-lg p-4">
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Tahmini Yüzdelik Dilim</div>
                <div className="text-2xl font-display font-extrabold font-mono-num mt-1">
                  %{(100 - analysis.percentile).toFixed(1)}
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Üst dilim başarısı</div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                    <th className="text-left py-2 px-2">Ders</th>
                    <th className="text-right py-2 px-2">Öğrenci Net</th>
                    <th className="text-right py-2 px-2">Sınıf Ort.</th>
                    <th className="text-right py-2 px-2">Akademi Ort.</th>
                    <th className="text-right py-2 px-2">Türkiye Ort.</th>
                    <th className="text-right py-2 px-2">Sınıf Farkı</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.subjectMetrics.map((s) => {
                    const diff = s.net - s.classAvgNet;
                    return (
                      <tr key={s.subject} className="border-b last:border-b-0" style={{ borderColor: 'var(--border-subtle)' }}>
                        <td className="py-2 px-2 font-bold">{s.subject}</td>
                        <td className="py-2 px-2 text-right font-mono-num font-bold">{s.net.toFixed(2)}</td>
                        <td className="py-2 px-2 text-right font-mono-num">{s.classAvgNet.toFixed(2)}</td>
                        <td className="py-2 px-2 text-right font-mono-num">{s.academyAvgNet.toFixed(2)}</td>
                        <td className="py-2 px-2 text-right font-mono-num">{s.turkeyAvgNet.toFixed(2)}</td>
                        <td className={`py-2 px-2 text-right font-mono-num font-bold ${diff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {diff >= 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. Zaman Yönetimi & Zorluk Strateji Karnesi */}
        {activeReport === 'zaman-strateji' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {analysis.difficultyMetrics.map((d) => (
              <div key={d.difficulty} className="surface-alt rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">{d.difficulty} Sorular</span>
                  <span className="text-sm font-mono-num font-extrabold" style={{ color: 'var(--accent-primary)' }}>
                    %{d.successPct}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${d.successPct}%`, backgroundColor: 'var(--chart-1)' }}
                  />
                </div>
                <div className="text-xs font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                  Toplam {d.total} · {d.correct} Doğru · {d.wrong} Yanlış · {d.blank} Boş
                </div>
                <p className="text-xs pt-1" style={{ color: 'var(--text-secondary)' }}>
                  {d.difficulty === 'Kolay'
                    ? 'Kolay sorulardaki yanlışlar genelde hız veya okuma dikkatsizliğinden kaynaklanır.'
                    : d.difficulty === 'Orta'
                      ? 'Orta düzey sorularda çeldirici eleme pratiği netinizi en hızlı artıran alandır.'
                      : 'Zor sorularda turlama tekniği uygulayarak süre kaybını önleyin.'}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* SECTION B: 3 ÇEŞİT DETAYLI ANALİZ */}
      <section aria-labelledby="three-analyses-title" className="surface-card rounded-xl p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="three-analyses-title" className="text-base font-bold">
            Bölüm 2 — 3 Çeşit Detaylı Akademik Analiz
          </h3>
          <span className="text-xs font-mono-num" style={{ color: 'var(--text-secondary)' }}>
            {DETAILED_ANALYSES.findIndex((d) => d.id === activeDetail) + 1} / 3 Analiz
          </span>
        </div>

        <div role="tablist" aria-label="3 Çeşit Detaylı Analiz" className="flex flex-wrap gap-2">
          {DETAILED_ANALYSES.map((det) => {
            const Icon = det.icon;
            const active = activeDetail === det.id;
            return (
              <button
                key={det.id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setActiveDetail(det.id)}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer ${
                  active ? 'btn-3d' : 'btn-3d-secondary'
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{det.label}</span>
              </button>
            );
          })}
        </div>

        {/* 1. Kazanım & Konu Eksikliği Analizi */}
        {activeDetail === 'kazanim-eksikligi' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {['Tümü', 'Kritik Eksik', 'Geliştirilmeli', 'Tam Hakimiyet'].map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setTopicFilter(status)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    topicFilter === status ? 'btn-3d' : 'btn-3d-secondary'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto max-h-[340px]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                    <th className="text-left py-2 px-2">Ders</th>
                    <th className="text-left py-2 px-2">Konu</th>
                    <th className="text-left py-2 px-2">Kazanım Kodu</th>
                    <th className="text-right py-2 px-2">Doğru / Top.</th>
                    <th className="text-right py-2 px-2">Hakimiyet</th>
                    <th className="text-left py-2 px-2">Teşhis</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTopics.map((t) => (
                    <tr key={`${t.subject}-${t.topic}`} className="border-b last:border-b-0" style={{ borderColor: 'var(--border-subtle)' }}>
                      <td className="py-2 px-2 font-semibold">{t.subject}</td>
                      <td className="py-2 px-2">{t.topic}</td>
                      <td className="py-2 px-2 font-mono-num">{t.gainCode}</td>
                      <td className="py-2 px-2 text-right font-mono-num">{t.correct} / {t.total}</td>
                      <td className="py-2 px-2 text-right font-mono-num font-bold">%{t.masteryPct}</td>
                      <td className={`py-2 px-2 font-bold ${
                        t.status === 'Kritik Eksik'
                          ? 'text-rose-600 dark:text-rose-400'
                          : t.status === 'Geliştirilmeli'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                      }`}>
                        {t.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 2. Çeldirici & Hata Tipi Analizi */}
        {activeDetail === 'celdirici-hata' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="surface-alt rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-bold">Hata Kaynağı Dağılımı</h4>
              {Object.entries(analysis.errorBreakdown).map(([label, count]) => {
                const denom = Math.max(1, analysis.totalWrong + analysis.totalBlank);
                const pct = Math.round((count / denom) * 100);
                return (
                  <div key={label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold">{label}</span>
                      <span className="font-mono-num">{count} soru (%{pct})</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: 'var(--chart-4)' }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="surface-alt rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-bold">Şık İşaretleme Eğilimi vs Cevap Anahtarı</h4>
              <div className="space-y-2.5">
                {Object.entries(analysis.optionDistribution).map(([opt, counts]) => {
                  const maxOpt = Math.max(1, analysis.totalQuestions * 0.4);
                  const stuW = Math.min(100, Math.round((counts.student / maxOpt) * 100));
                  const keyW = Math.min(100, Math.round((counts.key / maxOpt) * 100));
                  return (
                    <div key={opt} className="grid grid-cols-12 items-center gap-2 text-xs">
                      <span className="col-span-2 font-mono-num font-bold">{opt}</span>
                      <div className="col-span-7 space-y-1">
                        <div className="h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${stuW}%`, backgroundColor: 'var(--chart-1)' }} />
                        </div>
                        <div className="h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${keyW}%`, backgroundColor: 'var(--chart-3)' }} />
                        </div>
                      </div>
                      <span className="col-span-3 text-right font-mono-num">
                        {counts.student} / {counts.key}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 3. Gelişim Trendi & Tahmini Puan Projeksiyonu */}
        {activeDetail === 'gelisim-projeksiyon' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="surface-alt rounded-lg p-3.5">
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Güncel Puan</div>
                <div className="text-2xl font-display font-extrabold font-mono-num mt-1">
                  {analysis.estimatedScore.toFixed(1)}
                </div>
              </div>
              <div className="surface-alt rounded-lg p-3.5">
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Sonraki Hedef Net</div>
                <div className="text-2xl font-display font-extrabold font-mono-num mt-1" style={{ color: 'var(--chart-3)' }}>
                  {analysis.projectedNet.toFixed(2)}
                </div>
              </div>
              <div className="surface-alt rounded-lg p-3.5">
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Tahmini Sınav Puan Projeksiyonu</div>
                <div className="text-2xl font-display font-extrabold font-mono-num mt-1" style={{ color: 'var(--accent-primary)' }}>
                  {analysis.projectedScore.toFixed(1)}
                </div>
              </div>
            </div>

            {/* Clean SVG Line Chart */}
            <div className="surface-alt rounded-xl p-4 overflow-x-auto">
              <svg viewBox="0 0 680 210" className="w-full h-48 min-w-[480px]" role="img" aria-label="Çoklu Deneme Gelişim Trendi Grafiği">
                {[0, 0.25, 0.5, 0.75, 1].map((r) => {
                  const y = 20 + r * 140;
                  return (
                    <line
                      key={r}
                      x1="48"
                      y1={y}
                      x2="650"
                      y2={y}
                      stroke="currentColor"
                      strokeOpacity="0.12"
                      strokeDasharray="4 4"
                    />
                  );
                })}
                {(() => {
                  const pts = analysis.historicalTrend;
                  const coords = pts.map((p, idx) => {
                    const x = 68 + (idx * 560) / Math.max(1, pts.length - 1);
                    const norm =
                      (p.score - minTrendScore) / Math.max(1, maxTrendScore - minTrendScore);
                    const y = 160 - norm * 135;
                    return { x, y, ...p };
                  });
                  const pathD = coords
                    .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x} ${c.y}`)
                    .join(' ');
                  return (
                    <>
                      <path
                        d={pathD}
                        fill="none"
                        stroke="var(--chart-1)"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {coords.map((c, idx) => (
                        <g key={idx}>
                          <circle cx={c.x} cy={c.y} r="6" fill="var(--chart-1)" stroke="#fff" strokeWidth="2" />
                          <text
                            x={c.x}
                            y={c.y - 12}
                            textAnchor="middle"
                            fontSize="11"
                            fontWeight="700"
                            fill="currentColor"
                          >
                            {c.score.toFixed(0)}p ({c.net.toFixed(1)}n)
                          </text>
                          <text
                            x={c.x}
                            y="188"
                            textAnchor="middle"
                            fontSize="10"
                            fill="currentColor"
                            opacity="0.75"
                          >
                            {c.examName}
                          </text>
                        </g>
                      ))}
                    </>
                  );
                })()}
              </svg>
            </div>
          </div>
        )}
      </section>

      {/* SECTION C: KONU BAZLI KAZANIM MATRİSİ (İNTERAKTİF) */}
      <section aria-labelledby="topic-matrix-title" className="surface-card rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Grid3X3 className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
            <div>
              <h3 id="topic-matrix-title" className="text-base font-bold">
                Konu Bazlı Kazanım Matrisi ({matrixRows.length} / {analysis.topicGaps.length} Konu)
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Sınavdaki her bir konudaki doğru, yanlış, boş ve kazanım başarı yüzdesini filtreleyip sıralayın
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDownloadMatrixCsv}
            className="btn-3d-secondary px-3.5 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Matrisi CSV İndir</span>
          </button>
        </div>

        {/* Filter & Search Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="block text-xs font-semibold">
            <span style={{ color: 'var(--text-secondary)' }}>Konu / Kazanım Ara</span>
            <div className="relative mt-1">
              <Search
                className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-secondary)' }}
                aria-hidden="true"
              />
              <input
                type="text"
                value={matrixSearch}
                onChange={(e) => setMatrixSearch(e.target.value)}
                placeholder="Örn: Paragraf, Kesirler, Üslü..."
                className="w-full rounded-lg pl-8 pr-3 py-2 text-xs surface-alt"
              />
            </div>
          </label>

          <label className="block text-xs font-semibold">
            <span style={{ color: 'var(--text-secondary)' }}>Ders Filtresi</span>
            <select
              value={matrixSubject}
              onChange={(e) => setMatrixSubject(e.target.value)}
              className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt"
            >
              <option value="Tümü">Tüm Dersler ({analysis.topicGaps.length})</option>
              {matrixSubjects.map((subj) => (
                <option key={subj} value={subj}>
                  {subj}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-semibold">
            <span style={{ color: 'var(--text-secondary)' }}>Hakimiyet Durumu</span>
            <select
              value={matrixStatus}
              onChange={(e) => setMatrixStatus(e.target.value)}
              className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt"
            >
              <option value="Tümü">Tümü</option>
              <option value="Tam Hakimiyet">Tam Hakimiyet (%75+)</option>
              <option value="Geliştirilmeli">Geliştirilmeli (%45–74)</option>
              <option value="Kritik Eksik">Kritik Eksik (%0–44)</option>
            </select>
          </label>

          <label className="block text-xs font-semibold">
            <span style={{ color: 'var(--text-secondary)' }}>Sıralama</span>
            <div className="mt-1 flex items-center gap-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />
              <select
                value={matrixSort}
                onChange={(e) => setMatrixSort(e.target.value as 'asc' | 'desc' | 'total')}
                className="w-full rounded-lg px-3 py-2 text-xs surface-alt"
              >
                <option value="asc">Başarı % (Önce Düşükler)</option>
                <option value="desc">Başarı % (Önce Yüksekler)</option>
                <option value="total">Soru Sayısı (Çoktan Aza)</option>
              </select>
            </div>
          </label>
        </div>

        {/* Interactive Topic Mastery Matrix Table */}
        <div className="overflow-x-auto max-h-[420px]">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b sticky top-0 surface-card" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                <th className="text-left py-2.5 px-2 font-semibold">Ders</th>
                <th className="text-left py-2.5 px-2 font-semibold">Konu</th>
                <th className="text-left py-2.5 px-2 font-semibold">Kazanım Kodu</th>
                <th className="text-right py-2.5 px-2 font-semibold">Soru</th>
                <th className="text-right py-2.5 px-2 font-semibold">Doğru</th>
                <th className="text-right py-2.5 px-2 font-semibold">Yanlış</th>
                <th className="text-right py-2.5 px-2 font-semibold">Boş</th>
                <th className="text-left py-2.5 px-3 font-semibold min-w-[160px]">Başarı Yüzdesi</th>
                <th className="text-left py-2.5 px-2 font-semibold">Durum</th>
                {onScheduleRemedial && (
                  <th className="text-right py-2.5 px-2 font-semibold">Öneri / Takvim</th>
                )}
              </tr>
            </thead>
            <tbody>
              {matrixRows.length === 0 ? (
                <tr>
                  <td colSpan={onScheduleRemedial ? 10 : 9} className="py-6 text-center" style={{ color: 'var(--text-secondary)' }}>
                    Seçili filtreye uygun konu bulunamadı.
                  </td>
                </tr>
              ) : (
                matrixRows.map((t) => {
                  const barColor =
                    t.masteryPct >= 75
                      ? '#10b981'
                      : t.masteryPct >= 45
                        ? '#f59e0b'
                        : '#ef4444';
                  return (
                    <tr
                      key={`matrix-${t.subject}-${t.topic}`}
                      className="border-b last:border-b-0 hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      <td className="py-2.5 px-2 font-bold whitespace-nowrap">{t.subject}</td>
                      <td className="py-2.5 px-2 font-medium">{t.topic}</td>
                      <td className="py-2.5 px-2 font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                        {t.gainCode}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono-num">{t.total}</td>
                      <td className="py-2.5 px-2 text-right font-mono-num text-emerald-600 dark:text-emerald-400 font-bold">
                        {t.correct}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono-num text-rose-600 dark:text-rose-400 font-bold">
                        {t.wrong}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono-num">{t.blank}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${t.masteryPct}%`, backgroundColor: barColor }}
                            />
                          </div>
                          <span className="w-10 text-right font-mono-num font-bold">%{t.masteryPct}</span>
                        </div>
                      </td>
                      <td
                        className={`py-2.5 px-2 font-bold whitespace-nowrap ${
                          t.status === 'Kritik Eksik'
                            ? 'text-rose-600 dark:text-rose-400'
                            : t.status === 'Geliştirilmeli'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {t.status}
                      </td>
                      {onScheduleRemedial && (
                        <td className="py-2.5 px-2 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onScheduleRemedial(t)}
                            className="btn-3d-secondary px-2.5 py-1 rounded-md text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <CalendarPlus className="w-3 h-3" aria-hidden="true" />
                            <span>Etüt Planla</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Resmi Karne Onayı & 3D Dijital İmza */}
      <footer className="surface-card rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-sm font-bold">{effectiveInstitutionName} · Resmi Akademik Karne Onayı</div>
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {analysis.studentName} ({analysis.studentNumber}) · {gradeProfile.shortLabel} · {safeExamTitle} · Kurum Kodu: <span className="font-mono-num">{effectiveCode8}</span>
          </div>
        </div>

        <FurkanDigitalSignature
          signatureName={cover.signatureName}
          signatureTitle={cover.signatureTitle}
          institutionCode8={effectiveCode8}
          primaryColor={logoPreset.primaryColor}
          secondaryColor={logoPreset.secondaryColor}
          goldColor={logoPreset.goldColor}
          size="md"
          tone="theme"
        />
      </footer>
      </>
      )}
    </div>
  );
}
