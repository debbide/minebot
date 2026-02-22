package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	AgentID           string            `yaml:"agentId"`
	Token             string            `yaml:"token"`
	WSURL             string            `yaml:"wsUrl"`
	DockerBin         string            `yaml:"dockerBin"`
	ContainerLabelKey string            `yaml:"containerLabelKey"`
	ContainerMap      map[string]string `yaml:"containerMap"`
	VolumeMap         map[string]string `yaml:"volumeMap"`
	FileRoot          string            `yaml:"fileRoot"`
	Rcon              RconConfig        `yaml:"rcon"`
	Security          SecurityConfig    `yaml:"security"`
}

type RconConfig struct {
	Enabled  bool   `yaml:"enabled"`
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	Password string `yaml:"password"`
}

type SecurityConfig struct {
	AllowActions     []string `yaml:"allowActions"`
	CommandAllowlist []string `yaml:"commandAllowlist"`
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}

	if cfg.DockerBin == "" {
		cfg.DockerBin = "docker"
	}
	if cfg.ContainerMap == nil {
		cfg.ContainerMap = map[string]string{}
	}
	if cfg.VolumeMap == nil {
		cfg.VolumeMap = map[string]string{}
	}
	if cfg.FileRoot == "" {
		cfg.FileRoot = "/"
	}

	return &cfg, nil
}
