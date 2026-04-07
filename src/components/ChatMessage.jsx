import { User, Bot } from 'lucide-react'

function ChatMessage({ message, style }) {
  const isUser = message.type === 'user'
  
  return (
    <div 
      className={`message ${isUser ? 'user' : 'assistant'} ${message.isError ? 'error' : ''}`}
      style={style}
    >
      <div className="message-avatar">
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>
      <div className="message-content">
        <div className="message-bubble">
          <p>{message.content}</p>
        </div>
        <span className="message-time">{message.timestamp}</span>
      </div>
    </div>
  )
}

export default ChatMessage
