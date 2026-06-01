import React, { useState, useEffect, useRef } from 'react';
import { 
  Flame, Play, Pause, Video, Music, TrendingUp, Copy, Check, 
  Settings, AlertTriangle, Image, FileText, Sparkles, RefreshCw, 
  Upload, Link, AlertCircle, Info, ChevronRight, MessageSquare, Scissors,
  LogOut, User, Search, History, BarChart2, CheckCircle, Globe, Plus, Sparkle
} from 'lucide-react';
import { supabase } from './supabaseClient';

export default function App() {
  // === ESTADOS DE AUTENTICACIÓN Y SESIÓN (SUPABASE) ===
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  
  // Formulario Auth
  const [authMode, setAuthMode] = useState('login'); // 'login' o 'signup'
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // Formulario Onboarding (Canal de YouTube)
  const [channelUrlInput, setChannelUrlInput] = useState('');
  const [onboardingName, setOnboardingName] = useState('');
  const [onboardingDesc, setOnboardingDesc] = useState('');
  const [onboardingAvatar, setOnboardingAvatar] = useState('');
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [onboardingError, setOnboardingError] = useState('');

  // === ESTADOS DE LA APP (DASHBOARD PRINCIPAL) ===
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [groqApiKey, setGroqApiKey] = useState(() => localStorage.getItem('groq_api_key') || '');
  const [isKeySetup, setIsKeySetup] = useState(!!apiKey);
  const [tempKey, setTempKey] = useState('');
  const [tempGroqKey, setTempGroqKey] = useState(() => localStorage.getItem('groq_api_key') || '');
  const [isValidatingKey, setIsValidatingKey] = useState(false);
  const [keyError, setKeyError] = useState('');

  // Navegación Sidebar
  const [currentSection, setCurrentSection] = useState('generator'); // 'generator', 'analyzer', 'history'

  // Historial de guiones en Supabase
  const [scriptsHistory, setScriptsHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Estados del Analizador de Títulos
  const [titleInput, setTitleInput] = useState('');
  const [isAnalyzingTitle, setIsAnalyzingTitle] = useState(false);
  const [titleAnalysisResult, setTitleAnalysisResult] = useState(null);
  const [titleAnalysisError, setTitleAnalysisError] = useState('');

  // Estados del Refinamiento de Guion
  const [refineInstruction, setRefineInstruction] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [refineError, setRefineError] = useState('');

  // Estados de carga de videos/URLs
  const [videoUrl, setVideoUrl] = useState('');
  const [videoPath, setVideoPath] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [inputMode, setInputMode] = useState('url'); // 'url', 'path', 'upload'

  // Estados del proceso de análisis
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0); // 0: inactivo, 1: extracción, 2: subida, 3: IA
  const [analysisError, setAnalysisError] = useState('');

  // Resultados del Guion Generado
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

  // === EFECTOS DE AUTENTICACIÓN (SUPABASE) ===
  useEffect(() => {
    // Escuchar cambios de sesión
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserProfile(session.user.id);
      } else {
        setProfileLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserProfile(session.user.id);
      } else {
        setProfile(null);
        setProfileLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Cargar Perfil del Usuario
  const fetchUserProfile = async (userId) => {
    setProfileLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      setProfile(data || null);
    } catch (err) {
      console.error('Error cargando perfil:', err);
    } finally {
      setProfileLoading(false);
    }
  };

  // Cargar Historial de Guiones
  const fetchScriptsHistory = async () => {
    if (!user) return;
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('generated_scripts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setScriptsHistory(data || []);
    } catch (err) {
      console.error('Error cargando historial:', err);
      showToast('Error al cargar historial.');
    } finally {
      setHistoryLoading(false);
    }
  };

  // Cargar historial al cambiar a la pestaña de historial
  useEffect(() => {
    if (currentSection === 'history') {
      fetchScriptsHistory();
    }
  }, [currentSection]);

  // Manejar Login / Registro
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');

    try {
      if (authMode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
        showToast('¡Registro exitoso! Ya puedes iniciar sesión.');
        setAuthMode('login');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
        showToast('Sesión iniciada con éxito.');
      }
    } catch (err) {
      setAuthError(err.message || 'Error en la autenticación.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Cerrar Sesión
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setScriptsHistory([]);
    setAnalysisData(null);
    showToast('Sesión cerrada.');
  };

  // Escanear canal de YouTube (Onboarding)
  const handleScanChannel = async (e) => {
    e.preventDefault();
    if (!channelUrlInput.trim()) {
      setOnboardingError('Por favor ingresa la URL de tu canal.');
      return;
    }

    setOnboardingLoading(true);
    setOnboardingError('');

    try {
      const res = await fetch('http://localhost:8000/api/fetch-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelUrl: channelUrlInput.trim() })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setOnboardingName(data.channelName);
        setOnboardingDesc(data.channelDescription);
        setOnboardingAvatar(data.channelAvatarUrl);
        showToast('Canal escaneado con éxito.');
      } else {
        setOnboardingError(data.error || 'No se pudo escanear el canal automáticamente. Complétalo a mano.');
      }
    } catch (err) {
      setOnboardingError('Error de conexión con el backend local. Por favor escribe tus datos a mano.');
    } finally {
      setOnboardingLoading(false);
    }
  };

  // Guardar Perfil (Onboarding)
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!onboardingName.trim()) {
      setOnboardingError('Por favor ingresa el nombre de tu canal.');
      return;
    }

    setOnboardingLoading(true);
    setOnboardingError('');

    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          channel_name: onboardingName.trim(),
          channel_description: onboardingDesc.trim(),
          channel_url: channelUrlInput.trim(),
          channel_avatar_url: onboardingAvatar.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
        .select()
        .single();

      if (error) throw error;
      setProfile(data);
      showToast('¡Perfil creado exitosamente!');
    } catch (err) {
      setOnboardingError(err.message || 'Error al guardar el perfil.');
    } finally {
      setOnboardingLoading(false);
    }
  };

  // === EFECTOS SECUNDARIOS GENERADOS ===
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
      const res = await fetch('http://localhost:8000/api/check-key', {
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
      setKeyError('Error de conexión con el backend local.');
    } finally {
      setIsValidatingKey(false);
    }
  };

  // Reset Keys
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

  // Copiar texto al portapapeles
  const copyToClipboard = (text) => {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => showToast('¡Copiado al portapapeles!'))
        .catch(() => fallbackCopyToClipboard(text));
    } else {
      fallbackCopyToClipboard(text);
    }
  };

  const fallbackCopyToClipboard = (text) => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (successful) showToast('¡Copiado al portapapeles!');
      else showToast('Error al copiar.');
    } catch (err) {
      showToast('Error al copiar.');
    }
  };

  // Enviar video o URL para análisis
  const handleStartAnalysis = async (e) => {
    e.preventDefault();
    setAnalysisError('');
    setIsAnalyzing(true);
    setAnalysisData(null);
    setAnalysisStep(1); // Iniciando extracción

    // Simulador visual de progreso para dar feedback dinámico
    const stepInterval = setInterval(() => {
      setAnalysisStep(prev => {
        if (prev === 1) return 2; // Simular lectura
        if (prev === 2) return 3; // Simular IA
        return prev;
      });
    }, 8000);

    try {
      let body;
      let headers = {};

      if (inputMode === 'url') {
        if (!videoUrl.trim()) {
          throw new Error('Debe proporcionar un enlace de YouTube.');
        }
        body = JSON.stringify({
          videoUrl: videoUrl.trim(),
          apiKey,
          groqApiKey,
          channelName: profile?.channel_name || 'Mi Canal',
          channelDescription: profile?.channel_description || 'General'
        });
        headers['Content-Type'] = 'application/json';
      } else if (inputMode === 'path') {
        if (!videoPath.trim()) {
          throw new Error('Debe proporcionar la ruta absoluta del video.');
        }
        body = JSON.stringify({ 
          videoPath: videoPath.trim(), 
          apiKey, 
          groqApiKey,
          channelName: profile?.channel_name || 'Mi Canal',
          channelDescription: profile?.channel_description || 'General'
        });
        headers['Content-Type'] = 'application/json';
      } else {
        if (!selectedFile) {
          throw new Error('Debe seleccionar un archivo de video.');
        }
        const formData = new FormData();
        formData.append('videoFile', selectedFile);
        formData.append('apiKey', apiKey);
        formData.append('groqApiKey', groqApiKey);
        formData.append('channelName', profile?.channel_name || 'Mi Canal');
        formData.append('channelDescription', profile?.channel_description || 'General');
        body = formData;
      }

      const res = await fetch('http://localhost:8000/api/analyze', {
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
        showToast('¡Guion generado con éxito!');

        // AUTO-GUARDAR EN SUPABASE
        const targetTitle = data.metadata?.titles?.[0] || 'Guion sin título';
        const targetUrl = inputMode === 'url' ? videoUrl.trim() : (selectedFile ? selectedFile.name : videoPath);
        
        await supabase
          .from('generated_scripts')
          .insert({
            user_id: user.id,
            video_url: targetUrl,
            video_title: targetTitle,
            generated_script: JSON.stringify(data)
          });
          
      } else {
        setAnalysisError(data.error || 'Ocurrió un error al procesar tu solicitud.');
        setAnalysisStep(0);
      }
    } catch (err) {
      clearInterval(stepInterval);
      setAnalysisError(err.message || 'Error de conexión con el servidor local.');
      setAnalysisStep(0);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Cargar guion anterior del historial
  const handleLoadScript = (scriptData) => {
    try {
      const parsedData = JSON.parse(scriptData.generated_script);
      setAnalysisData(parsedData);
      setAnalysisStep(4); // Completado
      setSelectedChartPoint(0);
      setCurrentSection('generator');
      showToast('Guion cargado desde la nube.');
    } catch (err) {
      showToast('Error al procesar el guion del historial.');
    }
  };

  // Eliminar guion del historial
  const handleDeleteScript = async (scriptId, e) => {
    e.stopPropagation();
    if (!confirm('¿Estás seguro de que quieres eliminar este guion de tu historial?')) return;
    try {
      const { error } = await supabase
        .from('generated_scripts')
        .delete()
        .eq('id', scriptId);

      if (error) throw error;
      showToast('Guion eliminado.');
      fetchScriptsHistory();
    } catch (err) {
      showToast('Error al eliminar guion.');
    }
  };

  // Analizar Título
  const handleAnalyzeTitle = async (e) => {
    e.preventDefault();
    if (!titleInput.trim()) return;
    setIsAnalyzingTitle(true);
    setTitleAnalysisError('');
    setTitleAnalysisResult(null);

    try {
      const res = await fetch('http://localhost:8000/api/analyze-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleInput.trim(),
          apiKey,
          channelName: profile?.channel_name,
          channelDescription: profile?.channel_description
        })
      });

      const data = await res.json();
      if (res.ok) {
        setTitleAnalysisResult(data);
        showToast('¡Título analizado!');
      } else {
        setTitleAnalysisError(data.error || 'Error al analizar el título.');
      }
    } catch (err) {
      setTitleAnalysisError('Error de red al conectar con el backend local.');
    } finally {
      setIsAnalyzingTitle(false);
    }
  };

  // Refinar/Reescribir Guion
  const handleRefineScript = async (e) => {
    e.preventDefault();
    if (!refineInstruction.trim()) return;
    setIsRefining(true);
    setRefineError('');

    try {
      const res = await fetch('http://localhost:8000/api/refine-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          script: analysisData?.optimized_script,
          comment: refineInstruction.trim(),
          channelName: profile?.channel_name,
          channelDescription: profile?.channel_description
        })
      });

      const data = await res.json();
      if (res.ok && data.optimized_script) {
        setAnalysisData(prev => ({
          ...prev,
          optimized_script: data.optimized_script
        }));
        setRefineInstruction('');
        showToast('¡Guion refinado exitosamente!');
      } else {
        setRefineError(data.error || 'No se pudo reescribir el guion.');
      }
    } catch (err) {
      setRefineError('Error de conexión con el backend.');
    } finally {
      setIsRefining(false);
    }
  };

  // Formatear Tiempo (segundos -> MM:SS)
  const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds === null) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Saltar a un segundo específico en el video
  const seekTo = (seconds) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  // Copiar todo el guion optimizado
  const handleCopyFullScript = () => {
    if (!analysisData || !analysisData.optimized_script) return;
    const fullText = analysisData.optimized_script.map(seg => seg.optimized_text).join('\n\n');
    copyToClipboard(fullText);
  };

  // Exportar PDF (Print)
  const handleDownloadPDF = () => {
    window.print();
  };

  // ============================================
  // RENDERING PRINCIPAL
  // ============================================

  // 1. RENDERIZACIÓN DE ESTADO CARGANDO PERFIL
  if (profileLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-dark)', color: 'var(--text-primary)' }}>
        <RefreshCw size={48} className="spinner" style={{ color: 'var(--accent-red)', marginBottom: '1rem' }} />
        <span>Conectando con la nube...</span>
      </div>
    );
  }

  // 2. RENDERIZACIÓN DE PANTALLA DE LOGUEO/REGISTRO (SUPABASE AUTH)
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at center, #1e1b4b 0%, #030712 100%)', padding: '1rem', color: 'var(--text-primary)' }}>
        <div className="panel" style={{ width: '100%', maxWidth: '420px', padding: '2.5rem', background: 'rgba(17, 24, 39, 0.7)', border: '1px solid rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(20px)', borderRadius: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '16px', background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)', color: '#fff', marginBottom: '1rem', boxShadow: '0 8px 16px rgba(168, 85, 247, 0.4)' }}>
              <Sparkle size={32} />
            </div>
            <h1 style={{ fontSize: '1.8rem', fontWeight: '800', background: 'linear-gradient(to right, #a855f7, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '0.25rem' }}>
              ScriptCrafter YT
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Crea guiones perfectos para tu canal en segundos</p>
          </div>

          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Correo Electrónico</label>
              <input 
                type="email" 
                className="form-control" 
                placeholder="ejemplo@correo.com" 
                value={authEmail} 
                onChange={e => setAuthEmail(e.target.value)} 
                required 
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Contraseña</label>
              <input 
                type="password" 
                className="form-control" 
                placeholder="••••••••" 
                value={authPassword} 
                onChange={e => setAuthPassword(e.target.value)} 
                required 
              />
            </div>

            {authError && (
              <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <AlertCircle size={16} />
                <span>{authError}</span>
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ padding: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)', border: 'none', fontWeight: 'bold' }} disabled={authLoading}>
              {authLoading ? <RefreshCw size={18} className="spinner" /> : (authMode === 'login' ? 'Iniciar Sesión' : 'Registrarse')}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem' }}>
            {authMode === 'login' ? (
              <span style={{ color: 'var(--text-secondary)' }}>
                ¿No tienes cuenta?{' '}
                <button onClick={() => setAuthMode('signup')} style={{ background: 'none', border: 'none', color: '#a855f7', fontWeight: 'bold', cursor: 'pointer', padding: 0 }}> Regístrate gratis</button>
              </span>
            ) : (
              <span style={{ color: 'var(--text-secondary)' }}>
                ¿Ya tienes cuenta?{' '}
                <button onClick={() => setAuthMode('login')} style={{ background: 'none', border: 'none', color: '#a855f7', fontWeight: 'bold', cursor: 'pointer', padding: 0 }}> Inicia sesión</button>
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 3. RENDERIZACIÓN DE LA PANTALLA DE ONBOARDING (CONFIGURAR CANAL DE YOUTUBE)
  if (!profile || !profile.channel_name) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at center, #1e1b4b 0%, #030712 100%)', padding: '1rem', color: 'var(--text-primary)' }}>
        <div className="panel" style={{ width: '100%', maxWidth: '520px', padding: '2.5rem', background: 'rgba(17, 24, 39, 0.7)', border: '1px solid rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(20px)', borderRadius: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: '800', marginBottom: '0.5rem' }}>🚀 Configura tu Canal</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Permítenos escanear la identidad de tu canal para adaptar los prompts de IA a tu voz y estilo.</p>
          </div>

          <form onSubmit={handleScanChannel} style={{ marginBottom: '2rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Introduce la URL o @Handle de tu Canal</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input 
                type="text" 
                className="form-control" 
                placeholder="https://youtube.com/@mi_canal" 
                value={channelUrlInput} 
                onChange={e => setChannelUrlInput(e.target.value)} 
                required 
              />
              <button type="submit" className="btn btn-secondary" style={{ padding: '0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }} disabled={onboardingLoading}>
                {onboardingLoading ? <RefreshCw size={16} className="spinner" /> : 'Escanear'}
              </button>
            </div>
          </form>

          <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.05)', margin: '1.5rem 0' }} />

          <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {onboardingAvatar && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
                <img 
                  src={onboardingAvatar} 
                  alt="Avatar escaneado" 
                  style={{ width: '80px', height: '80px', borderRadius: '50%', border: '3px solid #a855f7', boxShadow: '0 0 15px rgba(168, 85, 247, 0.4)' }} 
                />
              </div>
            )}
            
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Nombre del Canal</label>
              <input 
                type="text" 
                className="form-control" 
                value={onboardingName} 
                onChange={e => setOnboardingName(e.target.value)} 
                placeholder="Nombre de tu canal"
                required 
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Descripción y Estilo Creativo</label>
              <textarea 
                className="form-control" 
                rows="4"
                value={onboardingDesc} 
                onChange={e => setOnboardingDesc(e.target.value)} 
                placeholder="Ej: Canal de tutoriales de cocina fáciles y dinámicos para estudiantes. Tono muy alegre, juvenil y lleno de chistes."
                required 
              />
            </div>

            {onboardingError && (
              <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.85rem' }}>
                ⚠️ {onboardingError}
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ padding: '0.85rem', fontWeight: 'bold', background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)', border: 'none' }} disabled={onboardingLoading}>
              {onboardingLoading ? <RefreshCw size={18} className="spinner" /> : 'Confirmar y Entrar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 4. RENDERIZACIÓN DE DASHBOARD PRINCIPAL (SaaS con Sidebar + Navigation)
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-dark)', color: 'var(--text-primary)' }}>
      
      {/* BARRA LATERAL (SIDEBAR) */}
      <aside style={{ width: '280px', flexShrink: 0, background: 'rgba(17, 24, 39, 0.8)', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '1.5rem', backdropFilter: 'blur(20px)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)', color: '#fff' }}>
              <Sparkle size={18} />
            </div>
            <span style={{ fontSize: '1.2rem', fontWeight: '800', background: 'linear-gradient(to right, #a855f7, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              ScriptCrafter
            </span>
          </div>

          {/* Tarjeta del Canal del Usuario */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <img 
              src={profile.channel_avatar_url || 'https://via.placeholder.com/40'} 
              alt="Channel avatar" 
              style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid #a855f7' }} 
            />
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: '700', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.channel_name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
            </div>
          </div>

          {/* Menú de Navegación */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button 
              onClick={() => setCurrentSection('generator')} 
              className={`btn ${currentSection === 'generator' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', border: 'none', justifyContent: 'flex-start' }}
            >
              <Video size={18} />
              <span>Generar Guion</span>
            </button>

            <button 
              onClick={() => setCurrentSection('analyzer')} 
              className={`btn ${currentSection === 'analyzer' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', border: 'none', justifyContent: 'flex-start' }}
            >
              <TrendingUp size={18} />
              <span>Analizar Títulos</span>
            </button>

            <button 
              onClick={() => setCurrentSection('history')} 
              className={`btn ${currentSection === 'history' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', border: 'none', justifyContent: 'flex-start' }}
            >
              <History size={18} />
              <span>Historial</span>
            </button>
          </nav>
        </div>

        {/* Sección inferior - Ajustes y Cerrar Sesión */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          <button 
            onClick={() => setIsKeySetup(false)} 
            className="btn btn-secondary" 
            style={{ padding: '0.6rem', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.8rem' }}
          >
            <Settings size={14} />
            <span>Configurar Llaves API</span>
          </button>

          <button 
            onClick={handleLogout} 
            className="btn btn-secondary" 
            style={{ padding: '0.6rem', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#fca5a5' }}
          >
            <LogOut size={14} />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <main style={{ flex: 1, padding: '2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* PANTALLA AJUSTES DE API KEY (SI NO ESTÁN LISTAS) */}
        {!isKeySetup && (
          <div style={{ maxWidth: '600px', margin: '2rem auto' }} className="panel">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '1.4rem' }}>
              <Settings style={{ color: 'var(--accent-red)' }} />
              Configurar Claves de API
            </h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              ScriptCrafter YT funciona en local utilizando tus propias claves de API. La API de Gemini ofrece un plan **100% gratuito** con el que podrás generar hasta 1500 guiones al día de forma gratuita.
            </p>

            <form onSubmit={handleValidateKey} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>API Key de Google Gemini (Requerida - Gratis)</label>
                <input 
                  type="password" 
                  className="form-control" 
                  placeholder="Pega tu clave AIzaSy..." 
                  value={tempKey} 
                  onChange={e => setTempKey(e.target.value)} 
                  required 
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                  ¿No tienes clave? Consíguela gratis en <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#a855f7' }}>Google AI Studio</a>.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>API Key de Groq / Whisper (Opcional para transcripción externa)</label>
                <input 
                  type="password" 
                  className="form-control" 
                  placeholder="gsk_..." 
                  value={tempGroqKey} 
                  onChange={e => setTempGroqKey(e.target.value)} 
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                  Opcional. Permite transcribir de forma ultra-precisa usando Whisper si un video local no tiene subtítulos automáticos en YouTube. Consíguela en <a href="https://console.groq.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#a855f7' }}>Groq Console</a>.
                </span>
              </div>

              {keyError && (
                <div style={{ color: '#fca5a5', background: 'rgba(239, 68, 68, 0.05)', padding: '0.5rem', borderRadius: '6px', borderLeft: '3px solid var(--accent-red)', fontSize: '0.85rem' }}>
                  ⚠️ {keyError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} disabled={isValidatingKey}>
                  {isValidatingKey ? <RefreshCw size={16} className="spinner" /> : 'Validar y Guardar Claves'}
                </button>
                {apiKey && (
                  <button type="button" onClick={() => setIsKeySetup(true)} className="btn btn-secondary" style={{ padding: '0.75rem' }}>
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

        {isKeySetup && (
          <>
            {/* SECCIÓN 1: GENERADOR DE GUIONES */}
            {currentSection === 'generator' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                
                {/* Formulario Principal de Carga */}
                {!analysisData && (
                  <div className="panel" style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                      <h2 style={{ fontSize: '1.6rem', fontWeight: '800', marginBottom: '0.5rem' }}>✨ Generador de Guiones Adaptados</h2>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Pega una URL de YouTube de cualquier video o sube tu propio archivo para adaptarlo completamente al tono de tu canal.</p>
                    </div>

                    {/* Selector de modo de Entrada */}
                    <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255,255,255,0.02)', padding: '0.3rem', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
                      <button type="button" onClick={() => setInputMode('url')} className={`btn ${inputMode === 'url' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, border: 'none', padding: '0.6rem' }}>
                        <Globe size={16} style={{ marginRight: '0.5rem' }} /> Enlace de YouTube (Recomendado)
                      </button>
                      <button type="button" onClick={() => setInputMode('path')} className={`btn ${inputMode === 'path' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, border: 'none', padding: '0.6rem' }}>
                        <Link size={16} style={{ marginRight: '0.5rem' }} /> Ruta Local de Video
                      </button>
                      <button type="button" onClick={() => setInputMode('upload')} className={`btn ${inputMode === 'upload' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, border: 'none', padding: '0.6rem' }}>
                        <Upload size={16} style={{ marginRight: '0.5rem' }} /> Subir Archivo local
                      </button>
                    </div>

                    <form onSubmit={handleStartAnalysis} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      {inputMode === 'url' && (
                        <div>
                          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>URL de Video de YouTube</label>
                          <input 
                            type="text" 
                            className="form-control" 
                            placeholder="https://www.youtube.com/watch?v=XXXXXXXX" 
                            value={videoUrl} 
                            onChange={e => setVideoUrl(e.target.value)} 
                            required 
                          />
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                            ¡Instantáneo! El backend extraerá la transcripción web de inmediato sin tiempos de descarga.
                          </span>
                        </div>
                      )}

                      {inputMode === 'path' && (
                        <div>
                          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Ruta Absoluta del Archivo (Local)</label>
                          <input 
                            type="text" 
                            className="form-control" 
                            placeholder="C:/Videos/video_original.mp4" 
                            value={videoPath} 
                            onChange={e => setVideoPath(e.target.value)} 
                            required 
                          />
                        </div>
                      )}

                      {inputMode === 'upload' && (
                        <div>
                          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Subir Archivo de Video o Audio</label>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border-color)', borderRadius: '12px', padding: '2.5rem', background: 'rgba(255,255,255,0.01)', cursor: 'pointer', position: 'relative' }}>
                            <Upload size={36} style={{ color: 'var(--accent-red)', marginBottom: '0.5rem' }} />
                            <span style={{ fontSize: '0.9rem' }}>{selectedFile ? selectedFile.name : 'Arrastra un archivo o haz clic para buscar'}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Formatos soportados: MP4, MP3, WAV, M4A, etc.</span>
                            <input 
                              type="file" 
                              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} 
                              onChange={e => setSelectedFile(e.target.files[0])} 
                            />
                          </div>
                        </div>
                      )}

                      {analysisError && (
                        <div style={{ color: '#fca5a5', background: 'rgba(239, 68, 68, 0.05)', padding: '0.75rem', borderRadius: '8px', borderLeft: '3px solid var(--accent-red)', fontSize: '0.85rem' }}>
                          ⚠️ {analysisError}
                        </div>
                      )}

                      <button type="submit" className="btn btn-primary" style={{ padding: '1rem', fontWeight: 'bold', background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} disabled={isAnalyzing}>
                        {isAnalyzing ? <RefreshCw size={18} className="spinner" /> : <Sparkles size={18} />}
                        <span>{isAnalyzing ? 'Generando Guion...' : 'Generar Guion Adaptado'}</span>
                      </button>
                    </form>
                  </div>
                )}

                {/* VISUALIZADOR DE CARGA CON PASOS DETALLADOS */}
                {isAnalyzing && (
                  <div className="panel" style={{ maxWidth: '500px', margin: '2rem auto', textAlign: 'center', padding: '3rem 2rem' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', marginBottom: '1.5rem' }}>
                      <RefreshCw size={32} className="spinner" />
                    </div>
                    <h3 style={{ fontSize: '1.3rem', fontWeight: '700', marginBottom: '1rem' }}>Procesando Contenido...</h3>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left', maxWidth: '300px', margin: '0 auto' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', opacity: analysisStep >= 1 ? 1 : 0.4 }}>
                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: analysisStep > 1 ? 'var(--success)' : '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: '#fff' }}>
                          {analysisStep > 1 ? '✓' : '1'}
                        </div>
                        <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>Extrayendo contenido de YouTube...</span>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', opacity: analysisStep >= 2 ? 1 : 0.4 }}>
                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: analysisStep > 2 ? 'var(--success)' : '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: '#fff' }}>
                          {analysisStep > 2 ? '✓' : '2'}
                        </div>
                        <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>Leyendo estilo del canal...</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', opacity: analysisStep >= 3 ? 1 : 0.4 }}>
                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: analysisStep > 3 ? 'var(--success)' : '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: '#fff' }}>
                          {analysisStep > 3 ? '✓' : '3'}
                        </div>
                        <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>Reescribiendo guion con Gemini...</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* EL EDITOR INTERACTIVO (DASHBOARD COMPLETO CON GUION GENERADO) */}
                {analysisData && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    
                    {/* Encabezado del guion generado con opción de reset */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h2 style={{ fontSize: '1.4rem', fontWeight: '800' }}>📈 {analysisData.metadata?.titles?.[0] || 'Guion Terminado'}</h2>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Optimizados y adaptado a tu canal: **{profile.channel_name}**</span>
                      </div>
                      <button onClick={() => setAnalysisData(null)} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Plus size={16} /> Crear Otro Guion
                      </button>
                    </div>

                    {/* Gráfico de Ritmo / Tensión (Pacing Graph) */}
                    {analysisData.tension_meter && (
                      <div className="panel" style={{ padding: '1.25rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <BarChart2 size={18} style={{ color: 'var(--accent-red)' }} />
                          Gráfico de Retención Estimado (Pacing & Tension)
                        </h3>
                        
                        <div style={{ height: '140px', display: 'flex', alignItems: 'flex-end', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', borderLeft: '1px solid var(--border-color)', padding: '0 0.5rem 0.5rem 0.5rem', position: 'relative', overflowX: 'auto' }}>
                          {analysisData.tension_meter.map((point, idx) => (
                            <div 
                              key={idx} 
                              onClick={() => {
                                setSelectedChartPoint(idx);
                                seekTo(point.timestamp);
                              }}
                              style={{ 
                                flex: 1, 
                                minWidth: '40px',
                                height: `${point.tension_level}%`, 
                                background: selectedChartPoint === idx ? 'linear-gradient(to top, #ec4899, #a855f7)' : 'rgba(168, 85, 247, 0.2)', 
                                border: '1px solid rgba(168, 85, 247, 0.4)',
                                borderRadius: '4px 4px 0 0', 
                                cursor: 'pointer', 
                                transition: 'all 0.2s',
                                position: 'relative'
                              }}
                              title={`Tiempo: ${formatTime(point.timestamp)} - Tensión: ${point.tension_level}%`}
                            >
                              <span style={{ position: 'absolute', bottom: '-22px', left: '50%', transform: 'translateX(-50%)', fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
                                {formatTime(point.timestamp)}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Detalle del punto seleccionado */}
                        {analysisData.tension_meter[selectedChartPoint] && (
                          <div style={{ marginTop: '2.5rem', padding: '1rem', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                              <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#a855f7' }}>
                                Timestamp seleccionado: {formatTime(analysisData.tension_meter[selectedChartPoint].timestamp)}
                              </span>
                              <span style={{ padding: '0.2rem 0.5rem', background: 'rgba(168, 85, 247, 0.1)', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 'bold', color: '#f472b6' }}>
                                Nivel de Atención: {analysisData.tension_meter[selectedChartPoint].tension_level}%
                              </span>
                            </div>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', margin: 0 }}>
                              <strong>Análisis de ritmo:</strong> {analysisData.tension_meter[selectedChartPoint].analysis}
                            </p>
                            {analysisData.tension_meter[selectedChartPoint].suggestion && (
                              <p style={{ fontSize: '0.85rem', color: '#fde047', margin: '0.5rem 0 0 0' }}>
                                💡 <strong>Sugerencia:</strong> {analysisData.tension_meter[selectedChartPoint].suggestion}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Editor de Guion y Pestañas de Optimización */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '1.5rem' }}>
                      
                      {/* Lado Izquierdo: Reproductor de Video */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div className="panel" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                          {inputMode === 'url' ? (
                            <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, background: '#000' }}>
                              <iframe 
                                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                                src={`https://www.youtube.com/embed/${videoUrl ? videoUrl.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/)?.[2] : ''}`}
                                title="YouTube video player" 
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                                allowFullScreen
                              />
                            </div>
                          ) : (
                            <video 
                              ref={videoRef}
                              src={videoPath ? `http://localhost:8000/api/stream-video?path=${encodeURIComponent(videoPath)}` : selectedFile ? URL.createObjectURL(selectedFile) : ''}
                              controls
                              style={{ width: '100%', display: 'block', background: '#000' }}
                              onTimeUpdate={() => {
                                if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
                              }}
                              onPlay={() => setIsPlaying(true)}
                              onPause={() => setIsPlaying(false)}
                            />
                          )}
                        </div>

                        {/* Tarjeta del canal e información de tono */}
                        <div className="panel" style={{ padding: '1rem' }}>
                          <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Configuración de Tono Activa</h4>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Adaptado para: **{profile.channel_name}**</span>
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.5rem 0 0 0', fontStyle: 'italic', borderLeft: '2px solid #a855f7', paddingLeft: '0.5rem' }}>
                            "{profile.channel_description || 'Estilo general de YouTube'}"
                          </p>
                        </div>
                      </div>

                      {/* Lado Derecho: Pestañas con Páneles de Optimización */}
                      <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        
                        {/* Selector de Pestañas (Tabs) */}
                        <div className="tab-container" style={{ flexWrap: 'wrap' }}>
                          <button onClick={() => setActiveTab('script')} className={`tab-btn ${activeTab === 'script' ? 'active' : ''}`}>
                            📝 Guion Adaptado
                          </button>
                          <button onClick={() => setActiveTab('shorts')} className={`tab-btn ${activeTab === 'shorts' ? 'active' : ''}`}>
                            📱 Shorts Virales
                          </button>
                          <button onClick={() => setActiveTab('hook')} className={`tab-btn ${activeTab === 'hook' ? 'active' : ''}`}>
                            🪝 Hook (Gancho)
                          </button>
                          <button onClick={() => setActiveTab('cliches')} className={`tab-btn ${activeTab === 'cliches' ? 'active' : ''}`}>
                            🚫 Clichés
                          </button>
                          <button onClick={() => setActiveTab('metadata')} className={`tab-btn ${activeTab === 'metadata' ? 'active' : ''}`}>
                            🔍 SEO & Títulos
                          </button>
                          <button onClick={() => setActiveTab('thumbnails')} className={`tab-btn ${activeTab === 'thumbnails' ? 'active' : ''}`}>
                            🖼️ Miniaturas
                          </button>
                        </div>

                        {/* CONTENIDOS DE LAS PESTAÑAS */}
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                          
                          {/* TAB 1: GUION ADAPTADO */}
                          {activeTab === 'script' && analysisData.optimized_script && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                              
                              {/* Caja de Refinamiento por Chat */}
                              <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                                <form onSubmit={handleRefineScript} style={{ display: 'flex', gap: '0.5rem' }}>
                                  <input 
                                    type="text" 
                                    className="form-control" 
                                    placeholder="¿Quieres reescribir algo? Ej: 'Haz que el chiste sea más corto' o 'Usa un tono más misterioso'..." 
                                    value={refineInstruction} 
                                    onChange={e => setRefineInstruction(e.target.value)} 
                                    disabled={isRefining} 
                                  />
                                  <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }} disabled={isRefining}>
                                    {isRefining ? <RefreshCw size={16} className="spinner" /> : 'Refinar'}
                                  </button>
                                </form>
                                {refineError && (
                                  <span style={{ color: 'var(--accent-red)', fontSize: '0.8rem', marginTop: '0.5rem', display: 'block' }}>
                                    ⚠️ {refineError}
                                  </span>
                                )}
                              </div>

                              {/* Botones de Exportar */}
                              <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button type="button" onClick={handleDownloadPDF} className="btn btn-secondary" style={{ flex: 1, padding: '0.7rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                  <FileText size={16} /> Exportar Guion (PDF)
                                </button>
                                <button type="button" onClick={handleCopyFullScript} className="btn btn-primary" style={{ flex: 1, padding: '0.7rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                  <Copy size={16} /> Copiar Guion Completo
                                </button>
                              </div>

                              {/* Selector de Vista */}
                              <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255,255,255,0.02)', padding: '0.25rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                <button type="button" onClick={() => setScriptViewMode('segments')} className={`btn ${scriptViewMode === 'segments' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, padding: '0.4rem', fontSize: '0.8rem', border: 'none' }}>
                                  Vista Segmentos (Detallada)
                                </button>
                                <button type="button" onClick={() => setScriptViewMode('paragraph')} className={`btn ${scriptViewMode === 'paragraph' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, padding: '0.4rem', fontSize: '0.8rem', border: 'none' }}>
                                  Vista Lectura (Corrido)
                                </button>
                              </div>

                              {scriptViewMode === 'paragraph' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '420px', overflowY: 'auto', padding: '1.25rem', background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-color)', borderRadius: '12px', fontSize: '1.05rem', lineHeight: '1.7' }}>
                                  {analysisData.optimized_script.map((seg, idx) => (
                                    <p key={idx} style={{ marginBottom: '1rem', borderLeft: activeSegmentIndex === idx ? '3px solid #a855f7' : '3px solid transparent', paddingLeft: '0.75rem', cursor: 'pointer' }} onClick={() => seekTo(seg.start)}>
                                      {seg.optimized_text}
                                    </p>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '420px', overflowY: 'auto' }}>
                                  {analysisData.optimized_script.map((seg, idx) => {
                                    let wpmColor = 'var(--success)';
                                    if (seg.wpm > 140) wpmColor = '#fca5a5';
                                    else if (seg.wpm < 95) wpmColor = '#fde047';

                                    return (
                                      <div key={idx} id={`segment-${idx}`} className="panel" style={{ padding: '1rem', background: 'rgba(255, 255, 255, 0.01)', borderLeft: activeSegmentIndex === idx ? '3px solid #a855f7' : '1px solid var(--border-color)', cursor: 'pointer' }} onClick={() => seekTo(seg.start)}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                          <span className="segment-time" style={{ fontSize: '0.8rem', color: '#a855f7', fontWeight: 'bold' }}>{formatTime(seg.start)} - {formatTime(seg.end)}</span>
                                          <span style={{ fontSize: '0.75rem', color: wpmColor, fontWeight: 'bold' }}>
                                            {seg.wpm} WPM ({seg.wpm_status || 'Normal'})
                                          </span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                                          <div style={{ opacity: 0.6 }}>
                                            <strong>Original:</strong> <span style={{ fontStyle: 'italic' }}>{seg.original_text}</span>
                                          </div>
                                          <div style={{ background: 'rgba(168, 85, 247, 0.02)', padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(168, 85, 247, 0.05)' }}>
                                            <strong style={{ color: '#f472b6' }}>Optimizado ✨:</strong> <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{seg.optimized_text}</span>
                                          </div>
                                        </div>
                                        {seg.pacing_alert && (
                                          <div style={{ marginTop: '0.5rem', padding: '0.25rem 0.5rem', background: 'rgba(245,158,11,0.05)', borderLeft: '2px solid var(--warning)', fontSize: '0.75rem', color: '#fde047' }}>
                                            {seg.pacing_alert}
                                          </div>
                                        )}
                                        {seg.production_note && (
                                          <div style={{ marginTop: '0.5rem', padding: '0.25rem 0.5rem', background: 'rgba(168,85,247,0.05)', borderLeft: '2px solid #a855f7', fontSize: '0.75rem', color: '#e9d5ff' }}>
                                            🎬 <strong>Producción:</strong> {seg.production_note}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          {/* TAB 2: SHORTS VIRALES */}
                          {activeTab === 'shorts' && analysisData.viral_shorts && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                              {analysisData.viral_shorts.map((short, idx) => (
                                <div key={idx} className="thumbnail-idea-card" style={{ background: 'rgba(255, 255, 255, 0.01)', padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
                                      <Scissors size={16} style={{ color: '#a855f7' }} /> Idea de Clip #{idx + 1}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatTime(short.start)} - {formatTime(short.end)}</span>
                                  </div>
                                  <h4 style={{ fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Título: "{short.title}"</h4>
                                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '8px', marginBottom: '0.5rem', border: '1px solid var(--border-color)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                      <span style={{ fontSize: '0.7rem', color: '#f472b6', fontWeight: 'bold' }}>Gancho (Vertical 9:16) 📱:</span>
                                      <button onClick={() => copyToClipboard(short.hook_modification)} className="btn" style={{ padding: '0.1rem 0.3rem', fontSize: '0.7rem', background: 'rgba(255,255,255,0.05)' }}>Copiar</button>
                                    </div>
                                    <p style={{ fontSize: '0.85rem', fontStyle: 'italic', margin: 0 }}>"{short.hook_modification}"</p>
                                  </div>
                                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                                    <strong>¿Por qué funciona?:</strong> {short.rationale}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* TAB 3: GANCHO */}
                          {activeTab === 'hook' && analysisData.hook_analysis && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '1.4rem' }}>
                                  {analysisData.hook_analysis.score}
                                </div>
                                <div>
                                  <h4 style={{ fontSize: '1rem', fontWeight: 'bold' }}>Fuerza del Hook Inicial</h4>
                                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Calificación estimada para los primeros 30 segundos</span>
                                </div>
                              </div>
                              <p style={{ fontSize: '0.9rem', lineHeight: '1.6' }}>{analysisData.hook_analysis.critique}</p>
                              {analysisData.hook_analysis.suggestions && (
                                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                                  <h5 style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Sugerencias para enganchar más rápido:</h5>
                                  <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0, margin: 0 }}>
                                    {analysisData.hook_analysis.suggestions.map((sug, idx) => (
                                      <li key={idx} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.85rem' }}>
                                        <Flame size={14} style={{ color: '#a855f7', marginTop: '2px', flexShrink: 0 }} />
                                        <span>{sug}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}

                          {/* TAB 4: CLICHÉS */}
                          {activeTab === 'cliches' && analysisData.cliches_detector && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                              <div>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Palabras Repetitivas</h4>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                  {analysisData.cliches_detector.repeated_words?.map((item, idx) => (
                                    <div key={idx} style={{ padding: '0.3rem 0.6rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.8rem', display: 'flex', gap: '0.3rem' }}>
                                      <span style={{ fontWeight: 'bold' }}>"{item.word}"</span>
                                      <span style={{ color: '#a855f7' }}>{item.count}x</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: 0 }} />
                              <div>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Conceptos y Frases Trilladas a Evitar</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                  {analysisData.cliches_detector.cliches_found?.map((c, idx) => (
                                    <div key={idx} style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.02)', borderLeft: '3px solid var(--warning)', borderRadius: '0 8px 8px 0', fontSize: '0.85rem' }}>
                                      <div style={{ fontWeight: 'bold', marginBottom: '0.2rem' }}>Cliché: "{c.cliche}"</div>
                                      <div style={{ opacity: 0.7, marginBottom: '0.3rem' }}>¿Por qué? {c.why}</div>
                                      <div style={{ color: '#86efac' }}>💡 <strong>Mejor dilo así:</strong> {c.alternative}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* TAB 5: SEO & TÍTULOS */}
                          {activeTab === 'metadata' && analysisData.metadata && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                              <div>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Títulos Sugeridos para Clickbait Honesto</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                  {analysisData.metadata.titles?.map((t, idx) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.85rem' }}>
                                      <span>{t}</span>
                                      <button onClick={() => copyToClipboard(t)} className="btn-copy" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><Copy size={14} /></button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: 0 }} />
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                  <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', margin: 0 }}>Descripción Optimizada SEO</h4>
                                  <button onClick={() => copyToClipboard(analysisData.metadata.description)} className="btn" style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', background: 'rgba(255,255,255,0.05)' }}>Copiar Todo</button>
                                </div>
                                <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.85rem', maxHeight: '140px', overflowY: 'auto', whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                  {analysisData.metadata.description}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* TAB 6: MINIATURAS */}
                          {activeTab === 'thumbnails' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                              {analysisData.thumbnail_image_prompts && (
                                <div>
                                  <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Prompts de Imagen (Midjourney / Leonardo)</h4>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {analysisData.thumbnail_image_prompts.map((p, idx) => (
                                      <div key={idx} style={{ padding: '0.75rem', background: 'rgba(168, 85, 247, 0.01)', border: '1px solid rgba(168,85,247,0.05)', borderRadius: '8px', fontSize: '0.85rem' }}>
                                        <div style={{ fontWeight: 'bold', color: '#f472b6', marginBottom: '0.25rem' }}>Concepto #{idx + 1}: {p.concept}</div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', marginBottom: '0.5rem', border: '1px solid var(--border-color)' }}>
                                          <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all', paddingRight: '0.5rem' }}>{p.prompt}</span>
                                          <button onClick={() => copyToClipboard(p.prompt)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><Copy size={14} /></button>
                                        </div>
                                        <div style={{ fontSize: '0.8rem', opacity: 0.7 }}><strong> CTR Rationale:</strong> {p.why}</div>
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

                  </div>
                )}

              </div>
            )}

            {/* SECCIÓN 2: ANALIZADOR DE TÍTULOS */}
            {currentSection === 'analyzer' && (
              <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div className="panel">
                  <h2 style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <TrendingUp style={{ color: '#a855f7' }} /> Analizador de Títulos Virales
                  </h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                    Ingresa un título provisional para tu video. Analizaremos su efectividad psicológica, CTR estimado y generaremos 5 variaciones virales basadas en técnicas de retención avanzadas adaptadas a tu canal.
                  </p>

                  <form onSubmit={handleAnalyzeTitle} style={{ display: 'flex', gap: '0.5rem' }}>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="Ej: Subí al ático abandonado y encontré esto..." 
                      value={titleInput} 
                      onChange={e => setTitleInput(e.target.value)} 
                      required 
                    />
                    <button type="submit" className="btn btn-primary" style={{ padding: '0 1.5rem', fontWeight: 'bold', background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)', border: 'none', whiteSpace: 'nowrap' }} disabled={isAnalyzingTitle}>
                      {isAnalyzingTitle ? <RefreshCw size={18} className="spinner" /> : 'Analizar'}
                    </button>
                  </form>
                  
                  {titleAnalysisError && (
                    <div style={{ marginTop: '1rem', color: '#fca5a5', background: 'rgba(239, 68, 68, 0.05)', padding: '0.75rem', borderRadius: '8px', borderLeft: '3px solid var(--accent-red)', fontSize: '0.85rem' }}>
                      ⚠️ {titleAnalysisError}
                    </div>
                  )}
                </div>

                {/* RESULTADOS DEL ANÁLISIS DE TÍTULO */}
                {isAnalyzingTitle && (
                  <div className="panel" style={{ textAlign: 'center', padding: '3rem' }}>
                    <RefreshCw size={36} className="spinner" style={{ color: '#a855f7', marginBottom: '1rem' }} />
                    <p style={{ fontSize: '0.95rem' }}>Gemini está evaluando los disparadores psicológicos de tu título...</p>
                  </div>
                )}

                {titleAnalysisResult && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '1.5rem' }}>
                    
                    {/* Tarjeta de Calificación */}
                    <div className="panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center', gap: '1rem' }}>
                      <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(168, 85, 247, 0.1)', border: '4px solid #a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', fontWeight: '800', color: '#fff', boxShadow: '0 0 25px rgba(168,85,247,0.3)' }}>
                        {titleAnalysisResult.score}
                      </div>
                      <div>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '0.25rem' }}>Puntuación del Título</h3>
                        <span style={{ fontSize: '0.85rem', color: titleAnalysisResult.seo_rating === 'Excelente' ? '#86efac' : '#fde047', fontWeight: 'bold' }}>
                          SEO Rating: {titleAnalysisResult.seo_rating}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5' }}>
                        {titleAnalysisResult.critique}
                      </p>
                    </div>

                    {/* Tarjeta de Sugerencias Virales */}
                    <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Sparkle size={18} style={{ color: '#f472b6' }} /> Sugerencias de Títulos con alto CTR
                      </h3>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {titleAnalysisResult.viral_suggestions?.map((item, idx) => (
                          <div key={idx} style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '10px', fontSize: '0.85rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                              <span style={{ fontWeight: 'bold', color: '#a855f7' }}>Opción #{idx + 1}</span>
                              <button onClick={() => copyToClipboard(item.title)} className="btn" style={{ padding: '0.1rem 0.3rem', fontSize: '0.7rem', background: 'rgba(255,255,255,0.05)' }}>Copiar</button>
                            </div>
                            <h4 style={{ fontSize: '0.95rem', color: 'var(--text-primary)', margin: '0.2rem 0 0.4rem 0' }}>"{item.title}"</h4>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                              <strong>Psicología:</strong> {item.CTR_rationale}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                )}
              </div>
            )}

            {/* SECCIÓN 3: HISTORIAL DESDE LA NUBE (SUPABASE) */}
            {currentSection === 'history' && (
              <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <History style={{ color: '#a855f7' }} /> Historial de Guiones Guardados
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                  Todos tus guiones generados se respaldan automáticamente en Supabase y están accesibles desde cualquier lugar. Haz clic sobre una tarjeta para cargarlo instantáneamente en el editor.
                </p>

                {historyLoading && (
                  <div className="panel" style={{ textAlign: 'center', padding: '3rem' }}>
                    <RefreshCw size={36} className="spinner" style={{ color: '#a855f7', marginBottom: '1rem' }} />
                    <p style={{ fontSize: '0.95rem' }}>Sincronizando con tu nube en Supabase...</p>
                  </div>
                )}

                {!historyLoading && scriptsHistory.length === 0 && (
                  <div className="panel" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    <History size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                    <p style={{ fontSize: '1rem' }}>No tienes guiones generados aún.</p>
                    <button onClick={() => setCurrentSection('generator')} className="btn btn-primary" style={{ marginTop: '1rem', background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)', border: 'none' }}>Generar mi primer guion</button>
                  </div>
                )}

                {!historyLoading && scriptsHistory.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    {scriptsHistory.map((script) => (
                      <div 
                        key={script.id} 
                        onClick={() => handleLoadScript(script)}
                        className="panel" 
                        style={{ padding: '1.25rem', border: '1px solid var(--border-color)', borderRadius: '16px', background: 'rgba(255,255,255,0.01)', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem' }}
                      >
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', height: '2.4rem', lineHeight: '1.2' }}>
                              {script.video_title}
                            </h3>
                            <button 
                              onClick={(e) => handleDeleteScript(script.id, e)} 
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: '0.2rem' }}
                              title="Eliminar de la nube"
                            >
                              ✕
                            </button>
                          </div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={script.video_url}>
                            <strong>Origen:</strong> {script.video_url}
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          <span>Creado: {new Date(script.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          <span style={{ color: '#a855f7', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            Abrir Editor <ChevronRight size={12} />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

      </main>

      {/* MENSAJE TOAST */}
      {toastMessage && (
        <div className="toast" style={{ background: 'rgba(17, 24, 39, 0.9)', backdropFilter: 'blur(10px)', border: '1px solid #a855f7', borderRadius: '12px', color: '#fff', padding: '0.75rem 1.25rem', boxShadow: '0 10px 25px rgba(168,85,247,0.2)' }}>
          <Info size={16} style={{ color: '#a855f7' }} />
          <span>{toastMessage}</span>
        </div>
      )}

    </div>
  );
}
