'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // config
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (cfg) => ipcRenderer.invoke('config:set', cfg),
  // tasks
  myTasks: () => ipcRenderer.invoke('tasks:mine'),
  issueDetail: (issueKey) => ipcRenderer.invoke('issue:detail', issueKey),
  addComment: (issueKey, content) => ipcRenderer.invoke('issue:comment', { issueKey, content }),
  setStatus: (issueKey, statusId, comment) => ipcRenderer.invoke('issue:status', { issueKey, statusId, comment }),
  // quick add
  formOptions: () => ipcRenderer.invoke('form:options'),
  issueTypes: (projectId) => ipcRenderer.invoke('form:issueTypes', projectId),
  createIssue: (payload) => ipcRenderer.invoke('issue:create', payload),
  // notifications
  notifications: () => ipcRenderer.invoke('notifications:list'),
  markNotificationRead: (id) => ipcRenderer.invoke('notifications:markRead', id),
  markAllNotificationsRead: () => ipcRenderer.invoke('notifications:markAllRead'),
  unreadCount: () => ipcRenderer.invoke('notifications:unread'),
  // misc
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  spaceDomain: () => ipcRenderer.invoke('space:domain'),
  // events
  onShown: (cb) => ipcRenderer.on('window:shown', cb),
  onRefresh: (cb) => ipcRenderer.on('tasks:refresh', cb),
  onNotificationsUpdated: (cb) => ipcRenderer.on('notifications:updated', (_e, count) => cb(count)),
  onNotificationsNew: (cb) => ipcRenderer.on('notifications:new', () => cb()),
  onOpenIssue: (cb) => ipcRenderer.on('open-issue', (_e, key) => cb(key)),
  onOpenNotifications: (cb) => ipcRenderer.on('open-notifications', () => cb()),
});
