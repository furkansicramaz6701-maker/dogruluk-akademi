import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  AlertTriangle,
  ArrowRight,
  CalendarPlus,
  CheckCircle2,
  LineChart as LineChartIcon,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  EducationCalendarEvent,
  ExamAnalysisResult,
  GradeProfile,
  Institution,
  PenaltyDivisor,
  StudentRecord,
  WeeklyQuestionPreset,
  WeeklyStudentScore,
} from '../types/academy';
import {
  CohortPerformanceBand,
  KnowledgeGapGroup,
  StudentTrendSeries,
  buildBulkRemedialCalendarEvents,
  buildInstructorCoachingDataset,
} from '../utils/instructorCoaching';

interface InstructorCoachingDashboardProps {
  activeInstitution: Institution;
  gradeProfile: GradeProfile;
  penaltyDivisor: PenaltyDivisor;
  students: StudentRecord[];
  weeklyEntries?: WeeklyStudentScore[];
  weeklyQuestionCount?: WeeklyQuestionPreset;
  analysis: ExamAnalysisResult;
  hasLiveAnalysis: boolean;
  calendarEvents: EducationCalendarEvent[];
  onBulkScheduleRemedials: (events: EducationCalendarEvent[]) => void;
  onOpenCalendar: () => void;
  onOpenWeeklyList: () => void;
  isSamplePreview?: boolean;
}

