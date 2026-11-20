package config

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/go-redis/redis/v8"
)

// Watcher watches for configuration changes in a Redis stream
type Watcher struct {
	config     *Config
	client     *redis.Client
	mutex      sync.RWMutex
	quit       chan struct{}
	wg         sync.WaitGroup
	ctx        context.Context
	updateChan chan *Config
	handlers   []func(*Config)
}

// NewWatcher creates a new config watcher
func NewWatcher(ctx context.Context, cfg *Config) (*Watcher, error) {
	// If config stream is not enabled, return a dummy watcher
	if !cfg.IsStreamAckEnabled() {
		return &Watcher{
			config: cfg,
			ctx:    ctx,
			quit:   make(chan struct{}),
		}, nil
	}

	// Parse Redis URL
	options, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse Redis URL: %w", err)
	}

	// Create Redis client
	redisClient := redis.NewClient(options)

	// Test connection
	if err := redisClient.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	watcher := &Watcher{
		config:     cfg,
		client:     redisClient,
		quit:       make(chan struct{}),
		ctx:        ctx,
		updateChan: make(chan *Config, 10),
		handlers:   make([]func(*Config), 0),
	}

	// Start the watcher
	watcher.wg.Add(1)
	go watcher.run()

	return watcher, nil
}

// Close closes the watcher
func (w *Watcher) Close() error {
	// Signal workers to stop
	close(w.quit)

	// Wait for workers to finish
	w.wg.Wait()

	// Close client if it exists
	if w.client != nil {
		return w.client.Close()
	}

	return nil
}

// AddHandler adds a handler to be called when the config changes
func (w *Watcher) AddHandler(handler func(*Config)) {
	w.mutex.Lock()
	defer w.mutex.Unlock()

	w.handlers = append(w.handlers, handler)
}

// GetConfig returns the current config
func (w *Watcher) GetConfig() *Config {
	w.mutex.RLock()
	defer w.mutex.RUnlock()

	return w.config
}

// run processes config updates in the background
func (w *Watcher) run() {
	defer w.wg.Done()

	// If no client, just return
	if w.client == nil {
		return
	}

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	// Process config updates
	for {
		select {
		case <-w.quit:
			return
		case <-ticker.C:
			// Read new messages
			w.readNewMessages()
		case cfg := <-w.updateChan:
			w.updateConfig(cfg)
		}
	}
}

// readNewMessages reads new messages from the Redis stream
func (w *Watcher) readNewMessages() {
	// Read new messages
	streams, err := w.client.XReadGroup(w.ctx, &redis.XReadGroupArgs{
		Group:    w.config.GetConsumerGroup(),
		Consumer: w.config.GetConsumerName(),
		Streams:  []string{w.config.GetConfigStreamKey(), ">"},
		Count:    10,
		Block:    0,
	}).Result()

	if err != nil {
		if err != redis.Nil {
			fmt.Printf("Error reading config stream: %v\n", err)
		}
		return
	}

	if len(streams) == 0 {
		return // No messages
	}

	// Process messages
	messages := streams[0].Messages

	for _, msg := range messages {
		// Process the message
		err := w.handleConfigMessage(w.ctx, msg.ID, msg.Values)

		if err != nil {
			// Error handling message, don't ack it yet
			fmt.Printf("Error processing config message %s: %v\n", msg.ID, err)
			continue
		}

		// Acknowledge message if enabled
		if w.config.IsStreamAckEnabled() {
			if err := w.client.XAck(w.ctx, w.config.GetConfigStreamKey(), w.config.GetConsumerGroup(), msg.ID).Err(); err != nil {
				fmt.Printf("Failed to acknowledge config message: %v\n", err)
			}
		}
	}
}

// handleConfigMessage processes a config message from the Redis stream
func (w *Watcher) handleConfigMessage(_ context.Context, _ string, values map[string]interface{}) error {
	// Extract config data
	configData, ok := values["config"]
	if !ok {
		return fmt.Errorf("config message missing 'config' field: %v", values)
	}

	// Convert to string
	configStr, ok := configData.(string)
	if !ok {
		return fmt.Errorf("config field is not a string: %T", configData)
	}

	// Parse JSON
	var configMap map[string]interface{}
	if err := json.Unmarshal([]byte(configStr), &configMap); err != nil {
		return fmt.Errorf("failed to parse config JSON: %w", err)
	}

	// Create a new config from the current config
	newConfig := *w.GetConfig()

	// Update config fields based on the map
	if v, ok := configMap["udpListen"].(string); ok {
		newConfig.UDPListen = v
	}
	if v, ok := configMap["rawStreamKey"].(string); ok {
		newConfig.RawStreamKey = v
	}
	if v, ok := configMap["configStreamKey"].(string); ok {
		newConfig.ConfigStreamKey = v
	}
	if v, ok := configMap["enableRawFileStorage"].(bool); ok {
		newConfig.EnableRawFileStorage = v
	}
	if v, ok := configMap["rawFileDir"].(string); ok {
		newConfig.RawFileDir = v
	}
	if v, ok := configMap["batchSize"].(float64); ok {
		newConfig.BatchSize = int(v)
	}
	if v, ok := configMap["batchIntervalMS"].(float64); ok {
		newConfig.BatchIntervalMS = int(v)
	}
	if v, ok := configMap["maxQueueSize"].(float64); ok {
		newConfig.MaxQueueSize = int(v)
	}
	if v, ok := configMap["maxRetries"].(float64); ok {
		newConfig.MaxRetries = int(v)
	}
	if v, ok := configMap["enableStreamAck"].(bool); ok {
		newConfig.EnableStreamAck = v
	}

	// Send config update
	select {
	case w.updateChan <- &newConfig:
		// Update sent
	default:
		// Channel full, discard update
		fmt.Println("Config update channel full, discarding update")
	}

	return nil
}

// updateConfig updates the current config and notifies handlers
func (w *Watcher) updateConfig(cfg *Config) {
	// Update config
	w.mutex.Lock()
	oldConfig := w.config
	w.config = cfg
	handlers := make([]func(*Config), len(w.handlers))
	copy(handlers, w.handlers)
	w.mutex.Unlock()

	// Log the update
	fmt.Printf("Updated configuration: %v -> %v\n", oldConfig, cfg)

	// Notify handlers
	for _, handler := range handlers {
		go handler(cfg)
	}
}

// PublishConfig publishes a config update to the Redis stream
func PublishConfig(ctx context.Context, client *redis.Client, streamKey string, config *Config) error {
	// Convert config to map
	configMap := map[string]interface{}{
		"udpListen":            config.UDPListen,
		"rawStreamKey":         config.RawStreamKey,
		"configStreamKey":      config.ConfigStreamKey,
		"enableRawFileStorage": config.EnableRawFileStorage,
		"rawFileDir":           config.RawFileDir,
		"batchSize":            config.BatchSize,
		"batchIntervalMS":      config.BatchIntervalMS,
		"maxQueueSize":         config.MaxQueueSize,
		"maxRetries":           config.MaxRetries,
		"enableStreamAck":      config.EnableStreamAck,
	}

	// Convert to JSON
	configJSON, err := json.Marshal(configMap)
	if err != nil {
		return fmt.Errorf("failed to marshal config to JSON: %w", err)
	}

	// Publish to Redis stream
	_, err = client.XAdd(ctx, &redis.XAddArgs{
		Stream: streamKey,
		Values: map[string]interface{}{
			"config": string(configJSON),
			"ts":     time.Now().UnixNano(),
		},
	}).Result()

	if err != nil {
		return fmt.Errorf("failed to publish config to Redis stream: %w", err)
	}

	return nil
}
