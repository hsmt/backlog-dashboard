// Backlog REST API v2 client (runs in the Electron main process).
// Docs: https://developer.nulab.com/docs/backlog/
'use strict';

class BacklogClient {
  constructor({ spaceDomain, apiKey }) {
    this.spaceDomain = spaceDomain; // e.g. "yourspace.backlog.com"
    this.apiKey = apiKey;
  }

  _url(path, query = {}) {
    const url = new URL(`https://${this.spaceDomain}/api/v2${path}`);
    url.searchParams.set('apiKey', this.apiKey);
    for (const [key, val] of Object.entries(query)) {
      if (val === undefined || val === null) continue;
      if (Array.isArray(val)) {
        for (const v of val) url.searchParams.append(`${key}[]`, v);
      } else {
        url.searchParams.set(key, val);
      }
    }
    return url;
  }

  async _request(method, path, { query, body } = {}) {
    const url = this._url(path, query);
    const opts = { method, headers: {} };
    if (body) {
      // Backlog expects application/x-www-form-urlencoded (with []-style arrays).
      const form = new URLSearchParams();
      for (const [key, val] of Object.entries(body)) {
        if (val === undefined || val === null || val === '') continue;
        if (Array.isArray(val)) val.forEach((v) => form.append(`${key}[]`, v));
        else form.append(key, val);
      }
      opts.body = form.toString();
      opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    const res = await fetch(url, opts);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = data && data.errors ? data.errors.map((e) => e.message).join('; ') : (text || res.statusText);
      const err = new Error(`Backlog API ${res.status}: ${msg}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  get(path, query) { return this._request('GET', path, { query }); }
  post(path, body) { return this._request('POST', path, { body }); }
  patch(path, body) { return this._request('PATCH', path, { body }); }

  // --- High-level helpers -------------------------------------------------
  myself() { return this.get('/users/myself'); }

  // Incomplete issues assigned to a user, soonest due first.
  // statusId 1=Open 2=In Progress 3=Resolved (4=Closed is excluded).
  myOpenIssues(userId) {
    return this.get('/issues', {
      assigneeId: [userId],
      statusId: [1, 2, 3],
      sort: 'dueDate',
      order: 'asc',
      count: 100,
    });
  }

  issue(issueIdOrKey) { return this.get(`/issues/${issueIdOrKey}`); }
  comments(issueIdOrKey) {
    return this.get(`/issues/${issueIdOrKey}/comments`, { order: 'asc', count: 100 });
  }
  addComment(issueIdOrKey, content) {
    return this.post(`/issues/${issueIdOrKey}/comments`, { content });
  }
  updateStatus(issueIdOrKey, statusId, comment) {
    return this.patch(`/issues/${issueIdOrKey}`, { statusId, comment });
  }

  projects() { return this.get('/projects', { archived: false }); }
  projectStatuses(projectIdOrKey) { return this.get(`/projects/${projectIdOrKey}/statuses`); }
  issueTypes(projectIdOrKey) { return this.get(`/projects/${projectIdOrKey}/issueTypes`); }
  priorities() { return this.get('/priorities'); }

  createIssue({ projectId, summary, issueTypeId, priorityId, description, dueDate }) {
    return this.post('/issues', { projectId, summary, issueTypeId, priorityId, description, dueDate });
  }

  // --- Notifications ------------------------------------------------------
  notifications({ count = 100, minId, maxId } = {}) {
    return this.get('/notifications', { count, minId, maxId, order: 'desc' });
  }
  // Unread notification count. Returns { count }.
  unreadNotificationCount() {
    return this.get('/notifications/count', { alreadyRead: false });
  }
  markNotificationRead(id) { return this.post(`/notifications/${id}/markAsRead`); }
  // Marks all notifications as read (resets the unread count).
  markAllNotificationsRead() { return this.post('/notifications/markAsRead'); }
}

module.exports = { BacklogClient };
