import { useState, useRef, useCallback } from 'react'
import { Mic, X, Upload, FileSpreadsheet } from 'lucide-react'
import DataGrid from 'react-data-grid'
import ChatMessage from './components/ChatMessage'
import AudioVisualizer from './components/AudioVisualizer'
import * as XLSX from 'xlsx'
import './App.css'

function App() {
  const [columns, setColumns] = useState([])
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [showRightPanel, setShowRightPanel] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [messages, setMessages] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const fileInputRef = useRef(null)

  // EXACT same parsing as your working original
  const handleFileUpload = (file) => {
    if (!file) return
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      alert('Please upload an Excel file (.xlsx or .xls)')
      return
    }

    const reader = new FileReader()
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result)
      const workbook = XLSX.read(data, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
      
      if (!jsonData.length) return

      const headers = jsonData[0]
      const cols = headers.map((header, i) => ({
        key: `col_${i}`,
        name: header || `Column ${i + 1}`,
        editable: true,
        resizable: true
      }))

      const formattedRows = jsonData.slice(1).map((row, i) => {
        const obj = { id: i }
        row.forEach((cell, j) => {
          obj[`col_${j}`] = cell
        })
        return obj
      })

      setColumns(cols)
      setRows(formattedRows)
      setFileName(file.name)
    }
    reader.readAsArrayBuffer(file)
  }

  // Audio handlers (same as before)
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' })
        await sendAudioToBackend(audioBlob)
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (error) {
      alert('Could not access microphone.')
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
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.wav')
      formData.append('history', JSON.stringify(messages))
      
      const response = await fetch('/api/chat', { method: 'POST', body: formData })
      const data = await response.json()
      
      setMessages(prev => [
        ...prev,
        { id: Date.now(), type: 'user', content: data.transcription || '🎤 Voice', timestamp: new Date().toLocaleTimeString() },
        { id: Date.now() + 1, type: 'assistant', content: data.response, timestamp: new Date().toLocaleTimeString() }
      ])
    } catch (error) {
      setMessages(prev => [...prev, { id: Date.now(), type: 'assistant', content: 'Error connecting to backend', timestamp: new Date().toLocaleTimeString(), isError: true }])
    } finally {
      setIsProcessing(false)
    }
  }

  const toggleRecording = () => {
    if (!isRecording) startRecording()
    else stopRecording()
  }

  const hasData = columns.length > 0

  return (
    <div className="app-container">
      <div className="header">
        <div className="header-left">
          <h2>SHEET TALKER</h2>
          {fileName && <span className="file-badge">📄 {fileName}</span>}
        </div>
        <input 
          type="file" 
          accept=".xlsx,.xls" 
          ref={fileInputRef}
          onChange={(e) => handleFileUpload(e.target.files[0])}
          style={{ display: 'none' }}
        />
        <button className="upload-btn" onClick={() => fileInputRef.current?.click()}>
          <Upload size={20} />
        </button>
      </div>

      <div className="grid-container">
        {!hasData ? (
          <div className="empty-state">
            <FileSpreadsheet size={64} />
            <h3>Drop Excel file here</h3>
            <button onClick={() => fileInputRef.current?.click()}>Choose File</button>
          </div>
        ) : (
          <DataGrid columns={columns} rows={rows} onRowsChange={setRows} style={{ height: '100%' }} />
        )}
      </div>

      {showRightPanel && (
        <div className="right-panel">
          <div className="panel-header">
            <span></span> {/* Empty - no "Sheet Assistant" text */}
            <button onClick={() => setShowRightPanel(false)}><X size={20} /></button>
          </div>
          
          <div className="panel-messages">
            {messages.length === 0 ? (
              <div className="empty-chat">
                <p>🎤 Press Talk to start</p>
              </div>
            ) : (
              messages.map(m => <ChatMessage key={m.id} message={m} />)
            )}
            {isProcessing && <div className="processing">Processing...</div>}
          </div>

          <div className="panel-footer">
            {isRecording && <AudioVisualizer />}
            <button 
              className={`talk-btn ${isRecording ? 'recording' : ''}`}
              onClick={toggleRecording}
              disabled={isProcessing}
            >
              {isRecording ? 'Stop' : 'Talk'}
            </button>
          </div>
        </div>
      )}

      {!showRightPanel && (
        <button className={`fab ${isRecording ? 'recording' : ''}`} onClick={() => setShowRightPanel(true)}>
          <Mic size={24} />
          <span>TALK</span>
        </button>
      )}
    </div>
  )
}

export default App
