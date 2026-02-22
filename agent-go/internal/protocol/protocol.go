package protocol

import "encoding/json"

type Message struct {
	Type    string          `json:"type"`
	ID      string          `json:"id,omitempty"`
	Action  string          `json:"action,omitempty"`
	Payload json.RawMessage `json:"payload,omitempty"`
	Ts      int64           `json:"ts"`
}

type ResponsePayload struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}
