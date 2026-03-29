import { getMockSession, isMockAuthEnabled, signOut } from '../lib/auth-scaffold.js';
import {
  archiveOpportunityForUser,
  createOpportunityForUser,
  deleteOpportunityForUser,
  listOpportunitiesForUser,
  updateOpportunityForUser,
} from '../lib/opportunity-model.js';

const DASHBOARD_FILTERS_STORAGE_KEY = 'opportunityOsDashboardFilters';
const EXPORT_FILENAME_PREFIX = 'opportunity-os-opportunities';
const SORT_MODE_NEAREST_DEADLINE = 'deadline_nearest';
const SORT_MODE_RECENTLY_UPDATED = 'updated_recent';
const SORT_MODE_TITLE_AZ = 'title_az';
const DASHBOARD_SORT_MODES = new Set([
  SORT_MODE_NEAREST_DEADLINE,
  SORT_MODE_RECENTLY_UPDATED,
  SORT_MODE_TITLE_AZ,
]);
const QUICK_STATUS_VALUES = ['new', 'in progress', 'waiting', 'done'];
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const NOTES_PREVIEW_MAX_LENGTH = 140;
const SAMPLE_DATA_DEADLINE_SOON_DAYS = 3;
const SAMPLE_DATA_DEADLINE_UPCOMING_DAYS = 21;
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

function normalizeTransferTags(rawTags) {
  if (!Array.isArray(rawTags)) {
    return [];
  }

  return rawTags
    .map((tag) => String(tag || '').trim())
    .filter(Boolean);
}

function normalizeTransferOpportunity(seed = {}) {
  return {
    id: String(seed.id || '').trim(),
    title: String(seed.title || '').trim(),
    type: String(seed.type || '').trim() || 'general',
    source_link: String(seed.source_link || '').trim(),
    contact: String(seed.contact || '').trim(),
    deadline: String(seed.deadline || '').trim(),
    status: String(seed.status || '').trim() || 'new',
    tags: normalizeTransferTags(seed.tags),
    notes: String(seed.notes || '').trim(),
    archived: Boolean(seed.archived),
    created_at: String(seed.created_at || '').trim(),
    updated_at: String(seed.updated_at || '').trim(),
  };
}

