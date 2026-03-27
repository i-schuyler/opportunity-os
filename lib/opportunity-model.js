/**
 * Core Opportunity OS record shape for v0.1 scaffolding.
 * This model is intentionally framework-agnostic so it can map to real storage later.
 */
export function createOpportunity(seed = {}) {
  const now = new Date().toISOString();

  return {
    id: seed.id || `opp-${Date.now()}`,
    user_id: seed.user_id || '',
    title: seed.title || '',
    type: seed.type || 'general',
    source_link: seed.source_link || '',
    contact: seed.contact || '',
    deadline: seed.deadline || '',
    status: seed.status || 'new',
    notes: seed.notes || '',
    tags: Array.isArray(seed.tags) ? seed.tags : [],
    created_at: seed.created_at || now,
    updated_at: seed.updated_at || now,
  };
}
