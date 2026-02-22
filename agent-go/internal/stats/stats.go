package stats

import (
	"bytes"
	"fmt"
	"os/exec"
	"strings"
)

type ContainerStats struct {
	Status string `json:"status"`
	CPU    string `json:"cpu"`
	Memory string `json:"memory"`
}

func Get(dockerBin, container string) (*ContainerStats, error) {
	status, err := inspectStatus(dockerBin, container)
	if err != nil {
		return nil, err
	}
	cpu, mem := statsSnapshot(dockerBin, container)
	return &ContainerStats{Status: status, CPU: cpu, Memory: mem}, nil
}

func inspectStatus(dockerBin, container string) (string, error) {
	cmd := exec.Command(dockerBin, "inspect", "-f", "{{.State.Status}}", container)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "unknown", fmt.Errorf("inspect failed: %s", strings.TrimSpace(string(out)))
	}
	return strings.TrimSpace(string(out)), nil
}

func statsSnapshot(dockerBin, container string) (string, string) {
	cmd := exec.Command(dockerBin, "stats", "--no-stream", "--format", "{{.CPUPerc}}|{{.MemUsage}}", container)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return "", ""
	}
	parts := strings.Split(strings.TrimSpace(out.String()), "|")
	if len(parts) != 2 {
		return "", ""
	}
	return parts[0], parts[1]
}
