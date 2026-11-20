package redis

// Package redis provides functionality for interacting with Redis

import (
	"context"
	"errors"
	"fmt"
	"math"
	"math/rand"
	"sync"
	"time"

	"github.com/amirandap/mylaps-mvp2/go/internal/config"
	"github.com/go-redis/redis/v8"
)

// MessageType represents the message type for Redis
type MessageType string

const (
	// UnknownMessage represents an unknown message type
	UnknownMessage MessageType = "$UNK"
)

// Message represents a message to be sent to Redis
type Message struct {
	Type      MessageType
	Line      string
	Timestamp int64
}

// Client is a Redis client with batching capabilities
type Client struct {
	client         *redis.Client
	config         *config.Config
	messages       []Message
	mutex          sync.Mutex
	queue          chan Message
	quit           chan struct{}
	wg             sync.WaitGroup
	streamKey      string
	reconnecting   bool
	reconnectMutex sync.Mutex
	ctx            context.Context
}

// NewClient creates a new Redis client
func NewClient(ctx context.Context, cfg *config.Config) (*Client, error) {
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

	client := &Client{
		client:    redisClient,
		config:    cfg,
		messages:  make([]Message, 0, cfg.BatchSize),
		queue:     make(chan Message, cfg.MaxQueueSize),
		quit:      make(chan struct{}),
		streamKey: cfg.RawStreamKey,
		ctx:       ctx,
	}

	// Start background worker
	client.wg.Add(1)
	go client.processBatches()

	return client, nil
}

// Close closes the Redis client and waits for all operations to complete
func (c *Client) Close() error {
	// Signal the worker to stop
	close(c.quit)

	// Wait for worker to finish
	c.wg.Wait()

	// Close Redis connection
	return c.client.Close()
}

// Send sends a message to Redis (queues it for batching)
func (c *Client) Send(msg Message) error {
	// If queue is full, discard oldest messages
	select {
	case c.queue <- msg:
		// Message enqueued
		return nil
	default:
		// Queue is full, discard oldest message and try again
		select {
		case <-c.queue:
			select {
			case c.queue <- msg:
				return nil
			default:
				return errors.New("failed to enqueue message after discarding oldest")
			}
		default:
			return errors.New("queue is full and failed to discard oldest message")
		}
	}
}

// SendBatch sends a batch of messages to Redis immediately
func (c *Client) SendBatch(messages []Message) error {
	if len(messages) == 0 {
		return nil
	}

	// Create a pipeline
	pipe := c.client.Pipeline()

	// Add XADD commands to pipeline
	for _, msg := range messages {
		pipe.XAdd(c.ctx, &redis.XAddArgs{
			Stream: c.streamKey,
			Values: map[string]interface{}{
				"type": string(msg.Type),
				"line": msg.Line,
				"ts":   msg.Timestamp,
			},
		})
	}

	// Execute pipeline
	_, err := pipe.Exec(c.ctx)
	return err
}

// processBatches processes message batches in the background
func (c *Client) processBatches() {
	defer c.wg.Done()

	ticker := time.NewTicker(time.Duration(c.config.BatchIntervalMS) * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-c.quit:
			// Flush remaining messages before quitting
			c.flushBatch()
			return
		case msg := <-c.queue:
			// Add message to batch
			c.mutex.Lock()
			c.messages = append(c.messages, msg)

			// If batch is full, flush it
			if len(c.messages) >= c.config.BatchSize {
				c.flushBatchLocked()
			}
			c.mutex.Unlock()
		case <-ticker.C:
			// Time-based flush
			c.flushBatch()
		}
	}
}

// flushBatch flushes the current batch of messages to Redis
func (c *Client) flushBatch() {
	c.mutex.Lock()
	defer c.mutex.Unlock()
	c.flushBatchLocked()
}

// flushBatchLocked flushes the current batch of messages to Redis (assumes mutex is already held)
func (c *Client) flushBatchLocked() {
	if len(c.messages) == 0 {
		return
	}

	// Create a copy of the messages to send
	messages := make([]Message, len(c.messages))
	copy(messages, c.messages)

	// Clear the batch
	c.messages = c.messages[:0]

	// Send the batch with retries
	go c.sendWithRetries(messages)
}

// sendWithRetries sends a batch of messages to Redis with retries and exponential backoff
func (c *Client) sendWithRetries(messages []Message) {
	var err error
	attempts := 0
	backoff := float64(c.config.InitialBackoffMS)

	for attempts < c.config.MaxRetries {
		err = c.SendBatch(messages)
		if err == nil {
			return
		}

		attempts++

		// Check if we should retry
		if attempts >= c.config.MaxRetries {
			break
		}

		// Calculate backoff duration with exponential increase and jitter
		jitter := 0.1 * backoff * (1.0 - 2.0*rand.Float64())
		sleepMS := backoff + jitter
		time.Sleep(time.Duration(sleepMS) * time.Millisecond)

		// Increase backoff for next attempt
		backoff = math.Min(float64(c.config.MaxBackoffMS), backoff*2.0)

		// Try to reconnect if we're not already reconnecting
		c.tryReconnect()
	}

	// If we've exhausted retries, log the error
	if err != nil {
		fmt.Printf("Failed to send messages to Redis after %d attempts: %v\n", attempts, err)
	}
}

// tryReconnect tries to reconnect to Redis if not already reconnecting
func (c *Client) tryReconnect() {
	c.reconnectMutex.Lock()
	defer c.reconnectMutex.Unlock()

	// If already reconnecting, skip
	if c.reconnecting {
		return
	}

	c.reconnecting = true
	defer func() { c.reconnecting = false }()

	// Test connection
	err := c.client.Ping(c.ctx).Err()
	if err == nil {
		return // Connection is good
	}

	fmt.Printf("Lost Redis connection, attempting to reconnect: %v\n", err)

	// Parse Redis URL and create new client
	options, err := redis.ParseURL(c.config.RedisURL)
	if err != nil {
		fmt.Printf("Failed to parse Redis URL for reconnection: %v\n", err)
		return
	}

	newClient := redis.NewClient(options)

	// Test new connection
	if err := newClient.Ping(c.ctx).Err(); err != nil {
		fmt.Printf("Failed to reconnect to Redis: %v\n", err)
		newClient.Close()
		return
	}

	// Replace client
	oldClient := c.client
	c.client = newClient
	oldClient.Close()

	fmt.Println("Successfully reconnected to Redis")
}

// DetectMessageType detects the message type from a line
func DetectMessageType(line string) MessageType {
	if len(line) == 0 {
		return UnknownMessage
	}

	// Find first comma
	idx := -1
	for i, c := range line {
		if c == ',' {
			idx = i
			break
		}
	}

	if idx < 0 {
		// No comma found, use whole line
		if line[0] == '$' {
			return MessageType(line)
		}
		return UnknownMessage
	}

	// Extract type before first comma
	typeStr := line[:idx]
	if len(typeStr) > 0 && typeStr[0] == '$' {
		return MessageType(typeStr)
	}

	return UnknownMessage
}
