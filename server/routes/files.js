import express from 'express';

export function registerFileRoutes(app, {
  botManager,
  agentGateway,
  getAgentIdForBot
}) {
  // Set file access type for a bot
  app.post('/api/bots/:id/file-access-type', (req, res) => {
    try {
      const bot = botManager.bots.get(req.params.id);
      if (!bot) {
        return res.status(404).json({ success: false, error: 'Bot not found' });
      }
      const { type } = req.body;
      const result = bot.setFileAccessType(type);
      res.json(result);
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // Send console command via Pterodactyl panel
  app.post('/api/bots/:id/panel-command', async (req, res) => {
    try {
      const bot = botManager.bots.get(req.params.id);
      if (!bot) {
        return res.status(404).json({ success: false, error: 'Bot not found' });
      }
      const { command } = req.body;
      const agentId = getAgentIdForBot(bot);
      if (agentId) {
        const result = await agentGateway.request(agentId, 'COMMAND', { serverId: bot.id, command });
        const payload = result?.data || result;
        return res.json({ success: result.success !== false, message: payload?.message || result?.message || 'ok' });
      }
      const fallback = await bot.sendPanelCommand(command);
      res.json(fallback);
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // Send power signal via Pterodactyl panel (start/stop/restart/kill)
  app.post('/api/bots/:id/power', async (req, res) => {
    try {
      const bot = botManager.bots.get(req.params.id);
      if (!bot) {
        return res.status(404).json({ success: false, error: 'Bot not found' });
      }
      const { signal } = req.body;
      if (!signal) {
        return res.status(400).json({ success: false, error: '缺少 signal 参数 (start/stop/restart/kill)' });
      }
      const agentId = getAgentIdForBot(bot);
      if (agentId) {
        const actionMap = { start: 'START', stop: 'STOP', restart: 'RESTART', kill: 'KILL' };
        const action = actionMap[signal] || 'RESTART';
        const result = await agentGateway.request(agentId, action, { serverId: bot.id });
        return res.json({ success: result.success !== false, message: result.message || 'ok' });
      }
      const fallback = await bot.sendPowerSignal(signal);
      res.json(fallback);
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // ==================== 文件管理 API ====================

  app.get('/api/bots/:id/files', async (req, res) => {
    try {
      const bot = botManager.bots.get(req.params.id);
      if (!bot) {
        return res.status(404).json({ success: false, error: 'Bot not found' });
      }
      const directory = req.query.directory || '/';
      const agentId = getAgentIdForBot(bot);
      if (agentId) {
        try {
          const result = await agentGateway.request(agentId, 'LIST', { serverId: bot.id, path: directory });
          return res.json({ success: result.success !== false, files: result.data || [], directory, channel: 'agent' });
        } catch (error) {
          // fallback to configured file access type
        }
      }
      const fileAccessType = bot.status.fileAccessType || 'pterodactyl';

      let result;
      if (fileAccessType === 'sftp') {
        result = await bot.listFilesSftp(directory);
      } else {
        result = await bot.listFiles(directory);
      }
      res.json({ ...result, channel: fileAccessType === 'sftp' ? 'sftp' : 'pterodactyl' });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get('/api/bots/:id/files/contents', async (req, res) => {
    try {
      const bot = botManager.bots.get(req.params.id);
      if (!bot) {
        return res.status(404).json({ success: false, error: 'Bot not found' });
      }
      const file = req.query.file;
      if (!file) {
        return res.status(400).json({ success: false, error: '缺少 file 参数' });
      }
      const agentId = getAgentIdForBot(bot);
      if (agentId) {
        try {
          const result = await agentGateway.request(agentId, 'READ', { serverId: bot.id, path: file });
          return res.json({ success: result.success !== false, content: result.data?.content || '', channel: 'agent' });
        } catch (error) {
          // fallback to configured file access type
        }
      }
      const fileAccessType = bot.status.fileAccessType || 'pterodactyl';

      let result;
      if (fileAccessType === 'sftp') {
        result = await bot.getFileContentsSftp(file);
      } else {
        result = await bot.getFileContents(file);
      }
      res.json({ ...result, channel: fileAccessType === 'sftp' ? 'sftp' : 'pterodactyl' });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post('/api/bots/:id/files/write', express.text({ limit: '50mb' }), async (req, res) => {
    try {
      const bot = botManager.bots.get(req.params.id);
      if (!bot) {
        return res.status(404).json({ success: false, error: 'Bot not found' });
      }
      const file = req.query.file;
      if (!file) {
        return res.status(400).json({ success: false, error: '缺少 file 参数' });
      }
      const agentId = getAgentIdForBot(bot);
      if (agentId) {
        try {
          const result = await agentGateway.request(agentId, 'WRITE', { serverId: bot.id, path: file, content: req.body || '' });
          return res.json({ success: result.success !== false, message: result.message || 'ok', channel: 'agent' });
        } catch (error) {
          // fallback to configured file access type
        }
      }
      const fileAccessType = bot.status.fileAccessType || 'pterodactyl';

      let result;
      if (fileAccessType === 'sftp') {
        result = await bot.writeFileSftp(file, req.body);
      } else {
        result = await bot.writeFile(file, req.body);
      }
      res.json({ ...result, channel: fileAccessType === 'sftp' ? 'sftp' : 'pterodactyl' });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post('/api/bots/:id/files/chmod', async (req, res) => {
    try {
      const bot = botManager.bots.get(req.params.id);
      if (!bot) {
        return res.status(404).json({ success: false, error: 'Bot not found' });
      }
      const { path, mode } = req.body || {};
      if (!path || !mode) {
        return res.status(400).json({ success: false, error: '缺少 path 或 mode 参数' });
      }
      const agentId = getAgentIdForBot(bot);
      if (!agentId) {
        return res.status(400).json({ success: false, error: 'Agent not connected' });
      }
      const result = await agentGateway.request(agentId, 'CHMOD', { serverId: bot.id, path, mode });
      res.json({ success: result.success !== false, message: result.message || 'ok', channel: 'agent' });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get('/api/bots/:id/files/download', async (req, res) => {
    try {
      const bot = botManager.bots.get(req.params.id);
      if (!bot) {
        return res.status(404).json({ success: false, error: 'Bot not found' });
      }
      const file = req.query.file;
      if (!file) {
        return res.status(400).json({ success: false, error: '缺少 file 参数' });
      }
      const agentId = getAgentIdForBot(bot);
      if (agentId) {
        try {
          const init = await agentGateway.request(agentId, 'DOWNLOAD_INIT', { serverId: bot.id, path: file });
          const downloadId = init.data?.downloadId;
          if (!downloadId) {
            return res.status(400).json({ success: false, error: init.message || '下载失败' });
          }
          const fileName = file.split('/').pop();
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);

          let index = 0;
          while (true) {
            const chunk = await agentGateway.request(agentId, 'DOWNLOAD_CHUNK', { downloadId, index });
            const data = chunk.data?.data || '';
            if (data) {
              res.write(Buffer.from(data, 'base64'));
            }
            if (chunk.data?.done) break;
            index += 1;
          }
          res.end();
          return;
        } catch (error) {
          // fallback to configured file access type
        }
      }
      const fileAccessType = bot.status.fileAccessType || 'pterodactyl';

      if (fileAccessType === 'sftp') {
        const result = await bot.getFileDownloadSftp(file);
        if (!result.success) {
          return res.status(400).json(result);
        }
        const fileName = file.split('/').pop();
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        res.send(result.content);
      } else {
        const result = await bot.getDownloadUrl(file);
        res.json(result);
      }
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get('/api/bots/:id/files/upload', async (req, res) => {
    try {
      const bot = botManager.bots.get(req.params.id);
      if (!bot) {
        return res.status(404).json({ success: false, error: 'Bot not found' });
      }
      const agentId = getAgentIdForBot(bot);
      if (agentId) {
        return res.json({
          success: true,
          type: 'agent',
          endpoint: `/api/bots/${req.params.id}/files/upload-agent`
        });
      }
      const fileAccessType = bot.status.fileAccessType || 'pterodactyl';

      if (fileAccessType === 'sftp') {
        res.json({
          success: true,
          type: 'sftp',
          endpoint: `/api/bots/${req.params.id}/files/upload-sftp`
        });
      } else {
        const result = await bot.getUploadUrl();
        res.json(result);
      }
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post('/api/bots/:id/files/upload-agent', express.raw({ limit: '100mb', type: '*/*' }), async (req, res) => {
    try {
      const bot = botManager.bots.get(req.params.id);
      if (!bot) {
        return res.status(404).json({ success: false, error: 'Bot not found' });
      }
      const agentId = getAgentIdForBot(bot);
      if (!agentId) {
        return res.status(400).json({ success: false, error: 'Agent not connected' });
      }
      const directory = req.query.directory || '/';
      const fileName = req.query.name;
      if (!fileName) {
        return res.status(400).json({ success: false, error: '缺少 name 参数' });
      }
      const fullPath = directory === '/' ? `/${fileName}` : `${directory}/${fileName}`;
      const size = req.body?.length || 0;
      const init = await agentGateway.request(agentId, 'UPLOAD_INIT', { serverId: bot.id, path: fullPath, size });
      const uploadId = init.data?.uploadId;
      if (!uploadId) {
        return res.status(400).json({ success: false, error: init.message || '上传失败' });
      }
      const chunkSize = 256 * 1024;
      let index = 0;
      for (let offset = 0; offset < size; offset += chunkSize) {
        const slice = req.body.slice(offset, offset + chunkSize);
        await agentGateway.request(agentId, 'UPLOAD_CHUNK', {
          uploadId,
          index,
          data: slice.toString('base64')
        });
        index += 1;
      }
      await agentGateway.request(agentId, 'UPLOAD_FINISH', { uploadId });
      res.json({ success: true, message: '上传成功' });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post('/api/bots/:id/files/upload-sftp', express.raw({ limit: '100mb', type: '*/*' }), async (req, res) => {
    try {
      const bot = botManager.bots.get(req.params.id);
      if (!bot) {
        return res.status(404).json({ success: false, error: 'Bot not found' });
      }
      const directory = req.query.directory || '/';
      const fileName = req.query.name;
      if (!fileName) {
        return res.status(400).json({ success: false, error: '缺少 name 参数' });
      }
      const result = await bot.uploadFileSftp(directory, fileName, req.body);
      res.json(result);
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post('/api/bots/:id/files/folder', async (req, res) => {
    try {
      const bot = botManager.bots.get(req.params.id);
      if (!bot) {
        return res.status(404).json({ success: false, error: 'Bot not found' });
      }
      const { root, name } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, error: '缺少 name 参数' });
      }
      const agentId = getAgentIdForBot(bot);
      if (agentId) {
        try {
          const result = await agentGateway.request(agentId, 'MKDIR', { serverId: bot.id, root: root || '/', name });
          return res.json({ success: result.success !== false, message: result.message || 'ok', channel: 'agent' });
        } catch (error) {
          // fallback to configured file access type
        }
      }
      const fileAccessType = bot.status.fileAccessType || 'pterodactyl';

      let result;
      if (fileAccessType === 'sftp') {
        result = await bot.createFolderSftp(root || '/', name);
      } else {
        result = await bot.createFolder(root || '/', name);
      }
      res.json({ ...result, channel: fileAccessType === 'sftp' ? 'sftp' : 'pterodactyl' });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post('/api/bots/:id/files/delete', async (req, res) => {
    try {
      const bot = botManager.bots.get(req.params.id);
      if (!bot) {
        return res.status(404).json({ success: false, error: 'Bot not found' });
      }
      const { root, files } = req.body;
      if (!files || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ success: false, error: '缺少 files 参数' });
      }
      const agentId = getAgentIdForBot(bot);
      if (agentId) {
        try {
          const result = await agentGateway.request(agentId, 'DELETE', { serverId: bot.id, root: root || '/', files });
          return res.json({ success: result.success !== false, message: result.message || 'ok', channel: 'agent' });
        } catch (error) {
          // fallback to configured file access type
        }
      }
      const fileAccessType = bot.status.fileAccessType || 'pterodactyl';

      let result;
      if (fileAccessType === 'sftp') {
        result = await bot.deleteFilesSftp(root || '/', files);
      } else {
        result = await bot.deleteFiles(root || '/', files);
      }
      res.json({ ...result, channel: fileAccessType === 'sftp' ? 'sftp' : 'pterodactyl' });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post('/api/bots/:id/files/rename', async (req, res) => {
    try {
      const bot = botManager.bots.get(req.params.id);
      if (!bot) {
        return res.status(404).json({ success: false, error: 'Bot not found' });
      }
      const { root, from, to } = req.body;
      if (!from || !to) {
        return res.status(400).json({ success: false, error: '缺少 from 或 to 参数' });
      }
      const agentId = getAgentIdForBot(bot);
      if (agentId) {
        try {
          const result = await agentGateway.request(agentId, 'RENAME', { serverId: bot.id, root: root || '/', from, to });
          return res.json({ success: result.success !== false, message: result.message || 'ok', channel: 'agent' });
        } catch (error) {
          // fallback to configured file access type
        }
      }
      const fileAccessType = bot.status.fileAccessType || 'pterodactyl';

      let result;
      if (fileAccessType === 'sftp') {
        result = await bot.renameFileSftp(root || '/', from, to);
      } else {
        result = await bot.renameFile(root || '/', from, to);
      }
      res.json({ ...result, channel: fileAccessType === 'sftp' ? 'sftp' : 'pterodactyl' });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post('/api/bots/:id/files/copy', async (req, res) => {
    try {
      const bot = botManager.bots.get(req.params.id);
      if (!bot) {
        return res.status(404).json({ success: false, error: 'Bot not found' });
      }
      const { location } = req.body;
      if (!location) {
        return res.status(400).json({ success: false, error: '缺少 location 参数' });
      }
      const agentId = getAgentIdForBot(bot);
      if (agentId) {
        try {
          const result = await agentGateway.request(agentId, 'COPY', { serverId: bot.id, location });
          return res.json({ success: result.success !== false, message: result.message || 'ok', channel: 'agent' });
        } catch (error) {
          // fallback to configured file access type
        }
      }
      const fileAccessType = bot.status.fileAccessType || 'pterodactyl';

      let result;
      if (fileAccessType === 'sftp') {
        result = await bot.copyFileSftp(location);
      } else {
        result = await bot.copyFile(location);
      }
      res.json({ ...result, channel: fileAccessType === 'sftp' ? 'sftp' : 'pterodactyl' });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post('/api/bots/:id/files/compress', async (req, res) => {
    try {
      const bot = botManager.bots.get(req.params.id);
      if (!bot) {
        return res.status(404).json({ success: false, error: 'Bot not found' });
      }
      const { root, files } = req.body;
      if (!files || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ success: false, error: '缺少 files 参数' });
      }
      const agentId = getAgentIdForBot(bot);
      if (agentId) {
        try {
          const result = await agentGateway.request(agentId, 'COMPRESS', { serverId: bot.id, root: root || '/', files });
          return res.json({ success: result.success !== false, archive: result.data?.archive, message: result.message || 'ok', channel: 'agent' });
        } catch (error) {
          // fallback to configured file access type
        }
      }
      const fileAccessType = bot.status.fileAccessType || 'pterodactyl';

      if (fileAccessType === 'sftp') {
        return res.status(400).json({ success: false, error: 'SFTP 模式不支持压缩功能' });
      }
      const result = await bot.compressFiles(root || '/', files);
      res.json({ ...result, channel: 'pterodactyl' });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post('/api/bots/:id/files/decompress', async (req, res) => {
    try {
      const bot = botManager.bots.get(req.params.id);
      if (!bot) {
        return res.status(404).json({ success: false, error: 'Bot not found' });
      }
      const { root, file } = req.body;
      if (!file) {
        return res.status(400).json({ success: false, error: '缺少 file 参数' });
      }
      const agentId = getAgentIdForBot(bot);
      if (agentId) {
        try {
          const result = await agentGateway.request(agentId, 'DECOMPRESS', { serverId: bot.id, root: root || '/', file });
          return res.json({ success: result.success !== false, message: result.message || 'ok', channel: 'agent' });
        } catch (error) {
          // fallback to configured file access type
        }
      }
      const fileAccessType = bot.status.fileAccessType || 'pterodactyl';

      if (fileAccessType === 'sftp') {
        return res.status(400).json({ success: false, error: 'SFTP 模式不支持解压功能' });
      }
      const result = await bot.decompressFile(root || '/', file);
      res.json({ ...result, channel: 'pterodactyl' });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
}
