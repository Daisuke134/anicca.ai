import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

type ConversationMode = 'silent' | 'conversation';

type ClientSecretPayload = {
  value: string;
  expiresAt: number;
};

type EventUnsubscribe = () => void;

declare global {
  interface Window {
    electronAPI: {
      getClientSecret: () => Promise<ClientSecretPayload>;
      notifyCallId: (id: string) => void;
      setMode: (mode: ConversationMode, reason: string) => Promise<void>;
      setTimezone: (tz: string) => Promise<void>;
      requestRestart: () => Promise<void>;
      onSessionEvent: (callback: (payload: unknown) => void) => EventUnsubscribe;
      onVoiceRestart: (callback: () => void) => EventUnsubscribe;
      onTimezoneRequest: (callback: (tz: string) => void) => EventUnsubscribe;
    };
  }
}

const expose = {
  getClientSecret: (): Promise<ClientSecretPayload> => ipcRenderer.invoke('realtime:get-client-secret'),
  notifyCallId: (id: string) => ipcRenderer.send('realtime:call-id', id),
  setMode: (mode: ConversationMode, reason: string) => ipcRenderer.invoke('realtime:set-mode', { mode, reason }),
  setTimezone: (tz: string) => ipcRenderer.invoke('realtime:set-timezone', tz),
  requestRestart: () => ipcRenderer.invoke('realtime:restart'),
  onSessionEvent: (callback: (payload: unknown) => void): EventUnsubscribe => {
    const handler = (_event: IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on('realtime:event', handler);
    return () => ipcRenderer.removeListener('realtime:event', handler);
  },
  onVoiceRestart: (callback: () => void): EventUnsubscribe => {
    const handler = () => callback();
    ipcRenderer.on('voice:restart', handler);
    return () => ipcRenderer.removeListener('voice:restart', handler);
  },
  onTimezoneRequest: (callback: (tz: string) => void): EventUnsubscribe => {
    const handler = (_event: IpcRendererEvent, tz: string) => callback(tz);
    ipcRenderer.on('anisca:timezone', handler);
    return () => ipcRenderer.removeListener('anisca:timezone', handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', expose);
