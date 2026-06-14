import React, { useState, useEffect, useRef } from 'react';
import { 
  Home, 
  MessageSquare, 
  Flower, 
  Smartphone, 
  Cpu, 
  Download, 
  Trash2, 
  Plus, 
  Compass, 
  Settings, 
  Send, 
  Moon, 
  Sun,
  Shield,
  RefreshCw,
  X,
  PlusCircle,
  Play,
  Lightbulb,
  Check,
  Activity
} from 'lucide-react';

function App() {
  // Navigation
  const [activeScreen, setActiveScreen] = useState('home');
  const [theme, setTheme] = useState('light');
  
  // Model Data
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(null);
  const [selectedBackend, setSelectedBackend] = useState('cpu');
  const [hfToken, setHfToken] = useState('');
  
  // Custom Import Fields
  const [importName, setImportName] = useState('');
  const [importPath, setImportPath] = useState('');
  const [importDesc, setImportDesc] = useState('');
  const [importAcc, setImportAcc] = useState('cpu');
  
  // WebSocket Chat State
  const [socket, setSocket] = useState(null);
  const [chatStatus, setChatStatus] = useState('idle'); // idle, loading, ready, error
  const [chatStatusMsg, setChatStatusMsg] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Sampler Parameters
  const [temperature, setTemperature] = useState(0.8);
  const [topK, setTopK] = useState(40);
  const [topP, setTopP] = useState(0.95);
  const [maxTokens, setMaxTokens] = useState(1024);
  
  // System Log / Metrics
  const [executionLogs, setExecutionLogs] = useState([]);
  
  // Tiny Garden State
  // Grid of 9 plots: Stage values 0 (empty), 1 (seed), 2 (watered), 3 (bloom)
  // item can be: 'sunflower', 'daisy', 'rose', 'special'
  const [gardenPlots, setGardenPlots] = useState(
    Array.from({ length: 9 }, (_, i) => ({ id: i + 1, stage: 0, seed: '' }))
  );
  
  // Mobile Actions State
  const [flashlightActive, setFlashlightActive] = useState(false);
  const [contacts, setContacts] = useState([
    { name: 'John Doe', phone: '+1234567890', email: 'john@example.com' }
  ]);
  const [emailForm, setEmailForm] = useState(null);
  const [simulatedLocation, setSimulatedLocation] = useState(null);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [wifiMenuOpen, setWifiMenuOpen] = useState(false);

  const messagesEndRef = useRef(null);

  // Fetch models on load
  const fetchModels = async () => {
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      if (data.models) {
        setModels(data.models);
        // Default select first downloaded or allowlist model
        if (!selectedModel && data.models.length > 0) {
          const downloaded = data.models.find(m => m.status === 'DOWNLOADED');
          setSelectedModel(downloaded || data.models[0]);
        } else if (selectedModel) {
          // Sync state with updated list
          const updated = data.models.find(m => m.name === selectedModel.name);
          if (updated) setSelectedModel(updated);
        }
      }
    } catch (err) {
      logEvent('system', `Error fetching models: ${err.message}`);
    }
  };

  useEffect(() => {
    fetchModels();
    const interval = setInterval(fetchModels, 3000); // Poll for download state updates
    return () => clearInterval(interval);
  }, [selectedModel]);

  // Connect WebSockets
  useEffect(() => {
    const wsUrl = `ws://${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      logEvent('system', 'WebSocket connection established.');
      setSocket(ws);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'status') {
        setChatStatus(data.status);
        setChatStatusMsg(data.message);
        logEvent('model', data.message);
      } 
      
      else if (data.type === 'token') {
        setMessages(prev => {
          if (prev.length === 0) return prev;
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg.role === 'assistant') {
            lastMsg.content += data.text;
          }
          return updated;
        });
      } 
      
      else if (data.type === 'done') {
        setIsGenerating(false);
        logEvent('system', 'Generation complete.');
      } 
      
      else if (data.type === 'error') {
        setChatStatus('error');
        setChatStatusMsg(data.message);
        setIsGenerating(false);
        logEvent('error', data.message);
        setMessages(prev => [
          ...prev, 
          { role: 'assistant', content: `Error: ${data.message}` }
        ]);
      } 
      
      else if (data.type === 'download_update') {
        // Sync models list from websocket broadcast
        setModels(data.models);
      } 
      
      else if (data.type === 'tool_call') {
        logEvent('tool', `Model executed action: ${data.name} with params: ${JSON.stringify(data.parameters)}`);
        handleToolTrigger(data.name, data.parameters);
      }
    };

    ws.onclose = () => {
      logEvent('system', 'WebSocket connection closed. Reconnecting...');
      setSocket(null);
      setChatStatus('idle');
    };

    return () => ws.close();
  }, []);

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const logEvent = (source, message) => {
    const timestamp = new Date().toLocaleTimeString();
    setExecutionLogs(prev => [...prev, { timestamp, source, message }].slice(-100));
  };

  const handleToolTrigger = (name, params) => {
    if (name === 'turnOnFlashlight') {
      setFlashlightActive(true);
    } else if (name === 'turnOffFlashlight') {
      setFlashlightActive(false);
    } else if (name === 'createContact') {
      const { firstName, lastName, phoneNumber, email } = params;
      setContacts(prev => [...prev, { name: `${firstName} ${lastName}`, phone: phoneNumber, email }]);
    } else if (name === 'sendEmail') {
      setEmailForm({ to: params.to, subject: params.subject, body: params.body });
    } else if (name === 'showLocationOnMap') {
      setSimulatedLocation(params.location);
    } else if (name === 'openWifiSettings') {
      setWifiMenuOpen(true);
    } else if (name === 'createCalendarEvent') {
      const { datetime, title } = params;
      setCalendarEvents(prev => [...prev, { datetime, title }]);
    }
    
    // Tiny Garden Tools
    else if (name === 'waterPlots') {
      const plotList = params.plots || [];
      setGardenPlots(prev => 
        prev.map(plot => 
          plotList.includes(plot.id) && plot.stage === 1 
            ? { ...plot, stage: 2 } 
            : plot
        )
      );
      // Simulate growth to bloom after 2 seconds
      setTimeout(() => {
        setGardenPlots(prev => 
          prev.map(plot => 
            plotList.includes(plot.id) && plot.stage === 2 
              ? { ...plot, stage: 3 } 
              : plot
          )
        );
      }, 2000);
    } else if (name === 'plantSeed') {
      const { seed, plots } = params;
      const plotList = plots || [];
      setGardenPlots(prev => 
        prev.map(plot => 
          plotList.includes(plot.id) 
            ? { ...plot, stage: 1, seed } 
            : plot
        )
      );
    } else if (name === 'harvestPlots') {
      const plotList = params.plots || [];
      setGardenPlots(prev => 
        prev.map(plot => 
          plotList.includes(plot.id) 
            ? { ...plot, stage: 0, seed: '' } 
            : plot
        )
      );
    }
  };

  const initChat = (taskType) => {
    if (!socket || !selectedModel) return;
    
    setMessages([]);
    setChatStatus('loading');
    
    socket.send(JSON.stringify({
      type: 'init_chat',
      modelName: selectedModel.name,
      modelFile: selectedModel.modelFile,
      backend: selectedBackend,
      taskType: taskType,
      config: {
        temperature,
        topK,
        topP
      }
    }));
  };

  const sendMessage = () => {
    if (!socket || !inputText.trim() || isGenerating) return;
    
    const userText = inputText.trim();
    setInputText('');
    setMessages(prev => [...prev, { role: 'user', content: userText }]);
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
    setIsGenerating(true);
    
    socket.send(JSON.stringify({
      type: 'send_message',
      text: userText
    }));
  };

  // Model Operations
  const startDownload = async (name) => {
    try {
      const res = await fetch('/api/models/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      logEvent('system', data.message);
      fetchModels();
    } catch (err) {
      logEvent('error', `Download error: ${err.message}`);
    }
  };

  const cancelDownload = async (name) => {
    try {
      const res = await fetch('/api/models/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      logEvent('system', data.message);
      fetchModels();
    } catch (err) {
      logEvent('error', `Cancel error: ${err.message}`);
    }
  };

  const deleteModel = async (name, modelFile) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;
    try {
      const res = await fetch('/api/models/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, modelFile })
      });
      const data = await res.json();
      logEvent('system', data.message);
      fetchModels();
    } catch (err) {
      logEvent('error', `Delete error: ${err.message}`);
    }
  };

  const importCustomModel = async (e) => {
    e.preventDefault();
    if (!importName || !importPath) return;
    try {
      const res = await fetch('/api/models/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: importName,
          srcPath: importPath,
          description: importDesc || "Custom imported model",
          accelerators: importAcc
        })
      });
      const data = await res.json();
      logEvent('system', data.message);
      setImportName('');
      setImportPath('');
      setImportDesc('');
      fetchModels();
    } catch (err) {
      logEvent('error', `Import error: ${err.message}`);
    }
  };

  const setHfTokenOnBackend = async () => {
    try {
      await fetch('/api/models/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: hfToken })
      });
      alert('HF Token applied to downloader.');
    } catch (err) {
      alert(`Error setting token: ${err.message}`);
    }
  };

  // Toggle Theme
  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.body.className = next === 'dark' ? 'dark-theme' : '';
  };

  // Parse Assistant Response (extract thinking blocks if present)
  const parseMessageContent = (text) => {
    if (!text) return { thinking: '', body: '' };
    const thinkRegex = /<think>([\s\S]*?)<\/think>/;
    const match = text.match(thinkRegex);
    if (match) {
      return {
        thinking: match[1].trim(),
        body: text.replace(thinkRegex, '').trim()
      };
    }
    // Handle partial streaming think block
    if (text.includes('<think>')) {
      const parts = text.split('<think>');
      const nextParts = parts[1].split('</think>');
      if (nextParts.length > 1) {
        return { thinking: nextParts[0].trim(), body: nextParts[1].trim() };
      } else {
        return { thinking: parts[1].trim(), body: '' };
      }
    }
    return { thinking: '', body: text };
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Flower style={{ color: 'var(--primary)' }} size={24} />
          <span>Gallery Edge</span>
        </div>
        
        <nav className="nav-links">
          <div 
            className={`nav-item ${activeScreen === 'home' ? 'active' : ''}`}
            onClick={() => setActiveScreen('home')}
          >
            <Home size={18} /> Home Dashboard
          </div>
          <div 
            className={`nav-item ${activeScreen === 'chat' ? 'active' : ''}`}
            onClick={() => {
              setActiveScreen('chat');
              setTimeout(() => initChat('llm_chat'), 50);
            }}
          >
            <MessageSquare size={18} /> Prompt Lab
          </div>
          <div 
            className={`nav-item ${activeScreen === 'garden' ? 'active' : ''}`}
            onClick={() => {
              setActiveScreen('garden');
              setTimeout(() => initChat('llm_tiny_garden'), 50);
            }}
          >
            <Flower size={18} /> Tiny Garden
          </div>
          <div 
            className={`nav-item ${activeScreen === 'actions' ? 'active' : ''}`}
            onClick={() => {
              setActiveScreen('actions');
              setTimeout(() => initChat('llm_mobile_actions'), 50);
            }}
          >
            <Smartphone size={18} /> Mobile Actions
          </div>
          <div 
            className={`nav-item ${activeScreen === 'models' ? 'active' : ''}`}
            onClick={() => setActiveScreen('models')}
          >
            <Download size={18} /> Model Manager
          </div>
        </nav>

        <div className="sidebar-footer">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Theme</span>
            <button className="btn btn-outline btn-icon-only" onClick={toggleTheme} style={{ borderRadius: '8px', width: '32px', height: '32px' }}>
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Running Client:</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Linux Desktop Native</span>
          </div>
        </div>
      </aside>

      {/* Main Panel */}
      <main className="main-content">
        <header className="header-bar">
          <h2 className="header-title">
            {activeScreen === 'chat' && 'Prompt Lab (Offline Chat)'}
            {activeScreen === 'garden' && 'Tiny Garden Game'}
            {activeScreen === 'actions' && 'Mobile Actions Agent'}
            {activeScreen === 'models' && 'Local Model Manager'}
          </h2>
          
          <div className="header-actions">
            {activeScreen !== 'models' && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Active Model</span>
                  <select 
                    value={selectedModel?.name || ''}
                    onChange={(e) => {
                      const selected = models.find(m => m.name === e.target.value);
                      if (selected) {
                        setSelectedModel(selected);
                      }
                    }}
                  >
                    {models.map(m => (
                      <option key={m.name} value={m.name}>
                        {m.name} {m.status === 'DOWNLOADED' ? '✓' : '(Not Downloaded)'}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Backend</span>
                  <select 
                    value={selectedBackend}
                    onChange={(e) => setSelectedBackend(e.target.value)}
                  >
                    <option value="cpu">CPU</option>
                    <option value="gpu">GPU (CUDA)</option>
                  </select>
                </div>
                <button 
                  className="btn btn-outline btn-icon-only" 
                  onClick={() => initChat(activeScreen === 'garden' ? 'llm_tiny_garden' : activeScreen === 'actions' ? 'llm_mobile_actions' : 'llm_chat')}
                  title="Reload Model / Context"
                  style={{ marginTop: '14px', border: '1px solid var(--panel-border)', borderRadius: '8px', width: '36px', height: '36px' }}
                >
                  <RefreshCw size={14} />
                </button>
              </>
            )}
          </div>
        </header>

        {/* Dynamic Screens */}
        {activeScreen === 'home' && (
          <div className="fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h1 className="welcome-title">Welcome to Gallery Edge</h1>
              <p className="welcome-desc">
                Run local, privacy-respecting Edge Large Language Models natively on Linux. AI Edge Gallery is optimized to utilize LiteRT (formerly TensorFlow Lite) and CPU/GPU hardware delegates.
              </p>
            </div>

            <div className="dashboard-grid">
              <div className="glass-panel task-card" onClick={() => { setActiveScreen('chat'); setTimeout(() => initChat('llm_chat'), 50); }}>
                <div className="task-card-icon prompt-lab">
                  <MessageSquare size={24} />
                </div>
                <h3 className="task-card-title">Prompt Lab</h3>
                <p className="task-card-desc">
                  Run custom inference. Slide parameters like temperature, top-k, and observe response latency, thinking steps, and generation rates.
                </p>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <span className="badge">GENERAL CHAT</span>
                  <span className="badge">CONFIGURABLE</span>
                </div>
              </div>

              <div className="glass-panel task-card" onClick={() => { setActiveScreen('garden'); setTimeout(() => initChat('llm_tiny_garden'), 50); }}>
                <div className="task-card-icon tiny-garden">
                  <Flower size={24} />
                </div>
                <h3 className="task-card-title">Tiny Garden</h3>
                <p className="task-card-desc">
                  A virtual gardening mini-game. Instruct the local model in natural language to plant seeds, water grid cells, and harvest crops.
                </p>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <span className="badge">TOOL CALLING</span>
                  <span className="badge">INTERACTIVE</span>
                </div>
              </div>

              <div className="glass-panel task-card" onClick={() => { setActiveScreen('actions'); setTimeout(() => initChat('llm_mobile_actions'), 50); }}>
                <div className="task-card-icon mobile-actions">
                  <Smartphone size={24} />
                </div>
                <h3 className="task-card-title">Mobile Actions</h3>
                <p className="task-card-desc">
                  Interact with an agent equipped with tools: e.g., simulate flashlight, send emails, schedule events, and load mapping systems.
                </p>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <span className="badge">FUNCTION CALLING</span>
                  <span className="badge">DEVICE TOOLS</span>
                </div>
              </div>
            </div>

            {/* Performance Monitoring Section */}
            <div className="glass-panel console-container">
              <div className="console-title-bar">
                <h3>
                  <Activity size={18} style={{ color: 'var(--primary)' }} />
                  System Events & Tool Execution Logs
                </h3>
              </div>
              <div className="console-box">
                {executionLogs.length === 0 ? (
                  <span style={{ color: 'var(--text-muted)' }}>No logs captured yet. System starts logging when models are loaded or tools called.</span>
                ) : (
                  executionLogs.map((log, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '8px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>[{log.timestamp}]</span>
                      <span style={{ 
                        fontWeight: 600, 
                        color: log.source === 'error' ? 'var(--accent-rose)' : log.source === 'tool' ? 'var(--accent-teal)' : 'var(--primary)' 
                      }}>{log.source.toUpperCase()}:</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Chat / Prompt Lab Screen */}
        {activeScreen === 'chat' && (
          <div className="chat-container fade-in-up">
            <div className="glass-panel chat-area">
              {chatStatus === 'loading' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px' }}>
                  <div className="spinner"></div>
                  <span style={{ color: 'var(--text-secondary)' }}>{chatStatusMsg}</span>
                </div>
              )}

              {chatStatus === 'error' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px' }}>
                  <Shield size={48} className="text-danger" style={{ color: 'var(--accent-rose)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>{chatStatusMsg}</span>
                  <button className="btn btn-primary" onClick={() => initChat('llm_chat')}>Retry Initialization</button>
                </div>
              )}

              {chatStatus === 'ready' && (
                <>
                  <div className="chat-messages">
                    {messages.length === 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                        <MessageSquare size={36} style={{ marginBottom: '12px' }} />
                        <span>Start typing to converse with the local model.</span>
                      </div>
                    ) : (
                      messages.map((m, i) => {
                        const parsed = parseMessageContent(m.content);
                        return (
                          <div key={i} className={`chat-message ${m.role}`}>
                            <div className="message-avatar">
                              {m.role === 'user' ? 'U' : 'AI'}
                            </div>
                            <div className="message-bubble">
                              {parsed.thinking && (
                                <details className="thinking-box" open>
                                  <summary className="thinking-header">
                                    <Lightbulb size={12} style={{ color: 'var(--accent-amber)' }} />
                                    <span>Thinking Mode</span>
                                  </summary>
                                  <p style={{ marginTop: '6px', whiteSpace: 'pre-wrap' }}>{parsed.thinking}</p>
                                </details>
                              )}
                              <p style={{ whiteSpace: 'pre-wrap', marginTop: parsed.thinking ? '8px' : '0' }}>
                                {parsed.body || (isGenerating && i === messages.length - 1 ? 'Thinking...' : '')}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="chat-input-bar">
                    <input 
                      type="text" 
                      placeholder="Type a message..." 
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                      disabled={isGenerating}
                    />
                    <button className="btn btn-primary btn-icon-only" onClick={sendMessage} disabled={isGenerating}>
                      <Send size={16} />
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Sidebar Parameters Drawer */}
            <div className="glass-panel chat-drawer">
              <div className="drawer-section">
                <span className="drawer-section-title">Sampling Settings</span>
                
                <div className="parameter-slider">
                  <div className="slider-label">
                    <span>Temperature</span>
                    <span>{temperature}</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="2" 
                    step="0.1" 
                    value={temperature} 
                    onChange={(e) => setTemperature(parseFloat(e.target.value))} 
                    className="slider-input" 
                  />
                </div>

                <div className="parameter-slider">
                  <div className="slider-label">
                    <span>Top P</span>
                    <span>{topP}</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.05" 
                    value={topP} 
                    onChange={(e) => setTopP(parseFloat(e.target.value))} 
                    className="slider-input" 
                  />
                </div>

                <div className="parameter-slider">
                  <div className="slider-label">
                    <span>Top K</span>
                    <span>{topK}</span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="100" 
                    step="1" 
                    value={topK} 
                    onChange={(e) => setTopK(parseInt(e.target.value))} 
                    className="slider-input" 
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tiny Garden Screen */}
        {activeScreen === 'garden' && (
          <div className="garden-view fade-in-up" style={{ width: '100%', height: 'calc(100vh - 120px)' }}>
            <div className="garden-grid-container" style={{ width: '400px' }}>
              <div className="garden-grid">
                {gardenPlots.map(plot => (
                  <div 
                    key={plot.id} 
                    className={`garden-plot ${plot.stage === 1 ? 'planted' : plot.stage === 2 ? 'watered' : plot.stage === 3 ? 'bloom' : ''}`}
                    onClick={() => {
                      // Click to plant a daisy on empty plots, or harvest blooms
                      if (plot.stage === 0) {
                        handleToolTrigger('plantSeed', { seed: 'daisy', plots: [plot.id] });
                      } else if (plot.stage === 1) {
                        handleToolTrigger('waterPlots', { plots: [plot.id] });
                      } else if (plot.stage === 3) {
                        handleToolTrigger('harvestPlots', { plots: [plot.id] });
                      }
                    }}
                  >
                    <span className="plot-id">{plot.id}</span>
                    <span className="plot-emoji">
                      {plot.stage === 0 && '🟫'}
                      {plot.stage === 1 && '🌱'}
                      {plot.stage === 2 && '💦'}
                      {plot.stage === 3 && (
                        plot.seed?.toLowerCase() === 'rose' ? '🌹' :
                        plot.seed?.toLowerCase() === 'sunflower' ? '🌻' :
                        plot.seed?.toLowerCase() === 'special' ? '✨' : '🌼'
                      )}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <span>💡 Click an empty plot to plant, sprout to water, and bloom to harvest manually, or instruct the AI agent!</span>
              </div>
            </div>

            {/* Chat side panel */}
            <div className="glass-panel chat-area" style={{ flexGrow: 1, height: '100%' }}>
              <div className="chat-messages">
                {messages.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                    <span>Try typing: <i>"Plant a rose in plot 5 and water it."</i></span>
                  </div>
                ) : (
                  messages.map((m, i) => (
                    <div key={i} className={`chat-message ${m.role}`}>
                      <div className="message-avatar">{m.role === 'user' ? 'U' : 'AI'}</div>
                      <div className="message-bubble">
                        <p style={{ whiteSpace: 'pre-wrap' }}>{m.content || 'Thinking...'}</p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="chat-input-bar">
                <input 
                  type="text" 
                  placeholder="Plant a sunflower in plots 1 and 2..." 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  disabled={isGenerating}
                />
                <button className="btn btn-primary btn-icon-only" onClick={sendMessage} disabled={isGenerating}>
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Actions Screen */}
        {activeScreen === 'actions' && (
          <div className="mobile-actions-layout fade-in-up" style={{ width: '100%', height: 'calc(100vh - 120px)' }}>
            <div className="device-simulator">
              <div className="device-screen">
                <div className="device-header">
                  <span>9:41</span>
                  <span>100% ⚡</span>
                </div>
                
                {/* Flashlight beam simulator */}
                <div className={`flashlight-beam ${flashlightActive ? 'active' : ''}`} />
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 700 }}>Simulated Phone</span>
                  <span className={`badge ${flashlightActive ? 'badge-success' : 'badge-outline'}`}>
                    🔦 {flashlightActive ? 'Flashlight ON' : 'Flashlight OFF'}
                  </span>
                </div>

                <div style={{ overflowY: 'auto', flexGrow: 1, paddingRight: '4px' }}>
                  {/* Contacts List */}
                  <div className="device-card">
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Contacts</span>
                    <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {contacts.map((c, i) => (
                        <div key={i} style={{ fontSize: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '4px' }}>
                          <b>{c.name}</b> - {c.phone}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Mailbox Simulator */}
                  {emailForm && (
                    <div className="device-card" style={{ borderLeft: '3px solid var(--primary)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>📬 Sent Mail</span>
                        <X size={12} style={{ cursor: 'pointer' }} onClick={() => setEmailForm(null)} />
                      </div>
                      <div style={{ marginTop: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <div><b>To:</b> {emailForm.to}</div>
                        <div><b>Subj:</b> {emailForm.subject}</div>
                        <div style={{ marginTop: '4px', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '4px' }}>
                          {emailForm.body}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Map Simulator */}
                  {simulatedLocation && (
                    <div className="device-card" style={{ borderLeft: '3px solid var(--accent-teal)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>🗺️ Mapping Location</span>
                        <X size={12} style={{ cursor: 'pointer' }} onClick={() => setSimulatedLocation(null)} />
                      </div>
                      <div style={{ marginTop: '6px', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div>Search: <b>{simulatedLocation}</b></div>
                        <div style={{ height: '80px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          📍 Pin dropped at {simulatedLocation}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Calendar view */}
                  {calendarEvents.length > 0 && (
                    <div className="device-card">
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Calendar</span>
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {calendarEvents.map((evt, i) => (
                          <div key={i} style={{ fontSize: '0.75rem', background: 'rgba(99, 102, 241, 0.08)', padding: '6px', borderRadius: '4px', borderLeft: '2px solid var(--primary)' }}>
                            <b>{evt.title}</b><br/>{evt.datetime}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Wifi Settings Menu */}
                  {wifiMenuOpen && (
                    <div className="device-card" style={{ border: '1px solid var(--primary)' }}>
                      <div style={{ display: 'flex', justify: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>📶 WiFi Settings</span>
                        <X size={12} style={{ cursor: 'pointer' }} onClick={() => setWifiMenuOpen(false)} />
                      </div>
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>AI-Edge-Guest</span>
                          <span style={{ color: 'var(--accent-teal)' }}>Connected</span>
                        </div>
                        <div style={{ opacity: 0.5 }}>Home-WiFi-5G</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Chat side panel */}
            <div className="glass-panel chat-area" style={{ flexGrow: 1, height: '100%' }}>
              <div className="chat-messages">
                {messages.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                    <span>Try typing: <i>"Turn on my flashlight."</i> or <i>"Create a contact for Alice Smith, number 555-0199."</i></span>
                  </div>
                ) : (
                  messages.map((m, i) => (
                    <div key={i} className={`chat-message ${m.role}`}>
                      <div className="message-avatar">{m.role === 'user' ? 'U' : 'AI'}</div>
                      <div className="message-bubble">
                        <p style={{ whiteSpace: 'pre-wrap' }}>{m.content || 'Thinking...'}</p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="chat-input-bar">
                <input 
                  type="text" 
                  placeholder="Ask the agent to perform actions..." 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  disabled={isGenerating}
                />
                <button className="btn btn-primary btn-icon-only" onClick={sendMessage} disabled={isGenerating}>
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Local Model Manager Screen */}
        {activeScreen === 'models' && (
          <div className="fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Hugging Face Access</h3>
              <div style={{ display: 'flex', gap: '12px' }}>
                <input 
                  type="password" 
                  placeholder="Enter Hugging Face Token (required for some models)" 
                  value={hfToken}
                  onChange={(e) => setHfToken(e.target.value)}
                  style={{ 
                    background: 'rgba(255,255,255,0.02)', 
                    border: '1px solid var(--panel-border)', 
                    borderRadius: '8px', 
                    color: 'var(--text-primary)', 
                    padding: '8px 12px',
                    flexGrow: 1
                  }}
                />
                <button className="btn btn-primary" onClick={setHfTokenOnBackend}>Save Token</button>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Allowlisted Edge Models</h3>
              
              <div className="model-list">
                {models.filter(m => !m.name.startsWith('[Custom]')).map((m, idx) => (
                  <div key={idx} className="model-row glass-panel" style={{ margin: '0', background: 'rgba(255,255,255,0.01)' }}>
                    <div className="model-info">
                      <h4 style={{ fontSize: '1rem', fontWeight: 600 }}>{m.name}</h4>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{m.description}</p>
                      <div className="model-meta">
                        <span className="badge badge-outline">File: {m.modelFile}</span>
                        <span className="badge badge-outline">Size: {(m.sizeInBytes / 1024 / 1024 / 1024).toFixed(2)} GB</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      {m.status === 'NOT_DOWNLOADED' && (
                        <button className="btn btn-primary" onClick={() => startDownload(m.name)}>
                          <Download size={14} /> Download
                        </button>
                      )}

                      {m.status === 'DOWNLOADING' && (
                        <div className="download-progress-container">
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                            <span>Downloading...</span>
                            <span>{((m.receivedBytes / m.sizeInBytes) * 100).toFixed(0)}%</span>
                          </div>
                          <div className="progress-bar-bg">
                            <div className="progress-bar-fill" style={{ width: `${(m.receivedBytes / m.sizeInBytes) * 100}%` }}></div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            <span>{(m.speed / 1024 / 1024).toFixed(1)} MB/s</span>
                            <span>ETA: {m.eta}s</span>
                          </div>
                          <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: '0.75rem', marginTop: '4px' }} onClick={() => cancelDownload(m.name)}>
                            Cancel
                          </button>
                        </div>
                      )}

                      {m.status === 'DOWNLOADED' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span className="badge badge-success">✓ Ready</span>
                          <button className="btn btn-outline" onClick={() => deleteModel(m.name, m.modelFile)} style={{ color: 'var(--accent-rose)' }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom Model Import */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Import Custom local Model</h3>
              <form onSubmit={importCustomModel} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <input 
                    type="text" 
                    placeholder="Model Name (e.g. MyGemma)" 
                    value={importName}
                    onChange={(e) => setImportName(e.target.value)}
                    required
                    style={{ 
                      background: 'rgba(255,255,255,0.02)', 
                      border: '1px solid var(--panel-border)', 
                      borderRadius: '8px', 
                      color: 'var(--text-primary)', 
                      padding: '8px 12px',
                      flex: 1
                    }}
                  />
                  <input 
                    type="text" 
                    placeholder="Absolute Local File Path (e.g. /home/user/my_model.task)" 
                    value={importPath}
                    onChange={(e) => setImportPath(e.target.value)}
                    required
                    style={{ 
                      background: 'rgba(255,255,255,0.02)', 
                      border: '1px solid var(--panel-border)', 
                      borderRadius: '8px', 
                      color: 'var(--text-primary)', 
                      padding: '8px 12px',
                      flex: 2
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <input 
                    type="text" 
                    placeholder="Description" 
                    value={importDesc}
                    onChange={(e) => setImportDesc(e.target.value)}
                    style={{ 
                      background: 'rgba(255,255,255,0.02)', 
                      border: '1px solid var(--panel-border)', 
                      borderRadius: '8px', 
                      color: 'var(--text-primary)', 
                      padding: '8px 12px',
                      flexGrow: 1
                    }}
                  />
                  <select
                    value={importAcc}
                    onChange={(e) => setImportAcc(e.target.value)}
                    style={{ 
                      background: 'rgba(255,255,255,0.02)', 
                      border: '1px solid var(--panel-border)', 
                      borderRadius: '8px', 
                      color: 'var(--text-primary)', 
                      padding: '8px 12px'
                    }}
                  >
                    <option value="cpu" style={{ background: '#0d0d12' }}>CPU Preferred</option>
                    <option value="gpu" style={{ background: '#0d0d12' }}>GPU Preferred</option>
                  </select>
                  <button type="submit" className="btn btn-primary">
                    <PlusCircle size={14} /> Import Model
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
