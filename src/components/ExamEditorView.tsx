import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  FileDown,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import {
  CoverConfig,
  DifficultyLevel,
  ExamQuestion,
  GradeProfile,
} from '../types/academy';
import {
  auditExamQuestions,
  balanceDifficultyLevels,
  balanceQuestionOptions,
  fillMissingExplanations,
} from '../utils/recommendations';

interface ExamEditorViewProps {
  gradeProfile: GradeProfile;
  questions: ExamQuestion[];
  cover: CoverConfig;
  onUpdateQuestions: (next: ExamQuestion[]) => void;
  onDownloadBookletPdf: () => Promise<void>;
}

export function ExamEditorView({
  gradeProfile,
  questions,
  cover,
  onUpdateQuestions,
  onDownloadBookletPdf,
}: ExamEditorViewProps) {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [subjectFilter, setSubjectFilter] = useState<string>('Tümü');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('Tümü');
  const [editorMessage, setEditorMessage] = useState<string | null>(null);

  const letters =
    gradeProfile.optionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];

  const audit = useMemo(
    () => auditExamQuestions(questions, gradeProfile.optionCount),
    [questions, gradeProfile.optionCount]
  );

  const subjects = useMemo(
    () => Array.from(new Set(questions.map((q) => q.subject))),
    [questions]
  );

  const filteredWithIndex = useMemo(() => {
    return questions
      .map((q, idx) => ({ q, idx }))
      .filter(({ q }) => {
        if (subjectFilter !== 'Tümü' && q.subject !== subjectFilter) return false;
        if (difficultyFilter !== 'Tümü' && q.difficulty !== difficultyFilter) return false;
        if (searchQuery.trim()) {
          const s = searchQuery.trim().toLowerCase();
          return (
            q.stem.toLowerCase().includes(s) ||
            q.topic.toLowerCase().includes(s) ||
            q.subject.toLowerCase().includes(s) ||
            String(q.number).includes(s)
          );
        }
        return true;
      });
  }, [questions, subjectFilter, difficultyFilter, searchQuery]);

  const safeIdx = Math.min(selectedIndex, Math.max(0, questions.length - 1));
  const activeQ = questions[safeIdx];

  const notify = (msg: string) => {
    setEditorMessage(msg);
    setTimeout(() => setEditorMessage(null), 3500);
  };

  const renumber = (list: ExamQuestion[]): ExamQuestion[] =>
    list.map((q, i) => ({ ...q, number: i + 1 }));

  const updateActiveQuestion = (patch: Partial<ExamQuestion>) => {
    if (!activeQ) return;
    const next = questions.map((q, i) => (i === safeIdx ? { ...q, ...patch } : q));
    onUpdateQuestions(next);
  };

  const updateActiveOption = (key: string, val: string) => {
    if (!activeQ) return;
    updateActiveQuestion({
      options: {
        ...activeQ.options,
        [key]: val,
      },
    });
  };

  const handleMove = (idx: number, delta: -1 | 1) => {
    const target = idx + delta;
    if (target < 0 || target >= questions.length) return;
    const copy = [...questions];
    const tmp = copy[idx];
    copy[idx] = copy[target];
    copy[target] = tmp;
    onUpdateQuestions(renumber(copy));
    setSelectedIndex(target);
  };

  const handleDuplicate = (idx: number) => {
    const src = questions[idx];
    if (!src) return;
    const clone: ExamQuestion = {
      ...src,
      id: `q-dup-${Date.now()}`,
      options: { ...src.options },
    };
    const copy = [...questions];
    copy.splice(idx + 1, 0, clone);
    onUpdateQuestions(renumber(copy));
    setSelectedIndex(idx + 1);
    notify(`Soru ${src.number} çoğaltıldı.`);
  };

  const handleDelete = (idx: number) => {
    if (questions.length <= 1) return;
    const removedNum = questions[idx]?.number;
    const next = renumber(questions.filter((_, i) => i !== idx));
    onUpdateQuestions(next);
    setSelectedIndex(Math.max(0, Math.min(idx, next.length - 1)));
    notify(`Soru ${removedNum} kitapçıktan çıkarıldı.`);
  };

  const handleAddBlankQuestion = () => {
    const fallbackSubj = gradeProfile.subjects[0];
    const options: Record<string, string> = {};
    letters.forEach((l) => {
      options[l] = `${l} seçeneği metnini buraya yazın`;
    });
    const added: ExamQuestion = {
      id: `q-new-${Date.now()}`,
      number: questions.length + 1,
      subject: fallbackSubj.name,
      topic: fallbackSubj.topics[0] || 'Genel Tekrar',
      gainCode: `${gradeProfile.id}.${fallbackSubj.id.toUpperCase()}.YENI`,
      difficulty: 'Orta',
      stem: `${fallbackSubj.name} (${fallbackSubj.topics[0] || 'Genel'}) için yeni nesil deneme sorusu metnini buraya yazınız.`,
      options,
      correctOption: 'A',
      explanation: 'Doğru yanıt gerekçesi ve kısa çözüm adımını buraya ekleyebilirsiniz.',
      source: 'Müfredat Havuzu',
    };
    const next = [...questions, added];
    onUpdateQuestions(next);
    setSelectedIndex(next.length - 1);
    notify(`Soru ${added.number} oluşturuldu ve düzenlemeye açıldı.`);
  };

  const handleApplyAuditFix = (
    fixType: 'balance-options' | 'balance-difficulty' | 'fill-explanations'
  ) => {
    if (fixType === 'balance-options') {
      onUpdateQuestions(balanceQuestionOptions(questions, gradeProfile.optionCount));
      notify('Tüm soruların doğru cevap şıkları A–E arasında dengeli dağıtıldı.');
    } else if (fixType === 'balance-difficulty') {
      onUpdateQuestions(balanceDifficultyLevels(questions));
      notify('Soru zorluk seviyeleri ÖSYM %30 Kolay / %45 Orta / %25 Zor piramidine hizalandı.');
    } else {
      onUpdateQuestions(fillMissingExplanations(questions));
      notify('Eksik veya kısa çözüm açıklamaları kazanım notlarıyla tamamlandı.');
    }
  };

  const handleInjectNewGenContext = () => {
    if (!activeQ) return;
    if (activeQ.stem.includes('ÖSYM Yeni Nesil Kurgu:')) return;
    updateActiveQuestion({
      stem: `ÖSYM Yeni Nesil Kurgu: Bir okul laboratuvarında/günlük yaşam senaryosunda veriler tablolaştırılmıştır. ${activeQ.stem}`,
      difficulty: activeQ.difficulty === 'Kolay' ? 'Orta' : activeQ.difficulty,
    });
    notify(`Soru ${activeQ.number} yeni nesil bağlam cümlesiyle güncellendi.`);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Quick Actions */}
      <div className="surface-card rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">
            Deneme Editörü — {cover.examTitle}
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {questions.length} soruluk kitapçıktaki tüm soruları tek tek düzenleyin, sıralayın, şık dağılımını dengeleyin ve Furkan 3D imzalı PDF’e aktarın.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleAddBlankQuestion}
            className="btn-3d-secondary px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Yeni Soru Ekle</span>
          </button>
          <button
            type="button"
            onClick={onDownloadBookletPdf}
            className="btn-3d px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <FileDown className="w-4 h-4" aria-hidden="true" />
            <span>Düzenlenmiş Kitapçığı PDF İndir</span>
          </button>
        </div>
      </div>

      {editorMessage && (
        <div className="surface-card rounded-xl px-4 py-3 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--chart-3)' }} aria-hidden="true" />
          <span>{editorMessage}</span>
        </div>
      )}

      {/* Editor Quality Audit & Smart Fix Suggestions */}
      <section aria-labelledby="editor-audit-title" className="surface-card rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
            <h3 id="editor-audit-title" className="text-base font-bold">
              Editör Kalite Denetimi & Akıllı İyileştirme Önerileri
            </h3>
          </div>
          <div className="text-xs font-mono-num" style={{ color: 'var(--text-secondary)' }}>
            Şık Dengesi: %{audit.optionBalancePct} · Kolay: {audit.difficultyCounts.Kolay} / Orta: {audit.difficultyCounts.Orta} / Zor: {audit.difficultyCounts.Zor}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {audit.suggestions.map((sug) => (
            <div key={sug.id} className="surface-alt rounded-xl p-4 flex flex-col justify-between gap-3">
              <div>
                <div className="text-xs font-bold">{sug.title}</div>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {sug.detail}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleApplyAuditFix(sug.fixType)}
                className={`${
                  sug.needsFix ? 'btn-3d' : 'btn-3d-secondary'
                } px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer`}
              >
                <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Öneriyi Uygula</span>
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Main Split Editor: Question Navigator + Active Question Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Question Navigator & Filters */}
        <section className="lg:col-span-5 surface-card rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="relative sm:col-span-3">
              <Search
                className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-secondary)' }}
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Soru no, konu veya metin ara..."
                aria-label="Soru ara"
                className="w-full rounded-lg pl-8 pr-3 py-2 text-xs surface-alt"
              />
            </div>

            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              aria-label="Ders filtresi"
              className="sm:col-span-2 rounded-lg px-2.5 py-2 text-xs surface-alt"
            >
              <option value="Tümü">Tüm Dersler ({questions.length})</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              value={difficultyFilter}
              onChange={(e) => setDifficultyFilter(e.target.value)}
              aria-label="Zorluk filtresi"
              className="rounded-lg px-2.5 py-2 text-xs surface-alt"
            >
              <option value="Tümü">Tüm Zorluk</option>
              <option value="Kolay">Kolay</option>
              <option value="Orta">Orta</option>
              <option value="Zor">Zor</option>
            </select>
          </div>

          <div className="text-xs font-mono-num" style={{ color: 'var(--text-secondary)' }}>
            Gösterilen: {filteredWithIndex.length} / {questions.length} soru
          </div>

          <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
            {filteredWithIndex.map(({ q, idx }) => {
              const isSelected = idx === safeIdx;
              return (
                <div
                  key={q.id}
                  className={`rounded-xl p-3 text-xs transition-all border ${
                    isSelected ? 'surface-card' : 'surface-alt'
                  }`}
                  style={{
                    borderColor: isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedIndex(idx)}
                    className="w-full text-left cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2 font-bold">
                      <span>
                        Soru {q.number} · {q.subject}
                      </span>
                      <span className="font-mono-num" style={{ color: 'var(--accent-primary)' }}>
                        {q.correctOption} · {q.difficulty}
                      </span>
                    </div>
                    <p
                      className="mt-1 line-clamp-2 text-[11px]"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {q.stem}
                    </p>
                  </button>

                  <div className="mt-2 pt-2 border-t flex items-center justify-end gap-1.5" style={{ borderColor: 'var(--border-subtle)' }}>
                    <button
                      type="button"
                      onClick={() => handleMove(idx, -1)}
                      disabled={idx === 0}
                      aria-label={`Soru ${q.number} yukarı taşı`}
                      className="btn-3d-secondary p-1.5 rounded-md cursor-pointer disabled:opacity-40"
                    >
                      <ArrowUp className="w-3 h-3" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(idx, 1)}
                      disabled={idx === questions.length - 1}
                      aria-label={`Soru ${q.number} aşağı taşı`}
                      className="btn-3d-secondary p-1.5 rounded-md cursor-pointer disabled:opacity-40"
                    >
                      <ArrowDown className="w-3 h-3" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicate(idx)}
                      aria-label={`Soru ${q.number} çoğalt`}
                      className="btn-3d-secondary p-1.5 rounded-md cursor-pointer"
                    >
                      <Copy className="w-3 h-3" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(idx)}
                      disabled={questions.length <= 1}
                      aria-label={`Soru ${q.number} sil`}
                      className="btn-3d-secondary p-1.5 rounded-md text-rose-600 cursor-pointer disabled:opacity-40"
                    >
                      <Trash2 className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Right: Active Question Detail Editor */}
        {activeQ && (
          <section className="lg:col-span-7 surface-card rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
              <div>
                <h3 className="text-base font-bold">
                  Soru #{activeQ.number} Düzenleme Formu
                </h3>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Değişiklikler anında cevap anahtarına, optik analize ve PDF kitapçığa yansır
                </p>
              </div>
              <button
                type="button"
                onClick={handleInjectNewGenContext}
                className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Yeni Nesil Bağlam Ekle</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Ders</span>
                <input
                  type="text"
                  value={activeQ.subject}
                  onChange={(e) => updateActiveQuestion({ subject: e.target.value })}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt"
                />
              </label>

              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Konu</span>
                <input
                  type="text"
                  value={activeQ.topic}
                  onChange={(e) => updateActiveQuestion({ topic: e.target.value })}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt"
                />
              </label>

              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Kazanım Kodu</span>
                <input
                  type="text"
                  value={activeQ.gainCode}
                  onChange={(e) => updateActiveQuestion({ gainCode: e.target.value })}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt font-mono-num"
                />
              </label>

              <label className="block text-xs font-semibold">
                <span style={{ color: 'var(--text-secondary)' }}>Zorluk Seviyesi</span>
                <select
                  value={activeQ.difficulty}
                  onChange={(e) =>
                    updateActiveQuestion({ difficulty: e.target.value as DifficultyLevel })
                  }
                  className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt"
                >
                  <option value="Kolay">Kolay</option>
                  <option value="Orta">Orta</option>
                  <option value="Zor">Zor</option>
                </select>
              </label>
            </div>

            <label className="block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Soru Kökü / Metni</span>
              <textarea
                rows={4}
                value={activeQ.stem}
                onChange={(e) => updateActiveQuestion({ stem: e.target.value })}
                className="mt-1 w-full rounded-lg p-3 text-sm surface-alt leading-relaxed"
              />
            </label>

            <div className="space-y-2.5">
              <div className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
                Seçenekler ve Doğru Cevap İşaretleme
              </div>
              {letters.map((letter) => {
                const isCorrect = activeQ.correctOption === letter;
                return (
                  <div key={letter} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateActiveQuestion({ correctOption: letter })}
                      aria-pressed={isCorrect}
                      aria-label={`${letter} şıkkını doğru cevap yap`}
                      className={`w-10 h-9 rounded-lg text-xs font-extrabold font-mono-num shrink-0 cursor-pointer ${
                        isCorrect ? 'btn-3d' : 'btn-3d-secondary'
                      }`}
                    >
                      {letter}
                    </button>
                    <input
                      type="text"
                      value={activeQ.options[letter] ?? ''}
                      onChange={(e) => updateActiveOption(letter, e.target.value)}
                      aria-label={`${letter} şıkkı metni`}
                      className="flex-1 rounded-lg px-3 py-2 text-xs surface-alt"
                    />
                  </div>
                );
              })}
            </div>

            <label className="block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Çözüm & Kazanım Açıklaması</span>
              <textarea
                rows={3}
                value={activeQ.explanation}
                onChange={(e) => updateActiveQuestion({ explanation: e.target.value })}
                className="mt-1 w-full rounded-lg p-3 text-xs surface-alt leading-relaxed"
              />
            </label>
          </section>
        )}
      </div>
    </div>
  );
}