export function buildOpportunityExportPayload(items = []) {
  return {
    opportunities: Array.isArray(items) ? items.map((item) => normalizeTransferOpportunity(item)) : [],
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseOpportunityImportPayload(rawJson) {
  let parsed = null;

  try {
    parsed = JSON.parse(String(rawJson || ''));
  } catch {
    throw new Error('Invalid JSON.');
  }

  if (!isPlainObject(parsed) || !Array.isArray(parsed.opportunities)) {
    throw new Error('Invalid payload shape. Expected {"opportunities": []}.');
  }

  const normalizedItems = parsed.opportunities.map((item) => {
    if (!isPlainObject(item)) {
      throw new Error('Each imported opportunity must be an object.');
    }

    const normalized = normalizeTransferOpportunity(item);
    if (!normalized.title) {
      throw new Error('Each imported opportunity must include a non-empty title.');
    }

    return normalized;
  });

  return {
    opportunities: normalizedItems,
  };
}

export function mergeImportedOpportunitiesForUser(
  userId,
  importedOpportunities = [],
  dependencies = {
    listOpportunitiesForUser,
    createOpportunityForUser,
    archiveOpportunityForUser,
  }
) {
  const existing = dependencies.listOpportunitiesForUser(userId, { includeArchived: true });
  const existingIds = new Set(existing.map((item) => String(item.id || '').trim()).filter(Boolean));
  let importedCount = 0;

  importedOpportunities.forEach((seed) => {
    const normalized = normalizeTransferOpportunity(seed);
    const createSeed = {
      ...normalized,
      archived: false,
    };

    if (createSeed.id && existingIds.has(createSeed.id)) {
      delete createSeed.id;
    }

    const created = dependencies.createOpportunityForUser(userId, createSeed);
    importedCount += 1;

    if (created && created.id) {
      existingIds.add(String(created.id));
      if (normalized.archived) {
        dependencies.archiveOpportunityForUser(userId, created.id);
      }
    }
  });

  return importedCount;
}

function truncate(text, maxLength = 120) {
  const normalized = String(text || '').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function normalizeStatusValue(value) {
  return String(value || '').trim().toLowerCase();
}

function formatDate(value) {
  if (!value) {
    return 'No deadline';
  }
  return value;
}

function formatDateOffsetFromNow(daysFromNow, now = new Date()) {
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + daysFromNow);
  const year = next.getUTCFullYear();
  const month = String(next.getUTCMonth() + 1).padStart(2, '0');
  const day = String(next.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildSampleOpportunitySeeds(now = new Date()) {
  return [
    {
      title: '[Sample] Housing lead near transit',
      type: 'housing',
      source_link: 'https://example.com/sample-housing-lead',
      contact: 'housing-owner@example.com',
      deadline: formatDateOffsetFromNow(SAMPLE_DATA_DEADLINE_SOON_DAYS, now),
      status: 'new',
      tags: ['sample', 'housing'],
      notes: 'Sample note: ask if utilities are included before booking a visit.',
    },
    {
      title: '[Sample] Freelance design referral',
      type: 'job',
      source_link: '',
      contact: 'referrals@example.com',
      deadline: formatDateOffsetFromNow(SAMPLE_DATA_DEADLINE_UPCOMING_DAYS, now),
      status: 'in progress',
      tags: ['sample', 'portfolio'],
      notes: '',
    },
    {
      title: '[Sample] Community swap request',
      type: 'barter',
      source_link: 'https://example.com/sample-community-swap',
      contact: '',
      deadline: '',
      status: 'waiting',
      tags: ['sample', 'barter'],
      notes: 'Sample note: waiting on confirmation from organizer.',
    },
    {
      title: '[Sample] Closed neighborhood listing',
      type: 'housing',
      source_link: 'https://example.com/sample-closed-listing',
      contact: 'sample-agent@example.com',
      deadline: formatDateOffsetFromNow(-5, now),
      status: 'done',
      tags: ['sample', 'archived'],
      notes: 'Sample archived item for testing archive view behavior.',
      archived: true,
    },
  ];
}

function loadSampleOpportunitiesForUser(userId, now = new Date()) {
  const seeds = buildSampleOpportunitySeeds(now);
  seeds.forEach((seed) => {
    const created = createOpportunityForUser(userId, {
      ...seed,
      archived: false,
    });
    if (seed.archived && created && created.id) {
      archiveOpportunityForUser(userId, created.id);
    }
  });
}

export function classifyDeadlineUrgency(deadline, now = Date.now()) {
  const normalizedDeadline = String(deadline || '').trim();
  if (!normalizedDeadline) {
    return 'no_deadline';
  }

  const parsedDeadline = Date.parse(normalizedDeadline);
  if (Number.isNaN(parsedDeadline)) {
    return 'no_deadline';
  }

  const nowDate = new Date(now);
  const deadlineDate = new Date(parsedDeadline);
  const todayUtc = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate());
  const deadlineUtc = Date.UTC(deadlineDate.getUTCFullYear(), deadlineDate.getUTCMonth(), deadlineDate.getUTCDate());
  const dayDelta = Math.floor((deadlineUtc - todayUtc) / ONE_DAY_MS);

  if (dayDelta < 0) {
    return 'overdue';
  }

  if (dayDelta <= 7) {
    return 'due_soon';
  }

  return 'upcoming';
}

function getDeadlineUrgencyMeta(deadline, now = Date.now()) {
  const urgency = classifyDeadlineUrgency(deadline, now);

  if (urgency === 'overdue') {
    return { label: 'Overdue', className: 'urgency-badge urgency-badge--overdue' };
  }

  if (urgency === 'due_soon') {
    return { label: 'Due soon', className: 'urgency-badge urgency-badge--due-soon' };
  }

  if (urgency === 'upcoming') {
    return { label: 'Upcoming', className: 'urgency-badge urgency-badge--upcoming' };
  }

  return { label: 'No deadline', className: 'urgency-badge urgency-badge--no-deadline' };
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

function normalizeSafeEmailContact(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return '';
  }

  return normalized;
}

function normalizeSafePhoneContact(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }

  if (!/^\+?[\d().\-\s]+$/.test(normalized)) {
    return '';
  }

  const plusCount = (normalized.match(/\+/g) || []).length;
  if (plusCount > 1 || (plusCount === 1 && !normalized.startsWith('+'))) {
    return '';
  }

  const digits = normalized.match(/\d/g) || [];
  if (digits.length < 7 || digits.length > 15) {
    return '';
  }

  const compact = normalized.replace(/[().\-\s]/g, '');
  if (!/^\+?\d+$/.test(compact)) {
    return '';
  }

  return compact;
}

function buildTransferFilename(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${EXPORT_FILENAME_PREFIX}-${year}-${month}-${day}.json`;
}

function triggerJsonDownload(payload, win, doc) {
  if (!win || !win.URL || typeof win.URL.createObjectURL !== 'function' || typeof Blob !== 'function') {
    return false;
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const downloadUrl = win.URL.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = buildTransferFilename();
  if (typeof anchor.click === 'function') {
    anchor.click();
  }
  win.URL.revokeObjectURL(downloadUrl);
  return true;
}

function getContactQuickAction(contactValue) {
  const safeEmail = normalizeSafeEmailContact(contactValue);
  if (safeEmail) {
    return {
      href: `mailto:${encodeURIComponent(safeEmail)}`,
      label: 'Email',
    };
  }

  const safePhone = normalizeSafePhoneContact(contactValue);
  if (safePhone) {
    return {
      href: `tel:${safePhone}`,
      label: 'Call',
    };
  }

  return null;
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

export function deriveBulkStatusOptions(items = []) {
  const statuses = [];
  const seen = new Set();

  QUICK_STATUS_VALUES.forEach((statusValue) => {
    const normalized = String(statusValue || '').trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    statuses.push(normalized);
  });

  deriveStatusOptions(items).forEach((statusValue) => {
    const normalized = String(statusValue || '').trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    statuses.push(normalized);
  });

  return statuses;
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

function buildFirstRunEmptyState(doc, onLoadSampleData) {
  const emptyState = doc.createElement('section');
  emptyState.className = 'panel panel--muted empty-state';

  const title = doc.createElement('h3');
  title.className = 'empty-state__title';
  title.textContent = 'Start with one clear next step';

  const intro = doc.createElement('p');
  intro.className = 'meta';
  intro.textContent = 'Opportunity OS helps you keep opportunities visible so follow-up does not get lost.';

  const suggestions = doc.createElement('ul');
  suggestions.className = 'empty-state__tips';
  ['Add one opportunity you can act on this week.', 'Set a deadline so urgency badges can highlight what needs attention soon.', 'Capture one contact or note to make follow-up easier.'].forEach((tip) => {
    const item = doc.createElement('li');
    item.textContent = tip;
    suggestions.append(item);
  });

  const sampleButton = doc.createElement('button');
  sampleButton.type = 'button';
  sampleButton.className = 'button';
  sampleButton.textContent = 'Load sample opportunities';
  sampleButton.addEventListener('click', () => {
    if (typeof onLoadSampleData === 'function') {
      onLoadSampleData();
    }
  });

  emptyState.append(title, intro, suggestions, sampleButton);
  return emptyState;
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

function buildCard(item, doc, options = {}) {
  const showSelection = Boolean(options.showSelection);
  const isSelected = Boolean(options.isSelected);
  const card = doc.createElement('article');
  card.className = 'opportunity-card';
  card.dataset.id = item.id;

  const header = doc.createElement('div');
  header.className = 'opportunity-card__header';

  const title = doc.createElement('h3');
  title.textContent = item.title || 'Untitled opportunity';

  const titleRow = doc.createElement('div');
  titleRow.className = 'opportunity-card__title-row';

  if (showSelection) {
    const selectionToggle = doc.createElement('label');
    selectionToggle.className = 'toggle opportunity-card__select-toggle';

    const selectionInput = doc.createElement('input');
    selectionInput.type = 'checkbox';
    selectionInput.dataset.bulkSelect = '1';
    selectionInput.dataset.id = item.id;
    selectionInput.checked = isSelected;
    selectionInput.ariaLabel = `Select ${item.title || 'opportunity'}`;

    const selectionText = doc.createElement('span');
    selectionText.className = 'meta';
    selectionText.textContent = 'Select';

    selectionToggle.append(selectionInput, selectionText);
    titleRow.append(selectionToggle);
  }

  titleRow.append(title);

  const status = doc.createElement('span');
  status.className = 'meta opportunity-card__status';
  status.textContent = item.status || 'new';

  const urgency = doc.createElement('span');
  const urgencyMeta = getDeadlineUrgencyMeta(item.deadline);
  urgency.className = urgencyMeta.className;
  urgency.textContent = urgencyMeta.label;

  const headerMeta = doc.createElement('div');
  headerMeta.className = 'opportunity-card__header-meta';
  headerMeta.append(status, urgency);

  header.append(titleRow, headerMeta);

  const meta = doc.createElement('div');
  meta.className = 'opportunity-card__meta';
  meta.append(makeMeta(doc, 'Type', item.type));

  const contact = doc.createElement('p');
  const normalizedContact = String(item.contact || '').trim();
  contact.textContent = `Contact: ${normalizedContact || '—'}`;
  const contactAction = getContactQuickAction(normalizedContact);
  if (contactAction) {
    const contactLink = doc.createElement('a');
    contactLink.className = 'contact-quick-action';
    contactLink.href = contactAction.href;
    contactLink.textContent = contactAction.label;
    contact.append(' ', contactLink);
  }
  meta.append(contact, makeMeta(doc, 'Deadline', formatDate(item.deadline)));

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

  const normalizedNotes = String(item.notes || '').trim();
  const hasNotes = normalizedNotes.length > 0;
  const hasLongNotes = normalizedNotes.length > NOTES_PREVIEW_MAX_LENGTH;
  let notes = null;

  if (hasNotes) {
    notes = doc.createElement('div');
    notes.className = 'opportunity-card__notes';

    const notesContent = doc.createElement('p');
    notesContent.className = 'opportunity-card__notes-content';
    let isExpanded = false;

    const renderNotesContent = () => {
      notesContent.textContent = isExpanded
        ? normalizedNotes
        : truncate(normalizedNotes, NOTES_PREVIEW_MAX_LENGTH);
    };

    renderNotesContent();
    notes.append(notesContent);

    if (hasLongNotes) {
      const notesToggle = doc.createElement('button');
      notesToggle.type = 'button';
      notesToggle.className = 'button button--subtle opportunity-card__notes-toggle';
      notesToggle.textContent = 'Show more';
      notesToggle.addEventListener('click', () => {
        isExpanded = !isExpanded;
        notesToggle.textContent = isExpanded ? 'Show less' : 'Show more';
        renderNotesContent();
      });
      notes.append(notesToggle);
    }
  }

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

  const quickStatusActions = doc.createElement('div');
  quickStatusActions.className = 'opportunity-card__quick-status';
  const currentStatus = normalizeStatusValue(item.status);

  QUICK_STATUS_VALUES.forEach((statusValue) => {
    const quickStatusButton = doc.createElement('button');
    quickStatusButton.type = 'button';
    quickStatusButton.className = 'button button--subtle';
    quickStatusButton.dataset.action = 'quick_status';
    quickStatusButton.dataset.status = statusValue;
    quickStatusButton.textContent = statusValue;
    if (currentStatus === statusValue) {
      quickStatusButton.disabled = true;
    }
    quickStatusActions.append(quickStatusButton);
  });

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

  actions.append(quickStatusActions, editButton, archiveButton, deleteButton);
  card.append(header, meta);
  if (notes) {
    card.append(notes);
  }
  card.append(tags, actions);
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
  const bulkActionsNode = doc.getElementById('bulk-actions');
  const selectedSummaryNode = doc.getElementById('selected-summary');
  const bulkArchiveButton = doc.getElementById('bulk-archive-button');
  const bulkStatusSelect = doc.getElementById('bulk-status-select');
  const bulkStatusApplyButton = doc.getElementById('bulk-status-apply-button');
  const exportJsonButton = doc.getElementById('export-json-button');
  const importJsonButton = doc.getElementById('import-json-button');
  const importJsonInput = doc.getElementById('import-json-input');
  const transferFeedbackNode = doc.getElementById('transfer-feedback');
  const form = doc.getElementById('opportunity-form');
  const saveButton = doc.getElementById('save-opportunity-button');
  const cancelEditButton = doc.getElementById('cancel-edit-button');
  const signOutButton = doc.getElementById('sign-out-button');
  const filterState = readDashboardFilters(win);
  const selectedIds = new Set();
  let visibleIds = [];

  if (emailNode) {
    emailNode.textContent = `Signed in as ${session.email}`;
  }

  function setTransferFeedback(message, isError = false) {
    if (!transferFeedbackNode) {
      return;
    }

    const normalizedMessage = String(message || '').trim();
    transferFeedbackNode.textContent = normalizedMessage;
    transferFeedbackNode.hidden = normalizedMessage.length < 1;
    transferFeedbackNode.className = isError ? 'meta transfer-feedback transfer-feedback--error' : 'meta transfer-feedback';
  }

  function renderList() {
    if (!listNode) {
      return;
    }

    const allItems = listOpportunitiesForUser(session.userId, { includeArchived: true });
    const activeCount = allItems.filter((item) => !item.archived).length;
    const archivedCount = allItems.length - activeCount;
    const statusOptions = deriveStatusOptions(allItems);
    const bulkStatusOptions = deriveBulkStatusOptions(allItems);
    const isArchivedView = filterState.view === 'archived';

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

    if (bulkStatusSelect) {
      const previousValue = String(bulkStatusSelect.value || '').trim();
      bulkStatusSelect.replaceChildren();

      const placeholder = doc.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Choose status';
      bulkStatusSelect.append(placeholder);

      bulkStatusOptions.forEach((statusValue) => {
        const option = doc.createElement('option');
        option.value = statusValue;
        option.textContent = statusValue;
        bulkStatusSelect.append(option);
      });

      bulkStatusSelect.value = bulkStatusOptions.includes(previousValue) ? previousValue : '';
    }

    const filteredItems = filterOpportunityItems(allItems, filterState);
    const sortedItems = sortOpportunityItems(filteredItems, filterState.sort);
    visibleIds = sortedItems.map((item) => item.id);
    const visibleIdSet = new Set(visibleIds);
    Array.from(selectedIds).forEach((id) => {
      if (!visibleIdSet.has(id)) {
        selectedIds.delete(id);
      }
    });
    const selectedCount = selectedIds.size;
    listNode.replaceChildren();

    if (summaryNode) {
      summaryNode.textContent = `Active: ${activeCount} | Archived: ${archivedCount} | Showing: ${sortedItems.length}`;
    }

    if (bulkActionsNode) {
      bulkActionsNode.hidden = selectedCount < 1;
    }
    if (selectedSummaryNode) {
      selectedSummaryNode.textContent = `${selectedCount} selected`;
    }
    if (bulkArchiveButton) {
      bulkArchiveButton.disabled = selectedCount < 1 || isArchivedView;
    }
    if (bulkStatusApplyButton) {
      bulkStatusApplyButton.disabled = selectedCount < 1;
    }
    if (bulkStatusSelect && selectedCount < 1) {
      bulkStatusSelect.value = '';
    }

    if (sortedItems.length === 0) {
      const isFirstRunView = filterState.view === 'active' && filterState.status === 'all' && allItems.length === 0;
      if (isFirstRunView) {
        listNode.append(
          buildFirstRunEmptyState(doc, () => {
            loadSampleOpportunitiesForUser(session.userId);
            renderList();
          })
        );
      } else {
        const emptyState = doc.createElement('p');
        emptyState.className = 'panel panel--muted empty-state';
        emptyState.textContent = getEmptyStateMessage(filterState);
        listNode.append(emptyState);
      }
    } else {
      sortedItems.forEach((item) => {
        listNode.append(
          buildCard(item, doc, {
            showSelection: true,
            isSelected: selectedIds.has(item.id),
          })
        );
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
        selectedIds.delete(id);
        if (form && form.elements.id.value === id) {
          resetForm(form, cancelEditButton, saveButton);
        }
        renderList();
        return;
      }

      if (action === 'archive') {
        archiveOpportunityForUser(session.userId, id);
        selectedIds.delete(id);
        if (form && form.elements.id.value === id) {
          resetForm(form, cancelEditButton, saveButton);
        }
        renderList();
        return;
      }

      if (action === 'quick_status') {
        const nextStatus = String(actionNode.dataset.status || '').trim();
        if (!nextStatus) {
          return;
        }
        updateOpportunityForUser(session.userId, id, { status: nextStatus });
        if (form && form.elements.id.value === id && form.elements.status) {
          form.elements.status.value = nextStatus;
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

    target.addEventListener('change', (event) => {
      const selectionInput = event.target.closest('input[data-bulk-select]');
      if (!selectionInput) {
        return;
      }

      const selectedId = String(selectionInput.dataset.id || '').trim();
      if (!selectedId) {
        return;
      }

      if (selectionInput.checked) {
        selectedIds.add(selectedId);
      } else {
        selectedIds.delete(selectedId);
      }

      renderList();
    });
  }

  attachActionHandler(listNode);

  function applyBulkArchive() {
    if (filterState.view === 'archived') {
      return;
    }

    const selectedVisibleIds = Array.from(selectedIds).filter((id) => visibleIds.includes(id));
    if (selectedVisibleIds.length < 1) {
      return;
    }

    selectedVisibleIds.forEach((id) => {
      archiveOpportunityForUser(session.userId, id);
      if (form && form.elements.id.value === id) {
        resetForm(form, cancelEditButton, saveButton);
      }
    });

    selectedIds.clear();
    renderList();
  }

  function applyBulkStatus(nextStatus) {
    const normalizedStatus = String(nextStatus || '').trim();
    if (!normalizedStatus) {
      return;
    }

    const selectedVisibleIds = Array.from(selectedIds).filter((id) => visibleIds.includes(id));
    if (selectedVisibleIds.length < 1) {
      return;
    }

    selectedVisibleIds.forEach((id) => {
      updateOpportunityForUser(session.userId, id, { status: normalizedStatus });
      if (form && form.elements.id.value === id && form.elements.status) {
        form.elements.status.value = normalizedStatus;
      }
    });

    selectedIds.clear();
    if (bulkStatusSelect) {
      bulkStatusSelect.value = '';
    }
    renderList();
  }

  if (bulkArchiveButton) {
    bulkArchiveButton.addEventListener('click', () => {
      applyBulkArchive();
    });
  }

  if (bulkStatusApplyButton) {
    bulkStatusApplyButton.addEventListener('click', () => {
      applyBulkStatus(bulkStatusSelect ? bulkStatusSelect.value : '');
    });
  }

  if (exportJsonButton) {
    exportJsonButton.addEventListener('click', () => {
      const userItems = listOpportunitiesForUser(session.userId, { includeArchived: true });
      const payload = buildOpportunityExportPayload(userItems);
      const didDownload = triggerJsonDownload(payload, win, doc);
      if (didDownload) {
        setTransferFeedback(`Exported ${payload.opportunities.length} opportunities to JSON.`);
      } else {
        setTransferFeedback('Export is unavailable in this environment.', true);
      }
    });
  }

  if (importJsonButton && importJsonInput) {
    importJsonButton.addEventListener('click', () => {
      importJsonInput.value = '';
      importJsonInput.click();
    });

    importJsonInput.addEventListener('change', async () => {
      const file = importJsonInput.files && importJsonInput.files[0];
      if (!file) {
        return;
      }

      try {
        const rawJson = await file.text();
        const parsed = parseOpportunityImportPayload(rawJson);
        const importedCount = mergeImportedOpportunitiesForUser(session.userId, parsed.opportunities);
        renderList();
        setTransferFeedback(`Imported ${importedCount} opportunities (merged with existing data).`);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown import error.';
        setTransferFeedback(`Import failed: ${reason}`, true);
      } finally {
        importJsonInput.value = '';
      }
    });
  }

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
