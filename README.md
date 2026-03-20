<div align="center">

# PAMA: **P**roject **A**wareness **M**ulti-Model **A**gent
**The Ultimate Offline-First Lottie Engine & AI Assistant for After Effects**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Adobe After Effects](https://img.shields.io/badge/Adobe-AE%20ExtendScript-9999FF.svg?logo=adobe-after-effects&logoColor=white)]()
[![React](https://img.shields.io/badge/Frontend-React%2018-61DAFB.svg?logo=react&logoColor=white)]()
[![Node.js](https://img.shields.io/badge/Backend-Express.js-339933.svg?logo=node.js&logoColor=white)]()
[![Transformers.js](https://img.shields.io/badge/AI-Transformers.js-FF6F00.svg?logo=huggingface&logoColor=white)]()

<p align="center">
  <b>PAMA is not just a script. It is an advanced, offline-capable machine learning bridging tool and native Lottie-to-Shape-Layer compiler built directly into the Adobe CEP environment.</b>
</p>

<div align="center">

![PAMA Interface](pama_demo.png)

<br/>

https://github.com/nishantmulchandani/PAMA/raw/main/pama_demo.mp4

*Click the video above to see PAMA live in action!*
</div>
</div>

---

## 🌟 The Vision: Why PAMA Exists

Most After Effects plugins rely heavily on cloud processing, pinging corporate servers every time you want to search an asset or generate an animation. Furthermore, most Lottie importers simply drop a flattened pre-comp into your timeline.

**PAMA is different.**

PAMA stands for **Project Awareness Multi-Model Agent**. It is designed as a fully robust, local-first ecosystem that understands your After Effects project structure, parses Lottie schemas natively using a custom ExtendScript compiler, and is wired to support autonomous LLM reasoning agents (like DeepSeek-R1 and Llama) operating directly on your timeline.

## 🚀 Core Technologies & Features

### 1. 🧠 Project Awareness & AI Agent Loop (`server/agent.js`)
PAMA isn't blind to your workspace. The extension actively scans your current composition, reading layers, footage metadata, and structure, and saves it to a highly concurrent local SQLite memory base. 
- **The LLM Loop:** Contains a fully wired **Planner-Executor-Critic** architectural loop. When activated, PAMA can read your natural language prompts, plan an After Effects automation, generate raw ExtendScript code, execute it via Socket.io directly into the Adobe host engine, and critique its own output if parsing fails.

### 2. 🔍 Advanced Hybrid Semantic Search (`server/search.js`)
We dumped standard keyword searching. PAMA integrates an incredibly powerful hybrid search engine running entirely offline inside Node.js.
- **Dense Vector Embeddings:** Uses `@xenova/transformers` (BGE-Small models) to understand semantic context. Ask for "a vessel to keep water hot," and the engine will return your "Thermos" animations via an algorithmic understanding of the words using **HNSW (Hierarchical Navigable Small World)** vector indexing (`usearch`).
- **Sparse Keyword Fallback:** Utilizes `flexsearch` to immediately return exact filenames and tags.
- **Reciprocal Rank Fusion (RRF):** Intelligently combines vector and keyword search results in real-time. *(Read `SEARCH_ARCHITECTURE.md` for our full engineering paper).*

### 3. 🛠️ Native Lottie ExtendScript Compiler (`jsx/importers/lottieImporter.jsx`)
This is the hidden beast of PAMA. Instead of downloading a `.json` schema and converting it to a video or dropping a flattened script block, our custom Bodymovin compiler natively reads the Lottie schema JSON and systematically recreates it from scratch inside After Effects.
- Dynamically generates `addShape()`, `addText()`, `addSolid()`.
- Calculates structural Spatial Tangents, Bezier Interpolations (`KeyframeInterpolationType`), and Temporal Easing (`KeyframeEase`) algorithmically.
- The result? You get 100% native, mathematically precise local After Effects shape layers and keyframes exactly as they were fundamentally designed, fully editable by you.

### 4. ⚡ Modern React 18 Architecture (`client/src`)
The UI isn't an archaic Adobe dialog box. It's a completely decoupled, ultra-fast React 18 frontend communicating with the local Node.js server via WebSockets (`Socket.IO`).
- Styled perfectly with **TailwindCSS** for a responsive, modern Dark Mode aesthetic that matches Adobe's design language.
- Real-time import tracking, error handling, and visual previews.

---

## 📦 Local Installation

To run this massive local engine, you install it directly as an Adobe CEP extension.

1. Download or clone this repository to your computer.
2. Place the unzipped folder into your Adobe CEP extensions directory:
   - **Windows:** `C:\Users\<YourUsername>\AppData\Roaming\Adobe\CEP\extensions\`
   - **Mac:** `~/Library/Application Support/Adobe/CEP/extensions/`
3. Because this relies heavily on local Node environments, you must enable `PlayerDebugMode` in your system registry (Windows) or plist (Mac) to load unsigned extensions into Adobe products.
4. Restart After Effects.
5. Launch the tool via **Window > Extensions > PAMA**.

> **Note on Privacy:** PAMA has had all hardcoded API keys and external LLM cloud telemetry ripped out. Out of the box, it is a 100% offline visual library and Shape-Layer compiler.

---

## 👨‍💻 Developer Guide: How to Work With It

Since PAMA is a full-stack local application embedded in a CEP panel, you must build the client and start the local server when altering the source code.

### 1. Start the Node.js Server (Backend/AI Engine)
PAMA's AI Search, SQLite Database, and ExtendScript Gateway run locally.
```bash
cd server
npm install
npm start
```
*(Keep this terminal running during development to process searches and imports).*

### 2. Build the React Client (Frontend)
The beautiful visual extension inside After Effects is built with React 18 and TailwindCSS.
```bash
cd client
npm install
npm run build
```
*(This compiles the UI payload into `/client` which the Adobe panel loads directly).*

### 3. Load the Extension
With the server running and the client built, open After Effects and navigate to **Window > Extensions > PAMA**. Note: Due to Chromium Embedded Framework caching, you may need to clear your CEP cache or reload the panel during hot development.

---

## 🗺️ The Roadmap (Multi-Modal Future)

We are building PAMA to be the definitive open-source AI assistant for Adobe After Effects. We are actively seeking contributors for the following milestones:

- [ ] **Live AI Lottie Generation:** Connect the `agent.js` architecture to local stable diffusion or prompt-to-Lottie reasoning models. Type a prompt, and PAMA will output the raw `.json` schema and compile it directly to the timeline instantly.
- [ ] **Auto-Color Context Injection:** Instruct the Agent to read the `app.project.activeItem` hex palette via the scanner, and intercept the Bodymovin importer to recolor the Lottie layers algorithmically before drawing them.
- [ ] **Live Folder HNSW Indexing:** Make the server watch a designated `Downloads` folder, automatically tokenize any new Lottie files, calculate the Dense Vectors using Transformers.js, and inject them into the local SQLite memory base instantly.
- [ ] **Advanced Code Generation:** Re-enable the Planner-Critic loop (currently stubbed for offline) to accept API keys from the UI, allowing users to ask PAMA to automate incredibly complex, multi-composition timeline tasks via LLM-generated ExtendScript.

---

## 🤝 Contributing
If you are an engineer passionate about Machine Learning, React, or Adobe Automation (ExtendScript), we want you. 

PAMA is highly modular. You can work purely on the React UI, the Express data-pipelines, or the ExtendScript compiler independently. Fork the repo, read the `SEARCH_ARCHITECTURE.md`, and submit a Pull Request.

## 📜 License
Distributed under the MIT License. See `LICENSE` for more information.

---
*Built with ❤️ for the global motion design community.*
