import {
  Atom,
  BookOpen,
  Compass,
  GraduationCap,
  PenTool,
  Trophy,
} from 'lucide-react';

interface Education3DCascadeProps {
  enabled: boolean;
}

const CASCADE_ITEMS = [
  { id: 'c1', left: '6%', duration: '15s', delay: '-2s', kind: 'cube', label: '3D', accent: '#1d4ed8' },
  { id: 'c2', left: '16%', duration: '19s', delay: '-8s', kind: 'icon', icon: GraduationCap, accent: '#0f766e' },
  { id: 'c3', left: '28%', duration: '17s', delay: '-4s', kind: 'formula', label: '∑ f(x)', accent: '#b45309' },
  { id: 'c4', left: '42%', duration: '21s', delay: '-11s', kind: 'cube', label: 'MEB', accent: '#6d28d9' },
  { id: 'c5', left: '54%', duration: '16s', delay: '-6s', kind: 'formula', label: '∫ dx', accent: '#be123c' },
  { id: 'c6', left: '67%', duration: '20s', delay: '-14s', kind: 'icon', icon: Atom, accent: '#0284c7' },
  { id: 'c7', left: '78%', duration: '18s', delay: '-3s', kind: 'cube', label: 'π', accent: '#0f766e' },
  { id: 'c8', left: '89%', duration: '16.5s', delay: '-9s', kind: 'icon', icon: Compass, accent: '#1d4ed8' },
  { id: 'c9', left: '22%', duration: '22s', delay: '-15s', kind: 'icon', icon: PenTool, accent: '#b45309' },
  { id: 'c10', left: '61%', duration: '19.5s', delay: '-1s', kind: 'icon', icon: Trophy, accent: '#d97706' },
  { id: 'c11', left: '94%', duration: '21.5s', delay: '-12s', kind: 'icon', icon: BookOpen, accent: '#4338ca' },
] as const;

export function Education3DCascade({ enabled }: Education3DCascadeProps) {
  if (!enabled) return null;

  return (
    <div
      aria-hidden="true"
      data-testid="education-3d-cascade"
      className="fixed inset-0 pointer-events-none overflow-hidden z-10 perspective-stage"
    >
      {CASCADE_ITEMS.map((item) => (
        <div
          key={item.id}
          className="edu-cascade-item absolute -top-16"
          style={{
            left: item.left,
            animationDuration: item.duration,
            animationDelay: item.delay,
            transformStyle: 'preserve-3d',
          }}
        >
          {item.kind === 'cube' ? (
            <div
              className="square-3d-spin relative w-10 h-10 select-none"
              style={{ opacity: 0.24 }}
            >
              <div
                className="absolute inset-0 rounded-lg flex items-center justify-center text-white font-display font-extrabold text-[11px]"
                style={{
                  transform: 'translateZ(18px)',
                  background: `linear-gradient(145deg, ${item.accent}, rgba(15, 23, 42, 0.9))`,
                  border: '1px solid rgba(255,255,255,0.45)',
                }}
              >
                {item.label}
              </div>
              <div
                className="absolute inset-0 rounded-lg"
                style={{
                  transform: 'rotateY(90deg) translateZ(18px)',
                  backgroundColor: item.accent,
                  border: '1px solid rgba(255,255,255,0.3)',
                }}
              />
              <div
                className="absolute inset-0 rounded-lg"
                style={{
                  transform: 'rotateX(90deg) translateZ(18px)',
                  backgroundColor: '#0f172a',
                  border: '1px solid rgba(255,255,255,0.3)',
                }}
              />
            </div>
          ) : (
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-display font-extrabold text-xs select-none"
              style={{
                background: `linear-gradient(145deg, ${item.accent}, rgba(15, 23, 42, 0.88))`,
                opacity: 0.22,
                border: '1px solid rgba(255,255,255,0.38)',
                boxShadow:
                  '4px 6px 0 rgba(15, 23, 42, 0.25), 0 10px 20px rgba(15, 23, 42, 0.16)',
              }}
            >
              {item.kind === 'icon' ? (
                <item.icon className="w-5 h-5" />
              ) : (
                <span>{item.label}</span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
