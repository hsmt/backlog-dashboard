'use strict';
// Wrapped in an IIFE: `window.api` is exposed by the preload as a non-configurable
// global property, so a top-level `const api` would throw "already declared".
// Function scope avoids that collision.
(() => {
const api = window.api;
const view = document.getElementById('view');
const titleEl = document.getElementById('title');
const backBtn = document.getElementById('backBtn');
const addBtn = document.getElementById('addBtn');
const refreshBtn = document.getElementById('refreshBtn');
const settingsBtn = document.getElementById('settingsBtn');
const notifBtn = document.getElementById('notifBtn');
const notifCount = document.getElementById('notifCount');

let spaceDomain = ''; // resolved from saved config at startup
let stack = ['list']; // simple view stack for back navigation

// list view state (persisted across refreshes within a session)
let allIssues = [];
let sortKey = 'dueDate';   // 'dueDate' | 'project' | 'summary'
let filterProject = '';    // project key, '' = all
let filterText = '';       // substring match on summary / key

// ---------- helpers ----------
function h(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    // No innerHTML path by design — all content goes through text nodes below,
    // so Backlog-sourced text (summaries, comments) can never inject markup.
    if (k === 'class') e.className = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}
function clear() { view.replaceChildren(); }
function esc(s) { return (s ?? '').toString(); }

function toast(msg, ms = 1800) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}
function fmtDateTime(s) {
  if (!s) return '';
  const d = new Date(s);
  return `${fmtDate(s)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function dueInfo(dueDate) {
  if (!dueDate) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate); due.setHours(0, 0, 0, 0);
  const days = Math.round((due - today) / 86400000);
  let cls = '';
  let label = fmtDate(dueDate);
  if (days < 0) { cls = 'over'; label += ` (${-days}d overdue)`; }
  else if (days === 0) { cls = 'soon'; label += ' (today)'; }
  else if (days <= 3) { cls = 'soon'; label += ` (in ${days}d)`; }
  return { cls, label };
}

function showLoading(msg = 'Loading…') {
  clear();
  view.append(h('div', { class: 'loading' }, h('span', { class: 'spin' }, '⟳'), ' ' + msg));
}
function showError(err) {
  clear();
  if (err && (err.message || '').includes('NOT_CONFIGURED')) { renderSettings(); return; }
  const msg = (err && err.message) ? err.message.replace(/^Error:\s*/, '') : 'Unknown error';
  view.append(
    h('div', { class: 'error' }, '⚠️ ' + msg),
    h('div', { class: 'btn-row', style: 'justify-content:center' },
      h('button', { class: 'btn secondary', onclick: () => renderSettings() }, 'Open settings'))
  );
}

function setChrome(where) {
  backBtn.classList.toggle('hidden', where === 'list');
  addBtn.classList.toggle('hidden', where !== 'list');
  refreshBtn.classList.toggle('hidden', where !== 'list' && where !== 'notifications');
  notifBtn.classList.toggle('hidden', where !== 'list' && where !== 'notifications');
  titleEl.textContent =
    { list: 'Tasks', detail: 'Issue', add: 'New Task', settings: 'Settings', notifications: 'Notifications' }[where] || 'Tasks';
}

function go(where, renderFn) {
  if (where === 'list') stack = ['list'];
  else if (stack[stack.length - 1] !== where) stack.push(where);
  setChrome(where);
  renderFn();
}
function back() {
  stack.pop();
  const prev = stack[stack.length - 1] || 'list';
  setChrome(prev);
  ({ list: renderList, add: renderAdd, settings: renderSettings, notifications: renderNotifications }[prev] || renderList)();
}

// ---------- task list ----------
function projectKeyOf(it) {
  // issueKey looks like "PROJKEY-123"; the project key is everything before the last dash.
  const i = it.issueKey.lastIndexOf('-');
  return i > 0 ? it.issueKey.slice(0, i) : it.issueKey;
}

function visibleIssues() {
  let arr = allIssues.slice();
  if (filterProject) arr = arr.filter((it) => projectKeyOf(it) === filterProject);
  if (filterText) {
    const q = filterText.toLowerCase();
    arr = arr.filter((it) =>
      it.summary.toLowerCase().includes(q) || it.issueKey.toLowerCase().includes(q));
  }
  const byDue = (a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;        // no due date sorts last
    if (!b.dueDate) return -1;
    return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
  };
  if (sortKey === 'summary') arr.sort((a, b) => a.summary.localeCompare(b.summary, 'ja'));
  else if (sortKey === 'project') {
    arr.sort((a, b) => projectKeyOf(a).localeCompare(projectKeyOf(b), 'ja') || byDue(a, b));
  } else arr.sort(byDue);
  return arr;
}

function renderCards() {
  const cards = document.getElementById('cards');
  if (!cards) return;
  const arr = visibleIssues();
  cards.replaceChildren();
  if (!allIssues.length) {
    cards.append(h('div', { class: 'empty' }, '🎉 No open tasks'));
  } else if (!arr.length) {
    cards.append(h('div', { class: 'empty' }, 'No tasks match your filters'));
  } else {
    for (const it of arr) cards.append(taskCard(it));
  }
  const count = document.getElementById('count');
  if (count) count.textContent = `${arr.length} / ${allIssues.length}`;
}

function renderToolbar() {
  const projectKeys = [...new Set(allIssues.map(projectKeyOf))].sort((a, b) => a.localeCompare(b, 'ja'));

  const sortSel = h('select', { title: 'Sort', onchange: (e) => { sortKey = e.target.value; renderCards(); } },
    h('option', { value: 'dueDate', ...(sortKey === 'dueDate' ? { selected: '' } : {}) }, 'Sort: Due date'),
    h('option', { value: 'project', ...(sortKey === 'project' ? { selected: '' } : {}) }, 'Sort: Project'),
    h('option', { value: 'summary', ...(sortKey === 'summary' ? { selected: '' } : {}) }, 'Sort: Task name'));

  const projSel = h('select', { title: 'Filter by project', onchange: (e) => { filterProject = e.target.value; renderCards(); } },
    h('option', { value: '' }, 'All projects'),
    ...projectKeys.map((k) => h('option', { value: k, ...(k === filterProject ? { selected: '' } : {}) }, k)));

  const textInput = h('input', {
    type: 'search', class: 'filter-text', placeholder: 'Filter by task name…', value: filterText,
    oninput: (e) => { filterText = e.target.value; renderCards(); },
  });

  return h('div', { class: 'toolbar' },
    h('div', { class: 'toolbar-row' }, sortSel, projSel),
    h('div', { class: 'toolbar-row' }, textInput, h('span', { id: 'count', class: 'count' })),
  );
}

async function renderList() {
  setChrome('list');
  showLoading();
  try {
    allIssues = await api.myTasks();
    clear();
    // Drop a stale project filter if that project is no longer present.
    if (filterProject && !allIssues.some((it) => projectKeyOf(it) === filterProject)) filterProject = '';
    view.append(renderToolbar());
    view.append(h('div', { id: 'cards' }));
    renderCards();
  } catch (e) { showError(e); }
}

function taskCard(it) {
  const du = dueInfo(it.dueDate);
  const color = it.issueType && it.issueType.color ? it.issueType.color : '#888';
  return h('div', { class: 'task', onclick: () => openDetail(it.issueKey) },
    h('div', { class: 'row1' },
      h('span', { class: 'dot', style: `background:${color}` }),
      h('span', { class: 'key' }, it.issueKey),
    ),
    h('div', { class: 'summary' }, it.summary),
    h('div', { class: 'row2' },
      it.status ? statusBadge(it.status) : null,
      it.priority ? h('span', { class: 'badge' }, it.priority.name) : null,
      du ? h('span', { class: `badge due ${du.cls}` }, 'Due ' + du.label) : null,
    ),
  );
}

// Backlog assigns each status its own color (e.g. Open=salmon, In Progress=blue,
// Resolved=teal) — the API returns it on the status object, so mirror it here
// instead of a single flat color for every status.
function statusBadge(status) {
  const bg = status.color || 'var(--accent)';
  return h('span', { class: 'badge status', style: `background:${bg}; color:${readableTextOn(bg)}` }, status.name);
}
// Pick black/white text for a hex background by WCAG relative luminance. The
// crossover where black overtakes white in contrast ratio is L > 0.179 (solving
// contrast(black,bg) = contrast(white,bg)), not L > 0.5 — most Backlog status
// colors (salmon/blue/teal) are mid-luminance and read better with dark text.
function readableTextOn(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return '#fff';
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.179 ? '#1b1f27' : '#fff';
}

// ---------- detail ----------
function openDetail(issueKey) { go('detail', () => renderDetail(issueKey)); }

async function renderDetail(issueKey) {
  showLoading();
  try {
    const { issue, comments, statuses, users } = await api.issueDetail(issueKey);
    clear();
    const wrap = h('div', { class: 'detail' });
    const url = `https://${spaceDomain}/view/${issue.issueKey}`;

    wrap.append(
      h('div', { class: 'row2' },
        h('span', { class: 'key' }, issue.issueKey),
        issue.status ? statusBadge(issue.status) : null,
        h('a', { class: 'link', onclick: () => api.openExternal(url) }, 'Open in Backlog ↗'),
      ),
      h('h2', {}, issue.summary),
      h('div', { class: 'meta' },
        [issue.issueType && issue.issueType.name, issue.priority && ('Priority: ' + issue.priority.name),
         issue.dueDate && ('Due: ' + fmtDate(issue.dueDate))].filter(Boolean).join(' · ')),
    );

    // status changer
    if (statuses && statuses.length) {
      const sel = h('select', {},
        ...statuses.map((s) => h('option', { value: s.id, ...(s.id === issue.status.id ? { selected: '' } : {}) }, s.name)));
      const btn = h('button', { class: 'btn secondary' }, 'Change status');
      btn.addEventListener('click', async () => {
        const newId = Number(sel.value);
        if (newId === issue.status.id) return;
        btn.disabled = true; btn.textContent = 'Updating…';
        try { await api.setStatus(issue.issueKey, newId); toast('Status updated'); renderDetail(issueKey); }
        catch (e) { btn.disabled = false; btn.textContent = 'Change status'; toast('Failed: ' + e.message); }
      });
      wrap.append(h('div', { class: 'section-label' }, 'Status'),
        h('div', { style: 'display:flex; gap:8px' }, sel, btn));
    }

    if (issue.description) {
      wrap.append(h('div', { class: 'section-label' }, 'Description'), h('div', { class: 'desc' }, issue.description));
    }

    // comments
    wrap.append(h('div', { class: 'section-label' }, `Comments (${comments.length})`));
    const list = h('div', {});
    for (const c of comments) list.append(commentRow(c));
    wrap.append(list);

    // add comment (type @ to notify project members — Backlog "お知らせ")
    wrap.append(commentComposer(issue, users));

    view.append(wrap);
  } catch (e) { showError(e); }
}

