package stats

import (
	"bytes"
	"fmt"
	"os/exec"
	"strings"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/load"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
	"github.com/shirou/gopsutil/v3/process"
)

type ContainerStats struct {
	Status string `json:"status"`
	CPU    string `json:"cpu"`
	Memory string `json:"memory"`
}

type HostStats struct {
	Hostname    string  `json:"hostname"`
	Uptime      uint64  `json:"uptime"`
	Load1       float64 `json:"load1"`
	Load5       float64 `json:"load5"`
	Load15      float64 `json:"load15"`
	CPU         float64 `json:"cpu"`
	MemTotal    uint64  `json:"memTotal"`
	MemUsed     uint64  `json:"memUsed"`
	MemUsedPct  float64 `json:"memUsedPct"`
	DiskTotal   uint64  `json:"diskTotal"`
	DiskUsed    uint64  `json:"diskUsed"`
	DiskUsedPct float64 `json:"diskUsedPct"`
	NetRx       uint64  `json:"netRx"`
	NetTx       uint64  `json:"netTx"`
}

type ProcessInfo struct {
	PID  int32   `json:"pid"`
	Name string  `json:"name"`
	CPU  float64 `json:"cpu"`
	Mem  float32 `json:"mem"`
}

func Get(dockerBin, container string) (*ContainerStats, error) {
	status, err := inspectStatus(dockerBin, container)
	if err != nil {
		return nil, err
	}
	cpu, mem := statsSnapshot(dockerBin, container)
	return &ContainerStats{Status: status, CPU: cpu, Memory: mem}, nil
}

func GetHost(fileRoot string) (*HostStats, error) {
	h, _ := host.Info()
	loadAvg, _ := load.Avg()
	cpuPercent, _ := cpu.Percent(0, false)
	memInfo, _ := mem.VirtualMemory()

	diskPath := fileRoot
	if diskPath == "" {
		diskPath = "/"
	}
	diskInfo, _ := disk.Usage(diskPath)

	ioCounters, _ := net.IOCounters(false)
	var rx, tx uint64
	if len(ioCounters) > 0 {
		rx = ioCounters[0].BytesRecv
		tx = ioCounters[0].BytesSent
	}

	cpuVal := 0.0
	if len(cpuPercent) > 0 {
		cpuVal = cpuPercent[0]
	}

	hostname := ""
	uptime := uint64(0)
	if h != nil {
		hostname = h.Hostname
		uptime = h.Uptime
	}

	load1, load5, load15 := 0.0, 0.0, 0.0
	if loadAvg != nil {
		load1 = loadAvg.Load1
		load5 = loadAvg.Load5
		load15 = loadAvg.Load15
	}

	memTotal, memUsed := uint64(0), uint64(0)
	memUsedPct := 0.0
	if memInfo != nil {
		memTotal = memInfo.Total
		memUsed = memInfo.Used
		memUsedPct = memInfo.UsedPercent
	}

	diskTotal, diskUsed := uint64(0), uint64(0)
	diskUsedPct := 0.0
	if diskInfo != nil {
		diskTotal = diskInfo.Total
		diskUsed = diskInfo.Used
		diskUsedPct = diskInfo.UsedPercent
	}

	return &HostStats{
		Hostname:    hostname,
		Uptime:      uptime,
		Load1:       load1,
		Load5:       load5,
		Load15:      load15,
		CPU:         cpuVal,
		MemTotal:    memTotal,
		MemUsed:     memUsed,
		MemUsedPct:  memUsedPct,
		DiskTotal:   diskTotal,
		DiskUsed:    diskUsed,
		DiskUsedPct: diskUsedPct,
		NetRx:       rx,
		NetTx:       tx,
	}, nil
}

func GetProcesses(limit int) ([]ProcessInfo, error) {
	plist, err := process.Processes()
	if err != nil {
		return nil, err
	}
	result := make([]ProcessInfo, 0, limit)
	for _, p := range plist {
		name, _ := p.Name()
		cpuVal, _ := p.CPUPercent()
		memVal, _ := p.MemoryPercent()
		result = append(result, ProcessInfo{
			PID:  p.Pid,
			Name: name,
			CPU:  cpuVal,
			Mem:  memVal,
		})
		if len(result) >= limit {
			break
		}
	}
	return result, nil
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
