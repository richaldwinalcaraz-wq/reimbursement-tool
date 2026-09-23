import * as fs from 'fs';
import * as path from 'path';
import { Session } from '../types';

const sessions = new Map<string, Session>();

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

export function setSession(session: Session): void {
  sessions.set(session.sessionId, session);
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function cleanupOldSessions(maxAgeMs = 4 * 60 * 60 * 1000): void {
  const cutoff = new Date(Date.now() - maxAgeMs);
  for (const [id, session] of sessions.entries()) {
    if (session.createdAt < cutoff) {
      sessions.delete(id);
    }
  }
}

// App settings (configurable via UI) — persisted to a local file so they
// survive an app restart, since this is a single-user desktop tool with no
// database. Never committed: DATA_DIR is gitignored (see backend/.gitignore).
const DATA_DIR = process.env.DATA_DIR ?? './data';
const SETTINGS_FILE = path.join(DATA_DIR, 'app-settings.json');

const defaultSettings = {
  hubspotToken: process.env.HUBSPOT_ACCESS_TOKEN ?? '',
  processedBy: '',
  templateIds: {
    standard: '' as number | '',
    informational: '' as number | '',
    follow_up: '' as number | '',
    resubmission: '' as number | '',
    priority: '' as number | '',
    fromEmail: '',
  },
};

function loadPersistedSettings(): typeof defaultSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      return { ...defaultSettings, ...JSON.parse(raw) };
    }
  } catch (err) {
    console.error('Failed to read persisted settings, using defaults:', err);
  }
  return defaultSettings;
}

let appSettings = loadPersistedSettings();

function persistSettings(): { ok: boolean; error?: string } {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(appSettings, null, 2), 'utf-8');
    return { ok: true };
  } catch (err) {
    console.error('Failed to persist settings:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to save settings to disk' };
  }
}

export function getAppSettings() {
  return { ...appSettings };
}

export function updateAppSettings(partial: Partial<typeof appSettings>): { ok: boolean; error?: string } {
  appSettings = { ...appSettings, ...partial };
  return persistSettings();
}

// SSE client registry (sessionId → Response)
import { Response } from 'express';
const sseClients = new Map<string, Response>();

export function getSseClients(): Map<string, Response> {
  return sseClients;
}
