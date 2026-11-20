import { GradeLevelId } from '../types/academy';

const VALID_GRADE_IDS: ReadonlySet<string> = new Set([
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  'TYT',
  'AYT',
]);

export interface DigitalKarneUrlParams {
  baseUrl?: string;
  institutionCode8: string;
  studentNumber?: string;
  studentName?: string;
  classroom?: string;
  gradeId: GradeLevelId;
  isSampleDemo?: boolean;
}

export interface ParsedDigitalKarneQuery {
  isDigitalKarneDeepLink: boolean;
  tab: 'reports' | null;
  institutionCode8?: string;
  studentNumber8?: string;
  studentName?: string;
  classroom?: string;
  gradeId?: GradeLevelId;
  isSampleDemo: boolean;
}

export function resolveDefaultDigitalKarneBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    const pathname = window.location.pathname || '/';
    return `${window.location.origin}${pathname === '/' ? '' : pathname}`.replace(/\/+$/, '');
  }
  return 'https://dogruluk-akademi.vercel.app';
}

export function normalizeDigitalKarneBaseUrl(rawBaseUrl?: string): string {
  const trimmed = (rawBaseUrl || '').trim();
  if (!trimmed) {
    return resolveDefaultDigitalKarneBaseUrl();
  }
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    const cleanPath = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
    return `${parsed.origin}${cleanPath}`;
  } catch {
    return resolveDefaultDigitalKarneBaseUrl();
  }
}

export function buildStudentDigitalKarneUrl(params: DigitalKarneUrlParams): string {
  const cleanBase = normalizeDigitalKarneBaseUrl(params.baseUrl);
  const query = new URLSearchParams();
  query.set('autostart', '1');
  query.set('tab', 'reports');

  const cleanInst = (params.institutionCode8 || '').trim();
  if (cleanInst) {
    query.set('inst', cleanInst);
  }

  query.set('grade', params.gradeId);

  const cleanStu = (params.studentNumber || '').trim();
  if (cleanStu) {
    query.set('stu', cleanStu);
  }

  const cleanName = (params.studentName || '').trim();
  if (cleanName) {
    query.set('name', cleanName);
  }

  const cleanClassroom = (params.classroom || '').trim();
  if (cleanClassroom) {
    query.set('cls', cleanClassroom);
  }

  if (params.isSampleDemo) {
    query.set('sample', '1');
  }

  return `${cleanBase}/?${query.toString()}`;
}

export function formatShortDigitalKarneHost(fullUrl: string): string {
  try {
    const parsed = new URL(fullUrl);
    return parsed.host;
  } catch {
    return 'dogruluk-akademi';
  }
}

export function parseDigitalKarneQuery(search: string): ParsedDigitalKarneQuery {
  try {
    const raw = search.startsWith('?') ? search.slice(1) : search;
    const params = new URLSearchParams(raw);
    const tab = params.get('tab');
    const inst = (params.get('inst') || '').trim() || undefined;
    const stu = (params.get('stu') || '').trim() || undefined;
    const name = (params.get('name') || '').trim() || undefined;
    const cls = (params.get('cls') || '').trim() || undefined;
    const rawGrade = (params.get('grade') || '').trim();
    const gradeId = VALID_GRADE_IDS.has(rawGrade)
      ? (rawGrade as GradeLevelId)
      : undefined;
    const isSampleDemo = params.get('sample') === '1';

    const isDigitalKarneDeepLink =
      tab === 'reports' && Boolean(stu || inst || name || isSampleDemo);

    return {
      isDigitalKarneDeepLink,
      tab: tab === 'reports' ? 'reports' : null,
      institutionCode8: inst,
      studentNumber8: stu,
      studentName: name,
      classroom: cls,
      gradeId,
      isSampleDemo,
    };
  } catch {
    return {
      isDigitalKarneDeepLink: false,
      tab: null,
      isSampleDemo: false,
    };
  }
}
