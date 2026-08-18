package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	//checkorigin es una función opcional que se llama para verificar la solicitud de origen.
	CheckOrigin: func(r *http.Request) bool { return true },
}

/*
Hub actúa como un Mediator centralizando la comunicación entre los clientes conectados.
También implementa elementos de Observer, ya que notifica a los clientes de eventos,
como cuando se recibe un mensaje de difusión.
*/
type Hub struct {
	clients       []*Client    // lista de clientes conectados (observadores)
	register      chan *Client // canal de clientes para registrar nuevos clientes
	unregister    chan *Client // canal para desconectar clientes
	mutex         *sync.Mutex  // Mutex garantiza concurrencia segura
	authenticator func(token string) (string, error)
}

func NewHub() *Hub {
	return &Hub{
		clients:    make([]*Client, 0),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		mutex:      &sync.Mutex{},
	}
}

// SetAuthenticator wires a JWT validator that returns the user id for a given
// token. The hub uses it during the optional auth handshake to associate
// per-user connections.
func (hub *Hub) SetAuthenticator(fn func(token string) (string, error)) {
	hub.authenticator = fn
}

// Metodo que usa el patron MEDIATOR al registrar cada cliente en el hud central.
// ruta de manejo para los diferentes eventos de websocket
func (hub *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	socket, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		http.Error(w, "could not open websocket connection", http.StatusBadRequest)
		return
	}
	client := NewClient(hub, socket)
	//register es un canal que se utiliza para registrar un nuevo cliente en el hub.
	hub.register <- client
	go client.Write()
	go client.Read()

}

// Run ejecuta el ciclo principal del Hud, utilizando el patron MEDIATOR.
func (hub *Hub) Run() {
	for {
		select {
		case client := <-hub.register: // registro del cliente
			hub.onConnect(client)
		case client := <-hub.unregister: // desconexion de cliente
			hub.onDisconnect(client)
		}
	}
}

/*
onConnect se ejecuta cuando un cliente se conecta al Hub.
Usa Mutex para garantizar que las operaciones sobre la lista de clientes sean seguras
en un entorno concurrente.
*/
func (hub *Hub) onConnect(client *Client) {
	// client.socket.RemoteAddr() devuelve la dirección remota de la conexión del cliente.
	log.Println("Client Connected", client.socket.RemoteAddr())

	// Bloquea el acceso concurrente mientras se actualiza la lista de clientes
	hub.mutex.Lock()
	defer hub.mutex.Unlock()

	// Asigna un identificador único al cliente basado en su dirección remota
	client.id = client.socket.RemoteAddr().String()
	hub.clients = append(hub.clients, client)
}

/*
onDisconnect se ejecuta cuando un cliente se desconecta del Hub.
También usa Mutex para garantizar seguridad concurrente al modificar la lista de clientes.
*/
func (hub *Hub) onDisconnect(client *Client) {
	log.Println("Client Disconnected", client.socket.RemoteAddr())

	// Cierra la conexión del cliente
	client.socket.Close()

	hub.mutex.Lock()
	defer hub.mutex.Unlock()
	// Encuentra el índice del cliente en la lista
	i := -1
	for index, c := range hub.clients {
		if c.id == client.id {
			i = index
		}
	}
	// i = 3 , [i:] == [3,4,5], [i+1:] == [4,5]
	// copy -> [1,2,4,5,5]
	copy(hub.clients[i:], hub.clients[i+1:]) // se sobreescribe el valor en la posición i con el valor en la posición i+1
	// [1,2,4,5,5]
	hub.clients[len(hub.clients)-1] = nil
	// [1,2,4,5,nil]
	hub.clients = hub.clients[:len(hub.clients)-1]
	// [1,2,4,5]

	// Cierra el canal de salida del cliente para liberar recursos
	close(client.outbound)
}

/*
Broadcast envía un mensaje a todos los clientes conectados, excepto al cliente ignorado.
Implementa el patrón Observer, ya que los clientes actúan como "observadores"
que reciben notificaciones (mensajes) a través del Hub.
*/

// ignore es utiliza evitar que el cliente que envió el mensaje lo reciba.
func (hub *Hub) Broadcast(message interface{}, ignore *Client) {
	// serializamos el mensaje a json
	data, _ := json.Marshal(message)
	hub.mutex.Lock()
	defer hub.mutex.Unlock()
	for _, client := range hub.clients {
		if client != ignore {
			select {
			case client.outbound <- data:
			default:
				// drop if client is slow to keep the hub responsive
			}
		}
	}
}

// BroadcastToUser delivers a JSON-encoded message only to the connections
// whose authenticated user id matches `userID`. Returns the number of clients
// the message was delivered to.
func (hub *Hub) BroadcastToUser(userID string, message interface{}) int {
	if userID == "" {
		return 0
	}
	data, _ := json.Marshal(message)
	hub.mutex.Lock()
	defer hub.mutex.Unlock()
	delivered := 0
	for _, client := range hub.clients {
		if client.UserID() == userID {
			select {
			case client.outbound <- data:
				delivered++
			default:
			}
		}
	}
	return delivered
}
