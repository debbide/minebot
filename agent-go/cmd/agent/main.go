package main

import (
	"flag"
	"log"

	"minebot-agent/internal/config"
	"minebot-agent/internal/ws"
)

func main() {
	cfgPath := flag.String("config", "config.yaml", "config file path")
	flag.Parse()

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		log.Fatalf("load config failed: %v", err)
	}

	client := ws.NewClient(cfg)
	if err := client.Connect(); err != nil {
		log.Fatalf("connect failed: %v", err)
	}

	client.Run()
}
