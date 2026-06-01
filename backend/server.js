import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { jsonrepair } from 'jsonrepair';

dotenv.config();

// Configurar ruta de ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Crear carpeta temporal para audios
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Configuración de Multer para subida de videos (opcional, en caso de arrastrar y soltar)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const AUDIO_MIME_TYPES = ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/m4a', 'audio/ogg', 'audio/webm'];
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.ogg'];

const isAudioFile = (file) => {
  const ext = path.extname(file.originalname || file).toLowerCase();
  return AUDIO_MIME_TYPES.includes(file.mimetype) || AUDIO_EXTENSIONS.includes(ext);
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `upload_${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage });

// === FUNCIONES AUXILIARES DE YOUTUBE ===

// Parsear el JSON del reproductor de YouTube para extraer la pista de subtítulos
const parsePlayerResponse = async (jsonText) => {
  try {
    const playerResponse = JSON.parse(jsonText);
    const captions = playerResponse.captions?.playerCaptionsTracklistRenderer;
    if (!captions || !captions.captionTracks || captions.captionTracks.length === 0) {
      throw new Error('Este video no tiene subtítulos disponibles (ni manuales ni automáticos).');
    }

    // Intentar buscar subtítulos en español ('es') primero, luego en inglés ('en')
    let track = captions.captionTracks.find(t => t.languageCode === 'es');
    if (!track) {
      track = captions.captionTracks.find(t => t.languageCode === 'en');
    }
    if (!track) {
      track = captions.captionTracks[0];
    }

    const transcriptUrl = track.baseUrl;
    console.log(`[YouTube] Descargando subtítulos en idioma [${track.languageCode}] de: ${transcriptUrl}`);

    const xmlRes = await fetch(transcriptUrl);
    if (!xmlRes.ok) {
      throw new Error('No se pudo descargar el archivo XML de subtítulos.');
    }

    const xmlText = await xmlRes.text();

    // Parsear el XML simple de YouTube: <text start="1.5" dur="2.4">texto</text>
    const regex = /<text start="([\d\.]+)" dur="([\d\.]+)"[^>]*>([\s\S]*?)<\/text>/g;
    const segments = [];
    let match;

    while ((match = regex.exec(xmlText)) !== null) {
      const start = parseFloat(match[1]);
      const duration = parseFloat(match[2]);
      const end = parseFloat((start + duration).toFixed(2));

      // Decodificar entidades HTML comunes
      let text = match[3]
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n/g, ' ')
        .trim();

      segments.push({ start, end, text });
    }

    if (segments.length === 0) {
      throw new Error('Subtítulos encontrados pero no se pudo extraer ningún segmento de texto.');
    }

    return segments;
  } catch (err) {
    throw new Error(`Error al parsear subtítulos de YouTube: ${err.message}`);
  }
};

// Obtener la transcripción de un video de YouTube por URL o ID
const getYoutubeTranscript = async (videoUrl) => {
  let videoId = '';
  // Expresión regular para capturar el ID del video
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = videoUrl.match(regExp);
  if (match && match[2].length === 11) {
    videoId = match[2];
  } else if (videoUrl.length === 11) {
    videoId = videoUrl;
  } else {
    throw new Error('URL de YouTube inválida o ID de video no encontrado.');
  }

  console.log(`[YouTube] Extrayendo transcripción para el video ID: ${videoId}`);
  const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  const response = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
    }
  });

  if (!response.ok) {
    throw new Error(`YouTube devolvió estado HTTP: ${response.status}`);
  }

  const html = await response.text();

  // Buscar ytInitialPlayerResponse en el HTML
  const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
  if (!playerResponseMatch) {
    const altMatch = html.match(/window\["ytInitialPlayerResponse"\]\s*=\s*({.+?});/);
    if (!altMatch) {
      throw new Error('No se pudo extraer la configuración del reproductor de YouTube. ¿El video es privado o no existe?');
    }
    return await parsePlayerResponse(altMatch[1]);
  }

  return await parsePlayerResponse(playerResponseMatch[1]);
};

// Endpoint para verificar la API Key de Gemini
app.post('/api/check-key', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) {
    return res.status(400).json({ error: 'Se requiere una API Key.' });
  }

  try {
    const ai = new GoogleGenAI({ 
      apiKey,
      httpOptions: { timeout: 600000 } 
    });
    // Hacer una consulta mínima para validar la clave
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: '¡Hola! Confirma con un OK corto si me lees.'
    });
    return res.json({ success: true, message: 'API Key válida.' });
  } catch (error) {
    console.error('Error validando API Key:', error);
    return res.status(400).json({ error: 'API Key inválida o inactiva. Por favor verifica.' });
  }
});

// Endpoint para transmitir video local de manera eficiente (Streaming con soporte de rangos HTTP)
app.get('/api/stream-video', (req, res) => {
  const videoPath = req.query.path;
  if (!videoPath) {
    return res.status(400).send('Ruta de video requerida (?path=...)');
  }

  const resolvedPath = path.resolve(videoPath.replace(/\\/g, '/'));

  if (!fs.existsSync(resolvedPath)) {
    return res.status(404).send('Archivo de video no encontrado.');
  }

  const stat = fs.statSync(resolvedPath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize) {
      res.status(416).send('Rango solicitado no satisfactorio\n' + start + ' >= ' + fileSize);
      return;
    }

    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(resolvedPath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    };

    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(200, head);
    fs.createReadStream(resolvedPath).pipe(res);
  }
});

// Función auxiliar para extraer el audio usando FFmpeg
const extractAudio = (videoPath, audioPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions([
        '-vn',             // Sin video
        '-acodec libmp3lame', // Codec MP3
        '-ac 1',           // Monocanal (para reducir tamaño)
        '-ar 22050'        // Muestreo 22050Hz (suficiente para voz)
      ])
      .save(audioPath)
      .on('start', (commandLine) => {
        console.log('Comenzando extracción con comando:', commandLine);
      })
      .on('end', () => {
        console.log('Extracción de audio finalizada.');
        resolve();
      })
      .on('error', (err) => {
        console.error('Error al extraer audio:', err);
        reject(err);
      });
  });
};

// Endpoint principal para analizar el video
app.post('/api/analyze', upload.single('videoFile'), async (req, res) => {
  let videoPath = '';
  const isUpload = !!req.file;
  const apiKey = req.body.apiKey;
  const groqApiKey = req.body.groqApiKey;
  const channelName = req.body.channelName || 'Mi Canal';
  const channelDescription = req.body.channelDescription || 'Canal de YouTube';
  const videoUrl = req.body.videoUrl;

  if (!apiKey) {
    return res.status(400).json({ error: 'Se requiere una API Key de Gemini.' });
  }

  // Detectar si es una URL de YouTube directa
  const isYoutube = videoUrl && (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be') || videoUrl.length === 11);

  if (!isYoutube && !isUpload && !req.body.videoPath) {
    return res.status(400).json({ error: 'Ruta de video, archivo subido o URL de YouTube requerida.' });
  }

  if (!isYoutube) {
    if (isUpload) {
      videoPath = req.file.path;
    } else {
      videoPath = req.body.videoPath;
    }
    if (!videoPath) {
      return res.status(400).json({ error: 'Ruta de video o archivo de video requerido.' });
    }
  }

  const resolvedVideoPath = videoPath ? path.resolve(videoPath.replace(/\\/g, '/')) : '';

  if (!isYoutube && !fs.existsSync(resolvedVideoPath)) {
    return res.status(404).json({ error: 'El archivo de video especificado no existe.' });
  }

  const audioFileName = `audio_${Date.now()}.mp3`;
  const tempAudioPath = path.join(tempDir, audioFileName);
  let uploadResult = null;
  const ai = new GoogleGenAI({ 
    apiKey,
    httpOptions: { timeout: 600000 } 
  });

  // Detectar si el archivo local ya es audio para saltarse FFmpeg
  const fileIsAudio = !isYoutube && (req.file ? isAudioFile(req.file) : AUDIO_EXTENSIONS.includes(path.extname(resolvedVideoPath).toLowerCase()));

  try {
    let transcription = null;

    if (isYoutube) {
      console.log(`[Analizador] Paso 1: Procesando video de YouTube directo por URL: ${videoUrl}`);
      transcription = await getYoutubeTranscript(videoUrl);
      console.log(`[Analizador] Transcripción de YouTube obtenida exitosamente. Segmentos: ${transcription.length}`);
    } else {
      // Flujo original para archivos locales
      let actualAudioPath = tempAudioPath;

      if (fileIsAudio) {
        console.log('Paso 1: El archivo ya es audio, omitiendo extracción con FFmpeg.');
        actualAudioPath = resolvedVideoPath; // usar el archivo directamente
      } else {
        console.log(`Paso 1: Extrayendo audio de ${resolvedVideoPath} a ${tempAudioPath}...`);
        await extractAudio(resolvedVideoPath, tempAudioPath);
      }

      if (groqApiKey) {
        console.log('Paso 2: Transcribiendo audio usando la API de Groq (Whisper)...');
        const formData = new FormData();
        const fileBuffer = fs.readFileSync(actualAudioPath);
        const audioMime = fileIsAudio ? (req.file?.mimetype || 'audio/mpeg') : 'audio/mp3';
        const fileBlob = new Blob([fileBuffer], { type: audioMime });
        formData.append('file', fileBlob, path.basename(actualAudioPath));
        formData.append('model', 'whisper-large-v3');
        formData.append('response_format', 'verbose_json');

        const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqApiKey}`
          },
          body: formData
        });

        if (!groqResponse.ok) {
          const errorText = await groqResponse.text();
          throw new Error(`Error en la API de Groq: ${errorText}`);
        }

        const groqData = await groqResponse.json();
        transcription = groqData.segments.map(seg => ({
          start: seg.start,
          end: seg.end,
          text: seg.text
        }));
        console.log('Transcripción con Groq finalizada exitosamente.');
      } else {
        console.log('Paso 2: Subiendo audio a la API de Gemini...');
        const uploadMime = fileIsAudio ? (req.file?.mimetype || 'audio/mpeg') : 'audio/mp3';
        uploadResult = await ai.files.upload({
          file: actualAudioPath,
          mimeType: uploadMime,
        });

        console.log(`Archivo subido con éxito: ${uploadResult.name}. Esperando estado ACTIVE...`);

        // Esperar a que el archivo sea procesado si es necesario
        let fileState = await ai.files.get({ name: uploadResult.name });
        let attempts = 0;
        while (fileState.state === 'PROCESSING' && attempts < 30) {
          console.log('Archivo en procesamiento. Esperando 2 segundos...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          fileState = await ai.files.get({ name: uploadResult.name });
          attempts++;
        }

        if (fileState.state !== 'ACTIVE') {
          throw new Error(`El archivo de audio no alcanzó el estado ACTIVE (Estado actual: ${fileState.state})`);
        }
      }
    }

    console.log('Paso 3: Enviando a Gemini para análisis crítico y optimización...');
    
    let responseText = '';

    // Modificar los prompts de Gemini para incluir el branding y las nuevas métricas genéricas del canal
    if (transcription) {
      // Modo Texto (YouTube Directo o Groq Fallback)
      const analysisPrompt = `
Eres un Experto Estratega en Retención de YouTube y Director Creativo de Contenido de alto impacto.
Tu tarea es analizar la transcripción de un video con marcas de tiempo, y realizar una optimización y reescritura creativa completa para generar un nuevo guion adaptado exactamente a la identidad, voz y estilo del canal del creador.

INFORMACIÓN DEL CANAL DEL CREADOR (Adapta el tono, vocabulario y estilo de la reescritura a esto):
Nombre del Canal: ${channelName}
Descripción y Estilo del Canal: ${channelDescription}

Aquí tienes la transcripción original del video:
${JSON.stringify(transcription, null, 2)}

Devuelve un objeto JSON estructurado que siga exactamente este formato. No devuelvas ningún texto antes ni después del JSON. Solo el JSON.

La respuesta DEBE ser un JSON con las siguientes propiedades:
{
  "transcription": [
    // La transcripción exacta que te di
  ],
  "tension_meter": [
    { "timestamp": <segundos>, "tension_level": <número_de_0_a_100>, "analysis": "Análisis del ritmo y enganche en este momento del video basándote en lo hablado. Identifica si el ritmo decae, se vuelve aburrido o acelera.", "suggestion": "Sugerencia específica para mantener la atención del espectador en este momento." }
  ],
  "hook_analysis": {
    "score": "Una letra de la A a la F representando la fuerza y enganche de los primeros 30 segundos",
    "critique": "Análisis detallado de cómo empieza el video. ¿Engancha al espectador de inmediato? ¿Cómo se puede mejorar para evitar que abandonen el video?",
    "suggestions": ["Sugerencia de gancho alternativa 1", "Sugerencia de gancho alternativa 2"]
  },
  "cliches_detector": {
    "repeated_words": [
      { "word": "palabra repetida o muletilla", "count": <número_veces>, "synonyms": ["sinónimo1", "sinónimo2", "sinónimo3"] }
    ],
    "cliches_found": [
      { "cliche": "Concepto genérico, cliché o frase trillada de este nicho", "why": "Por qué aburre o reduce el interés del espectador", "alternative": "Propuesta de redacción mucho más fresca y atrapante" }
    ]
  },
  "metadata": {
    "titles": ["Título Sugerido 1 (Alta curiosidad)", "Título Sugerido 2 (Pregunta intrigante)", "Título Sugerido 3 (Gancho psicológico extremo)"],
    "description": "Descripción SEO optimizada para YouTube, detallando el video de forma sumamente atractiva e incluyendo hashtags temáticos del nicho.",
    "tags": ["tag1", "tag2", "tag3"]
  },
  "thumbnail_ideas": [
    { "description": "Idea visual hiper-detallada para la miniatura", "elements": ["elemento visual clave 1", "elemento visual clave 2"], "rationale": "Explicación psicológica de por qué esta miniatura logrará un alto porcentaje de clics (CTR)" }
  ],
  "optimized_script": [
    {
      "start": <segundos>,
      "end": <segundos>,
      "original_text": "Texto original...",
      "optimized_text": "Texto optimizado para el guion final. Debe incluir un saludo inicial personalizado adaptado de forma única e ingeniosa al nombre y temática del canal (${channelName}) en los primeros 15 segundos y un llamado a la acción/frase de despedida característica del canal al final. En el cuerpo del guion, acorta frases redundantes, elimina muletillas, aumenta el dinamismo, añade suspenso o energía y hazlo sonar 100% natural, directo y en la voz del canal del usuario.",
      "wpm": <número_wpm_calculado_basado_en_el_diálogo_original>,
      "wpm_status": "Normal|Rápido|Pausado",
      "pacing_alert": "Advertencia sobre la velocidad de locución en este fragmento. Si WPM > 140, aconseja hablar más pausado. Si < 95, aconseja adquirir más dinamismo o efectos de sonido para llenar los silencios.",
      "production_note": "Nota técnica y de edición de efectos de sonido, clips de apoyo visual o zoom de cámara recomendado para esta escena (ej: '[SFX: Efecto de sonido digital rápido + Zoom rápido a la cara]') o null si no es necesario.",
      "open_loop": "Identifica si esta sección introduce un bucle abierto de curiosidad (prometer revelar algo intrigante más adelante en el video para retener al usuario) o null si no aplica."
    }
  ],
  "viral_shorts": [
    {
      "start": <segundos_inicio>,
      "end": <segundos_fin>,
      "title": "Título sugerido para Short/TikTok/Reel",
      "hook_modification": "Primeras 2 frases del fragmento reescritas para ser un gancho ultra-rápido de 3 segundos ideal para formato de video vertical",
      "rationale": "Por qué este momento del video largo es el más idóneo para viralizar de forma independiente"
    }
  ],
  "thumbnail_image_prompts": [
    {
      "concept": "Concepto artístico de la imagen",
      "prompt": "Prompt en inglés hiper-detallado para Midjourney/Leonardo.ai basado en el clímax visual de la temática del canal",
      "why": "Por qué esta imagen destaca visualmente en la página de inicio de YouTube"
    }
  ]
}

Reglas importantes para el análisis:
1. En optimized_script, conserva exactamente las marcas de tiempo de inicio y fin originales.
2. Calcula WPM de manera realista: divide el número de palabras en original_text por la duración en minutos (fin - inicio).
3. Adapta de manera muy creativa los textos de saludo y despedida basándote en la temática descrita de tu canal (${channelName}).
4. Genera al menos 2 ideas de shorts y 2 prompts detallados de Midjourney.
`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: analysisPrompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      const candidate = response.candidates?.[0];
      responseText = response.text || candidate?.content?.parts?.[0]?.text;
    } else {
      // Modo Audio Directo (Gemini con archivo local subido)
      const analysisPrompt = `
Eres un Experto Estratega en Retención de YouTube y Director Creativo de Contenido de alto impacto.
Tu tarea es analizar el audio de este video y producir un reporte sumamente estructurado que ayude al creador a optimizar su video antes de subirlo, adaptándose exactamente a la identidad, voz y estilo de su canal.

INFORMACIÓN DEL CANAL DEL CREADOR (Adapta el tono, vocabulario y estilo de la reescritura a esto):
Nombre del Canal: ${channelName}
Descripción y Estilo del Canal: ${channelDescription}

Analiza el contenido del audio y devuelve un objeto JSON estructurado que siga exactamente este formato. No devuelvas ningún texto antes ni después del JSON. Solo el JSON.

La respuesta DEBE ser un JSON con las siguientes propiedades:
{
  "transcription": [
    { "start": <número_segundos>, "end": <número_segundos>, "text": "Texto completo hablado en este fragmento con buena puntuación" }
  ],
  "tension_meter": [
    { "timestamp": <segundos>, "tension_level": <número_de_0_a_100>, "analysis": "Análisis del ritmo y enganche en este momento del video basándote en lo hablado. Identifica si el ritmo decae, se vuelve aburrido o acelera.", "suggestion": "Sugerencia específica para mantener la atención del espectador en este momento." }
  ],
  "hook_analysis": {
    "score": "Una letra de la A a la F representando la fuerza y enganche de los primeros 30 segundos",
    "critique": "Análisis detallado de cómo empieza el video. ¿Engancha al espectador de inmediato? ¿Cómo se puede mejorar para evitar que abandonen el video?",
    "suggestions": ["Sugerencia de gancho alternativa 1", "Sugerencia de gancho alternativa 2"]
  },
  "cliches_detector": {
    "repeated_words": [
      { "word": "palabra repetida o muletilla", "count": <número_veces>, "synonyms": ["sinónimo1", "sinónimo2", "sinónimo3"] }
    ],
    "cliches_found": [
      { "cliche": "Concepto genérico, cliché o frase trillada de este nicho", "why": "Por qué aburre o reduce el interés del espectador", "alternative": "Propuesta de redacción mucho más fresca y atrapante" }
    ]
  },
  "metadata": {
    "titles": ["Título Sugerido 1 (Alta curiosidad)", "Título Sugerido 2 (Pregunta intrigante)", "Título Sugerido 3 (Gancho psicológico extremo)"],
    "description": "Descripción SEO optimizada para YouTube, detallando el video de forma sumamente atractiva e incluyendo hashtags temáticos del nicho.",
    "tags": ["tag1", "tag2", "tag3"]
  },
  "thumbnail_ideas": [
    { "description": "Idea visual hiper-detallada para la miniatura", "elements": ["elemento visual clave 1", "elemento visual clave 2"], "rationale": "Explicación psicológica de por qué esta miniatura logrará un alto porcentaje de clics (CTR)" }
  ],
  "optimized_script": [
    {
      "start": <segundos>,
      "end": <segundos>,
      "original_text": "Texto original transcrito...",
      "optimized_text": "Texto optimizado para el guion final. Debe incluir un saludo inicial personalizado adaptado de forma única e ingeniosa al nombre y temática del canal (${channelName}) en los primeros 15 segundos y un llamado a la acción/frase de despedida característica del canal al final. En el cuerpo del guion, acorta frases redundantes, elimina muletillas, aumenta el dinamismo, añade suspenso o energía y hazlo sonar 100% natural, directo y en la voz del canal del usuario.",
      "wpm": <número_wpm_calculado_basado_en_el_diálogo_original>,
      "wpm_status": "Normal|Rápido|Pausado",
      "pacing_alert": "Advertencia sobre la velocidad de locución en este fragmento. Si WPM > 140, aconseja hablar más pausado. Si < 95, aconseja añadir más dinamismo o efectos de sonido para llenar los silencios.",
      "production_note": "Nota técnica y de edición de efectos de sonido, clips de apoyo visual o zoom de cámara recomendado para esta escena (ej: '[SFX: Efecto de sonido digital rápido + Zoom rápido a la cara]') o null si no es necesario.",
      "open_loop": "Identifica si esta sección introduce un bucle abierto de curiosidad (prometer revelar algo intrigante más adelante en el video para retener al usuario) o null si no aplica."
    }
  ],
  "viral_shorts": [
    {
      "start": <segundos_inicio>,
      "end": <segundos_fin>,
      "title": "Título sugerido para Short/TikTok/Reel",
      "hook_modification": "Primeras 2 frases del fragmento reescritas para ser un gancho de 3 segundos adaptado a formato vertical",
      "rationale": "Por qué este momento del video es ideal para viralizar de forma independiente"
    }
  ],
  "thumbnail_image_prompts": [
    {
      "concept": "Concepto visual principal",
      "prompt": "Prompt detallado en inglés para copiar y pegar en Midjourney/Leonardo.ai basado en el clímax del guion",
      "why": "Explicación del impacto psicológico y CTR de este concepto"
    }
  ]
}

Reglas importantes para el análisis:
1. Divide la transcripción en bloques coherentes de 10 a 20 segundos con marcas de tiempo exactas.
2. En el "tension_meter", incluye al menos 5 o 6 puntos clave de la línea de tiempo del video (ej. introducción, nudo, clímax, partes explicativas) para crear un gráfico de ritmo.
3. Sé directo, constructivo y muy exigente. Usa jerga y métricas de retención de YouTube.
4. Identifica palabras comunes sobreusadas en el nicho y dale alternativas mejores.
5. Adapta de manera muy creativa los textos de saludo y despedida basándote en la temática descrita de tu canal (${channelName}).
`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            fileData: {
              fileUri: uploadResult.uri,
              mimeType: uploadResult.mimeType
            }
          },
          analysisPrompt
        ],
        config: {
          responseMimeType: 'application/json',
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' }
          ]
        }
      });

      if (response.promptFeedback?.blockReason) {
        throw new Error(`El análisis fue bloqueado por la API de Gemini debido a políticas de seguridad (${response.promptFeedback.blockReason}).`);
      }

      const candidate = response.candidates?.[0];
      if (candidate?.finishReason && candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
        throw new Error(`El modelo no pudo completar la respuesta debido a políticas de seguridad de salida (Razón: ${candidate.finishReason}).`);
      }

      responseText = response.text || candidate?.content?.parts?.[0]?.text;
    }

    if (!responseText) {
      throw new Error('Gemini devolvió una respuesta vacía. Intenta de nuevo.');
    }

    console.log('Gemini respondió exitosamente.');

    // Limpieza de archivos temporales locales (solo si no es YouTube y se crearon archivos locales)
    if (!isYoutube) {
      try {
        if (!fileIsAudio && fs.existsSync(tempAudioPath)) {
          fs.unlinkSync(tempAudioPath);
        }
        if (isUpload && fs.existsSync(resolvedVideoPath)) {
          fs.unlinkSync(resolvedVideoPath);
        }
        if (uploadResult) {
          await ai.files.delete({ name: uploadResult.name });
        }
        console.log('Archivos temporales locales y remotos eliminados con éxito.');
      } catch (cleanupErr) {
        console.error('Error al limpiar archivos temporales:', cleanupErr);
      }
    }

    // Parsear la respuesta y retornarla
    let data;
    try {
      const repairedText = jsonrepair(responseText);
      data = JSON.parse(repairedText);
    } catch (parseError) {
      console.warn('jsonrepair falló, intentando el parseo original...', parseError);
      data = JSON.parse(responseText);
    }
    return res.json(data);

  } catch (error) {
    console.error('Error en el análisis:', error);
    // Limpieza de archivos si ocurre un error y no es YouTube
    if (!isYoutube) {
      if (fs.existsSync(tempAudioPath)) {
        try { fs.unlinkSync(tempAudioPath); } catch (e) {}
      }
      if (isUpload && fs.existsSync(resolvedVideoPath)) {
        try { fs.unlinkSync(resolvedVideoPath); } catch (e) {}
      }
    }
    return res.status(500).json({ error: `Ocurrió un error al procesar el video: ${error.message}` });
  }
});


