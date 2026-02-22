import { useState, useEffect, useCallback } from "react";
import {
  Folder,
  File,
  FileText,
  FileCode,
  FileArchive,
  Image,
  ChevronRight,
  ChevronLeft,
  Home,
  RefreshCw,
  Upload,
  FolderPlus,
  Trash2,
  Download,
  Edit3,
  Copy,
  Archive,
  Loader2,
  X,
  Save,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { api, FileInfo } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { formatSize } from "@/lib/utils";

interface FileManagerProps {
  serverId: string;
  serverName: string;
  onClose?: () => void;
  compact?: boolean; // 标签页模式，不显示头部
}

export function FileManager({ serverId, serverName, onClose, compact = false }: FileManagerProps) {
  const [currentPath, setCurrentPath] = useState("/");
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [pathHistory, setPathHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // 对话框状态
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<FileInfo | null>(null);
  const [newName, setNewName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { toast } = useToast();

  // 加载文件列表
  const loadFiles = useCallback(async (path: string = currentPath) => {
    setLoading(true);
    try {
      const result = await api.listFiles(serverId, path);
      if (result.success && result.files) {
        // 排序：文件夹在前，文件在后，按名称排序
        const sorted = [...result.files].sort((a, b) => {
          if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
          return a.name.localeCompare(b.name);
        });
        setFiles(sorted);
        setSelectedFiles(new Set());
      } else {
        toast({
          title: "加载失败",
          description: result.error || "无法加载文件列表",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "加载失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [serverId, currentPath, toast]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // 导航到目录
  const navigateTo = (path: string) => {
    const newHistory = [...pathHistory.slice(0, historyIndex + 1), path];
    setPathHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setCurrentPath(path);
    loadFiles(path);
  };

  // 后退
  const goBack = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setCurrentPath(pathHistory[newIndex]);
      loadFiles(pathHistory[newIndex]);
    }
  };

  // 前进
  const goForward = () => {
    if (historyIndex < pathHistory.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setCurrentPath(pathHistory[newIndex]);
      loadFiles(pathHistory[newIndex]);
    }
  };

  // 进入文件夹
  const enterFolder = (name: string) => {
    const newPath = currentPath === "/" ? `/${name}` : `${currentPath}/${name}`;
    navigateTo(newPath);
  };

  // 返回上级目录
  const goUp = () => {
    if (currentPath === "/") return;
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    const newPath = parts.length === 0 ? "/" : `/${parts.join("/")}`;
    navigateTo(newPath);
  };

  // 选择文件
  const toggleSelect = (name: string) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(name)) {
      newSelected.delete(name);
    } else {
      newSelected.add(name);
    }
    setSelectedFiles(newSelected);
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map((f) => f.name)));
    }
  };

  // 获取文件图标
  const getFileIcon = (file: FileInfo) => {
    if (!file.isFile) return <Folder className="h-5 w-5 text-yellow-500" />;

    const ext = file.name.split(".").pop()?.toLowerCase();
    const codeExts = ["js", "ts", "jsx", "tsx", "json", "yml", "yaml", "xml", "html", "css", "java", "py", "sh", "properties", "toml"];
    const archiveExts = ["zip", "tar", "gz", "rar", "7z", "jar"];
    const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"];

    if (ext && codeExts.includes(ext)) return <FileCode className="h-5 w-5 text-blue-500" />;
    if (ext && archiveExts.includes(ext)) return <FileArchive className="h-5 w-5 text-orange-500" />;
    if (ext && imageExts.includes(ext)) return <Image className="h-5 w-5 text-green-500" />;
    if (file.isEditable) return <FileText className="h-5 w-5 text-gray-500" />;
    return <File className="h-5 w-5 text-gray-400" />;
  };


  // 格式化时间
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // 创建文件夹
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const result = await api.createFolder(serverId, currentPath, newFolderName);
      if (result.success) {
        toast({ title: "创建成功", description: `文件夹 "${newFolderName}" 已创建`, variant: "success" });
        loadFiles();
      } else {
        toast({ title: "创建失败", description: result.error, variant: "destructive" });
      }
    } catch (error) {
      toast({
        title: "创建失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
    } finally {
      setNewFolderOpen(false);
      setNewFolderName("");
    }
  };

  // 删除文件
  const handleDelete = async () => {
    if (selectedFiles.size === 0) return;
    try {
      const result = await api.deleteFiles(serverId, currentPath, Array.from(selectedFiles));
      if (result.success) {
        toast({ title: "删除成功", description: result.message, variant: "success" });
        loadFiles();
      } else {
        toast({ title: "删除失败", description: result.error, variant: "destructive" });
      }
    } catch (error) {
      toast({
        title: "删除失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
    } finally {
      setDeleteOpen(false);
      setSelectedFiles(new Set());
    }
  };

  // 重命名
  const handleRename = async () => {
    if (!renameTarget || !newName.trim()) return;
    try {
      const result = await api.renameFile(serverId, currentPath, renameTarget.name, newName);
      if (result.success) {
        toast({ title: "重命名成功", variant: "success" });
        loadFiles();
      } else {
        toast({ title: "重命名失败", description: result.error, variant: "destructive" });
      }
    } catch (error) {
      toast({
        title: "重命名失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
    } finally {
      setRenameOpen(false);
      setRenameTarget(null);
      setNewName("");
    }
  };

  // 下载文件
  const handleDownload = async (file: FileInfo) => {
    try {
      const filePath = currentPath === "/" ? `/${file.name}` : `${currentPath}/${file.name}`;

      // 先检查文件访问类型
      const uploadInfo = await api.getUploadUrl(serverId);

        if (uploadInfo.type === 'sftp' || uploadInfo.type === 'agent') {
        // SFTP 模式：直接下载
        const token = localStorage.getItem('token');
        const downloadUrl = `/api/bots/${serverId}/files/download?file=${encodeURIComponent(filePath)}`;
        const response = await fetch(downloadUrl, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: '下载失败' }));
          throw new Error(error.error || '下载失败');
        }

        // 创建下载链接
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        // 翼龙面板模式：获取下载 URL
        const result = await api.getDownloadUrl(serverId, filePath);
        if (result.success && result.url) {
          window.open(result.url, "_blank");
        } else {
          toast({ title: "下载失败", description: result.error, variant: "destructive" });
        }
      }
    } catch (error) {
      toast({
        title: "下载失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
    }
  };

  // 编辑文件
  const handleEdit = async (file: FileInfo) => {
    const filePath = currentPath === "/" ? `/${file.name}` : `${currentPath}/${file.name}`;
    setEditingFile(filePath);
    setEditorOpen(true);
    setLoading(true);

    try {
      const result = await api.getFileContents(serverId, filePath);
      if (result.success && result.content !== undefined) {
        setFileContent(result.content);
        setOriginalContent(result.content);
      } else {
        toast({ title: "读取失败", description: result.error, variant: "destructive" });
        setEditorOpen(false);
      }
    } catch (error) {
      toast({
        title: "读取失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
      setEditorOpen(false);
    } finally {
      setLoading(false);
    }
  };

  // 保存文件
  const handleSave = async () => {
    if (!editingFile) return;
    setSaving(true);

    try {
      const result = await api.writeFile(serverId, editingFile, fileContent);
      if (result.success) {
        toast({ title: "保存成功", variant: "success" });
        setOriginalContent(fileContent);
      } else {
        toast({ title: "保存失败", description: result.error, variant: "destructive" });
      }
    } catch (error) {
      toast({
        title: "保存失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // 上传文件
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setUploading(true);
    try {
      // 获取上传信息
      const result = await api.getUploadUrl(serverId);
      if (!result.success) {
        throw new Error(result.error || "无法获取上传信息");
      }

      const token = localStorage.getItem('token');

      if (result.type === 'sftp' || result.type === 'agent') {
        // SFTP 模式：逐个上传到后端
        for (const file of Array.from(fileList)) {
          const uploadUrl = `${result.endpoint}?directory=${encodeURIComponent(currentPath)}&name=${encodeURIComponent(file.name)}`;
          const headers: Record<string, string> = {
            'Content-Type': 'application/octet-stream',
          };
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          const response = await fetch(uploadUrl, {
            method: "POST",
            headers,
            body: file,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `上传失败: ${response.statusText}`);
          }
        }
      } else {
        // 翼龙面板模式：同一次请求上传多个文件
        if (!result.url) {
          throw new Error("无法获取上传链接");
        }
        const formData = new FormData();
        Array.from(fileList).forEach(file => {
          formData.append("files", file);
        });

        const uploadUrl = `${result.url}&directory=${encodeURIComponent(currentPath)}`;
        const response = await fetch(uploadUrl, {
          method: "POST",
          body: formData,
        });

        // 翼龙面板上传成功返回 204 No Content
        if (!response.ok && response.status !== 204) {
          throw new Error(`上传失败: ${response.statusText}`);
        }
      }

      toast({ title: "上传成功", description: `已上传 ${fileList.length} 个文件`, variant: "success" });
      loadFiles();
    } catch (error) {
      // 翼龙面板可能因为 CORS/CSP 问题报错，但上传实际成功
      // 刷新文件列表检查是否真的失败
      loadFiles();
      const errorMsg = error instanceof Error ? error.message : "未知错误";
      if (errorMsg === "Failed to fetch") {
        toast({
          title: "上传可能成功",
          description: "请检查文件列表确认",
          variant: "default",
        });
      } else {
        toast({
          title: "上传失败",
          description: errorMsg,
          variant: "destructive",
        });
      }
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  // 复制文件
  const handleCopy = async (file: FileInfo) => {
    const location = currentPath === "/" ? `/${file.name}` : `${currentPath}/${file.name}`;
    try {
      const result = await api.copyFile(serverId, location);
      if (result.success) {
        toast({ title: "复制成功", variant: "success" });
        loadFiles();
      } else {
        toast({ title: "复制失败", description: result.error, variant: "destructive" });
      }
    } catch (error) {
      toast({
        title: "复制失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
    }
  };

  // 压缩文件
  const handleCompress = async () => {
    if (selectedFiles.size === 0) return;
    try {
      const result = await api.compressFiles(serverId, currentPath, Array.from(selectedFiles));
      if (result.success) {
        toast({ title: "压缩成功", description: `已创建 ${result.archive}`, variant: "success" });
        loadFiles();
      } else {
        toast({ title: "压缩失败", description: result.error, variant: "destructive" });
      }
    } catch (error) {
      toast({
        title: "压缩失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
    } finally {
      setSelectedFiles(new Set());
    }
  };

  // 解压文件
  const handleDecompress = async (file: FileInfo) => {
    try {
      const result = await api.decompressFile(serverId, currentPath, file.name);
      if (result.success) {
        toast({ title: "解压成功", variant: "success" });
        loadFiles();
      } else {
        toast({ title: "解压失败", description: result.error, variant: "destructive" });
      }
    } catch (error) {
      toast({
        title: "解压失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
    }
  };

  const isArchive = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    return ext && ["zip", "tar", "gz", "tar.gz", "rar", "7z"].includes(ext);
  };

  const hasChanges = fileContent !== originalContent;

  // compact 模式下的简化渲染
  if (compact) {
    return (
      <>
        <div className="space-y-3">
          {/* 工具栏 */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={goBack}
                disabled={historyIndex <= 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={goForward}
                disabled={historyIndex >= pathHistory.length - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={goUp} disabled={currentPath === "/"}>
                <Home className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => loadFiles()} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            <div className="flex-1 px-3 py-1.5 bg-muted rounded-md text-sm font-mono truncate">
              {currentPath}
            </div>

            <div className="flex items-center gap-1">
              <label>
                <Input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleUpload}
                  disabled={uploading}
                />
                <Button variant="outline" size="sm" asChild disabled={uploading}>
                  <span className="cursor-pointer">
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    <span className="ml-1 hidden sm:inline">上传</span>
                  </span>
                </Button>
              </label>
              <Button variant="outline" size="sm" onClick={() => setNewFolderOpen(true)}>
                <FolderPlus className="h-4 w-4" />
                <span className="ml-1 hidden sm:inline">新建</span>
              </Button>
              {selectedFiles.size > 0 && (
                <>
                  <Button variant="outline" size="sm" onClick={handleCompress}>
                    <Archive className="h-4 w-4" />
                    <span className="ml-1 hidden sm:inline">压缩</span>
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="ml-1 hidden sm:inline">删除 ({selectedFiles.size})</span>
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* 文件列表 */}
          <div className="border rounded-lg overflow-auto max-h-[calc(100vh-280px)]">
            <div className="min-w-[500px]">
              {/* 表头 */}
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b text-sm font-medium sticky top-0">
                <Checkbox
                  checked={files.length > 0 && selectedFiles.size === files.length}
                  onCheckedChange={toggleSelectAll}
                />
                <div className="flex-1">名称</div>
                <div className="w-20 text-right">大小</div>
                <div className="w-28 text-right">修改时间</div>
                <div className="w-10"></div>
              </div>

              {/* 文件项 */}
              {loading && files.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : files.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  空文件夹
                </div>
              ) : (
                files.map((file) => (
                  <div
                    key={file.name}
                    className={`flex items-center gap-2 px-3 py-2 hover:bg-muted/50 border-b last:border-0 ${selectedFiles.has(file.name) ? "bg-muted/30" : ""
                      }`}
                  >
                    <Checkbox
                      checked={selectedFiles.has(file.name)}
                      onCheckedChange={() => toggleSelect(file.name)}
                    />
                    <div
                      className="flex-1 flex items-center gap-2 cursor-pointer"
                      onClick={() => {
                        if (!file.isFile) {
                          enterFolder(file.name);
                        } else if (file.isEditable) {
                          handleEdit(file);
                        }
                      }}
                    >
                      {getFileIcon(file)}
                      <span className="truncate">{file.name}</span>
                    </div>
                    <div className="w-20 text-right text-sm text-muted-foreground">
                      {file.isFile ? formatSize(file.size) : "-"}
                    </div>
                    <div className="w-28 text-right text-sm text-muted-foreground">
                      {formatDate(file.modifiedAt)}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {file.isFile && file.isEditable && (
                          <DropdownMenuItem onClick={() => handleEdit(file)}>
                            <Edit3 className="h-4 w-4 mr-2" />
                            编辑
                          </DropdownMenuItem>
                        )}
                        {file.isFile && (
                          <DropdownMenuItem onClick={() => handleDownload(file)}>
                            <Download className="h-4 w-4 mr-2" />
                            下载
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleCopy(file)}>
                          <Copy className="h-4 w-4 mr-2" />
                          复制
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setRenameTarget(file);
                            setNewName(file.name);
                            setRenameOpen(true);
                          }}
                        >
                          <Edit3 className="h-4 w-4 mr-2" />
                          重命名
                        </DropdownMenuItem>
                        {file.isFile && isArchive(file.name) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleDecompress(file)}>
                              <Archive className="h-4 w-4 mr-2" />
                              解压
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => {
                            setSelectedFiles(new Set([file.name]));
                            setDeleteOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 对话框 */}
        <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新建文件夹</DialogTitle>
              <DialogDescription>在 {currentPath} 中创建新文件夹</DialogDescription>
            </DialogHeader>
            <Input
              placeholder="文件夹名称"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewFolderOpen(false)}>
                取消
              </Button>
              <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
                创建
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>重命名</DialogTitle>
              <DialogDescription>
                将 "{renameTarget?.name}" 重命名为
              </DialogDescription>
            </DialogHeader>
            <Input
              placeholder="新名称"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenameOpen(false)}>
                取消
              </Button>
              <Button onClick={handleRename} disabled={!newName.trim()}>
                确定
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除</AlertDialogTitle>
              <AlertDialogDescription>
                确定要删除选中的 {selectedFiles.size} 个项目吗？此操作不可撤销。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={editorOpen} onOpenChange={(open) => {
          if (!open && hasChanges) {
            if (!confirm("有未保存的更改，确定要关闭吗？")) return;
          }
          setEditorOpen(open);
          if (!open) {
            setEditingFile(null);
            setFileContent("");
            setOriginalContent("");
          }
        }}>
          <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileCode className="h-5 w-5" />
                {editingFile?.split("/").pop()}
                {hasChanges && <span className="text-orange-500">*</span>}
              </DialogTitle>
              <DialogDescription>{editingFile}</DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-hidden">
              <Textarea
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                className="h-full w-full font-mono text-sm resize-none"
                placeholder="文件内容..."
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditorOpen(false)}>
                关闭
              </Button>
              <Button onClick={handleSave} disabled={saving || !hasChanges}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                保存
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Card className={`w-full border-0 shadow-none ${compact ? '' : 'h-full flex flex-col'}`}>
      {!compact && (
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Folder className="h-5 w-5" />
                文件管理
              </CardTitle>
              <CardDescription>{serverName}</CardDescription>
            </div>
            {onClose && (
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
      )}

      <CardContent className={`flex flex-col gap-3 ${compact ? 'p-0' : 'flex-1 min-h-0 overflow-hidden'}`}>
        {/* 工具栏 */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={goBack}
              disabled={historyIndex <= 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={goForward}
              disabled={historyIndex >= pathHistory.length - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={goUp} disabled={currentPath === "/"}>
              <Home className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => loadFiles()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          <div className="flex-1 px-3 py-1.5 bg-muted rounded-md text-sm font-mono truncate">
            {currentPath}
          </div>

          <div className="flex items-center gap-1">
            <label>
              <Input
                type="file"
                multiple
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
              <Button variant="outline" size="sm" asChild disabled={uploading}>
                <span className="cursor-pointer">
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  <span className="ml-1 hidden sm:inline">上传</span>
                </span>
              </Button>
            </label>
            <Button variant="outline" size="sm" onClick={() => setNewFolderOpen(true)}>
              <FolderPlus className="h-4 w-4" />
              <span className="ml-1 hidden sm:inline">新建</span>
            </Button>
            {selectedFiles.size > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={handleCompress}>
                  <Archive className="h-4 w-4" />
                  <span className="ml-1 hidden sm:inline">压缩</span>
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="ml-1 hidden sm:inline">删除 ({selectedFiles.size})</span>
                </Button>
              </>
            )}
          </div>
        </div>

        {/* 文件列表 */}
        <div className="flex-1 min-h-0 border rounded-lg overflow-auto">
          <div className="min-w-[500px]">
            {/* 表头 */}
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b text-sm font-medium sticky top-0">
              <Checkbox
                checked={files.length > 0 && selectedFiles.size === files.length}
                onCheckedChange={toggleSelectAll}
              />
              <div className="flex-1">名称</div>
              <div className="w-20 text-right">大小</div>
              <div className="w-28 text-right">修改时间</div>
              <div className="w-10"></div>
            </div>

            {/* 文件项 */}
            {loading && files.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : files.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                空文件夹
              </div>
            ) : (
              files.map((file) => (
                <div
                  key={file.name}
                  className={`flex items-center gap-2 px-3 py-2 hover:bg-muted/50 border-b last:border-0 ${selectedFiles.has(file.name) ? "bg-muted/30" : ""
                    }`}
                >
                  <Checkbox
                    checked={selectedFiles.has(file.name)}
                    onCheckedChange={() => toggleSelect(file.name)}
                  />
                  <div
                    className="flex-1 flex items-center gap-2 cursor-pointer"
                    onClick={() => {
                      if (!file.isFile) {
                        enterFolder(file.name);
                      } else if (file.isEditable) {
                        handleEdit(file);
                      }
                    }}
                  >
                    {getFileIcon(file)}
                    <span className="truncate">{file.name}</span>
                  </div>
                  <div className="w-20 text-right text-sm text-muted-foreground">
                    {file.isFile ? formatSize(file.size) : "-"}
                  </div>
                  <div className="w-28 text-right text-sm text-muted-foreground">
                    {formatDate(file.modifiedAt)}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {file.isFile && file.isEditable && (
                        <DropdownMenuItem onClick={() => handleEdit(file)}>
                          <Edit3 className="h-4 w-4 mr-2" />
                          编辑
                        </DropdownMenuItem>
                      )}
                      {file.isFile && (
                        <DropdownMenuItem onClick={() => handleDownload(file)}>
                          <Download className="h-4 w-4 mr-2" />
                          下载
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => handleCopy(file)}>
                        <Copy className="h-4 w-4 mr-2" />
                        复制
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setRenameTarget(file);
                          setNewName(file.name);
                          setRenameOpen(true);
                        }}
                      >
                        <Edit3 className="h-4 w-4 mr-2" />
                        重命名
                      </DropdownMenuItem>
                      {file.isFile && isArchive(file.name) && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleDecompress(file)}>
                            <Archive className="h-4 w-4 mr-2" />
                            解压
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => {
                          setSelectedFiles(new Set([file.name]));
                          setDeleteOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>

      {/* 新建文件夹对话框 */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建文件夹</DialogTitle>
            <DialogDescription>在 {currentPath} 中创建新文件夹</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="文件夹名称"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 重命名对话框 */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名</DialogTitle>
            <DialogDescription>
              将 "{renameTarget?.name}" 重命名为
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="新名称"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              取消
            </Button>
            <Button onClick={handleRename} disabled={!newName.trim()}>
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除选中的 {selectedFiles.size} 个项目吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 文件编辑器对话框 */}
      <Dialog open={editorOpen} onOpenChange={(open) => {
        if (!open && hasChanges) {
          if (!confirm("有未保存的更改，确定要关闭吗？")) return;
        }
        setEditorOpen(open);
        if (!open) {
          setEditingFile(null);
          setFileContent("");
          setOriginalContent("");
        }
      }}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCode className="h-5 w-5" />
              {editingFile?.split("/").pop()}
              {hasChanges && <span className="text-orange-500">*</span>}
            </DialogTitle>
            <DialogDescription>{editingFile}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            <Textarea
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              className="h-full w-full font-mono text-sm resize-none"
              placeholder="文件内容..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              关闭
            </Button>
            <Button onClick={handleSave} disabled={saving || !hasChanges}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
