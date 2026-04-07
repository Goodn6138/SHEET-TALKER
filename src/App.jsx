import { useState, useRef, useCallback } from 'react'
import { Mic, X, MessageSquare } from 'lucide-react'
import Spreadsheet from './components/Spreadsheet'
import ChatPanel from './components/ChatPanel'
import './App.css'

function App() {
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [messages, setMessages] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' })
        await sendAudioToBackend(audioBlob)
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (error) {
      console.error('Error accessing microphone:', error)
      alert('Could not access microphone. Please check permissions.')
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }, [isRecording])

  const sendAudioToBackend = async (audioBlob) => {
    setIsProcessing(true)
    
    try {
      // Create form data to send audio
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.wav')
      
      // Add conversation history for context
      formData.append('history', JSON.stringify(messages))

      // Send to your Groq backend
      const response = await fetch('/api/chat', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) throw new Error('Failed to get response')

      const data = await response.json()
      
      // Add messages to chat
      // Expected response: { transcription: "...", response: "..." }
      setMessages(prev => [
        ...prev,
        { 
          id: Date.now(), 
          type: 'user', 
          content: data.transcription || 'Voice message...',
          timestamp: new Date().toLocaleTimeString()
        },
        { 
          id: Date.now() + 1, 
          type: 'assistant', 
          content: data.response,
          timestamp: new Date().toLocaleTimeString()
        }
      ])
    } catch (error) {
      console.error('Error sending audio:', error)
      // Fallback for demo/development
      setMessages(prev => [
        ...prev,
        { 
          id: Date.now(), 
          type: 'user', 
          content: '🎤 Voice message recorded',
          timestamp: new Date().toLocaleTimeString()
        },
        { 
          id: Date.now() + 1, 
          type: 'assistant', 
          content: 'Sorry, I could not process that. Please check your backend connection.',
          timestamp: new Date().toLocaleTimeString(),
          isError: true
        }
      ])
    } finally {
      setIsProcessing(false)
    }
  }

  const toggleRecording = () => {
    if (!isRecording) {
      startRecording()
    } else {
      stopRecording()
    }
  }

  const togglePanel = () => {
    setIsPanelOpen(!isPanelOpen)
  }

  return (
    <div className="app-container">
      <div className="main-content">
        <header className="header">
          <h1>SHEET TALKER</h1>
          <div className="header-actions">
            <button 
              className="icon-btn"
              onClick={togglePanel}
              aria-label="Toggle chat"
            >
              <MessageSquare size={20} />
            </button>
          </div>
        </header>
        
        <div className="grid-container">
          <Spreadsheet />
        </div>
      </div>

      <ChatPanel 
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        messages={messages}
        isRecording={isRecording}
        isProcessing={isProcessing}
        onToggleRecord={toggleRecording}
      />

      {!isPanelOpen && (
        <button 
          className={`talk-fab ${isRecording ? 'recording' : ''}`}
          onClick={() => {
            setIsPanelOpen(true)
            // Optional: Auto-start recording when opening
            // setTimeout(() => startRecording(), 300)
          }}
          aria-label="Open talk panel"
        >
          <Mic size={24} />
          <span className="fab-label">TALK</span>
          {isRecording && <span className="recording-indicator" />}
        </button>
      )}
    </div>
  )
}

export default App
