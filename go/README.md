# MyLaps UDP Forwarder (Go Version)

This is a Go-based implementation of the MyLaps UDP Forwarder, designed to replace the Python version. It's built with efficiency and reliability in mind, leveraging Go's concurrency model for optimal performance.

## Features

- **Efficient UDP Listening**: Receives and processes UDP datagrams from RMonitor/Orbits.
- **Redis Integration**: Forwards processed data to Redis streams.
- **Performance Optimizations**:
  - Micro-batching for Redis operations
  - Pipelined Redis writes for higher throughput
  - Low-latency processing
- **Reliability Features**:
  - Automatic reconnection to Redis
  - Retry mechanism with exponential backoff
  - In-memory queue with overflow protection
- **Two User Interfaces**:
  - GUI application built with Fyne
  - CLI application for headless operation (perfect for services)

## Getting Started

### Prerequisites

- Go 1.21 or higher
- Redis server

### Installation

1. Clone the repository
2. Copy `.env.sample` to `.env` and modify as needed
3. Build the applications:

```bash
cd go
make build
```

This will create two binaries in the `build` directory:
- `mylaps-gui`: GUI application
- `mylaps-cli`: CLI application

### Configuration

The application can be configured using environment variables or a `.env` file:

- `UDP_LISTEN`: UDP listener address (`:5403` by default)
- `REDIS_URL`: Redis connection URL (`redis://localhost:6379/0` by default)
- `RAW_STREAM_KEY`: Redis stream key for raw data (`rmon:raw` by default)
- `BATCH_SIZE`: Number of messages to batch before sending to Redis (100 by default)
- `BATCH_INTERVAL_MS`: Maximum time to wait before flushing batch (50ms by default)
- `MAX_QUEUE_SIZE`: Maximum size of the Redis message queue (10000 by default)
- `MAX_RETRIES`: Maximum retry attempts for Redis operations (10 by default)
- `INITIAL_BACKOFF_MS`: Initial backoff duration for retries (100ms by default)
- `MAX_BACKOFF_MS`: Maximum backoff duration for retries (5000ms by default)

## Usage

### GUI Application

```bash
cd go
make run-gui
```

The GUI application provides a simple interface to start and stop the UDP forwarder, configure settings, and view logs and statistics.

### CLI Application

```bash
cd go
make run-cli
```

The CLI application is designed for headless operation and can be used as a service.

## Architecture

The application is structured as follows:

- **Config**: Loads and validates configuration from environment variables or `.env` file.
- **UDP**: Listens for UDP packets, processes them, and forwards to Redis.
- **Redis**: Manages Redis connection, batching, and retries.
- **UI**: Provides a GUI interface using Fyne.

## Data Flow

1. UDP packets are received by the UDP listener.
2. Each datagram is split into lines (separated by `\r?\n`).
3. Each line starting with `$` is processed:
   - Message type is extracted (before the first comma).
   - Timestamp is added.
   - Message is sent to Redis queue.
4. Redis writer batches messages and sends them to Redis.
5. If Redis is unavailable, messages are queued in memory and retried with backoff.

## Improvements over Python Version

- **Performance**: Written in Go for better concurrency and lower overhead.
- **Reliability**: Built-in retry mechanism and reconnection logic.
- **Configuration**: More flexible configuration options.
- **Maintainability**: Better code structure and error handling.
- **Deployability**: Single binary, no dependencies, easy to deploy.

## License

This project is licensed under the MIT License - see the LICENSE file for details.