function commentRow(c) {
  const changes = (c.changeLog || [])
    .map((cl) => `${cl.field}: ${cl.originalValue ?? '—'} → ${cl.newValue ?? '—'}`).join(', ');
  return h('div', { class: 'comment' },
    h('div', {},
      h('span', { class: 'who' }, c.createdUser ? c.createdUser.name : '—'),
      h('span', { class: 'when' }, fmtDateTime(c.created))),
    c.content ? h('div', { class: 'body' }, c.content) : null,
    changes ? h('div', { class: 'change' }, changes) : null,
  );
}

// Comment box with @mention: typing "@" (or the @ button) opens a project-member
// picker; picking inserts "@Name" into the text and adds the user to the notify
// set. On post we send the ids as `notifiedUserId[]` so Backlog sends お知らせ.
// The notify set (shown as removable chips) is the source of truth for who gets
// notified — editing the text never silently changes it.
function commentComposer(issue, users) {
  const notified = new Map(); // userId -> user
  const roster = (users || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));

  const ta = h('textarea', { placeholder: 'Add a comment…  (type @ to notify someone)' });
  const menu = h('div', { class: 'mention-menu hidden' });
  const chips = h('div', { class: 'notify-chips hidden' });
  const post = h('button', { class: 'btn' }, 'Post');
  const atBtn = h('button', { class: 'btn secondary', title: 'Mention someone' }, '@');

  function renderChips() {
    chips.replaceChildren();
    if (!notified.size) { chips.classList.add('hidden'); return; }
    chips.classList.remove('hidden');
    chips.append(h('span', { class: 'notify-label' }, 'Notify'));
    for (const u of notified.values()) {
      chips.append(h('span', { class: 'notify-chip' }, '@' + u.name,
        h('button', { class: 'chip-x', title: 'Remove', onclick: () => { notified.delete(u.id); renderChips(); } }, '×')));
    }
  }

  function hideMenu() { menu.classList.add('hidden'); menu.replaceChildren(); }

  // The "@query" token immediately left of the caret, or null.
  function activeMention() {
    const pos = ta.selectionStart;
    const before = ta.value.slice(0, pos);
    const m = before.match(/@([^\s@]*)$/);
    return m ? { query: m[1], start: pos - m[0].length, pos } : null;
  }

  function pickUser(u, mention) {
    const head = ta.value.slice(0, mention.start);
    const tail = ta.value.slice(mention.pos);
    const insert = '@' + u.name + ' ';
    ta.value = head + insert + tail;
    const caret = head.length + insert.length;
    ta.setSelectionRange(caret, caret);
    notified.set(u.id, u);
    renderChips();
    hideMenu();
    ta.focus();
  }

  function refreshMenu() {
    if (!roster.length) return hideMenu();
    const mention = activeMention();
    if (!mention) return hideMenu();
    const q = mention.query.toLowerCase();
    const matches = roster.filter((u) =>
      !q || (u.name || '').toLowerCase().includes(q) || (u.mailAddress || '').toLowerCase().includes(q)).slice(0, 8);
    if (!matches.length) return hideMenu();
    menu.replaceChildren(...matches.map((u) =>
      h('div', { class: 'mention-item', onmousedown: (e) => { e.preventDefault(); pickUser(u, mention); } },
        h('span', { class: 'mi-name' }, u.name),
        u.mailAddress ? h('span', { class: 'mi-mail' }, u.mailAddress) : null)));
    menu.classList.remove('hidden');
  }

  ta.addEventListener('input', refreshMenu);
  ta.addEventListener('click', refreshMenu);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.classList.contains('hidden')) { e.stopPropagation(); hideMenu(); }
  });
  ta.addEventListener('blur', () => setTimeout(hideMenu, 150)); // let an item's mousedown land first

  atBtn.addEventListener('click', () => {
    const pos = ta.selectionStart;
    const needsSpace = pos > 0 && !/\s/.test(ta.value[pos - 1]);
    const ins = (needsSpace ? ' ' : '') + '@';
    ta.value = ta.value.slice(0, pos) + ins + ta.value.slice(pos);
    const caret = pos + ins.length;
    ta.setSelectionRange(caret, caret);
    ta.focus();
    refreshMenu();
  });

  post.addEventListener('click', async () => {
    const content = ta.value.trim();
    if (!content) return;
    post.disabled = true; post.textContent = 'Posting…';
    try {
      await api.addComment(issue.issueKey, content, [...notified.keys()]);
      toast(notified.size ? `Comment added · notified ${notified.size}` : 'Comment added');
      renderDetail(issue.issueKey);
    } catch (e) { post.disabled = false; post.textContent = 'Post'; toast('Failed: ' + e.message); }
  });

  return h('div', {},
    h('div', { class: 'section-label' }, 'Add a comment'),
    h('div', { class: 'composer' }, ta, menu),
    chips,
    h('div', { class: 'btn-row' }, post, atBtn),
  );
}

