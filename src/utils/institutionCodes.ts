import {
  AllowedScopeId,
  AppPermissionKey,
  GradeLevelId,
  GradeProfile,
  Institution,
  InstitutionPermissions,
  InstitutionRole,
  StudentRecord,
} from '../types/academy';

function hashString32(input: string): number {
  let h = 2166136261;
  const normalized = input.trim().toLocaleUpperCase('tr-TR');
  for (let i = 0; i < normalized.length; i++) {
    h ^= normalized.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Generates an 8-digit unique Institution Code (10000000 - 99999999)
 */
export function generate8DigitInstitutionCode(
  institutionName: string,
  existingCodes: Set<string> = new Set()
): string {
  const clean = institutionName.trim() || 'Doğruluk Akademi';
  let seed = hashString32(clean);
  for (let attempt = 0; attempt < 50; attempt++) {
    const num = 10000000 + ((seed + attempt * 7919) % 89999999);
    const code = String(num).padStart(8, '0');
    if (!existingCodes.has(code)) {
      return code;
    }
    seed = hashString32(`${clean}-${attempt}`);
  }
  return String(10000000 + (Date.now() % 89999999));
}

/**
 * Generates an 8-digit Student Number bound to the selected Institution's 8-digit code and student's full name.
 * First 2 digits link to the institution prefix; remaining 6 digits uniquely derive from student name.
 */
export function generate8DigitStudentNumber(
  fullName: string,
  institutionCode8: string,
  existingNumbers: Set<string> = new Set()
): string {
  const prefix = institutionCode8.replace(/\D/g, '').slice(0, 2).padStart(2, '4');
  const cleanName = fullName.trim() || 'Öğrenci';
  let seed = hashString32(`${institutionCode8}::${cleanName}`);
  for (let attempt = 0; attempt < 50; attempt++) {
    const suffix = String((seed + attempt * 104729) % 1000000).padStart(6, '0');
    const candidate = `${prefix}${suffix}`;
    if (!existingNumbers.has(candidate)) {
      return candidate;
    }
    seed = hashString32(`${institutionCode8}::${cleanName}-${attempt}`);
  }
  return `${prefix}${String(Date.now() % 1000000).padStart(6, '0')}`;
}

export function createDefaultPermissions(
  role: InstitutionRole = 'Kurum Yöneticisi',
  allowedScopes: AllowedScopeId[] = ['ilkokul', 'ortaokul', 'lise', 'yks']
): InstitutionPermissions {
  const isViewer = role === 'Görüntüleyici';
  return {
    status: 'Aktif',
    role,
    maxStudents: 500,
    allowedScopes,
    modules: {
      omrOkuma: !isViewer,
      denemeUretici: !isViewer,
      dinamikKaynak: !isViewer,
      denemeEditoru: role === 'Kurum Yöneticisi' || role === 'Ölçme Uzmanı' || role === 'Öğretmen',
      egitimTakvimi: !isViewer,
      karnePdf: true,
      excelAktarim: role !== 'Görüntüleyici',
      afis3D: role !== 'Görüntüleyici',
    },
  };
}

export const DEFAULT_INSTITUTION_PASSWORD = '123456';

export function normalizeInstitution(inst: Institution): Institution {
  return {
    ...inst,
    accessPassword: inst.accessPassword?.trim() || DEFAULT_INSTITUTION_PASSWORD,
    permissions: inst.permissions ?? createDefaultPermissions(),
  };
}

export function authenticateInstitution(
  list: Institution[],
  code8Raw: string,
  passwordRaw: string
): { ok: boolean; institution?: Institution; reason?: string } {
  const cleanCode = code8Raw.replace(/\D/g, '').slice(0, 8);
  const cleanPass = passwordRaw.trim();
  if (cleanCode.length !== 8) {
    return { ok: false, reason: 'Lütfen 8 haneli geçerli bir Kurum Kodu girin.' };
  }
  if (!cleanPass) {
    return { ok: false, reason: 'Lütfen Kurum Şifresini girin (Önizleme için varsayılan: 123456).' };
  }
  const found = list.find((item) => item.code8 === cleanCode);
  if (!found) {
    return {
      ok: false,
      reason: `${cleanCode} koduna kayıtlı bir kurum bulunamadı. Aşağıdan yeni kurum oluşturabilir veya listeden seçebilirsiniz.`,
    };
  }
  const normalized = normalizeInstitution(found);
  const expected = normalized.accessPassword || DEFAULT_INSTITUTION_PASSWORD;
  if (cleanPass !== expected) {
    return {
      ok: false,
      reason: `${normalized.name} için girdiğiniz kurum şifresi hatalı. (Önizleme şifresi: ${expected})`,
    };
  }
  if (normalized.permissions?.status === 'Askıda') {
    return {
      ok: false,
      reason: `${normalized.name} kurum lisansı askıda. Kurum Yetki Panelinden aktifleştirebilirsiniz.`,
    };
  }
  return { ok: true, institution: normalized };
}

export function categoryToScopeId(category: GradeProfile['category']): AllowedScopeId {
  switch (category) {
    case 'İlkokul':
      return 'ilkokul';
    case 'Ortaokul & LGS':
      return 'ortaokul';
    case 'Lise':
      return 'lise';
    case 'Üniversite Hazırlık (YKS)':
      return 'yks';
  }
}

export function filterGradeProfilesByInstitution(
  profiles: GradeProfile[],
  inst: Institution
): GradeProfile[] {
  const scopes = inst.permissions?.allowedScopes;
  if (!scopes || scopes.length === 0) return profiles;
  const allowed = new Set(scopes);
  const filtered = profiles.filter((p) => allowed.has(categoryToScopeId(p.category)));
  return filtered.length > 0 ? filtered : profiles;
}

export function canInstitutionUseModule(
  inst: Institution,
  key: AppPermissionKey
): { allowed: boolean; reason?: string } {
  const perms = inst.permissions ?? createDefaultPermissions();
  if (perms.status === 'Askıda') {
    return {
      allowed: false,
      reason: `${inst.name} kurum lisansı askıda. Kurum Yetki Paneli'nden aktifleştirin.`,
    };
  }
  if (!perms.modules[key]) {
    return {
      allowed: false,
      reason: `Bu işlem "${perms.role}" yetkisi veya kurum modül izinleri kapsamında kapalı.`,
    };
  }
  return { allowed: true };
}

export function isGradeAllowedForInstitution(
  inst: Institution,
  gradeId: GradeLevelId,
  profiles: GradeProfile[]
): boolean {
  const target = profiles.find((p) => p.id === gradeId);
  if (!target) return false;
  const scopes = inst.permissions?.allowedScopes;
  if (!scopes || scopes.length === 0) return true;
  return scopes.includes(categoryToScopeId(target.category));
}

export function normalizeInstitutionKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
}

export function upsertInstitutionList(
  list: Institution[],
  candidate: Institution
): {
  institutions: Institution[];
  saved: Institution;
  wasDuplicate: boolean;
} {
  const normalized = normalizeInstitution(candidate);
  const candidateNameKey = normalizeInstitutionKey(normalized.name);
  const existingIdx = list.findIndex(
    (item) =>
      item.id === normalized.id ||
      item.code8 === normalized.code8 ||
      (candidateNameKey.length > 0 && normalizeInstitutionKey(item.name) === candidateNameKey)
  );

  if (existingIdx !== -1) {
    const existing = normalizeInstitution(list[existingIdx]);
    const merged: Institution = {
      ...existing,
      name: normalized.name.trim() || existing.name,
      city: normalized.city.trim() || existing.city,
      accessPassword:
        candidate.accessPassword?.trim() || existing.accessPassword || DEFAULT_INSTITUTION_PASSWORD,
      permissions: existing.permissions ?? normalized.permissions,
    };
    const nextList = list.map((item, idx) => (idx === existingIdx ? merged : item));
    return {
      institutions: nextList,
      saved: merged,
      wasDuplicate: true,
    };
  }

  return {
    institutions: [normalized, ...list],
    saved: normalized,
    wasDuplicate: false,
  };
}

export function bulkUpsertInstitutions(
  list: Institution[],
  incoming: Institution[]
): {
  institutions: Institution[];
  addedCount: number;
  updatedCount: number;
  firstAffected: Institution | null;
} {
  let current = [...list];
  let addedCount = 0;
  let updatedCount = 0;
  let firstAffected: Institution | null = null;

  for (const raw of incoming) {
    const res = upsertInstitutionList(current, raw);
    current = res.institutions;
    if (res.wasDuplicate) {
      updatedCount += 1;
    } else {
      addedCount += 1;
    }
    if (!firstAffected) {
      firstAffected = res.saved;
    }
  }

  return {
    institutions: current,
    addedCount,
    updatedCount,
    firstAffected,
  };
}

export function updateInstitutionRecord(
  list: Institution[],
  institutionId: string,
  patch: { name?: string; city?: string; accessPassword?: string }
): {
  ok: boolean;
  institutions: Institution[];
  updated?: Institution;
  reason?: string;
} {
  const target = list.find((i) => i.id === institutionId);
  if (!target) {
    return { ok: false, institutions: list, reason: 'Güncellenecek kurum bulunamadı.' };
  }
  const nextName = (patch.name ?? target.name).trim();
  const nextCity = (patch.city ?? target.city).trim() || 'Türkiye';
  const nextPassword =
    patch.accessPassword !== undefined
      ? patch.accessPassword.trim() || target.accessPassword || DEFAULT_INSTITUTION_PASSWORD
      : target.accessPassword || DEFAULT_INSTITUTION_PASSWORD;
  if (!nextName) {
    return { ok: false, institutions: list, reason: 'Kurum adı boş bırakılamaz.' };
  }
  const nextKey = normalizeInstitutionKey(nextName);
  const duplicate = list.find(
    (other) => other.id !== institutionId && normalizeInstitutionKey(other.name) === nextKey
  );
  if (duplicate) {
    return {
      ok: false,
      institutions: list,
      reason: `"${duplicate.name}" (${duplicate.code8}) adlı kurum zaten kayıtlı. İki aynı kurum oluşturulamaz.`,
    };
  }

  const updated: Institution = {
    ...normalizeInstitution(target),
    name: nextName,
    city: nextCity,
    accessPassword: nextPassword,
  };
  return {
    ok: true,
    institutions: list.map((item) => (item.id === institutionId ? updated : item)),
    updated,
  };
}

export function deleteInstitutionSafely(
  list: Institution[],
  institutionId: string,
  activeInstitutionId: string
): {
  ok: boolean;
  institutions: Institution[];
  nextActiveInstitution: Institution | null;
  deletedInstitution?: Institution;
  reason?: string;
} {
  if (list.length <= 1) {
    return {
      ok: false,
      institutions: list,
      nextActiveInstitution: list[0] ?? null,
      reason: 'Sistemde en az bir aktif kurum bulunmalıdır; son kurum silinemez.',
    };
  }
  const target = list.find((i) => i.id === institutionId);
  if (!target) {
    return {
      ok: false,
      institutions: list,
      nextActiveInstitution: list.find((i) => i.id === activeInstitutionId) ?? list[0] ?? null,
      reason: 'Silinecek kurum bulunamadı.',
    };
  }
  const nextList = list.filter((i) => i.id !== institutionId);
  const nextActive =
    institutionId === activeInstitutionId
      ? nextList[0] ?? null
      : nextList.find((i) => i.id === activeInstitutionId) ?? nextList[0] ?? null;

  return {
    ok: true,
    institutions: nextList,
    nextActiveInstitution: nextActive,
    deletedInstitution: target,
  };
}

export const DEFAULT_INSTITUTIONS: Institution[] = [
  {
    id: 'inst-dogruluk-merkez',
    name: 'Doğruluk Akademi Merkez',
    code8: generate8DigitInstitutionCode('Doğruluk Akademi Merkez'),
    city: 'İstanbul',
    createdAt: '2026-01-15',
    accessPassword: DEFAULT_INSTITUTION_PASSWORD,
    permissions: createDefaultPermissions('Kurum Yöneticisi', ['ilkokul', 'ortaokul', 'lise', 'yks']),
  },
  {
    id: 'inst-anadolu-fen',
    name: 'Anadolu İlköğretim & LGS Kurumu',
    code8: generate8DigitInstitutionCode('Anadolu İlköğretim & LGS Kurumu'),
    city: 'Ankara',
    createdAt: '2026-02-10',
    accessPassword: DEFAULT_INSTITUTION_PASSWORD,
    permissions: createDefaultPermissions('Ölçme Uzmanı', ['ilkokul', 'ortaokul']),
  },
  {
    id: 'inst-bogazici-yks',
    name: 'Boğaziçi YKS Hazırlık Akademisi',
    code8: generate8DigitInstitutionCode('Boğaziçi YKS Hazırlık Akademisi'),
    city: 'İzmir',
    createdAt: '2026-03-04',
    accessPassword: DEFAULT_INSTITUTION_PASSWORD,
    permissions: createDefaultPermissions('Öğretmen', ['lise', 'yks']),
  },
];

export const DEFAULT_STUDENTS: StudentRecord[] = [
  {
    id: 'stu-kerem-5',
    fullName: 'Kerem Demir',
    studentNumber8: generate8DigitStudentNumber(
      'Kerem Demir',
      DEFAULT_INSTITUTIONS[0].code8
    ),
    institutionId: DEFAULT_INSTITUTIONS[0].id,
    institutionCode8: DEFAULT_INSTITUTIONS[0].code8,
    institutionName: DEFAULT_INSTITUTIONS[0].name,
    classroom: '5-A',
    gradeId: '5',
    createdAt: '2026-09-01',
  },
  {
    id: 'stu-zeynep',
    fullName: 'Zeynep Kaya',
    studentNumber8: generate8DigitStudentNumber(
      'Zeynep Kaya',
      DEFAULT_INSTITUTIONS[0].code8
    ),
    institutionId: DEFAULT_INSTITUTIONS[0].id,
    institutionCode8: DEFAULT_INSTITUTIONS[0].code8,
    institutionName: DEFAULT_INSTITUTIONS[0].name,
    classroom: '8-A LGS',
    gradeId: '8',
    createdAt: '2026-09-02',
  },
  {
    id: 'stu-ahmet',
    fullName: 'Ahmet Yılmaz',
    studentNumber8: generate8DigitStudentNumber(
      'Ahmet Yılmaz',
      DEFAULT_INSTITUTIONS[2].code8
    ),
    institutionId: DEFAULT_INSTITUTIONS[2].id,
    institutionCode8: DEFAULT_INSTITUTIONS[2].code8,
    institutionName: DEFAULT_INSTITUTIONS[2].name,
    classroom: '12-A TYT',
    gradeId: 'TYT',
    createdAt: '2026-09-03',
  },
  {
    id: 'stu-elif-3',
    fullName: 'Elif Aydın',
    studentNumber8: generate8DigitStudentNumber(
      'Elif Aydın',
      DEFAULT_INSTITUTIONS[1].code8
    ),
    institutionId: DEFAULT_INSTITUTIONS[1].id,
    institutionCode8: DEFAULT_INSTITUTIONS[1].code8,
    institutionName: DEFAULT_INSTITUTIONS[1].name,
    classroom: '3-A',
    gradeId: '3',
    createdAt: '2026-09-05',
  },
];
