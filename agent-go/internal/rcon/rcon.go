package rcon

import (
	"fmt"

	grcon "github.com/gorcon/rcon"

	"minebot-agent/internal/config"
)

func Exec(cfg config.RconConfig, command string) (string, error) {
	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	conn, err := grcon.Dial(addr, cfg.Password)
	if err != nil {
		return "", err
	}
	defer conn.Close()

	resp, err := conn.Execute(command)
	if err != nil {
		return "", err
	}
	return resp, nil
}
