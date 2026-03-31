-- PostgreSQL Test Database: Logistics & Supply Chain
-- Database logistics_db is created by docker-compose environment variable

CREATE TABLE warehouses (
    id SERIAL PRIMARY KEY,
    city VARCHAR(100),
    region VARCHAR(50),
    max_capacity_m3 INT
);

CREATE TABLE shipments (
    shipment_id SERIAL PRIMARY KEY,
    origin_city VARCHAR(100),
    destination_city VARCHAR(100),
    weight_kg DECIMAL(10, 2),
    status VARCHAR(20) DEFAULT 'in_transit',
    dispatch_date DATE DEFAULT CURRENT_DATE
);

CREATE TABLE inventory (
    item_id SERIAL PRIMARY KEY,
    warehouse_id INT REFERENCES warehouses(id),
    sku VARCHAR(50) UNIQUE,
    quantity INT,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed Data
INSERT INTO warehouses (city, region, max_capacity_m3) VALUES 
('Mumbai', 'West', 15000),
('Delhi', 'North', 20000),
('Bangalore', 'South', 18000);

INSERT INTO shipments (origin_city, destination_city, weight_kg, status) VALUES 
('Mumbai', 'Delhi', 450.50, 'delivered'),
('Bangalore', 'Mumbai', 1200.00, 'in_transit');

INSERT INTO inventory (warehouse_id, sku, quantity) VALUES 
(1, 'ELECT-001', 5000),
(2, 'MECH-099', 2500);
