import Document from "./Document";
import { useEffect, useState } from "react";
import axios from "axios";
import LoadingOverlay from "./internal/LoadingOverlay";
import Logo from "./assets/logo.png";
import { useMutation, useQuery } from "@tanstack/react-query";

const BACKEND_URL = "http://localhost:8000";

// 项目名称映射
const PROJECT_NAMES: Record<number, string> = {
  1: "无线光遗传学设备",
  2: "微流控血液充氧设备"
};

// TypeScript interfaces for better type safety
interface DocumentData {
  id: number;
  content: string;
  title?: string;
  lastModified?: string;
}

interface AppState {
  currentDocument: DocumentData | null;
  isLoading: boolean;
  leftSidebarCollapsed: boolean;
  rightSidebarCollapsed: boolean;
}

function App() {
  // 整合状态管理
  const [appState, setAppState] = useState<AppState>({
    currentDocument: null,
    isLoading: false,
    leftSidebarCollapsed: false,
    rightSidebarCollapsed: false,
  });

  // 响应式布局检测
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      
      // 在移动端自动折叠侧边栏
      if (mobile && (!appState.leftSidebarCollapsed || !appState.rightSidebarCollapsed)) {
        setAppState(prev => ({
          ...prev,
          leftSidebarCollapsed: true,
          rightSidebarCollapsed: true,
        }));
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [appState.leftSidebarCollapsed, appState.rightSidebarCollapsed]);

  const [currentDocumentContent, setCurrentDocumentContent] = useState<string>("");

  // 不再默认加载第一个专利文档
  // 用户需要主动选择项目

  /**
   * 加载专利文档
   * Load a patent document from the backend
   */
  const loadPatent = async (documentNumber: number) => {
    setAppState(prev => ({ ...prev, isLoading: true }));
    console.log("Loading patent:", documentNumber);
    
    try {
      const response = await axios.get(`${BACKEND_URL}/document/${documentNumber}`);
      const documentData: DocumentData = {
        id: documentNumber,
        content: response.data.content,
        title: PROJECT_NAMES[documentNumber] || `Patent ${documentNumber}`,
        lastModified: new Date().toISOString(),
      };
      
      setAppState(prev => ({ 
        ...prev, 
        currentDocument: documentData,
        isLoading: false 
      }));
      setCurrentDocumentContent(response.data.content);
      
    } catch (error) {
      console.error("Error loading document:", error);
      setAppState(prev => ({ ...prev, isLoading: false }));
    }
  };

  /**
   * 保存专利文档
   * Save the current patent document to the backend
   */
  const savePatent = async (documentNumber: number) => {
    if (!appState.currentDocument) return;
    
    setAppState(prev => ({ ...prev, isLoading: true }));
    try {
      await axios.post(`${BACKEND_URL}/save/${documentNumber}`, {
        content: currentDocumentContent,
      });
      
      // 更新文档的最后修改时间
      setAppState(prev => ({
        ...prev,
        currentDocument: prev.currentDocument ? {
          ...prev.currentDocument,
          lastModified: new Date().toISOString(),
        } : null,
        isLoading: false
      }));
      
    } catch (error) {
      console.error("Error saving document:", error);
      setAppState(prev => ({ ...prev, isLoading: false }));
    }
  };

  /**
   * 切换侧边栏显示状态
   * Toggle sidebar visibility
   */
  const toggleLeftSidebar = () => {
    setAppState(prev => ({ 
      ...prev, 
      leftSidebarCollapsed: !prev.leftSidebarCollapsed 
    }));
  };

  const toggleRightSidebar = () => {
    setAppState(prev => ({ 
      ...prev, 
      rightSidebarCollapsed: !prev.rightSidebarCollapsed 
    }));
  };

  return (
    <div className="flex flex-col h-screen w-full bg-gray-50">
      {/* 加载遮罩层 */}
      {appState.isLoading && <LoadingOverlay />}
      
      {/* Header - 保持原有设计但优化样式 */}
      <header className="flex items-center justify-center w-full bg-gradient-to-r from-gray-900 to-gray-800 text-white shadow-lg z-50 h-16">
        <img src={Logo} alt="Logo" className="h-10" />
        <h1 className="ml-4 text-xl font-semibold">Patent Review System</h1>
      </header>

      {/* 主内容区域 - 三栏布局 */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* 移动端遮罩层 */}
        {isMobile && !appState.leftSidebarCollapsed && (
          <div 
            className="mobile-overlay z-40 lg:hidden"
            onClick={() => setAppState(prev => ({ ...prev, leftSidebarCollapsed: true }))}
          />
        )}
        
        {/* 左侧栏 - 项目和版本管理区 */}
        <aside className={`
          ${appState.leftSidebarCollapsed ? 'w-12' : 'w-80'} 
          ${isMobile && !appState.leftSidebarCollapsed ? 'fixed left-0 top-16 bottom-0 z-50' : 'relative'}
          bg-white border-r border-gray-200 shadow-sm transition-all duration-300 ease-in-out
          flex flex-col
        `}>
          {/* 左侧栏头部 */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            {!appState.leftSidebarCollapsed && (
              <h2 className="text-lg font-semibold text-gray-800">项目管理</h2>
            )}
            <button
              onClick={toggleLeftSidebar}
              className="p-2 rounded-md hover:bg-gray-100 transition-colors duration-200"
              aria-label="Toggle left sidebar"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d={appState.leftSidebarCollapsed ? "M9 5l7 7-7 7" : "M15 19l-7-7 7-7"} />
              </svg>
            </button>
          </div>

          {/* 左侧栏内容 */}
          {!appState.leftSidebarCollapsed && (
            <div className="flex-1 p-4 space-y-4">
              {/* 项目选择区域 */}
              <div className="space-y-2">
                <div className="space-y-2">
                  <button
                    onClick={() => loadPatent(1)}
                    className={`w-full p-3 text-left rounded-lg border transition-all duration-200 ${
                      appState.currentDocument?.id === 1
                        ? 'bg-blue-50 border-blue-200 text-blue-800'
                        : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <div className="font-medium">{PROJECT_NAMES[1]}</div>
                  </button>
                  
                  <button
                    onClick={() => loadPatent(2)}
                    className={`w-full p-3 text-left rounded-lg border transition-all duration-200 ${
                      appState.currentDocument?.id === 2
                        ? 'bg-blue-50 border-blue-200 text-blue-800'
                        : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <div className="font-medium">{PROJECT_NAMES[2]}</div>
                  </button>
                </div>
              </div>

              {/* 版本管理区域 - 只有选中项目时才显示 */}
              {appState.currentDocument && (
                <div className="border-t border-gray-200 pt-4">
                <div className="space-y-2">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-green-800">当前版本</span>
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">v1.0</span>
                    </div>
                    <div className="text-xs text-green-600 mt-1">
                      {appState.currentDocument?.lastModified ? 
                        `修改于 ${new Date(appState.currentDocument.lastModified).toLocaleString()}` : 
                        '暂无修改记录'
                      }
                    </div>
                  </div>
                  
                  <button className="w-full p-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200">
                    + 创建新版本
                  </button>
                </div>
              </div>
              )}

              {/* 操作按钮组 - 只有选中项目时才显示 */}
              {appState.currentDocument && (
                <div className="border-t border-gray-200 pt-4 space-y-2">
                <button
                  onClick={() => appState.currentDocument && savePatent(appState.currentDocument.id)}
                  disabled={!appState.currentDocument}
                  className="w-full p-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors duration-200"
                >
                  💾 保存文档
                </button>
                
                <button className="w-full p-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors duration-200">
                  📄 导出文档
                </button>
              </div>
              )}
            </div>
          )}
        </aside>

        {/* 中间区域 - 文档编辑区 */}
        <main className="flex-1 flex flex-col bg-white">
          {/* 文档工具栏 */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center space-x-4">
              <h2 className="text-xl font-semibold text-gray-800">
                {appState.currentDocument?.title || "请选择文档"}
              </h2>
            </div>
            
            {/* 未来TinyMCE工具栏预留空间 */}
            <div className="flex items-center space-x-2">
              <div className="text-xs text-gray-500 bg-yellow-100 px-2 py-1 rounded">
                TinyMCE 工具栏预留位置
              </div>
            </div>
          </div>

          {/* 编辑器主区域 */}
          <div className="flex-1 p-4">
            <div className="h-full bg-white border border-gray-200 rounded-lg shadow-sm">
              {appState.currentDocument ? (
                <Document
                  onContentChange={setCurrentDocumentContent}
                  content={currentDocumentContent}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <div className="text-6xl mb-4">📄</div>
                    <div className="text-lg font-medium">请选择一个文档开始编辑</div>
                    <div className="text-sm">从左侧面板选择 Patent 1 或 Patent 2</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 状态栏 */}
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-t border-gray-200 text-sm text-gray-600">
            <div className="flex items-center space-x-4">
              <span>字数: {currentDocumentContent.length}</span>
              <span className={`flex items-center ${appState.isLoading ? 'text-yellow-600' : 'text-green-600'}`}>
                <div className={`w-2 h-2 rounded-full mr-2 ${appState.isLoading ? 'bg-yellow-400' : 'bg-green-400'}`}></div>
                {appState.isLoading ? '保存中...' : '已保存'}
              </span>
            </div>
            <div>
              {appState.currentDocument?.lastModified && 
                `最后修改: ${new Date(appState.currentDocument.lastModified).toLocaleString()}`
              }
            </div>
          </div>
        </main>

        {/* 右侧栏移动端遮罩层 */}
        {isMobile && !appState.rightSidebarCollapsed && (
          <div 
            className="mobile-overlay z-40 lg:hidden"
            onClick={() => setAppState(prev => ({ ...prev, rightSidebarCollapsed: true }))}
          />
        )}
        
        {/* 右侧栏 - AI功能预留区 */}
        <aside className={`
          ${appState.rightSidebarCollapsed ? 'w-12' : 'w-80'} 
          ${isMobile && !appState.rightSidebarCollapsed ? 'fixed right-0 top-16 bottom-0 z-50' : 'relative'}
          bg-white border-l border-gray-200 shadow-sm transition-all duration-300 ease-in-out
          flex flex-col
        `}>
          {/* 右侧栏头部 */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <button
              onClick={toggleRightSidebar}
              className="p-2 rounded-md hover:bg-gray-100 transition-colors duration-200"
              aria-label="Toggle right sidebar"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d={appState.rightSidebarCollapsed ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} />
              </svg>
            </button>
            {!appState.rightSidebarCollapsed && (
              <h2 className="text-lg font-semibold text-gray-800">AI 助手</h2>
            )}
          </div>

          {/* 右侧栏内容 */}
          {!appState.rightSidebarCollapsed && (
            <div className="flex-1 p-4">
              {/* AI功能预留区域 */}
              <div className="h-full flex flex-col items-center justify-center text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                <div className="text-center space-y-4">
                  <div className="text-4xl">🤖</div>
                  <div className="text-lg font-medium">AI Agent 预留区</div>
                  <div className="text-sm max-w-48">
                    此区域为未来的AI功能预留，将包括:
                    <ul className="mt-2 text-left list-disc list-inside space-y-1">
                      <li>智能建议</li>
                      <li>内容分析</li>
                      <li>自动优化</li>
                      <li>实时反馈</li>
                    </ul>
                  </div>
                  
                  <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="text-xs text-blue-800">
                      🔮 未来功能预览
                    </div>
                    <div className="text-xs text-blue-600 mt-1">
                      WebSocket连接状态: 已连接
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </aside>

      </div>
    </div>
  );
}

export default App;
