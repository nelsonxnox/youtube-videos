import React, { useState, useEffect, useRef } from 'react';
import { 
  Flame, Play, Pause, Video, Music, TrendingUp, Copy, Check, 
  Settings, AlertTriangle, Image, FileText, Sparkles, RefreshCw, 
  Upload, Link, AlertCircle, Info, ChevronRight, MessageSquare, Scissors 
} from 'lucide-react';

export default function App() {
  // Configuración y Estados de API Key
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [groqApiKey, setGroqApiKey] = useState(() => localStorage.getItem('groq_api_key') || '');
  const [isKeySetup, setIsKeySetup] = useState(!!apiKey);
  const [tempKey, setTempKey] = useState('');
  const [tempGroqKey, setTempGroqKey] = useState(() => localStorage.getItem('groq_api_key') || '');
  const [isValidatingKey, setIsValidatingKey] = useState(false);
  const [keyError, setKeyError] = useState('');

  // Perfil del Canal (Branding)
  const [channelName, setChannelName] = useState(() => localStorage.getItem('channel_name') || '');
  const [channelDescription, setChannelDescription] = useState(() => localStorage.getItem('channel_description') || '');

  // Estados del Refinamiento de Guion
  const [refineInstruction, setRefineInstruction] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [refineError, setRefineError] = useState('');

  // Estados de carga de archivos
  const [videoPath, setVideoPath] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [inputMode, setInputMode] = useState('path'); // 'path' o 'upload'

  // Estados del proceso de análisis
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0); // 0: inactivo, 1: extracción, 2: subida, 3: IA
  const [analysisError, setAnalysisError] = useState('');

  // Resultados del Análisis
  const [analysisData, setAnalysisData] = useState(null);

  // Controladores del Reproductor y Sincronización
  const videoRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(-1);
  const [selectedChartPoint, setSelectedChartPoint] = useState(0);

  // Interfaz de Usuario
  const [activeTab, setActiveTab] = useState('script'); // 'script', 'shorts', 'hook', 'cliches', 'metadata', 'thumbnails'
  const [scriptViewMode, setScriptViewMode] = useState('segments'); // 'segments' o 'paragraph'
  const [toastMessage, setToastMessage] = useState('');

  // Autoscroll para la transcripción
  const transcriptionContainerRef = useRef(null);

  // Limpiar Toast
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Sincronizar el segmento activo de transcripción con el tiempo de reproducción
  useEffect(() => {
    if (!analysisData || !analysisData.transcription) return;
    
    const index = analysisData.transcription.findIndex(
      seg => currentTime >= seg.start && currentTime <= seg.end
    );
    
    if (index !== -1 && index !== activeSegmentIndex) {
      setActiveSegmentIndex(index);
      
      // Auto-scroll del contenedor de transcripción para mantener el segmento visible
      const activeEl = document.getElementById(`segment-${index}`);
      if (activeEl && transcriptionContainerRef.current) {
        transcriptionContainerRef.current.scrollTo({
          top: activeEl.offsetTop - transcriptionContainerRef.current.offsetTop - 80,
          behavior: 'smooth'
        });
      }
    }
  }, [currentTime, analysisData, activeSegmentIndex]);

  // Validar y guardar la API Key
  const handleValidateKey = async (e) => {
    e.preventDefault();
    if (!tempKey.trim()) {
      setKeyError('Por favor introduce la API Key de Gemini.');
      return;
    }
    setIsValidatingKey(true);
    setKeyError('');

    try {
      const res = await fetch('/api/check-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: tempKey.trim() })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        localStorage.setItem('gemini_api_key', tempKey.trim());
        setApiKey(tempKey.trim());
        
        if (tempGroqKey.trim()) {
          localStorage.setItem('groq_api_key', tempGroqKey.trim());
          setGroqApiKey(tempGroqKey.trim());
        } else {
          localStorage.removeItem('groq_api_key');
          setGroqApiKey('');
        }
        
        setIsKeySetup(true);
        showToast('¡API Keys guardadas con éxito!');
      } else {
        setKeyError(data.error || 'La clave de Gemini no es válida.');
      }
    } catch (err) {
      setKeyError('Error de red al validar las claves.');
    } finally {
      setIsValidatingKey(false);
    }
  };

  // Cambiar o borrar API Key guardada
  const handleResetKey = () => {
    localStorage.removeItem('gemini_api_key');
    localStorage.removeItem('groq_api_key');
    setApiKey('');
    setGroqApiKey('');
    setTempKey('');
    setTempGroqKey('');
    setIsKeySetup(false);
    showToast('API Keys eliminadas.');
  };

  // Mostrar mensaje emergente (Toast)
  const showToast = (msg) => {
    setToastMessage(msg);
  };

  // Copiar texto al portapapeles con fallback robusto para evitar bloqueos
  const copyToClipboard = (text) => {
    if (!text) return;
    
    // Método moderno y asíncrono si está disponible
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => {
          showToast('¡Copiado al portapapeles!');
        })
        .catch(err => {
          console.warn('navigator.clipboard falló, usando fallback...', err);
          fallbackCopyToClipboard(text);
        });
    } else {
      fallbackCopyToClipboard(text);
    }
  };

  // Fallback usando elemento textarea temporal (funciona siempre)
  const fallbackCopyToClipboard = (text) => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      
      // Evitar scroll y ocultar el elemento
      textArea.style.position = "fixed";
      textArea.style.top = "0";
      textArea.style.left = "0";
      textArea.style.width = "2em";
      textArea.style.height = "2em";
      textArea.style.padding = "0";
      textArea.style.border = "none";
      textArea.style.outline = "none";
      textArea.style.boxShadow = "none";
      textArea.style.background = "transparent";
      
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (successful) {
        showToast('¡Copiado al portapapeles!');
      } else {
        console.error('No se pudo copiar el texto con execCommand');
        showToast('Error al copiar el texto.');
      }
    } catch (err) {
      console.error('Error en fallback de copiado:', err);
      showToast('Error al copiar el texto.');
    }
  };

  // Enviar el video para análisis
  const handleStartAnalysis = async (e) => {
    e.preventDefault();
    setAnalysisError('');
    setIsAnalyzing(true);
    setAnalysisData(null);
    setAnalysisStep(1); // Extracción

    // Simulador visual de progreso entre pasos si tardan, aunque el server da la respuesta final
    const stepInterval = setInterval(() => {
      setAnalysisStep(prev => {
        if (prev === 1) return 2; // Simular que sube a Gemini/Groq
        if (prev === 2) return 3; // Simular que está con la IA
        return prev;
      });
    }, 12000); // Cambiar de paso cada 12 segundos aproximadamente si no ha terminado

    try {
      let body;
      let headers = {};

      if (inputMode === 'path') {
        if (!videoPath.trim()) {
          throw new Error('Debe proporcionar la ruta absoluta del video.');
        }
        body = JSON.stringify({ 
          videoPath: videoPath.trim(), 
          apiKey, 
          groqApiKey,
          channelName,
          channelDescription
        });
        headers['Content-Type'] = 'application/json';
      } else {
        if (!selectedFile) {
          throw new Error('Debe seleccionar un archivo de video para subir.');
        }
        const formData = new FormData();
        formData.append('videoFile', selectedFile);
        formData.append('apiKey', apiKey);
        formData.append('groqApiKey', groqApiKey);
        formData.append('channelName', channelName);
        formData.append('channelDescription', channelDescription);
        body = formData;
        // El navegador define el Content-Type para multipart/form-data automáticamente
      }

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers,
        body
      });

      const data = await res.json();
      clearInterval(stepInterval);

      if (res.ok) {
        setAnalysisData(data);
        setAnalysisStep(4); // Completado
        setSelectedChartPoint(0);
        showToast('¡Análisis finalizado con éxito!');
      } else {
        setAnalysisError(data.error || 'Ocurrió un error inesperado al analizar el video.');
        setAnalysisStep(0);
      }
    } catch (err) {
      clearInterval(stepInterval);
      setAnalysisError(err.message || 'Error de conexión con el servidor.');
      setAnalysisStep(0);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Saltar a un segundo específico en el reproductor de video
  const seekTo = (seconds) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  // Enviar comentarios para refinar/reescribir el guion optimizado
  const handleRefineScript = async (e) => {
    e.preventDefault();
    if (!refineInstruction.trim()) return;
    setIsRefining(true);
    setRefineError('');

    try {
      const res = await fetch('/api/refine-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          script: analysisData?.optimized_script,
          comment: refineInstruction.trim(),
          channelName,
          channelDescription
        })
      });

      const data = await res.json();
      if (res.ok && data.optimized_script) {
        setAnalysisData(prev => ({
          ...prev,
          optimized_script: data.optimized_script
        }));
        setRefineInstruction('');
        showToast('¡Guion optimizado y reescrito con éxito!');
      } else {
        setRefineError(data.error || 'No se pudo refinar el guion.');
      }
    } catch (err) {
      setRefineError('Error de red al refinar el guion.');
    } finally {
      setIsRefining(false);
    }
  };
  
  // Generar un PDF / Vista de Impresión del Guion Optimizado
  const handleDownloadPDF = () => {
    if (!analysisData || !analysisData.optimized_script) return;
    
    const printWindow = window.open('', '_blank');
    const scriptContent = analysisData.optimized_script.map((seg, idx) => `
      <div class="segment">
        <div class="meta">⏱️ ${formatTime(seg.start)} - ${formatTime(seg.end)}</div>
        <div class="original"><strong>Texto Original:</strong> <em>${seg.original_text}</em></div>
        <div class="optimized"><strong>Guion Optimizado:</strong> ${seg.optimized_text}</div>
        ${seg.production_note ? `<div class="note">🎬 <strong>SFX/VFX:</strong> ${seg.production_note}</div>` : ''}
        ${seg.open_loop ? `<div class="loop">🔗 <strong>Bucle de Atención:</strong> ${seg.open_loop}</div>` : ''}
      </div>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>SlasherCut - Guion Optimizado - ${channelName || 'Mi Canal'}</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              line-height: 1.6;
              color: #111;
              max-width: 800px;
              margin: 0 auto;
              padding: 30px;
              background-color: #fff;
            }
            header {
              border-bottom: 3px solid #8b0000;
              padding-bottom: 12px;
              margin-bottom: 30px;
            }
            h1 {
              color: #8b0000;
              margin: 0 0 5px 0;
              font-size: 1.8rem;
            }
            .subtitle {
              font-size: 0.85rem;
              color: #666;
            }
            .segment {
              margin-bottom: 25px;
              padding: 15px;
              border-bottom: 1px solid #eee;
              page-break-inside: avoid;
            }
            .meta {
              font-size: 0.85rem;
              font-weight: bold;
              color: #8b0000;
              margin-bottom: 8px;
            }
            .original {
              font-size: 0.85rem;
              color: #555;
              margin-bottom: 8px;
              background: #fafafa;
              padding: 8px;
              border-radius: 4px;
            }
            .optimized {
              font-size: 1.05rem;
              color: #000;
              background: #fff9f9;
              padding: 12px;
              border-left: 4px solid #8b0000;
              margin-bottom: 8px;
            }
            .note {
              font-size: 0.85rem;
              color: #721c24;
              background-color: #f8d7da;
              padding: 6px 10px;
              border-radius: 4px;
              margin-top: 6px;
            }
            .loop {
              font-size: 0.85rem;
              color: #004085;
              background-color: #cce5ff;
              padding: 6px 10px;
              border-radius: 4px;
              margin-top: 6px;
            }
            @media print {
              body { padding: 0; }
              .original { background: #fafafa !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .optimized { background: #fff9f9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .note { background-color: #f8d7da !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .loop { background-color: #cce5ff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <header>
            <h1>SlasherCut - Guion Optimizado</h1>
            <div class="subtitle">Canal: <strong>${channelName || 'Mi Canal'}</strong> | Creado: ${new Date().toLocaleDateString()}</div>
          </header>
          ${scriptContent}
          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Copiar todo el texto optimizado concatenado para pegar en ElevenLabs
  const handleCopyFullScript = () => {
    if (!analysisData || !analysisData.optimized_script) return;
    
    // Concatenar solo los textos optimizados, separados por un salto de línea
    const fullText = analysisData.optimized_script
      .map(seg => seg.optimized_text)
      .join('\n\n');
      
    copyToClipboard(fullText);
    showToast('¡Guion completo copiado para ElevenLabs!');
  };

  // Dibujar y calcular coordenadas para el gráfico de tensión SVG
  const renderTensionChart = () => {
    if (!analysisData || !analysisData.tension_meter || analysisData.tension_meter.length === 0) {
      return null;
    }

    const points = analysisData.tension_meter;
    const width = 600;
    const height = 150;
    const padding = 20;

    // Escalar valores
    const maxTime = points[points.length - 1].timestamp || 100;
    const getX = (time) => padding + (time / maxTime) * (width - 2 * padding);
    const getY = (val) => height - padding - (val / 100) * (height - 2 * padding);

    // Construir línea y área de gradiente
    let pathD = '';
    let areaD = `M ${getX(0)} ${height - padding} `;

    points.forEach((p, idx) => {
      const x = getX(p.timestamp);
      const y = getY(p.tension_level);
      if (idx === 0) {
        pathD += `M ${x} ${y} `;
      } else {
        pathD += `L ${x} ${y} `;
      }
      areaD += `L ${x} ${y} `;
    });

    areaD += `L ${getX(points[points.length - 1].timestamp)} ${height - padding} Z`;

    return (
      <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} width="100%" height="100%">
        <defs>
          <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-red)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--accent-red)" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Líneas de guía de fondo */}
        {[25, 50, 75, 100].map(val => (
          <line 
            key={val}
            className="chart-grid-line"
            x1={padding}
            y1={getY(val)}
            x2={width - padding}
            y2={getY(val)}
          />
        ))}

        {/* Área sombreada */}
        <path d={areaD} className="chart-path-area" />

        {/* Línea de tensión */}
        <path d={pathD} className="chart-path-line" />

        {/* Círculos interactivos de eventos */}
        {points.map((p, idx) => {
          const x = getX(p.timestamp);
          const y = getY(p.tension_level);
          const isSelected = selectedChartPoint === idx;

          return (
            <circle
              key={idx}
              cx={x}
              cy={y}
              r={isSelected ? 6 : 4}
              className={`chart-point ${isSelected ? 'chart-point-active' : ''}`}
              onClick={() => {
                setSelectedChartPoint(idx);
                seekTo(p.timestamp);
              }}
            />
          );
        })}
      </svg>
    );
  };

  // Convertir segundos a formato MM:SS
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Obtener la URL de streaming para el video local
  const getVideoSrc = () => {
    if (!analysisData) return '';
    if (inputMode === 'path' && videoPath) {
      return `/api/stream-video?path=${encodeURIComponent(videoPath)}`;
    }
    // Si fue subido, el backend lo limpia después del análisis. Para reproducirlo localmente,
    // es mucho mejor recomendar y usar la ruta absoluta del disco.
    return '';
  };

  return (
    <div className="app-container">
      {/* HEADER */}
      <header className="app-header">
        <div className="logo-container">
          <Flame size={32} className="chart-tension-alert" style={{ color: 'var(--accent-red)' }} />
          <span className="logo-text">SLASHERCUT</span>
        </div>
        
        {isKeySetup && (
          <button onClick={handleResetKey} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
            <Settings size={16} /> Cambiar API Key
          </button>
        )}
      </header>

      {/* 1. SECCIÓN DE CONFIGURACIÓN DE API KEY (SI NO TIENE) */}
      {!isKeySetup ? (
        <div className="panel" style={{ maxWidth: '600px', margin: '3rem auto', width: '100%' }}>
          <div className="panel-header">
            <h3 className="panel-title">
              <Sparkles size={20} style={{ color: 'var(--accent-red)' }} />
              Configurar Claves de API (Gratis)
            </h3>
          </div>
          
          <div className="api-setup-card">
            <p style={{ fontSize: '0.95rem', lineHeight: '1.5', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Para procesar y analizar tus videos sin costo, utilizaremos la API de <strong>Gemini (Gratis)</strong>. 
              Además, para videos de terror, te recomendamos enormemente usar la API de <strong>Groq (Gratis)</strong> para transcribir el audio, ya que los filtros de seguridad de Google suelen bloquear sonidos espeluznantes y gritos.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <a 
                href="https://aistudio.google.com/" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="btn btn-primary"
                style={{ width: '100%' }}
              >
                1. Obtener API Key de Gemini (Requerida) <ChevronRight size={16} />
              </a>
              <a 
                href="https://console.groq.com/" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="btn btn-secondary"
                style={{ width: '100%' }}
              >
                2. Obtener API Key de Groq (Recomendada) <ChevronRight size={16} />
              </a>
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginTop: '1rem' }}>
              * Ambas claves son gratuitas y se obtienen iniciando sesión con tu cuenta de Google o GitHub en segundos.
            </span>
          </div>

          <form onSubmit={handleValidateKey}>
            <div className="form-group">
              <label className="form-label" htmlFor="apiKeyInput">API Key de Gemini (Requerida):</label>
              <input 
                id="apiKeyInput"
                type="password" 
                className="input-field" 
                placeholder="AIzaSy..." 
                value={tempKey}
                onChange={(e) => setTempKey(e.target.value)}
                disabled={isValidatingKey}
              />
            </div>
            
            <div className="form-group" style={{ marginTop: '1.25rem' }}>
              <label className="form-label" htmlFor="groqKeyInput">API Key de Groq (Opcional - Evita bloqueos de audio):</label>
              <input 
                id="groqKeyInput"
                type="password" 
                className="input-field" 
                placeholder="gsk_..." 
                value={tempGroqKey}
                onChange={(e) => setTempGroqKey(e.target.value)}
                disabled={isValidatingKey}
              />
            </div>

            {keyError && (
              <div style={{ color: 'var(--accent-red)', fontSize: '0.9rem', margin: '1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertCircle size={16} /> {keyError}
              </div>
            )}
            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ width: '100%', marginTop: '1rem' }}
              disabled={isValidatingKey}
            >
              {isValidatingKey ? (
                <>
                  <RefreshCw size={18} className="spinner" style={{ animationDuration: '2s' }} /> Validando...
                </>
              ) : 'Guardar API Keys'}
            </button>
          </form>
        </div>
      ) : (
        /* PANTALLA PRINCIPAL CON API KEY CONFIGURADA */
        <>
          {/* CONTROL DE ENTRADA Y FORMULARIO DE ANÁLISIS */}
          {!analysisData && !isAnalyzing && (
            <div className="panel" style={{ maxWidth: '800px', margin: '2rem auto', width: '100%' }}>
              <div className="panel-header">
                <h3 className="panel-title">
                  <Video size={20} style={{ color: 'var(--accent-red)' }} />
                  Analizar Nuevo Video de Terror
                </h3>
              </div>

              {/* Selector de modo de entrada */}
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.02)', padding: '0.25rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <button 
                  onClick={() => setInputMode('path')} 
                  className={`btn ${inputMode === 'path' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, padding: '0.5rem' }}
                >
                  <Link size={16} /> Ruta Local del Disco (Súper rápido)
                </button>
                <button 
                  onClick={() => setInputMode('upload')} 
                  className={`btn ${inputMode === 'upload' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, padding: '0.5rem' }}
                >
                  <Upload size={16} /> Subir Archivo (.mp4)
                </button>
              </div>

              <form onSubmit={handleStartAnalysis}>
                {/* Perfil del Canal (Branding) */}
                <div style={{ border: '1px solid var(--border-color)', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.01)' }}>
                  <h4 style={{ fontSize: '0.95rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                    <Sparkles size={16} style={{ color: 'var(--accent-red)' }} />
                    Perfil del Canal e Identidad de Marca (Branding)
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Nombre del Canal:</label>
                      <input 
                        type="text" 
                        className="input-field" 
                        placeholder="Ej: Terror Nocturno" 
                        value={channelName} 
                        onChange={(e) => {
                          setChannelName(e.target.value);
                          localStorage.setItem('channel_name', e.target.value);
                        }}
                        required
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Descripción de tu Canal (Estilo, Tono, Temas):</label>
                      <textarea 
                        className="input-field" 
                        placeholder="Ej: Canal dedicado a documentar casos reales de terror y leyendas urbanas con una narración lenta, inmersiva y un ambiente lúgubre." 
                        style={{ minHeight: '80px', resize: 'vertical' }}
                        value={channelDescription} 
                        onChange={(e) => {
                          setChannelDescription(e.target.value);
                          localStorage.setItem('channel_description', e.target.value);
                        }}
                        required
                      />
                    </div>
                  </div>
                </div>

                {inputMode === 'path' ? (
                  <div className="form-group">
                    <label className="form-label" htmlFor="videoPathInput">Ruta absoluta del archivo en tu PC:</label>
                    <input 
                      id="videoPathInput"
                      type="text" 
                      className="input-field" 
                      placeholder="C:\Videos\Terror\Video_Final_Montado.mp4" 
                      value={videoPath}
                      onChange={(e) => setVideoPath(e.target.value)}
                    />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Tip: En Windows, puedes hacer clic derecho sobre tu archivo y seleccionar "Copiar como ruta de acceso" y pegarlo aquí.
                    </span>
                  </div>
                ) : (
                  <div className="form-group">
                    <label className="form-label" htmlFor="videoFileInput">Selecciona el archivo de video:</label>
                    <input 
                      id="videoFileInput"
                      type="file" 
                      accept="video/mp4" 
                      className="input-field" 
                      onChange={(e) => setSelectedFile(e.target.files[0])}
                    />
                  </div>
                )}

                {analysisError && (
                  <div style={{ color: 'var(--accent-red)', fontSize: '0.9rem', margin: '1rem 0', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', background: 'rgba(239, 68, 68, 0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--accent-red-glow)' }}>
                    <AlertCircle size={18} style={{ marginTop: '2px', flexShrink: 0 }} /> 
                    <div>
                      <strong>Error al analizar:</strong>
                      <p style={{ marginTop: '0.25rem', fontSize: '0.85rem' }}>{analysisError}</p>
                    </div>
                  </div>
                )}

                <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '1rem' }}>
                  <Sparkles size={18} /> ¡Destripar y Analizar Video!
                </button>
              </form>
            </div>
          )}

          {/* ESTADO DE PROCESAMIENTO / ANÁLISIS */}
          {isAnalyzing && (
            <div className="panel" style={{ maxWidth: '600px', margin: '4rem auto', width: '100%', textAlign: 'center' }}>
              <div className="loading-container">
                <div className="spinner"></div>
                <div>
                  <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Analizando el Guion y el Ritmo...</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                    Extraemos el audio y Gemini procesará el contenido. Esto puede tomar de 30 a 90 segundos dependiendo de la duración de tu video.
                  </p>
                </div>

                {/* Pasos / Stepper */}
                <div className="stepper">
                  <div className={`step-item ${analysisStep === 1 ? 'active' : ''} ${analysisStep > 1 ? 'done' : ''}`}>
                    <span className="step-number">1</span>
                    <span className="step-label">Extrayendo pista de audio (FFmpeg)</span>
                  </div>
                  <div className={`step-item ${analysisStep === 2 ? 'active' : ''} ${analysisStep > 2 ? 'done' : ''}`}>
                    <span className="step-number">2</span>
                    <span className="step-label">Subiendo audio a Gemini File API</span>
                  </div>
                  <div className={`step-item ${analysisStep === 3 ? 'active' : ''} ${analysisStep > 3 ? 'done' : ''}`}>
                    <span className="step-number">3</span>
                    <span className="step-label">Ejecutando Crítica y Transcripción (LLM)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. DASHBOARD DE RESULTADOS (CUANDO EL ANÁLISIS YA ESTÁ COMPLETADO) */}
          {analysisData && (
            <div className="dashboard-grid">
              
              {/* COLUMNA PRINCIPAL (REPRODUCTOR + GRÁFICO DE TENSIÓN) */}
              <div className="main-column">
                
                {/* Reproductor de Video */}
                <div className="panel" style={{ padding: '1rem' }}>
                  <div className="panel-header" style={{ marginBottom: '0.75rem' }}>
                    <h3 className="panel-title">
                      <Video size={18} style={{ color: 'var(--accent-red)' }} />
                      Reproductor Integrado
                    </h3>
                    {inputMode === 'path' && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {videoPath.substring(videoPath.lastIndexOf('\\') + 1)}
                      </span>
                    )}
                  </div>

                  <div className="video-wrapper">
                    {getVideoSrc() ? (
                      <video
                        ref={videoRef}
                        className="video-element"
                        src={getVideoSrc()}
                        controls
                        onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                      />
                    ) : (
                      <div className="video-placeholder">
                        <AlertTriangle size={48} />
                        <div style={{ textAlign: 'center' }}>
                          <p style={{ fontWeight: '600' }}>Video no disponible para streaming directo.</p>
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem', padding: '0 2rem' }}>
                            Para ver el video sincronizado e interactivo en esta interfaz, utiliza la opción de "Ruta Local".
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Medidor de Tensión (Ritmo de la Narración) */}
                <div className="panel">
                  <div className="panel-header">
                    <h3 className="panel-title">
                      <TrendingUp size={18} style={{ color: 'var(--accent-red)' }} />
                      Medidor de Tensión y Ritmo Narrativo
                    </h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Haz clic en los nodos para saltar al momento en el video
                    </span>
                  </div>

                  <div className="chart-container">
                    {renderTensionChart()}
                  </div>

                  {/* Detalle del punto de tensión seleccionado */}
                  {analysisData.tension_meter && analysisData.tension_meter[selectedChartPoint] && (
                    <div className="tension-details-card chart-tension-alert">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="segment-time">
                          Tiempo: {formatTime(analysisData.tension_meter[selectedChartPoint].timestamp)}
                        </span>
                        <span className={`tension-badge ${
                          analysisData.tension_meter[selectedChartPoint].tension_level >= 75 ? 'tension-high' :
                          analysisData.tension_meter[selectedChartPoint].tension_level >= 45 ? 'tension-medium' : 'tension-low'
                        }`}>
                          Tensión: {analysisData.tension_meter[selectedChartPoint].tension_level}%
                        </span>
                      </div>
                      
                      <p style={{ fontSize: '0.9rem', marginTop: '0.5rem', color: 'var(--text-primary)' }}>
                        <strong>Análisis:</strong> {analysisData.tension_meter[selectedChartPoint].analysis}
                      </p>
                      
                      {analysisData.tension_meter[selectedChartPoint].suggestion && (
                        <p style={{ fontSize: '0.9rem', marginTop: '0.5rem', color: 'var(--accent-red-hover)', display: 'flex', alignItems: 'flex-start', gap: '0.25rem' }}>
                          <AlertTriangle size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
                          <span><strong>Mejora:</strong> {analysisData.tension_meter[selectedChartPoint].suggestion}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* BOTÓN PARA RE-ANALIZAR OTRO VIDEO */}
                <button 
                  onClick={() => {
                    setAnalysisData(null);
                    setAnalysisStep(0);
                    setSelectedFile(null);
                  }} 
                  className="btn btn-secondary" 
                  style={{ alignSelf: 'flex-start' }}
                >
                  <RefreshCw size={16} /> Analizar otro video
                </button>
              </div>

              {/* COLUMNA LATERAL (TRANSCRIPCIÓN + CRÍTICA / TABS) */}
              <div className="sidebar-column">
                
                {/* Transcripción Sincronizada */}
                <div className="panel">
                  <div className="panel-header">
                    <h3 className="panel-title">
                      <FileText size={18} style={{ color: 'var(--accent-red)' }} />
                      Guion Transcrito con Marcas
                    </h3>
                  </div>

                  <div className="transcription-scroll" ref={transcriptionContainerRef}>
                    {analysisData.transcription && analysisData.transcription.map((seg, idx) => (
                      <div
                        key={idx}
                        id={`segment-${idx}`}
                        className={`transcription-segment ${activeSegmentIndex === idx ? 'active-segment' : ''}`}
                        onClick={() => seekTo(seg.start)}
                      >
                        <span className="segment-time">{formatTime(seg.start)} - {formatTime(seg.end)}</span>
                        <p className="segment-text">{seg.text}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ANÁLISIS DETALLADO (TABS) */}
                <div className="panel" style={{ flexGrow: 1 }}>
                  
                  {/* Navegación por Pestañas */}
                  <div className="tab-navigation">
                    <button 
                      onClick={() => setActiveTab('script')} 
                      className={`tab-btn ${activeTab === 'script' ? 'active-tab' : ''}`}
                    >
                      Guion Optimizado
                    </button>
                    <button 
                      onClick={() => setActiveTab('shorts')} 
                      className={`tab-btn ${activeTab === 'shorts' ? 'active-tab' : ''}`}
                    >
                      Shorts Virales
                    </button>
                    <button 
                      onClick={() => setActiveTab('hook')} 
                      className={`tab-btn ${activeTab === 'hook' ? 'active-tab' : ''}`}
                    >
                      Gancho (30s)
                    </button>
                    <button 
                      onClick={() => setActiveTab('cliches')} 
                      className={`tab-btn ${activeTab === 'cliches' ? 'active-tab' : ''}`}
                    >
                      Clichés/Palabras
                    </button>
                    <button 
                      onClick={() => setActiveTab('metadata')} 
                      className={`tab-btn ${activeTab === 'metadata' ? 'active-tab' : ''}`}
                    >
                      YouTube SEO
                    </button>
                    <button 
                      onClick={() => setActiveTab('thumbnails')} 
                      className={`tab-btn ${activeTab === 'thumbnails' ? 'active-tab' : ''}`}
                    >
                      Miniaturas y Prompts
                    </button>
                  </div>

                  {/* CONTENIDO DE PESTAÑA: GUION OPTIMIZADO */}
                  {activeTab === 'script' && analysisData.optimized_script && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      {/* Contenedor del Chat de Refinamiento */}
                      <div style={{ background: 'rgba(239, 68, 68, 0.03)', border: '1px dashed var(--accent-red-glow)', borderRadius: '12px', padding: '1rem' }}>
                        <h4 style={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                          <MessageSquare size={16} style={{ color: 'var(--accent-red)' }} />
                          Refinar Guion con IA Interactivamente
                        </h4>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                          Pídele cambios a la IA para este guion (ej. "haz que el saludo sea más misterioso", "recorta explicaciones", "cambia el tono").
                        </p>
                        <form onSubmit={handleRefineScript} style={{ display: 'flex', gap: '0.5rem' }}>
                          <input 
                            type="text" 
                            className="input-field" 
                            placeholder="Escribe tu instrucción de cambio aquí..." 
                            style={{ flexGrow: 1, padding: '0.5rem 0.75rem', fontSize: '0.9rem' }}
                            value={refineInstruction}
                            onChange={(e) => setRefineInstruction(e.target.value)}
                            disabled={isRefining}
                          />
                          <button 
                            type="submit" 
                            className="btn btn-primary" 
                            style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                            disabled={isRefining}
                          >
                            {isRefining ? <RefreshCw size={16} className="spinner" /> : 'Refinar'}
                          </button>
                        </form>
                        {refineError && (
                          <span style={{ color: 'var(--accent-red)', fontSize: '0.8rem', marginTop: '0.5rem', display: 'block' }}>
                            ⚠️ {refineError}
                          </span>
                        )}
                      </div>

                      {/* Botones de Exportación y Copiado */}
                      <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button 
                          type="button"
                          onClick={handleDownloadPDF} 
                          className="btn btn-secondary" 
                          style={{ flex: 1, padding: '0.75rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                        >
                          <FileText size={16} /> Exportar PDF / Imprimir
                        </button>
                        <button 
                          type="button"
                          onClick={handleCopyFullScript} 
                          className="btn btn-primary" 
                          style={{ flex: 1, padding: '0.75rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                        >
                          <Copy size={16} /> Copiar para ElevenLabs
                        </button>
                      </div>

                      {/* Selector de tipo de Vista (Segmentos vs Párrafo) */}
                      <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255,255,255,0.02)', padding: '0.25rem', borderRadius: '8px', border: '1px solid var(--border-color)', margin: '0.5rem 0' }}>
                        <button 
                          type="button"
                          onClick={() => setScriptViewMode('segments')}
                          className={`btn ${scriptViewMode === 'segments' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, padding: '0.4rem', fontSize: '0.8rem', border: 'none' }}
                        >
                          Vista Detallada (Segmentos)
                        </button>
                        <button 
                          type="button"
                          onClick={() => setScriptViewMode('paragraph')}
                          className={`btn ${scriptViewMode === 'paragraph' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, padding: '0.4rem', fontSize: '0.8rem', border: 'none' }}
                        >
                          Vista de Lectura (Párrafos)
                        </button>
                      </div>

                      {scriptViewMode === 'paragraph' ? (
                        /* Vista de Párrafo corrido */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '500px', overflowY: 'auto', padding: '1.25rem', background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                          <div style={{ fontSize: '1.05rem', lineHeight: '1.7', color: 'var(--text-primary)' }}>
                            {analysisData.optimized_script.map((seg, idx) => (
                              <p 
                                key={idx} 
                                style={{ 
                                  marginBottom: '1.25rem', 
                                  borderLeft: activeSegmentIndex === idx ? '3px solid var(--accent-red)' : '3px solid transparent', 
                                  paddingLeft: '0.75rem', 
                                  transition: 'border-color 0.3s',
                                  cursor: 'pointer'
                                }} 
                                onClick={() => seekTo(seg.start)}
                              >
                                {seg.optimized_text}
                              </p>
                            ))}
                          </div>
                        </div>
                      ) : (
                        /* Lista de Segmentos del Guion */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '500px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                          {analysisData.optimized_script.map((seg, idx) => {
                            let wpmColor = 'var(--success)';
                            if (seg.wpm_status === 'Rápido' || seg.wpm > 140) wpmColor = 'var(--accent-red)';
                            else if (seg.wpm_status === 'Pausado' || seg.wpm < 95) wpmColor = 'var(--warning)';

                            return (
                              <div 
                                key={idx} 
                                className="panel" 
                                style={{ 
                                  padding: '1rem', 
                                  background: 'rgba(255, 255, 255, 0.01)', 
                                  borderLeft: activeSegmentIndex === idx ? '3px solid var(--accent-red)' : '1px solid var(--border-color)',
                                  cursor: 'pointer'
                                }}
                                onClick={() => seekTo(seg.start)}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                  <span className="segment-time">{formatTime(seg.start)} - {formatTime(seg.end)}</span>
                                  <span style={{ fontSize: '0.8rem', color: wpmColor, fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <TrendingUp size={12} />
                                    {seg.wpm} WPM ({seg.wpm_status || 'Normal'})
                                  </span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem', fontSize: '0.9rem' }}>
                                  <div style={{ opacity: 0.6 }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Transcripción Original:</span>
                                    <p style={{ marginTop: '0.2rem', fontStyle: 'italic' }}>{seg.original_text}</p>
                                  </div>
                                  <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.02)' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--accent-red-hover)' }}>Guion Optimizado ✨:</span>
                                    <p style={{ marginTop: '0.2rem', color: 'var(--text-primary)', fontWeight: '500' }}>{seg.optimized_text}</p>
                                  </div>
                                </div>

                                {seg.pacing_alert && (
                                  <div style={{ marginTop: '0.5rem', padding: '0.4rem 0.6rem', background: 'rgba(245, 158, 11, 0.05)', borderLeft: '2px solid var(--warning)', borderRadius: '0 4px 4px 0', fontSize: '0.8rem', color: '#fde047' }}>
                                    <strong>Ritmo:</strong> {seg.pacing_alert}
                                  </div>
                                )}
                                
                                {seg.production_note && (
                                  <div style={{ marginTop: '0.5rem', padding: '0.4rem 0.6rem', background: 'rgba(239, 68, 68, 0.05)', borderLeft: '2px solid var(--accent-red)', borderRadius: '0 4px 4px 0', fontSize: '0.8rem', color: '#fca5a5' }}>
                                    <strong>🎬 Edición SFX/VFX:</strong> {seg.production_note}
                                  </div>
                                )}

                                {seg.open_loop && (
                                  <div style={{ marginTop: '0.5rem', padding: '0.4rem 0.6rem', background: 'rgba(59, 130, 246, 0.05)', borderLeft: '2px solid var(--info)', borderRadius: '0 4px 4px 0', fontSize: '0.8rem', color: '#93c5fd' }}>
                                    <strong>🔗 Bucle de Atención:</strong> {seg.open_loop}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* CONTENIDO DE PESTAÑA: SHORTS VIRALES */}
                  {activeTab === 'shorts' && analysisData.viral_shorts && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {analysisData.viral_shorts.map((short, idx) => (
                          <div key={idx} className="thumbnail-idea-card" style={{ background: 'rgba(255, 255, 255, 0.01)' }}>
                            <div className="thumbnail-idea-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Scissors size={16} style={{ color: 'var(--accent-red)' }} />
                                Idea de Clip Viral #{idx + 1}
                              </span>
                              <button 
                                onClick={() => seekTo(short.start)} 
                                className="btn btn-secondary" 
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                              >
                                Ver en reproductor ({formatTime(short.start)} - {formatTime(short.end)})
                              </button>
                            </div>
                            
                            <div className="thumbnail-idea-body">
                              <h4 style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                                TÍTULO: "{short.title}"
                              </h4>
                              
                              <div style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.75rem', marginBottom: '0.75rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--accent-red-hover)' }}>Gancho de 3 segundos (Formato Vertical) 📱:</span>
                                  <button 
                                    onClick={() => copyToClipboard(short.hook_modification)}
                                    className="btn" 
                                    style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)' }}
                                  >
                                    Copiar Gancho
                                  </button>
                                </div>
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontStyle: 'italic', lineHeight: '1.4' }}>
                                  "{short.hook_modification}"
                                </p>
                              </div>

                              {short.rationale && (
                                <p className="thumbnail-rationale" style={{ fontSize: '0.85rem' }}>
                                  <strong>Por qué viralizará:</strong> {short.rationale}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* CONTENIDO DE PESTAÑA: GANCHO */}
                  {activeTab === 'hook' && analysisData.hook_analysis && (
                    <div>
                      <div className="hook-grade-container">
                        <div className={`hook-grade-circle ${
                          analysisData.hook_analysis.score.startsWith('A') ? 'grade-a' :
                          analysisData.hook_analysis.score.startsWith('B') ? 'grade-b' :
                          analysisData.hook_analysis.score.startsWith('C') ? 'grade-c' : ''
                        }`}>
                          {analysisData.hook_analysis.score}
                        </div>
                        <div>
                          <h4 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>Efectividad del Hook</h4>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Calificación en los primeros 30 segundos</span>
                        </div>
                      </div>

                      <p className="hook-critique-text">
                        {analysisData.hook_analysis.critique}
                      </p>

                      {analysisData.hook_analysis.suggestions && (
                        <div style={{ marginTop: '1.25rem' }}>
                          <h5 style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Cómo mejorarlo:</h5>
                          <ul className="bullet-list">
                            {analysisData.hook_analysis.suggestions.map((sug, idx) => (
                              <li key={idx}>
                                <Flame size={14} style={{ color: 'var(--accent-red)', marginTop: '3px' }} />
                                <span>{sug}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* CONTENIDO DE PESTAÑA: CLICHÉS */}
                  {activeTab === 'cliches' && analysisData.cliches_detector && (
                    <div>
                      <h4 style={{ fontSize: '1rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <AlertTriangle size={16} style={{ color: 'var(--warning)' }} />
                        Palabras Repetitivas y Alternativas
                      </h4>
                      
                      <div className="word-badge-container">
                        {analysisData.cliches_detector.repeated_words && analysisData.cliches_detector.repeated_words.map((item, idx) => (
                          <div key={idx} className="word-badge">
                            <span style={{ fontWeight: '600' }}>"{item.word}"</span>
                            <span className="word-badge-count">{item.count}x</span>
                            {item.synonyms && item.synonyms.length > 0 && (
                              <span className="word-synonyms">
                                (Mejor: {item.synonyms.slice(0, 2).join(', ')})
                              </span>
                            )}
                          </div>
                        ))}
                      </div>

                      <h4 style={{ fontSize: '1rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Flame size={16} style={{ color: 'var(--accent-red)' }} />
                        Clichés Narrativos Detectados
                      </h4>

                      <div className="cliche-card-list">
                        {analysisData.cliches_detector.cliches_found && analysisData.cliches_detector.cliches_found.map((c, idx) => (
                          <div key={idx} className="cliche-card">
                            <div className="cliche-title">Cliché: "{c.cliche}"</div>
                            <div className="cliche-why">Por qué evitarlo: {c.why}</div>
                            <div className="cliche-alternative">
                              <strong>Alternativa tensa:</strong> {c.alternative}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* CONTENIDO DE PESTAÑA: METADATOS SEO */}
                  {activeTab === 'metadata' && analysisData.metadata && (
                    <div>
                      <div className="metadata-section">
                        <h4 style={{ fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: '0.75rem' }}>Propuestas de Títulos (YouTube CTR)</h4>
                        <div className="metadata-title-list">
                          {analysisData.metadata.titles && analysisData.metadata.titles.map((t, idx) => (
                            <div key={idx} className="copy-container">
                              <span style={{ paddingRight: '1rem' }}>{t}</span>
                              <button onClick={() => copyToClipboard(t)} className="btn-copy">
                                <Copy size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="metadata-section">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <h4 style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>Descripción Optimizada SEO</h4>
                          <button 
                            onClick={() => copyToClipboard(analysisData.metadata.description)} 
                            className="btn" 
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)' }}
                          >
                            <Copy size={12} /> Copiar Todo
                          </button>
                        </div>
                        <div className="description-box">
                          {analysisData.metadata.description}
                        </div>
                      </div>

                      <div className="metadata-section" style={{ marginBottom: 0 }}>
                        <h4 style={{ fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Etiquetas / Tags Sugeridos</h4>
                        <div className="tags-container">
                          {analysisData.metadata.tags && analysisData.metadata.tags.map((tag, idx) => (
                            <span key={idx} className="tag-badge">#{tag}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CONTENIDO DE PESTAÑA: SUGERENCIAS DE MINIATURAS & MIDJOURNEY */}
                  {activeTab === 'thumbnails' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      {/* Prompts de Midjourney / Leonardo.ai */}
                      {analysisData.thumbnail_image_prompts && (
                        <div>
                          <h4 style={{ fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Sparkles size={18} style={{ color: 'var(--accent-red)' }} />
                            Prompts de Generación de Imagen (Midjourney / Leonardo)
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {analysisData.thumbnail_image_prompts.map((p, idx) => (
                              <div key={idx} className="cliche-card" style={{ background: 'rgba(239, 68, 68, 0.01)', border: '1px solid rgba(239, 68, 68, 0.05)' }}>
                                <div style={{ fontWeight: '600', fontSize: '0.95rem', color: 'var(--accent-red-hover)', marginBottom: '0.25rem' }}>
                                  Concepto #{idx + 1}: {p.concept}
                                </div>
                                <div className="copy-container" style={{ margin: '0.5rem 0', background: 'rgba(0, 0, 0, 0.4)' }}>
                                  <span style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: 'var(--text-primary)', wordBreak: 'break-all', paddingRight: '1rem' }}>
                                    {p.prompt}
                                  </span>
                                  <button onClick={() => copyToClipboard(p.prompt)} className="btn-copy">
                                    <Copy size={16} />
                                  </button>
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                  <strong>Impacto Psicológico:</strong> {p.why}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Ideas Estructurales de Miniaturas */}
                      {analysisData.thumbnail_ideas && (
                        <div>
                          <h4 style={{ fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Image size={18} style={{ color: 'var(--accent-red)' }} />
                            Ideas de Composición de Miniaturas (CTR)
                          </h4>
                          <div className="thumbnail-ideas-list">
                            {analysisData.thumbnail_ideas.map((idea, idx) => (
                              <div key={idx} className="thumbnail-idea-card">
                                <div className="thumbnail-idea-header">
                                  <span>Composición de Portada #{idx + 1}</span>
                                  <Image size={16} style={{ color: 'var(--accent-red)' }} />
                                </div>
                                
                                <div className="thumbnail-idea-body">
                                  <p className="thumbnail-idea-desc">
                                    <strong>Concepto:</strong> {idea.description}
                                  </p>
                                  
                                  <div className="thumbnail-idea-tags">
                                    {idea.elements && idea.elements.map((el, eIdx) => (
                                      <span key={eIdx} className="thumbnail-tag">{el}</span>
                                    ))}
                                  </div>
                                  
                                  {idea.rationale && (
                                    <p className="thumbnail-rationale">
                                      <strong>Estrategia CTR:</strong> {idea.rationale}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                </div>

              </div>

            </div>
          )}
        </>
      )}

      {/* MENSAJE TOAST */}
      {toastMessage && (
        <div className="toast">
          <Info size={16} style={{ color: 'var(--accent-red)' }} />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
