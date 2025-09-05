const WebSocket = require('ws');
const { WebcastPushConnection } = require('tiktok-live-connector');
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Servidor WebSocket
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });
const clients = new Set();

// Servir archivos estáticos
app.use(express.static('public'));
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Variable para la conexión de TikTok
let tiktokConnection = null;
let currentUsername = '';

// Conexión a TikTok Live
function connectToTikTok(username) {
  // Desconectar si ya hay una conexión
  if (tiktokConnection) {
    try {
      tiktokConnection.disconnect();
    } catch (e) {
      console.log('Error al desconectar:', e);
    }
    tiktokConnection = null;
  }

  try {
    console.log(`Intentando conectar a: ${username}`);
    tiktokConnection = new WebcastPushConnection(username, {
      enableExtendedGiftInfo: true,
      processInitialData: true
    });

    tiktokConnection.connect()
      .then(state => {
        console.log(`✅ Conectado a la sala de ${state.ownerDisplayName}`);
        currentUsername = username;
        
        // Evento para comentarios
        tiktokConnection.on('chat', data => {
          console.log(`${data.nickname}: ${data.comment}`);
          broadcastMessage({
            type: 'comment',
            user: data.nickname,
            message: data.comment.toLowerCase().trim(),
            timestamp: new Date().toISOString()
          });
        });

        // Evento para regalos
        tiktokConnection.on('gift', data => {
          console.log(`${data.nickname} envió ${data.giftName} x${data.repeatCount}`);
          broadcastMessage({
            type: 'gift',
            user: data.nickname,
            gift: data.giftName.toLowerCase(),
            count: data.repeatCount,
            timestamp: new Date().toISOString()
          });
        });

        tiktokConnection.on('streamEnd', () => {
          console.log('❌ Transmisión finalizada');
          broadcastMessage({
            type: 'system',
            message: 'transmision_finalizada'
          });
        });

        tiktokConnection.on('error', err => {
          console.error('Error en conexión TikTok:', err);
          broadcastMessage({
            type: 'system',
            message: 'error_conexion'
          });
        });
      })
      .catch(err => {
        console.error('❌ Error al conectar con TikTok:', err);
        broadcastMessage({
          type: 'system',
          message: 'error_conexion'
        });
      });
  } catch (error) {
    console.error('Error inicializando conexión:', error);
  }
}

// Endpoint para iniciar conexión
app.post('/start', (req, res) => {
  const { username } = req.body;
  
  if (!username) {
    return res.status(400).json({ error: 'Username es requerido' });
  }
  
  connectToTikTok(username);
  res.json({ message: `Conectando a @${username}`, status: 'success' });
});

// Endpoint para desconectar
app.post('/stop', (req, res) => {
  if (tiktokConnection) {
    try {
      tiktokConnection.disconnect();
      tiktokConnection = null;
      currentUsername = '';
      console.log('Conexión finalizada manualmente');
      res.json({ message: 'Conexión detenida', status: 'success' });
    } catch (e) {
      res.status(500).json({ error: 'Error al desconectar' });
    }
  } else {
    res.json({ message: 'No hay conexión activa', status: 'info' });
  }
});

// Endpoint para estado
app.get('/status', (req, res) => {
  res.json({ 
    connected: !!tiktokConnection,
    username: currentUsername
  });
});

// Función para enviar mensajes a los ESP32
function broadcastMessage(message) {
  const messageStr = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

// WebSocket para ESP32
wss.on('connection', function connection(ws) {
  console.log('🔌 ESP32 conectado');
  clients.add(ws);
  
  ws.on('message', function incoming(message) {
    console.log('📩 Mensaje del ESP32:', message.toString());
  });
  
  ws.on('close', function() {
    console.log('🔌 ESP32 desconectado');
    clients.delete(ws);
  });
  
  // Enviar mensaje de bienvenida
  ws.send(JSON.stringify({
    type: 'system',
    message: 'conectado_servidor'
  }));
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
  console.log(`👉 Ve a https://localhost:${PORT} para acceder al panel de control`);
});
