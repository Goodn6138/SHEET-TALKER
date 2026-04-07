import { useState, useRef, useCallback } from 'react'
import { Mic, X, Upload, FileSpreadsheet } from 'lucide-react'
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
    
    // Excel only validation
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/vnd.ms-excel.sheet.macroEnabled.12'
    ]
    
    const isExcel = validTypes.includes(file.type) || file.name.match(/\.(xlsx|xls)$/i)
    
    if (!isExcel) {
      alert('Please upload a valid Excel file (.xlsx or .xls)')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { 
          type: 'array',
          raw: false,
          cellFormula: true
        })
        
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        
        // Get the data as array of arrays
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1,
          defval: '',
          blankrows: false
        })
        
        if (jsonData.length === 0) {
          alert('No data found in the Excel file')
          return
        }

        // Clean up - remove completely empty rows
        const cleanData = jsonData.filter(row => 
          row.some(cell => cell !== '' && cell !== null && cell !== undefined)
        )

        if (cleanData.length < 2) { // Need at least header + 1 data row
          alert('Excel file needs at least a header row and one data row')
          return
        }

        // First row is headers
        const rawHeaders = cleanData[0]
        
        // Create columns with safe keys
        const columns = []
        const keyMap = {} // Map to track original header to safe key
        
        rawHeaders.forEach((header, index) => {
          const originalHeader = String(header || `Column_${index + 1}`).trim()
          // Create safe key: lowercase, no spaces/special chars
          let safeKey = originalHeader
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '')
          
          if (!safeKey) safeKey = `col_${index}`
          
          // Handle duplicates
          let uniqueKey = safeKey
          let counter = 1
          while (keyMap[uniqueKey]) {
            uniqueKey = `${safeKey}_${counter}`
            counter++
          }
          keyMap[uniqueKey] = originalHeader
          
          columns.push({
            key: uniqueKey,
            name: originalHeader,
            resizable: true,
            sortable: true,
            editable: true,
            width: Math.max(120, Math.min(300, originalHeader.length * 10))
          })
        })

        // Create rows using the SAME keys as columns
        const rows = cleanData.slice(1).map((row, rowIndex) => {
          const rowObj = { id: rowIndex + 1 }
          columns.forEach((col, colIndex) => {
            const cellValue = row[colIndex]
            // Preserve numbers, convert rest to string
            if (typeof cellValue === 'number') {
              rowObj[col.key] = cellValue
            } else if (cellValue instanceof Date) {
              rowObj[col.key] = cellValue.toLocaleDateString()
            } else {
              rowObj[col.key] = cellValue !== undefined && cellValue !== null ? String(cellValue) : ''
            }
          })
          return rowObj
        })

        console.log('Columns:', columns)
        console.log('First row:', rows[0])

        setSheetData({ columns, rows })
        setFileName(file.name)
        
        setMessages(prev => [...prev, {
          id: Date.now(),
          type: 'assistant',
          content: `📄 Loaded "${file.name}"\n• ${rows.length} rows × ${columns.length} columns`,
          timestamp: new Date().toLocaleTimeString()
        }])
        
      } catch (error) {
        console.error('Error parsing Excel:', error)
        alert(`Error parsing Excel file: ${error.message}`)
      }
    }
    
    reader.onerror = () => alert('Error reading file')
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

  const onFileInputChange = (e) => {
    const file = e.target.files[0]
    if (file) handleFileUpload(file)
  }

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
      formData.append('sheetContext', JSON.stringify({
        columns: sheetData.columns.map(c => c.name),
        rowCount: sheetData.rows.length,
        preview: sheetData.rows.slice(0, 3)
      }))

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
        { id: Date.now() + 1, type: 'assistant', content: 'Sorry, connection failed.', timestamp: new Date().toLocaleTimeString(), isError: true }
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
                📄 {fileName.length > 25 ? fileName.substring(0, 25) + '...' : fileName}
              </span>
            )}
          </div>
          <div className="header-actions">
            <input
              type="file"
              ref={fileInputRef}
              onChange={onFileInputChange}
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
            />
            <button 
              className="icon-btn upload-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Upload Excel file"
            >
              <Upload size={20} />
            </button>
            {/* CHAT ICON REMOVED - only TALK button opens panel */}
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

      {/* Only way to open chat is via this FAB */}
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
