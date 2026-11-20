package ui

// Package ui provides UI components for the application

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"

	"github.com/amirandap/mylaps-mvp2/go/internal/config"
	"github.com/amirandap/mylaps-mvp2/go/internal/redis"
	"github.com/amirandap/mylaps-mvp2/go/internal/udp"
	"github.com/amirandap/mylaps-mvp2/go/internal/watcher"
	goredis "github.com/go-redis/redis/v8"
	"github.com/joho/godotenv"
)

// MainWindow represents the main application window
type MainWindow struct {
	Window      fyne.Window
	Config      *config.Config
	RedisClient *redis.Client
	UDPListener *udp.Listener

	// UI components
	logTextArea    *widget.Entry
	statusLabel    *widget.Label
	startButton    *widget.Button
	stopButton     *widget.Button
	udpHostEntry   *widget.Entry
	udpPortEntry   *widget.Entry
	redisURLEntry  *widget.Entry
	streamKeyEntry *widget.Entry

	// Function handlers
	handlePortFormat func(string) string

	// Advanced settings components
	batchSizeEntry     *widget.Entry
	batchIntervalEntry *widget.Entry
	maxQueueSizeEntry  *widget.Entry
	maxRetriesEntry    *widget.Entry
	rawFileDirEntry    *widget.Entry
	consumerGroupEntry *widget.Entry
	consumerNameEntry  *widget.Entry

	// Redis URL management
	redisUsername string
	redisPassword string
	redisHost     string

	// Stats
	statsTimer *time.Ticker
	isRunning  bool
}

// NewMainWindow creates a new main window
func NewMainWindow(app fyne.App, cfg *config.Config) *MainWindow {
	window := app.NewWindow("MyLaps UDP Forwarder")

	mainWindow := &MainWindow{
		Window:    window,
		Config:    cfg,
		isRunning: false,
	}

	// Create UI
	mainWindow.createUI()

	// Removed auto-start to allow user to edit configuration before starting
	// Users can now click "Start Forwarder" button manually

	return mainWindow
}

// createUI creates the UI components
func (m *MainWindow) createUI() {
	// Title and header with larger font size for better visibility
	titleLabel := widget.NewLabelWithStyle("MyLaps UDP Forwarder", fyne.TextAlignCenter, fyne.TextStyle{Bold: true})
	titleLabel.TextStyle.Monospace = false
	titleLabel.Importance = widget.HighImportance

	// Update UDP port handler before creating the config card
	m.handlePortFormat = func(input string) string {
		// Strip colon prefix if user adds it
		return strings.TrimPrefix(input, ":")
	}

	// Config section with better styling
	configCard := m.createConfigCard()

	// Control section
	controlCard := m.createControlCard()

	// Status section
	statusCard := m.createStatusCard()

	// Log section
	logCard := m.createLogCard()

	// Advanced config section
	advancedConfigCard := m.createAdvancedConfigCard()

	// Main layout with cards
	content := container.NewVBox(
		container.NewPadded(titleLabel),
		widget.NewSeparator(),
		configCard,
		widget.NewSeparator(),
		controlCard,
		widget.NewSeparator(),
		statusCard,
		widget.NewSeparator(),
		logCard,
		widget.NewSeparator(),
		advancedConfigCard,
	)

	m.Window.SetContent(container.NewPadded(content))
	m.Window.Resize(fyne.NewSize(800, 600))

	// Set up close handler
	m.Window.SetCloseIntercept(m.handleClose)

	// Add log
	m.log("🚀 Application started - Configure settings and click 'Start Forwarder' to begin")
}

// createConfigCard creates the configuration section
func (m *MainWindow) createConfigCard() *fyne.Container {
	configLabel := widget.NewLabelWithStyle("⚙️ Configuration", fyne.TextAlignLeading, fyne.TextStyle{Bold: true})
	configLabel.Importance = widget.HighImportance

	// Parse current UDP listen address to separate host and port
	udpHost, udpPort := m.parseUDPAddress(m.Config.GetUDPListenAddr())

	udpHostLabel := widget.NewLabel("UDP Host/IP:")
	udpHostLabel.TextStyle.Bold = true
	m.udpHostEntry = widget.NewEntry()
	m.udpHostEntry.SetText(udpHost)
	m.udpHostEntry.SetPlaceHolder("0.0.0.0")

	udpPortLabel := widget.NewLabel("UDP Port:")
	udpPortLabel.TextStyle.Bold = true
	// Create the port entry field
	m.udpPortEntry = widget.NewEntry()
	m.udpPortEntry.SetText(udpPort)
	m.udpPortEntry.SetPlaceHolder("5403")

	// Add validation to ensure numeric input for port
	m.udpPortEntry.Validator = func(s string) error {
		if s == "" {
			return nil // Allow empty
		}
		if _, err := strconv.Atoi(s); err != nil {
			return errors.New("must be a number")
		}
		return nil
	}

	// Set maximum visible width for the port field
	m.udpPortEntry.TextStyle = fyne.TextStyle{Monospace: true}

	redisURLLabel := widget.NewLabel("Redis URL:")
	redisURLLabel.TextStyle.Bold = true
	m.redisURLEntry = widget.NewEntry()

	// Parse the Redis URL to extract components
	m.redisUsername, m.redisPassword, m.redisHost = m.parseRedisURL(m.Config.RedisURL)

	// Display only the host part in the UI
	m.redisURLEntry.SetText(m.redisHost)
	m.redisURLEntry.SetPlaceHolder("localhost:6379/0")

	streamKeyLabel := widget.NewLabel("Stream Key:")
	streamKeyLabel.TextStyle.Bold = true
	m.streamKeyEntry = widget.NewEntry()
	m.streamKeyEntry.SetText(m.Config.RawStreamKey)
	m.streamKeyEntry.SetPlaceHolder("mylaps:stream")

	configGrid := container.New(layout.NewFormLayout(),
		udpHostLabel, m.udpHostEntry,
		udpPortLabel, m.udpPortEntry,
		redisURLLabel, m.redisURLEntry,
		streamKeyLabel, m.streamKeyEntry,
	)

	return container.NewVBox(
		configLabel,
		widget.NewSeparator(),
		container.NewPadded(configGrid),
	)
}

