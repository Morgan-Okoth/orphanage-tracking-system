-- Migration: 0002_notifications_read_at
-- Description: Add read_at column to notifications table for tracking when notifications are read
-- Created: 2024-01-15

ALTER TABLE notifications ADD COLUMN read_at INTEGER;
