'use client'

import { useState, useEffect, useRef } from 'react'
import VoiceVisualizer from '@/components/VoiceVisualizer'
import ServiceConnections from '@/components/ServiceConnections'
import AuthModal from '@/components/AuthModal'
import { useAuth } from '@/hooks/useAuth'
// import { authenticatedFetch } from '@/lib/api-client'

export default function Home() {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const audioElementRef = useRef<HTMLAudioElement | null>(null)
  const { user, loading } = useAuth()

  // WebRTCセッションを開始
  async function startVoiceSession() {
    try {
      console.log('🎯 startVoiceSession: Starting with user:', user?.email)
      setStatus('connecting')
      
      // Get session from proxy with userId
      const proxyUrl = process.env.NEXT_PUBLIC_PROXY_URL || 'https://anicca-proxy-production.up.railway.app'
      const sessionUrl = user?.id 
        ? `${proxyUrl}/api/openai-proxy/session?userId=${user.id}`
        : `${proxyUrl}/api/openai-proxy/session`
      
      console.log('🎯 startVoiceSession: Fetching session from:', sessionUrl)
      const sessionResponse = await fetch(sessionUrl)
      
      if (!sessionResponse.ok) {
        const errorText = await sessionResponse.text()
        console.error('🎯 startVoiceSession: Session fetch failed:', sessionResponse.status, errorText)
        throw new Error(`Session fetch failed: ${sessionResponse.status}`)
      }
      
      const session = await sessionResponse.json()
      console.log('🎯 startVoiceSession: Session received:', session.client_secret ? 'with secret' : 'no secret')
      
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
      const response = await fetch('https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2025-06-03', {
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
      console.error('❌ Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      })
      setError(error instanceof Error ? error.message : 'Failed to connect')
      setStatus('error')
    }
  }
  
  // Function to handle tool calls
  async function handleFunctionCall(data: any) {
    const { call_id, name, arguments: args } = data
    
    console.log('🛠️ [Anicca] Tool call received:', {
      name: name,
      args: args,
      hasUser: !!user,
      userId: user?.id
    })
    
    try {
      // Tool call: ${name}
      
      // Slackツールの場合は専用エンドポイントを使用
      let toolsUrl;
      let requestBody;
      
      if (name.startsWith('slack_')) {
        const proxyUrl = process.env.NEXT_PUBLIC_PROXY_URL || 'https://anicca-proxy-production.up.railway.app'
        toolsUrl = `${proxyUrl}/api/tools/slack`;
        const parsedArgs = JSON.parse(args);
        requestBody = {
          action: name.replace('slack_', ''), // slack_send_message -> send_message
          arguments: parsedArgs,
          userId: user?.id // ユーザーIDを追加
        };
      } else {
        const proxyUrl = process.env.NEXT_PUBLIC_PROXY_URL || 'https://anicca-proxy-production.up.railway.app'
        toolsUrl = `${proxyUrl}/api/tools/${name}`;
        
        // claude_codeの場合はuserIDを追加
        const parsedArgs = JSON.parse(args);
        if (name === 'claude_code' && user?.id) {
          parsedArgs.userId = user.id;
          parsedArgs.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          console.log('🎯 [Anicca] Adding userId and timezone to claude_code:', {
            userId: user.id,
            timezone: parsedArgs.timezone,
            originalArgs: args,
            modifiedArgs: parsedArgs
          })
        }
        
        requestBody = {
          arguments: parsedArgs
        };
      }
      
      console.log('📤 [Anicca] Sending request to:', {
        url: toolsUrl,
        body: requestBody,
        hasUserId: !!requestBody.arguments?.userId
      })
      
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
  
  // 自動的に開始（ログインしている場合のみ）
  useEffect(() => {
    if (!loading && user) {
      const timer = setTimeout(() => {
        startVoiceSession()
      }, 1000)
      
      return () => {
        clearTimeout(timer)
        if (pcRef.current) {
          pcRef.current.close()
        }
      }
    }
  }, [loading, user])

  return (
    <div className="min-h-screen bg-black flex items-center justify-center relative">
      {/* Service connections in top right */}
      <ServiceConnections />
      
      {/* User info in top left */}
      <div className="absolute top-4 left-4 flex items-center gap-4">
        {user ? (
          <>
            <span className="text-white text-sm">{user.email}</span>
            <button
              onClick={() => window.location.href = '/auth/signout'}
              className="text-gray-400 hover:text-white text-sm"
            >
              Sign out
            </button>
          </>
        ) : (
          <button
            onClick={() => setShowAuthModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
          >
            Sign in
          </button>
        )}
      </div>
      
      <div className="flex flex-col items-center gap-8">
        {/* 音声波形表示エリア */}
        <VoiceVisualizer 
          audioData={undefined} // 後で実装
          isActive={status === 'connected'}
        />

        {/* ステータス表示 */}
        <div className="text-white text-lg">
          {!user && !loading && (
            <p className="text-gray-400">Sign in to get started</p>
          )}
          {user && (
            <>
              {error && <span className="text-red-500">{error}</span>}
              {!error && status === 'idle' && 'Starting...'}
              {!error && status === 'connecting' && 'Connecting...'}
              {!error && status === 'connected' && 'Listening...'}
            </>
          )}
        </div>
      </div>
      
      <AuthModal 
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </div>
  )
}