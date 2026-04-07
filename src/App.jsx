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
  
  const [sheetData, setSheetData] = useState({
    columns: [],
    rows: []
  })
  const [fileName, setFileName] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const fileInputRef = useRef(null)

  const handleFileUpload = (file) => {
    if (!file) return
    
    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/vnd.ms-excel.sheet.macroEnabled.12'
    ]
    
    if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/i)) {
      alert('Please upload a valid Excel file (.xlsx, .xls) or CSV file')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { 
          type: 'array',
          cellFormula: true,
          cellNF: true,
          cellStyles: true
        })
        
        // Get first sheet
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        
        // Convert to JSON with header: 1 to get array of arrays
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1,
          defval: '',
          blankrows: false
        })
        
        if (jsonData.length === 0) {
          alert('No data found in the file')
          return
        }

        // Filter out completely empty rows
        const cleanData = jsonData.filter(row => 
          row.some(cell => cell !== '' && cell !== null && cell !== undefined)
        )

        if (cleanData.length < 1) {
          alert('No valid data found in the file')
          return
        }

        // First row as headers
        const rawHeaders = cleanData[0]
        
        // Create safe keys for columns (handle duplicates, special chars, empty headers)
        const headerMap = new Map()
        const columns = rawHeaders.map((header, index) => {
          let baseKey = String(header || `Column_${index + 1}`)
            .trim()
            .replace(/[^a-zA-Z0-9_]/g, '_')
            .replace(/^_+|_+$/g, '')
          
          if (!baseKey || baseKey === '') baseKey = `Column_${index + 1}`
          
          // Handle duplicates
          let uniqueKey = baseKey
          let counter = 1
          while (headerMap.has(uniqueKey)) {
            uniqueKey = `${baseKey}_${counter}`
            counter++
          }
          headerMap.set(uniqueKey, header)
          
          return {
            key: uniqueKey,
            name: String(header || `Column ${index + 1}`),
            resizable: true,
            sortable: true,
            editable: true,
            width: Math.max(120, String(header).length * 12)
          }
        })

        // Create rows with proper keys matching columns
        const rows = cleanData.slice(1).map((row, rowIndex) => {
          const obj = { id: rowIndex + 1 }
          columns.forEach((col, colIndex) => {
            const value = row[colIndex]
            // Handle different data types
            if (typeof value === 'number') {
              obj[col.key] = value
            } else if (value instanceof Date) {
              obj[col.key] = value.toISOString().split('T')[0]
            } else {
              obj[col.key] = value !== undefined ? String(value) : ''
            }
          })
          return obj
        })

        console.log('Parsed columns:', columns)
        console.log('Parsed rows:', rows)

        setSheetData({ columns, rows })
        setFileName(file.name)
        
        setMessages(prev => [...prev, {
          id: Date.now(),
          type: 'assistant',
          content: `📄 Loaded "${file.name}"\n• ${rows.length} rows\n• ${columns.length} columns\n• Headers: ${columns.map(c => c.name).join(', ')}`,
          timestamp: new Date().toLocaleTimeString()
        }])
        
      } catch (error) {
        console.error('Error parsing file:', error)
        alert(`Error parsing file: ${error.message}`)
      }
    }
    
    reader.onerror = () => {
      alert('Error reading file')
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

  const onDragLeave = () => {
    setIsDragging(false)
  }

  const onFileInputChange = (e) => {
    const file = e.target.files[0]
    if (file) handleFileUpload(file)
  }

  // Audio recording handlers
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
      formData.append('sheetContext', JSON.stringify({
        columns: sheetData.columns.map(c => c.name),
        rowCount: sheetData.rows.length,
        sample: sheetData.rows.slice(0, 5)
      }))

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
            {fileName && (
              <span className="file-badge" title={fileName}>
                📄 {fileName.length > 20 ? fileName.substring(0, 20) + '...' : fileName}
              </span>
            )}
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
              <h3>Drop your Excel file here</h3>
              <p>Supports .xlsx, .xls, and .csv files</p>
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
