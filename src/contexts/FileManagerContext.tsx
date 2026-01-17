import { createContext, useContext, useState, ReactNode } from "react";
import {
    Dialog,
    DialogContent,
} from "@/components/ui/dialog";
import { FileManager } from "@/components/FileManager";

interface FileManagerContextType {
    openFileManager: (serverId: string, serverName: string) => void;
    closeFileManager: () => void;
}

const FileManagerContext = createContext<FileManagerContextType | null>(null);

export function useFileManager() {
    const context = useContext(FileManagerContext);
    if (!context) {
        throw new Error("useFileManager must be used within FileManagerProvider");
    }
    return context;
}

interface FileManagerProviderProps {
    children: ReactNode;
}

export function FileManagerProvider({ children }: FileManagerProviderProps) {
    const [open, setOpen] = useState(false);
    const [serverId, setServerId] = useState("");
    const [serverName, setServerName] = useState("");

    const openFileManager = (id: string, name: string) => {
        setServerId(id);
        setServerName(name);
        setOpen(true);
    };

    const closeFileManager = () => {
        setOpen(false);
    };

    return (
        <FileManagerContext.Provider value={{ openFileManager, closeFileManager }}>
            {children}
            {/* 文件管理弹窗 - 渲染在顶层，不受 Sheet 的 transform 影响 */}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-5xl h-[85vh] p-0 [&>button]:hidden">
                    <FileManager
                        serverId={serverId}
                        serverName={serverName}
                        onClose={closeFileManager}
                    />
                </DialogContent>
            </Dialog>
        </FileManagerContext.Provider>
    );
}
