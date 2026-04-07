import { useState, useRef, useCallback } from 'react'
import { Mic, X, MessageSquare, Upload, FileSpreadsheet } from 'lucide-react'
import Spreadsheet from './components/Spreadsheet'
import ChatPanel from './components/ChatPanel'
import * as XLSX from 'xlsx'
import './App.css'

function App() {
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [messages, setMessages] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  
  // Sheet data state
  const [sheetData, setSheetData] = useState({
    columns: [],
    rows: []
  })
  const [fileName, setFileName] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const fileInputRef = useRef(null)

  // File upload handlers
  const handleFileUpload = (file) => {
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        
        // Get first sheet
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
        
        if (jsonData.length > 0) {
          // First row as headers
          const headers = jsonData[0]
          const rows = jsonData.slice(1).map((row, index) => {
            const obj = { id: index + 1 }
            headers.forEach((header, i) => {
              obj[header] = row[i] || ''
            })
            return obj
          })

          // Create columns for react-data-grid
          const columns = headers.map((header, index) => ({
            key: header,
            name: header,
            resizable: true,
            sortable: true,
            editable: true,
            width: Math.max(100, header.length * 15)
          }))

          setSheetData({ columns, rows })
          setFileName(file.name)
          
          // Add system message about upload
          setMessages(prev => [...prev, {
            id: Date.now(),
            type: 'assistant',
            content: `📄 Loaded "${file.name}" with ${rows.length} rows and ${columns.length} columns.`,
            timestamp: new Date().toLocaleTimeString()
          }])
        }
      } catch (error) {
        console.error('Error parsing file:', error)
        alert('Error parsing file. Please upload a valid Excel or CSV file.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv'))) {
      handleFileUpload(file)
    } else {
      alert('Please upload an Excel file (.xlsx, .xls) or CSV file')
    }
  }

  const onDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const onDragLeave = () => {
    setIsDragging(false)
  }

  const onFileInputChange = (e) => {
    const file = e.target.files[0]
    handleFileUpload(file)
  }

  // Audio recording handlers (same as before)
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
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (error) {
      console.error('Error accessing microphone:', error)
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
      formData.append('sheetData', JSON.stringify(sheetData))

      const response = await fetch('/api/chat', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) throw new Error('Failed to get response')

      const data = await response.json()
      
      setMessages(prev => [
        ...prev,
        { 
          id: Date.now(), 
          type: 'user', 
          content: data.transcription || '🎤 Voice message',
          timestamp: new Date().toLocaleTimeString()
        },
        { 
          id: Date.now() + 1, 
          type: 'assistant', 
          content: data.response,
          timestamp: new Date().toLocaleTimeString()
        }
      ])

      // Handle sheet updates from AI if provided
      if (data.sheetUpdate) {
        setSheetData(data.sheetUpdate)
      }
    } catch (error) {
      console.error('Error:', error)
      setMessages(prev => [
        ...prev,
        { 
          id: Date.now(), 
          type: 'user', 
          content: '🎤 Voice message',
          timestamp: new Date().toLocaleTimeString()
        },
        { 
          id: Date.now() + 1, 
          type: 'assistant', 
          content: 'Sorry, I could not process that. Backend connection failed.',
          timestamp: new Date().toLocaleTimeString(),
          isError: true
        }
      ])
    } finally {
      setIsProcessing(false)
    }
  }

  const toggleRecording = () => {
    if (!isRecording) startRecording()
    else stopRecording()
  }

  return (
    <div className="app-container">
      <div className="main-content">
        <header className="header">
          <div className="header-left">
            <h1>SHEET TALKER</h1>
            {fileName && <span className="file-badge">📄 {fileName}</span>}
          </div>
          <div className="header-actions">
            <input
              type="file"
              ref={fileInputRef}
              onChange={onFileInputChange}
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
            />
            <button 
              className="icon-btn upload-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Upload spreadsheet"
            >
              <Upload size={20} />
            </button>
            <button 
              className="icon-btn"
              onClick={() => setIsPanelOpen(!isPanelOpen)}
              aria-label="Toggle chat"
            >
              <MessageSquare size={20} />
            </button>
          </div>
        </header>
        
        <div 
          className={`grid-container ${isDragging ? 'dragging' : ''}`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
        >
          {sheetData.columns.length === 0 ? (
            <div className="empty-upload-state">
              <FileSpreadsheet size={64} className="empty-icon-svg" />
              <h3>Drop your spreadsheet here</h3>
              <p>Support for .xlsx, .xls, and .csv files</p>
              <button 
                className="upload-btn-large"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={20} />
                Choose File
              </button>
            </div>
          ) : (
            <Spreadsheet 
              columns={sheetData.columns} 
              rows={sheetData.rows}
              onRowsChange={(newRows) => setSheetData(prev => ({ ...prev, rows: newRows }))}
            />
          )}
        </div>
      </div>

      <ChatPanel 
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        messages={messages}
        isRecording={isRecording}
        isProcessing={isProcessing}
        onToggleRecord={toggleRecording}
        hasSheetData={sheetData.columns.length > 0}
      />

      {!isPanelOpen && (
        <button 
          className={`talk-fab ${isRecording ? 'recording' : ''}`}
          onClick={() => setIsPanelOpen(true)}
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
