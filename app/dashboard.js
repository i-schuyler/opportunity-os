import { getMockSession, isMockAuthEnabled, signOut } from '../lib/auth-scaffold.js';
import {
  archiveOpportunityForUser,
  createOpportunityForUser,
  deleteOpportunityForUser,
  listOpportunitiesForUser,
  updateOpportunityForUser,
} from '../lib/opportunity-model.js';

const DASHBOARD_FILTERS_STORAGE_KEY = 'opportunityOsDashboardFilters';
const SORT_MODE_NEAREST_DEADLINE = 'deadline_nearest';
const SORT_MODE_RECENTLY_UPDATED = 'updated_recent';
const SORT_MODE_TITLE_AZ = 'title_az';
const DASHBOARD_SORT_MODES = new Set([
  SORT_MODE_NEAREST_DEADLINE,
  SORT_MODE_RECENTLY_UPDATED,
  SORT_MODE_TITLE_AZ,
]);
const DEFAULT_DASHBOARD_FILTERS = {
  view: 'active',
  status: 'all',
  sort: SORT_MODE_NEAREST_DEADLINE,
};

function withCurrentSearch(path, win = window) {
  return `${path}${win.location.search || ''}`;
}

function applyMockAuthFlagFromQuery(win) {
  const params = new URLSearchParams(win.location.search);
  win.OPPORTUNITY_OS_ENABLE_MOCK_AUTH = params.get('mockAuth') === '1';
}

function addMockModeBanner(doc) {
  const banner = doc.createElement('p');
  banner.className = 'mock-banner';
  banner.textContent = 'Mock auth mode is enabled for development.';
  doc.body.prepend(banner);
}