// createControlCard creates the control buttons section
func (m *MainWindow) createControlCard() *fyne.Container {
	controlLabel := widget.NewLabelWithStyle("🎮 Controls", fyne.TextAlignLeading, fyne.TextStyle{Bold: true})
	controlLabel.Importance = widget.HighImportance

	m.startButton = widget.NewButtonWithIcon("▶️ Start Forwarder", theme.MediaPlayIcon(), m.handleStart)
	m.stopButton = widget.NewButtonWithIcon("⏹️ Stop Forwarder", theme.MediaStopIcon(), m.handleStop)
	m.stopButton.Disable()

	// Additional control buttons
	clearLogButton := widget.NewButtonWithIcon("🗑️ Clear Log", theme.ContentClearIcon(), m.handleClearLog)
	saveConfigButton := widget.NewButtonWithIcon("💾 Save Config", theme.DocumentSaveIcon(), m.handleSaveConfig)
	publishConfigButton := widget.NewButtonWithIcon("📡 Publish Config", theme.MailSendIcon(), m.handlePublishConfig)
	systemInfoButton := widget.NewButtonWithIcon("ℹ️ System Info", theme.InfoIcon(), m.handleSystemInfo)

	buttonsRow1 := container.NewHBox(
		m.startButton,
		m.stopButton,
	)

	buttonsRow2 := container.NewHBox(
		clearLogButton,
		saveConfigButton,
		publishConfigButton,
		systemInfoButton,
	)

	return container.NewVBox(
		controlLabel,
		widget.NewSeparator(),
		container.NewPadded(buttonsRow1),
		container.NewPadded(buttonsRow2),
	)
}

// createStatusCard creates the status display section
func (m *MainWindow) createStatusCard() *fyne.Container {
	statusLabel := widget.NewLabelWithStyle("📊 Status", fyne.TextAlignLeading, fyne.TextStyle{Bold: true})
	statusLabel.Importance = widget.HighImportance

	m.statusLabel = widget.NewLabel("⏳ Ready to start")
	m.statusLabel.TextStyle.Monospace = true
	m.statusLabel.TextStyle.Bold = true
	m.statusLabel.Importance = widget.HighImportance

	statusBox := container.New(layout.NewHBoxLayout(),
		widget.NewIcon(theme.InfoIcon()),
		m.statusLabel,
	)

	return container.NewVBox(
		statusLabel,
		widget.NewSeparator(),
		container.NewPadded(statusBox),
	)
}

// createLogCard creates the log display section
func (m *MainWindow) createLogCard() *fyne.Container {
	logLabel := widget.NewLabelWithStyle("📝 Activity Log", fyne.TextAlignLeading, fyne.TextStyle{Bold: true})
	logLabel.Importance = widget.HighImportance

	// Create a multiline entry with improved visibility
	m.logTextArea = widget.NewMultiLineEntry()
	m.logTextArea.Disable()
	m.logTextArea.SetPlaceHolder("Application logs will appear here...")

	// Improve readability with monospace font and better styling - increased text size and contrast
	m.logTextArea.TextStyle = fyne.TextStyle{
		Monospace: true,
		Bold:      true,
	}

	logScroll := container.NewScroll(m.logTextArea)
	logScroll.SetMinSize(fyne.NewSize(0, 150))

	return container.NewVBox(
		logLabel,
		widget.NewSeparator(),
		logScroll,
	)
}

// createAdvancedConfigCard creates the advanced configuration section
func (m *MainWindow) createAdvancedConfigCard() *fyne.Container {
	advancedLabel := widget.NewLabelWithStyle("🔧 Advanced Configuration", fyne.TextAlignLeading, fyne.TextStyle{Bold: true})
	advancedLabel.Importance = widget.HighImportance

	// Batch processing settings
	batchSizeLabel := widget.NewLabel("Batch Size:")
	batchSizeLabel.TextStyle.Bold = true
	batchSizeEntry := widget.NewEntry()
	batchSizeEntry.SetText(strconv.Itoa(m.Config.BatchSize))
	batchSizeEntry.SetPlaceHolder("100")

	batchIntervalLabel := widget.NewLabel("Batch Interval (ms):")
	batchIntervalLabel.TextStyle.Bold = true
	batchIntervalEntry := widget.NewEntry()
	batchIntervalEntry.SetText(strconv.Itoa(m.Config.BatchIntervalMS))
	batchIntervalEntry.SetPlaceHolder("1000")

	// Queue and retry settings
	maxQueueSizeLabel := widget.NewLabel("Max Queue Size:")
	maxQueueSizeEntry := widget.NewEntry()
	maxQueueSizeEntry.SetText(strconv.Itoa(m.Config.MaxQueueSize))
	maxQueueSizeEntry.SetPlaceHolder("10000")

	maxRetriesLabel := widget.NewLabel("Max Retries:")
	maxRetriesEntry := widget.NewEntry()
	maxRetriesEntry.SetText(strconv.Itoa(m.Config.MaxRetries))
	maxRetriesEntry.SetPlaceHolder("3")

	// File storage settings
	enableFileStorageCheck := widget.NewCheck("Enable Raw File Storage", func(checked bool) {
		m.Config.EnableRawFileStorage = checked
	})
	enableFileStorageCheck.SetChecked(m.Config.EnableRawFileStorage)

	rawFileDirLabel := widget.NewLabel("Raw File Directory:")
	rawFileDirEntry := widget.NewEntry()
	rawFileDirEntry.SetText(m.Config.RawFileDir)
	rawFileDirEntry.SetPlaceHolder("./data/raw")

	// Stream settings
	enableStreamAckCheck := widget.NewCheck("Enable Stream ACK", func(checked bool) {
		m.Config.EnableStreamAck = checked
	})
	enableStreamAckCheck.SetChecked(m.Config.EnableStreamAck)

	consumerGroupLabel := widget.NewLabel("Consumer Group:")
	consumerGroupEntry := widget.NewEntry()
	consumerGroupEntry.SetText(m.Config.ConsumerGroup)
	consumerGroupEntry.SetPlaceHolder("mylaps-consumers")

	consumerNameLabel := widget.NewLabel("Consumer Name:")
	consumerNameEntry := widget.NewEntry()
	consumerNameEntry.SetText(m.Config.ConsumerName)
	consumerNameEntry.SetPlaceHolder("forwarder-1")

	// Store references for saving
	m.batchSizeEntry = batchSizeEntry
	m.batchIntervalEntry = batchIntervalEntry
	m.maxQueueSizeEntry = maxQueueSizeEntry
	m.maxRetriesEntry = maxRetriesEntry
	m.rawFileDirEntry = rawFileDirEntry
	m.consumerGroupEntry = consumerGroupEntry
	m.consumerNameEntry = consumerNameEntry

	// Layout in a grid
	advancedGrid := container.New(layout.NewFormLayout(),
		batchSizeLabel, batchSizeEntry,
		batchIntervalLabel, batchIntervalEntry,
		maxQueueSizeLabel, maxQueueSizeEntry,
		maxRetriesLabel, maxRetriesEntry,
		rawFileDirLabel, rawFileDirEntry,
		consumerGroupLabel, consumerGroupEntry,
		consumerNameLabel, consumerNameEntry,
	)

	// Checkboxes in a separate container
	checkboxes := container.NewVBox(
		enableFileStorageCheck,
		enableStreamAckCheck,
	)

	return container.NewVBox(
		advancedLabel,
		widget.NewSeparator(),
		container.NewPadded(advancedGrid),
		container.NewPadded(checkboxes),
	)
}

