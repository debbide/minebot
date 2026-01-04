/**
 * Cloudflare Worker 代理脚本
 * 用于中转续期请求，绕过某些网站的 IP 限制或反爬虫检测
 *
 * 部署步骤：
 * 1. 登录 Cloudflare Dashboard: https://dash.cloudflare.com
 * 2. 进入 Workers & Pages
 * 3. 点击 Create application -> Create Worker
 * 4. 将此脚本内容粘贴到编辑器中
 * 5. 点击 Save and Deploy
 * 6. 复制生成的 Worker URL (如: https://your-worker.workers.dev)
 * 7. 在续期配置中启用 CF 代理并填入该 URL
 *
 * 使用方式：
 * - URL 参数模式: https://your-worker.workers.dev/?url=目标URL
 * - 请求头模式: 设置 X-Target-URL 请求头
 */

export default {
  async fetch(request, env, ctx) {
    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    try {
      const url = new URL(request.url);

      // 支持两种方式获取目标 URL
      // 1. URL 参数: ?url=https://example.com
      // 2. 请求头: X-Target-URL
      let targetUrl = url.searchParams.get('url') || request.headers.get('X-Target-URL');
      const targetMethod = request.headers.get('X-Target-Method') || 'GET';
      const targetHeadersJson = request.headers.get('X-Target-Headers');

      if (!targetUrl) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Missing target URL. Use ?url= parameter or X-Target-URL header',
          usage: {
            urlParam: 'https://your-worker.workers.dev/?url=https://example.com',
            header: 'Set X-Target-URL header'
          }
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      // 解析目标请求头
      let targetHeaders = {};
      if (targetHeadersJson) {
        try {
          targetHeaders = JSON.parse(targetHeadersJson);
        } catch (e) {
          // 忽略解析错误
        }
      }

      // 构建转发请求的请求头
      const forwardHeaders = new Headers({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': new URL(targetUrl).origin + '/',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      });

      // 添加自定义请求头（覆盖默认值）
      for (const [key, value] of Object.entries(targetHeaders)) {
        forwardHeaders.set(key, String(value));
      }

      // 构建请求选项
      const fetchOptions = {
        method: targetMethod,
        headers: forwardHeaders,
        redirect: 'follow',
      };

      // 如果是 POST 请求，转发请求体
      if (targetMethod === 'POST') {
        try {
          const body = await request.text();
          if (body) {
            fetchOptions.body = body;
          }
        } catch (e) {
          // 忽略读取请求体错误
        }
      }

      // 发起请求
      const response = await fetch(targetUrl, fetchOptions);

      // 读取响应
      const responseText = await response.text();

      // 返回结果
      return new Response(responseText, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          'Content-Type': response.headers.get('Content-Type') || 'text/html',
          'Access-Control-Allow-Origin': '*',
          'X-Proxy-Status': 'success',
          'X-Original-Status': response.status.toString(),
        },
      });

    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: error.message || 'Unknown error',
        target: request.headers.get('X-Target-URL') || 'unknown',
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};