function parseTags(raw) {
  return String(raw || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function truncate(text, maxLength = 120) {
  const normalized = String(text || '').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function formatDate(value) {
  if (!value) {
    return 'No deadline';
  }
  return value;
}

function makeMeta(doc, label, value) {
  const line = doc.createElement('p');
  line.textContent = `${label}: ${value || '—'}`;
  return line;
}

function normalizeSafeSourceLink(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    return '';
  }

  return '';
}

export function normalizeDashboardFilters(rawFilters = {}) {
  const next = {
    ...DEFAULT_DASHBOARD_FILTERS,
  };

  if (rawFilters.view === 'active' || rawFilters.view === 'archived') {
    next.view = rawFilters.view;
  }

  if (typeof rawFilters.status === 'string') {
    const normalizedStatus = rawFilters.status.trim();
    if (normalizedStatus) {
      next.status = normalizedStatus;
    }
  }

  if (DASHBOARD_SORT_MODES.has(rawFilters.sort)) {
    next.sort = rawFilters.sort;
  }

  return next;
}

function readDashboardFilters(win) {
  if (!win || !win.sessionStorage) {
    return { ...DEFAULT_DASHBOARD_FILTERS };
  }

  const raw = win.sessionStorage.getItem(DASHBOARD_FILTERS_STORAGE_KEY);
  if (!raw) {
    return { ...DEFAULT_DASHBOARD_FILTERS };
  }

  try {
    return normalizeDashboardFilters(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_DASHBOARD_FILTERS };
  }
}

function persistDashboardFilters(win, filters) {
  if (!win || !win.sessionStorage) {
    return;
  }

  win.sessionStorage.setItem(DASHBOARD_FILTERS_STORAGE_KEY, JSON.stringify(normalizeDashboardFilters(filters)));
}

export function deriveStatusOptions(items = []) {
  const statuses = new Set();

  items.forEach((item) => {
    const value = String(item.status || '').trim();
    if (value) {
      statuses.add(value);
    }
  });

  return Array.from(statuses).sort((a, b) => a.localeCompare(b));
}

export function filterOpportunityItems(items = [], filters = DEFAULT_DASHBOARD_FILTERS) {
  const normalizedFilters = normalizeDashboardFilters(filters);

  return items.filter((item) => {
    const matchesArchivedState = normalizedFilters.view === 'archived' ? Boolean(item.archived) : !item.archived;
    if (!matchesArchivedState) {
      return false;
    }

    if (normalizedFilters.status === 'all') {
      return true;
    }

    return String(item.status || '').trim() === normalizedFilters.status;
  });
}

function normalizeTimestamp(value) {
  const parsed = Date.parse(String(value || '').trim());
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeDeadline(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return Number.POSITIVE_INFINITY;
  }

  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) {
    return Number.POSITIVE_INFINITY;
  }

  return parsed;
}

export function sortOpportunityItems(items = [], sortMode = SORT_MODE_NEAREST_DEADLINE) {
  const normalizedSortMode = DASHBOARD_SORT_MODES.has(sortMode)
    ? sortMode
    : SORT_MODE_NEAREST_DEADLINE;
  const nextItems = Array.from(items);

  if (normalizedSortMode === SORT_MODE_TITLE_AZ) {
    return nextItems.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' }));
  }

  if (normalizedSortMode === SORT_MODE_RECENTLY_UPDATED) {
    return nextItems.sort((a, b) => normalizeTimestamp(b.updated_at) - normalizeTimestamp(a.updated_at));
  }

  return nextItems.sort((a, b) => normalizeDeadline(a.deadline) - normalizeDeadline(b.deadline));
}

function getEmptyStateMessage(filters) {
  const normalizedFilters = normalizeDashboardFilters(filters);
  const isArchivedView = normalizedFilters.view === 'archived';
  const hasStatusFilter = normalizedFilters.status !== 'all';

  if (hasStatusFilter && isArchivedView) {
    return `No archived opportunities with status "${normalizedFilters.status}" yet.`;
  }

  if (hasStatusFilter) {
    return `No active opportunities with status "${normalizedFilters.status}" yet.`;
  }

  if (isArchivedView) {
    return 'No archived opportunities yet.';
  }

  return 'No active opportunities yet. Add one above to keep your next step visible and practical.';
}

function setFormFromOpportunity(form, item) {
  form.elements.id.value = item.id;
  form.elements.title.value = item.title;
  form.elements.type.value = item.type;
  form.elements.source_link.value = item.source_link;
  form.elements.contact.value = item.contact;
  form.elements.deadline.value = item.deadline;
  form.elements.status.value = item.status;
  form.elements.tags.value = item.tags.join(', ');
  form.elements.notes.value = item.notes;
}

function resetForm(form, cancelEditButton, saveButton) {
  form.reset();
  form.elements.id.value = '';
  if (cancelEditButton) {
    cancelEditButton.hidden = true;
  }
  if (saveButton) {
    saveButton.textContent = 'Save opportunity';
  }
}

function buildCard(item, doc) {
  const card = doc.createElement('article');
  card.className = 'opportunity-card';
  card.dataset.id = item.id;

  const header = doc.createElement('div');
  header.className = 'opportunity-card__header';

  const title = doc.createElement('h3');
  title.textContent = item.title || 'Untitled opportunity';

  const status = doc.createElement('span');
  status.className = 'meta';
  status.textContent = item.status || 'new';

  header.append(title, status);

  const meta = doc.createElement('div');
  meta.className = 'opportunity-card__meta';
  meta.append(
    makeMeta(doc, 'Type', item.type),
    makeMeta(doc, 'Contact', item.contact),
    makeMeta(doc, 'Deadline', formatDate(item.deadline))
  );

  const rawSourceLink = String(item.source_link || '').trim();
  const safeSourceLink = normalizeSafeSourceLink(rawSourceLink);
  if (rawSourceLink) {
    const source = doc.createElement('p');
    if (safeSourceLink) {
      const sourceLink = doc.createElement('a');
      sourceLink.href = safeSourceLink;
      sourceLink.textContent = 'Source link';
      sourceLink.target = '_blank';
      sourceLink.rel = 'noreferrer noopener';
      source.append('Source: ', sourceLink);
    } else {
      source.textContent = `Source: ${rawSourceLink}`;
    }
    meta.append(source);
  }

  const notes = doc.createElement('p');
  notes.className = 'opportunity-card__notes';
  notes.textContent = truncate(item.notes, 160) || 'No notes yet.';

  const tags = doc.createElement('div');
  tags.className = 'opportunity-card__tags';
  if (Array.isArray(item.tags) && item.tags.length > 0) {
    item.tags.forEach((tag) => {
      const tagNode = doc.createElement('span');
      tagNode.className = 'tag';
      tagNode.textContent = tag;
      tags.append(tagNode);
    });
  }

  const actions = doc.createElement('div');
  actions.className = 'opportunity-card__actions';

  const editButton = doc.createElement('button');
  editButton.type = 'button';
  editButton.className = 'button';
  editButton.dataset.action = 'edit';
  editButton.textContent = 'Edit';

  const archiveButton = doc.createElement('button');
  archiveButton.type = 'button';
  archiveButton.className = 'button';
  archiveButton.dataset.action = 'archive';
  archiveButton.textContent = item.archived ? 'Archived' : 'Archive';
  archiveButton.disabled = item.archived;

  const deleteButton = doc.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'button button--danger';
  deleteButton.dataset.action = 'delete';
  deleteButton.textContent = 'Delete';

  actions.append(editButton, archiveButton, deleteButton);
  card.append(header, meta, notes, tags, actions);
  return card;
}

export function initializeDashboard(win = window, doc = document) {
  applyMockAuthFlagFromQuery(win);
  const session = getMockSession();

  if (!session) {
    win.location.replace(withCurrentSearch('./auth.html', win));
    return;
  }

  if (isMockAuthEnabled()) {
    addMockModeBanner(doc);
  }

  const emailNode = doc.getElementById('session-email');
  const listNode = doc.getElementById('opportunity-list');
  const viewFilterNode = doc.getElementById('filter-view');
  const statusFilterNode = doc.getElementById('filter-status');
  const sortFilterNode = doc.getElementById('filter-sort');
  const summaryNode = doc.getElementById('filter-summary');
  const form = doc.getElementById('opportunity-form');
  const saveButton = doc.getElementById('save-opportunity-button');
  const cancelEditButton = doc.getElementById('cancel-edit-button');
  const signOutButton = doc.getElementById('sign-out-button');
  const filterState = readDashboardFilters(win);

  if (emailNode) {
    emailNode.textContent = `Signed in as ${session.email}`;
  }

  function renderList() {
    if (!listNode) {
      return;
    }

    const allItems = listOpportunitiesForUser(session.userId, { includeArchived: true });
    const activeCount = allItems.filter((item) => !item.archived).length;
    const archivedCount = allItems.length - activeCount;
    const statusOptions = deriveStatusOptions(allItems);

    if (statusFilterNode) {
      statusFilterNode.replaceChildren();
      const allOption = doc.createElement('option');
      allOption.value = 'all';
      allOption.textContent = 'All statuses';
      statusFilterNode.append(allOption);

      statusOptions.forEach((status) => {
        const option = doc.createElement('option');
        option.value = status;
        option.textContent = status;
        statusFilterNode.append(option);
      });

      if (!statusOptions.includes(filterState.status) && filterState.status !== 'all') {
        filterState.status = 'all';
        persistDashboardFilters(win, filterState);
      }

      statusFilterNode.value = filterState.status;
    }

    if (viewFilterNode) {
      viewFilterNode.value = filterState.view;
    }

    if (sortFilterNode) {
      sortFilterNode.value = filterState.sort;
    }

    const filteredItems = filterOpportunityItems(allItems, filterState);
    const sortedItems = sortOpportunityItems(filteredItems, filterState.sort);
    listNode.replaceChildren();

    if (summaryNode) {
      summaryNode.textContent = `Active: ${activeCount} | Archived: ${archivedCount} | Showing: ${sortedItems.length}`;
    }

    if (sortedItems.length === 0) {
      const emptyState = doc.createElement('p');
      emptyState.className = 'panel panel--muted empty-state';
      emptyState.textContent = getEmptyStateMessage(filterState);
      listNode.append(emptyState);
    } else {
      sortedItems.forEach((item) => {
        listNode.append(buildCard(item, doc));
      });
    }
  }

  renderList();

  if (viewFilterNode) {
    viewFilterNode.value = filterState.view;
    viewFilterNode.addEventListener('change', () => {
      filterState.view = viewFilterNode.value === 'archived' ? 'archived' : 'active';
      persistDashboardFilters(win, filterState);
      renderList();
    });
  }

  if (statusFilterNode) {
    statusFilterNode.addEventListener('change', () => {
      filterState.status = statusFilterNode.value || 'all';
      persistDashboardFilters(win, filterState);
      renderList();
    });
  }

  if (sortFilterNode) {
    sortFilterNode.addEventListener('change', () => {
      filterState.sort = DASHBOARD_SORT_MODES.has(sortFilterNode.value)
        ? sortFilterNode.value
        : SORT_MODE_NEAREST_DEADLINE;
      persistDashboardFilters(win, filterState);
      renderList();
    });
  }

  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();

      const formData = new FormData(form);
      const id = String(formData.get('id') || '');
      const payload = {
        title: String(formData.get('title') || '').trim(),
        type: String(formData.get('type') || '').trim() || 'general',
        source_link: String(formData.get('source_link') || '').trim(),
        contact: String(formData.get('contact') || '').trim(),
        deadline: String(formData.get('deadline') || '').trim(),
        status: String(formData.get('status') || '').trim() || 'new',
        notes: String(formData.get('notes') || '').trim(),
        tags: parseTags(formData.get('tags')),
      };

      if (!payload.title) {
        return;
      }

      if (id) {
        updateOpportunityForUser(session.userId, id, payload);
      } else {
        createOpportunityForUser(session.userId, payload);
      }

      resetForm(form, cancelEditButton, saveButton);
      renderList();
    });
  }

  if (cancelEditButton && form) {
    cancelEditButton.addEventListener('click', () => {
      resetForm(form, cancelEditButton, saveButton);
    });
  }

  function attachActionHandler(target) {
    if (!target) {
      return;
    }
    target.addEventListener('click', (event) => {
      const actionNode = event.target.closest('button[data-action]');
      const card = event.target.closest('[data-id]');
      if (!actionNode || !card) {
        return;
      }

      const id = card.dataset.id;
      const action = actionNode.dataset.action;
      if (!id || !action) {
        return;
      }

      if (action === 'delete') {
        deleteOpportunityForUser(session.userId, id);
        if (form && form.elements.id.value === id) {
          resetForm(form, cancelEditButton, saveButton);
        }
        renderList();
        return;
      }

      if (action === 'archive') {
        archiveOpportunityForUser(session.userId, id);
        if (form && form.elements.id.value === id) {
          resetForm(form, cancelEditButton, saveButton);
        }
        renderList();
        return;
      }

      if (action === 'edit' && form) {
        const editable = listOpportunitiesForUser(session.userId, { includeArchived: true }).find((item) => item.id === id);
        if (!editable) {
          return;
        }
        setFormFromOpportunity(form, editable);
        if (cancelEditButton) {
          cancelEditButton.hidden = false;
        }
        if (saveButton) {
          saveButton.textContent = 'Update opportunity';
        }
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  attachActionHandler(listNode);

  if (signOutButton) {
    signOutButton.addEventListener('click', () => {
      signOut();
      win.location.assign(withCurrentSearch('./auth.html', win));
    });
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  initializeDashboard(window, document);
}