// Endpoint para refinar/reescribir el guion optimizado interactivamente por el usuario
app.post('/api/refine-script', async (req, res) => {
  const { apiKey, script, comment, channelName, channelDescription } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: 'Se requiere la API Key de Gemini.' });
  }
  if (!script || !comment) {
    return res.status(400).json({ error: 'Se requiere el guion actual y la instrucción de cambio.' });
  }

  try {
    console.log('Petición de refinamiento recibida. Instrucción:', comment);
    const ai = new GoogleGenAI({ 
      apiKey,
      httpOptions: { timeout: 600000 } 
    });

    const refinePrompt = `
Eres un Director de Cine de Terror de Hollywood y experto en retención y guiones de YouTube.
Tu tarea es modificar el guion optimizado existente según los comentarios del creador.

INFORMACIÓN DEL CANAL:
Nombre: ${channelName || 'Mi Canal'}
Descripción: ${channelDescription || 'Canal de terror'}

COMENTARIO/INSTRUCCIÓN DEL USUARIO:
"${comment}"

GUION ACTUAL (En formato JSON):
${JSON.stringify(script, null, 2)}

Devuelve el guion modificado siguiendo exactamente este formato JSON. No incluyas ningún texto de introducción ni de cierre, solo el objeto JSON de salida. El JSON debe ser un objeto con una única propiedad "optimized_script" que contenga la estructura del guion modificada según la instrucción, manteniendo los mismos timestamps.

Formato de salida requerido:
{
  "optimized_script": [
    {
      "start": <segundos>,
      "end": <segundos>,
      "original_text": "Texto original...",
      "optimized_text": "Texto optimizado modificado según las indicaciones del usuario. Aplica el saludo de marca en los primeros 15s y la despedida al final, y ajusta las secciones solicitadas.",
      "wpm": <número_wpm_calculado>,
      "wpm_status": "Normal|Rápido|Pausado",
      "pacing_alert": "Alerta de ritmo si aplica...",
      "production_note": "Anotación de edición SFX/VFX si aplica...",
      "open_loop": "Anotación de lazo de atención si aplica..."
    }
  ]
}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: refinePrompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const candidate = response.candidates?.[0];
    const responseText = response.text || candidate?.content?.parts?.[0]?.text;

    if (!responseText) {
      throw new Error('Gemini no devolvió ninguna respuesta para la modificación.');
    }

    let data;
    try {
      const repairedText = jsonrepair(responseText);
      data = JSON.parse(repairedText);
    } catch (parseError) {
      console.warn('jsonrepair falló en refinamiento, intentando el parseo original...', parseError);
      data = JSON.parse(responseText);
    }
    return res.json(data);

  } catch (error) {
    console.error('Error al refinar guion:', error);
    return res.status(500).json({ error: `No se pudo modificar el guion: ${error.message}` });
  }
});

// Endpoint para escanear los metadatos de un canal de YouTube usando scraping
app.post('/api/fetch-channel', async (req, res) => {
  const { channelUrl } = req.body;
  if (!channelUrl) {
    return res.status(400).json({ error: 'Se requiere la URL o Handle del canal.' });
  }

  try {
    console.log(`[YouTube API] Escaneando canal: ${channelUrl}`);
    let targetUrl = channelUrl.trim();
    if (!targetUrl.startsWith('http')) {
      if (targetUrl.startsWith('@')) {
        targetUrl = `https://www.youtube.com/${targetUrl}`;
      } else {
        targetUrl = `https://www.youtube.com/@${targetUrl}`;
      }
    }

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      }
    });

    if (!response.ok) {
      throw new Error(`YouTube devolvió estado HTTP: ${response.status}`);
    }

    const html = await response.text();

    // Extraer metadatos OpenGraph usando expresiones regulares
    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
    const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/i) || html.match(/<meta name="description" content="([^"]+)"/i);
    const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);

    const channelName = titleMatch ? titleMatch[1].replace(' - YouTube', '') : 'Canal de YouTube';
    const channelDescription = descMatch ? descMatch[1] : '';
    const channelAvatarUrl = imageMatch ? imageMatch[1] : '';

    return res.json({
      success: true,
      channelName,
      channelDescription,
      channelAvatarUrl,
      channelUrl: targetUrl
    });
  } catch (error) {
    console.error('Error al escanear canal:', error);
    return res.status(500).json({ error: `No se pudo escanear el canal: ${error.message}` });
  }
});

