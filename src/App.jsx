import { useState, useRef, useCallback } from 'react'
import { Mic, X, Upload, FileSpreadsheet, Send, Play, Terminal } from 'lucide-react'
import DataGrid from 'react-data-grid'
import ChatMessage from './components/ChatMessage'
import AudioVisualizer from './components/AudioVisualizer'
import * as XLSX from 'xlsx'
import 'react-data-grid/lib/styles.css'
import './App.css'

// Raw JS executor - no helpers, just execute what backend sends
const executeJavaScript = async (code, rows, columns) => {
  try {
    // Create function with raw rows/columns access
    const fn = new Function('rows', 'columns', 'console', `
      "use strict";
      ${code}
    `)
    
    // Deep clone rows so macro can mutate freely
    const clonedRows = JSON.parse(JSON.stringify(rows))
    
    // Execute - backend has full access to rows[], columns[], and limited console
    const result = fn(clonedRows, columns, { log: console.log })
    
    // Handle async (if backend uses async/await)
    const resolved = await Promise.resolve(result)
    
    if (!resolved || !Array.isArray(resolved.rows)) {
      throw new Error('Must return { rows: [...] }')
    }
    
    return {
      success: true,
      rows: resolved.rows,
      columns: resolved.columns || columns,
      message: resolved.message || 'Executed',
      stats: resolved.stats || null
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function App() {
  const [columns, setColumns] = useState([])
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [showRightPanel, setShowRightPanel] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [messages, setMessages] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [textInput, setTextInput] = useState('')
  const [pendingMacro, setPendingMacro] = useState(null)
  
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const fileInputRef = useRef(null)

  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      alert('Excel files only')
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
        { key: 'rowNum', name: '', width: 50, frozen: true, resizable: false, sortable: false,
          renderCell: ({ row }) => <div className="row-number">{row.rowNum}</div> },
        ...headers.map((h, i) => ({ 
          key: `col_${i}`, 
          name: h || `Col ${i+1}`, 
          editable: true, 
          resizable: true, 
          width: 120 
        }))
      ]

      const formattedRows = jsonData.slice(1).map((row, i) => {
        const obj = { id: i, rowNum: i + 1 }
        row.forEach((cell, j) => obj[`col_${j}`] = cell)
        return obj
      })

      setColumns(cols)
      setRows(formattedRows)
      setFileName(file.name)
      
      setMessages([{
        id: Date.now(),
        type: 'assistant',
        content: `📊 Loaded "${file.name}"\n${formattedRows.length} rows × ${cols.length-1} cols`,
        timestamp: new Date().toLocaleTimeString()
      }])
    }
    reader.readAsArrayBuffer(file)
  }

  const runPendingMacro = async () => {
    if (!pendingMacro?.code) return
    
    setShowMacroModal(false)
    setIsProcessing(true)
    
    setMessages(prev => [...prev, {
      id: Date.now(),
      type: 'assistant',
      content: `⚡ ${pendingMacro.description}...`,
      timestamp: new Date().toLocaleTimeString()
    }])

    const result = await executeJavaScript(pendingMacro.code, rows, columns)
    
    if (result.success) {
      setRows(result.rows)
      if (result.columns) setColumns(result.columns)
      
      let resultText = `✅ ${result.message}`
      if (result.stats) {
        resultText += '\n\n📈 Stats:\n' + Object.entries(result.stats)
          .map(([k, v]) => `• ${k}: ${v}`).join('\n')
      }
      
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        type: 'assistant',
        content: resultText,
        timestamp: new Date().toLocaleTimeString()
      }])
    } else {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        type: 'assistant',
        content: `❌ Error: ${result.error}`,
        timestamp: new Date().toLocaleTimeString(),
        isError: true
      }])
    }
    
    setPendingMacro(null)
    setIsProcessing(false)
  }

  const sendMessage = async () => {
    if (!textInput.trim() || isProcessing) return
    
    const userMsg = textInput.trim()
    setTextInput('')
    setShowRightPanel(true)
    
    setMessages(prev => [...prev, {
      id: Date.now(),
      type: 'user',
      content: userMsg,
      timestamp: new Date().toLocaleTimeString()
    }])
    
    setIsProcessing(true)
    
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: userMsg,
          history: messages,
          context: { columns: columns.map(c => c.name), rowCount: rows.length }
        })
      })
      
      const data = await res.json()
      
      if (data.javascript) {
        setPendingMacro({
          code: data.javascript,
          description: data.description || userMsg,
          response: data.response
        })
        
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          type: 'assistant',
          content: data.response,
          timestamp: new Date().toLocaleTimeString(),
          hasMacro: true
        }])
      } else {
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          type: 'assistant',
          content: data.response,
          timestamp: new Date().toLocaleTimeString()
        }])
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        type: 'assistant',
        content: '❌ Connection failed',
        timestamp: new Date().toLocaleTimeString(),
        isError: true
      }])
      setIsProcessing(false)
    }
  }

  // Voice handlers (same as before)
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/wav' })
        const formData = new FormData()
        formData.append('audio', blob)
        formData.append('context', JSON.stringify({ columns: columns.map(c => c.name), rowCount: rows.length }))
        
        const res = await fetch('/api/chat', { method: 'POST', body: formData })
        const data = await res.json()
        
        setMessages(prev => [...prev,
          { id: Date.now(), type: 'user', content: '🎤 Voice', timestamp: new Date().toLocaleTimeString() }
        ])
        
        if (data.javascript) {
          setPendingMacro({
            code: data.javascript,
            description: data.description,
            response: data.response
          })
          setMessages(prev => [...prev, {
            id: Date.now() + 1,
            type: 'assistant',
            content: data.response,
            timestamp: new Date().toLocaleTimeString(),
            hasMacro: true
          }])
        } else {
          setMessages(prev => [...prev, {
            id: Date.now() + 1,
            type: 'assistant',
            content: data.response,
            timestamp: new Date().toLocaleTimeString()
          }])
        }
        setIsProcessing(false)
        stream.getTracks().forEach(t => t.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (err) {
      alert('Mic error')
    }
  }, [rows, columns])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setIsProcessing(true)
    }
  }, [isRecording])

  return (
    <div className="app-container">
      <div className="header">
        <div className="header-left">
          <h2>SHEET TALKER</h2>
          {fileName && <span className="file-badge">📄 {fileName}</span>}
        </div>
        <div className="header-actions">
          <button className="icon-btn" onClick={() => {
            setPendingMacro({ code: '// Example:\n// const result = rows.filter(r => r.col_0 > 5);\n// return { rows: result, message: "Filtered" };', description: 'Custom JS', response: 'Write JavaScript:' })
            setShowMacroModal(true)
          }}>
            <Terminal size={20} />
          </button>
          <input type="file" accept=".xlsx,.xls" ref={fileInputRef} onChange={handleFileUpload} style={{display:'none'}} />
          <button className="icon-btn" onClick={() => fileInputRef.current?.click()}>
            <Upload size={20} />
          </button>
        </div>
      </div>

      <div className="grid-container">
        {!columns.length ? (
          <div className="empty-state" onClick={() => fileInputRef.current?.click()}>
            <FileSpreadsheet size={64} />
            <h3>Drop Excel file</h3>
          </div>
        ) : (
          <div className="excel-wrapper">
            <DataGrid columns={columns} rows={rows} onRowsChange={setRows} 
              className="excel-grid" rowHeight={24} headerRowHeight={28} style={{height:'100%'}} />
          </div>
        )}
      </div>

      {showRightPanel && (
        <div className="right-panel">
          <div className="panel-header">
            <span></span>
            <button className="close-btn" onClick={() => setShowRightPanel(false)}><X size={20}/></button>
          </div>
          
          <div className="panel-messages">
            {messages.length === 0 ? (
              <div className="empty-chat">
                <div className="big-icon">💬</div>
                <p>Ask anything</p>
              </div>
            ) : (
              messages.map(m => (
                <div key={m.id}>
                  <ChatMessage message={m} />
                  {m.hasMacro && (
                    <button className="run-macro-btn" onClick={() => setShowMacroModal(true)}>
                      <Play size={14} /> Run
                    </button>
                  )}
                </div>
              ))
            )}
            {isProcessing && <div className="processing">...</div>}
          </div>

          <div className="panel-input">
            {isRecording && <AudioVisualizer />}
            <div className="text-input-container">
              <input type="text" className="text-input" placeholder="Type..."
                value={textInput} onChange={e => setTextInput(e.target.value)} 
                onKeyPress={e => e.key === 'Enter' && sendMessage()} disabled={isRecording} />
              <button className="send-btn" onClick={sendMessage} disabled={!textInput.trim() || isRecording}>
                <Send size={18} />
              </button>
            </div>
            <button className={`record-btn ${isRecording ? 'recording' : ''}`} 
              onClick={() => isRecording ? stopRecording() : startRecording()} disabled={isProcessing}>
              <Mic size={18} /> {isRecording ? 'Stop' : 'Talk'}
            </button>
          </div>
        </div>
      )}

      {!showRightPanel && (
        <button className={`open-panel-btn ${isRecording ? 'recording' : ''}`} onClick={() => setShowRightPanel(true)}>
          <Mic size={20} /><span>TALK</span>
        </button>
      )}

      {showMacroModal && pendingMacro && (
        <div className="modal-overlay" onClick={() => setShowMacroModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <Terminal size={20} />
              <h3>{pendingMacro.description}</h3>
            </div>
            <div className="modal-body">
              <p>{pendingMacro.response}</p>
              <textarea className="code-textarea" value={pendingMacro.code}
                onChange={e => setPendingMacro({...pendingMacro, code: e.target.value})}
                spellCheck={false} />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowMacroModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={runPendingMacro} disabled={!pendingMacro.code?.trim()}>
                <Play size={16} /> Execute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
