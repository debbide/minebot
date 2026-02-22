package fsops

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const chunkSize = 256 * 1024

type FileInfo struct {
	Name       string `json:"name"`
	Mode       string `json:"mode"`
	Size       int64  `json:"size"`
	IsFile     bool   `json:"isFile"`
	IsSymlink  bool   `json:"isSymlink"`
	IsEditable bool   `json:"isEditable"`
	Mimetype   string `json:"mimetype"`
	CreatedAt  string `json:"createdAt"`
	ModifiedAt string `json:"modifiedAt"`
}

func ResolveBase(root string, volumeMap, containerMap map[string]string, serverId string) string {
	if root == "" {
		return ""
	}
	base := root
	if v, ok := volumeMap[serverId]; ok && v != "" {
		base = filepath.Join(root, v)
	} else if c, ok := containerMap[serverId]; ok && c != "" {
		base = filepath.Join(root, c)
	}
	if _, err := os.Stat(base); err == nil {
		return base
	}
	return root
}

func List(base, path string) ([]FileInfo, error) {
	abs, err := safePath(base, path)
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(abs)
	if err != nil {
		return nil, err
	}
	out := make([]FileInfo, 0, len(entries))
	for _, e := range entries {
		info, err := e.Info()
		if err != nil {
			continue
		}
		isFile := !e.IsDir()
		isSymlink := info.Mode()&os.ModeSymlink != 0
		modifiedAt := info.ModTime().UTC().Format(time.RFC3339)
		mode := fmt.Sprintf("%#o", info.Mode().Perm())
		isEditable := isFile && info.Size() < 10*1024*1024
		out = append(out, FileInfo{
			Name:       e.Name(),
			Mode:       mode,
			Size:       info.Size(),
			IsFile:     isFile,
			IsSymlink:  isSymlink,
			IsEditable: isEditable,
			Mimetype:   "",
			CreatedAt:  modifiedAt,
			ModifiedAt: modifiedAt,
		})
	}
	return out, nil
}

func Read(base, path string) (string, error) {
	abs, err := safePath(base, path)
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(abs)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func Write(base, path, content string) error {
	abs, err := safePath(base, path)
	if err != nil {
		return err
	}
	return os.WriteFile(abs, []byte(content), 0644)
}

func Chmod(base, path, mode string) error {
	abs, err := safePath(base, path)
	if err != nil {
		return err
	}
	parsed, err := strconv.ParseUint(strings.TrimPrefix(mode, "0"), 8, 32)
	if err != nil {
		return err
	}
	return os.Chmod(abs, os.FileMode(parsed))
}

func Mkdir(base, root, name string) error {
	abs, err := safePath(base, filepath.Join(root, name))
	if err != nil {
		return err
	}
	return os.MkdirAll(abs, 0755)
}

func Delete(base, root string, files []string) error {
	for _, name := range files {
		abs, err := safePath(base, filepath.Join(root, name))
		if err != nil {
			return err
		}
		if err := os.RemoveAll(abs); err != nil {
			return err
		}
	}
	return nil
}

func Rename(base, root, from, to string) error {
	src, err := safePath(base, filepath.Join(root, from))
	if err != nil {
		return err
	}
	dst, err := safePath(base, filepath.Join(root, to))
	if err != nil {
		return err
	}
	return os.Rename(src, dst)
}

func Copy(base, location string) error {
	src, err := safePath(base, location)
	if err != nil {
		return err
	}
	ext := path.Ext(src)
	name := strings.TrimSuffix(filepath.Base(src), ext)
	dstName := fmt.Sprintf("%s-copy%s", name, ext)
	dst, err := safePath(base, filepath.Join(filepath.Dir(location), dstName))
	if err != nil {
		return err
	}
	return copyPath(src, dst)
}

func Compress(base, root string, files []string) (string, error) {
	if len(files) == 0 {
		return "", errors.New("no files")
	}
	archiveName := fmt.Sprintf("archive-%d.zip", time.Now().Unix())
	archivePath, err := safePath(base, filepath.Join(root, archiveName))
	if err != nil {
		return "", err
	}

	if err := zipPaths(archivePath, base, root, files); err != nil {
		return "", err
	}
	return archiveName, nil
}

func Decompress(base, root, file string) error {
	abs, err := safePath(base, filepath.Join(root, file))
	if err != nil {
		return err
	}
	if strings.HasSuffix(file, ".zip") {
		return unzip(abs, filepath.Dir(abs))
	}
	if strings.HasSuffix(file, ".tar.gz") || strings.HasSuffix(file, ".tgz") {
		return untarGz(abs, filepath.Dir(abs))
	}
	if strings.HasSuffix(file, ".tar") {
		return untar(abs, filepath.Dir(abs))
	}
	return errors.New("unsupported archive type")
}

type UploadSession struct {
	tempFile *os.File
	target   string
	size     int64
	index    int
}

func NewUpload(base, path string, size int64) (*UploadSession, error) {
	abs, err := safePath(base, path)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(abs), 0755); err != nil {
		return nil, err
	}
	tmp, err := os.CreateTemp(os.TempDir(), "agent-upload-*")
	if err != nil {
		return nil, err
	}
	return &UploadSession{tempFile: tmp, target: abs, size: size, index: 0}, nil
}

