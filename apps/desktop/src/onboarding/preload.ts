import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('onboarding', {
  save: (payload: any) => ipcRenderer.invoke('onboarding:save', payload),
  openGoogle: () => ipcRenderer.invoke('onboarding:google-oauth'),
  complete: () => ipcRenderer.invoke('onboarding:complete'),
  close: () => ipcRenderer.invoke('onboarding:close'),
  onShowSettings: (callback: () => void) => {
    ipcRenderer.on('show-settings', callback);
  },
  removeShowSettingsListener: (callback: () => void) => {
    ipcRenderer.removeListener('show-settings', callback);
  },
  onAuthCompleted: (callback: () => void) => {
    ipcRenderer.on('auth-completed', callback);
  },
  removeAuthCompletedListener: (callback: () => void) => {
    ipcRenderer.removeListener('auth-completed', callback);
  },
});

