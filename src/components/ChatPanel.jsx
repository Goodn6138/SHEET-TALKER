import { X, Mic, Square, Loader2, FileText } from 'lucide-react'
import ChatMessage from './ChatMessage'
import AudioVisualizer from './AudioVisualizer'

function ChatPanel({ isOpen, onClose, messages, isRecording, isProcessing, onToggleRecord, hasSheetData }) {
  return (
    <div className={`chat-panel ${isOpen ? 'open' : ''}`}>
      <div className="chat-header">
        <div className="chat-header-left">
          <h2>Sheet Assistant</h2>
          {hasSheetData && <span className="sheet-status">🟢 Active</span>}
        </div>
        <button className="close-btn" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🎤</div>
            <p>Press the mic button to start talking</p>
            <p className="empty-subtitle">
              {hasSheetData 
                ? "I can help you analyze and modify your spreadsheet" 
                : "Upload a spreadsheet first, then ask me about it"}
            </p>
          </div>
        ) : (
          messages.map((message, index) => (
            <ChatMessage 
              key={message.id} 
              message={message}
              style={{ animationDelay: `${index * 0.1}s` }}
            />
          ))
        )}
        
        {isProcessing && (
          <div className="processing-indicator">
            <Loader2 className="spin" size={16} />
            <span>Processing...</span>
          </div>
        )}
        
        <div className="messages-end" />
      </div>

      <div className="chat-input-area">
        {isRecording && <AudioVisualizer />}
        
        <button 
          className={`record-btn ${isRecording ? 'recording' : ''} ${isProcessing ? 'disabled' : ''}`}
          onClick={onToggleRecord}
          disabled={isProcessing}
        >
          {isRecording ? (
            <>
              <Square size={20} fill="currentColor" />
              <span>Stop</span>
            </>
          ) : isProcessing ? (
            <>
              <Loader2 className="spin" size={20} />
              <span>Wait</span>
            </>
          ) : (
            <>
              <Mic size={20} />
              <span>Talk</span>
            </>
          )}
        </button>
        
        {isRecording && (
          <p className="recording-hint">Recording... Click stop when done</p>
        )}
      </div>
    </div>
  )
}

export default ChatPanel
