# Makefile for MyLaps UDP Forwarder
BINARY_NAME_GUI=mylaps-gui
BINARY_NAME_CLI=mylaps-cli
BUILD_DIR=build

.PHONY: all build build-gui build-cli clean test lint validate

all: validate clean build

build: build-gui build-cli

build-gui:
	@echo "Building GUI application..."
	@mkdir -p $(BUILD_DIR)
	@go build -ldflags="-w -s" -o $(BUILD_DIR)/$(BINARY_NAME_GUI) ./cmd/app 2>&1 | grep -v "ignoring duplicate libraries" || echo "Build completed (filtered duplicate library warning)"

build-cli:
	@echo "Building CLI application..."
	@mkdir -p $(BUILD_DIR)
	@go build -ldflags="-w -s" -o $(BUILD_DIR)/$(BINARY_NAME_CLI) ./cmd/forwarder 2>&1 | grep -v "ignoring duplicate libraries" || echo "Build completed (filtered duplicate library warning)"

clean:
	@echo "Cleaning..."
	@rm -rf $(BUILD_DIR)
	@go clean
	@go mod tidy

test:
	@echo "Running tests..."
	@go test -v ./...

lint:
	@echo "Running linter..."
	@go vet ./...
	@go fmt ./...

validate: lint
	@echo "Validating code..."
	@go mod verify
	@echo "✅ Code validation completed successfully"

run-gui: build-gui
	@echo "Running GUI application..."
	@$(BUILD_DIR)/$(BINARY_NAME_GUI)

run-cli: build-cli
	@echo "Running CLI application..."
	@$(BUILD_DIR)/$(BINARY_NAME_CLI)