func (u *UploadSession) WriteChunk(idx int, data []byte) error {
	if idx != u.index {
		return fmt.Errorf("unexpected chunk index")
	}
	if _, err := u.tempFile.Write(data); err != nil {
		return err
	}
	u.index++
	return nil
}

func (u *UploadSession) Commit() error {
	if err := u.tempFile.Close(); err != nil {
		return err
	}
	return os.Rename(u.tempFile.Name(), u.target)
}

type DownloadSession struct {
	ID   string
	file *os.File
	size int64
}

var (
	downloadMu sync.Mutex
	downloads  = map[string]*DownloadSession{}
)

func NewDownload(base, path string) (*DownloadSession, error) {
	abs, err := safePath(base, path)
	if err != nil {
		return nil, err
	}
	f, err := os.Open(abs)
	if err != nil {
		return nil, err
	}
	info, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return nil, err
	}
	id := randID()
	s := &DownloadSession{ID: id, file: f, size: info.Size()}
	downloadMu.Lock()
	downloads[id] = s
	downloadMu.Unlock()
	return s, nil
}

func ReadChunk(id string, index int) ([]byte, bool, error) {
	downloadMu.Lock()
	s := downloads[id]
	downloadMu.Unlock()
	if s == nil {
		return nil, false, errors.New("download not found")
	}

	offset := int64(index * chunkSize)
	if offset >= s.size {
		closeDownload(id)
		return nil, true, nil
	}
	buf := make([]byte, chunkSize)
	n, err := s.file.ReadAt(buf, offset)
	if err != nil && err != io.EOF {
		return nil, false, err
	}
	done := offset+int64(n) >= s.size
	if done {
		closeDownload(id)
	}
	return buf[:n], done, nil
}

func closeDownload(id string) {
	downloadMu.Lock()
	s := downloads[id]
	delete(downloads, id)
	downloadMu.Unlock()
	if s != nil {
		_ = s.file.Close()
	}
}

func safePath(base, path string) (string, error) {
	if base == "" {
		return "", errors.New("fileRoot not configured")
	}
	cleaned := filepath.Clean(filepath.Join(base, path))
	if !isSubPath(base, cleaned) {
		return "", errors.New("path is outside base")
	}
	return cleaned, nil
}

func isSubPath(base, target string) bool {
	base = filepath.Clean(base)
	target = filepath.Clean(target)
	if len(target) < len(base) {
		return false
	}
	rel, err := filepath.Rel(base, target)
	if err != nil {
		return false
	}
	return rel != ".." && !startsWithDotDot(rel)
}

func startsWithDotDot(rel string) bool {
	return rel == ".." || (len(rel) >= 3 && rel[:3] == ".."+string(os.PathSeparator))
}

func randID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func copyPath(src, dst string) error {
	info, err := os.Stat(src)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return copyDir(src, dst)
	}
	return copyFile(src, dst)
}

func copyDir(src, dst string) error {
	if err := os.MkdirAll(dst, 0755); err != nil {
		return err
	}
	return filepath.WalkDir(src, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, p)
		if rel == "." {
			return nil
		}
		target := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0755)
		}
		return copyFile(p, target)
	})
}

func copyFile(src, dst string) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return err
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Sync()
}

func zipPaths(archivePath, base, root string, files []string) error {
	out, err := os.Create(archivePath)
	if err != nil {
		return err
	}
	defer out.Close()

	zw := zip.NewWriter(out)
	defer zw.Close()

	for _, name := range files {
		abs, err := safePath(base, filepath.Join(root, name))
		if err != nil {
			return err
		}
		err = filepath.Walk(abs, func(p string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}
			if info.IsDir() {
				return nil
			}
			relRoot := filepath.Join(root, name)
			relPath, _ := filepath.Rel(filepath.Join(base, root), p)
			if relPath == "" {
				relPath = filepath.Base(p)
			}
			header, err := zip.FileInfoHeader(info)
			if err != nil {
				return err
			}
			header.Name = relPath
			writer, err := zw.CreateHeader(header)
			if err != nil {
				return err
			}
			file, err := os.Open(p)
			if err != nil {
				return err
			}
			defer file.Close()
			if _, err := io.Copy(writer, file); err != nil {
				return err
			}
			_ = relRoot
			return nil
		})
		if err != nil {
			return err
		}
	}
	return nil
}

func unzip(archivePath, dest string) error {
	r, err := zip.OpenReader(archivePath)
	if err != nil {
		return err
	}
	defer r.Close()

	for _, f := range r.File {
		target := filepath.Join(dest, f.Name)
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.Create(target)
		if err != nil {
			rc.Close()
			return err
		}
		if _, err := io.Copy(out, rc); err != nil {
			rc.Close()
			out.Close()
			return err
		}
		rc.Close()
		out.Close()
	}
	return nil
}

func untarGz(archivePath, dest string) error {
	f, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	defer gz.Close()
	return untarReader(gz, dest)
}

func untar(archivePath, dest string) error {
	f, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer f.Close()
	return untarReader(f, dest)
}

func untarReader(r io.Reader, dest string) error {
	tr := tar.NewReader(r)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		target := filepath.Join(dest, hdr.Name)
		switch hdr.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
				return err
			}
			out, err := os.Create(target)
			if err != nil {
				return err
			}
			if _, err := io.Copy(out, tr); err != nil {
				out.Close()
				return err
			}
			out.Close()
		}
	}
	return nil
}
