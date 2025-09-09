'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

interface Service {
  id: string
  name: string
  icon: string
  connected: boolean
  available: boolean
}

export default function ServiceConnections() {
  const PROXY_BASE = process.env.NEXT_PUBLIC_PROXY_URL;
  if (!PROXY_BASE) {
    throw new Error('NEXT_PUBLIC_PROXY_URL is not set');
  }
  const [services, setServices] = useState<Service[]>([
    { id: 'slack', name: 'Slack', icon: '/slack.svg', connected: false, available: true },
    { id: 'google-calendar', name: 'Calendar', icon: '', connected: false, available: false },
    { id: 'github', name: 'GitHub', icon: '', connected: false, available: false },
    { id: 'gmail', name: 'Gmail', icon: '', connected: false, available: false },
  ])
  const [loading, setLoading] = useState(false)

  // Check connection status on mount and after OAuth
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('success') === 'true') {
      const service = urlParams.get('service')
      if (service) {
        // Update the connected status
        setServices(prev => prev.map(s => 
          s.id === service ? { ...s, connected: true } : s
        ))
        // Store connection status in localStorage
        localStorage.setItem(`anicca_${service}_connected`, 'true')
      }
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname)
    }
    
    // Verify actual connection status with proxy
    checkConnectionStatus()
  }, [])
  
  // Check actual connection status with proxy
  async function checkConnectionStatus() {
    const sessionId = localStorage.getItem('aniccaSessionId')
    if (!sessionId) return
    
    try {
      const response = await fetch(`${PROXY_BASE}/api/slack/check-connection?sessionId=${sessionId}`)
      if (response.ok) {
        const data = await response.json()
        setServices(prev => prev.map(service => {
          if (service.id === 'slack') {
            const isConnected = data.connected === true
            // Update localStorage to match server state
            if (isConnected) {
              localStorage.setItem(`anicca_slack_connected`, 'true')
            } else {
              localStorage.removeItem(`anicca_slack_connected`)
            }
            return { ...service, connected: isConnected }
          }
          return service
        }))
      }
    } catch (error) {
      console.error('Failed to check connection status:', error)
      // Fallback to localStorage
      setServices(prev => prev.map(service => ({
        ...service,
        connected: localStorage.getItem(`anicca_${service.id}_connected`) === 'true'
      })))
    }
  }

  async function connectService(serviceId: string) {
    if (!services.find(s => s.id === serviceId)?.available) return
    
    setLoading(true)
    try {
      // Get OAuth URL from proxy
      const sessionId = localStorage.getItem('aniccaSessionId') || generateSessionId();
      const params = new URLSearchParams({
        sessionId: sessionId
      });
      
      // Slack専用のOAuthエンドポイントを使用
      if (serviceId === 'slack') {
        const response = await fetch(`${PROXY_BASE}/api/slack/oauth-url?${params}`, {
          method: 'GET'
        })
        
        if (response.ok) {
          const data = await response.json()
          window.location.href = data.url || data.oauthUrl // Slack APIはurlプロパティを返す
        }
      } else {
        // 他のサービスは「Coming Soon」なので何もしない
        // Service ${serviceId} is not available yet
      }
    } catch (error) {
      console.error('Connection error:', error)
    } finally {
      setLoading(false)
    }
  }

  function generateSessionId() {
    const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    localStorage.setItem('aniccaSessionId', sessionId)
    return sessionId
  }

  return (
    <div className="fixed top-4 right-4 flex gap-2 z-50">
      {services.map(service => (
        <button
          key={service.id}
          onClick={() => connectService(service.id)}
          disabled={!service.available || loading}
          className={`
            relative w-10 h-10 rounded-lg flex items-center justify-center
            transition-all duration-200 
            ${service.available 
              ? service.connected
                ? 'bg-green-500/20 border-2 border-green-500'
                : 'bg-white/10 hover:bg-white/20 border border-white/20'
              : 'bg-white/5 opacity-50 cursor-not-allowed'
            }
          `}
          title={service.name}
        >
          {service.icon && service.available ? (
            <Image 
              src={service.icon} 
              alt={service.name}
              width={24}
              height={24}
              className="w-6 h-6"
            />
          ) : (
            <div className="w-6 h-6 bg-white/20 rounded" />
          )}
          
          {/* Connection status indicator */}
          {service.connected && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full" />
          )}
          
          {/* Coming soon badge */}
          {!service.available && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[8px] text-white/50">Soon</span>
            </div>
          )}
        </button>
      ))}
    </div>
  )
}
