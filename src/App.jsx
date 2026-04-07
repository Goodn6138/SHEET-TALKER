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
  const [isDragging, setIsDragging] = useState(false)
  
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const fileInputRef = useRef(null)

  // EXACT same parsing logic as original (proven to work)
  const handleFileUpload = (file) => {
    if (!file) return
    
    // Excel only
    const isExcel = file.name.match(/\.(xlsx|xls)$/i)
    if (!isExcel) {
      alert('Please upload an Excel file (.xlsx or .xls)')
      return
    }

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        
        // EXACT same as original - header: 1 gives array of arrays
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
        if (!jsonData.length) {
          alert('No data found in Excel file')
          return
        }

        const headers = jsonData[0]
        
        // EXACT same as original - use col_${i} keys
        const cols = headers.map((header, i) => ({
          key: `col_${i}`,
          name: header || `Column ${i + 1}`,
          editable: true,
          resizable: true,
          sortable: true
        }))

        // EXACT same as original - match col_${j} to column keys
        const formattedRows = jsonData.slice(1).map((row, i) => {
          const obj = { id: i + 1 }
          row.forEach((cell, j) => {
            obj[`col_${j}`] = cell
          })
          return obj
        })

        setColumns(cols)
        setRows(formattedRows)
        setFileName(file.name)
        
        setMessages(prev => [...prev, {
          id: Date.now(),
          type: 'assistant',
          content: `📄 Loaded "${file.name}" • ${formattedRows.length} rows × ${cols.length} cols`,
          timestamp: new Date().toLocaleTimeString()
        }])
        
      } catch (error) {
        console.error('Error parsing Excel:', error)
        alert('Error parsing Excel file')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }

  const onDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const onDragLeave = () => setIsDragging(false)

  // Audio recording
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
      formData.append('sheetData', JSON.stringify({ columns, rows }))

      const response = await fetch('/api/chat', { method: 'POST', body: formData })
      if (!response.ok) throw new Error('Failed')
      
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
    } catch (error) {
      setMessages(prev => [
        ...prev,
        { id: Date.now(), type: 'user', content: '🎤 Voice message', timestamp: new Date().toLocaleTimeString() },
        { id: Date.now() + 1, type: 'assistant', content: 'Connection failed.', timestamp: new Date().toLocaleTimeString(), isError: true }
      ])
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
      {/* HEADER - No chat icon, Excel only */}
      <div className="header">
        <div className="header-left">
          <h2>SHEET TALKER</h2>
          {fileName && (
            <span className="file-badge">
              📄 {fileName.length > 30 ? fileName.substring(0, 30) + '...' : fileName}
            </span>
          )}
        </div>
        <div className="header-actions">
          <input 
            type="file" 
            accept=".xlsx,.xls" 
            onChange={(e) => handleFileUpload(e.target.files[0])}
            ref={fileInputRef}
            style={{ display: 'none' }}
          />
          <button 
            className="icon-btn upload-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Upload Excel"
          >
            <Upload size={20} />
          </button>
          {/* NO CHAT ICON HERE - only TALK button opens panel */}
        </div>
      </div>

      {/* GRID - Same as original structure */}
      <div 
        className={`grid-container ${isDragging ? 'dragging' : ''}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        {!hasData ? (
          <div className="empty-upload-state">
            <FileSpreadsheet size={64} className="empty-icon-svg" />
            <h3>Drop your Excel file here</h3>
            <p>Supports .xlsx and .xls files only</p>
            <button 
              className="upload-btn-large"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={20} />
              Choose Excel File
            </button>
          </div>
        ) : (
          <div className="spreadsheet-wrapper">
            <DataGrid
              columns={columns}
              rows={rows}
              onRowsChange={setRows}
              style={{ height: '100%' }}
            />
          </div>
        )}
      </div>

      {/* RIGHT PANEL - Chat/Voice panel */}
      {showRightPanel && (
        <div className="right-panel">
          <div className="panel-header">
            <div className="panel-header-left">
              {/* NO "Sheet Assistant" TEXT */}
              {hasData && <span className="status-badge">🟢 Ready</span>}
            </div>
            <button className="close-btn" onClick={() => setShowRightPanel(false)}>
              <X size={20} />
            </button>
          </div>

          <div className="panel-messages">
            {messages.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🎤</div>
                <p>Press the mic button to start talking</p>
                <p className="empty-subtitle">
                  {hasData ? "Ask me about your spreadsheet" : "Upload an Excel file first"}
                </p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <ChatMessage key={msg.id} message={msg} style={{animationDelay: `${i*0.1}s`}} />
              ))
            )}
            {isProcessing && (
              <div className="processing-indicator">
                <span className="spin">⏳</span>
                <span>Processing...</span>
              </div>
            )}
          </div>

          <div className="panel-input">
            {isRecording && <AudioVisualizer />}
            <button 
              className={`record-btn ${isRecording ? 'recording' : ''} ${isProcessing ? 'disabled' : ''}`}
              onClick={toggleRecording}
              disabled={isProcessing}
            >
              {isRecording ? '⏹ Stop' : isProcessing ? '⏳ Wait' : '🎤 Talk'}
            </button>
            {isRecording && <p className="recording-hint">Recording...</p>}
          </div>
        </div>
      )}

      {/* TALK BUTTON - Only way to open panel */}
      {!showRightPanel && (
        <button
          className={`talk-fab ${isRecording ? 'recording' : ''}`}
          onClick={() => setShowRightPanel(true)}
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