// ---------- recent projects (persisted for the quick-add form) ----------
// Track projects the user has created issues in, most-recent-first, so the
// quick-add project picker surfaces them at the top. Stored in localStorage
// (renderer-only convenience; no need to round-trip through the main process).
const RECENT_PROJECTS_KEY = 'recentProjectIds';
const RECENT_PROJECTS_MAX = 5;

function loadRecentProjectIds() {
  try {
    const arr = JSON.parse(localStorage.getItem(RECENT_PROJECTS_KEY) || '[]');
    return Array.isArray(arr) ? arr.filter((n) => Number.isFinite(n)) : [];
  } catch { return []; }
}
function recordRecentProject(id) {
  if (!Number.isFinite(id)) return;
  const next = [id, ...loadRecentProjectIds().filter((x) => x !== id)].slice(0, RECENT_PROJECTS_MAX);
  try { localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(next)); } catch { /* storage full/blocked */ }
}

// ---------- quick add ----------
async function renderAdd() {
  showLoading();
  let opts;
  try { opts = await api.formOptions(); }
  catch (e) { showError(e); return; }
  clear();

  // Order projects "recently used first": recent ones in recency order, then the
  // rest in Backlog's original order. Only ids still present in `projects` count.
  const optionFor = (p) => h('option', { value: p.id }, `${p.name} (${p.projectKey})`);
  const byId = new Map(opts.projects.map((p) => [p.id, p]));
  const recent = loadRecentProjectIds().map((id) => byId.get(id)).filter(Boolean);
  const recentIds = new Set(recent.map((p) => p.id));
  const rest = opts.projects.filter((p) => !recentIds.has(p.id));

  const projectSel = h('select', {},
    h('option', { value: '' }, 'Select a project…'),
    ...(recent.length
      ? [h('optgroup', { label: 'Recent' }, ...recent.map(optionFor)),
         h('optgroup', { label: 'All projects' }, ...rest.map(optionFor))]
      : opts.projects.map(optionFor)));
  const typeSel = h('select', { disabled: '' }, h('option', {}, '—'));
  const assigneeSel = h('select', { disabled: '' }, h('option', { value: '' }, '—'));
  const myselfBtn = h('button', { class: 'btn secondary', disabled: '', title: 'Assign to me' }, 'Myself');
  const prioSel = h('select', {},
    ...opts.priorities.map((p) => h('option', { value: p.id, ...(p.id === 3 ? { selected: '' } : {}) }, p.name)));
  const summary = h('input', { type: 'text', placeholder: 'Summary' });
  const desc = h('textarea', { placeholder: 'Description (optional)' });
  const due = h('input', { type: 'date' });
  const submit = h('button', { class: 'btn' }, 'Create');

  projectSel.addEventListener('change', async () => {
    typeSel.replaceChildren(h('option', {}, 'Loading…'));
    typeSel.disabled = true;
    assigneeSel.replaceChildren(h('option', {}, 'Loading…'));
    assigneeSel.disabled = true;
    myselfBtn.disabled = true;
    if (!projectSel.value) return;
    const projectId = Number(projectSel.value);
    try {
      const types = await api.issueTypes(projectId);
      typeSel.replaceChildren(...types.map((t) => h('option', { value: t.id }, t.name)));
      typeSel.disabled = false;
    } catch (e) { toast('Failed to load issue types: ' + e.message); }
    try {
      const users = (await api.projectUsers(projectId)).slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));
      assigneeSel.replaceChildren(
        h('option', { value: '' }, 'Unassigned'),
        ...users.map((u) => h('option', { value: u.id }, u.name)));
      assigneeSel.disabled = false;
      myselfBtn.disabled = false;
    } catch (e) { toast('Failed to load assignees: ' + e.message); }
  });

  let myId = null; // cached across project changes within this form session
  myselfBtn.addEventListener('click', async () => {
    try {
      if (myId == null) myId = await api.myUserId();
      const has = [...assigneeSel.options].some((o) => o.value === String(myId));
      if (!has) return toast("You're not a member of this project");
      assigneeSel.value = String(myId);
    } catch (e) { toast('Failed: ' + e.message); }
  });

  submit.addEventListener('click', async () => {
    if (!projectSel.value) return toast('Please select a project');
    if (!typeSel.value || typeSel.disabled) return toast('Please select an issue type');
    if (!summary.value.trim()) return toast('Please enter a summary');
    submit.disabled = true; submit.textContent = 'Creating…';
    try {
      const issue = await api.createIssue({
        projectId: Number(projectSel.value),
        issueTypeId: Number(typeSel.value),
        priorityId: Number(prioSel.value),
        summary: summary.value.trim(),
        description: desc.value.trim() || undefined,
        dueDate: due.value || undefined,
        assigneeId: assigneeSel.value ? Number(assigneeSel.value) : undefined,
      });
      recordRecentProject(Number(projectSel.value));
      toast(`Created: ${issue.issueKey}`);
      go('list', renderList);
    } catch (e) { submit.disabled = false; submit.textContent = 'Create'; toast('Failed: ' + e.message); }
  });

  const form = h('div', {},
    h('label', {}, 'Project *'), projectSel,
    h('label', {}, 'Issue type *'), typeSel,
    h('label', {}, 'Summary *'), summary,
    h('label', {}, 'Assignee'),
    h('div', { style: 'display:flex; gap:8px' }, assigneeSel, myselfBtn),
    h('label', {}, 'Priority'), prioSel,
    h('label', {}, 'Due date'), due,
    h('label', {}, 'Description'), desc,
    h('div', { class: 'btn-row' }, submit,
      h('button', { class: 'btn secondary', onclick: () => back() }, 'Cancel')),
  );
  view.append(form);
}

