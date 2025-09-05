const WebSocket = require('ws');
const { WebcastPushConnection } = require('tiktok-live-connector');
const express = require('express');
const path = require('path');
const http = require('http');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Crear servidor HTTP
const server = http.createServer(app);

// Configurar WebSocket Server
const wss = new WebSocket.Server({ 
  server,
  handleProtocols: (protocols, request) => {
    return 'echo-protocol';
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Routes
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
    
    try {
      const data = JSON.parse(message);
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (e) {
      console.log('Mensaje no JSON:', message.toString());
    }
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
      console.log('🔌 Conexión TikTok anterior cerrada');
    } catch (e) {
      console.log('⚠️ Error al desconectar:', e.message);
    }
    tiktokConnection = null;
  }

  try {
    console.log(`🔗 Intentando conectar a: ${username}`);
    tiktokConnection = new WebcastPushConnection(username, {
      enableExtendedGiftInfo: true,
      processInitialData: true,
      timeout: 10000,
      retryTimeout: 5000,
      maxRetries: 3
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
          console.log(`💬 ${data.nickname}: ${data.comment}`);
          broadcastMessage({
            type: 'comment',
            user: data.nickname,
            message: data.comment.toLowerCase().trim(),
            timestamp: new Date().toISOString()
          });
        });

        // Evento para regalos
        tiktokConnection.on('gift', data => {
          console.log(`🎁 ${data.nickname} envió ${data.giftName} x${data.repeatCount}`);
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
          currentUsername = '';
        });

        tiktokConnection.on('error', err => {
          console.error('❌ Error en conexión TikTok:', err.message);
          broadcastMessage({
            type: 'system',
            message: 'error_conexion',
            error: err.message,
            timestamp: new Date().toISOString()
          });
        });

        tiktokConnection.on('disconnected', () => {
          console.log('🔌 Desconectado de TikTok');
          broadcastMessage({
            type: 'system',
            message: 'desconectado_tiktok',
            timestamp: new Date().toISOString()
          });
          currentUsername = '';
        });

      })
      .catch(err => {
        console.error('❌ Error al conectar con TikTok:', err.message);
        broadcastMessage({
          type: 'system',
          message: 'error_conexion',
          error: err.message,
          timestamp: new Date().toISOString()
        });
      });
  } catch (error) {
    console.error('❌ Error inicializando conexión:', error.message);
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
  
  if (!username || username.trim() === '') {
    return res.status(400).json({ 
      error: 'Username es requerido', 
      status: 'error' 
    });
  }
  
  connectToTikTok(username.trim());
  res.json({ 
    message: `Conectando a @${username}`, 
    status: 'success' 
  });
});

app.post('/api/stop', (req, res) => {
  if (tiktokConnection) {
    try {
      tiktokConnection.disconnect();
      tiktokConnection = null;
      currentUsername = '';
      console.log('⏹️ Conexión finalizada manualmente');
      res.json({ 
        message: 'Conexión detenida', 
        status: 'success' 
      });
    } catch (e) {
      res.status(500).json({ 
        error: 'Error al desconectar', 
        status: 'error' 
      });
    }
  } else {
    res.json({ 
      message: 'No hay conexión activa', 
      status: 'info' 
    });
  }
});

app.get('/api/status', (req, res) => {
  res.json({ 
    connected: !!tiktokConnection,
    username: currentUsername,
    clients: clients.size,
    status: 'success',
    timestamp: new Date().toISOString()
  });
});

// Endpoint para testing
app.post('/api/test/command', (req, res) => {
  const { command } = req.body;
  
  if (!command) {
    return res.status(400).json({ 
      error: 'Comando es requerido', 
      status: 'error' 
    });
  }
  
  broadcastMessage({
    type: 'comment',
    user: 'usuario_prueba',
    message: command.toLowerCase().trim(),
    timestamp: new Date().toISOString()
  });
  
  res.json({ 
    message: `Comando de prueba enviado: ${command}`, 
    status: 'success' 
  });
});

app.post('/api/test/gift', (req, res) => {
  const { gift, count } = req.body;
  
  if (!gift) {
    return res.status(400).json({ 
      error: 'Regalo es requerido', 
      status: 'error' 
    });
  }
  
  broadcastMessage({
    type: 'gift',
    user: 'usuario_prueba',
    gift: gift.toLowerCase(),
    count: count || 1,
    timestamp: new Date().toISOString()
  });
  
  res.json({ 
    message: `Regalo de prueba enviado: ${gift} x${count || 1}`, 
    status: 'success' 
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    clients: clients.size
  });
});

// Manejar 404
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Endpoint no encontrado', 
    status: 'error' 
  });
});

// Manejo de errores global
app.use((error, req, res, next) => {
  console.error('❌ Error global:', error);
  res.status(500).json({ 
    error: 'Error interno del servidor', 
    status: 'error' 
  });
});

// Iniciar servidor
server.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
  console.log(`👉 Health check: http://localhost:${PORT}/health`);
  console.log(`👉 Panel control: http://localhost:${PORT}`);
});

// Manejar cierre graceful
process.on('SIGINT', () => {
  console.log('\n🛑 Apagando servidor...');
  if (tiktokConnection) {
    try {
      tiktokConnection.disconnect();
    } catch (e) {
      console.log('⚠️ Error al desconectar TikTok:', e.message);
    }
  }
  
  // Cerrar todas las conexiones WebSocket
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.close();
    }
  });
  
  server.close(() => {
    console.log('✅ Servidor apagado correctamente');
    process.exit(0);
  });
});

// Keep alive para WebSocket connections
setInterval(() => {
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ 
        type: 'ping',
        timestamp: new Date().toISOString()
      }));
    }
  });
}, 30000); // Ping cada 30 segundos