// handleClearLog clears the log area
func (m *MainWindow) handleClearLog() {
	m.logTextArea.SetText("")
	m.log("🗑️ Log cleared by user")
}

// handleSaveConfig saves the current configuration to a file
func (m *MainWindow) handleSaveConfig() {
	// Store old configuration for comparison
	oldUDPListen := m.Config.UDPListen
	oldRedisURL := m.Config.RedisURL
	oldRawStreamKey := m.Config.RawStreamKey

	// Update configuration from UI
	// Build UDP listen address from host and port fields
	udpHost := m.udpHostEntry.Text
	udpPort := m.udpPortEntry.Text

	if udpHost == "" || udpHost == "0.0.0.0" {
		m.Config.UDPListen = ":" + udpPort
	} else {
		m.Config.UDPListen = udpHost + ":" + udpPort
	}

	// Update Redis URL from UI
	m.updateRedisURLFromUI()

	m.Config.RawStreamKey = m.streamKeyEntry.Text

	// Update advanced configuration from UI
	if m.batchSizeEntry != nil {
		if val, err := strconv.Atoi(m.batchSizeEntry.Text); err == nil {
			m.Config.BatchSize = val
		}
	}
	if m.batchIntervalEntry != nil {
		if val, err := strconv.Atoi(m.batchIntervalEntry.Text); err == nil {
			m.Config.BatchIntervalMS = val
		}
	}
	if m.maxQueueSizeEntry != nil {
		if val, err := strconv.Atoi(m.maxQueueSizeEntry.Text); err == nil {
			m.Config.MaxQueueSize = val
		}
	}
	if m.maxRetriesEntry != nil {
		if val, err := strconv.Atoi(m.maxRetriesEntry.Text); err == nil {
			m.Config.MaxRetries = val
		}
	}
	if m.rawFileDirEntry != nil {
		m.Config.RawFileDir = m.rawFileDirEntry.Text
	}
	if m.consumerGroupEntry != nil {
		m.Config.ConsumerGroup = m.consumerGroupEntry.Text
	}
	if m.consumerNameEntry != nil {
		m.Config.ConsumerName = m.consumerNameEntry.Text
	}

	// Save to .env file
	configContent := fmt.Sprintf(`# MyLaps UDP Forwarder Configuration (Saved from GUI)

# UDP listener address (host:port or just :port)
# Examples:
# UDP_LISTEN=:5403              # Listen on all interfaces, port 5403
# UDP_LISTEN=0.0.0.0:5403       # Same as above (explicit)
# UDP_LISTEN=192.168.1.100:5403 # Listen on specific IP
# UDP_LISTEN=localhost:5403     # Listen on localhost only
UDP_LISTEN=%s

# Redis URL for connection
REDIS_URL=%s

# Redis stream key for raw data
RAW_STREAM_KEY=%s

# Redis consumer group and consumer name
CONSUMER_GROUP=%s
CONSUMER_NAME=%s

# Batch size for Redis writes
BATCH_SIZE=%d

# Batch interval in milliseconds
BATCH_INTERVAL_MS=%d

# Maximum queue size for Redis messages
MAX_QUEUE_SIZE=%d

# Maximum retry attempts for Redis operations
MAX_RETRIES=%d

# Enable storing raw UDP data to files
ENABLE_RAW_FILE_STORAGE=%t

# Directory for storing raw UDP data files
RAW_FILE_DIR=%s

# Enable Redis stream acknowledgments
ENABLE_STREAM_ACK=%t
`,
		m.Config.UDPListen,
		m.Config.RedisURL,
		m.Config.RawStreamKey,
		m.Config.ConsumerGroup,
		m.Config.ConsumerName,
		m.Config.BatchSize,
		m.Config.BatchIntervalMS,
		m.Config.MaxQueueSize,
		m.Config.MaxRetries,
		m.Config.EnableRawFileStorage,
		m.Config.RawFileDir,
		m.Config.EnableStreamAck,
	)

	// Write to .env file
	err := os.WriteFile(".env", []byte(configContent), 0644)
	if err != nil {
		dialog.ShowError(fmt.Errorf("failed to save configuration: %v", err), m.Window)
		m.log("❌ ERROR: Failed to save configuration: " + err.Error())
		return
	}

	m.log("💾 Configuration saved to .env file")
	m.log(fmt.Sprintf("🔌 UDP Listener: %s", m.Config.GetUDPListenAddr()))
	dialog.ShowInformation("Configuration Saved", "Configuration has been saved to .env file", m.Window)

	// Reload configuration from file to ensure consistency
	m.reloadConfigFromFile()

	// Check if service restart is needed
	m.checkServiceRestartNeeded(oldUDPListen, oldRedisURL, oldRawStreamKey)
}