export function InstructorCoachingDashboard({
  activeInstitution,
  gradeProfile,
  penaltyDivisor,
  students,
  weeklyEntries,
  weeklyQuestionCount,
  analysis,
  hasLiveAnalysis,
  calendarEvents,
  onBulkScheduleRemedials,
  onOpenCalendar,
  onOpenWeeklyList,
  isSamplePreview = false,
}: InstructorCoachingDashboardProps) {
  const [metricMode, setMetricMode] = useState<'net' | 'score'>('net');
  const [bandFilter, setBandFilter] = useState<'all' | CohortPerformanceBand>('all');
  const [focusedStudentId, setFocusedStudentId] = useState<string | null>(null);
  const [hoveredCheckpointIdx, setHoveredCheckpointIdx] = useState<number | null>(null);

  const [selectedGapKeys, setSelectedGapKeys] = useState<string[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [remedialDate, setRemedialDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().slice(0, 10);
  });
  const [remedialTime, setRemedialTime] = useState<string>('16:00');
  const [customNote, setCustomNote] = useState<string>('');
  const [scheduleConfirmation, setScheduleConfirmation] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  const dataset = useMemo(
    () =>
      buildInstructorCoachingDataset({
        institution: activeInstitution,
        gradeProfile,
        penaltyDivisor,
        students,
        weeklyEntries,
        weeklyQuestionCount,
        activeAnalysis: analysis,
        hasLiveAnalysis,
        includeSampleFallback: isSamplePreview,
      }),
    [
      activeInstitution,
      gradeProfile,
      penaltyDivisor,
      students,
      weeklyEntries,
      weeklyQuestionCount,
      analysis,
      hasLiveAnalysis,
      isSamplePreview,
    ]
  );

  // Sync default selected gap group & its students cleanly whenever dataset updates
  useEffect(() => {
    if (dataset.knowledgeGapGroups.length === 0) {
      setSelectedGapKeys([]);
      setSelectedStudentIds([]);
      return;
    }
    const validKeys = new Set(dataset.knowledgeGapGroups.map((g) => g.gapKey));
    const keptKeys = selectedGapKeys.filter((k) => validKeys.has(k));
    const nextKeys =
      keptKeys.length > 0 ? keptKeys : [dataset.knowledgeGapGroups[0].gapKey];
    setSelectedGapKeys(nextKeys);

    const activeStudents = dataset.knowledgeGapGroups
      .filter((g) => nextKeys.includes(g.gapKey))
      .flatMap((g) => g.affectedStudents.map((s) => s.studentId));
    setSelectedStudentIds(Array.from(new Set(activeStudents)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeInstitution.id, gradeProfile.id, dataset.knowledgeGapGroups.length]);

  const visibleStudents = useMemo<StudentTrendSeries[]>(() => {
    if (bandFilter === 'all') return dataset.studentTrends;
    return dataset.studentTrends.filter((s) => s.band === bandFilter);
  }, [dataset.studentTrends, bandFilter]);

  const activeGroups = useMemo<KnowledgeGapGroup[]>(
    () => dataset.knowledgeGapGroups.filter((g) => selectedGapKeys.includes(g.gapKey)),
    [dataset.knowledgeGapGroups, selectedGapKeys]
  );

  const selectedStudentIdSet = useMemo(
    () => new Set(selectedStudentIds),
    [selectedStudentIds]
  );

  const instRemedialCount = useMemo(
    () =>
      calendarEvents.filter(
        (e) => e.institutionId === activeInstitution.id && e.type === 'telafi-etutu'
      ).length,
    [calendarEvents, activeInstitution.id]
  );

  // Render D3 multi-student performance trend chart
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || dataset.totalStudents === 0 || dataset.cohortCurve.length === 0) return;

    const width = 640;
    const height = 276;
    const margin = { top: 20, right: 24, bottom: 36, left: 46 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const root = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const labels = dataset.examLabels;
    const xScale = d3
      .scalePoint<string>()
      .domain(labels)
      .range([0, innerWidth])
      .padding(0.15);

    const maxY =
      metricMode === 'net'
        ? Math.max(10, dataset.questionCount)
        : gradeProfile.maxScore;
    const minY = metricMode === 'net' ? 0 : Math.max(0, gradeProfile.baseScore);

    const yScale = d3.scaleLinear().domain([minY, maxY]).nice().range([innerHeight, 0]);

    // Subtle horizontal gridlines
    const yTicks = yScale.ticks(5);
    root
      .append('g')
      .attr('class', 'd3-grid')
      .selectAll('line')
      .data(yTicks)
      .enter()
      .append('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', (d) => yScale(d))
      .attr('y2', (d) => yScale(d))
      .attr('stroke', 'currentColor')
      .attr('stroke-opacity', 0.1)
      .attr('stroke-dasharray', '3 3');

    // Performance band corridor (Top Band -> Support Band area)
    const bandArea = d3
      .area<(typeof dataset.cohortCurve)[number]>()
      .x((d) => xScale(d.examLabel) ?? 0)
      .y0((d) => yScale(metricMode === 'net' ? d.supportBandNet : d.supportBandScore))
      .y1((d) => yScale(metricMode === 'net' ? d.topBandNet : d.topBandScore))
      .curve(d3.curveMonotoneX);

    root
      .append('path')
      .datum(dataset.cohortCurve)
      .attr('d', bandArea)
      .attr('fill', 'var(--accent-primary)')
      .attr('fill-opacity', 0.09);

    // Individual student trend lines (D3 paths)
    const studentLine = d3
      .line<(typeof dataset.studentTrends)[number]['points'][number]>()
      .x((d) => xScale(d.examLabel) ?? 0)
      .y((d) => yScale(metricMode === 'net' ? d.net : d.score))
      .curve(d3.curveMonotoneX);

    const studentLinesGroup = root.append('g').attr('class', 'd3-student-lines');
    visibleStudents.forEach((stu) => {
      const isFocused = focusedStudentId === stu.studentId;
      const isTargetedForRemedial = selectedStudentIdSet.has(stu.studentId);
      const strokeColor =
        stu.band === 'top'
          ? 'var(--chart-3)'
          : stu.band === 'support'
            ? '#e11d48'
            : 'var(--chart-2)';

      studentLinesGroup
        .append('path')
        .datum(stu.points)
        .attr('d', studentLine)
        .attr('fill', 'none')
        .attr('stroke', strokeColor)
        .attr('stroke-width', isFocused ? 2.8 : isTargetedForRemedial ? 1.5 : 1.1)
        .attr(
          'stroke-opacity',
          focusedStudentId ? (isFocused ? 0.95 : 0.16) : isTargetedForRemedial ? 0.55 : 0.3
        )
        .style('cursor', 'pointer')
        .on('mouseenter', () => setFocusedStudentId(stu.studentId))
        .on('mouseleave', () => setFocusedStudentId(null));
    });

    // Aggregate curves: Top Band, Support Band, Institution Average
    const makeCohortLine = (
      accessor: (d: (typeof dataset.cohortCurve)[number]) => number
    ) =>
      d3
        .line<(typeof dataset.cohortCurve)[number]>()
        .x((d) => xScale(d.examLabel) ?? 0)
        .y((d) => yScale(accessor(d)))
        .curve(d3.curveMonotoneX);

    root
      .append('path')
      .datum(dataset.cohortCurve)
      .attr(
        'd',
        makeCohortLine((d) => (metricMode === 'net' ? d.topBandNet : d.topBandScore))
      )
      .attr('fill', 'none')
      .attr('stroke', 'var(--chart-3)')
      .attr('stroke-width', 2.2)
      .attr('stroke-dasharray', '5 4');

    root
      .append('path')
      .datum(dataset.cohortCurve)
      .attr(
        'd',
        makeCohortLine((d) =>
          metricMode === 'net' ? d.supportBandNet : d.supportBandScore
        )
      )
      .attr('fill', 'none')
      .attr('stroke', '#e11d48')
      .attr('stroke-width', 2.2)
      .attr('stroke-dasharray', '4 4');

    root
      .append('path')
      .datum(dataset.cohortCurve)
      .attr(
        'd',
        makeCohortLine((d) => (metricMode === 'net' ? d.avgNet : d.avgScore))
      )
      .attr('fill', 'none')
      .attr('stroke', 'var(--accent-primary)')
      .attr('stroke-width', 3.2);

    // Interactive checkpoint dots on the Institution Average line
    root
      .selectAll('circle.cohort-dot')
      .data(dataset.cohortCurve)
      .enter()
      .append('circle')
      .attr('class', 'cohort-dot')
      .attr('cx', (d) => xScale(d.examLabel) ?? 0)
      .attr('cy', (d) => yScale(metricMode === 'net' ? d.avgNet : d.avgScore))
      .attr('r', (d) => (hoveredCheckpointIdx === d.examIndex ? 6 : 4.5))
      .attr('fill', 'var(--bg-surface)')
      .attr('stroke', 'var(--accent-primary)')
      .attr('stroke-width', 2.5)
      .style('cursor', 'pointer')
      .on('mouseenter', (_event, d) => setHoveredCheckpointIdx(d.examIndex))
      .on('mouseleave', () => setHoveredCheckpointIdx(null));

    // Axes
    const xAxis = d3.axisBottom(xScale).tickSizeOuter(0);
    const xAxisGroup = root
      .append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis);
    xAxisGroup.selectAll('path, line').attr('stroke', 'currentColor').attr('stroke-opacity', 0.2);
    xAxisGroup
      .selectAll('text')
      .attr('fill', 'currentColor')
      .attr('font-size', '11px')
      .attr('font-weight', '600');

    const yAxis = d3.axisLeft(yScale).ticks(5).tickSizeOuter(0);
    const yAxisGroup = root.append('g').call(yAxis);
    yAxisGroup.selectAll('path, line').attr('stroke', 'currentColor').attr('stroke-opacity', 0.2);
    yAxisGroup
      .selectAll('text')
      .attr('fill', 'currentColor')
      .attr('font-size', '11px')
      .attr('font-weight', '600');
  }, [
    dataset,
    metricMode,
    visibleStudents,
    focusedStudentId,
    selectedStudentIdSet,
    hoveredCheckpointIdx,
    gradeProfile.maxScore,
    gradeProfile.baseScore,
  ]);

  const focusedStudent = useMemo(
    () => dataset.studentTrends.find((s) => s.studentId === focusedStudentId) ?? null,
    [dataset.studentTrends, focusedStudentId]
  );

  const activeCheckpoint = useMemo(
    () =>
      hoveredCheckpointIdx !== null
        ? dataset.cohortCurve[hoveredCheckpointIdx] ?? null
        : dataset.cohortCurve[dataset.cohortCurve.length - 1] ?? null,
    [dataset.cohortCurve, hoveredCheckpointIdx]
  );

  const toggleGapGroup = (gapKey: string) => {
    const isSelected = selectedGapKeys.includes(gapKey);
    const nextKeys = isSelected
      ? selectedGapKeys.filter((k) => k !== gapKey)
      : [...selectedGapKeys, gapKey];
    setSelectedGapKeys(nextKeys);

    const groupStudents =
      dataset.knowledgeGapGroups.find((g) => g.gapKey === gapKey)?.affectedStudents ?? [];
    if (isSelected) {
      const removeIds = new Set(groupStudents.map((s) => s.studentId));
      setSelectedStudentIds((prev) => prev.filter((id) => !removeIds.has(id)));
    } else {
      const addIds = groupStudents.map((s) => s.studentId);
      setSelectedStudentIds((prev) => Array.from(new Set([...prev, ...addIds])));
    }
  };

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  };

  const handleBulkSchedule = () => {
    if (activeGroups.length === 0) return;
    const events = buildBulkRemedialCalendarEvents({
      groups: activeGroups,
      selectedStudentIds: selectedStudentIdSet,
      institutionId: activeInstitution.id,
      gradeId: gradeProfile.id,
      date: remedialDate,
      time: remedialTime,
      customNote,
    });
    if (events.length === 0) return;
    onBulkScheduleRemedials(events);
    setScheduleConfirmation(
      `${events.length} toplu telafi etütü (${selectedStudentIds.length} öğrenci) ${remedialDate} ${remedialTime} için Eğitim Takvimine eklendi.`
    );
  };

  return (
    <section
      aria-labelledby="instructor-coaching-heading"
      data-testid="instructor-coaching-dashboard"
      className="surface-card rounded-xl p-5 space-y-5 border"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <LineChartIcon
            className="w-5 h-5 mt-0.5 shrink-0"
            style={{ color: 'var(--accent-primary)' }}
            aria-hidden="true"
          />
          <div>
            <h2 id="instructor-coaching-heading" className="text-lg font-extrabold leading-tight">
              Eğitmen Koçluk Paneli & Toplu Telafi Planlayıcı ({activeInstitution.name})
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {dataset.totalStudents === 0
                ? 'Kurumda henüz deneme kaydı bulunmadığından koçluk eğilimi ve grup telafi listesi sıfır durumdadır.'
                : dataset.examLabels.length === 1
                  ? 'İlk deneme kaydı doğrultusunda öğrenci dağılımı D3 üzerinde izlenir; konu eksikleri tek tıkla telafi etütüne dönüştürülür.'
                  : 'Tüm öğrencilerin performans eğilimleri D3 grafik motoruyla izlenir; ortak konu eksikleri tek tıkla grup telafi etütüne dönüştürülür.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg p-0.5 surface-alt border" style={{ borderColor: 'var(--border-subtle)' }}>
            <button
              type="button"
              onClick={() => setMetricMode('net')}
              aria-pressed={metricMode === 'net'}
              className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer whitespace-nowrap ${
                metricMode === 'net' ? 'btn-3d' : ''
              }`}
            >
              Net Trendi
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('score')}
              aria-pressed={metricMode === 'score'}
              className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer whitespace-nowrap ${
                metricMode === 'score' ? 'btn-3d' : ''
              }`}
            >
              Puan Trendi
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenWeeklyList}
            className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <span>Haftalık Liste</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="surface-alt rounded-xl p-3">
          <div className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
            İzlenen Öğrenci ({dataset.isLiveCohort ? 'Canlı Kohort' : 'Hazır Müfredat Kohortu'})
          </div>
          <div className="text-xl font-extrabold font-mono-num mt-0.5">
            {dataset.totalStudents} Öğrenci
          </div>
        </div>
        <div className="surface-alt rounded-xl p-3">
          <div className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
            Son Deneme Kurum Ort.
          </div>
          <div className="text-xl font-extrabold font-mono-num mt-0.5" style={{ color: 'var(--accent-primary)' }}>
            {metricMode === 'net'
              ? `${dataset.avgLatestNet.toFixed(2)} Net`
              : `${dataset.avgLatestScore.toFixed(1)} Puan`}
          </div>
        </div>
        <div className="surface-alt rounded-xl p-3">
          <div className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
            İstikrarlı Yükselen
          </div>
          <div className="text-xl font-extrabold font-mono-num mt-0.5 text-emerald-600 dark:text-emerald-400">
            {dataset.risingCount} Öğrenci
          </div>
        </div>
        <div className="surface-alt rounded-xl p-3">
          <div className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
            Destek & Etüt Önceliği
          </div>
          <div className="text-xl font-extrabold font-mono-num mt-0.5 text-rose-600 dark:text-rose-400">
            {dataset.supportCount} Öğrenci
          </div>
        </div>
      </div>

      {dataset.totalStudents === 0 ? (
        <div
          data-testid="instructor-coaching-empty-state"
          className="surface-alt rounded-xl p-6 text-center space-y-2 border"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="text-sm font-bold">
            Henüz deneme yapılmamış — İlk deneme kaydı bekleniyor
          </div>
          <p className="text-xs max-w-xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
            {activeInstitution.name} kurumunda optik değerlendirme veya haftalık deneme girişi yapıldığında D3 kohort eğilimi ve toplu telafi önerileri otomatik oluşturulur.
          </p>
        </div>
      ) : (
        <>
      {/* Main 12-col Split: Left D3 Multi-Student Chart, Right Bulk Remedial Scheduler */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left: D3 Cohort Trend Chart */}
        <div
          className="xl:col-span-7 surface-alt rounded-xl p-4 space-y-3 border"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold">
              {dataset.examLabels.length === 1
                ? '1. Deneme (İlk Kayıt) Öğrenci & Kohort Dağılımı (D3)'
                : `${dataset.examLabels.length} Sınavlık Öğrenci & Performans Bandı Eğilimi (D3)`}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  { id: 'all', label: 'Tüm Öğrenciler' },
                  { id: 'top', label: 'Üst Bant' },
                  { id: 'steady', label: 'Dengeli' },
                  { id: 'support', label: 'Destek Grubu' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setBandFilter(f.id)}
                  aria-pressed={bandFilter === f.id}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold cursor-pointer whitespace-nowrap ${
                    bandFilter === f.id ? 'btn-3d' : 'btn-3d-secondary'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive D3 SVG Container */}
          <div className="w-full overflow-hidden rounded-lg surface-card p-2 border" style={{ borderColor: 'var(--border-subtle)' }}>
            <svg
              ref={svgRef}
              viewBox="0 0 640 276"
              role="img"
              aria-label="Tüm öğrencilerin çoklu sınav performans eğilimi D3 grafiği"
              data-testid="instructor-coaching-d3-chart"
              className="w-full h-auto block"
              style={{ color: 'var(--text-secondary)' }}
            />
          </div>

          {/* Interactive Readout + Legend */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-[11px]">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: 'var(--accent-primary)' }} />
                Kurum Ortalaması
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: 'var(--chart-3)' }} />
                Üst Performans Bandı
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <span className="w-3 h-0.5 inline-block rounded bg-rose-600" />
                Destek Grubu
              </span>
            </div>

            {focusedStudent ? (
              <div className="font-mono-num font-bold" style={{ color: 'var(--accent-primary)' }}>
                {focusedStudent.studentName} ({focusedStudent.classroom}):{' '}
                {metricMode === 'net'
                  ? `${focusedStudent.latestNet.toFixed(2)} Net (${focusedStudent.deltaNet5 >= 0 ? '+' : ''}${focusedStudent.deltaNet5.toFixed(2)})`
                  : `${focusedStudent.latestScore.toFixed(1)} Puan`}
              </div>
            ) : activeCheckpoint ? (
              <div className="font-mono-num font-semibold" style={{ color: 'var(--text-primary)' }}>
                {activeCheckpoint.examLabel}: Ort.{' '}
                <strong>
                  {metricMode === 'net'
                    ? `${activeCheckpoint.avgNet.toFixed(2)} Net`
                    : `${activeCheckpoint.avgScore.toFixed(1)} Puan`}
                </strong>{' '}
                · Üst{' '}
                <strong>
                  {metricMode === 'net'
                    ? `${activeCheckpoint.topBandNet.toFixed(2)}`
                    : `${activeCheckpoint.topBandScore.toFixed(1)}`}
                </strong>{' '}
                · Destek{' '}
                <strong>
                  {metricMode === 'net'
                    ? `${activeCheckpoint.supportBandNet.toFixed(2)}`
                    : `${activeCheckpoint.supportBandScore.toFixed(1)}`}
                </strong>
              </div>
            ) : null}
          </div>

          {/* Student Focus Strip */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {visibleStudents.slice(0, 10).map((stu) => {
              const isFocused = focusedStudentId === stu.studentId;
              return (
                <button
                  key={stu.studentId}
                  type="button"
                  onMouseEnter={() => setFocusedStudentId(stu.studentId)}
                  onMouseLeave={() => setFocusedStudentId(null)}
                  onClick={() =>
                    setFocusedStudentId((prev) =>
                      prev === stu.studentId ? null : stu.studentId
                    )
                  }
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold font-mono-num cursor-pointer transition-colors ${
                    isFocused ? 'btn-3d' : 'surface-card border'
                  }`}
                  style={isFocused ? undefined : { borderColor: 'var(--border-subtle)' }}
                >
                  {stu.shortName} · {metricMode === 'net' ? `${stu.latestNet.toFixed(1)}N` : `${stu.latestScore.toFixed(0)}P`}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Bulk Remedial Scheduler */}
        <div
          className="xl:col-span-5 surface-alt rounded-xl p-4 space-y-3.5 border"
          style={{ borderColor: 'var(--border-subtle)' }}
          data-testid="bulk-remedial-scheduler"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
              <h3 className="text-sm font-extrabold">
                Toplu Telafi & Etüt Planlayıcı
              </h3>
            </div>
            <span className="text-[11px] font-mono-num font-bold" style={{ color: 'var(--text-secondary)' }}>
              {instRemedialCount} Etüt Takvimde
            </span>
          </div>

          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Ortak konu eksiğine sahip öğrenci gruplarını seçerek Eğitim Takvimine toplu telafi çalışması atayın.
          </p>

          {/* Knowledge Gap Groups */}
          <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
            {dataset.knowledgeGapGroups.map((group) => {
              const checked = selectedGapKeys.includes(group.gapKey);
              return (
                <div
                  key={group.gapKey}
                  className="surface-card rounded-xl p-3 border space-y-2"
                  style={{
                    borderColor: checked ? 'var(--accent-primary)' : 'var(--border-subtle)',
                  }}
                >
                  <label className="flex items-start justify-between gap-2 cursor-pointer">
                    <div className="flex items-start gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleGapGroup(group.gapKey)}
                        data-testid={`gap-group-checkbox-${group.gapKey}`}
                        className="mt-0.5 rounded cursor-pointer"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold leading-snug">
                          {group.subject} — {group.topic}
                        </div>
                        <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                          {group.affectedStudents.length} öğrenci · Önerilen {group.recommendedDurationMin} dk
                        </div>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-extrabold shrink-0 ${
                        group.severity === 'kritik'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {group.severity === 'kritik' ? (
                        <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                      ) : (
                        <TrendingUp className="w-3 h-3" aria-hidden="true" />
                      )}
                      {group.severity === 'kritik' ? 'Öncelikli' : 'Pekiştirme'}
                    </span>
                  </label>

                  {checked && (
                    <div className="flex flex-wrap gap-1.5 pt-1 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                      {group.affectedStudents.map((stu) => {
                        const stuChecked = selectedStudentIdSet.has(stu.studentId);
                        return (
                          <button
                            key={stu.studentId}
                            type="button"
                            onClick={() => toggleStudentSelection(stu.studentId)}
                            aria-pressed={stuChecked}
                            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold cursor-pointer ${
                              stuChecked ? 'btn-3d' : 'btn-3d-secondary opacity-70'
                            }`}
                          >
                            {stu.studentName} ({stu.classroom})
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Schedule Inputs */}
          <div className="grid grid-cols-2 gap-2.5">
            <label className="block text-[11px] font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Etüt Tarihi</span>
              <input
                type="date"
                value={remedialDate}
                onChange={(e) => setRemedialDate(e.target.value)}
                data-testid="bulk-remedial-date-input"
                className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-xs surface-card border font-mono-num"
                style={{ borderColor: 'var(--border-subtle)' }}
              />
            </label>
            <label className="block text-[11px] font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Başlangıç Saati</span>
              <input
                type="time"
                value={remedialTime}
                onChange={(e) => setRemedialTime(e.target.value)}
                data-testid="bulk-remedial-time-input"
                className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-xs surface-card border font-mono-num"
                style={{ borderColor: 'var(--border-subtle)' }}
              />
            </label>
          </div>

          <label className="block text-[11px] font-semibold">
            <span style={{ color: 'var(--text-secondary)' }}>
              Grup Çalışma Konusu / Özel Not (İsteğe Bağlı)
            </span>
            <input
              type="text"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="Örn: 20 yeni nesil problem + birebir hata çözümü"
              className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-xs surface-card border"
              style={{ borderColor: 'var(--border-subtle)' }}
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              disabled={activeGroups.length === 0 || selectedStudentIds.length === 0}
              onClick={handleBulkSchedule}
              data-testid="bulk-remedial-submit-btn"
              className="btn-3d px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <CalendarPlus className="w-4 h-4" aria-hidden="true" />
              <span>
                Toplu Etüt Planla & Ata ({activeGroups.length} Grup · {selectedStudentIds.length} Öğrenci)
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenCalendar}
              className="btn-3d-secondary px-3 py-2 rounded-xl text-xs font-bold cursor-pointer"
            >
              Takvimi Aç
            </button>
          </div>

          {scheduleConfirmation && (
            <div
              data-testid="bulk-remedial-confirmation"
              className="surface-card rounded-lg px-3 py-2 text-xs font-semibold flex items-center gap-2 border"
              style={{ borderColor: 'var(--chart-3)' }}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" aria-hidden="true" />
              <span>{scheduleConfirmation}</span>
            </div>
          )}
        </div>
      </div>
        </>
      )}
    </section>
  );
}
