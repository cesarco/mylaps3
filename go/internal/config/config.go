package config

// Package config provides configuration options for the application

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

// Config holds the application configuration
type Config struct {
	// UDP listener address (host:port)
	UDPListen string
	// Redis URL for connection
	RedisURL string
	// Redis stream key for raw data
	RawStreamKey string
	// Redis stream key for configuration updates
	ConfigStreamKey string
	// Redis consumer group for stream processing
	ConsumerGroup string
	// Redis consumer name for stream processing
	ConsumerName string
	// Enable/disable storing raw UDP data to files
	EnableRawFileStorage bool
	// Directory for storing raw UDP data files
	RawFileDir string
	// Maximum size of raw files before rotation (in bytes)
	RawFileMaxSize int64
	// Maximum age of raw files before rotation (in hours)
	RawFileMaxAge int
	// Batch size for Redis writes
	BatchSize int
	// Batch interval in milliseconds
	BatchIntervalMS int
	// Maximum queue size for Redis messages
	MaxQueueSize int
	// Maximum retry attempts for Redis operations
	MaxRetries int
	// Initial backoff duration in milliseconds
	InitialBackoffMS int
	// Maximum backoff duration in milliseconds
	MaxBackoffMS int
	// Enable/disable Redis stream acknowledgments
	EnableStreamAck bool
}

// Load loads configuration from environment variables and .env file
func Load() (*Config, error) {
	// Try to load .env file, ignore error if not found
	_ = godotenv.Load()

	// Get default raw file directory (current directory + /logs)
	defaultRawFileDir, err := os.Getwd()
	if err != nil {
		defaultRawFileDir = "."
	}
	defaultRawFileDir = filepath.Join(defaultRawFileDir, "logs")

	config := &Config{
		UDPListen:            getEnv("UDP_LISTEN", ":5403"),
		RedisURL:             getEnv("REDIS_URL", "redis://localhost:6379/0"),
		RawStreamKey:         getEnv("RAW_STREAM_KEY", "rmon:raw"),
		ConfigStreamKey:      getEnv("CONFIG_STREAM_KEY", "rmon:config"),
		ConsumerGroup:        getEnv("CONSUMER_GROUP", "mylaps-forwarder"),
		ConsumerName:         getEnv("CONSUMER_NAME", getHostname()),
		EnableRawFileStorage: getEnvAsBool("ENABLE_RAW_FILE_STORAGE", true),
		RawFileDir:           getEnv("RAW_FILE_DIR", defaultRawFileDir),
		RawFileMaxSize:       getEnvAsInt64("RAW_FILE_MAX_SIZE", 100*1024*1024), // 100MB by default
		RawFileMaxAge:        getEnvAsInt("RAW_FILE_MAX_AGE", 24),               // 24 hours by default
		BatchSize:            getEnvAsInt("BATCH_SIZE", 100),
		BatchIntervalMS:      getEnvAsInt("BATCH_INTERVAL_MS", 50),
		MaxQueueSize:         getEnvAsInt("MAX_QUEUE_SIZE", 10000),
		MaxRetries:           getEnvAsInt("MAX_RETRIES", 10),
		InitialBackoffMS:     getEnvAsInt("INITIAL_BACKOFF_MS", 100),
		MaxBackoffMS:         getEnvAsInt("MAX_BACKOFF_MS", 5000),
		EnableStreamAck:      getEnvAsBool("ENABLE_STREAM_ACK", true),
	}

	return config, nil
}

// getEnv returns the value of an environment variable or a default value if not found
func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists && value != "" {
		return value
	}
	return defaultValue
}

// getEnvAsInt returns the value of an environment variable as an integer or a default value if not found
func getEnvAsInt(key string, defaultValue int) int {
	if value, exists := os.LookupEnv(key); exists && value != "" {
		if i, err := parseInt(value); err == nil {
			return i
		}
	}
	return defaultValue
}

// parseInt tries to parse a string as an integer
func parseInt(value string) (int, error) {
	var result int
	_, err := fmt.Sscanf(value, "%d", &result)
	return result, err
}

