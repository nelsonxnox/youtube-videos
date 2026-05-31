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

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `upload_${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage });

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
  const channelDescription = req.body.channelDescription || 'Canal de terror';

  if (!apiKey) {
    return res.status(400).json({ error: 'Se requiere una API Key de Gemini.' });
  }

  if (isUpload) {
    videoPath = req.file.path;
  } else {
    videoPath = req.body.videoPath;
  }

  if (!videoPath) {
    return res.status(400).json({ error: 'Ruta de video o archivo de video requerido.' });
  }

  const resolvedVideoPath = path.resolve(videoPath.replace(/\\/g, '/'));

  if (!fs.existsSync(resolvedVideoPath)) {
    return res.status(404).json({ error: 'El archivo de video especificado no existe.' });
  }

  const audioFileName = `audio_${Date.now()}.mp3`;
  const tempAudioPath = path.join(tempDir, audioFileName);
  let uploadResult = null;
  const ai = new GoogleGenAI({ 
    apiKey,
    httpOptions: { timeout: 600000 } 
  });

  try {
    console.log(`Paso 1: Extrayendo audio de ${resolvedVideoPath} a ${tempAudioPath}...`);
    await extractAudio(resolvedVideoPath, tempAudioPath);

    let transcription = null;

    if (groqApiKey) {
      console.log('Paso 2: Transcribiendo audio usando la API de Groq (Whisper)...');
      const formData = new FormData();
      const fileBuffer = fs.readFileSync(tempAudioPath);
      const fileBlob = new Blob([fileBuffer], { type: 'audio/mp3' });
      formData.append('file', fileBlob, 'audio.mp3');
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
      uploadResult = await ai.files.upload({
        file: tempAudioPath,
        mimeType: 'audio/mp3',
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

    console.log('Paso 3: Enviando a Gemini para análisis crítico y optimización...');
    
    let responseText = '';

    // Modificar los prompts de Gemini para incluir el branding y las nuevas métricas
    if (transcription) {
      // Modo Texto (Groq Fallback)
      const analysisPrompt = `
Eres un Director de Cine de Terror de Hollywood y un experto estratega en retención de YouTube.
Tu tarea es analizar el guion de un video de terror que ya ha sido transcribido con marcas de tiempo, y realizar una optimización y reescritura creativa adaptada al perfil del canal del creador.

INFORMACIÓN DEL CANAL:
Nombre: ${channelName}
Descripción: ${channelDescription}

Aquí tienes la transcripción original del video:
${JSON.stringify(transcription, null, 2)}

Devuelve un objeto JSON estructurado que siga exactamente este formato. No devuelvas ningún texto antes ni después del JSON. Solo el JSON.

