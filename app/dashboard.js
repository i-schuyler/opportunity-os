import { getMockSession, isMockAuthEnabled, signOut } from '../lib/auth-scaffold.js';
import {
  archiveOpportunityForUser,
  createOpportunityForUser,
  deleteOpportunityForUser,
  listOpportunitiesForUser,
  updateOpportunityForUser,
} from '../lib/opportunity-model.js';

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
  const archivedListNode = doc.getElementById('archived-opportunity-list');
  const showArchivedToggle = doc.getElementById('show-archived-toggle');
  const form = doc.getElementById('opportunity-form');
  const saveButton = doc.getElementById('save-opportunity-button');
  const cancelEditButton = doc.getElementById('cancel-edit-button');
  const signOutButton = doc.getElementById('sign-out-button');

  if (emailNode) {
    emailNode.textContent = `Signed in as ${session.email}`;
  }

  function renderLists() {
    if (!listNode || !archivedListNode) {
      return;
    }

    const activeItems = listOpportunitiesForUser(session.userId);
    const archivedItems = listOpportunitiesForUser(session.userId, { includeArchived: true }).filter(
      (item) => item.archived
    );

    listNode.replaceChildren();
    archivedListNode.replaceChildren();

    if (activeItems.length === 0) {
      const emptyState = doc.createElement('p');
      emptyState.className = 'panel panel--muted empty-state';
      emptyState.textContent =
        'No active opportunities yet. Add one above to keep your next step visible and practical.';
      listNode.append(emptyState);
    } else {
      activeItems.forEach((item) => {
        listNode.append(buildCard(item, doc));
      });
    }

    if (showArchivedToggle && showArchivedToggle.checked) {
      archivedListNode.hidden = false;
      if (archivedItems.length === 0) {
        const archivedEmpty = doc.createElement('p');
        archivedEmpty.className = 'panel panel--muted empty-state';
        archivedEmpty.textContent = 'No archived opportunities yet.';
        archivedListNode.append(archivedEmpty);
      } else {
        const heading = doc.createElement('h3');
        heading.textContent = 'Archived opportunities';
        archivedListNode.append(heading);
        archivedItems.forEach((item) => {
          archivedListNode.append(buildCard(item, doc));
        });
      }
    } else {
      archivedListNode.hidden = true;
    }
  }

  renderLists();

  if (showArchivedToggle) {
    showArchivedToggle.addEventListener('change', renderLists);
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
      renderLists();
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
        renderLists();
        return;
      }

      if (action === 'archive') {
        archiveOpportunityForUser(session.userId, id);
        if (form && form.elements.id.value === id) {
          resetForm(form, cancelEditButton, saveButton);
        }
        renderLists();
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
  attachActionHandler(archivedListNode);

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
