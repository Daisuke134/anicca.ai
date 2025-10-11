export {};
type OpenAIRealtimeWebRTCConstructor = typeof import('@openai/agents-realtime').OpenAIRealtimeWebRTC;

type ClientSecretPayload = {
  value: string;
  expiresAt: number;
};

type ElectronAPI = {
  getClientSecret: () => Promise<ClientSecretPayload>;
  notifyCallId: (id: string) => void;
  setMode: (mode: 'silent' | 'conversation', reason: string) => Promise<void>;
  setTimezone: (tz: string) => Promise<void>;
  requestRestart: () => Promise<void>;
  onSessionEvent: (callback: (payload: unknown) => void) => () => void;
  onVoiceRestart: (callback: () => void) => () => void;
  onTimezoneRequest: (callback: (tz: string) => void) => () => void;
};

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    OpenAIAgentsRealtime?: {
      OpenAIRealtimeWebRTC: OpenAIRealtimeWebRTCConstructor;
    };
  }
}

const electronAPI = window.electronAPI;

function getRealtimeConstructor(): OpenAIRealtimeWebRTCConstructor {
  const ctor = window.OpenAIAgentsRealtime?.OpenAIRealtimeWebRTC;
  if (!ctor) {
    throw new Error('OpenAIRealtimeWebRTC global is not loaded. Ensure the UMD bundle is included before webrtcClient.js.');
  }
  return ctor;
}

type OpenAIRealtimeWebRTCInstance = InstanceType<OpenAIRealtimeWebRTCConstructor>;

const audioElement = document.createElement('audio');
audioElement.autoplay = true;
audioElement.controls = false;
audioElement.style.display = 'none';
document.body.appendChild(audioElement);

type ReconnectReason = 'initial' | 'track-ended' | 'voice-restart' | 'retry';

let client: OpenAIRealtimeWebRTCInstance | null = null;
let mediaStream: MediaStream | null = null;
let detachSessionEvents: (() => void) | null = null;
let realtimeUnsubscribers: Array<() => void> = [];
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function cleanupMediaStream() {
  if (!mediaStream) return;
  mediaStream.getTracks().forEach((track) => track.stop());
  mediaStream = null;
}

function clearRealtimeListeners() {
  for (const unsubscribe of realtimeUnsubscribers) {
    try {
      unsubscribe();
    } catch (error) {
      console.warn('[renderer] listener unsubscribe failed', error);
    }
  }
  realtimeUnsubscribers = [];

  if (detachSessionEvents) {
    try {
      detachSessionEvents();
    } catch (error) {
      console.warn('[renderer] failed to detach session events', error);
    }
    detachSessionEvents = null;
  }
}

function registerClientEvents(rtc: OpenAIRealtimeWebRTCInstance) {
  clearRealtimeListeners();
  detachSessionEvents = electronAPI.onSessionEvent((payload) => {
    if (typeof payload === 'object' && payload !== null) {
      if ((payload as any).type === 'mode_set') {
        console.log('[renderer] mode_set', payload);
      }
    }
  });

  const handleConnectionChange = (status: unknown) => {
    console.log('[renderer] connection_change', status);
  };
  rtc.on('connection_change', handleConnectionChange);
  realtimeUnsubscribers.push(() => {
    try {
      rtc.off('connection_change', handleConnectionChange as any);
    } catch (error) {
      console.warn('[renderer] failed to remove connection_change listener', error);
    }
  });

  const handleSessionCreated = (event: unknown) => {
    const session = (event as any)?.session;
    const callId = session?.callId ?? session?.call_id;
    if (typeof callId === 'string' && callId.length > 0) {
      electronAPI.notifyCallId(callId);
    }
  };
  rtc.on('session.created', handleSessionCreated as any);
  realtimeUnsubscribers.push(() => {
    try {
      rtc.off('session.created', handleSessionCreated as any);
    } catch (error) {
      console.warn('[renderer] failed to remove session.created listener', error);
    }
  });

  const handleError = (error: unknown) => {
    console.error('[renderer] realtime error', error);
    scheduleRetry();
  };
  rtc.on('error', handleError as any);
  realtimeUnsubscribers.push(() => {
    try {
      rtc.off('error', handleError as any);
    } catch (error) {
      console.warn('[renderer] failed to remove error listener', error);
    }
  });
}

async function connectRealtime(reason: ReconnectReason = 'initial'): Promise<void> {
  console.log('[renderer] connecting realtime transport', { reason });
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  try {
    const secret = await electronAPI.getClientSecret();

    cleanupMediaStream();
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const [track] = mediaStream.getAudioTracks();
    if (track) {
      track.onended = () => {
        reconnect('track-ended').catch((error) => console.error('[renderer] track-ended reconnect failed', error));
      };
    }

    try {
      client?.close?.();
    } catch (error) {
      console.warn('[renderer] client close before init failed', error);
    }

    const RealtimeConstructor = getRealtimeConstructor();
    const rtc = new RealtimeConstructor({
      audioElement,
      mediaStream,
    });

    registerClientEvents(rtc);

    await rtc.connect({
      apiKey: secret.value,
      model: 'gpt-realtime',
      initialSessionConfig: {
        modalities: ['text', 'audio'],
        inputAudioFormat: 'pcm16',
        outputAudioFormat: 'pcm16',
      },
    });

    client = rtc;
  } catch (error) {
    console.error('[renderer] connectRealtime failed', error);
    scheduleRetry();
  }
}

function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    reconnect('retry').catch((error) => console.error('[renderer] retry reconnect failed', error));
  }, 1500);
}

async function reconnect(reason: ReconnectReason): Promise<void> {
  try {
    clearRealtimeListeners();
    client?.close?.();
  } catch (error) {
    console.warn('[renderer] client close failed', error);
  }
  client = null;
  cleanupMediaStream();
  await connectRealtime(reason);
}

async function applyTimezone(tz: string) {
  if (!tz) return;
  try {
    await electronAPI.setTimezone(tz);
  } catch (error) {
    console.warn('[renderer] failed to set timezone', error);
  }
}

function bootstrap() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  void applyTimezone(tz);
  void connectRealtime('initial');
}

window.addEventListener('DOMContentLoaded', bootstrap);

electronAPI.onVoiceRestart(() => {
  reconnect('voice-restart').catch((error) => console.error('[renderer] voice restart failed', error));
});

electronAPI.onTimezoneRequest((tz) => {
  void applyTimezone(tz);
});

window.addEventListener('beforeunload', () => {
  clearRealtimeListeners();
  try {
    client?.close?.();
  } catch (error) {
    console.warn('[renderer] client close on unload failed', error);
  }
  cleanupMediaStream();
});