La respuesta DEBE ser un JSON con las siguientes propiedades:
{
  "transcription": [
    // La transcripción exacta que te di
  ],
  "tension_meter": [
    { "timestamp": <segundos>, "tension_level": <número_de_0_a_100>, "analysis": "Explicación del ritmo en este momento. Ej: La música o la narración acelera, o la explicación se alarga demasiado.", "suggestion": "Sugerencia específica si aplica. Ej: Recortar 5 segundos aquí o agregar un jumpscare." }
  ],
  "hook_analysis": {
    "score": "Una letra de la A a la F representando la fuerza de los primeros 30 segundos",
    "critique": "Análisis detallado de cómo empieza el video. ¿Engancha al espectador? ¿Es aburrido?",
    "suggestions": ["Sugerencia de mejora 1", "Sugerencia de mejora 2"]
  },
  "cliches_detector": {
    "repeated_words": [
      { "word": "palabra repetida", "count": <número_veces>, "synonyms": ["sinónimo1", "sinónimo2", "sinónimo3"] }
    ],
    "cliches_found": [
      { "cliche": "Frase hecha, cliché narrativo o cliché de terror", "why": "Por qué es perjudicial para la tensión", "alternative": "Propuesta de narración mucho más profesional y tensa" }
    ]
  },
  "metadata": {
    "titles": ["Título 1 (Gancho/Curiosidad)", "Título 2 (Intrigante/Oscuro)", "Título 3 (Clickbait honesto)"],
    "description": "Descripción SEO optimizada para YouTube, detallando el video de forma atractiva e incluyendo hashtags de terror.",
    "tags": ["tag1", "tag2", "tag3"]
  },
  "thumbnail_ideas": [
    { "description": "Idea visual detallada para la miniatura", "elements": ["elemento visual 1", "elemento visual 2"], "rationale": "Explicación de por qué esta miniatura tendrá alto CTR en YouTube" }
  ],
  "optimized_script": [
    {
      "start": <segundos>,
      "end": <segundos>,
      "original_text": "Texto original...",
      "optimized_text": "Texto optimizado. Debe incluir un saludo inicial personalizado adaptado de forma creativa al nombre/descripción del canal (en los primeros 15s) y una frase de despedida característica del canal al final. En el nudo, acorta frases largas, elimina muletillas y haz la narración más tensa y directa.",
      "wpm": <número_wpm_calculado_basado_en_el_diálogo_original>,
      "wpm_status": "Normal|Rápido|Pausado",
      "pacing_alert": "Explicación o advertencia de velocidad en esta sección si es necesario. Si WPM > 140, aconseja hablar más despacio. Si < 95, aconseja añadir silencios y música dramática.",
      "production_note": "Anotación de producción y efectos para el editor en este bloque (ej. '[SFX: Ruido metálico de garras + zoom rápido al armario]') o null si no aplica.",
      "open_loop": "Identificar si este bloque introduce o cierra un lazo de atención / suspenso secundario (ej. '[Bucle abierto: Promete revelar el secreto del ático más tarde]') o null si no aplica."
    }
  ],
  "viral_shorts": [
    {
      "start": <segundos_inicio>,
      "end": <segundos_fin>,
      "title": "Título llamativo para TikTok/Shorts",
      "hook_modification": "Primeras líneas reescritas para ser un gancho ultra-rápido en formato vertical (3 segundos de impacto)",
      "rationale": "Por qué este momento del video es el más apto para viralizar"
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
1. En optimized_script, conserva exactamente las marcas de tiempo de inicio y fin originales.
2. Calcula WPM de manera realista: divide el número de palabras en original_text por la duración en minutos (fin - inicio).
3. Adapta de manera muy creativa los textos de saludo y despedida basándote en la temática descrita de tu canal.
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
      // Modo Audio Directo (Gemini)
      const analysisPrompt = `
Eres un Director de Cine de Terror de Hollywood y un experto estratega en retención de YouTube.
Tu tarea es analizar el audio de este video de terror y producir un reporte sumamente estructurado que ayude al creador a optimizar su video antes de subirlo, adaptándose al perfil del canal del creador.

INFORMACIÓN DEL CANAL:
Nombre: ${channelName}
Descripción: ${channelDescription}

Analiza el contenido del audio y devuelve un objeto JSON estructurado que siga exactamente este formato. No devuelvas ningún texto antes ni después del JSON. Solo el JSON.

La respuesta DEBE ser un JSON con las siguientes propiedades:
{
  "transcription": [
    { "start": <número_segundos>, "end": <número_segundos>, "text": "Texto completo hablado en este fragmento con buena puntuación" }
  ],
  "tension_meter": [
    { "timestamp": <segundos>, "tension_level": <número_de_0_a_100>, "analysis": "Explicación del ritmo en este momento. Ej: La música o la narración acelera, o la explicación se alarga demasiado.", "suggestion": "Sugerencia específica si aplica. Ej: Recortar 5 segundos aquí o agregar un jumpscare." }
  ],
  "hook_analysis": {
    "score": "Una letra de la A a la F representando la fuerza de los primeros 30 segundos",
    "critique": "Análisis detallado de cómo empieza el video. ¿Engancha al espectador? ¿Es aburrido?",
    "suggestions": ["Sugerencia de mejora 1", "Sugerencia de mejora 2"]
  },
  "cliches_detector": {
    "repeated_words": [
      { "word": "palabra repetida", "count": <número_veces>, "synonyms": ["sinónimo1", "sinónimo2", "sinónimo3"] }
    ],
    "cliches_found": [
      { "cliche": "Frase hecha, cliché narrativo o cliché de terror", "why": "Por qué es perjudicial para la tensión", "alternative": "Propuesta de narración mucho más profesional y tensa" }
    ]
  },
  "metadata": {
    "titles": ["Título 1 (Gancho/Curiosidad)", "Título 2 (Intrigante/Oscuro)", "Título 3 (Clickbait honesto)"],
    "description": "Descripción SEO optimizada para YouTube, detallando el video de forma atractiva e incluyendo hashtags de terror.",
    "tags": ["tag1", "tag2", "tag3"]
  },
  "thumbnail_ideas": [
    { "description": "Idea visual detallada para la miniatura", "elements": ["elemento visual 1", "elemento visual 2"], "rationale": "Explicación de por qué esta miniatura tendrá alto CTR en YouTube" }
  ],
  "optimized_script": [
    {
      "start": <segundos>,
      "end": <segundos>,
      "original_text": "Texto original transcrito...",
      "optimized_text": "Texto optimizado. Debe incluir un saludo inicial personalizado adaptado de forma creativa al nombre/descripción del canal (en los primeros 15s) y una frase de despedida característica del canal al final. En el nudo, acorta frases largas, elimina muletillas y haz la narración más tensa y directa.",
      "wpm": <número_wpm_calculado_basado_en_el_diálogo_original>,
      "wpm_status": "Normal|Rápido|Pausado",
      "pacing_alert": "Explicación o advertencia de velocidad en esta sección si es necesario. Si WPM > 140, aconseja hablar más despacio. Si < 95, aconseja añadir silencios y música de tensión.",
      "production_note": "Anotación de producción y efectos para el editor en este bloque (ej. '[SFX: Latido de corazón lento + pantalla a negro]') o null si no aplica.",
      "open_loop": "Identificar si este bloque introduce o cierra un lazo de atención / suspenso secundario (ej. '[Bucle abierto: Promete revelar el origen del ritual en breve]') o null si no aplica."
    }
  ],
  "viral_shorts": [
    {
      "start": <segundos_inicio>,
      "end": <segundos_fin>,
      "title": "Título llamativo para TikTok/Shorts",
      "hook_modification": "Primeras líneas reescritas para ser un gancho de 3 segundos adaptado a formato vertical",
      "rationale": "Por qué este momento del video es ideal para viralizar"
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
3. Sé directo, constructivo y muy exigente. Usa jerga de cine de terror y de retención de YouTube.
4. Identifica palabras comunes sobreusadas en videos de terror como "terrorífico", "de repente", "oscuro", "miedo" y dale alternativas mejores.
5. Adapta de manera muy creativa los textos de saludo y despedida basándote en la temática descrita de tu canal.
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
        throw new Error(`El análisis fue bloqueado por la API de Gemini debido a políticas de seguridad (${response.promptFeedback.blockReason}). Los videos de terror a veces disparan filtros automáticos por los sonidos. Se recomienda configurar una API Key de Groq para transcribir por separado.`);
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

    // Limpieza de archivos temporales locales
    try {
      if (fs.existsSync(tempAudioPath)) {
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
    // Limpieza de archivos si ocurre un error
    if (fs.existsSync(tempAudioPath)) {
      try { fs.unlinkSync(tempAudioPath); } catch (e) {}
    }
    if (isUpload && fs.existsSync(resolvedVideoPath)) {
      try { fs.unlinkSync(resolvedVideoPath); } catch (e) {}
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

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`=== Servidor Analizador de Terror iniciado en http://localhost:${PORT} ===`);
});
