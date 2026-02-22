package dockerexec

import (
	"bytes"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

func Power(dockerBin, op, container string) error {
	cmd := exec.Command(dockerBin, op, container)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("docker %s failed: %s", op, strings.TrimSpace(string(out)))
	}
	return nil
}

func Exec(dockerBin, container, command string) (string, error) {
	cmd := exec.Command(dockerBin, "exec", container, "sh", "-lc", command)
	var out bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("exec failed: %s", strings.TrimSpace(stderr.String()))
	}
	return strings.TrimSpace(out.String()), nil
}

func Logs(dockerBin, container string, tail int) (string, error) {
	tailArg := strconv.Itoa(tail)
	cmd := exec.Command(dockerBin, "logs", "--tail", tailArg, container)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("logs failed: %s", strings.TrimSpace(string(out)))
	}
	return string(out), nil
}

func FindByLabel(dockerBin, labelKey, labelValue string) string {
	filter := fmt.Sprintf("label=%s=%s", labelKey, labelValue)
	cmd := exec.Command(dockerBin, "ps", "--filter", filter, "--format", "{{.ID}}")
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) == 0 {
		return ""
	}
	return strings.TrimSpace(lines[0])
}
