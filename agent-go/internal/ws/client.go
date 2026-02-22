package ws

import (
	"encoding/json"
	"log"
	"math/rand"
	"net/url"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"minebot-agent/internal/auth"
	"minebot-agent/internal/config"
	"minebot-agent/internal/protocol"
)

type Client struct {
	cfg      *config.Config
	conn     *websocket.Conn
	mu       sync.Mutex
	closed   bool
	handlers *Handlers
}

func NewClient(cfg *config.Config) *Client {
	return &Client{
		cfg:      cfg,
		handlers: NewHandlers(cfg),
	}
}

func (c *Client) Connect() error {
	u, err := url.Parse(c.cfg.WSURL)
	if err != nil {
		return err
	}

	conn, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil {
		return err
	}

	c.conn = conn
	return c.sendAuth()
}

func (c *Client) Run() {
	go c.readLoop()
	c.heartbeatLoop()
}

func (c *Client) readLoop() {
	for {
		if c.closed {
			return
		}
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			log.Printf("read error: %v", err)
			c.reconnect()
			return
		}

		var msg protocol.Message
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}

		switch msg.Type {
		case "PING":
			c.send(protocol.Message{Type: "PONG", Ts: time.Now().Unix()})
		case "REQ":
			resp := c.handlers.Handle(msg)
			c.send(resp)
		}
	}
}

func (c *Client) heartbeatLoop() {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		if c.closed {
			return
		}
		c.send(protocol.Message{Type: "PING", Ts: time.Now().Unix()})
	}
}

func (c *Client) sendAuth() error {
	nonce := uuid.NewString()
	ts := time.Now().Unix()
	payload := c.cfg.AgentID + nonce + strconv.FormatInt(ts, 10)
	sig := auth.Sign(c.cfg.Token, payload)

	body := map[string]interface{}{
		"agentId": c.cfg.AgentID,
		"nonce":   nonce,
		"ts":      ts,
		"sig":     sig,
	}
	b, _ := json.Marshal(body)

	return c.send(protocol.Message{Type: "AUTH", Payload: b, Ts: ts})
}

func (c *Client) send(msg protocol.Message) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn == nil {
		return nil
	}
	data, _ := json.Marshal(msg)
	return c.conn.WriteMessage(websocket.TextMessage, data)
}

func (c *Client) reconnect() {
	c.mu.Lock()
	if c.conn != nil {
		_ = c.conn.Close()
	}
	c.mu.Unlock()

	backoff := 1 * time.Second
	for i := 0; i < 10; i++ {
		time.Sleep(jitter(backoff))
		if err := c.Connect(); err == nil {
			go c.readLoop()
			return
		}
		backoff = backoff * 2
		if backoff > 30*time.Second {
			backoff = 30 * time.Second
		}
	}
}

func jitter(d time.Duration) time.Duration {
	factor := 0.8 + rand.Float64()*0.4
	return time.Duration(float64(d) * factor)
}
