import { ArrowLeft, FlaskConical, RotateCcw, Users } from 'lucide-react';
import { GRADE_PROFILES } from '../data/curriculum';
import {
  ExamAnalysisResult,
  GradeProfile,
  Institution,
  PenaltyDivisor,
  StudentRecord,
} from '../types/academy';
import { DEFAULT_STUDENTS } from '../utils/institutionCodes';
import { NetProgressionChart } from './NetProgressionChart';

interface SampleDemoPageViewProps {
  gradeProfile: GradeProfile;
  questionCount: number;
  penaltyDivisor: PenaltyDivisor;
  activeInstitution: Institution;
  students: StudentRecord[];
  hasLiveAnalysis: boolean;
  isSampleDemoActive: boolean;
  analysis: ExamAnalysisResult;
  onLoadDemoStudent: (demoStudent: StudentRecord) => void;
  onResetCleanWorkspace: () => void;
  onReturnToDashboard: () => void;
  onOpenStudentPanel: () => void;
}

export function SampleDemoPageView({
  gradeProfile,
  questionCount,
  penaltyDivisor,
  activeInstitution,
  students,
  hasLiveAnalysis,
  isSampleDemoActive,
  analysis,
  onLoadDemoStudent,
  onResetCleanWorkspace,
  onReturnToDashboard,
  onOpenStudentPanel,
}: SampleDemoPageViewProps) {
  return (
    <div className="space-y-6" data-testid="sample-demo-page">
      {/* Sample Page Header */}
      <section className="surface-card rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent-primary)' }}
          >
            <FlaskConical className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-display font-extrabold leading-tight">
              Örnek Sayfa (Demo Simülasyon &amp; Türkiye Geneli Karşılaştırma)
            </h1>
            <p className="text-xs sm:text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              Bu sayfa, Türkiye Geneli net kıyaslamasını ve örnek öğrenci optik senaryolarını kurum panelinizden ayrı olarak incelemeniz için tasarlanmıştır. Gerçek kurum verileriniz sıfır başlangıçlı ve temiz kalır.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenStudentPanel}
            data-testid="sample-page-student-panel-btn"
            className="btn-3d-secondary px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Users className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Öğrenci Paneli</span>
          </button>
          {hasLiveAnalysis && isSampleDemoActive && (
            <button
              type="button"
              onClick={onResetCleanWorkspace}
              className="btn-3d-secondary px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Örneği Temizle</span>
            </button>
          )}
          <button
            type="button"
            onClick={onReturnToDashboard}
            data-testid="sample-return-dashboard-btn"
            className="btn-3d px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Kurum Paneline Dön</span>
          </button>
        </div>
      </section>

      {/* Sample Kurum + Türkiye Geneli Progression Chart */}
      <NetProgressionChart
        gradeProfile={gradeProfile}
        questionCount={questionCount}
        penaltyDivisor={penaltyDivisor}
        activeInstitution={activeInstitution}
        students={students}
        hasLiveAnalysis={hasLiveAnalysis}
        activeStudentName={analysis.studentName}
        activeStudentNet={analysis.totalNet}
        activeExamTitle={analysis.examTitle}
        showTurkeyBenchmark={true}
        isSamplePreview={true}
      />

      {/* Sample Student Cards */}
      <section className="surface-card rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-base font-bold leading-tight">
            Örnek Öğrenci Optik &amp; Karne Simülasyonları (4 Hazır Senaryo)
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Bir senaryoyu seçtiğinizde örnek optik cevapları yüklenir; Optik Okuma, Karne &amp; Analiz ve PDF çıktılarını test edebilirsiniz.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {DEFAULT_STUDENTS.map((demo) => {
            const gp = GRADE_PROFILES.find((p) => p.id === demo.gradeId);
            return (
              <div
                key={demo.id}
                className="surface-alt rounded-xl p-4 flex flex-col justify-between gap-3"
              >
                <div className="space-y-1">
                  <div
                    className="text-xs font-mono-num font-bold"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    {demo.studentNumber8} · {gp?.shortLabel}
                  </div>
                  <div className="text-sm font-bold">{demo.fullName}</div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {demo.institutionName} · {demo.classroom}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onLoadDemoStudent(demo)}
                  className="btn-3d w-full py-2 px-3 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer"
                >
                  Örnek Olarak Yükle &amp; Simüle Et
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