// handleSystemInfo shows system information and statistics
func (m *MainWindow) handleSystemInfo() {
	var info strings.Builder
	info.WriteString("🚀 MyLaps UDP Forwarder - System Information\n\n")

	// Application info
	info.WriteString(fmt.Sprintf("📊 Status: %s\n", func() string {
		if m.isRunning {
			return "🟢 Running"
		}
		return "⏳ Stopped"
	}()))

	info.WriteString(fmt.Sprintf("🔌 UDP Host: %s\n", m.udpHostEntry.Text))
	info.WriteString(fmt.Sprintf("🔌 UDP Port: %s\n", m.udpPortEntry.Text))
	info.WriteString(fmt.Sprintf("🔌 UDP Address: %s\n", m.Config.GetUDPListenAddr()))
	info.WriteString(fmt.Sprintf("🗄️ Redis URL: %s\n", m.Config.RedisURL))
	info.WriteString(fmt.Sprintf("📡 Stream Key: %s\n", m.Config.RawStreamKey))

	// Runtime statistics
	if m.isRunning && m.UDPListener != nil {
		stats := m.UDPListener.GetStats()
		elapsed := time.Since(stats.StartTime).Seconds()

		info.WriteString("\n📈 Runtime Statistics:\n")
		info.WriteString(fmt.Sprintf("⏱️ Uptime: %.1f seconds\n", elapsed))
		info.WriteString(fmt.Sprintf("📦 Packets Received: %s\n", formatNumber(stats.PacketsReceived)))
		info.WriteString(fmt.Sprintf("💾 Bytes Received: %s\n", formatBytes(stats.BytesReceived)))
		info.WriteString(fmt.Sprintf("📝 Lines Processed: %s\n", formatNumber(stats.LinesProcessed)))

		if elapsed > 0 {
			packetsPerSec := float64(stats.PacketsReceived) / elapsed
			bytesPerSec := float64(stats.BytesReceived) / elapsed
			info.WriteString(fmt.Sprintf("⚡ Packets/sec: %.1f\n", packetsPerSec))
			info.WriteString(fmt.Sprintf("🌊 Bytes/sec: %s\n", formatBytes(uint64(bytesPerSec))))
		}
	}

	// Configuration summary
	info.WriteString("\n⚙️ Configuration:\n")
	info.WriteString(fmt.Sprintf("🔄 Batch Size: %d\n", m.Config.BatchSize))
	info.WriteString(fmt.Sprintf("⏲️ Batch Interval: %dms\n", m.Config.BatchIntervalMS))
	info.WriteString(fmt.Sprintf("📋 Max Queue Size: %d\n", m.Config.MaxQueueSize))
	info.WriteString(fmt.Sprintf("🔁 Max Retries: %d\n", m.Config.MaxRetries))
	info.WriteString(fmt.Sprintf("💾 Raw File Storage: %t\n", m.Config.EnableRawFileStorage))
	info.WriteString(fmt.Sprintf("✅ Stream ACK: %t\n", m.Config.EnableStreamAck))

	// Show dialog
	infoDialog := dialog.NewInformation("System Information", info.String(), m.Window)
	infoDialog.Resize(fyne.NewSize(500, 400))
	infoDialog.Show()

	m.log("ℹ️ System information displayed")
}

// handleStart handles the start button click
func (m *MainWindow) handleStart() {
	// Skip if already running
	if m.isRunning {
		return
	}

	// Validate configuration before starting
	if err := m.validateConfiguration(); err != nil {
		dialog.ShowError(fmt.Errorf("configuration validation failed: %v", err), m.Window)
		m.log("ERROR: Configuration validation failed: " + err.Error())
		return
	}

	// Update configuration from UI, building UDP address from host and port
	udpHost := m.udpHostEntry.Text
	udpPort := m.udpPortEntry.Text

	if udpHost == "" || udpHost == "0.0.0.0" {
		m.Config.UDPListen = ":" + udpPort
	} else {
		m.Config.UDPListen = udpHost + ":" + udpPort
	}

	// Update Redis URL from UI
	m.updateRedisURLFromUI()

	m.Config.RawStreamKey = m.streamKeyEntry.Text

	m.log("Starting UDP forwarder...")

	// Create Redis client
	redisClient, err := redis.NewClient(context.Background(), m.Config)
	if err != nil {
		errorMsg := fmt.Sprintf("failed to connect to Redis at %s: %v", m.Config.RedisURL, err)
		dialog.ShowError(errors.New(errorMsg), m.Window)
		m.log("❌ ERROR: " + errorMsg)
		return
	}
	m.RedisClient = redisClient
	m.log("✅ Connected to Redis successfully")

	// Create and start UDP listener
	m.UDPListener, err = udp.NewListener(m.Config, m.RedisClient)
	if err != nil {
		errorMsg := fmt.Sprintf("failed to create UDP listener on %s: %v", m.Config.GetUDPListenAddr(), err)
		m.log("❌ ERROR: " + errorMsg)

		// Clean up Redis client
		if m.RedisClient != nil {
			m.RedisClient.Close()
			m.RedisClient = nil
		}

		dialog.ShowError(errors.New(errorMsg), m.Window)
		return
	}

	if err := m.UDPListener.Start(); err != nil {
		errorMsg := fmt.Sprintf("failed to start UDP listener on %s: %v", m.Config.GetUDPListenAddr(), err)
		dialog.ShowError(errors.New(errorMsg), m.Window)
		m.log("❌ ERROR: " + errorMsg)

		// Clean up
		if m.RedisClient != nil {
			m.RedisClient.Close()
			m.RedisClient = nil
		}
		m.UDPListener = nil
		return
	}

	// Update UI
	m.startButton.Disable()
	m.stopButton.Enable()
	m.udpHostEntry.Disable()
	m.udpPortEntry.Disable()
	m.redisURLEntry.Disable()
	m.streamKeyEntry.Disable()

	m.isRunning = true

	// Start stats timer
	m.statsTimer = time.NewTicker(1 * time.Second)
	go m.updateStats()

	m.log("✅ UDP Listener started on " + m.Config.GetUDPListenAddr())
	m.statusLabel.SetText("🟢 Running - Forwarding UDP data to Redis")
}

