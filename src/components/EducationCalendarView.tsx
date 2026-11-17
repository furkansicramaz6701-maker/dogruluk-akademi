import { useMemo, useState, FormEvent } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  CalendarEventType,
  EducationCalendarEvent,
  ExamAnalysisResult,
  GradeProfile,
  Institution,
} from '../types/academy';
import { buildRemedialCalendarEvent } from '../utils/recommendations';

interface EducationCalendarViewProps {
  activeInstitution: Institution;
  gradeProfile: GradeProfile;
  classroom: string;
  analysis: ExamAnalysisResult;
  events: EducationCalendarEvent[];
  onAddEvent: (ev: EducationCalendarEvent) => void;
  onToggleComplete: (id: string) => void;
  onDeleteEvent: (id: string) => void;
}

const EVENT_TYPE_META: Record<
  CalendarEventType,
  { label: string; colorVar: string }
> = {
  'deneme-sinavi': { label: 'Deneme Sınavı', colorVar: 'var(--chart-1)' },
  'telafi-etutu': { label: 'Telafi Etütü', colorVar: 'var(--chart-4)' },
  'veli-bilgilendirme': { label: 'Veli Görüşmesi', colorVar: 'var(--chart-2)' },
  'kamp-programi': { label: 'Soru Kampı', colorVar: 'var(--chart-3)' },
};

const WEEKDAYS_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

function formatMonthTitle(year: number, monthIdx: number): string {
  return new Date(year, monthIdx, 1).toLocaleDateString('tr-TR', {
    month: 'long',
    year: 'numeric',
  });
}

