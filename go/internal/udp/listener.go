package udp

// Package udp provides UDP listening functionality

import (
	"context"
	"fmt"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/amirandap/mylaps-mvp2/go/internal/config"
	"github.com/amirandap/mylaps-mvp2/go/internal/rawfile"
	"github.com/amirandap/mylaps-mvp2/go/internal/redis"
)

// Listener represents a UDP listener that forwards data to Redis
type Listener struct {
	config      *config.Config
	redisClient *redis.Client
	rawWriter   *rawfile.Writer
	conn        *net.UDPConn
	running     bool
	mutex       sync.Mutex
	ctx         context.Context
	cancel      context.CancelFunc
	wg          sync.WaitGroup
	stats       *Stats
}

// Stats holds statistics about the UDP listener
type Stats struct {
	PacketsReceived uint64
	BytesReceived   uint64
	LinesProcessed  uint64
	StartTime       time.Time
	mutex           sync.RWMutex
}

// NewListener creates a new UDP listener
func NewListener(cfg *config.Config, redisClient *redis.Client) (*Listener, error) {
	ctx, cancel := context.WithCancel(context.Background())

	var rawWriter *rawfile.Writer
	var err error

	// Initialize raw file writer if enabled
	if cfg.IsRawFileStorageEnabled() {
		rawWriter, err = rawfile.NewWriter(cfg)
		if err != nil {
			cancel()
			return nil, fmt.Errorf("failed to create raw file writer: %w", err)
		}
	}

	return &Listener{
		config:      cfg,
		redisClient: redisClient,
		rawWriter:   rawWriter,
		ctx:         ctx,
		cancel:      cancel,
		stats: &Stats{
			StartTime: time.Now(),
		},
	}, nil
}

// Start starts the UDP listener
func (l *Listener) Start() error {
	l.mutex.Lock()
	defer l.mutex.Unlock()

	if l.running {
		return fmt.Errorf("UDP listener is already running")
	}

	addr, err := net.ResolveUDPAddr("udp", l.config.GetUDPListenAddr())
	if err != nil {
		return fmt.Errorf("failed to resolve UDP address: %w", err)
	}

	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		return fmt.Errorf("failed to listen on UDP: %w", err)
	}

	l.conn = conn
	l.running = true

	// Start listening for UDP packets
	l.wg.Add(1)
	go l.listen()

	fmt.Printf("UDP listener started on %s\n", l.config.GetUDPListenAddr())
	return nil
}

// Stop stops the UDP listener
func (l *Listener) Stop() error {
	l.mutex.Lock()
	defer l.mutex.Unlock()

	if !l.running {
		return nil
	}

	l.cancel()

	if l.conn != nil {
		if err := l.conn.Close(); err != nil {
			return fmt.Errorf("failed to close UDP connection: %w", err)
		}
		l.conn = nil
	}

	// Close raw file writer if enabled
	if l.rawWriter != nil {
		if err := l.rawWriter.Close(); err != nil {
			fmt.Printf("Error closing raw file writer: %v\n", err)
		}
		l.rawWriter = nil
	}

	l.running = false
	l.wg.Wait()

	fmt.Println("UDP listener stopped")
	return nil
}

// GetStats returns a copy of the current statistics
func (l *Listener) GetStats() Stats {
	l.stats.mutex.RLock()
	defer l.stats.mutex.RUnlock()

	return Stats{
		PacketsReceived: l.stats.PacketsReceived,
		BytesReceived:   l.stats.BytesReceived,
		LinesProcessed:  l.stats.LinesProcessed,
		StartTime:       l.stats.StartTime,
	}
}

// listen listens for UDP packets
func (l *Listener) listen() {
	defer l.wg.Done()

	buffer := make([]byte, 8192)

	for {
		select {
		case <-l.ctx.Done():
			return
		default:
			// Continue processing
		}

		// Set read deadline for cancelation
		if err := l.conn.SetReadDeadline(time.Now().Add(1 * time.Second)); err != nil {
			fmt.Printf("Failed to set read deadline: %v\n", err)
			continue
		}

		n, addr, err := l.conn.ReadFromUDP(buffer)
		if err != nil {
			if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
				// This is just a timeout for cancelation check, continue
				continue
			}
			fmt.Printf("Error reading UDP packet: %v\n", err)
			continue
		}

		// Update statistics
		l.stats.mutex.Lock()
		l.stats.PacketsReceived++
		l.stats.BytesReceived += uint64(n)
		l.stats.mutex.Unlock()

		// Process the received data
		l.processData(buffer[:n], addr)
	}
}

// processData processes received UDP data
func (l *Listener) processData(data []byte, _ *net.UDPAddr) {
	// Write raw data to file if enabled
	timestamp := time.Now()
	if l.rawWriter != nil && l.config.IsRawFileStorageEnabled() {
		if err := l.rawWriter.Write(data, timestamp); err != nil {
			fmt.Printf("Error writing to raw file: %v\n", err)
		}
	}

	// Convert data to string
	dataStr := string(data)

	// Split data into lines
	lines := strings.Split(dataStr, "\n")

	// Process each line
	now := timestamp.UnixMilli()

	for _, line := range lines {
		// Clean up the line
		line = strings.TrimSpace(line)
		if len(line) == 0 {
			continue
		}

		// Remove carriage return if present
		line = strings.TrimSuffix(line, "\r")

		// Only process lines starting with $
		if !strings.HasPrefix(line, "$") {
			continue
		}

		// Detect message type
		msgType := redis.DetectMessageType(line)

		// Create message
		msg := redis.Message{
			Type:      msgType,
			Line:      line,
			Timestamp: now,
		}

		// Send to Redis
		if err := l.redisClient.Send(msg); err != nil {
			fmt.Printf("Failed to send message to Redis: %v\n", err)
		}

		// Update statistics
		l.stats.mutex.Lock()
		l.stats.LinesProcessed++
		l.stats.mutex.Unlock()
	}
}