// validateConfiguration validates the current configuration
func (m *MainWindow) validateConfiguration() error {
	// Validate UDP host
	udpHost := m.udpHostEntry.Text
	if udpHost == "" {
		return fmt.Errorf("UDP host cannot be empty")
	}

	// Validate UDP port
	udpPort := m.udpPortEntry.Text
	if udpPort == "" {
		return fmt.Errorf("UDP port cannot be empty")
	}

	// Validate port is numeric
	if _, err := strconv.Atoi(udpPort); err != nil {
		return fmt.Errorf("UDP port must be a number")
	}

	// Validate Redis URL (host part from UI)
	redisHost := m.redisURLEntry.Text
	if redisHost == "" {
		return fmt.Errorf("redis URL cannot be empty")
	}

	// Basic validation - should not contain credentials (those are handled separately)
	if strings.Contains(redisHost, "@") {
		return fmt.Errorf("redis URL should not contain credentials - use host:port format only")
	}

	// Validate stream key
	streamKey := m.streamKeyEntry.Text
	if streamKey == "" {
		return fmt.Errorf("stream key cannot be empty")
	}

	if strings.ContainsAny(streamKey, " \t\n\r") {
		return fmt.Errorf("stream key cannot contain whitespace")
	}

	return nil
}

// handleStop handles the stop button click
func (m *MainWindow) handleStop() {
	if !m.isRunning {
		m.log("⚠️ WARNING: Service is not running")
		return
	}

	m.log("🔄 Stopping UDP forwarder...")

	// Stop services with error handling
	if err := m.stopServices(); err != nil {
		m.log("⚠️ WARNING: Some services failed to stop cleanly: " + err.Error())
	} else {
		m.log("✅ All services stopped successfully")
	}

	// Update UI
	m.startButton.Enable()
	m.stopButton.Disable()
	m.udpHostEntry.Enable()
	m.udpPortEntry.Enable()
	m.redisURLEntry.Enable()
	m.streamKeyEntry.Enable()

	m.isRunning = false

	m.log("⏹️ Stopped")
	m.statusLabel.SetText("⏳ Ready to start")
}

// stopServices stops the UDP listener and Redis client with error handling
func (m *MainWindow) stopServices() error {
	var errors []string

	// Stop stats timer
	if m.statsTimer != nil {
		m.statsTimer.Stop()
		m.statsTimer = nil
	}

	// Stop UDP listener
	if m.UDPListener != nil {
		if err := m.UDPListener.Stop(); err != nil {
			errors = append(errors, fmt.Sprintf("UDP listener: %v", err))
		} else {
			m.UDPListener = nil
		}
	}

	// Close Redis client
	if m.RedisClient != nil {
		if err := m.RedisClient.Close(); err != nil {
			errors = append(errors, fmt.Sprintf("Redis client: %v", err))
		} else {
			m.RedisClient = nil
		}
	}

	if len(errors) > 0 {
		return fmt.Errorf("stop errors: %s", strings.Join(errors, "; "))
	}

	return nil
}

// handleClose handles the window close event
func (m *MainWindow) handleClose() {
	if m.isRunning {
		dialog.ShowConfirm("Confirm Exit", "UDP forwarder is running. Stop and exit?",
			func(ok bool) {
				if ok {
					m.stopServices()
					m.Window.Close()
				}
			}, m.Window)
	} else {
		m.Window.Close()
	}
}

// updateStats updates the statistics display
func (m *MainWindow) updateStats() {
	for range m.statsTimer.C {
		if m.UDPListener == nil || !m.isRunning {
			return
		}

		stats := m.UDPListener.GetStats()
		elapsed := time.Since(stats.StartTime).Seconds()

		if elapsed <= 0 {
			continue
		}

		// Calculate rates
		packetsPerSec := float64(stats.PacketsReceived) / elapsed
		bytesPerSec := float64(stats.BytesReceived) / elapsed
		linesPerSec := float64(stats.LinesProcessed) / elapsed

		// Calculate efficiency metrics
		bytesPerPacket := float64(0)
		if stats.PacketsReceived > 0 {
			bytesPerPacket = float64(stats.BytesReceived) / float64(stats.PacketsReceived)
		}

		linesPerPacket := float64(0)
		if stats.PacketsReceived > 0 {
			linesPerPacket = float64(stats.LinesProcessed) / float64(stats.PacketsReceived)
		}

		// Build comprehensive status text
		var statusText strings.Builder

		// Basic metrics
		statusText.WriteString(fmt.Sprintf("📦 %s pkt/s", formatFloat(packetsPerSec)))
		statusText.WriteString(fmt.Sprintf(" | 💾 %s/s", formatBytes(uint64(bytesPerSec))))
		statusText.WriteString(fmt.Sprintf(" | 📝 %s ln/s", formatFloat(linesPerSec)))

		// Efficiency metrics (show if meaningful)
		if stats.PacketsReceived > 10 {
			statusText.WriteString(fmt.Sprintf(" | 📏 %.1f B/pkt", bytesPerPacket))
			if linesPerPacket > 1 {
				statusText.WriteString(fmt.Sprintf(" | 📊 %.1f ln/pkt", linesPerPacket))
			}
		}

		// Total counters (show periodically or when significant)
		if stats.PacketsReceived > 0 && (stats.PacketsReceived%100 == 0 || elapsed < 10) {
			statusText.WriteString(fmt.Sprintf(" | Σ %s total", formatNumber(stats.PacketsReceived)))
		}

		// Connection health indicator (simplified)
		redisConnected := m.RedisClient != nil
		if redisConnected {
			statusText.WriteString(" | 🟢 Redis")
		} else {
			statusText.WriteString(" | 🔴 Redis")
		}

		m.statusLabel.SetText(statusText.String())

		// Log detailed stats every 30 seconds
		if int(elapsed)%30 == 0 && elapsed > 1 {
			m.log(fmt.Sprintf("📊 Stats: %s packets, %s bytes, %s lines in %.1fs",
				formatNumber(stats.PacketsReceived),
				formatBytes(stats.BytesReceived),
				formatNumber(stats.LinesProcessed),
				elapsed))
		}
	}
}

