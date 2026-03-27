/**
 * Core Opportunity OS record shape for v0.1 scaffolding.
 * This model is intentionally framework-agnostic so it can map to real storage later.
 */
export function createOpportunity(seed = {}) {
  const now = new Date().toISOString();

  return {
    id: seed.id || `opp-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
    user_id: seed.user_id || '',
    title: seed.title || '',
    type: seed.type || 'general',
    source_link: seed.source_link || '',
    contact: seed.contact || '',
    deadline: seed.deadline || '',
    status: seed.status || 'new',
    notes: seed.notes || '',
    tags: Array.isArray(seed.tags) ? seed.tags : [],
    archived: Boolean(seed.archived),
    created_at: seed.created_at || now,
    updated_at: seed.updated_at || now,
  };
}

const OPPORTUNITIES_STORAGE_KEY = 'opportunityOsOpportunities';

function getStorage(storage) {
  if (storage) {
    return storage;
  }

  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    return globalThis.localStorage;
  }

  return null;
}

function readAll(storage) {
  const targetStorage = getStorage(storage);
  if (!targetStorage) {
    return [];
  }

  const raw = targetStorage.getItem(OPPORTUNITIES_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(records, storage) {
  const targetStorage = getStorage(storage);
  if (!targetStorage) {
    return;
  }

  targetStorage.setItem(OPPORTUNITIES_STORAGE_KEY, JSON.stringify(records));
}

function asOpportunity(record) {
  return createOpportunity(record);
}

export function listOpportunitiesForUser(userId, { includeArchived = false, storage } = {}) {
  const all = readAll(storage)
    .map(asOpportunity)
    .filter((item) => item.user_id === userId);

  const filtered = includeArchived ? all : all.filter((item) => !item.archived);
  return filtered.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function createOpportunityForUser(userId, seed = {}, { storage } = {}) {
  const all = readAll(storage).map(asOpportunity);
  const next = createOpportunity({
    ...seed,
    user_id: userId,
    archived: false,
  });
  all.push(next);
  writeAll(all, storage);
  return next;
}

export function updateOpportunityForUser(userId, opportunityId, updates = {}, { storage } = {}) {
  const all = readAll(storage).map(asOpportunity);
  const now = new Date().toISOString();
  const updated = all.map((item) => {
    if (item.user_id !== userId || item.id !== opportunityId) {
      return item;
    }

    return createOpportunity({
      ...item,
      ...updates,
      user_id: userId,
      id: item.id,
      updated_at: now,
    });
  });
  writeAll(updated, storage);
  return updated.find((item) => item.user_id === userId && item.id === opportunityId) || null;
}

export function archiveOpportunityForUser(userId, opportunityId, { storage } = {}) {
  return updateOpportunityForUser(userId, opportunityId, { archived: true }, { storage });
}

export function deleteOpportunityForUser(userId, opportunityId, { storage } = {}) {
  const all = readAll(storage).map(asOpportunity);
  const next = all.filter((item) => !(item.user_id === userId && item.id === opportunityId));
  const removed = next.length !== all.length;
  if (removed) {
    writeAll(next, storage);
  }
  return removed;
}