// ---------- settings ----------
async function renderSettings() {
  setChrome('settings');
  stack = stack[stack.length - 1] === 'settings' ? stack : [...stack, 'settings'];
  clear();
  let cfg = { spaceDomain, hasApiKey: false };
  try { cfg = await api.getConfig(); } catch {}

  const domain = h('input', { type: 'text', placeholder: 'yourspace.backlog.com', value: cfg.spaceDomain || spaceDomain });
  const key = h('input', { type: 'password', placeholder: cfg.hasApiKey ? 'Saved (enter only to change)' : 'Paste your API key' });
  const save = h('button', { class: 'btn' }, 'Save & connect');

  save.addEventListener('click', async () => {
    save.disabled = true; save.textContent = 'Verifying…';
    try {
      await api.setConfig({ spaceDomain: domain.value.trim(), apiKey: key.value.trim() });
      spaceDomain = domain.value.trim();
      toast('Connected');
      go('list', renderList);
    } catch (e) {
      save.disabled = false; save.textContent = 'Save & connect';
      toast('Connection failed: ' + e.message);
    }
  });

  view.append(
    h('label', {}, 'Space domain'),
    domain,
    h('label', {}, 'API key'),
    key,
    h('div', { class: 'btn-row' }, save,
      cfg.hasApiKey ? h('button', { class: 'btn secondary', onclick: () => go('list', renderList) }, 'Back') : null),
    h('p', { class: 'meta', style: 'margin-top:16px' },
      'Generate an API key under Personal Settings > API.'),
    h('a', { class: 'link', onclick: () => {
      const d = (domain.value || spaceDomain).trim();
      if (d) api.openExternal(`https://${d}/EditApiSettings.action`);
      else toast('Enter your space domain first');
    } }, 'Open API key settings ↗'),
    versionLine(),
  );
}

