import { useEffect, useRef } from 'react'

function AudioVisualizer() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    let animationId
    
    const bars = 20
    const barWidth = canvas.width / bars
    
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#3b82f6'
      
      for (let i = 0; i < bars; i++) {
        const height = Math.random() * canvas.height * 0.8 + canvas.height * 0.1
        const x = i * barWidth
        const y = (canvas.height - height) / 2
        
        // Rounded bars
        ctx.beginPath()
        ctx.roundRect(x + 1, y, barWidth - 2, height, 4)
        ctx.fill()
      }
      
      animationId = requestAnimationFrame(animate)
    }
    
    animate()
    
    return () => cancelAnimationFrame(animationId)
  }, [])

  return (
    <div className="visualizer-container">
      <canvas 
        ref={canvasRef} 
        width={200} 
        height={40}
        className="audio-visualizer"
      />
      <span className="visualizer-label">Listening...</span>
    </div>
  )
}

export default AudioVisualizer
