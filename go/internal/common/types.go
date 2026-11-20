package common

// ConfigProvider provides access to configuration
type ConfigProvider interface {
	GetUDPListenAddr() string
	GetRawStreamKey() string
	GetConfigStreamKey() string
	GetConsumerGroup() string
	GetConsumerName() string
	IsRawFileStorageEnabled() bool
	GetRawFileDir() string
	GetRawFileMaxSize() int64
	GetRawFileMaxAge() int
	GetBatchSize() int
	GetBatchIntervalMS() int
	GetMaxQueueSize() int
	GetMaxRetries() int
	GetInitialBackoffMS() int
	GetMaxBackoffMS() int
	IsStreamAckEnabled() bool
}

// MessageHandler is a function that processes a message
type MessageHandler func(id string, values map[string]interface{}) error