// Version footer. Filled in asynchronously so a slow IPC can't hold up the
// settings form; it also reports whether a newer release is already known.
function versionLine() {
  const el = h('div', { class: 'version' }, 'Backlog Dashboard');
  api.appInfo().then(({ version, updateVersion }) => {
    el.replaceChildren(`Backlog Dashboard v${version}`);
    if (updateVersion) {
      el.append(h('span', { class: 'version-update' }, `update available: v${updateVersion}`));
    }
  }).catch(() => { el.textContent = 'Backlog Dashboard'; });
  return el;
}

// ---------- notifications ----------
function reasonText(reason) {
  return ({
    1: 'assigned you to', 2: 'commented on', 3: 'updated', 4: 'added a file to',
    5: 'added you to', 9: 'assigned you to PR', 10: 'commented on PR',
    11: 'updated PR', 17: 'updated PR status',
  })[reason] || 'notified you about';
}

function issueKeyOfNotification(n) {
  if (n.project && n.issue && n.issue.keyId != null) return `${n.project.projectKey}-${n.issue.keyId}`;
  return null;
}

// The count is the button's whole face: red with the number while unread, muted
// grey "0" otherwise. It never hides — this button is the only way into the list.
function updateBadge(count) {
  const n = Math.max(0, Math.trunc(count) || 0);
  notifCount.textContent = n > 9 ? '9+' : String(n); // cap keeps the circle round
  notifCount.classList.toggle('zero', n === 0);
  notifBtn.title = n > 0 ? `Notifications (${n} unread)` : 'Notifications';
}

