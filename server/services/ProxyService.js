import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ProxyService {
    constructor() {
        this.proxyProcess = null;
        this.nodes = [];
        this.configPath = path.join(__dirname, '../data/proxy_config.json');
        this.binPath = process.platform === 'win32' ? 'sing-box.exe' : 'sing-box'; // Expecting sing-box in path or bin folder
        this.basePort = 20000;
        this.nodePortMap = new Map(); // nodeId -> localPort
    }

    setNodes(nodes) {
        this.nodes = nodes || [];
        this.updatePortMap();
    }

    updatePortMap() {
        this.nodePortMap.clear();
        this.nodes.forEach((node, index) => {
            this.nodePortMap.set(node.id, this.basePort + index);
        });
    }

    getLocalPort(nodeId) {
        return this.nodePortMap.get(nodeId);
    }

    generateConfig() {
        const inbounds = this.nodes.map((node, index) => ({
            type: 'socks',
            tag: `in-${node.id}`,
            listen: '127.0.0.1',
            listen_port: this.basePort + index
        }));

        const outbounds = this.nodes.map(node => {
            const outbound = {
                type: node.type,
                tag: `out-${node.id}`,
                server: node.server,
                server_port: node.port
            };

            // Add protocol specific fields
            if (node.password) outbound.password = node.password;
            if (node.uuid) outbound.uuid = node.uuid;
            if (node.sni) outbound.tls = { enabled: true, server_name: node.sni };

            // Handle Hysteria2 specific
            if (node.type === 'hysteria2') {
                outbound.password = node.password;
            }

            // Handle TUIC
            if (node.type === 'tuic') {
                outbound.uuid = node.uuid || node.password;
                outbound.password = node.password;
                outbound.congestion_control = 'bbr';
                if (!outbound.tls) outbound.tls = { enabled: true };
            }

            return outbound;
        });

        const routes = {
            rules: this.nodes.map(node => ({
                inbound: [`in-${node.id}`],
                outbound: `out-${node.id}`
            }))
        };

        return {
            log: { level: 'info' },
            inbounds,
            outbounds: [...outbounds, { type: 'direct', tag: 'direct' }],
            route: routes
        };
    }

    async start() {
        if (this.nodes.length === 0) {
            console.log('[ProxyService] No proxy nodes configured, skipping start.');
            return;
        }

        try {
            const config = this.generateConfig();
            const dataDir = path.dirname(this.configPath);
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));

            this.stop();

            console.log(`[ProxyService] Starting sing-box with ${this.nodes.length} nodes...`);

            // Try to find sing-box in several locations
            let execPath = this.binPath;
            const localBin = path.join(__dirname, '../bin', this.binPath);
            if (fs.existsSync(localBin)) {
                execPath = localBin;
            }

            this.proxyProcess = spawn(execPath, ['run', '-c', this.configPath]);

            this.proxyProcess.stdout.on('data', (data) => {
                // Silencing verbose logs unless debugging
                // console.log(`[Proxy] ${data}`);
            });

            this.proxyProcess.stderr.on('data', (data) => {
                console.error(`[Proxy Error] ${data}`);
            });

            this.proxyProcess.on('close', (code) => {
                if (code !== 0 && code !== null) {
                    console.error(`[ProxyService] sing-box exited with code ${code}`);
                }
            });

        } catch (err) {
            console.error('[ProxyService] Failed to start:', err.message);
        }
    }

    stop() {
        if (this.proxyProcess) {
            this.proxyProcess.kill();
            this.proxyProcess = null;
        }
    }

    async restart(nodes) {
        this.setNodes(nodes);
        await this.start();
    }
}

export const proxyService = new ProxyService();
