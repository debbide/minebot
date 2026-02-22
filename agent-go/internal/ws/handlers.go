package ws

import (
	"encoding/base64"
	"encoding/json"
	"time"

	"github.com/google/uuid"

	"minebot-agent/internal/config"
	"minebot-agent/internal/dockerexec"
	"minebot-agent/internal/fsops"
	"minebot-agent/internal/protocol"
	"minebot-agent/internal/rcon"
	"minebot-agent/internal/stats"
)

type Handlers struct {
	cfg     *config.Config
	uploads map[string]*fsops.UploadSession
}

func NewHandlers(cfg *config.Config) *Handlers {
	return &Handlers{
		cfg:     cfg,
		uploads: map[string]*fsops.UploadSession{},
	}
}

func (h *Handlers) Handle(msg protocol.Message) protocol.Message {
	if !h.isActionAllowed(msg.Action) {
		return response(msg.ID, false, "action not allowed", nil)
	}

	switch msg.Action {
	case "START":
		return h.handlePower(msg, "start")
	case "STOP":
		return h.handlePower(msg, "stop")
	case "RESTART":
		return h.handlePower(msg, "restart")
	case "KILL":
		return h.handlePower(msg, "kill")
	case "COMMAND":
		return h.handleCommand(msg)
	case "STATS":
		return h.handleStats(msg)
	case "LOGS":
		return h.handleLogs(msg)
	case "LIST":
		return h.handleList(msg)
	case "READ":
		return h.handleRead(msg)
	case "WRITE":
		return h.handleWrite(msg)
	case "MKDIR":
		return h.handleMkdir(msg)
	case "DELETE":
		return h.handleDelete(msg)
	case "RENAME":
		return h.handleRename(msg)
	case "COPY":
		return h.handleCopy(msg)
	case "COMPRESS":
		return h.handleCompress(msg)
	case "DECOMPRESS":
		return h.handleDecompress(msg)
	case "UPLOAD_INIT":
		return h.handleUploadInit(msg)
	case "UPLOAD_CHUNK":
		return h.handleUploadChunk(msg)
	case "UPLOAD_FINISH":
		return h.handleUploadFinish(msg)
	case "DOWNLOAD_INIT":
		return h.handleDownloadInit(msg)
	case "DOWNLOAD_CHUNK":
		return h.handleDownloadChunk(msg)
	default:
		return response(msg.ID, false, "unknown action", nil)
	}
}

func (h *Handlers) handlePower(msg protocol.Message, op string) protocol.Message {
	var payload struct {
		ServerID string `json:"serverId"`
	}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return response(msg.ID, false, "bad payload", nil)
	}
	container := h.resolveContainer(payload.ServerID)
	if container == "" {
		return response(msg.ID, false, "container not found", nil)
	}
	err := dockerexec.Power(h.cfg.DockerBin, op, container)
	if err != nil {
		return response(msg.ID, false, err.Error(), nil)
	}
	return response(msg.ID, true, "ok", nil)
}

func (h *Handlers) handleCommand(msg protocol.Message) protocol.Message {
	var payload struct {
		ServerID string `json:"serverId"`
		Command  string `json:"command"`
	}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return response(msg.ID, false, "bad payload", nil)
	}
	if !h.isCommandAllowed(payload.Command) {
		return response(msg.ID, false, "command not allowed", nil)
	}
	if h.cfg.Rcon.Enabled {
		if out, err := rcon.Exec(h.cfg.Rcon, payload.Command); err == nil {
			return response(msg.ID, true, out, nil)
		}
	}
	container := h.resolveContainer(payload.ServerID)
	if container == "" {
		return response(msg.ID, false, "container not found", nil)
	}
	out, err := dockerexec.Exec(h.cfg.DockerBin, container, payload.Command)
	if err != nil {
		return response(msg.ID, false, err.Error(), nil)
	}
	return response(msg.ID, true, out, nil)
}

func (h *Handlers) handleStats(msg protocol.Message) protocol.Message {
	var payload struct {
		ServerID string `json:"serverId"`
	}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return response(msg.ID, false, "bad payload", nil)
	}
	container := h.resolveContainer(payload.ServerID)
	if container == "" {
		return response(msg.ID, false, "container not found", nil)
	}
	data, err := stats.Get(h.cfg.DockerBin, container)
	if err != nil {
		return response(msg.ID, false, err.Error(), nil)
	}
	return response(msg.ID, true, "ok", data)
}

func (h *Handlers) handleLogs(msg protocol.Message) protocol.Message {
	var payload struct {
		ServerID string `json:"serverId"`
		Tail     int    `json:"tail"`
	}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return response(msg.ID, false, "bad payload", nil)
	}
	container := h.resolveContainer(payload.ServerID)
	if container == "" {
		return response(msg.ID, false, "container not found", nil)
	}
	data, err := dockerexec.Logs(h.cfg.DockerBin, container, payload.Tail)
	if err != nil {
		return response(msg.ID, false, err.Error(), nil)
	}
	return response(msg.ID, true, "ok", map[string]string{"logs": data})
}