function notifRow(n) {
  const key = issueKeyOfNotification(n);
  const sender = n.sender ? n.sender.name : 'Backlog';
  const target = key
    ? `${key}  ${(n.issue && n.issue.summary) || ''}`.trim()
    : (n.project ? n.project.name : 'Backlog');

  const dot = h('span', { class: `unread-dot ${n.alreadyRead ? 'read' : ''}` });
  // Per-notification "mark as read" control; only shown while unread.
  const readBtn = h('button', { class: 'notif-read-btn', title: 'Mark as read' }, 'Mark read');

  const row = h('div', { class: `notif ${n.alreadyRead ? '' : 'unread'}` },
    dot,
    h('div', { class: 'body' },
      h('div', { class: 'who' }, h('b', {}, sender), ' ' + reasonText(n.reason)),
      h('div', { class: 'target' }, target),
      h('div', { class: 'when' }, fmtDateTime(n.created)),
    ),
    n.alreadyRead ? null : readBtn,
  );

  // Mark this one notification read and reflect it in place (badge refreshes via
  // the main-process poll triggered by markNotificationRead).
  const markRead = () => {
    if (n.alreadyRead) return;
    n.alreadyRead = true;
    api.markNotificationRead(n.id).catch(() => {});
    row.classList.remove('unread');
    dot.classList.add('read');
    readBtn.remove();
  };

  readBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // don't also open the issue / navigate
    markRead();
  });
  row.addEventListener('click', () => {
    markRead();
    if (key) openDetail(key);
    else api.openExternal(`https://${spaceDomain}/`);
  });
  return row;
}

