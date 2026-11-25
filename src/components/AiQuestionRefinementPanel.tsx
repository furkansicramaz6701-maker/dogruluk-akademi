import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CopyPlus,
  Loader2,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { ExamQuestion, GradeProfile } from '../types/academy';
import {
  QUESTION_REFINEMENT_PRESETS,
  QuestionRefinementMode,
  RefinedQuestionSuggestion,
  buildQuestionRefinementRequestPayload,
  normalizeRefinedQuestionResponse,
} from '../utils/questionRefinement';

interface AiQuestionRefinementPanelProps {
  question: ExamQuestion;
  gradeProfile: GradeProfile;
  onApplyRefinement: (refined: RefinedQuestionSuggestion['refinedQuestion']) => void;
  onInsertAsVariant: (refined: RefinedQuestionSuggestion['refinedQuestion']) => void;
}

export function AiQuestionRefinementPanel({
  question,
  gradeProfile,
  onApplyRefinement,
  onInsertAsVariant,
}: AiQuestionRefinementPanelProps) {
  const [selectedMode, setSelectedMode] = useState<QuestionRefinementMode>('harder');
  const [customInstruction, setCustomInstruction] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<RefinedQuestionSuggestion | null>(null);

  // Clear preview if user switches to a different question
  useEffect(() => {
    setSuggestion(null);
    setErrorMessage(null);
  }, [question.id]);

  const letters =
    gradeProfile.optionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];

  const handleRequestRefinement = async (modeOverride?: QuestionRefinementMode) => {
    const modeToUse = modeOverride ?? selectedMode;
    setSelectedMode(modeToUse);
    setLoading(true);
    setErrorMessage(null);

    try {
      const payload = buildQuestionRefinementRequestPayload({
        question,
        gradeProfile,
        mode: modeToUse,
        customInstruction,
      });

      const resp = await fetch('/api/questions/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(
          typeof data.error === 'string' && data.error.trim().length > 0
            ? data.error
            : `Gemini soru geliştirme yanıtı alınamadı (HTTP ${resp.status}).`
        );
      }

      const normalized = normalizeRefinedQuestionResponse(
        data.suggestion,
        question,
        gradeProfile.optionCount
      );
      setSuggestion(normalized);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Gemini AI soru varyasyonu oluşturulurken hata oluştu.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      data-testid="ai-question-refinement-panel"
      className="surface-alt rounded-xl p-4 space-y-3 border"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wand2
            className="w-4 h-4 shrink-0"
            style={{ color: 'var(--accent-primary)' }}
            aria-hidden="true"
          />
          <div>
            <div className="text-xs font-extrabold">
              Gemini AI Soru Geliştirme & Varyasyon Önerisi
            </div>
            <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              Seçili #{question.number}. soruyu tek tıkla zorlaştırın, bağlamını değiştirin veya yeni nesil forma uyarlayın.
            </div>
          </div>
        </div>

        <span className="text-[11px] font-mono-num font-bold" style={{ color: 'var(--accent-primary)' }}>
          {gradeProfile.shortLabel} · {gradeProfile.optionCount} Şık
        </span>
      </div>

      {/* Preset Action Buttons */}
      <div className="flex flex-wrap gap-1.5">
        {QUESTION_REFINEMENT_PRESETS.map((preset) => {
          const isActive = selectedMode === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              disabled={loading}
              data-testid={`refine-preset-${preset.id}`}
              onClick={() => handleRequestRefinement(preset.id)}
              title={preset.description}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                isActive ? 'btn-3d' : 'btn-3d-secondary'
              }`}
            >
              {loading && isActive ? (
                <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="w-3 h-3" aria-hidden="true" />
              )}
              <span>{preset.label}</span>
            </button>
          );
        })}
      </div>

      {/* Optional Custom Instruction + Submit */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={customInstruction}
          onChange={(e) => setCustomInstruction(e.target.value)}
          placeholder="Özel Gemini talimatı (ör. Sütun grafiği okumalı hale getir veya B şıkkını güçlendir)"
          aria-label="Özel AI soru geliştirme talimatı"
          data-testid="refine-custom-instruction-input"
          className="flex-1 min-w-[200px] rounded-lg px-3 py-1.5 text-xs surface-card border"
          style={{ borderColor: 'var(--border-subtle)' }}
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => handleRequestRefinement(customInstruction.trim() ? 'custom' : selectedMode)}
          data-testid="refine-generate-btn"
          className="btn-3d px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              <span>Gemini Hazırlıyor...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Varyasyon Öner</span>
            </>
          )}
        </button>
      </div>

      {errorMessage && (
        <div
          role="alert"
          data-testid="refine-error-banner"
          className="surface-card rounded-lg px-3 py-2.5 text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-start gap-2 border border-rose-500/30"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      {suggestion && (
        <div
          data-testid="refine-suggestion-preview"
          className="surface-card rounded-xl p-3.5 space-y-2.5 border"
          style={{ borderColor: 'var(--accent-primary)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-extrabold" style={{ color: 'var(--accent-primary)' }}>
              Önerilen Soru Varyasyonu ({suggestion.refinedQuestion.difficulty})
            </div>
            <div className="text-[11px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
              Doğru Cevap: <strong>{suggestion.refinedQuestion.correctOption}</strong>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {suggestion.summaryRationale}
          </p>

          <div className="text-xs font-semibold leading-relaxed surface-alt rounded-lg p-2.5">
            {suggestion.refinedQuestion.stem}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {letters.map((l) => {
              const isCorrect = suggestion.refinedQuestion.correctOption === l;
              return (
                <div
                  key={l}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] border ${
                    isCorrect
                      ? 'font-bold border-emerald-500/50 bg-emerald-500/10'
                      : 'surface-alt'
                  }`}
                  style={isCorrect ? undefined : { borderColor: 'var(--border-subtle)' }}
                >
                  <span className="font-mono-num font-bold mr-1.5">{l})</span>
                  <span>{suggestion.refinedQuestion.options[l]}</span>
                </div>
              );
            })}
          </div>

          <div className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            <strong>Çözüm Notu:</strong> {suggestion.refinedQuestion.explanation}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                onApplyRefinement(suggestion.refinedQuestion);
                setSuggestion(null);
              }}
              data-testid="refine-apply-btn"
              className="btn-3d px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Mevcut Soruya Uygula</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onInsertAsVariant(suggestion.refinedQuestion);
                setSuggestion(null);
              }}
              data-testid="refine-insert-variant-btn"
              className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <CopyPlus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Yeni Soru Olarak Ekle</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
