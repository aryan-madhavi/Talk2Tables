-- MySQL Test Database: Factory Operations
CREATE DATABASE IF NOT EXISTS factory_db;
USE factory_db;

CREATE TABLE parts (
    part_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100),
    category VARCHAR(50),
    stock_quantity INT,
    unit_price DECIMAL(10, 2)
);

CREATE TABLE production_lines (
    line_id INT PRIMARY KEY AUTO_INCREMENT,
    location VARCHAR(100),
    status ENUM('active', 'maintenance', 'idle'),
    daily_capacity INT
);

CREATE TABLE quality_logs (
    log_id INT PRIMARY KEY AUTO_INCREMENT,
    part_id INT,
    check_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20),
    inspector_name VARCHAR(100),
    FOREIGN KEY (part_id) REFERENCES parts(part_id)
);

-- Seed Data
INSERT INTO parts (name, category, stock_quantity, unit_price) VALUES 
('Sensor-A1', 'Electronics', 500, 45.00),
('Valve-B2', 'Hardware', 120, 120.50),
('Casing-C3', 'Materials', 300, 15.75);

INSERT INTO production_lines (location, status, daily_capacity) VALUES 
('Floor 1 - Zone A', 'active', 1000),
('Floor 1 - Zone B', 'maintenance', 500);

INSERT INTO quality_logs (part_id, status, inspector_name) VALUES 
(1, 'passed', 'Aryan Madhavi'),
(2, 'failed', 'Aryan Madhavi');
