import { useState, useRef, useEffect } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import mermaid from "mermaid";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
}

interface DiagramInsertion {
  insert_after_text: string;
  mermaid_syntax: string;
  diagram_type: string;
  title?: string;
}

interface ChatPanelProps {
  className?: string;
  getCurrentDocumentContent?: () => string;  // 新增：获取当前文档内容的回调
  onDiagramInsertions?: (insertions: DiagramInsertion[]) => void;  // 新增：图表插入回调
}

// Mermaid图表组件
function MermaidDiagram({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (ref.current) {
      mermaid.initialize({ startOnLoad: true, theme: 'default' });
      ref.current.innerHTML = chart;
      mermaid.contentLoaded();
    }
  }, [chart]);
  
  return <div ref={ref} className="mermaid my-4" />;
}

export default function ChatPanel({ className, getCurrentDocumentContent, onDiagramInsertions }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 发送消息
  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: inputMessage,
      timestamp: new Date()
    };

    // 添加用户消息
    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);

    try {
      // 构建消息历史
      const messageHistory = [...messages, userMessage];
      
      // 获取当前文档内容
      const currentDocumentContent = getCurrentDocumentContent ? getCurrentDocumentContent() : "";
      
      // 调用API，包含当前文档内容
      const response = await axios.post("http://localhost:8000/api/chat", {
        messages: messageHistory.map(({ role, content }) => ({ role, content })),
        current_document_content: currentDocumentContent
      });

      // 添加AI响应
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: response.data.response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      // 处理图表插入
      if (response.data.diagram_insertions && response.data.diagram_insertions.length > 0) {
        console.log("📊 聊天收到图表插入请求:", response.data.diagram_insertions);
        console.log("📊 onDiagramInsertions回调是否存在:", !!onDiagramInsertions);
        if (onDiagramInsertions) {
          console.log("📊 正在调用图表插入回调...");
          onDiagramInsertions(response.data.diagram_insertions);
          console.log("📊 图表插入回调已调用");
        } else {
          console.error("❌ 图表插入回调不存在，无法插入图表到文档");
        }
      } else {
        console.log("📊 AI响应中没有图表插入数据");
        console.log("📊 完整响应:", response.data);
      }
    } catch (error) {
      console.error("聊天错误:", error);
      
      // 添加错误消息
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: "抱歉，发生了错误。请稍后再试。",
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // 处理Enter键发送
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className={`flex flex-col h-full bg-white rounded-lg shadow-sm ${className}`}>
      {/* 聊天标题 */}
      <div className="px-4 py-3 border-b">
        <h3 className="text-lg font-semibold text-gray-800">AI助手</h3>
        <p className="text-xs text-gray-500">询问专利相关问题或请求生成图表</p>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <p className="text-sm">开始对话，询问任何专利相关问题</p>
            <div className="mt-4 space-y-2 text-xs text-gray-400">
              <p>试试这些问题：</p>
              <p className="italic">"如何撰写一个好的权利要求？"</p>
              <p className="italic">"帮我生成一个专利流程图"</p>
              <p className="italic">"什么是先行词基础？"</p>
            </div>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`${
                msg.role === "user" ? "ml-auto" : "mr-auto"
              } max-w-[80%]`}
            >
              <div
                className={`rounded-lg px-4 py-2 ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                {msg.role === "user" ? (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <div className="text-sm">
                    <ReactMarkdown
                      components={{
                        code({ className, children, ...props }: any) {
                          const match = /language-(\w+)/.exec(className || '');
                          const isMermaid = match && match[1] === 'mermaid';
                          const isInline = (props as any)?.inline;
                          
                          if (!isInline && isMermaid) {
                            return <MermaidDiagram chart={String(children).replace(/\n$/, '')} />;
                          }
                          
                          return (
                            <code
                              className={`${!isInline ? 'block bg-gray-800 text-gray-100 p-3 rounded my-2 overflow-x-auto' : 'bg-gray-200 px-1 rounded'}`}
                              {...props}
                            >
                              {children}
                            </code>
                          );
                        }
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
              {msg.timestamp && (
                <p className="text-xs text-gray-400 mt-1 px-1">
                  {msg.timestamp.toLocaleTimeString()}
                </p>
              )}
            </div>
          ))
        )}
        
        {isLoading && (
          <div className="mr-auto max-w-[80%]">
            <div className="bg-gray-100 rounded-lg px-4 py-2">
              <div className="flex items-center space-x-2">
                <div className="animate-bounce h-2 w-2 bg-gray-400 rounded-full"></div>
                <div className="animate-bounce h-2 w-2 bg-gray-400 rounded-full delay-100"></div>
                <div className="animate-bounce h-2 w-2 bg-gray-400 rounded-full delay-200"></div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="border-t p-4">
        <div className="flex gap-2">
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="输入消息..."
            className="flex-1 px-3 py-2 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={1}
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={!inputMessage.trim() || isLoading}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              !inputMessage.trim() || isLoading
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}