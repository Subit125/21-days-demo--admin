"use client";

import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface SyncOptions {
    table: string;
    onUpdate: () => void;
    socketUrl: string;
    fallbackInterval?: number; // ms, default 30s
}

export function useSync({ table, onUpdate, socketUrl, fallbackInterval = 30000 }: SyncOptions) {
    const [isConnected, setIsConnected] = useState(false);
    const [isFallbackActive, setIsFallbackActive] = useState(false);
    const socketRef = useRef<Socket | null>(null);
    const fallbackTimerRef = useRef<NodeJS.Timeout | null>(null);

    const startFallback = () => {
        if (fallbackTimerRef.current) return;
        console.log(`[Sync] Starting Azure Fallback Polling (${fallbackInterval}ms)`);
        setIsFallbackActive(true);
        fallbackTimerRef.current = setInterval(() => {
            console.log(`[Sync] Fallback Polling for ${table}...`);
            onUpdate();
        }, fallbackInterval);
    };

    const stopFallback = () => {
        if (fallbackTimerRef.current) {
            console.log(`[Sync] Stopping Azure Fallback Polling`);
            clearInterval(fallbackTimerRef.current);
            fallbackTimerRef.current = null;
            setIsFallbackActive(false);
        }
    };

    useEffect(() => {
        // 1. Initialize Socket.io
        const socket = io(socketUrl, {
            reconnectionAttempts: 5,
            timeout: 10000,
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('[Sync] Connected to Socket.io');
            setIsConnected(true);
            stopFallback(); // Connection is healthy, stop polling
        });

        socket.on('disconnect', () => {
            console.warn('[Sync] Socket.io Disconnected');
            setIsConnected(false);
            startFallback(); // Connection lost, start polling
        });

        socket.on('connect_error', () => {
            console.error('[Sync] Socket.io Connection Error');
            setIsConnected(false);
            startFallback(); // Connection failed, start polling
        });

        // 2. Listen for specific table updates
        socket.on('sync_update', (data: { table: string }) => {
            if (data.table === table || data.table === 'all') {
                console.log(`[Sync] Real-time update received for ${table}`);
                onUpdate();
            }
        });

        return () => {
            socket.disconnect();
            stopFallback();
        };
    }, [table, socketUrl]);

    // Function to manually notify other clients that WE changed something
    const notifyUpdate = () => {
        if (socketRef.current?.connected) {
            socketRef.current.emit('data_updated', { table });
        }
    };

    return { isConnected, isFallbackActive, notifyUpdate };
}
