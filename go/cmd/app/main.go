package main

// Package main provides the entry point for the application

import (
	"context"
	"fmt"
	"os"

	"fyne.io/fyne/v2/app"
	"github.com/amirandap/mylaps-mvp2/go/internal/config"
	"github.com/amirandap/mylaps-mvp2/go/internal/ui"
	"github.com/amirandap/mylaps-mvp2/go/internal/watcher"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		fmt.Printf("Failed to load configuration: %v\n", err)
		os.Exit(1)
	}

	// Create context for background operations
	ctx := context.Background()

	// Create application
	a := app.New()

	// Apply custom theme for better text visibility
	a.Settings().SetTheme(ui.NewCustomTheme())

	// Create main window
	mainWindow := ui.NewMainWindow(a, cfg)

	// Create config consumer for Redis stream updates
	configConsumer, err := watcher.NewConfigConsumer(ctx, cfg)
	if err != nil {
		fmt.Printf("Warning: Failed to create config consumer: %v\n", err)
		fmt.Println("Configuration updates from Redis stream will not be available")
	} else {
		// Register handler to update UI when config changes from Redis
		configConsumer.AddHandler(func(newConfig *config.Config) {
			// Update the main window's configuration
			mainWindow.UpdateConfigFromRedis(newConfig)
		})
		fmt.Println("Config consumer started - listening for Redis stream updates")
	}

	// Show and run
	mainWindow.Window.ShowAndRun()

	// Clean up
	if configConsumer != nil {
		configConsumer.Close()
	}
}
