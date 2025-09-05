# TikTok ESP32 Server

Servidor para controlar servomotores y LEDs mediante comentarios y regalos de TikTok Live.

## 🚀 Características

- Conexión en tiempo real con TikTok Live
- Control de servos mediante comentarios
- Control de LEDs mediante comentarios y regalos
- WebSocket para comunicación con ESP32
- Panel de control web responsive

## 📋 Comandos Disponibles

### Comentarios:
- `servo1` - Mueve el servo 1
- `servo2` - Mueve el servo 2
- `luzroja` o `rojo` - Enciende LED rojo
- `luzverde` o `verde` - Enciende LED verde
- `luzazul` o `azul` - Enciende LED azul
- `apagar` - Apaga todos los LEDs

### Regalos:
- 🌹 **Rosa** - Parpadeo LED rojo
- 🪙 **Monedas** - Parpadeo LED verde
- 🎵 **TikTok** - Secuencia especial de LEDs

## 🛠️ Instalación

1. Clonar repositorio
2. `npm install`
3. `npm start`

## 🌐 Despliegue en Render.com

1. Conectar repositorio de GitHub
2. Configurar variables de entorno (opcional)
3. Deploy automático

## 🔌 Configuración ESP32

```cpp
// Configuración WiFi
const char* ssid = "Juver";
const char* password = "012345678";

// URL del servidor
const char* websockets_server_host = "tu-servicio.render.com";
