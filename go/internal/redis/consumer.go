package redis

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/amirandap/mylaps-mvp2/go/internal/config"
	"github.com/go-redis/redis/v8"
)

// MessageHandler is a function that processes a Redis stream message
type MessageHandler func(ctx context.Context, id string, values map[string]interface{}) error

// Consumer is a Redis stream consumer with acknowledgment
type Consumer struct {
	client     *redis.Client
	config     *config.Config
	streamKey  string
	groupName  string
	consumerID string
	mutex      sync.Mutex
	quit       chan struct{}
	wg         sync.WaitGroup
	ctx        context.Context
	pendingIDs []string
}

// NewConsumer creates a new Redis stream consumer
func NewConsumer(ctx context.Context, cfg *config.Config, streamKey, groupName, consumerID string) (*Consumer, error) {
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

	consumer := &Consumer{
		client:     redisClient,
		config:     cfg,
		streamKey:  streamKey,
		groupName:  groupName,
		consumerID: consumerID,
		pendingIDs: make([]string, 0, 100),
		quit:       make(chan struct{}),
		ctx:        ctx,
	}

	// Try to create the consumer group if it doesn't exist
	err = consumer.createGroup()
	if err != nil {
		redisClient.Close()
		return nil, fmt.Errorf("failed to create consumer group: %w", err)
	}

	return consumer, nil
}

// createGroup creates a consumer group if it doesn't exist
func (c *Consumer) createGroup() error {
	// Check if the stream exists
	exists, err := c.client.Exists(c.ctx, c.streamKey).Result()
	if err != nil {
		return err
	}

	// If stream doesn't exist, we need to create it with MKSTREAM
	if exists == 0 {
		err = c.client.XGroupCreateMkStream(c.ctx, c.streamKey, c.groupName, "0").Err()
		if err != nil && err.Error() != "BUSYGROUP Consumer Group name already exists" {
			return err
		}
		return nil
	}

	// Stream exists, try to create group
	err = c.client.XGroupCreate(c.ctx, c.streamKey, c.groupName, "0").Err()
	if err != nil && err.Error() != "BUSYGROUP Consumer Group name already exists" {
		return err
	}

	return nil
}

// Close closes the consumer and waits for all operations to complete
func (c *Consumer) Close() error {
	// Signal all workers to stop
	close(c.quit)

	// Wait for workers to finish
	c.wg.Wait()

	// Ack any remaining pending messages
	if c.config.IsStreamAckEnabled() && len(c.pendingIDs) > 0 {
		c.mutex.Lock()
		if len(c.pendingIDs) > 0 {
			c.ackMessages(c.pendingIDs)
			c.pendingIDs = c.pendingIDs[:0]
		}
		c.mutex.Unlock()
	}

	// Close Redis connection
	return c.client.Close()
}

// ConsumeBatch consumes a batch of messages from the Redis stream
func (c *Consumer) ConsumeBatch(count int, timeout time.Duration, handler MessageHandler) error {
	// Read new messages
	streams, err := c.client.XReadGroup(c.ctx, &redis.XReadGroupArgs{
		Group:    c.groupName,
		Consumer: c.consumerID,
		Streams:  []string{c.streamKey, ">"},
		Count:    int64(count),
		Block:    timeout,
	}).Result()

	if err != nil {
		if err == redis.Nil {
			return nil // No messages
		}
		return err
	}

	if len(streams) == 0 {
		return nil // No messages
	}

	// Process messages
	messages := streams[0].Messages
	ids := make([]string, 0, len(messages))

	for _, msg := range messages {
		// Process the message
		err := handler(c.ctx, msg.ID, msg.Values)

		if err != nil {
			// Error handling message, don't ack it yet
			fmt.Printf("Error processing message %s: %v\n", msg.ID, err)
			continue
		}

		// Store ID for acknowledgment
		ids = append(ids, msg.ID)
	}

	// Acknowledge messages if enabled
	if c.config.IsStreamAckEnabled() && len(ids) > 0 {
		if err := c.ackMessages(ids); err != nil {
			fmt.Printf("Failed to acknowledge messages: %v\n", err)

			// Store IDs for later acknowledgment
			c.mutex.Lock()
			c.pendingIDs = append(c.pendingIDs, ids...)
			c.mutex.Unlock()
		}
	}

	return nil
}

// StartConsumer starts a background consumer with the given handler
func (c *Consumer) StartConsumer(batchSize int, interval time.Duration, handler MessageHandler) {
	c.wg.Add(1)
	go func() {
		defer c.wg.Done()

		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-c.quit:
				return
			case <-ticker.C:
				err := c.ConsumeBatch(batchSize, 0, handler)
				if err != nil {
					fmt.Printf("Error consuming messages: %v\n", err)
				}

				// Ack any pending messages
				if c.config.IsStreamAckEnabled() {
					c.mutex.Lock()
					if len(c.pendingIDs) > 0 {
						if err := c.ackMessages(c.pendingIDs); err == nil {
							c.pendingIDs = c.pendingIDs[:0]
						}
					}
					c.mutex.Unlock()
				}
			}
		}
	}()
}

// ackMessages acknowledges messages by ID
func (c *Consumer) ackMessages(ids []string) error {
	return c.client.XAck(c.ctx, c.streamKey, c.groupName, ids...).Err()
}

// ProcessPending processes pending messages that haven't been acknowledged
func (c *Consumer) ProcessPending(count int, handler MessageHandler) error {
	// Read pending messages
	messages, err := c.client.XPendingExt(c.ctx, &redis.XPendingExtArgs{
		Stream:   c.streamKey,
		Group:    c.groupName,
		Start:    "-",
		End:      "+",
		Count:    int64(count),
		Consumer: c.consumerID,
	}).Result()

	if err != nil {
		if err == redis.Nil {
			return nil // No pending messages
		}
		return err
	}

	if len(messages) == 0 {
		return nil // No pending messages
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
		Stream:   c.streamKey,
		Group:    c.groupName,
		Consumer: c.consumerID,
		MinIdle:  time.Minute, // Claim messages that have been idle for at least 1 minute
		Messages: claimIDs,
	}).Result()

	if err != nil {
		return err
	}

	// Process claimed messages
	for _, msg := range claimed {
		// Process the message
		err := handler(c.ctx, msg.ID, msg.Values)

		if err != nil {
			// Error handling message, don't ack it yet
			fmt.Printf("Error processing pending message %s: %v\n", msg.ID, err)
			continue
		}

		// Store ID for acknowledgment
		ids = append(ids, msg.ID)
	}

	// Acknowledge messages if enabled
	if c.config.IsStreamAckEnabled() && len(ids) > 0 {
		if err := c.ackMessages(ids); err != nil {
			fmt.Printf("Failed to acknowledge pending messages: %v\n", err)

			// Store IDs for later acknowledgment
			c.mutex.Lock()
			c.pendingIDs = append(c.pendingIDs, ids...)
			c.mutex.Unlock()
		}
	}

	return nil
}

// StartPendingProcessor starts a background processor for pending messages
func (c *Consumer) StartPendingProcessor(batchSize int, interval time.Duration, handler MessageHandler) {
	c.wg.Add(1)
	go func() {
		defer c.wg.Done()

		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-c.quit:
				return
			case <-ticker.C:
				err := c.ProcessPending(batchSize, handler)
				if err != nil {
					fmt.Printf("Error processing pending messages: %v\n", err)
				}
			}
		}
	}()
}