// Session cache so reopening the list (or coming back from a detail view) paints
// instantly from the last fetch, then revalidates quietly in the background.
let notifCache = null;

// Warm the cache without touching the UI (used at startup and while the
// notifications view is closed, so the next open is instant and fresh).
async function prefetchNotifications() {
  try { notifCache = await api.notifications(); } catch { /* keep whatever we have */ }
}
const notifSig = (l) => l.map((n) => `${n.id}:${n.alreadyRead ? 1 : 0}`).join(',');

function paintNotifications(list) {
  const scrollTop = view.scrollTop; // keep the reading position across repaints
  clear();
  const head = h('div', { class: 'notif-head' },
    h('span', { class: 'meta' }, `${list.length} notifications`),
    h('a', { class: 'link', onclick: async () => {
      try {
        await api.markAllNotificationsRead();
        // Reflect locally instead of refetching: the server can briefly keep
        // reporting items unread right after markAsRead.
        list.forEach((n) => { n.alreadyRead = true; });
        toast('All marked as read');
        paintNotifications(list);
      } catch (e) { toast('Failed: ' + e.message); }
    } }, 'Mark all read'));
  view.append(head);
  if (!list.length) view.append(h('div', { class: 'empty' }, 'No notifications'));
  else for (const n of list) view.append(notifRow(n));
  view.scrollTop = scrollTop;
}

async function renderNotifications({ background = false } = {}) {
  setChrome('notifications');
  const hadCache = !!notifCache;
  if (!background) {
    if (hadCache) paintNotifications(notifCache); // instant paint from cache
    else showLoading(); // first open this session: nothing cached yet
  }
  try {
    const list = await api.notifications();
    const changed = !notifCache || notifSig(list) !== notifSig(notifCache);
    notifCache = list;
    // Don't clobber another view if the user navigated away mid-fetch.
    if (stack[stack.length - 1] !== 'notifications') return;
    // Repaint only when the data changed, or when the spinner is still up
    // (first foreground load). Otherwise the cached paint already matches.
    if (changed || (!background && !hadCache)) paintNotifications(list);
  } catch (e) {
    // With a cached view on screen, silently keep it; error out only on a
    // foreground load with nothing to show.
    if (!background && !notifCache) showError(e);
  }
}

// ---------- wiring ----------
backBtn.addEventListener('click', back);
addBtn.addEventListener('click', () => go('add', renderAdd));
refreshBtn.addEventListener('click', () => {
  const cur = stack[stack.length - 1];
  if (cur === 'notifications') renderNotifications(); else renderList();
});
settingsBtn.addEventListener('click', () => go('settings', renderSettings));
notifBtn.addEventListener('click', () => go('notifications', renderNotifications));
api.onRefresh(() => { if (stack[stack.length - 1] === 'list') renderList(); });
api.onNotificationsUpdated((count) => updateBadge(count));
// New activity detected by the main-process poller → refresh an open list
// quietly, or just re-warm the cache when the list isn't on screen.
api.onNotificationsNew(() => {
  if (stack[stack.length - 1] === 'notifications') renderNotifications({ background: true });
  else prefetchNotifications();
});

(async function init() {
  try { spaceDomain = await api.spaceDomain(); } catch {}
  try {
    const cfg = await api.getConfig();
    if (!cfg.hasApiKey) { renderSettings(); return; }
  } catch {}
  renderList();
  prefetchNotifications(); // warm the cache so the first open of the list is instant
  try { updateBadge(await api.unreadCount()); } catch {}
})();
})();
