# AEGIS

A JARVIS-style HUD shell for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Wraps the Claude Code CLI in an Electron app with animated holographic visuals, live data panels, and a sci-fi terminal experience.

![AEGIS Screenshot](screenshot.png)

## Features

- **JARVIS HUD** -- Animated ring clusters, floating particles, grid overlay, corner brackets, scan lines
- **Full Claude Code terminal** -- Interactive PTY with complete CLI functionality
- **Voice mode** -- One-click `/voice` toggle button in the titlebar
- **Live weather** -- Auto-detected location via Open-Meteo (free, no API key)
- **Date & time** -- JARVIS-style clock display
- **Token tracking** -- Estimates token usage from session output
- **Cost display** -- Parses session cost from Claude Code output
- **Activity visualization** -- Waveform and bar chart react to terminal activity
- **Transparent mode** -- Toggle between see-through and dark backgrounds
- **System status panels** -- Uptime, model, connection status, data readouts

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- **Windows:** Visual Studio Build Tools with C++ workload (for node-pty)

### Installing Visual Studio Build Tools (Windows)

```bash
winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

You may need to reboot after installation.

## Install

```bash
git clone https://github.com/martusha89/aegis.git
cd aegis
npm install
npx electron-rebuild
```

## Run

```bash
npm start
```

## Controls

| Button | Action |
|--------|--------|
| `[mic]` | Toggle Claude Code voice mode |
| `[half-circle]` | Toggle transparent / dark mode |
| `[-]` | Minimize |
| `[square]` | Maximize |
| `[x]` | Close |

The window is frameless and draggable from the title bar.

## How it works

AEGIS spawns the Claude Code CLI in a pseudo-terminal (node-pty) and renders it inside an xterm.js terminal. The HUD is drawn on a Canvas layer behind the terminal. Weather data comes from [Open-Meteo](https://open-meteo.com/) (free, no API key required) with location auto-detected via browser geolocation or IP fallback.

## Tech stack

- **Electron** -- Desktop app framework
- **xterm.js** -- Terminal emulator
- **node-pty** -- Pseudo-terminal for full CLI interactivity
- **Canvas API** -- HUD animations (rings, particles, waveforms)
- **Open-Meteo API** -- Weather data (free, no key)

## License

MIT
