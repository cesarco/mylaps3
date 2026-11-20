-- MYLAPS Database Schema for Remote MySQL (gpesportsrd.com)
-- Run this script to create the required tables in the remote database

USE gpesportsrd_mylaps;

-- Drivers table
CREATE TABLE IF NOT EXISTS drivers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  transponder_number VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  team VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  status ENUM('active', 'completed', 'paused') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Lap times table
CREATE TABLE IF NOT EXISTS lap_times (
  id INT PRIMARY KEY AUTO_INCREMENT,
  driver_id INT NOT NULL,
  session_id INT NOT NULL,
  lap_number INT NOT NULL,
  lap_time TIME NOT NULL,
  position INT,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  INDEX idx_driver_session (driver_id, session_id),
  INDEX idx_lap_number (lap_number),
  INDEX idx_recorded_at (recorded_at)
);

-- Driver positions table
CREATE TABLE IF NOT EXISTS driver_positions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  driver_id INT NOT NULL,
  session_id INT NOT NULL,
  position INT NOT NULL,
  lap_number INT,
  race_time TIME,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  INDEX idx_driver_session (driver_id, session_id),
  INDEX idx_position (position),
  INDEX idx_recorded_at (recorded_at)
);

-- Insert sample data
INSERT IGNORE INTO drivers (transponder_number, name) VALUES 
('133', 'Driver 133'),
('245', 'Driver 245'),
('089', 'Driver 089');

INSERT IGNORE INTO sessions (name, status) VALUES 
('Practice Session', 'active'),
('Qualifying Session', 'completed'),
('Race Session', 'active');