func (h *Handlers) handleList(msg protocol.Message) protocol.Message {
	var payload struct {
		ServerID string `json:"serverId"`
		Path     string `json:"path"`
	}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return response(msg.ID, false, "bad payload", nil)
	}
	base := fsops.ResolveBase(h.cfg.FileRoot, h.cfg.VolumeMap, h.cfg.ContainerMap, payload.ServerID)
	items, err := fsops.List(base, payload.Path)
	if err != nil {
		return response(msg.ID, false, err.Error(), nil)
	}
	return response(msg.ID, true, "ok", items)
}

func (h *Handlers) handleRead(msg protocol.Message) protocol.Message {
	var payload struct {
		ServerID string `json:"serverId"`
		Path     string `json:"path"`
	}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return response(msg.ID, false, "bad payload", nil)
	}
	base := fsops.ResolveBase(h.cfg.FileRoot, h.cfg.VolumeMap, h.cfg.ContainerMap, payload.ServerID)
	content, err := fsops.Read(base, payload.Path)
	if err != nil {
		return response(msg.ID, false, err.Error(), nil)
	}
	return response(msg.ID, true, "ok", map[string]string{"content": content})
}

func (h *Handlers) handleWrite(msg protocol.Message) protocol.Message {
	var payload struct {
		ServerID string `json:"serverId"`
		Path     string `json:"path"`
		Content  string `json:"content"`
	}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return response(msg.ID, false, "bad payload", nil)
	}
	base := fsops.ResolveBase(h.cfg.FileRoot, h.cfg.VolumeMap, h.cfg.ContainerMap, payload.ServerID)
	if err := fsops.Write(base, payload.Path, payload.Content); err != nil {
		return response(msg.ID, false, err.Error(), nil)
	}
	return response(msg.ID, true, "ok", nil)
}

func (h *Handlers) handleMkdir(msg protocol.Message) protocol.Message {
	var payload struct {
		ServerID string `json:"serverId"`
		Root     string `json:"root"`
		Name     string `json:"name"`
	}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return response(msg.ID, false, "bad payload", nil)
	}
	base := fsops.ResolveBase(h.cfg.FileRoot, h.cfg.VolumeMap, h.cfg.ContainerMap, payload.ServerID)
	if err := fsops.Mkdir(base, payload.Root, payload.Name); err != nil {
		return response(msg.ID, false, err.Error(), nil)
	}
	return response(msg.ID, true, "ok", nil)
}

func (h *Handlers) handleDelete(msg protocol.Message) protocol.Message {
	var payload struct {
		ServerID string   `json:"serverId"`
		Root     string   `json:"root"`
		Files    []string `json:"files"`
	}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return response(msg.ID, false, "bad payload", nil)
	}
	base := fsops.ResolveBase(h.cfg.FileRoot, h.cfg.VolumeMap, h.cfg.ContainerMap, payload.ServerID)
	if err := fsops.Delete(base, payload.Root, payload.Files); err != nil {
		return response(msg.ID, false, err.Error(), nil)
	}
	return response(msg.ID, true, "ok", nil)
}

func (h *Handlers) handleRename(msg protocol.Message) protocol.Message {
	var payload struct {
		ServerID string `json:"serverId"`
		Root     string `json:"root"`
		From     string `json:"from"`
		To       string `json:"to"`
	}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return response(msg.ID, false, "bad payload", nil)
	}
	base := fsops.ResolveBase(h.cfg.FileRoot, h.cfg.VolumeMap, h.cfg.ContainerMap, payload.ServerID)
	if err := fsops.Rename(base, payload.Root, payload.From, payload.To); err != nil {
		return response(msg.ID, false, err.Error(), nil)
	}
	return response(msg.ID, true, "ok", nil)
}

func (h *Handlers) handleCopy(msg protocol.Message) protocol.Message {
	var payload struct {
		ServerID string `json:"serverId"`
		Location string `json:"location"`
	}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return response(msg.ID, false, "bad payload", nil)
	}
	base := fsops.ResolveBase(h.cfg.FileRoot, h.cfg.VolumeMap, h.cfg.ContainerMap, payload.ServerID)
	if err := fsops.Copy(base, payload.Location); err != nil {
		return response(msg.ID, false, err.Error(), nil)
	}
	return response(msg.ID, true, "ok", nil)
}

func (h *Handlers) handleCompress(msg protocol.Message) protocol.Message {
	var payload struct {
		ServerID string   `json:"serverId"`
		Root     string   `json:"root"`
		Files    []string `json:"files"`
	}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return response(msg.ID, false, "bad payload", nil)
	}
	base := fsops.ResolveBase(h.cfg.FileRoot, h.cfg.VolumeMap, h.cfg.ContainerMap, payload.ServerID)
	archive, err := fsops.Compress(base, payload.Root, payload.Files)
	if err != nil {
		return response(msg.ID, false, err.Error(), nil)
	}
	return response(msg.ID, true, "ok", map[string]string{"archive": archive})
}

