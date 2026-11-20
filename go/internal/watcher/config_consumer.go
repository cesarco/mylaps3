package watcher

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/amirandap/mylaps-mvp2/go/internal/config"
	"github.com/go-redis/redis/v8"
)

// ConfigConsumer watches for configuration changes in a Redis stream
type ConfigConsumer struct {
	config     *config.Config
	client     *redis.Client
	mutex      sync.RWMutex
	quit       chan struct{}
	wg         sync.WaitGroup
	ctx        context.Context
	updateChan chan *config.Config
	handlers   []func(*config.Config)
}

// NewConfigConsumer creates a new config watcher
func NewConfigConsumer(ctx context.Context, cfg *config.Config) (*ConfigConsumer, error) {
	// If config stream is not enabled, return a dummy watcher
	if !cfg.IsStreamAckEnabled() {
		return &ConfigConsumer{
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

	watcher := &ConfigConsumer{
		config:     cfg,
		client:     redisClient,
		quit:       make(chan struct{}),
		ctx:        ctx,
		updateChan: make(chan *config.Config, 10),
		handlers:   make([]func(*config.Config), 0),
	}

	// Create consumer group if it doesn't exist
	err = watcher.createGroup()
	if err != nil {
		redisClient.Close()
		return nil, fmt.Errorf("failed to create consumer group: %w", err)
	}

	// Start the consumer
	watcher.wg.Add(1)
	go watcher.run()

	return watcher, nil
}

// createGroup creates a consumer group if it doesn't exist
func (c *ConfigConsumer) createGroup() error {
	// Check if the stream exists
	exists, err := c.client.Exists(c.ctx, c.config.ConfigStreamKey).Result()
	if err != nil {
		return err
	}

	// If stream doesn't exist, we need to create it with MKSTREAM
	if exists == 0 {
		err = c.client.XGroupCreateMkStream(c.ctx, c.config.ConfigStreamKey, c.config.ConsumerGroup, "0").Err()
		if err != nil && err.Error() != "BUSYGROUP Consumer Group name already exists" {
			return err
		}
		return nil
	}

	// Stream exists, try to create group
	err = c.client.XGroupCreate(c.ctx, c.config.ConfigStreamKey, c.config.ConsumerGroup, "0").Err()
	if err != nil && err.Error() != "BUSYGROUP Consumer Group name already exists" {
		return err
	}

	return nil
}

// Close closes the watcher
func (c *ConfigConsumer) Close() error {
	// Signal workers to stop
	close(c.quit)

	// Wait for workers to finish
	c.wg.Wait()

	// Close Redis client if it exists
	if c.client != nil {
		return c.client.Close()
	}

	return nil
}

// AddHandler adds a handler to be called when the config changes
func (c *ConfigConsumer) AddHandler(handler func(*config.Config)) {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	c.handlers = append(c.handlers, handler)
}

// GetConfig returns the current config
func (c *ConfigConsumer) GetConfig() *config.Config {
	c.mutex.RLock()
	defer c.mutex.RUnlock()

	return c.config
}

// run processes config updates in the background
func (c *ConfigConsumer) run() {
	defer c.wg.Done()

	// If no client, just return
	if c.client == nil {
		return
	}

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	pendingTicker := time.NewTicker(30 * time.Second)
	defer pendingTicker.Stop()

	// Process config updates
	for {
		select {
		case <-c.quit:
			return
		case <-ticker.C:
			// Read new messages
			c.readNewMessages()
		case <-pendingTicker.C:
			// Process pending messages
			c.processPendingMessages()
		case cfg := <-c.updateChan:
			c.updateConfig(cfg)
		}
	}
}

// readNewMessages reads new messages from the Redis stream
func (c *ConfigConsumer) readNewMessages() {
	// Read new messages
	streams, err := c.client.XReadGroup(c.ctx, &redis.XReadGroupArgs{
		Group:    c.config.ConsumerGroup,
		Consumer: c.config.ConsumerName,
		Streams:  []string{c.config.ConfigStreamKey, ">"},
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
	ids := make([]string, 0, len(messages))

	for _, msg := range messages {
		// Process the message
		err := c.handleConfigMessage(msg.ID, msg.Values)

		if err != nil {
			// Error handling message, don't ack it yet
			fmt.Printf("Error processing config message %s: %v\n", msg.ID, err)
			continue
		}

		// Store ID for acknowledgment
		ids = append(ids, msg.ID)
	}

	// Acknowledge messages if enabled
	if c.config.EnableStreamAck && len(ids) > 0 {
		if err := c.ackMessages(ids); err != nil {
			fmt.Printf("Failed to acknowledge config messages: %v\n", err)
		}
	}
}

// processPendingMessages processes pending messages that haven't been acknowledged
func (c *ConfigConsumer) processPendingMessages() {
	// Read pending messages
	messages, err := c.client.XPendingExt(c.ctx, &redis.XPendingExtArgs{
		Stream:   c.config.ConfigStreamKey,
		Group:    c.config.ConsumerGroup,
		Start:    "-",
		End:      "+",
		Count:    10,
		Consumer: c.config.ConsumerName,
	}).Result()

	if err != nil {
		if err != redis.Nil {
			fmt.Printf("Error reading pending config messages: %v\n", err)
		}
		return
	}

	if len(messages) == 0 {
		return // No pending messages
	}

	// Process pending messages
	ids := make([]string, 0, len(messages))
	claimIDs := make([]string, 0, len(messages))

	// Collect message IDs
	for _, msg := range messages {
		claimIDs = append(claimIDs, msg.ID)
	}

	// Claim messages
	claimed, err := c.client.XClaim(c.ctx, &redis.XClaimArgs{
		Stream:   c.config.ConfigStreamKey,
		Group:    c.config.ConsumerGroup,
		Consumer: c.config.ConsumerName,
		MinIdle:  time.Minute, // Claim messages that have been idle for at least 1 minute
		Messages: claimIDs,
	}).Result()

	if err != nil {
		fmt.Printf("Error claiming pending config messages: %v\n", err)
		return
	}

	// Process claimed messages
	for _, msg := range claimed {
		// Process the message
		err := c.handleConfigMessage(msg.ID, msg.Values)

		if err != nil {
			// Error handling message, don't ack it yet
			fmt.Printf("Error processing pending config message %s: %v\n", msg.ID, err)
			continue
		}

		// Store ID for acknowledgment
		ids = append(ids, msg.ID)
	}

	// Acknowledge messages if enabled
	if c.config.EnableStreamAck && len(ids) > 0 {
		if err := c.ackMessages(ids); err != nil {
			fmt.Printf("Failed to acknowledge pending config messages: %v\n", err)
		}
	}
}

// ackMessages acknowledges messages by ID
func (c *ConfigConsumer) ackMessages(ids []string) error {
	return c.client.XAck(c.ctx, c.config.ConfigStreamKey, c.config.ConsumerGroup, ids...).Err()
}

// handleConfigMessage processes a config message from the Redis stream
func (c *ConfigConsumer) handleConfigMessage(_ string, values map[string]interface{}) error {
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
	newConfig := *c.GetConfig()

	// Update config fields based on the map
	if v, ok := configMap["udpListen"].(string); ok {
		newConfig.UDPListen = v
	}
	if v, ok := configMap["redisURL"].(string); ok {
		newConfig.RedisURL = v
	}
	if v, ok := configMap["rawStreamKey"].(string); ok {
		newConfig.RawStreamKey = v
	}
	if v, ok := configMap["configStreamKey"].(string); ok {
		newConfig.ConfigStreamKey = v
	}
	if v, ok := configMap["consumerGroup"].(string); ok {
		newConfig.ConsumerGroup = v
	}
	if v, ok := configMap["consumerName"].(string); ok {
		newConfig.ConsumerName = v
	}
	if v, ok := configMap["enableRawFileStorage"].(bool); ok {
		newConfig.EnableRawFileStorage = v
	}
	if v, ok := configMap["rawFileDir"].(string); ok {
		newConfig.RawFileDir = v
	}
	if v, ok := configMap["rawFileMaxSize"].(float64); ok {
		newConfig.RawFileMaxSize = int64(v)
	}
	if v, ok := configMap["rawFileMaxAge"].(float64); ok {
		newConfig.RawFileMaxAge = int(v)
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
	if v, ok := configMap["initialBackoffMS"].(float64); ok {
		newConfig.InitialBackoffMS = int(v)
	}
	if v, ok := configMap["maxBackoffMS"].(float64); ok {
		newConfig.MaxBackoffMS = int(v)
	}
	if v, ok := configMap["enableStreamAck"].(bool); ok {
		newConfig.EnableStreamAck = v
	}

	// Send config update
	select {
	case c.updateChan <- &newConfig:
		// Update sent
	default:
		// Channel full, discard update
		fmt.Println("Config update channel full, discarding update")
	}

	return nil
}

// updateConfig updates the current config and notifies handlers
func (c *ConfigConsumer) updateConfig(cfg *config.Config) {
	// Update config
	c.mutex.Lock()
	oldConfig := c.config
	c.config = cfg
	handlers := make([]func(*config.Config), len(c.handlers))
	copy(handlers, c.handlers)
	c.mutex.Unlock()

	// Log the update
	fmt.Printf("Updated configuration: %v -> %v\n", oldConfig, cfg)

	// Notify handlers
	for _, handler := range handlers {
		go handler(cfg)
	}
}

// PublishConfig publishes a config update to the Redis stream
func PublishConfig(ctx context.Context, client *redis.Client, streamKey string, config *config.Config) error {
	// Convert config to map
	configMap := map[string]interface{}{
		"udpListen":            config.UDPListen,
		"redisURL":             config.RedisURL,
		"rawStreamKey":         config.RawStreamKey,
		"configStreamKey":      config.ConfigStreamKey,
		"consumerGroup":        config.ConsumerGroup,
		"consumerName":         config.ConsumerName,
		"enableRawFileStorage": config.EnableRawFileStorage,
		"rawFileDir":           config.RawFileDir,
		"rawFileMaxSize":       config.RawFileMaxSize,
		"rawFileMaxAge":        config.RawFileMaxAge,
		"batchSize":            config.BatchSize,
		"batchIntervalMS":      config.BatchIntervalMS,
		"maxQueueSize":         config.MaxQueueSize,
		"maxRetries":           config.MaxRetries,
		"initialBackoffMS":     config.InitialBackoffMS,
		"maxBackoffMS":         config.MaxBackoffMS,
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
