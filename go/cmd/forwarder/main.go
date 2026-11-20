package main

// Package main provides a CLI version of the UDP forwarder

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/amirandap/mylaps-mvp2/go/internal/config"
	"github.com/amirandap/mylaps-mvp2/go/internal/redis"
	"github.com/amirandap/mylaps-mvp2/go/internal/udp"
	"github.com/amirandap/mylaps-mvp2/go/internal/watcher"
)

func main() {
	// Parse command-line flags
	showVersion := flag.Bool("version", false, "Show version information")
	flag.Parse()

	// Show version if requested
	if *showVersion {
		fmt.Println("MyLaps UDP Forwarder v1.0.0")
		os.Exit(0)
	}

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		fmt.Printf("Failed to load configuration: %v\n", err)
		os.Exit(1)
	}

	// Print configuration
	fmt.Println("MyLaps UDP Forwarder v1.0.0")
	fmt.Println("----------------------------")
	fmt.Println("Configuration:")
	fmt.Printf("  UDP Listen: %s\n", cfg.GetUDPListenAddr())
	fmt.Printf("  Redis URL: %s\n", cfg.RedisURL)
	fmt.Printf("  Raw Stream Key: %s\n", cfg.GetRawStreamKey())
	fmt.Printf("  Config Stream Key: %s\n", cfg.GetConfigStreamKey())
	fmt.Printf("  Consumer Group: %s\n", cfg.GetConsumerGroup())
	fmt.Printf("  Consumer Name: %s\n", cfg.GetConsumerName())
	fmt.Printf("  Raw File Storage: %v\n", cfg.IsRawFileStorageEnabled())
	if cfg.IsRawFileStorageEnabled() {
		fmt.Printf("  Raw File Directory: %s\n", cfg.GetRawFileDir())
		fmt.Printf("  Raw File Max Size: %d bytes\n", cfg.GetRawFileMaxSize())
		fmt.Printf("  Raw File Max Age: %d hours\n", cfg.GetRawFileMaxAge())
	}
	fmt.Printf("  Batch Size: %d\n", cfg.GetBatchSize())
	fmt.Printf("  Batch Interval: %dms\n", cfg.GetBatchIntervalMS())
	fmt.Printf("  Max Queue Size: %d\n", cfg.GetMaxQueueSize())
	fmt.Printf("  Stream Acknowledgment: %v\n", cfg.IsStreamAckEnabled())
	fmt.Println()

	// Create context
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Create Redis client
	fmt.Println("Connecting to Redis...")
	redisClient, err := redis.NewClient(ctx, cfg)
	if err != nil {
		fmt.Printf("Failed to connect to Redis: %v\n", err)
		os.Exit(1)
	}
	defer redisClient.Close()
	fmt.Println("Connected to Redis")

	// Start config watcher
	fmt.Println("Starting config watcher...")
	configWatcher, err := watcher.NewConfigConsumer(ctx, cfg)
	if err != nil {
		fmt.Printf("Failed to create config watcher: %v\n", err)
		os.Exit(1)
	}
	defer configWatcher.Close()
	fmt.Println("Config watcher started")

	// Create UDP listener
	fmt.Println("Starting UDP listener...")
	listener, err := udp.NewListener(cfg, redisClient)
	if err != nil {
		fmt.Printf("Failed to create UDP listener: %v\n", err)
		os.Exit(1)
	}

	if err := listener.Start(); err != nil {
		fmt.Printf("Failed to start UDP listener: %v\n", err)
		os.Exit(1)
	}
	defer listener.Stop()
	fmt.Printf("UDP listener started on %s\n", cfg.GetUDPListenAddr())

	// Set up signal handling for graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	// Start statistics reporting
	statsTicker := time.NewTicker(5 * time.Second)
	defer statsTicker.Stop()

	fmt.Println("\nUDP forwarder is running. Press Ctrl+C to stop.")
	fmt.Println("----------------------------")

	// Main loop
	for {
		select {
		case <-sigCh:
			fmt.Println("\nShutting down...")
			return
		case <-statsTicker.C:
			stats := listener.GetStats()

			elapsed := time.Since(stats.StartTime).Seconds()
			packetsPerSec := float64(stats.PacketsReceived) / elapsed
			bytesPerSec := float64(stats.BytesReceived) / elapsed
			linesPerSec := float64(stats.LinesProcessed) / elapsed

			fmt.Printf("Stats: %d packets (%.2f/s) | %d bytes (%.2f/s) | %d lines (%.2f/s)\n",
				stats.PacketsReceived, packetsPerSec,
				stats.BytesReceived, bytesPerSec,
				stats.LinesProcessed, linesPerSec)
		}
	}
}
