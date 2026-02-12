import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';

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

            // Protocol specific tuning
            if (node.type === 'vmess') {
                outbound.security = 'auto';
            } else if (node.type === 'shadowsocks') {
                outbound.method = node.method || 'aes-256-gcm';
            }

            // Handle Security (TLS / Reality)
            if (node.security === 'tls' || node.security === 'reality' || node.sni) {
                outbound.tls = {
                    enabled: true,
                    server_name: node.sni || node.server,
                    utls: { enabled: true, fingerprint: node.fp || 'chrome' }
                };

                if (node.alpn) {
                    outbound.tls.alpn = node.alpn.split(',').map(s => s.trim());
                }

                if (node.security === 'reality') {
                    outbound.tls.reality = {
                        enabled: true,
                        public_key: node.pbk,
                        short_id: node.sid
                    };
                    if (node.spx) outbound.tls.reality.spider_x = node.spx;
                }
            }

            // Handle Transport (WS)
            if (node.transport === 'ws') {
                outbound.transport = {
                    type: 'ws',
                    path: node.wsPath || '/',
                    headers: {
                        'Host': node.wsHost || node.server
                    }
                };
            }

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

    // Parse proxy links (vless, vmess, ss, trojan, tuic, hysteria2)
    parseProxyLink(link) {
        try {
            if (link.startsWith('vmess://')) {
                const b64 = link.replace('vmess://', '');
                const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
                return {
                    id: Math.random().toString(36).substring(2, 9),
                    name: json.ps || 'VMess',
                    type: 'vmess',
                    server: json.add,
                    port: parseInt(json.port),
                    uuid: json.id,
                    transport: json.net === 'ws' ? 'ws' : 'tcp',
                    wsPath: json.path || '',
                    wsHost: json.host || '',
                    security: json.tls === 'tls' ? 'tls' : 'none',
                    sni: json.sni || json.host || ''
                };
            }

            const url = new URL(link);
            const protocol = url.protocol.slice(0, -1);
            const nodeId = Math.random().toString(36).substring(2, 9);
            const name = decodeURIComponent(url.hash.slice(1)) || `${protocol}_${nodeId}`;

            let config = {
                id: nodeId,
                name: name,
                type: protocol,
                server: url.hostname,
                port: parseInt(url.port)
            };

            const params = new URLSearchParams(url.search);

            // Common params
            if (params.get('sni')) config.sni = params.get('sni');
            if (params.get('security')) config.security = params.get('security');
            if (params.get('type')) config.transport = params.get('type');
            if (params.get('path')) config.wsPath = params.get('path');
            if (params.get('host')) config.wsHost = params.get('host');
            if (params.get('fp')) config.fp = params.get('fp');
            if (params.get('pbk')) config.pbk = params.get('pbk');
            if (params.get('sid')) config.sid = params.get('sid');
            if (params.get('spx')) config.spx = params.get('spx');

            if (protocol === 'vless') {
                config.uuid = url.username;
            } else if (protocol === 'trojan') {
                config.password = url.username;
            } else if (protocol === 'ss') {
                // ss://base64(method:password)@host:port
                let auth = url.username;
                try {
                    auth = Buffer.from(auth, 'base64').toString('utf-8');
                } catch (e) { }
                const [method, password] = auth.split(':');
                config.type = 'shadowsocks';
                config.password = password;
                // sing-box shadowsocks needs method, we might need to store it
                config.method = method;
            } else if (protocol === 'tuic' || protocol === 'hysteria2') {
                config.password = url.username;
            } else if (protocol === 'socks' || protocol === 'http') {
                // Base handled
            } else {
                return null;
            }

            return config;
        } catch (e) {
            console.error('[ProxyService] Link parse error:', e.message);
            return null;
        }
    }

    // Sync from subscription URL (Base64 list)
    async syncSubscription(url) {
        try {
            const response = await axios.get(url);
            let content = response.data;
            try {
                content = Buffer.from(content, 'base64').toString('utf-8');
            } catch (e) {
                // Not base64 encoded, use raw
            }

            const links = content.split('\n').filter(l => l.trim());
            const nodes = links.map(l => this.parseProxyLink(l.trim())).filter(Boolean);
            return nodes;
        } catch (e) {
            console.error('[ProxyService] Subscription sync error:', e.message);
            throw e;
        }
    }

    // Test connectivity and latency
    async testNode(nodeId) {
        const localPort = this.getLocalPort(nodeId);
        if (!localPort) throw new Error('Node not active in bridge');

        const startTime = Date.now();
        try {
            const agent = new SocksProxyAgent(`socks5://127.0.0.1:${localPort}`);
            // Use a small, reliable resource to test
            await axios.get('http://cp.cloudflare.com/generate_204', {
                httpAgent: agent,
                httpsAgent: agent,
                timeout: 5000
            });
            return Date.now() - startTime;
        } catch (e) {
            console.error(`[ProxyService] Test failed for ${nodeId}:`, e.message);
            return -1; // Indicates failure
        }
    }
}

export const proxyService = new ProxyService();
