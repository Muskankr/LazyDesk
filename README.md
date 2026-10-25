# LazyDesk 2.0

A local-first file organization workspace with a polished dashboard, transparent rule-based suggestions, duplicate candidates, and optional semantic categorization using an open-source sentence-embedding model.

## Features

- Drag-and-drop or multi-file selection
- Category suggestions from filename keywords and file extensions
- Search, filter, sort, and table/grid views
- Manual category editing and review status
- Duplicate *candidates* based on identical names and sizes (not content hashes)
- Export an organization plan as JSON or CSV
- Session activity log and dark/light theme
- Responsive layout and keyboard shortcuts (`U` to upload, `Ctrl/Cmd + K` to search)
- Optional AI semantic suggestions using Transformers.js and `Xenova/all-MiniLM-L6-v2`

## Run locally

No build step is required.

1. Download or clone this repository.
2. Open `index.html` in a modern browser.
3. To use the optional AI feature, use an internet connection and click **Load open-source AI**. The runtime/model must download first. If it fails, the rule-based features continue to work.

## Privacy and limitations

LazyDesk processes selected file metadata in the browser. It does not upload, move, rename, or delete files. The prototype does not inspect file contents. The optional AI feature sends only file-name/extension text to the locally running in-browser model after downloading the runtime and model assets; it does not upload selected file contents. Check the dependency and model licenses before redistribution.

Duplicate candidates are identified by matching filename and file size only. This can produce false positives and is not a cryptographic duplicate check.

## Tech

HTML, CSS, vanilla JavaScript, optional Transformers.js, `Xenova/all-MiniLM-L6-v2` sentence embeddings.

## Challenge transparency

AI is optional in this prototype because its runtime/model require internet access. Do not describe the project as AI-powered in a submission unless you have successfully loaded the model and demonstrated the AI categorization workflow. For a stronger submission, include a short screen recording showing the model loading and category suggestions, plus an explanation of limitations.

## License

MIT — add a `LICENSE` file before public release if you choose this license.