// parseInt64 tries to parse a string as a 64-bit integer
func parseInt64(value string) (int64, error) {
	return strconv.ParseInt(value, 10, 64)
}

// getEnvAsInt64 returns the value of an environment variable as a 64-bit integer or a default value if not found
func getEnvAsInt64(key string, defaultValue int64) int64 {
	if value, exists := os.LookupEnv(key); exists && value != "" {
		if i, err := parseInt64(value); err == nil {
			return i
		}
	}
	return defaultValue
}

// getEnvAsBool returns the value of an environment variable as a boolean or a default value if not found
func getEnvAsBool(key string, defaultValue bool) bool {
	if value, exists := os.LookupEnv(key); exists && value != "" {
		v := strings.ToLower(value)
		return v == "true" || v == "1" || v == "yes" || v == "y"
	}
	return defaultValue
}

// getHostname returns the hostname of the machine or a default if not available
func getHostname() string {
	hostname, err := os.Hostname()
	if err != nil {
		return "unknown-host"
	}
	return hostname
}

// GetUDPListenAddr returns the UDP listener address, handling the case when only the port is specified
func (c *Config) GetUDPListenAddr() string {
	// If it's just a port number with a colon prefix, return it as is
	if strings.HasPrefix(c.UDPListen, ":") {
		return c.UDPListen
	}

	// If it doesn't have a colon, assume it's just a port number
	if !strings.Contains(c.UDPListen, ":") {
		return ":" + c.UDPListen
	}

	// Otherwise, return as is (host:port format)
	return c.UDPListen
}

// GetRawStreamKey returns the Redis stream key for raw data
func (c *Config) GetRawStreamKey() string {
	return c.RawStreamKey
}

// GetConfigStreamKey returns the Redis stream key for configuration updates
func (c *Config) GetConfigStreamKey() string {
	return c.ConfigStreamKey
}

// GetConsumerGroup returns the Redis consumer group name
func (c *Config) GetConsumerGroup() string {
	return c.ConsumerGroup
}

// GetConsumerName returns the Redis consumer name
func (c *Config) GetConsumerName() string {
	return c.ConsumerName
}

// IsRawFileStorageEnabled returns whether raw UDP data should be stored in files
func (c *Config) IsRawFileStorageEnabled() bool {
	return c.EnableRawFileStorage
}

// GetRawFileDir returns the directory for storing raw UDP data files
func (c *Config) GetRawFileDir() string {
	return c.RawFileDir
}

// GetRawFileMaxSize returns the maximum size for raw files before rotation
func (c *Config) GetRawFileMaxSize() int64 {
	return c.RawFileMaxSize
}

// GetRawFileMaxAge returns the maximum age for raw files before rotation
func (c *Config) GetRawFileMaxAge() int {
	return c.RawFileMaxAge
}

// GetBatchSize returns the batch size for Redis writes
func (c *Config) GetBatchSize() int {
	return c.BatchSize
}

// GetBatchIntervalMS returns the batch interval in milliseconds
func (c *Config) GetBatchIntervalMS() int {
	return c.BatchIntervalMS
}

// GetMaxQueueSize returns the maximum queue size for Redis messages
func (c *Config) GetMaxQueueSize() int {
	return c.MaxQueueSize
}

// GetMaxRetries returns the maximum retry attempts for Redis operations
func (c *Config) GetMaxRetries() int {
	return c.MaxRetries
}

// GetInitialBackoffMS returns the initial backoff duration in milliseconds
func (c *Config) GetInitialBackoffMS() int {
	return c.InitialBackoffMS
}

// GetMaxBackoffMS returns the maximum backoff duration in milliseconds
func (c *Config) GetMaxBackoffMS() int {
	return c.MaxBackoffMS
}

// IsStreamAckEnabled returns whether Redis stream acknowledgments are enabled
func (c *Config) IsStreamAckEnabled() bool {
	return c.EnableStreamAck
}