// log adds a message to the log area with improved formatting
func (m *MainWindow) log(message string) {
	timestamp := time.Now().Format("15:04:05")

	// Use color-like prefixes to improve readability
	var prefix string
	if strings.Contains(message, "ERROR") {
		prefix = "❌ "
	} else if strings.Contains(message, "WARNING") {
		prefix = "⚠️ "
	} else if strings.Contains(message, "SUCCESS") || strings.Contains(message, "Connected") {
		prefix = "✅ "
	} else if strings.Contains(message, "Stats") {
		prefix = "📊 "
	} else if strings.Contains(message, "Starting") || strings.Contains(message, "Stopping") {
		prefix = "🔄 "
	} else {
		prefix = "➡️ "
	}

	// Format the log line with better visual cues
	logLine := fmt.Sprintf("%-10s %s %s\n", "["+timestamp+"]", prefix, message)

	// Add to log area
	if m.logTextArea != nil {
		currentText := m.logTextArea.Text

		// Limit log size by removing older entries if necessary
		const maxLogLines = 1000
		lines := append([]string{}, logLine)

		if currentText != "" {
			existingLines := strings.Split(currentText, "\n")

			// Add all lines except empty ones
			for _, line := range existingLines {
				if line != "" {
					lines = append(lines, line+"\n")
				}
			}

			// Keep only the last maxLogLines
			if len(lines) > maxLogLines {
				lines = lines[:maxLogLines]
			}
		}

		// Rebuild text
		newText := ""
		for _, line := range lines {
			newText += line
		}

		m.logTextArea.SetText(newText)

		// Scroll to bottom
		// Note: Fyne doesn't directly support scrolling to bottom,
		// but this is a common workaround
		m.logTextArea.CursorRow = len(strings.Split(newText, "\n"))
	}
}

// formatNumber formats a number with thousands separators
func formatNumber(n uint64) string {
	str := strconv.FormatUint(n, 10)
	if n < 1000 {
		return str
	}

	result := ""
	for i, c := range str {
		if i > 0 && (len(str)-i)%3 == 0 {
			result += ","
		}
		result += string(c)
	}
	return result
}

// formatFloat formats a float with 2 decimal places
func formatFloat(f float64) string {
	return fmt.Sprintf("%.2f", f)
}

