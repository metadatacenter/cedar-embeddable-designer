import { Injectable, signal } from '@angular/core';

export interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  showSaveDialog: (options: any) => Promise<{ canceled: boolean; filePath?: string }>;
  showOpenDialog: (options: any) => Promise<{ canceled: boolean; filePaths?: string[] }>;
  readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
  writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
  onMenuAction: (callback: (action: 'new' | 'open' | 'save' | 'save-as') => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

@Injectable({
  providedIn: 'root',
})
export class ElectronService {
  readonly currentFilePath = signal<string | null>(null);
  readonly isDirty = signal<boolean>(false);

  get isElectron(): boolean {
    return !!(window && window.electronAPI && window.electronAPI.isElectron);
  }

  get api(): ElectronAPI | undefined {
    return window.electronAPI;
  }

  get currentFileName(): string {
    const path = this.currentFilePath();
    if (!path) return 'Untitled Template';
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] || 'Untitled Template';
  }

  async showSaveDialog(defaultFileName: string, filters: Array<{ name: string; extensions: string[] }>) {
    if (!this.isElectron || !window.electronAPI) {
      return null;
    }
    return await window.electronAPI.showSaveDialog({
      defaultPath: defaultFileName,
      filters,
    });
  }

  async showOpenDialog(filters: Array<{ name: string; extensions: string[] }>) {
    if (!this.isElectron || !window.electronAPI) {
      return null;
    }
    return await window.electronAPI.showOpenDialog({
      properties: ['openFile'],
      filters,
    });
  }

  async readFile(filePath: string) {
    if (!this.isElectron || !window.electronAPI) {
      throw new Error('Not running inside Electron environment');
    }
    return await window.electronAPI.readFile(filePath);
  }

  async writeFile(filePath: string, content: string) {
    if (!this.isElectron || !window.electronAPI) {
      throw new Error('Not running inside Electron environment');
    }
    return await window.electronAPI.writeFile(filePath, content);
  }

  onMenuAction(callback: (action: 'new' | 'open' | 'save' | 'save-as') => void) {
    if (this.isElectron && window.electronAPI) {
      return window.electronAPI.onMenuAction(callback);
    }
    return () => {};
  }
}
