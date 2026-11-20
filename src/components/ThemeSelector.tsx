import { Palette, Check } from 'lucide-react';
import { ACADEMY_THEMES } from '../data/themes';
import { AcademyThemeId } from '../types/academy';

interface ThemeSelectorProps {
  activeThemeId: AcademyThemeId;
  onSelectTheme: (id: AcademyThemeId) => void;
}

export function ThemeSelector({ activeThemeId, onSelectTheme }: ThemeSelectorProps) {
  return (
    <section aria-labelledby="theme-picker-heading" className="surface-card rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <Palette className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
          <div>
            <h3 id="theme-picker-heading" className="text-base font-bold leading-tight">
              Akademi Sistemi Temaları (10 Tema)
            </h3>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Tüm panel, grafikler ve 3 boyutlu butonlar seçilen temaya anında uyum sağlar
            </p>
          </div>
        </div>
        <span className="text-xs font-mono-num" style={{ color: 'var(--text-secondary)' }}>
          {ACADEMY_THEMES.findIndex((t) => t.id === activeThemeId) + 1} / {ACADEMY_THEMES.length}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {ACADEMY_THEMES.map((theme) => {
          const isActive = theme.id === activeThemeId;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => onSelectTheme(theme.id)}
              aria-pressed={isActive}
              className={`text-left rounded-lg p-2.5 transition-all cursor-pointer border focus-visible:outline-2 focus-visible:outline-offset-2 ${
                isActive ? 'btn-3d' : 'btn-3d-secondary'
              }`}
              style={
                isActive
                  ? {
                      backgroundColor: 'var(--accent-primary)',
                      color: 'var(--accent-contrast)',
                    }
                  : undefined
              }
            >
              <div className="flex items-center justify-between gap-1.5 mb-2">
                <div className="flex items-center gap-1">
                  {theme.swatches.map((hex, i) => (
                    <span
                      key={i}
                      className="w-3.5 h-3.5 rounded-sm border border-black/15"
                      style={{ backgroundColor: hex }}
                      aria-hidden="true"
                    />
                  ))}
                </div>
                {isActive && <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
              </div>
              <div className="text-xs font-bold truncate">{theme.name}</div>
              <div
                className="text-[11px] truncate mt-0.5"
                style={{
                  color: isActive ? 'rgba(255,255,255,0.85)' : 'var(--text-secondary)',
                }}
              >
                {theme.mode === 'dark' ? 'Koyu Mod' : 'Açık Mod'}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