// formatBytes formats a byte count in a human-readable way
func formatBytes(bytes uint64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := uint64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

// Helper functions for configuration loading (duplicated from config package for UI use)

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

// parseRedisURL parses a Redis URL and extracts username, password, and host
func (m *MainWindow) parseRedisURL(redisURL string) (username, password, host string) {
	if !strings.HasPrefix(redisURL, "redis://") {
		// If not a valid Redis URL, return as host
		return "", "", redisURL
	}

	// Remove protocol
	urlWithoutProto := strings.TrimPrefix(redisURL, "redis://")

	// Split by @
	parts := strings.Split(urlWithoutProto, "@")
	if len(parts) < 2 {
		// No credentials, just host
		return "", "", parts[0]
	}

	// Parse credentials
	credPart := parts[0]
	hostPart := strings.Join(parts[1:], "@")

	// Split credentials by :
	credParts := strings.Split(credPart, ":")
	if len(credParts) == 2 {
		return credParts[0], credParts[1], hostPart
	} else if len(credParts) == 1 {
		return credParts[0], "", hostPart
	}

	return "", "", hostPart
}

// parseUDPAddress parses the UDP listen address into host and port components
func (m *MainWindow) parseUDPAddress(addr string) (host, port string) {
	if addr == "" {
		return "0.0.0.0", "5403"
	}

	// Handle cases with colon prefix
	addr = strings.TrimPrefix(addr, ":")

	// Split host and port
	if strings.Contains(addr, ":") {
		parts := strings.Split(addr, ":")
		if len(parts) == 2 {
			host = parts[0]
			port = parts[1]
			if host == "" {
				host = "0.0.0.0"
			}
			return host, port
		}
	}

	// If no colon found, assume it's just a port
	return "0.0.0.0", addr
}

// buildRedisURL builds a complete Redis URL from username, password, and host
func (m *MainWindow) buildRedisURL(username, password, host string) string {
	if !strings.HasPrefix(host, "redis://") {
		host = "redis://" + host
	}

	if username != "" || password != "" {
		cred := username
		if password != "" {
			cred += ":" + password
		}
		host = strings.Replace(host, "redis://", "redis://"+cred+"@", 1)
	}

	return host
}

// reloadConfigFromFile reloads configuration from .env file and updates UI
func (m *MainWindow) reloadConfigFromFile() {
	// Try to load .env file
	_ = godotenv.Load()

	// Reload configuration values
	m.Config.UDPListen = getEnv("UDP_LISTEN", ":5403")
	m.Config.RedisURL = getEnv("REDIS_URL", "redis://localhost:6379/0")
	m.Config.RawStreamKey = getEnv("RAW_STREAM_KEY", "rmon:raw")
	m.Config.ConsumerGroup = getEnv("CONSUMER_GROUP", "mylaps-forwarder")
	m.Config.ConsumerName = getEnv("CONSUMER_NAME", getHostname())
	m.Config.BatchSize = getEnvAsInt("BATCH_SIZE", 100)
	m.Config.BatchIntervalMS = getEnvAsInt("BATCH_INTERVAL_MS", 50)
	m.Config.MaxQueueSize = getEnvAsInt("MAX_QUEUE_SIZE", 10000)
	m.Config.MaxRetries = getEnvAsInt("MAX_RETRIES", 10)
	m.Config.EnableRawFileStorage = getEnvAsBool("ENABLE_RAW_FILE_STORAGE", true)
	m.Config.RawFileDir = getEnv("RAW_FILE_DIR", "./logs")
	m.Config.EnableStreamAck = getEnvAsBool("ENABLE_STREAM_ACK", true)

	// Update UI with reloaded values
	// Parse UDP address into host and port
	udpHost, udpPort := m.parseUDPAddress(m.Config.UDPListen)
	m.udpHostEntry.SetText(udpHost)
	m.udpPortEntry.SetText(udpPort)

	// Parse and display Redis URL
	m.redisUsername, m.redisPassword, m.redisHost = m.parseRedisURL(m.Config.RedisURL)
	m.redisURLEntry.SetText(m.redisHost)

	m.streamKeyEntry.SetText(m.Config.RawStreamKey)

	// Update advanced fields if they exist
	if m.batchSizeEntry != nil {
		m.batchSizeEntry.SetText(strconv.Itoa(m.Config.BatchSize))
	}
	if m.batchIntervalEntry != nil {
		m.batchIntervalEntry.SetText(strconv.Itoa(m.Config.BatchIntervalMS))
	}
	if m.maxQueueSizeEntry != nil {
		m.maxQueueSizeEntry.SetText(strconv.Itoa(m.Config.MaxQueueSize))
	}
	if m.maxRetriesEntry != nil {
		m.maxRetriesEntry.SetText(strconv.Itoa(m.Config.MaxRetries))
	}
	if m.rawFileDirEntry != nil {
		m.rawFileDirEntry.SetText(m.Config.RawFileDir)
	}
	if m.consumerGroupEntry != nil {
		m.consumerGroupEntry.SetText(m.Config.ConsumerGroup)
	}
	if m.consumerNameEntry != nil {
		m.consumerNameEntry.SetText(m.Config.ConsumerName)
	}

	m.log("🔄 Configuration reloaded from .env file")
}

// checkServiceRestartNeeded checks if service restart is needed due to critical configuration changes
func (m *MainWindow) checkServiceRestartNeeded(oldUDPListen, oldRedisURL, oldRawStreamKey string) {
	// Only check if service is currently running
	if !m.isRunning {
		return
	}

	// Check for critical changes that require service restart
	criticalChanges := []string{}

	// Check UDP port change
	if oldUDPListen != m.Config.UDPListen {
		criticalChanges = append(criticalChanges, fmt.Sprintf("UDP Port: %s → %s", oldUDPListen, m.Config.UDPListen))
	}

	// Check Redis URL change
	if oldRedisURL != m.Config.RedisURL {
		criticalChanges = append(criticalChanges, "Redis URL changed")
	}

	// Check stream key change (less critical but still requires restart)
	if oldRawStreamKey != m.Config.RawStreamKey {
		criticalChanges = append(criticalChanges, fmt.Sprintf("Stream Key: %s → %s", oldRawStreamKey, m.Config.RawStreamKey))
	}

	// If no critical changes, return
	if len(criticalChanges) == 0 {
		return
	}

	// Build restart message
	message := "The following configuration changes require a service restart:\n\n"
	for _, change := range criticalChanges {
		message += "• " + change + "\n"
	}
	message += "\nDo you want to restart the service now with the new configuration?"

	// Show confirmation dialog
	dialog.ShowConfirm("Configuration Changed", message, func(restart bool) {
		if restart {
			m.log("🔄 Restarting service due to configuration changes...")

			// Stop current service
			if err := m.stopServices(); err != nil {
				m.log("⚠️ WARNING: Error stopping service: " + err.Error())
			}

			// Small delay to ensure clean shutdown
			time.Sleep(500 * time.Millisecond)

			// Restart service with new configuration
			go func() {
				time.Sleep(200 * time.Millisecond) // Brief delay before restart
				m.handleStart()
			}()
		} else {
			m.log("ℹ️ Service restart cancelled by user - changes will take effect on next manual start")
		}
	}, m.Window)
}

// updateRedisURLFromUI updates the internal Redis URL components from the UI field
func (m *MainWindow) updateRedisURLFromUI() {
	uiText := m.redisURLEntry.Text

	// If the UI text contains credentials, parse them
	if strings.Contains(uiText, "@") {
		m.redisUsername, m.redisPassword, m.redisHost = m.parseRedisURL(uiText)
	} else {
		// If no credentials in UI, keep existing credentials but update host
		_, _, m.redisHost = m.parseRedisURL(uiText)
	}

	// Rebuild the complete URL
	m.Config.RedisURL = m.buildRedisURL(m.redisUsername, m.redisPassword, m.redisHost)
}

// UpdateConfigFromRedis updates the UI and configuration when a new config is received from Redis stream
func (m *MainWindow) UpdateConfigFromRedis(newConfig *config.Config) {
	// Store old configuration for comparison
	oldUDPListen := m.Config.UDPListen
	oldRedisURL := m.Config.RedisURL
	oldRawStreamKey := m.Config.RawStreamKey

	// Update internal configuration
	m.Config = newConfig

	// Update UI fields
	// Parse UDP address into host and port
	udpHost, udpPort := m.parseUDPAddress(m.Config.UDPListen)
	m.udpHostEntry.SetText(udpHost)
	m.udpPortEntry.SetText(udpPort)

	// Parse and display Redis URL
	m.redisUsername, m.redisPassword, m.redisHost = m.parseRedisURL(m.Config.RedisURL)
	m.redisURLEntry.SetText(m.redisHost)

	m.streamKeyEntry.SetText(m.Config.RawStreamKey)

	// Update advanced fields if they exist
	if m.batchSizeEntry != nil {
		m.batchSizeEntry.SetText(strconv.Itoa(m.Config.BatchSize))
	}
	if m.batchIntervalEntry != nil {
		m.batchIntervalEntry.SetText(strconv.Itoa(m.Config.BatchIntervalMS))
	}
	if m.maxQueueSizeEntry != nil {
		m.maxQueueSizeEntry.SetText(strconv.Itoa(m.Config.MaxQueueSize))
	}
	if m.maxRetriesEntry != nil {
		m.maxRetriesEntry.SetText(strconv.Itoa(m.Config.MaxRetries))
	}
	if m.rawFileDirEntry != nil {
		m.rawFileDirEntry.SetText(m.Config.RawFileDir)
	}
	if m.consumerGroupEntry != nil {
		m.consumerGroupEntry.SetText(m.Config.ConsumerGroup)
	}
	if m.consumerNameEntry != nil {
		m.consumerNameEntry.SetText(m.Config.ConsumerName)
	}

	// Save to .env file
	configContent := fmt.Sprintf(`# MyLaps UDP Forwarder Configuration (Updated from Redis Stream)

# UDP listener address (host:port or just :port)
# Examples:
# UDP_LISTEN=:5403              # Listen on all interfaces, port 5403
# UDP_LISTEN=0.0.0.0:5403       # Same as above (explicit)
# UDP_LISTEN=192.168.1.100:5403 # Listen on specific IP
# UDP_LISTEN=localhost:5403     # Listen on localhost only
UDP_LISTEN=%s

# Redis URL for connection
REDIS_URL=%s

# Redis stream key for raw data
RAW_STREAM_KEY=%s

# Redis consumer group and consumer name
CONSUMER_GROUP=%s
CONSUMER_NAME=%s

# Batch size for Redis writes
BATCH_SIZE=%d

# Batch interval in milliseconds
BATCH_INTERVAL_MS=%d

# Maximum queue size for Redis messages
MAX_QUEUE_SIZE=%d

# Maximum retry attempts for Redis operations
MAX_RETRIES=%d

# Enable storing raw UDP data to files
ENABLE_RAW_FILE_STORAGE=%t

# Directory for storing raw UDP data files
RAW_FILE_DIR=%s

# Enable Redis stream acknowledgments
ENABLE_STREAM_ACK=%t
`,
		m.Config.UDPListen,
		m.Config.RedisURL,
		m.Config.RawStreamKey,
		m.Config.ConsumerGroup,
		m.Config.ConsumerName,
		m.Config.BatchSize,
		m.Config.BatchIntervalMS,
		m.Config.MaxQueueSize,
		m.Config.MaxRetries,
		m.Config.EnableRawFileStorage,
		m.Config.RawFileDir,
		m.Config.EnableStreamAck,
	)

	// Write to .env file
	err := os.WriteFile(".env", []byte(configContent), 0644)
	if err != nil {
		m.log("❌ ERROR: Failed to save configuration from Redis: " + err.Error())
		return
	}

	m.log("🔄 Configuration updated from Redis stream")
	m.log(fmt.Sprintf("🔌 UDP Listener: %s", m.Config.GetUDPListenAddr()))

	// Check if service restart is needed
	m.checkServiceRestartNeeded(oldUDPListen, oldRedisURL, oldRawStreamKey)
}

// handlePublishConfig publishes the current configuration to Redis stream for remote clients
func (m *MainWindow) handlePublishConfig() {
	// Update configuration from UI first
	// Build UDP listen address from host and port fields
	udpHost := m.udpHostEntry.Text
	udpPort := m.udpPortEntry.Text

	if udpHost == "" || udpHost == "0.0.0.0" {
		m.Config.UDPListen = ":" + udpPort
	} else {
		m.Config.UDPListen = udpHost + ":" + udpPort
	}

	// Update Redis URL from UI
	m.updateRedisURLFromUI()

	m.Config.RawStreamKey = m.streamKeyEntry.Text

	// Update advanced configuration from UI
	if m.batchSizeEntry != nil {
		if val, err := strconv.Atoi(m.batchSizeEntry.Text); err == nil {
			m.Config.BatchSize = val
		}
	}
	if m.batchIntervalEntry != nil {
		if val, err := strconv.Atoi(m.batchIntervalEntry.Text); err == nil {
			m.Config.BatchIntervalMS = val
		}
	}
	if m.maxQueueSizeEntry != nil {
		if val, err := strconv.Atoi(m.maxQueueSizeEntry.Text); err == nil {
			m.Config.MaxQueueSize = val
		}
	}
	if m.maxRetriesEntry != nil {
		if val, err := strconv.Atoi(m.maxRetriesEntry.Text); err == nil {
			m.Config.MaxRetries = val
		}
	}
	if m.rawFileDirEntry != nil {
		m.Config.RawFileDir = m.rawFileDirEntry.Text
	}
	if m.consumerGroupEntry != nil {
		m.Config.ConsumerGroup = m.consumerGroupEntry.Text
	}
	if m.consumerNameEntry != nil {
		m.Config.ConsumerName = m.consumerNameEntry.Text
	}

	// Create a temporary Redis client for publishing
	options, err := goredis.ParseURL(m.Config.RedisURL)
	if err != nil {
		errorMsg := fmt.Sprintf("Failed to parse Redis URL for publishing: %v", err)
		dialog.ShowError(errors.New(errorMsg), m.Window)
		m.log("❌ ERROR: " + errorMsg)
		return
	}

	tempRedisClient := goredis.NewClient(options)

	// Test connection
	if err := tempRedisClient.Ping(context.Background()).Err(); err != nil {
		errorMsg := fmt.Sprintf("Failed to connect to Redis for publishing: %v", err)
		dialog.ShowError(errors.New(errorMsg), m.Window)
		m.log("❌ ERROR: " + errorMsg)
		tempRedisClient.Close()
		return
	}
	defer tempRedisClient.Close()

	// Publish configuration to Redis stream
	err = watcher.PublishConfig(context.Background(), tempRedisClient, m.Config.ConfigStreamKey, m.Config)
	if err != nil {
		errorMsg := fmt.Sprintf("Failed to publish configuration to Redis stream: %v", err)
		dialog.ShowError(errors.New(errorMsg), m.Window)
		m.log("❌ ERROR: " + errorMsg)
		return
	}

	m.log("📡 Configuration published to Redis stream successfully")
	m.log(fmt.Sprintf("🔌 Published UDP: %s, Redis: %s", m.Config.GetUDPListenAddr(), m.Config.RedisURL))

	// Show success message
	dialog.ShowInformation("Configuration Published",
		"Configuration has been published to Redis stream.\nOther clients can now receive these settings.", m.Window)
}

// parseRedisURL parses a Redis URL and extracts username, password, and host