// Endpoint para analizar y sugerir títulos virales
app.post('/api/analyze-title', async (req, res) => {
  const { title, apiKey, channelName, channelDescription } = req.body;
  if (!apiKey) {
    return res.status(400).json({ error: 'Se requiere la API Key de Gemini.' });
  }
  if (!title) {
    return res.status(400).json({ error: 'Se requiere el título a analizar.' });
  }

  try {
    console.log(`[Título API] Analizando título: "${title}"`);
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `
Eres un experto estratega de YouTube y director creativo experto en clickbait psicológico (CTR elevado).
Tu tarea es analizar el siguiente título propuesto para un video y dar una crítica honesta, una puntuación SEO/CTR y sugerir 5 títulos alternativos altamente virales que encajen con el estilo del canal.

INFORMACIÓN DEL CANAL:
Nombre: ${channelName || 'Mi Canal'}
Descripción: ${channelDescription || 'General'}

TÍTULO PROPUESTO:
"${title}"

Devuelve un objeto JSON estructurado que siga exactamente este formato. No devuelvas ningún texto antes ni después del JSON. Solo el JSON.

La respuesta DEBE ser un JSON con las siguientes propiedades:
{
  "score": <número_de_0_a_100>,
  "critique": "Análisis psicológico detallado de por qué el título actual funciona o falla. ¿Genera curiosidad, urgencia o intriga?",
  "seo_rating": "Excelente|Bueno|Mejorable|Malo",
  "viral_suggestions": [
    { "title": "Sugerencia de Título 1 (Curiosidad/Intriga)", "CTR_rationale": "Explicación del disparador psicológico detrás de este título." },
    { "title": "Sugerencia de Título 2 (Formato de pregunta/Desafío)", "CTR_rationale": "Explicación..." },
    { "title": "Sugerencia de Título 3 (Urgente/Extremo)", "CTR_rationale": "Explicación..." },
    { "title": "Sugerencia de Título 4 (Contradictorio/Bucle abierto)", "CTR_rationale": "Explicación..." },
    { "title": "Sugerencia de Título 5 (Estilo directo/Corto)", "CTR_rationale": "Explicación..." }
  ]
}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const responseText = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text;
    const repairedText = jsonrepair(responseText);
    const data = JSON.parse(repairedText);
    return res.json(data);
  } catch (error) {
    console.error('Error al analizar título:', error);
    return res.status(500).json({ error: `No se pudo analizar el título: ${error.message}` });
  }
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`=== Servidor API YouTube ScriptCrafter iniciado en http://localhost:${PORT} ===`);
});
