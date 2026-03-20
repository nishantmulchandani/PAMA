# Offline Lottie Importer for After Effects

A fully offline, free Adobe After Effects extension that allows you to manage and import your local Lottie JSON animations directly into your compositions.

## Features
- **Completely Offline:** No internet connection or cloud account required. Keep your assets private.
- **Visual Library:** Browse, preview, and manage your local Lottie JSON files with an easy-to-use interface.
- **Direct Import:** Built on top of the Bodymovin importer component, allowing seamless JSON-to-shape-layer conversion directly into your active composition.

## Installation
1. Download or clone this repository.
2. Place the folder into your CEP extensions directory:
   - **Windows:** `C:\Users\<Username>\AppData\Roaming\Adobe\CEP\extensions\` or `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\`
   - **Mac:** `~/Library/Application Support/Adobe/CEP/extensions/` or `/Library/Application Support/Adobe/CEP/extensions/`
3. Restart After Effects.
4. Open the extension via **Window > Extensions > PAMA**.
*(Note: As this is an unpacked extension, you must enable `PlayerDebugMode` in your registry (Windows) or plist (Mac) to load unsigned extensions).*

## Usage
Simply browse to your local folder of Lottie JSON files within the extension. You can preview the animations natively in the panel, and click to import the selected animation directly into your currently active After Effects composition.

## 🚀 Roadmap & Future Features (Help Wanted!)
We are looking for open-source contributors to help build the following features and turn this into the ultimate Lottie tool for After Effects:
- [ ] **Auto-Color Matching:** Match a Lottie file's colors to your active composition's palette automatically before importing.
- [ ] **Live Folder Watching:** Automatically index new Lottie JSONs the moment you download them to a tracked folder.
- [ ] **Batch Import & Storyboarding:** Select multiple Lotties and import them sequentially into the timeline with one click.
- [ ] **AI-Powered Live Lottie Generation:** As LLM reasoning models become stable enough to consistently output pure Bodymovin/Lottie JSON schemas, we plan to wire the extension directly to an LLM API. This will allow users to type a prompt and instantly generate a live, custom Lottie animation directly in the library panel.
