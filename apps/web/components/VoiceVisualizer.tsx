'use client'

import { useEffect, useRef } from 'react'

interface VoiceVisualizerProps {
  audioData?: Float32Array
  isActive: boolean
}

export default function VoiceVisualizer({ audioData, isActive }: VoiceVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      if (!isActive) {
        // アイドル状態：中央に小さな円
        ctx.beginPath()
        ctx.arc(canvas.width / 2, canvas.height / 2, 3, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
        ctx.fill()
      } else if (audioData && audioData.length > 0) {
        // 音声データを可視化
        const barWidth = canvas.width / audioData.length
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
        
        for (let i = 0; i < audioData.length; i++) {
          const barHeight = (audioData[i] + 1) * canvas.height / 2
          ctx.fillRect(
            i * barWidth,
            (canvas.height - barHeight) / 2,
            barWidth - 1,
            barHeight
          )
        }
      } else {
        // アクティブだがデータなし：波形アニメーション
        const time = Date.now() / 1000
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'
        ctx.lineWidth = 2
        ctx.beginPath()
        
        for (let x = 0; x < canvas.width; x++) {
          const y = canvas.height / 2 + 
            Math.sin((x / canvas.width) * Math.PI * 4 + time * 3) * 20
          if (x === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        }
        
        ctx.stroke()
      }
      
      animationRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [audioData, isActive])

  return (
    <canvas
      ref={canvasRef}
      width={256}
      height={128}
      className="w-64 h-32"
    />
  )
}