function toIsoDate(year: number, monthIdx: number, day: number): string {
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function EducationCalendarView({
  activeInstitution,
  gradeProfile,
  classroom,
  analysis,
  events,
  onAddEvent,
  onToggleComplete,
  onDeleteEvent,
}: EducationCalendarViewProps) {
  const now = new Date();
  const [viewYear, setViewYear] = useState<number>(now.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(now.getMonth());
  const [typeFilter, setTypeFilter] = useState<'Tümü' | CalendarEventType>('Tümü');

  // New event form state
  const [titleInput, setTitleInput] = useState<string>('');
  const [dateInput, setDateInput] = useState<string>(
    toIsoDate(now.getFullYear(), now.getMonth(), Math.min(28, now.getDate() + 1))
  );
  const [timeInput, setTimeInput] = useState<string>('10:00');
  const [typeInput, setTypeInput] = useState<CalendarEventType>('deneme-sinavi');
  const [classroomInput, setClassroomInput] = useState<string>(classroom);
  const [noteInput, setNoteInput] = useState<string>('');

  const instEvents = useMemo(
    () =>
      events
        .filter((e) => e.institutionId === activeInstitution.id)
        .filter((e) => (typeFilter === 'Tümü' ? true : e.type === typeFilter))
        .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)),
    [events, activeInstitution.id, typeFilter]
  );

  // Build calendar cells (Monday-first grid)
  const calendarCells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    // JS getDay(): 0=Sun..6=Sat -> convert to Monday=0..Sunday=6
    const startOffset = (firstDay.getDay() + 6) % 7;

    const cells: Array<{ day: number | null; iso: string | null }> = [];
    for (let i = 0; i < startOffset; i++) {
      cells.push({ day: null, iso: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, iso: toIsoDate(viewYear, viewMonth, d) });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ day: null, iso: null });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, EducationCalendarEvent[]> = {};
    for (const ev of instEvents) {
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    return map;
  }, [instEvents]);

  const weakTopicSuggestions = useMemo(() => {
    return [...analysis.topicGaps]
      .sort((a, b) => a.masteryPct - b.masteryPct)
      .slice(0, 4);
  }, [analysis.topicGaps]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!titleInput.trim()) return;
    onAddEvent({
      id: `cal-${Date.now()}`,
      institutionId: activeInstitution.id,
      title: titleInput.trim(),
      date: dateInput,
      time: timeInput,
      gradeId: gradeProfile.id,
      type: typeInput,
      classroom: classroomInput.trim() || classroom,
      note: noteInput.trim() || 'Kurumsal eğitim planı kapsamında eklendi.',
    });
    setTitleInput('');
    setNoteInput('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="surface-card rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <CalendarDays className="w-6 h-6 shrink-0" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
          <div>
            <h2 className="text-xl font-bold">
              Eğitim Takvimi & Kurumsal Deneme Planlayıcı
            </h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {activeInstitution.name} (Kurum Kodu: {activeInstitution.code8}) · Deneme sınavları, telafi etütleri ve kamp programlarını yönetin.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(['Tümü', 'deneme-sinavi', 'telafi-etutu', 'kamp-programi', 'veli-bilgilendirme'] as const).map(
            (t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  typeFilter === t ? 'btn-3d' : 'btn-3d-secondary'
                }`}
              >
                {t === 'Tümü' ? 'Tümü' : EVENT_TYPE_META[t].label}
              </button>
            )
          )}
        </div>
      </div>

      {/* Main Split: Monthly Calendar Grid + New Event & Smart Suggestions */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Monthly Calendar */}
        <section className="xl:col-span-7 surface-card rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-bold capitalize">
              {formatMonthTitle(viewYear, viewMonth)}
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrevMonth}
                aria-label="Önceki ay"
                className="btn-3d-secondary p-2 rounded-lg cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                aria-label="Sonraki ay"
                className="btn-3d-secondary p-2 rounded-lg cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
            {WEEKDAYS_TR.map((wd) => (
              <div key={wd} className="py-1.5">
                {wd}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {calendarCells.map((cell, idx) => {
              if (!cell.day || !cell.iso) {
                return (
                  <div
                    key={`empty-${idx}`}
                    className="min-h-[82px] rounded-lg opacity-30 surface-alt"
                  />
                );
              }
              const dayEvents = eventsByDate[cell.iso] || [];
              const isSelectedDate = dateInput === cell.iso;
              return (
                <button
                  key={cell.iso}
                  type="button"
                  onClick={() => setDateInput(cell.iso!)}
                  className={`min-h-[82px] rounded-lg p-1.5 text-left flex flex-col justify-between transition-all cursor-pointer border ${
                    isSelectedDate ? 'surface-card' : 'surface-alt hover:opacity-90'
                  }`}
                  style={{
                    borderColor: isSelectedDate
                      ? 'var(--accent-primary)'
                      : 'var(--border-subtle)',
                  }}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-mono-num font-bold">{cell.day}</span>
                    {dayEvents.length > 0 && (
                      <span
                        className="text-[10px] font-mono-num font-bold"
                        style={{ color: 'var(--accent-primary)' }}
                      >
                        {dayEvents.length}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 w-full mt-1">
                    {dayEvents.slice(0, 2).map((ev) => (
                      <div
                        key={ev.id}
                        className={`text-[10px] font-semibold truncate px-1 py-0.5 rounded text-white ${
                          ev.completed ? 'opacity-50 line-through' : ''
                        }`}
                        style={{ backgroundColor: EVENT_TYPE_META[ev.type].colorVar }}
                        title={`${ev.time} ${ev.title}`}
                      >
                        {ev.time} {ev.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-[10px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                        +{dayEvents.length - 2} etkinlik
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Right: Create Event + AI/Analysis-Based Schedule Recommendations */}
        <div className="xl:col-span-5 space-y-5">
          <form onSubmit={handleSubmit} className="surface-card rounded-xl p-5 space-y-3.5">
            <h3 className="text-base font-bold">Yeni Takvim Etkinliği / Sınav Planla</h3>

            <label className="block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Etkinlik veya Deneme Başlığı</span>
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="Örn: TYT Türkiye Geneli 2. Kurumsal Deneme"
                className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt"
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Tarih</span>
                <input
                  type="date"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  className="mt-1 w-full rounded-lg px-2.5 py-2 text-xs surface-alt font-mono-num"
                />
              </label>

              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Saat</span>
                <input
                  type="time"
                  value={timeInput}
                  onChange={(e) => setTimeInput(e.target.value)}
                  className="mt-1 w-full rounded-lg px-2.5 py-2 text-xs surface-alt font-mono-num"
                />
              </label>

              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Tür</span>
                <select
                  value={typeInput}
                  onChange={(e) => setTypeInput(e.target.value as CalendarEventType)}
                  className="mt-1 w-full rounded-lg px-2.5 py-2 text-xs surface-alt"
                >
                  <option value="deneme-sinavi">Deneme Sınavı</option>
                  <option value="telafi-etutu">Telafi Etütü</option>
                  <option value="kamp-programi">Soru Kampı</option>
                  <option value="veli-bilgilendirme">Veli Görüşmesi</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Sınıf / Şube</span>
                <input
                  type="text"
                  value={classroomInput}
                  onChange={(e) => setClassroomInput(e.target.value)}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt"
                />
              </label>
              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Kısa Not</span>
                <input
                  type="text"
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="Salon, kitapçık veya hatırlatma"
                  className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={!titleInput.trim()}
              className="btn-3d w-full py-2.5 px-4 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Eğitim Takvimine Ekle</span>
            </button>
          </form>

          {/* Smart Calendar Recommendations from Student Topic Gaps */}
          <section className="surface-card rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
              <h3 className="text-sm font-bold">
                {analysis.studentName} İçin Akıllı Takvim & Etüt Önerileri
              </h3>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Son sınav analizindeki en zayıf kazanımlara göre önerilen telafi oturumlarını tek tıkla takvime ekleyin:
            </p>

            <div className="space-y-2.5">
              {weakTopicSuggestions.map((gap, idx) => (
                <div
                  key={`${gap.subject}-${gap.topic}`}
                  className="surface-alt rounded-lg p-3 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-bold truncate">
                      {gap.subject} · {gap.topic}
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      Başarı: %{gap.masteryPct} · {gap.gainCode} · Önerilen: {idx + 2} gün sonra
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onAddEvent(
                        buildRemedialCalendarEvent({
                          topicGap: gap,
                          institutionId: activeInstitution.id,
                          gradeId: gradeProfile.id,
                          classroom,
                          offsetDays: idx + 2,
                        })
                      )
                    }
                    className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Takvime Ekle
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Scheduled Events List */}
      <section className="surface-card rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold">
            Planlanan Etkinlikler & Sınavlar ({instEvents.length})
          </h3>
          <span className="text-xs font-mono-num" style={{ color: 'var(--text-secondary)' }}>
            {activeInstitution.name}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {instEvents.map((ev) => (
            <article
              key={ev.id}
              className="surface-alt rounded-xl p-4 flex items-start justify-between gap-3 text-xs"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                  <span className="font-bold" style={{ color: EVENT_TYPE_META[ev.type].colorVar }}>
                    {EVENT_TYPE_META[ev.type].label}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{ev.date}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" aria-hidden="true" />
                    {ev.time}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{ev.classroom}</span>
                </div>
                <h4 className={`text-sm font-bold ${ev.completed ? 'line-through opacity-60' : ''}`}>
                  {ev.title}
                </h4>
                <p style={{ color: 'var(--text-secondary)' }}>{ev.note}</p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onToggleComplete(ev.id)}
                  aria-label={`${ev.title} tamamlandı durumunu değiştir`}
                  className={`p-1.5 rounded-lg cursor-pointer ${
                    ev.completed ? 'btn-3d' : 'btn-3d-secondary'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteEvent(ev.id)}
                  aria-label={`${ev.title} sil`}
                  className="btn-3d-secondary p-1.5 rounded-lg text-rose-600 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
