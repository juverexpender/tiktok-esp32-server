const WebSocket = require('ws');
const { WebcastPushConnection } = require('tiktok-live-connector');
const express = require('express');
const path = require('path');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

// Crear servidor HTTP
const server = http.createServer(app);

// Configurar WebSocket Server con CORS
const wss = new WebSocket.Server({ 
  server,
  handleProtocols: (protocols, request) => {
    return 'echo-protocol';
  }
});

// Middleware CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Variables de estado
let tiktokConnection = null;
let currentUsername = '';
const clients = new Set();

// Manejar conexiones WebSocket
wss.on('connection', function connection(ws, request) {
  console.log('🔌 Nuevo cliente WebSocket conectado');
  clients.add(ws);
  
  // Enviar mensaje de bienvenida
  ws.send(JSON.stringify({
    type: 'system',
    message: 'conectado_servidor',
    timestamp: new Date().toISOString()
  }));
  
  ws.on('message', function incoming(message) {
    console.log('📩 Mensaje del cliente:', message.toString());
  });
  
  ws.on('close', function() {
    console.log('🔌 Cliente WebSocket desconectado');
    clients.delete(ws);
  });
  
  ws.on('error', function(error) {
    console.error('❌ Error WebSocket:', error);
    clients.delete(ws);
  });
});

// Función para broadcast a clientes
function broadcastMessage(message) {
  const messageStr = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

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
    console.log(`🔗 Intentando conectar a: ${username}`);
    tiktokConnection = new WebcastPushConnection(username, {
      enableExtendedGiftInfo: true,
      processInitialData: true
    });

    tiktokConnection.connect()
      .then(state => {
        console.log(`✅ Conectado a la sala de ${state.ownerDisplayName}`);
        currentUsername = username;
        
        broadcastMessage({
          type: 'system',
          message: 'conectado_tiktok',
          username: username,
          timestamp: new Date().toISOString()
        });

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
            message: 'transmision_finalizada',
            timestamp: new Date().toISOString()
          });
        });

        tiktokConnection.on('error', err => {
          console.error('Error en conexión TikTok:', err);
          broadcastMessage({
            type: 'system',
            message: 'error_conexion',
            error: err.message,
            timestamp: new Date().toISOString()
          });
        });
      })
      .catch(err => {
        console.error('❌ Error al conectar con TikTok:', err);
        broadcastMessage({
          type: 'system',
          message: 'error_conexion',
          error: err.message,
          timestamp: new Date().toISOString()
        });
      });
  } catch (error) {
    console.error('Error inicializando conexión:', error);
    broadcastMessage({
      type: 'system',
      message: 'error_conexion',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// Endpoints de la API
app.post('/api/start', (req, res) => {
  const { username } = req.body;
  
  if (!username) {
    return res.status(400).json({ error: 'Username es requerido', status: 'error' });
  }
  
  connectToTikTok(username);
  res.json({ message: `Conectando a @${username}`, status: 'success' });
});

app.post('/api/stop', (req, res) => {
  if (tiktokConnection) {
    try {
      tiktokConnection.disconnect();
      tiktokConnection = null;
      currentUsername = '';
      console.log('Conexión finalizada manualmente');
      res.json({ message: 'Conexión detenida', status: 'success' });
    } catch (e) {
      res.status(500).json({ error: 'Error al desconectar', status: 'error' });
    }
  } else {
    res.json({ message: 'No hay conexión activa', status: 'info' });
  }
});

app.get('/api/status', (req, res) => {
  res.json({ 
    connected: !!tiktokConnection,
    username: currentUsername,
    clients: clients.size,
    status: 'success'
  });
});

// Endpoint para testing
app.post('/api/test', (req, res) => {
  const { type, command, value } = req.body;
  
  broadcastMessage({
    type: type || 'test',
    message: command || 'test_command',
    value: value || 1,
    timestamp: new Date().toISOString()
  });
  
  res.json({ message: 'Comando de prueba enviado', status: 'success' });
});

// Iniciar servidor
server.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
  console.log(`👉 Ve a http://localhost:${PORT} para acceder al panel de control`);
});

// Manejar cierre graceful
process.on('SIGINT', () => {
  console.log('Apagando servidor...');
  if (tiktokConnection) {
    tiktokConnection.disconnect();
  }
  server.close(() => {
    process.exit(0);
  });
});