func (h *Handlers) handleDecompress(msg protocol.Message) protocol.Message {
	var payload struct {
		ServerID string `json:"serverId"`
		Root     string `json:"root"`
		File     string `json:"file"`
	}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return response(msg.ID, false, "bad payload", nil)
	}
	base := fsops.ResolveBase(h.cfg.FileRoot, h.cfg.VolumeMap, h.cfg.ContainerMap, payload.ServerID)
	if err := fsops.Decompress(base, payload.Root, payload.File); err != nil {
		return response(msg.ID, false, err.Error(), nil)
	}
	return response(msg.ID, true, "ok", nil)
}

func (h *Handlers) handleUploadInit(msg protocol.Message) protocol.Message {
	var payload struct {
		ServerID string `json:"serverId"`
		Path     string `json:"path"`
		Size     int64  `json:"size"`
	}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return response(msg.ID, false, "bad payload", nil)
	}
	base := fsops.ResolveBase(h.cfg.FileRoot, h.cfg.VolumeMap, h.cfg.ContainerMap, payload.ServerID)
	uploadID := uuid.NewString()
	session, err := fsops.NewUpload(base, payload.Path, payload.Size)
	if err != nil {
		return response(msg.ID, false, err.Error(), nil)
	}
	h.uploads[uploadID] = session
	return response(msg.ID, true, "ok", map[string]string{"uploadId": uploadID})
}

func (h *Handlers) handleUploadChunk(msg protocol.Message) protocol.Message {
	var payload struct {
		UploadID string `json:"uploadId"`
		Index    int    `json:"index"`
		Data     string `json:"data"`
	}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return response(msg.ID, false, "bad payload", nil)
	}
	session := h.uploads[payload.UploadID]
	if session == nil {
		return response(msg.ID, false, "upload not found", nil)
	}
	bytes, err := base64.StdEncoding.DecodeString(payload.Data)
	if err != nil {
		return response(msg.ID, false, "invalid base64", nil)
	}
	if err := session.WriteChunk(payload.Index, bytes); err != nil {
		return response(msg.ID, false, err.Error(), nil)
	}
	return response(msg.ID, true, "ok", nil)
}

func (h *Handlers) handleUploadFinish(msg protocol.Message) protocol.Message {
	var payload struct {
		UploadID string `json:"uploadId"`
	}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return response(msg.ID, false, "bad payload", nil)
	}
	session := h.uploads[payload.UploadID]
	if session == nil {
		return response(msg.ID, false, "upload not found", nil)
	}
	if err := session.Commit(); err != nil {
		return response(msg.ID, false, err.Error(), nil)
	}
	delete(h.uploads, payload.UploadID)
	return response(msg.ID, true, "ok", nil)
}

func (h *Handlers) handleDownloadInit(msg protocol.Message) protocol.Message {
	var payload struct {
		ServerID string `json:"serverId"`
		Path     string `json:"path"`
	}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return response(msg.ID, false, "bad payload", nil)
	}
	base := fsops.ResolveBase(h.cfg.FileRoot, h.cfg.VolumeMap, h.cfg.ContainerMap, payload.ServerID)
	session, err := fsops.NewDownload(base, payload.Path)
	if err != nil {
		return response(msg.ID, false, err.Error(), nil)
	}
	return response(msg.ID, true, "ok", map[string]string{"downloadId": session.ID})
}

func (h *Handlers) handleDownloadChunk(msg protocol.Message) protocol.Message {
	var payload struct {
		DownloadID string `json:"downloadId"`
		Index      int    `json:"index"`
	}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return response(msg.ID, false, "bad payload", nil)
	}
	chunk, done, err := fsops.ReadChunk(payload.DownloadID, payload.Index)
	if err != nil {
		return response(msg.ID, false, err.Error(), nil)
	}
	data := base64.StdEncoding.EncodeToString(chunk)
	return response(msg.ID, true, "ok", map[string]interface{}{
		"data": data,
		"done": done,
	})
}

func (h *Handlers) isActionAllowed(action string) bool {
	if len(h.cfg.Security.AllowActions) == 0 {
		return true
	}
	for _, a := range h.cfg.Security.AllowActions {
		if a == action {
			return true
		}
	}
	return false
}

func (h *Handlers) isCommandAllowed(cmd string) bool {
	if len(h.cfg.Security.CommandAllowlist) == 0 {
		return true
	}
	for _, prefix := range h.cfg.Security.CommandAllowlist {
		if len(cmd) >= len(prefix) && cmd[:len(prefix)] == prefix {
			return true
		}
	}
	return false
}

func (h *Handlers) resolveContainer(serverId string) string {
	if v, ok := h.cfg.ContainerMap[serverId]; ok && v != "" {
		return v
	}
	if h.cfg.ContainerLabelKey == "" {
		return ""
	}
	return dockerexec.FindByLabel(h.cfg.DockerBin, h.cfg.ContainerLabelKey, serverId)
}

func response(id string, ok bool, msg string, data interface{}) protocol.Message {
	payload, _ := json.Marshal(protocol.ResponsePayload{Success: ok, Message: msg, Data: data})
	return protocol.Message{Type: "RES", ID: id, Payload: payload, Ts: time.Now().Unix()}
}
