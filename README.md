<div align="center">

# PAMA: Smart Lottie Assistant for After Effects 
**A Next-Generation, Offline-First Asset Manager & Search Engine**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Adobe After Effects](https://img.shields.io/badge/Adobe-After%20Effects-9999FF.svg?logo=adobe-after-effects&logoColor=white)]()
[![React](https://img.shields.io/badge/Built%20With-React-61DAFB.svg?logo=react&logoColor=white)]()
[![Node.js](https://img.shields.io/badge/Backend-Node.js-339933.svg?logo=node.js&logoColor=white)]()

</div>

---

## 🌟 Overview

The **PAMA Smart Lottie Assistant** is a powerful, fully localized Adobe After Effects extension designed for motion designers and developers. It serves as an advanced bridge between a local library of Lottie JSON files and your After Effects compositions. 

Unlike standard cloud-dependent plugins, PAMA runs an entirely offline, high-performance Node.js server directly on your machine. It utilizes a **hybrid Artificial Intelligence search engine** (combining sparse keyword indexing with dense vector embeddings) to let you instantly find the exact animation you need using natural language—all without an internet connection.

## 🚀 Key Features

*   **Offline-First & Privacy Focused:** Never upload your proprietary assets to a cloud provider again. Everything stays local on your machine safely.
*   **AI-Powered Hybrid Search:** Finding files by exact name is a thing of the past. Using local transformers, PAMA understands the *context* and *semantic meaning* of your search queries via HNSW vector indices.
*   **Bodymovin Direct Import Engine:** Convert Lottie `.json` schemas directly into native After Effects shape layers and keyframes within your active composition using our highly optimized ExtendScript bridge.
*   **Beautiful React Interface:** A fast, responsive visual library built with React and TailwindCSS that allows you to preview animations smoothly before importing.
*   **Zero API Keys Required:** We successfully disconnected all external cloud dependencies. The search engine uses lightweight local embeddings and runs completely on your local hardware.

## 🏗️ Architecture & Tech Stack

PAMA isn't just a simple script; it is a full-stack local application meticulously engineered to run natively within the Adobe CEP environment.

*   **Frontend Panel:** React 18, TailwindCSS, Webpack
*   **Local Backend:** Node.js, Express, Socket.IO
*   **Search Engine:** `@xenova/transformers` (BGE-Small embeddings), `usearch` (HNSW Approximate Nearest Neighbors), `flexsearch` (Keyword matching), and Reciprocal Rank Fusion (RRF). 
*   **Database Engine:** SQLite (`better-sqlite3`) for extremely fast, concurrent local storage. 
*   **Host Scripting:** ExtendScript (`.jsx`) using the official Bodymovin schema interpretation logic.

*(For a deep-dive into the search engineering, please read our [Search Architecture Documentation](SEARCH_ARCHITECTURE.md).)*

## 📦 Installation

1. Download or clone this repository to your computer.
2. Place the unzipped folder into your Adobe CEP extensions directory:
   - **Windows:** `C:\Users\<YourUsername>\AppData\Roaming\Adobe\CEP\extensions\`
   - **Mac:** `~/Library/Application Support/Adobe/CEP/extensions/`
3. Because this is an unpacked developer extension, you must enable `PlayerDebugMode` in your system registry (Windows) or plist (Mac) to load unsigned extensions into Adobe products.
4. Restart After Effects.
5. Launch the tool via **Window > Extensions > PAMA**.

## 🗺️ Roadmap & Future Features (Help Wanted!)

PAMA was built with a vision far beyond just importing files. We are actively looking for open-source contributors to help us build the next generation of features:

- [ ] **AI-Powered Live Lottie Generation:** As LLM reasoning models stabilize for structured output, we plan to wire the extension directly to local LLMs. Type a prompt, and PAMA will generate a brand new live Lottie JSON animation algorithmically directly in your panel.
- [ ] **Auto-Color Matching:** Match a Lottie's exact hex colors to your active composition's palette automatically during the import parsing phase.
- [ ] **Live Folder Watching:** Automatically tokenize, index, and generate AI embeddings for new Lottie JSONs the exact millisecond you download them to a tracked folder.
- [ ] **Batch Import & Storyboarding:** Select multiple Lotties and import them sequentially into the timeline with automatic time-offsetting.

## 🤝 Contributing
Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**. Please read the code, check our architecture documentation, and feel free to open a Pull Request!

## 📜 License
Distributed under the MIT License. See `LICENSE` for more information.

---
*Developed with ❤️ by Nishant Mulchandani*
