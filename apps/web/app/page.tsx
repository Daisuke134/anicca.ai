'use client'

import { useState, useEffect, useRef } from 'react'
import VoiceVisualizer from '@/components/VoiceVisualizer'
import ServiceConnections from '@/components/ServiceConnections'

export default function Home() {
  const PROXY_BASE = process.env.NEXT_PUBLIC_PROXY_URL;
  if (!PROXY_BASE) {
    throw new Error('NEXT_PUBLIC_PROXY_URL is not set');
  }
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const audioElementRef = useRef<HTMLAudioElement | null>(null)
  
  // Generate session ID
  function generateSessionId() {
    const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    localStorage.setItem('aniccaSessionId', sessionId)
    return sessionId
  }

  // WebRTCセッションを開始
  async function startVoiceSession() {
    try {
      // Starting voice session...
      setStatus('connecting')
      
      // Get session from proxy with sessionId
      const sessionId = localStorage.getItem('aniccaSessionId') || generateSessionId();
      const sessionUrl = `${PROXY_BASE}/api/openai-proxy/session?sessionId=${sessionId}`
      const sessionResponse = await fetch(sessionUrl)
      const session = await sessionResponse.json()
      // Session received
      
      // Set up WebRTC
      pcRef.current = new RTCPeerConnection()
      
      // Audio element for playback
      audioElementRef.current = document.createElement('audio')
      audioElementRef.current.autoplay = true
      pcRef.current.ontrack = e => {
        if (audioElementRef.current) {
          audioElementRef.current.srcObject = e.streams[0]
        }
      }
      
      // Data channel for communication
      dataChannelRef.current = pcRef.current.createDataChannel('oai-events')
      dataChannelRef.current.onopen = () => {
        // Data channel opened
        
        // Send session config
        dataChannelRef.current?.send(JSON.stringify({
          type: 'session.update',
          session: {
            instructions: session.instructions,
            voice: session.voice,
            input_audio_format: session.input_audio_format,
            output_audio_format: session.output_audio_format,
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: session.turn_detection,
            tools: session.tools,
            tool_choice: 'auto',
            temperature: session.temperature,
            max_response_output_tokens: session.max_response_output_tokens
          }
        }))
      }
      
      dataChannelRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          // Message received: data.type
          
          if (data.type === 'response.function_call_arguments.done') {
            handleFunctionCall(data)
          }
        } catch (error) {
          console.error('Message handling error:', error)
        }
      }
      
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      pcRef.current.addTrack(stream.getTracks()[0])
      
      // Create offer
      const offer = await pcRef.current.createOffer()
      await pcRef.current.setLocalDescription(offer)
      
      // Connect to OpenAI
      const response = await fetch('https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17', {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${session.client_secret.value}`,
          'Content-Type': 'application/sdp'
        }
      })
      
      const answerSdp = await response.text()
      await pcRef.current.setRemoteDescription({ type: 'answer', sdp: answerSdp })
      
      // Voice session started successfully
      setStatus('connected')
      
    } catch (error) {
      console.error('❌ Failed to start voice session:', error)
      setError(error instanceof Error ? error.message : 'Failed to connect')
      setStatus('error')
    }
  }
  
  // Function to handle tool calls
  async function handleFunctionCall(data: any) {
    const { call_id, name, arguments: args } = data
    
    try {
      // Tool call: ${name}
      
      // Slackツールの場合は専用エンドポイントを使用
      let toolsUrl;
      let requestBody;
      
      if (name.startsWith('slack_')) {
        toolsUrl = `${PROXY_BASE}/api/tools/slack`;
        const parsedArgs = JSON.parse(args);
        requestBody = {
          action: name.replace('slack_', ''), // slack_send_message -> send_message
          arguments: parsedArgs
        };
      } else {
        toolsUrl = `${PROXY_BASE}/api/tools/${name}`;
        requestBody = {
          arguments: JSON.parse(args)
        };
      }
      
      const response = await fetch(toolsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })
      
      const result = await response.json()
      
      // Send result back to OpenAI
      dataChannelRef.current?.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: call_id,
          output: JSON.stringify(result.result || result)
        }
      }))
      
      // Trigger response
      setTimeout(() => {
        dataChannelRef.current?.send(JSON.stringify({
          type: 'response.create',
          response: { modalities: ['text', 'audio'] }
        }))
      }, 100)
      
    } catch (error) {
      console.error('Function call error:', error)
    }
  }
  
  // 自動的に開始
  useEffect(() => {
    const timer = setTimeout(() => {
      startVoiceSession()
    }, 1000)
    
    return () => {
      clearTimeout(timer)
      if (pcRef.current) {
        pcRef.current.close()
      }
    }
  }, [])

  return (
    <div className="min-h-screen bg-black flex items-center justify-center relative">
      {/* Service connections in top right */}
      <ServiceConnections />
      
      <div className="flex flex-col items-center gap-8">
        {/* 音声波形表示エリア */}
        <VoiceVisualizer 
          audioData={undefined} // 後で実装
          isActive={status === 'connected'}
        />

        {/* ステータス表示 */}
        <div className="text-white text-lg">
          {error && <span className="text-red-500">{error}</span>}
          {!error && status === 'idle' && 'Starting...'}
          {!error && status === 'connecting' && 'Connecting...'}
          {!error && status === 'connected' && 'Listening...'}
        </div>
      </div>
    </div>
  )
}
