import { useState, useRef, useCallback } from 'react'
import { Mic, X, Upload, FileSpreadsheet } from 'lucide-react'
import DataGrid from 'react-data-grid'
import ChatMessage from './components/ChatMessage'
import AudioVisualizer from './components/AudioVisualizer'
import * as XLSX from 'xlsx'
import 'react-data-grid/lib/styles.css'
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

  const handleFileUpload = (e) => {
    const file = e.target.files[0]
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
      
      // Create Excel-style columns with row number column first
      const cols = [
        {
          key: 'rowNum',
          name: '', // Empty header for row numbers like Excel
          width: 50,
          frozen: true,
          resizable: false,
          sortable: false,
          renderCell: ({ rowIdx }) => (
            <div className="row-number">{rowIdx + 1}</div>
          )
        },
        ...headers.map((header, i) => ({
          key: `col_${i}`,
          name: header || `Column ${i + 1}`,
          editable: true,
          resizable: true,
          width: Math.max(100, header?.length * 10 || 100),
        }))
      ]

      const formattedRows = jsonData.slice(1).map((row, i) => {
        const obj = { id: i, rowNum: i + 1 }
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
      alert('Could not access microphone')
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
      setMessages(prev => [...prev, { id: Date.now(), type: 'assistant', content: 'Connection failed', timestamp: new Date().toLocaleTimeString(), isError: true }])
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
      <div className="header">
        <div className="header-left">
          <h2>SHEET TALKER</h2>
          {fileName && <span className="file-badge">📄 {fileName}</span>}
        </div>
        <input 
          type="file" 
          accept=".xlsx,.xls" 
          ref={fileInputRef}
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
        <button className="upload-btn" onClick={() => fileInputRef.current?.click()}>
          <Upload size={20} />
        </button>
      </div>

      <div className="grid-container">
        {columns.length === 0 ? (
          <div className="empty-state" onClick={() => fileInputRef.current?.click()}>
            <FileSpreadsheet size={64} />
            <h3>Drop Excel file here</h3>
            <p>.xlsx and .xls only</p>
          </div>
        ) : (
          <div className="excel-wrapper">
            <DataGrid
              columns={columns}
              rows={rows}
              onRowsChange={setRows}
              className="excel-grid"
              rowHeight={25}
              headerRowHeight={30}
            />
          </div>
        )}
      </div>

      {showRightPanel && (
        <div className="right-panel">
          <div className="panel-header">
            <span></span>
            <button className="close-btn" onClick={() => setShowRightPanel(false)}>
              <X size={20} />
            </button>
          </div>
          <div className="panel-messages">
            {messages.length === 0 ? (
              <div className="empty-chat">
                <div className="big-icon">🎤</div>
                <p>Press Talk to start speaking</p>
                <small>{columns.length ? 'Ask about your data' : 'Upload a file first'}</small>
              </div>
            ) : (
              messages.map(m => <ChatMessage key={m.id} message={m} />)
            )}
            {isProcessing && <div className="processing">Processing...</div>}
          </div>
          <div className="panel-input">
            {isRecording && <AudioVisualizer />}
            <button 
              className={`record-btn ${isRecording ? 'recording' : ''}`}
              onClick={toggleRecording}
              disabled={isProcessing}
            >
              {isRecording ? '⏹ Stop' : isProcessing ? '⏳' : '🎤 Talk'}
            </button>
          </div>
        </div>
      )}

      {!showRightPanel && (
        <button 
          className={`open-panel-btn ${isRecording ? 'recording' : ''}`}
          onClick={() => setShowRightPanel(true)}
        >
          <Mic size={20} />
          <span>TALK</span>
        </button>
      )}
    </div>
  )
}

export default App
