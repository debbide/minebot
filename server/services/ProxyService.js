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

            // Sanitize UUID (handle potential lingering URL-encoded colons or concatenated pass)
            if (node.uuid) {
                let uuid = node.uuid;
                if (uuid.includes('%3A') || uuid.includes(':')) {
                    uuid = decodeURIComponent(uuid).split(':')[0];
                }
                outbound.uuid = uuid;
            }

            // Protocol specific tuning
            if (node.type === 'vmess') {
                outbound.security = node.security || 'auto';
                outbound.alter_id = parseInt(node.alterId || 0);
            } else if (node.type === 'shadowsocks') {
                outbound.method = node.method || 'aes-256-gcm';
            } else if (node.type === 'vless') {
                // Highly recommended for VLESS over WS/TLS to prevent some 502/dropped connections
                outbound.packet_encoding = 'xudp';
            }

            // Handle Security (TLS / Reality)
            // VMess uses 'tls' property (boolean), others use 'security'='tls'
            const isTls = node.security === 'tls' || node.security === 'reality' || node.tls === true;

            if (isTls || node.sni) {
                outbound.tls = {
                    enabled: true,
                    // SNI logic: prefer sni, then wsHost (the domain), then fallback to server
                    server_name: node.sni || node.wsHost || node.server,
                    insecure: !!node.insecure
                };

                // Enable uTLS (Highly recommended for bypassing CDN/WAF blocks)
                // Default to chrome if not specified
                outbound.tls.utls = { enabled: true, fingerprint: node.fp || 'chrome' };

                // Force ALPN http/1.1 for WS nodes over TLS (Confirmed fix for Cloudflare 502)
                if (node.alpn) {
                    outbound.tls.alpn = Array.isArray(node.alpn) ? node.alpn : node.alpn.split(',');
                } else if (node.transport === 'ws') {
                    outbound.tls.alpn = ['http/1.1'];
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

            // Handle Transport (WS/GRPC)
            if (node.transport === 'ws') {
                outbound.transport = {
                    type: 'ws',
                    path: node.wsPath || '/',
                    headers: {}
                };

                // Host header logic: prefer wsHost, then sni, then fallback to server
                const hostHeader = node.wsHost || node.sni || node.server;
                if (hostHeader && !hostHeader.match(/^\d+\.\d+\.\d+\.\d+$/)) {
                    outbound.transport.headers['Host'] = hostHeader;
                }

                // Handle Early Data (0-RTT) - Crucial for Argo Tunnels
                if (outbound.transport.path.includes('ed=')) {
                    outbound.transport.max_early_data = 2048;
                    outbound.transport.early_data_header_name = 'Sec-WebSocket-Protocol';
                }
            } else if (node.transport === 'grpc') {
                outbound.transport = {
                    type: 'grpc',
                    service_name: node.serviceName || ''
                };
            }

            // Handle VLESS Flow
            if (node.type === 'vless' && node.flow) {
                outbound.flow = node.flow;
            }

            // Handle Hysteria2 specific
            if (node.type === 'hysteria2') {
                outbound.password = node.password;
                if (node.obfs) {
                    outbound.obfs = {
                        type: node.obfs,
                        password: node.obfs_password || ''
                    };
                }
            }

            // Handle TUIC
            if (node.type === 'tuic') {
                outbound.uuid = node.uuid;
                outbound.password = node.password;
                outbound.congestion_control = node.congestion_control || 'bbr';
                outbound.udp_relay_mode = node.udp_relay_mode || 'quic-rfc';

                // TUIC expects TLS with specific settings from Python script
                if (!outbound.tls) {
                    outbound.tls = {
                        enabled: true,
                        server_name: node.sni || node.server,
                        insecure: !!node.insecure
                    };
                    if (node.alpn) outbound.tls.alpn = Array.isArray(node.alpn) ? node.alpn : [node.alpn];
                }

                // Disable uTLS for TUIC
                if (outbound.tls && outbound.tls.utls) delete outbound.tls.utls;
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

            // Log masked config for debugging (hide passwords/uuids)
            const maskedConfig = JSON.parse(JSON.stringify(config));
            maskedConfig.outbounds?.forEach(o => {
                if (o.password) o.password = '***';
                if (o.uuid) o.uuid = '***';
                if (o.tls?.reality?.public_key) o.tls.reality.public_key = '***';
            });
            console.log('[ProxyService] Generated config:', JSON.stringify(maskedConfig, null, 2));

            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));

            this.stop();

            // Verify sing-box version/availability before starting
            try {
                const { execSync } = await import('child_process');
                const versionInfo = execSync(`${this.binPath} version`).toString();
                console.log(`[ProxyService] sing-box environment OK: ${versionInfo.split('\n')[0]}`);
            } catch (vErr) {
                console.warn(`[ProxyService] Warning: Could not verify sing-box version: ${vErr.message}`);
            }

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

            this.proxyProcess.on('error', (err) => {
                console.error(`[ProxyService] Failed to start sing-box process:`, err.message);
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
    // Refactored based on robust python implementation
    parseProxyLink(link) {
        try {
            link = link.trim();
            // Handle JSON config directly if pasted
            if (link.startsWith('{') && link.endsWith('}')) {
                // Not supported in this UI flow yet, but good to have constraint
                return null;
            }

            // Handle VMess (Base64/JSON)
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
                    security: json.scy || 'auto',
                    alterId: parseInt(json.aid || 0),
                    transport: json.net === 'ws' ? 'ws' : (json.net === 'grpc' ? 'grpc' : 'tcp'),
                    wsPath: json.path || '',
                    wsHost: json.host || '',
                    tls: json.tls === 'tls',
                    sni: json.sni || json.host || ''
                };
            }

            const url = new URL(link);
            const protocol = url.protocol.slice(0, -1).toLowerCase();
            const nodeId = Math.random().toString(36).substring(2, 9);
            const name = decodeURIComponent(url.hash.slice(1)) || `${protocol}_${nodeId}`;
            const params = new URLSearchParams(url.search);

            let config = {
                id: nodeId,
                name: name,
                type: protocol,
                server: url.hostname,
                port: parseInt(url.port)
            };

            // Fix missing port (NaN) for non-vmess links
            if (isNaN(config.port)) {
                config.port = (params.get('security') === 'tls' || params.get('tls') === '1') ? 443 : 80;
            }

            // Common TLS/Network params
            if (params.get('sni')) config.sni = params.get('sni');
            if (params.get('security')) config.security = params.get('security');
            if (params.get('tls') === 'tls' || params.get('tls') === '1' || params.get('tls') === 'true') config.tls = true;
            if (params.get('alpn')) config.alpn = params.get('alpn');
            if (params.get('path')) config.wsPath = params.get('path');

            // Host/wsHost mapping
            config.wsHost = params.get('host') || params.get('wsHost') || '';

            // Transport type (net, type, transport)
            config.transport = params.get('type') || params.get('transport') || params.get('net') || 'tcp';

            if (params.get('serviceName')) config.serviceName = params.get('serviceName'); // grpc
            if (params.get('fp')) config.fp = params.get('fp');
            if (params.get('pbk')) config.pbk = params.get('pbk');
            if (params.get('sid')) config.sid = params.get('sid');
            if (params.get('spx')) config.spx = params.get('spx');
            if (params.get('flow')) config.flow = params.get('flow');

            // Insecure flag (allowInsecure)
            if (params.get('insecure') === '1' || params.get('insecure') === 'true') {
                config.insecure = true;
            }

            // User Info Decoding
            const rawUser = decodeURIComponent(url.username || '');
            const rawPass = decodeURIComponent(url.password || '');

            if (protocol === 'tuic') {
                // tuic://uuid:password@host:port (Standard) OR tuic://uuid:password@host (No separate pass in URL)
                if (rawUser.includes(':')) {
                    const [uuid, password] = rawUser.split(':', 2);
                    config.uuid = uuid;
                    config.password = password;
                } else {
                    config.uuid = rawUser;
                    config.password = rawPass;
                }
                config.congestion_control = params.get('congestion_control') || 'bbr';
                config.udp_relay_mode = params.get('udp_relay_mode') || 'quic-rfc';
                config.alpn = params.get('alpn') || undefined;

            } else if (protocol === 'hysteria2' || protocol === 'hy2') {
                config.type = 'hysteria2';
                config.password = rawUser || rawPass; // hy2 usually puts auth in username
                config.obfs = params.get('obfs');
                config.obfs_password = params.get('obfs-password');

            } else if (protocol === 'vless') {
                config.uuid = rawUser || rawPass; // vless usually puts uuid in username part

            } else if (protocol === 'trojan') {
                config.password = rawUser;

            } else if (protocol === 'ss' || protocol === 'shadowsocks') {
                config.type = 'shadowsocks';
                // ss://base64(method:password)@host:port
                // Sometimes it is ss://method:password@host:port
                if (rawUser && !rawPass && !rawUser.includes(':')) {
                    // Start with assumption it's base64
                    try {
                        const decoded = Buffer.from(rawUser, 'base64').toString('utf-8');
                        if (decoded.includes(':')) {
                            const [m, p] = decoded.split(':', 2);
                            config.method = m;
                            config.password = p;
                        } else {
                            // Fallback, maybe just method? Unlikely.
                            config.method = rawUser;
                        }
                    } catch (e) {
                        config.method = rawUser;
                    }
                } else {
                    // Standard method:password
                    config.method = rawUser;
                    config.password = rawPass;
                }
                // Handle params for plugin/obfs if needed (not in python script but good to keep in mind)

            } else if (protocol === 'socks5' || protocol === 'socks') {
                config.type = 'socks';
                config.username = rawUser;
                config.password = rawPass;
            } else if (protocol === 'http') {
                config.username = rawUser;
                config.password = rawPass;
            } else {
                console.warn('[ProxyService] Unknown protocol:', protocol);
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
            // Use socks5h to ensure DNS resolution also goes through the proxy
            const agent = new SocksProxyAgent(`socks5h://127.0.0.1:${localPort}`);
            // Use a small, reliable resource to test
            // proxy: false is critical to prevent axios from using global env proxies
            await axios.get('http://cp.cloudflare.com/generate_204', {
                httpAgent: agent,
                httpsAgent: agent,
                timeout: 5000,
                proxy: false
            });
            return Date.now() - startTime;
        } catch (e) {
            // Detailed error for debugging failed tests
            const reason = e.response ? `HTTP ${e.response.status}` : e.message;
            console.error(`[ProxyService] Test failed for ${nodeId} on port ${localPort}:`, reason);
            // Throw the reason so the API can catch it or return it
            throw new Error(reason);
        }
    }
}

export const proxyService = new ProxyService();
