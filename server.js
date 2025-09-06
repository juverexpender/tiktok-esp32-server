const WebSocket = require('ws');
const { WebcastPushConnection } = require('tiktok-live-connector');
const express = require('express');
const path = require('path');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware básico
app.use(express.json());
app.use(express.static('public'));

// Servir archivos estáticos
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint - MUY IMPORTANTE para Render
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Servidor funcionando',
    timestamp: new Date().toISOString()
  });
});

// Endpoint simple de prueba
app.get('/test', (req, res) => {
  res.json({ 
    message: '¡Servidor funcionando correctamente!',
    version: '2.0.0'
  });
});

// Manejo de errores para rutas no encontradas
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Endpoint no encontrado',
    suggestion: 'Prueba con /health o /test'
  });
});

// Iniciar servidor
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
  console.log(`👉 Health check: http://localhost:${PORT}/health`);
  console.log(`👉 Test: http://localhost:${PORT}/test`);
});

// Exportar para Render (importante!)
module.exports = app;
