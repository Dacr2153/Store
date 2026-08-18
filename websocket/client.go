package websocket

import (
	"encoding/json"
	"log"
	"sync/atomic"

	"github.com/gorilla/websocket"
)

// hub se encarga de mantener un registro de los clientes y de enviar mensajes a todos los clientes conectados.
// patron factory
type Client struct {
	hub      *Hub
	id       string
	userID   atomic.Value // string; set after auth handshake
	socket   *websocket.Conn
	outbound chan []byte // messages to send to the client
}

func NewClient(hub *Hub, socket *websocket.Conn) *Client {
	return &Client{
		hub:      hub,
		socket:   socket,
		outbound: make(chan []byte, 16),
	}
}

// UserID returns the authenticated user id for this client, or empty string if anonymous.
func (c *Client) UserID() string {
	if v := c.userID.Load(); v != nil {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func (c *Client) setUserID(uid string) { c.userID.Store(uid) }

func (c *Client) Write() {
	// Usamos un for range para iterar sobre los mensajes en el canal outbound
	for message := range c.outbound {
		err := c.socket.WriteMessage(websocket.TextMessage, message)
		if err != nil {
			log.Println("Error writing message:", err)
			break
		}
	}
	c.socket.WriteMessage(websocket.CloseMessage, []byte{})
}

// Read consumes inbound frames. The only client → server message currently
// understood is the auth handshake `{"type":"auth","token":"..."}` which the
// hub uses to associate the connection with a user id for per-user routing.
func (c *Client) Read() {
	defer func() {
		c.hub.unregister <- c
	}()
	for {
		_, msg, err := c.socket.ReadMessage()
		if err != nil {
			return
		}
		var env struct {
			Type  string `json:"type"`
			Token string `json:"token"`
		}
		if err := json.Unmarshal(msg, &env); err != nil {
			continue
		}
		if env.Type == "auth" && env.Token != "" && c.hub.authenticator != nil {
			if uid, err := c.hub.authenticator(env.Token); err == nil && uid != "" {
				c.setUserID(uid)
			}
		}
	}
}
