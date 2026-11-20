package rawfile

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/amirandap/mylaps-mvp2/go/internal/config"
)

// Writer handles writing raw UDP data to files with automatic rotation
type Writer struct {
	config       *config.Config
	mu           sync.Mutex
	currentFile  *os.File
	currentSize  int64
	lastRotation time.Time
	baseFilename string
}

// NewWriter creates a new raw file writer
func NewWriter(cfg *config.Config) (*Writer, error) {
	// Create directory if it doesn't exist
	err := os.MkdirAll(cfg.GetRawFileDir(), 0755)
	if err != nil {
		return nil, fmt.Errorf("failed to create raw file directory: %w", err)
	}

	w := &Writer{
		config:       cfg,
		lastRotation: time.Now(),
		baseFilename: "mylaps_raw",
	}

	// Initialize the first file
	if err := w.rotate(); err != nil {
		return nil, err
	}

	return w, nil
}

// Write writes data to the current file, rotating if necessary
func (w *Writer) Write(data []byte, timestamp time.Time) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	// Check if we need to rotate due to size or age
	needsRotation := false

	// Check file size
	if w.currentSize+int64(len(data)) > w.config.GetRawFileMaxSize() {
		needsRotation = true
	}

	// Check file age
	maxAge := time.Duration(w.config.GetRawFileMaxAge()) * time.Hour
	if time.Since(w.lastRotation) > maxAge {
		needsRotation = true
	}

	if needsRotation {
		if err := w.rotate(); err != nil {
			return err
		}
	}

	// Format entry with timestamp
	entry := fmt.Sprintf("[%s] %s\n", timestamp.Format(time.RFC3339Nano), string(data))

	// Write to file
	n, err := w.currentFile.WriteString(entry)
	if err != nil {
		return fmt.Errorf("failed to write to raw file: %w", err)
	}

	w.currentSize += int64(n)
	return nil
}

// rotate creates a new file and closes the previous one
func (w *Writer) rotate() error {
	// Close current file if it exists
	if w.currentFile != nil {
		if err := w.currentFile.Close(); err != nil {
			return fmt.Errorf("failed to close raw file: %w", err)
		}
		w.currentFile = nil
	}

	// Create a new filename with timestamp
	timestamp := time.Now()
	w.lastRotation = timestamp

	filename := fmt.Sprintf("%s_%s.log",
		w.baseFilename,
		timestamp.Format("20060102_150405"))

	fullPath := filepath.Join(w.config.GetRawFileDir(), filename)

	// Open new file
	file, err := os.Create(fullPath)
	if err != nil {
		return fmt.Errorf("failed to create raw file: %w", err)
	}

	w.currentFile = file
	w.currentSize = 0

	return nil
}

// Close closes the current file
func (w *Writer) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.currentFile != nil {
		err := w.currentFile.Close()
		w.currentFile = nil
		return err
	}

	return nil
}
