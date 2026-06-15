// Canonical node statuses. Shared by the inspector <select>, the route's
// validation, and the card styling (.card--{status} in page.njk). Keeping the
// list in one place stops the form, server, and CSS from drifting apart.
export const STATUSES = ['draft', 'new', 'pending', 'ready', 'approved'];

export function isStatus(value) {
  return STATUSES.includes(value);
}
