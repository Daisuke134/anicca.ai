import { contextBridge, ipcRenderer } from 'electron';

// レンダラープロセスがアクセスできる安全なAPIを公開
contextBridge.exposeInMainWorld('aniccaAPI', {
  // 言語設定
  setLanguage: (language: string) => ipcRenderer.invoke('set-language', language),
  
  // 実況制御
  startNarration: () => ipcRenderer.invoke('start-narration'),
  stopNarration: () => ipcRenderer.invoke('stop-narration'),
  
  // 状態取得
  getState: () => ipcRenderer.invoke('get-state'),
  getHealth: () => ipcRenderer.invoke('get-health'),
  
  // データ取得
  getObservations: (date: string) => ipcRenderer.invoke('get-observations', date),
  getRecentObservations: (limit?: number) => ipcRenderer.invoke('get-recent-observations', limit),
  getDailyData: (date: string) => ipcRenderer.invoke('get-daily-data', date),
  
  // 設定
  getSetting: (key: string) => ipcRenderer.invoke('get-setting', key),
  setSetting: (key: string, value: any) => ipcRenderer.invoke('set-setting', key, value),
  getAllSettings: () => ipcRenderer.invoke('get-all-settings'),
  setMultipleSettings: (settings: Record<string, any>) => ipcRenderer.invoke('set-multiple-settings', settings),
  
  // 現在の理解
  getCurrentUnderstanding: () => ipcRenderer.invoke('get-current-understanding'),
  
  
  // ハイライト取得
  getHighlights: (period: string, targetDate: string) => ipcRenderer.invoke('get-highlights', period, targetDate),
  
  // User Profile
  getUserProfile: () => ipcRenderer.invoke('get-user-profile'),
  saveUserProfile: (profile: {
    emailBehavior: string;
    docsBehavior: string;
    youtubeLimit: string;
    workStyle: string;
    goals: string;
  }) => ipcRenderer.invoke('save-user-profile', profile),
  
  // Gemini Model
  setModel: (modelName: string) => ipcRenderer.invoke('set-model', modelName),
  
  // SDK Logs
  openSDKLogs: () => ipcRenderer.invoke('open-sdk-logs'),
  
  // Gemini APIプロキシ
  proxyGeminiRequest: (requestData: { method: string; endpoint: string; data?: any }) => 
    ipcRenderer.invoke('proxy-gemini-request', requestData),
  
  // MCP API
  mcpAPI: {
    setExaKey: (apiKey: string) => ipcRenderer.invoke('mcp-set-exa-key', apiKey),
    connectExa: (options?: { mode?: 'local' | 'remote', remoteUrl?: string }) => ipcRenderer.invoke('mcp-connect-exa', options),
    searchWeb: (query: string, options?: any) => ipcRenderer.invoke('mcp-search-web', query, options),
    listTools: () => ipcRenderer.invoke('mcp-list-tools'),
    disconnect: () => ipcRenderer.invoke('mcp-disconnect')
  },
  
  // イベントリスナー
  onCommentary: (callback: (data: any) => void) => {
    ipcRenderer.on('commentary', (_, data) => callback(data));
  },
  
  onError: (callback: (data: any) => void) => {
    ipcRenderer.on('error', (_, data) => callback(data));
  },
  
  onUnderstandingUpdate: (callback: (data: any) => void) => {
    ipcRenderer.on('understanding-update', (_, data) => callback(data));
  },

  // 汎用IPCイベントリスナー（使用量制限等で使用）
  onEvent: (eventName: string, callback: (data: any) => void) => {
    ipcRenderer.on(eventName, (_, data) => callback(data));
  },
  
  // リスナーを削除
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

// TypeScript型定義（グローバル）
declare global {
  interface Window {
    aniccaAPI: {
      setLanguage: (language: string) => Promise<{ success: boolean }>;
      startNarration: () => Promise<{ success: boolean; message: string; timestamp: number }>;
      stopNarration: () => Promise<{ success: boolean; message: string; timestamp: number }>;
      getState: () => Promise<any>;
      getHealth: () => Promise<any>;
      getObservations: (date: string) => Promise<any>;
      getRecentObservations: (limit?: number) => Promise<any>;
      getDailyData: (date: string) => Promise<any>;
      getSetting: (key: string) => Promise<any>;
      setSetting: (key: string, value: any) => Promise<any>;
      getAllSettings: () => Promise<any>;
      setMultipleSettings: (settings: Record<string, any>) => Promise<any>;
      getCurrentUnderstanding: () => Promise<any>;
      getHighlights: (period: string, targetDate: string) => Promise<any>;
      getUserProfile: () => Promise<any>;
      saveUserProfile: (profile: {
        emailBehavior: string;
        docsBehavior: string;
        youtubeLimit: string;
        workStyle: string;
        goals: string;
      }) => Promise<any>;
      setModel: (modelName: string) => Promise<any>;
      openSDKLogs: () => Promise<any>;
      proxyGeminiRequest: (requestData: { method: string; endpoint: string; data?: any }) => Promise<any>;
      mcpAPI: {
        setExaKey: (apiKey: string) => Promise<any>;
        connectExa: () => Promise<any>;
        searchWeb: (query: string, options?: any) => Promise<any>;
        listTools: () => Promise<any>;
        disconnect: () => Promise<any>;
      };
      onCommentary: (callback: (data: any) => void) => void;
      onError: (callback: (data: any) => void) => void;
      onUnderstandingUpdate: (callback: (data: any) => void) => void;
      onEvent: (eventName: string, callback: (data: any) => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
} 