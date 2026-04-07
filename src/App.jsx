import { useState, useRef, useCallback } from 'react'
import { Mic, X, Upload, FileSpreadsheet, Send } from 'lucide-react'
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
  const [textInput, setTextInput] = useState('')
  
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
      
      const cols = [
        {
          key: 'rowNum',
          name: '',
          width: 50,
          frozen: true,
          resizable: false,
          sortable: false,
          renderCell: ({ row }) => <div className="row-number">{row.rowNum}</div>
        },
        ...headers.map((header, i) => ({
          key: `col_${i}`,
          name: header || `Column ${i + 1}`,
          editable: true,
          resizable: true,
          width: Math.max(120, header?.length * 9 || 120),
        }))
      ]

      const formattedRows = jsonData.slice(1).map((row, i) => {
        const obj = { 
          id: i, 
          rowNum: i + 1
        }
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
        content: `📄 Loaded "${file.name}"\n• ${formattedRows.length} rows\n• ${cols.length - 1} columns`,
        timestamp: new Date().toLocaleTimeString()
      }])
    }

    reader.readAsArrayBuffer(file)
  }

  const sendTextMessage = async () => {
    if (!textInput.trim() || isProcessing) return
    
    const userMessage = textInput.trim()
    setTextInput('')
    
    setMessages(prev => [...prev, {
      id: Date.now(),
      type: 'user',
      content: userMessage,
      timestamp: new Date().toLocaleTimeString()
    }])
    
    setIsProcessing(true)
    
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: userMessage,
          history: messages,
          sheetContext: { columns: columns.map(c => c.name), rowCount: rows.length }
        })
      })
      
      const data = await response.json()
      
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        type: 'assistant',
        content: data.response,
        timestamp: new Date().toLocaleTimeString()
      }])
    } catch (error) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        type: 'assistant',
        content: 'Sorry, connection failed.',
        timestamp: new Date().toLocaleTimeString(),
        isError: true
      }])
    } finally {
      setIsProcessing(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendTextMessage()
    }
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
      formData.append('sheetContext', JSON.stringify({ 
        columns: columns.map(c => c.name), 
        rowCount: rows.length 
      }))

      const response = await fetch('/api/chat', { method: 'POST', body: formData })
      const data = await response.json()
      
      setMessages(prev => [
        ...prev,
        { id: Date.now(), type: 'user', content: data.transcription || '🎤 Voice message', timestamp: new Date().toLocaleTimeString() },
        { id: Date.now() + 1, type: 'assistant', content: data.response, timestamp: new Date().toLocaleTimeString() }
      ])
    } catch (error) {
      setMessages(prev => [...prev, { 
        id: Date.now(), 
        type: 'assistant', 
        content: 'Connection failed', 
        timestamp: new Date().toLocaleTimeString(), 
        isError: true 
      }])
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
            <button className="choose-file-btn" onClick={() => fileInputRef.current?.click()}>
              Choose File
            </button>
          </div>
        ) : (
          <div className="excel-wrapper">
            <DataGrid
              columns={columns}
              rows={rows}
              onRowsChange={setRows}
              className="excel-grid"
              rowHeight={24}
              headerRowHeight={28}
              style={{ width: '100%', height: '100%' }}
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
                <div className="big-icon">💬</div>
                <p>Type a message or press Talk</p>
                <small>{columns.length ? 'Ask about your spreadsheet' : 'Upload a file first'}</small>
              </div>
            ) : (
              messages.map(m => <ChatMessage key={m.id} message={m} />)
            )}
            {isProcessing && <div className="processing">Thinking...</div>}
          </div>

          <div className="panel-input">
            {isRecording && <AudioVisualizer />}
            
            <div className="text-input-container">
              <input
                type="text"
                className="text-input"
                placeholder={isRecording ? "Listening..." : "Type your message..."}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isRecording || isProcessing}
              />
              <button 
                className="send-btn"
                onClick={sendTextMessage}
                disabled={!textInput.trim() || isProcessing || isRecording}
              >
                <Send size={18} />
              </button>
            </div>

            <div className="divider"><span>or</span></div>

            <button 
              className={`record-btn ${isRecording ? 'recording' : ''}`}
              onClick={toggleRecording}
              disabled={isProcessing}
            >
              {isRecording ? (
                <>
                  <div className="recording-dot" />
                  <span>Stop</span>
                </>
              ) : (
                <>
                  <Mic size={18} />
                  <span>Talk</span>
                </>
              )}
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
          {isRecording && <span className="recording-pulse" />}
        </button>
      )}
    </div>
  )
}

export default App
