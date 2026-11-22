import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_INSTITUTIONS,
  bulkUpsertInstitutions,
  deleteInstitutionSafely,
  normalizeInstitutionKey,
  updateInstitutionRecord,
  upsertInstitutionList,
} from './institutionCodes';

test('institution deduplication prevents creating two institutions with same name or code', () => {
  assert.equal(normalizeInstitutionKey('  Doğruluk   Akademi  Merkez '), 'doğruluk akademi merkez');

  const firstAdd = upsertInstitutionList(DEFAULT_INSTITUTIONS, {
    id: 'inst-dup-1',
    name: '  doğruluk akademi merkez ',
    code8: '99998888',
    city: 'Bursa',
    createdAt: '2026-11-18',
  });
  assert.equal(firstAdd.wasDuplicate, true);
  assert.equal(firstAdd.institutions.length, DEFAULT_INSTITUTIONS.length);
  assert.equal(firstAdd.saved.id, DEFAULT_INSTITUTIONS[0].id);
  assert.equal(firstAdd.saved.city, 'Bursa');

  const uniqueAdd = upsertInstitutionList(DEFAULT_INSTITUTIONS, {
    id: 'inst-new-1',
    name: 'Bilgi Çınarı Koleji',
    code8: '55443322',
    city: 'Antalya',
    createdAt: '2026-11-18',
  });
  assert.equal(uniqueAdd.wasDuplicate, false);
  assert.equal(uniqueAdd.institutions.length, DEFAULT_INSTITUTIONS.length + 1);

  const bulk = bulkUpsertInstitutions(DEFAULT_INSTITUTIONS, [
    {
      id: 'inst-bulk-dup',
      name: 'Doğruluk Akademi Merkez',
      code8: '11112222',
      city: 'İstanbul',
      createdAt: '2026-11-18',
    },
    {
      id: 'inst-bulk-new',
      name: 'Ege Fen Kursu',
      code8: '33445566',
      city: 'İzmir',
      createdAt: '2026-11-18',
    },
  ]);
  assert.equal(bulk.updatedCount, 1);
  assert.equal(bulk.addedCount, 1);
  assert.equal(bulk.institutions.length, DEFAULT_INSTITUTIONS.length + 1);
});

test('updateInstitutionRecord updates name/city and prevents renaming to an existing institution name', () => {
  const conflict = updateInstitutionRecord(DEFAULT_INSTITUTIONS, DEFAULT_INSTITUTIONS[0].id, {
    name: DEFAULT_INSTITUTIONS[1].name,
    city: 'Ankara',
  });
  assert.equal(conflict.ok, false);

  const valid = updateInstitutionRecord(DEFAULT_INSTITUTIONS, DEFAULT_INSTITUTIONS[0].id, {
    name: 'Doğruluk Akademi VIP Kampüs',
    city: 'Kocaeli',
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.updated?.name, 'Doğruluk Akademi VIP Kampüs');
  assert.equal(valid.updated?.city, 'Kocaeli');
});

test('deleteInstitutionSafely deletes non-last institution cleanly and blocks deleting the last one', () => {
  const deletedActive = deleteInstitutionSafely(
    DEFAULT_INSTITUTIONS,
    DEFAULT_INSTITUTIONS[0].id,
    DEFAULT_INSTITUTIONS[0].id
  );
  assert.equal(deletedActive.ok, true);
  assert.equal(deletedActive.institutions.length, DEFAULT_INSTITUTIONS.length - 1);
  assert.equal(deletedActive.nextActiveInstitution?.id, DEFAULT_INSTITUTIONS[1].id);

  const onlyOne = [DEFAULT_INSTITUTIONS[0]];
  const blocked = deleteInstitutionSafely(onlyOne, onlyOne[0].id, onlyOne[0].id);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.institutions.length, 1);
});

import {
  ADMIN_PRIMARY_INSTITUTION_ID,
  isDogrulukAcademyInstitution,
  resolvePrimaryAdminInstitution,
} from './institutionCodes';

test('resolvePrimaryAdminInstitution always selects Doğruluk Akademi over third-party schools', () => {
  const customFirst = [
    {
      id: 'inst-custom-external',
      name: 'Örnek Dış Okul',
      code8: '91234567',
      city: 'Ankara',
      createdAt: '2026-11-20',
    },
    ...DEFAULT_INSTITUTIONS,
  ];
  const resolved = resolvePrimaryAdminInstitution(customFirst);
  assert.equal(resolved.id, ADMIN_PRIMARY_INSTITUTION_ID);
  assert.equal(resolved.name, 'Doğruluk Akademi Merkez');
  assert.equal(isDogrulukAcademyInstitution(resolved), true);
  assert.equal(isDogrulukAcademyInstitution(customFirst[0]), false);

  const fallback = resolvePrimaryAdminInstitution([customFirst[0]]);
  assert.equal(fallback.id, ADMIN_PRIMARY_INSTITUTION_ID);
  assert.equal(fallback.name, 'Doğruluk Akademi Merkez');
});
